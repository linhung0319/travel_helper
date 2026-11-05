// 查資料的工具（規格 §4.1）：畫面不動。能算的交給引擎，資料沒寫就原樣回傳 null，不說成沒有。

import { ItineraryError, bestInsertIndex, checkProposal, dayAreaLabel, dayAreaOf, describeChanges, findItem, kintetsuDayType, busDayType, lodgingMealsOn, lodgingOn, nightAreaOf, nightRunOf, openingOn, planItinerary, planLeg, type EngineData, type NewItem, type PlaceRecord } from '@travel-helper/engine';
import type { DayPlan, Itinerary, Leg, LonLat, TimelineEntry, TravelMode, TravelSpec } from '@travel-helper/engine/types';
import type { ReservationStatus } from '../backend/types.ts';
import { bookedConflicts, noteRows, reservationFor } from '../lib/reservations.ts';
import { isUserPlace } from '../lib/addPlace/view.ts';
import { departuresAround, terminusName, toMinutes } from '../lib/timetable.ts';
import { dayCandidates, likedPlaces, placeDayStatus } from '../lib/wishlist.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import { memberName } from '../sharedStore.ts';
import { fullPlace } from '../dataStore.ts';
import { dayPlanOf } from '../planStore.ts';
import { dayLabel, tripDates } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { digestOf, NAME_MATCH, nameScore, scoresOf, searchPlaces, type SearchInput } from './search.ts';
import { applyOps, type Op } from './ops.ts';
import { opsContext, placeName, type AiDeps } from './deps.ts';

export type ToolOutput = ({ ok: true } & Record<string, unknown>) | { ok: false; error: string };

const fail = (error: string): ToolOutput => ({ ok: false, error });

/** get_place 的分區 → 資料的欄位 */
const SECTIONS: Record<string, string[]> = {
  summary: ['summary'],
  group: ['group', 'seating'],
  hours: ['hours', 'closedNote', 'febNote', 'closures'],
  access: ['access', 'nearestStation', 'address'],
  accessibility: ['accessibility'],
  kids: ['kids'],
  price: ['price', 'priceRange', 'prices', 'meals'],
  menu: ['menu', 'mustTry', 'cuisine'],
  reservation: ['reservation'],
  reviews: ['ratings'],
  assessment: ['assessment'],
  links: ['links'],
  more: ['notes', 'extra'],
};
export const PLACE_SECTIONS = Object.keys(SECTIONS);
const MAX_GET_PLACE = 6;

/** 值是 null、undefined 的鍵拿掉（行程、預約這類結構裡的 null 不是「資料沒寫」，只是沒有） */
const tidy = <T extends Record<string, unknown>>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;

/** 價格一列給 AI 看的欄位：訂房網的網址、來源、幣別（都是日圓）拿掉，一間住宿 5 列就省一半 */
const PRICE_KEYS = ['plan', 'unit', 'adult', 'child', 'season', 'note'];
function compactPrices(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v.map((row) => (row && typeof row === 'object' ? Object.fromEntries(Object.entries(row).filter(([k]) => PRICE_KEYS.includes(k))) : row));
}

/** AI 用不到的欄位：來源網址、取得日期、產生日期（T36：模擬時都沒用到，只佔 token） */
const NO_AI_KEYS = new Set(['sources', 'basedOn', 'retrieved', 'generated', 'assessed', 'otherExpressSources']);

/** 遞迴拿掉 NO_AI_KEYS；值是 null 照樣留著（null＝資料沒寫） */
export function withoutSources(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutSources);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !NO_AI_KEYS.has(k)).map(([k, x]) => [k, withoutSources(x)]));
}

/** 一樣的警告併成一則（計程車台數每一程都出現一次），itemIds 列出是哪幾項（T36） */
export function mergeWarnings(warnings: readonly { level: string; message: string; itemId?: string | null }[]) {
  const out = new Map<string, { level: string; message: string; itemIds: string[] }>();
  for (const w of warnings) {
    const key = `${w.level}\n${w.message}`;
    const row = out.get(key) ?? { level: w.level, message: w.message, itemIds: [] };
    if (w.itemId && !row.itemIds.includes(w.itemId)) row.itemIds.push(w.itemId);
    out.set(key, row);
  }
  return [...out.values()];
}

/** get_trip_info 的分項（T36）：一次只回要的，不整份給 */
export const TRIP_INFO_SECTIONS = {
  passes: ['passes', 'fares', 'comparison', 'groupTicket', 'booking', 'childRules', 'shimakaze', 'otherExpress', 'passNotes', 'notes'],
  airport: ['day1', 'lastDay', 'routes', 'luggage', 'accessibility', 'flights', 'openQuestions'],
} as const;

export function createReadTools(d: AiDeps) {
  const places = () => d.data.getState();
  const votes = () => d.shared.store.getState().votes;
  const likes = (id: string) => votes().filter((v) => v.placeId === id && v.value === 'like').length;
  const nameOf = (id: string | null | undefined) => (id ? placeName(places().byId.get(id), id) : '');
  const who = (id: string) => memberName(d.shared.store.getState().members, id);
  const areaOf = (id: string) => places().byId.get(id)?.area;
  const areaName = (id: string) => {
    const a = places().areas.find((x) => x.id === id);
    return a ? a.name.zh || a.name.ja || id : id;
  };
  /** 這晚住哪一區（T45c）：{ id, name }；還沒決定是 null */
  const stayAreaOf = (it: Itinerary | null, date: string) => {
    const id = it ? nightAreaOf(it, date, areaOf) : null;
    return id ? { id, name: areaName(id) } : null;
  };

  function needDate(date: unknown): string | null {
    return typeof date === 'string' && tripDates().includes(date) ? date : null;
  }

  /** 讀這幾個點的詳情層：讀不到時要明講，不能回 null（null 在這裡是「資料沒寫」） */
  async function detailsProblem(ids: readonly string[]): Promise<ToolOutput | null> {
    try {
      if (ids.length) await d.details?.(ids);
      return null;
    } catch {
      return fail('詳細資料暫時讀不到（網路問題），請使用者稍後再試；不要當成資料沒寫');
    }
  }

  async function search_places(input: SearchInput): Promise<ToolOutput> {
    const env = () => {
      const s = places();
      return { places: s.places, byId: s.byId, areas: s.areas, bounds: d.app.getState().view?.bounds ?? null, likes, config: d.config, full: (id: string) => fullPlace(s, id) };
    };
    // 篩選只用清單層；回傳的摘要在詳情層：先找出是哪幾個，只讀那幾個再算一次（T47）。
    // group.maxGuests（maxGuestsAtLeast）T57 起在清單層，不用先讀住宿的詳情
    const problem = await detailsProblem(searchPlaces(input ?? {}, env()).places.map((p) => p.id));
    if (problem) return problem;
    const r = searchPlaces(input ?? {}, env());
    return { ok: true, ...r };
  }

  async function get_place(input: { ids: string[]; sections?: string[] }): Promise<ToolOutput> {
    if (!Array.isArray(input?.ids) || !input.ids.length) return fail('ids 要是資料點 ID 的陣列');
    if (input.ids.length > MAX_GET_PLACE) return fail(`一次最多 ${MAX_GET_PLACE} 個點`);
    const sections = input.sections?.length ? input.sections : ['summary', 'group', 'hours'];
    const bad = sections.filter((x) => !SECTIONS[x]);
    if (bad.length) return fail(`沒有分區 ${bad.join('、')}（可用：${PLACE_SECTIONS.join('、')}）`);
    const problem = await detailsProblem(input.ids.filter((id) => typeof id === 'string'));
    if (problem) return problem;
    const s = places();
    const unknown = input.ids.filter((id) => !s.byId.has(id));
    const found = input.ids.flatMap((id) => {
      const p = fullPlace(s, id);
      return p ? [p] : [];
    });
    if (!found.length) return fail(`找不到資料點 ${unknown.join('、')}`);
    return {
      ok: true,
      places: found.map((p) => {
        const raw = p.raw as Record<string, unknown>;
        // scores 不分區都帶：長輩、小孩的分數是這團最常問的，很小（verified 全部是 false，拿掉）
        const out: Record<string, unknown> = { id: p.id, name: placeName(p), ja: p.name.ja, type: p.type, area: p.area, region: p.region, tier: p.tier, scores: scoresOf(p) };
        if (p.origin === 'user') out.origin = '使用者自己加的，我們沒查過：營業時間、能不能坐 15 人都不知道';
        // 沒有這個欄位＝資料沒寫，回 null，不說成沒有。欄位直接放在點上（不再包一層分區），來源拿掉（T36）
        for (const s of sections) for (const k of SECTIONS[s]) out[k] = k === 'prices' ? compactPrices(withoutSources(raw[k] ?? null)) : withoutSources(raw[k] ?? null);
        // 旅程中哪幾天公休：AI 不用自己對星期（容易對錯）；營業時間沒查就不帶
        if (sections.includes('hours') && raw.hours != null) {
          out.closedOnTripDays = tripDates().filter((date) => openingOn(raw as unknown as PlaceRecord, date, d.config.holidays).kind === 'closed').map(dayLabel);
        }
        const edited = Object.keys(p.edited ?? {});
        if (edited.length) out.edited = edited;
        return out;
      }),
      ...(unknown.length ? { unknown } : {}),
    };
  }

  // basis（「近鐵時刻表＋kamome-5-kuzaki 時刻表」）是內部的檔名，AI 會照抄，不帶；等車 0 分、計程車費沒查的也不帶
  const compactLeg = (l: Leg | null) =>
    l &&
    tidy({
      mode: l.mode,
      minutes: l.minutes,
      walkMinutes: l.walkMinutes,
      waitMinutes: l.waitMinutes || null,
      rides: l.rides.map((r) => tidy({ line: r.line, from: nameOf(r.from) || r.from, to: nameOf(r.to) || r.to, depart: r.depart, arrive: r.arrive, ifMissed: r.ifMissed ?? null })),
      ...(l.taxi ? { taxi: tidy({ cars: l.taxi.cars, fareEstimateYen: l.taxi.fareEstimateYen }) } : {}),
      ...(l.taxiBefore ? { taxiBefore: { station: nameOf(l.taxiBefore.station), minutes: l.taxiBefore.minutes } } : {}),
      ...(l.taxiAfter ? { taxiAfter: { station: nameOf(l.taxiAfter.station), minutes: l.taxiAfter.minutes } } : {}),
    });

  const compactEntry = (e: TimelineEntry) =>
    tidy({
      kind: e.kind,
      itemId: e.itemId,
      placeId: e.placeId,
      name: nameOf(e.placeId),
      arrive: e.arrive,
      start: e.start,
      end: e.end,
      waitMinutes: e.waitMinutes || null,
      meal: e.mealTags?.length ? e.mealTags : null,
      travel: compactLeg(e.travel),
    });

  /** 自己加的、已訂的（§17.7）：只在是的時候才帶，不讓回傳變長 */
  const marksOf = (date: string, placeId: string | null | undefined) => {
    if (!placeId) return {};
    const p = places().byId.get(placeId);
    return {
      ...(p && isUserPlace(p) ? { user: true } : {}),
      ...(reservationFor(reservationRows(), date, placeId)?.status === 'booked' ? { booked: true } : {}),
    };
  };

  const compactDay = (date: string, p: DayPlan, it: Itinerary | null) => {
    const s = d.shared.store.getState();
    const day = it?.days.find((x) => x.date === date);
    const lodging = it ? lodgingOn(it, date) : null;
    const cands = dayCandidates(s.candidates, date, it, places().byId);
    const confirmed = places().itinerary;
    return {
      date,
      // 星期一起給：公休、時刻表的平日假日都看它，AI 自己對會錯
      label: dayLabel(date),
      area: it ? dayAreaLabel(dayAreaOf(it, date, areaOf), areaName) : null,
      ...(date === tripDates().at(-1) ? {} : { stayArea: stayAreaOf(it, date) }),
      lodging: lodging ? { id: lodging, name: nameOf(lodging), meals: lodgingMealsOn(it!, date), ...marksOf(date, lodging) } : null,
      entries: p.entries.map((e) => {
        const item = e.itemId && it ? findItem(it, e.itemId)?.item : null;
        return {
          ...compactEntry(e),
          ...marksOf(date, e.placeId),
          ...(item?.note ? { note: item.note } : {}),
          // 提議裡新加的卡：ID 只是暫時的，不能用在 ops（要改就重寫那個 add）
          ...(it !== confirmed && e.itemId && confirmed && !findItem(confirmed, e.itemId) ? { draftOnly: true } : {}),
        };
      }),
      // 備選：引擎只用選定的算，AI 要知道還有哪幾個
      options: (day?.items ?? []).flatMap((i) => (i.type === 'visit' && i.options.length > 1 ? [{ itemId: i.id, selected: i.selected, places: i.options.map((o) => ({ id: o.place, name: nameOf(o.place), ...marksOf(date, o.place) })), note: i.note ?? null }] : [])),
      gaps: p.gaps.map((g) => ({ label: g.label, from: g.from, to: g.to, afterItemId: g.afterItemId, beforeItemId: g.beforeItemId })),
      warnings: mergeWarnings(p.warnings),
      stats: p.stats,
      candidates: cands.map((c) => ({ id: c.placeId, name: nameOf(c.placeId), addedBy: who(c.addedBy) })),
      comments: s.comments.filter((c) => c.target === dayTarget(date)).length,
    };
  };

  /** 目前顯示的提議算出來的行程 */
  const draftItinerary = () => d.app.getState().proposal?.itinerary ?? null;

  function get_day(input: { date: string; on?: 'draft' }): ToolOutput {
    const date = needDate(input?.date);
    if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
    if (input.on === 'draft') {
      const it = draftItinerary();
      const engine = d.engine();
      if (!it) return fail('現在沒有顯示中的提議');
      if (!engine) return fail('行程引擎還沒算好，請稍等再查');
      const dp = dayPlanOf(planItinerary(it, engine, d.config), date);
      if (!dp) return fail('行程裡沒有這一天');
      return { ok: true, on: 'draft', ...compactDay(date, dp, it) };
    }
    const p = dayPlanOf(d.plan.getState().plan, date);
    if (!p) return fail('行程引擎還沒算好，請稍等再查');
    return { ok: true, ...compactDay(date, p, places().itinerary) };
  }

  function get_trip_overview(): ToolOutput {
    const plan = d.plan.getState().plan;
    if (!plan) return fail('行程引擎還沒算好，請稍等再查');
    const it = places().itinerary;
    const s = d.shared.store.getState();
    const last = plan.days.at(-1)?.date;
    const undecided = plan.days.filter((p) => p.date !== last && !(it && nightAreaOf(it, p.date, areaOf))).map((p) => p.date);
    return {
      ok: true,
      // 還沒決定住哪一區的晚上（T45c）：整趟先定區、再挑住宿
      undecidedNights: undecided,
      days: plan.days.map((p) => {
        const lodging = it ? lodgingOn(it, p.date) : null;
        const stops = p.entries.filter((e) => e.kind === 'visit' && e.placeId);
        const run = it && p.date !== last ? nightRunOf(it, p.date, 'area', areaOf) : null;
        return {
          date: p.date,
          label: dayLabel(p.date),
          // 這天在哪一區：「鳥羽」、移動日「志摩 → 鳥羽」、一日遊「鳥羽（去伊勢一日）」；還沒決定是 null
          area: it ? dayAreaLabel(dayAreaOf(it, p.date, areaOf), areaName) : null,
          // 這晚住哪一區、連住第幾晚（最後一天沒有晚上，不帶）
          ...(p.date === last ? {} : { stayArea: stayAreaOf(it, p.date), ...(run ? { areaNight: `${run.index}/${run.total}` } : {}) }),
          regions: [...new Set(stops.map((e) => places().byId.get(e.placeId!)?.region).filter(Boolean))],
          stops: stops.map((e) => ({ name: nameOf(e.placeId), ...marksOf(p.date, e.placeId) })),
          lodging: lodging ? { name: nameOf(lodging), ...marksOf(p.date, lodging) } : null,
          warnings: p.warnings.length,
          candidates: dayCandidates(s.candidates, p.date, it, places().byId).length,
          tiring: p.stats.tiring,
          returnTime: p.stats.returnTime,
        };
      }),
      tripWarnings: plan.warnings.map((w) => w.message),
    };
  }

  function check_changes(input: { ops: Op[] }, base?: Itinerary): ToolOutput {
    const engine = d.engine();
    const before = base ?? places().itinerary;
    if (!engine || !before) return fail('行程引擎還沒算好，請稍等再查');
    try {
      const after = applyOps(before, input?.ops, opsContext(d));
      const r = checkProposal(before, after, engine, d.config, (id) => nameOf(id));
      if (!r.changes.length) return fail('和確定的行程一樣，沒有改動');
      return {
        ok: true,
        changes: r.changes,
        // 區要寫名字（checkProposal 的摘要只有地點名）
        summary: describeChanges(r.changes, { nameOf: (id) => nameOf(id), areaName, plan: r.after }),
        // 一樣的警告（計程車台數每一程一則）只留一則
        newWarnings: [...new Set(r.newWarnings.map((w) => w.message))],
        resolvedWarnings: [...new Set(r.resolvedWarnings.map((w) => w.message))],
      };
    } catch (e) {
      if (e instanceof ItineraryError) return fail(e.message);
      throw e;
    }
  }

  /** 這份操作動到的已訂的點（提議卡、提議列顯示，§17.7）；算不出來是空的 */
  function proposalBooked(ops: Op[]): string[] {
    const before = places().itinerary;
    if (!before) return [];
    try {
      return bookedConflicts(before, applyOps(before, ops, opsContext(d)), places().byId, d.shared.store.getState().reservations);
    } catch {
      return [];
    }
  }

  /** 這份操作新出現的警告（提議卡顯示，不是工具）；資訊類（計程車台數）不算，算不出來是空的 */
  function proposalWarnings(ops: Op[]): string[] {
    const engine = d.engine();
    const before = places().itinerary;
    if (!engine || !before) return [];
    try {
      const after = applyOps(before, ops, opsContext(d));
      return checkProposal(before, after, engine, d.config, (id) => nameOf(id)).newWarnings.filter((w) => w.level !== 'info').map((w) => w.message);
    } catch (e) {
      if (e instanceof ItineraryError) return [];
      throw e;
    }
  }

  function suggest_position(input: { placeId: string; date: string; on?: 'draft' }): ToolOutput {
    const engine = d.engine();
    const onDraft = input?.on === 'draft';
    if (onDraft && !draftItinerary()) return fail('現在沒有顯示中的提議');
    const it = onDraft ? draftItinerary() : places().itinerary;
    if (!engine || !it) return fail('行程引擎還沒算好，請稍等再查');
    const date = needDate(input?.date);
    if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
    const p = places().byId.get(input.placeId);
    if (!p) return fail(`找不到資料點 ${input.placeId}`);
    if (p.type === 'lodging' || p.type === 'station') return fail('住宿、車站不用找位置：住宿用 setLodging，車站不排進行程');
    const item: NewItem = { type: 'visit', options: [{ place: p.id, stayMinutes: null }] };
    const index = bestInsertIndex(it, date, item, engine, d.config);
    const check = check_changes({ ops: [{ op: 'add', date, place: p.id, index }] }, it);
    const items = it.days.find((x) => x.date === date)?.items ?? [];
    const label = (i: (typeof items)[number] | undefined) => (i?.type === 'visit' ? nameOf(i.options[i.selected]?.place) : (i?.type ?? null));
    return { ...check, index, after: label(items[index - 1]), before: label(items[index]) } as ToolOutput;
  }

  /** Google Maps 的路線連結（PLAN §1）：實際班次讓使用者在 app 上確認 */
  function mapsUrl(from: LonLat, to: LonLat, mode: Leg['mode']): string {
    const travel = mode === 'walk' ? 'walking' : mode === 'taxi' || mode === 'charter' || mode === 'car' ? 'driving' : 'transit';
    return `https://www.google.com/maps/dir/?api=1&origin=${from[1]},${from[0]}&destination=${to[1]},${to[0]}&travelmode=${travel}`;
  }

  function endpointOf(v: unknown): { id: string | null; coords: LonLat | null; record: Place['raw'] | null } | string {
    if (typeof v === 'string') {
      const p = places().byId.get(v);
      return p ? { id: p.id, coords: p.coords, record: p.raw } : `找不到資料點 ${v}`;
    }
    if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) return { id: null, coords: v as LonLat, record: null };
    return '起訖要是資料點 ID 或 [經度, 緯度]';
  }

  function get_route(input: { from: string | LonLat; to: string | LonLat; mode?: TravelMode | null; date?: string; time?: string }): ToolOutput {
    const engine = d.engine();
    if (!engine) return fail('行程引擎還沒算好，請稍等再查');
    const a = endpointOf(input?.from);
    const b = endpointOf(input?.to);
    if (typeof a === 'string') return fail(`起點：${a}`);
    if (typeof b === 'string') return fail(`終點：${b}`);
    const selected = d.app.getState().day;
    const date = needDate(input.date) ?? (selected === 'all' ? tripDates()[0] : selected);
    const time = input.time ?? '10:00';
    let depart: number;
    try {
      depart = toMinutes(time);
    } catch {
      return fail('time 要是 HH:MM');
    }
    const party = places().itinerary?.party ?? { size: 15, elders: 5, kids: 4 };
    const spec: TravelSpec | null = input.mode ? { mode: input.mode } : null;
    const { leg, warnings } = planLeg(a as never, b as never, { date, depart, party, data: engine as EngineData, cfg: d.config }, spec);
    return {
      ok: true,
      date,
      depart: leg.depart,
      arrive: leg.arrive,
      ...compactLeg(leg),
      // 引擎的 alternatives 第一個就是選的那條：只回其他走法
      alternatives:
        leg.alternatives
          ?.filter((x) => !(x.arrive === leg.arrive && x.minutes === leg.minutes && x.walkMinutes === leg.walkMinutes))
          .map((x) => ({ summary: x.summary, arrive: x.arrive, minutes: x.minutes, walkMinutes: x.walkMinutes })) ?? [],
      warnings: warnings.map((w) => w.message),
      ...(a.coords && b.coords ? { mapsUrl: mapsUrl(a.coords, b.coords, leg.mode) } : {}),
      note: '分鐘已照全員（長輩、小孩）的步行速度算；實際班次請在 Google Maps 確認',
    };
  }

  async function get_timetable(input: { station?: string; route?: string; date: string; after?: string; from?: string; to?: string }): Promise<ToolOutput> {
    const date = needDate(input?.date);
    if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
    if (input.station) {
      const after = input.after ?? '09:00';
      // ID 或站名都收（AI 常猜成 kintetsu-toba、ise-shi 這種不存在的 ID）：名字比到幾個就照相似度試，JR 站沒有近鐵時刻表會跳過
      const s = places();
      const wanted = String(input.station);
      const exact = s.byId.get(wanted);
      const candidates = exact && exact.type === 'station' ? [exact] : s.places.filter((p) => p.type === 'station').map((p) => ({ p, score: nameScore(p, wanted) })).filter((x) => x.score >= NAME_MATCH).sort((a, b) => b.score - a.score).map((x) => x.p);
      if (!candidates.length) return fail(`找不到車站「${wanted}」：給資料點 ID（search_places 的 types 給 station 查得到）或站名`);
      let station = candidates[0];
      let tt = null;
      for (const c of candidates) {
        tt = await d.source.loadTimetable(c.id);
        if (tt) {
          station = c;
          break;
        }
      }
      if (!tt) return fail(`${nameOf(station.id)} 沒有車站時刻表（只有近鐵車站有；巴士、船、JR 用 route 查）`);
      const dayType = kintetsuDayType(date, d.config.holidays);
      // 終點寫站名（不是代號）；車次編號 AI 用不到
      const term = (id: string) => (s.byId.has(id) ? nameOf(id) : terminusName(id, s.stationNames));
      const directions = departuresAround(tt, dayType, after, 1, 6).map((x) => ({
        label: x.label,
        before: x.before.map((y) => tidy({ dep: y.dep, type: y.type, to: term(y.to), note: y.note })),
        after: x.after.map((y) => tidy({ dep: y.dep, type: y.type, to: term(y.to), note: y.note })),
      }));
      return { ok: true, station: nameOf(station.id), date: dayLabel(date), dayType, directions };
    }
    if (input.route) {
      const q = input.route;
      // 名字可能對到好幾條（「かもめバス」有 4 條、「外宮内宮」有 2 條）：給了上下車站就把每一條都查、合在一起；沒給就列出來讓 AI 選
      const matches = (d.engine()?.routes ?? []).filter((r) => r.id === q || r.name.ja.includes(q) || r.name.zh?.includes(q));
      if (!matches.length) return fail(`找不到路線 ${q}`);
      // 路線沒給 after 從頭列：以前預設 09:00 又用第一站的時間濾，會漏掉中途站 9 點前的班（T36 模擬抓到）
      let t: number;
      try {
        t = toMinutes(input.after ?? '00:00');
      } catch {
        return fail('after 要是 HH:MM');
      }
      const dayType = busDayType(date, d.config.holidays);
      const routeName = (r: (typeof matches)[number]) => r.name.zh ?? r.name.ja;
      const runsOf = (route: (typeof matches)[number]) => {
        const stopName = new Map(route.stops.map((s) => [s.id, String(s.name)]));
        const runs = (route.trips[dayType] ?? [])
          .filter((x) => !x.dates || x.dates.includes(date))
          .map((x) => ({ headsign: x.headsign, stops: x.stops.flatMap(([s, a2, d2]) => (d2 || a2 ? [{ name: stopName.get(s) ?? s, time: (d2 ?? a2) as string }] : [])) }));
        return { runs, stops: [...new Set(stopName.values())] };
      };
      // 站名比對：拿掉空白，部分符合就算（「鳥羽駅」「鳥羽」都行）
      const fold = (s: string) => s.normalize('NFKC').replace(/\s/g, '');
      const hits = (name: string, want: string) => fold(name).includes(fold(want)) || fold(want).includes(fold(name));
      if (input.from || input.to) {
        const many = matches.length > 1;
        // 給了上車、下車站：每班只回這兩站的時間，站名直接寫出來（不用對照代號）
        const trips = matches
          .flatMap((route) =>
            runsOf(route).runs.flatMap((x) => {
              const first = input.from ? x.stops.findIndex((s) => hits(s.name, input.from!)) : 0;
              if (first < 0) return [];
              const j = input.to ? x.stops.findIndex((s, k) => k > first && hits(s.name, input.to!)) : x.stops.length - 1;
              if (j < 0) return [];
              // 同一班經過上車站兩次（鷗巴士 2 號：鳥羽駅 → 繞マリンターミナル → 再回鳥羽駅）：取離下車站最近的那次，同引擎（T36 模擬抓到）
              let i = first;
              if (input.from) for (let k = first + 1; k < j; k++) if (hits(x.stops[k].name, input.from)) i = k;
              return [{ ...(many ? { route: routeName(route) } : {}), headsign: x.headsign, from: x.stops[i].name, depart: x.stops[i].time, to: x.stops[j].name, arrive: x.stops[j].time }];
            }),
          )
          .filter((x) => toMinutes(x.depart) >= t)
          .sort((x, y) => toMinutes(x.depart) - toMinutes(y.depart))
          .slice(0, 10);
        const head = { ok: true as const, route: matches.map(routeName).join('、'), mode: matches[0].mode, date: dayLabel(date), dayType };
        if (!trips.length) return { ...head, trips, note: '這天沒有從上車站往下車站的班次（站名對不到也會這樣）；站名見 stops', stops: [...new Set(matches.flatMap((r) => runsOf(r).stops))] };
        return { ...head, trips };
      }
      if (matches.length > 1) return { ok: true, routes: matches.map((r) => ({ id: r.id, name: routeName(r), mode: r.mode })), note: '對到好幾條路線：route 給 id 再查一次，或直接給 from、to 查班次' };
      const route = matches[0];
      const { runs, stops } = runsOf(route);
      // 沒給站：站名清單（去重）和每班的起訖，要細節請 AI 再給 from、to
      const trips = runs
        .filter((x) => x.stops[0] && toMinutes(x.stops[0].time) >= t)
        .sort((x, y) => toMinutes(x.stops[0].time) - toMinutes(y.stops[0].time))
        .slice(0, 12)
        .map((x) => ({ headsign: x.headsign, first: x.stops[0], last: x.stops.at(-1) }));
      return { ok: true, route: routeName(route), mode: route.mode, date: dayLabel(date), dayType, validFrom: route.validFrom, stops, trips, note: '要某一站的時間，給 from（上車站）、to（下車站）再查一次' };
    }
    return fail('要給 station 或 route');
  }

  function opinionsOfPlace(id: string) {
    const s = d.shared.store.getState();
    const liked = likedPlaces(s.votes).get(id);
    const st = placeDayStatus(id, s.candidates, places().itinerary);
    return {
      id,
      name: nameOf(id),
      likes: (liked?.likes ?? []).map(who),
      dislikes: (liked?.dislikes ?? []).map(who),
      candidateDays: st.candidate,
      scheduledDays: st.scheduled,
      comments: s.comments.filter((c) => c.target === id).map((c) => ({ by: who(c.author), text: c.text, kind: c.kind })),
    };
  }

  function get_opinions(input: { placeId?: string; date?: string } = {}): ToolOutput {
    const s = d.shared.store.getState();
    if (input?.placeId) {
      if (!places().byId.has(input.placeId)) return fail(`找不到資料點 ${input.placeId}`);
      return { ok: true, ...opinionsOfPlace(input.placeId) };
    }
    if (input?.date) {
      const date = needDate(input.date);
      if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
      const cands = dayCandidates(s.candidates, date, places().itinerary, places().byId);
      const stops = places().itinerary?.days.find((x) => x.date === date)?.items.flatMap((i) => (i.type === 'visit' ? i.options.map((o) => o.place) : [])) ?? [];
      const ids = [...new Set([...stops, ...cands.map((c) => c.placeId)])];
      return {
        ok: true,
        date,
        comments: s.comments.filter((c) => c.target === dayTarget(date)).map((c) => ({ by: who(c.author), text: c.text, kind: c.kind })),
        candidates: cands.map((c) => ({ id: c.placeId, name: nameOf(c.placeId), addedBy: who(c.addedBy) })),
        places: ids.map(opinionsOfPlace).filter((o) => o.likes.length || o.dislikes.length || o.comments.length),
      };
    }
    // 整趟：依地區和票數的摘要
    const rows = [...likedPlaces(s.votes).entries()].flatMap(([id, v]) => {
      const p = places().byId.get(id);
      if (!p || !v.likes.length) return [];
      const st = placeDayStatus(id, s.candidates, places().itinerary);
      return [{ id, name: placeName(p), area: p.area, type: p.type, likes: v.likes.length, dislikes: v.dislikes.length, candidateDays: st.candidate, scheduledDays: st.scheduled }];
    });
    rows.sort((a, b) => b.likes - a.likes);
    return { ok: true, wishes: rows, tripComments: s.comments.filter((c) => c.target === TRIP_TARGET).map((c) => ({ by: who(c.author), text: c.text })) };
  }

  /** 整份資料很大（機場約 1.6 萬字元），一次只回要的分項，來源拿掉（T36） */
  async function get_trip_info(input: { topic: string; sections?: string[] }): Promise<ToolOutput> {
    const topic = input?.topic;
    if (topic === 'party') return { ok: true, party: places().itinerary?.party ?? null };
    if (topic !== 'passes' && topic !== 'airport') return fail('topic 要是 passes、airport、party');
    const allowed: readonly string[] = TRIP_INFO_SECTIONS[topic];
    const sections = input.sections ?? [];
    if (!sections.length) return fail(`要給 sections（${topic} 可用：${allowed.join('、')}）`);
    const bad = sections.filter((x) => !allowed.includes(x));
    if (bad.length) return fail(`沒有分項 ${bad.join('、')}（${topic} 可用：${allowed.join('、')}）`);
    const loaded = await d.source.loadTripInfo(topic);
    // 機場的資料是一個資料夾（目前只有關西機場一份）
    const info = (Array.isArray(loaded) ? loaded[0] : loaded) as Record<string, unknown> | null | undefined;
    if (!info) return fail('沒有這份資料');
    return { ok: true, topic, ...Object.fromEntries(sections.map((s) => [s, withoutSources(info[s] ?? null)])) };
  }

  /**
   * 各區的介紹（T40 的 intro）：一句特色、要不要搭車、代表的點、二月注意。
   * 不給 area 是全部的區（子地區只列名字和要不要搭車）；給了只回那一區，子地區也帶介紹。
   */
  function get_areas(input: { area?: string } = {}): ToolOutput {
    const s = places();
    const point = (id: string) => {
      const p = s.byId.get(id);
      return p ? { id, name: placeName(p), type: p.type, tier: p.tier } : null;
    };
    const points = (ids: readonly string[] | undefined) => (ids ?? []).flatMap((id) => point(id) ?? []);
    const one = input?.area;
    const picked = one ? s.areas.filter((a) => a.id === one) : s.areas;
    if (one && !picked.length) return fail(`沒有區域 ${one}（可用：${s.areas.map((a) => a.id).join('、')}）`);
    return {
      ok: true,
      areas: picked.map((a) => ({
        id: a.id,
        name: a.name.zh || a.name.ja,
        summary: a.intro?.summary ?? null,
        transport: a.intro?.transport ?? null,
        highlights: points(a.intro?.highlights),
        february: (a.intro?.february ?? []).map((f) => f.text),
        regions: (a.regions ?? []).map((r) => ({
          id: r.id,
          name: r.name.zh || r.name.ja,
          needsCar: r.needsCar ?? null,
          ...(one ? { summary: r.intro?.summary ?? null, highlights: points(r.intro?.highlights), febNote: r.intro?.febNote ?? null } : {}),
        })),
      })),
    };
  }

  /** 預約筆記：住宿的 date 是入住那晚 */
  const reservationRows = () => noteRows(places().itinerary, d.plan.getState().plan, places().byId, d.shared.store.getState().reservations);

  function get_reservations(input: { date?: string; status?: ReservationStatus } = {}): ToolOutput {
    const rows = reservationRows().filter((r) => (!input?.date || r.date === input.date) && (!input?.status || r.status === input.status));
    return {
      ok: true,
      // 沒有的欄位不帶（住宿沒有 time、餐廳沒有 endDate…），只有晚數改過才標 nightsChanged
      rows: rows.map((r) => tidy({ date: r.date, endDate: r.endDate, placeId: r.placeId, name: nameOf(r.placeId), role: r.role, time: r.time, people: r.people, status: r.status, note: r.note, updatedBy: r.updatedBy ? who(r.updatedBy) : null, accepted: r.accepted, methods: r.methods, phone: r.phone, url: r.url, nightsChanged: r.nightsChanged || null })),
    };
  }

  /** 脈絡晶片的精簡內容（規格 §6） */
  const digest = (id: string) => {
    const p = fullPlace(places(), id);
    return p ? digestOf(p, likes(id)) : null;
  };

  return { search_places, get_place, get_day, get_trip_overview, check_changes, suggest_position, get_route, get_timetable, get_opinions, get_trip_info, get_areas, get_reservations, reservationRows, digest, proposalWarnings, proposalBooked };
}

export type ReadTools = ReturnType<typeof createReadTools>;
