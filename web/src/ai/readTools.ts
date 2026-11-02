// 查資料的工具（規格 §4.1）：畫面不動。能算的交給引擎，資料沒寫就原樣回傳 null，不說成沒有。

import { ItineraryError, bestInsertIndex, checkProposal, findItem, kintetsuDayType, busDayType, planItinerary, planLeg, type EngineData, type NewItem } from '@travel-helper/engine';
import type { DayPlan, Itinerary, Leg, LonLat, TimelineEntry, TravelMode, TravelSpec } from '@travel-helper/engine/types';
import type { ReservationStatus } from '../backend/types.ts';
import { noteRows } from '../lib/reservations.ts';
import { departuresAround, toMinutes } from '../lib/timetable.ts';
import { dayCandidates, likedPlaces, placeDayStatus } from '../lib/wishlist.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import { memberName } from '../sharedStore.ts';
import { fullPlace } from '../dataStore.ts';
import { dayPlanOf } from '../planStore.ts';
import { tripDates } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { digestOf, searchPlaces, type SearchInput } from './search.ts';
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

  function needDate(date: unknown): string | null {
    return typeof date === 'string' && tripDates().includes(date) ? date : null;
  }

  /** 等詳情層：讀不到時要明講，不能回 null（null 在這裡是「資料沒寫」） */
  async function detailsProblem(): Promise<ToolOutput | null> {
    try {
      await d.details?.();
      return null;
    } catch {
      return fail('詳細資料暫時讀不到（網路問題），請使用者稍後再試；不要當成資料沒寫');
    }
  }

  async function search_places(input: SearchInput): Promise<ToolOutput> {
    const problem = await detailsProblem();
    if (problem) return problem;
    const s = places();
    const r = searchPlaces(input ?? {}, { places: s.places, byId: s.byId, bounds: d.app.getState().view?.bounds ?? null, likes, config: d.config, full: (id) => fullPlace(s, id) });
    return { ok: true, ...r };
  }

  async function get_place(input: { ids: string[]; sections?: string[] }): Promise<ToolOutput> {
    if (!Array.isArray(input?.ids) || !input.ids.length) return fail('ids 要是資料點 ID 的陣列');
    if (input.ids.length > MAX_GET_PLACE) return fail(`一次最多 ${MAX_GET_PLACE} 個點`);
    const sections = input.sections?.length ? input.sections : ['summary', 'group', 'hours'];
    const bad = sections.filter((x) => !SECTIONS[x]);
    if (bad.length) return fail(`沒有分區 ${bad.join('、')}（可用：${PLACE_SECTIONS.join('、')}）`);
    const problem = await detailsProblem();
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
        const out: Record<string, unknown> = { id: p.id, name: placeName(p), ja: p.name.ja, type: p.type, area: p.area, region: p.region, tier: p.tier, verified: raw.verified ?? null };
        if (p.origin === 'user') out.origin = '使用者自己加的，我們沒查過：營業時間、能不能坐 15 人都不知道';
        // 沒有這個欄位＝資料沒寫，回 null，不說成沒有。欄位直接放在點上（不再包一層分區），來源拿掉（T36）
        for (const s of sections) for (const k of SECTIONS[s]) out[k] = withoutSources(raw[k] ?? null);
        const edited = Object.keys(p.edited ?? {});
        if (edited.length) out.edited = edited;
        return out;
      }),
      ...(unknown.length ? { unknown } : {}),
    };
  }

  const compactLeg = (l: Leg | null) =>
    l && {
      mode: l.mode,
      minutes: l.minutes,
      walkMinutes: l.walkMinutes,
      waitMinutes: l.waitMinutes,
      rides: l.rides.map((r) => ({ line: r.line, from: nameOf(r.from) || r.from, to: nameOf(r.to) || r.to, depart: r.depart, arrive: r.arrive, ifMissed: r.ifMissed ?? null })),
      ...(l.taxi ? { taxi: { cars: l.taxi.cars, fareEstimateYen: l.taxi.fareEstimateYen } } : {}),
      basis: l.basis,
    };

  const compactEntry = (e: TimelineEntry) => ({
    kind: e.kind,
    itemId: e.itemId,
    placeId: e.placeId,
    name: nameOf(e.placeId),
    arrive: e.arrive,
    start: e.start,
    end: e.end,
    waitMinutes: e.waitMinutes,
    meal: e.mealTags?.length ? e.mealTags : null,
    travel: compactLeg(e.travel),
  });

  const compactDay = (date: string, p: DayPlan, it: Itinerary | null) => {
    const s = d.shared.store.getState();
    const day = it?.days.find((x) => x.date === date);
    const cands = dayCandidates(s.candidates, date, it, places().byId);
    const confirmed = places().itinerary;
    return {
      date,
      lodging: day?.lodging ? { id: day.lodging, name: nameOf(day.lodging), meals: day.lodgingMeals ?? null } : null,
      entries: p.entries.map((e) => {
        const item = e.itemId && it ? findItem(it, e.itemId)?.item : null;
        return {
          ...compactEntry(e),
          note: item?.note ?? null,
          // 提議裡新加的卡：ID 只是暫時的，不能用在 ops（要改就重寫那個 add）
          ...(it !== confirmed && e.itemId && confirmed && !findItem(confirmed, e.itemId) ? { draftOnly: true } : {}),
        };
      }),
      // 備選：引擎只用選定的算，AI 要知道還有哪幾個
      options: (day?.items ?? []).flatMap((i) => (i.type === 'visit' && i.options.length > 1 ? [{ itemId: i.id, selected: i.selected, places: i.options.map((o) => ({ id: o.place, name: nameOf(o.place) })), note: i.note ?? null }] : [])),
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
    return {
      ok: true,
      days: plan.days.map((p) => {
        const day = it?.days.find((x) => x.date === p.date);
        const stops = p.entries.filter((e) => e.kind === 'visit' && e.placeId);
        return {
          date: p.date,
          regions: [...new Set(stops.map((e) => places().byId.get(e.placeId!)?.region).filter(Boolean))],
          stops: stops.map((e) => nameOf(e.placeId)),
          lodging: day?.lodging ? nameOf(day.lodging) : null,
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
        summary: r.summary,
        newWarnings: r.newWarnings.map((w) => w.message),
        resolvedWarnings: r.resolvedWarnings.map((w) => w.message),
      };
    } catch (e) {
      if (e instanceof ItineraryError) return fail(e.message);
      throw e;
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
    const { leg, warnings } = planLeg(a as never, b as never, { date, depart, party, whole: true, data: engine as EngineData, cfg: d.config }, spec);
    return {
      ok: true,
      date,
      depart: leg.depart,
      arrive: leg.arrive,
      ...compactLeg(leg),
      alternatives: leg.alternatives?.map((x) => ({ summary: x.summary, arrive: x.arrive, minutes: x.minutes, walkMinutes: x.walkMinutes })) ?? [],
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
      const tt = await d.source.loadTimetable(input.station);
      if (!tt) return fail(`${input.station} 沒有車站時刻表（巴士、船用 route 查）`);
      const dayType = kintetsuDayType(date, d.config.holidays);
      return { ok: true, station: nameOf(input.station), dayType, directions: departuresAround(tt, dayType, after, 1, 6) };
    }
    if (input.route) {
      const q = input.route;
      const route = d.engine()?.routes?.find((r) => r.id === q || r.name.ja.includes(q) || r.name.zh?.includes(q));
      if (!route) return fail(`找不到路線 ${q}`);
      // 路線沒給 after 從頭列：以前預設 09:00 又用第一站的時間濾，會漏掉中途站 9 點前的班（T36 模擬抓到）
      let t: number;
      try {
        t = toMinutes(input.after ?? '00:00');
      } catch {
        return fail('after 要是 HH:MM');
      }
      const dayType = busDayType(date, d.config.holidays);
      const stopName = new Map(route.stops.map((s) => [s.id, String(s.name)]));
      const head = { ok: true as const, route: route.name.zh ?? route.name.ja, mode: route.mode, dayType, validFrom: route.validFrom };
      const runs = (route.trips[dayType] ?? [])
        .filter((x) => !x.dates || x.dates.includes(date))
        .map((x) => ({ headsign: x.headsign, stops: x.stops.flatMap(([s, a2, d2]) => (d2 || a2 ? [{ name: stopName.get(s) ?? s, time: (d2 ?? a2) as string }] : [])) }));
      // 站名比對：拿掉空白，部分符合就算（「鳥羽駅」「鳥羽」都行）
      const fold = (s: string) => s.normalize('NFKC').replace(/\s/g, '');
      const hits = (name: string, want: string) => fold(name).includes(fold(want)) || fold(want).includes(fold(name));
      if (input.from || input.to) {
        // 給了上車、下車站：每班只回這兩站的時間，站名直接寫出來（不用對照代號）
        const trips = runs
          .flatMap((x) => {
            const first = input.from ? x.stops.findIndex((s) => hits(s.name, input.from!)) : 0;
            if (first < 0) return [];
            const j = input.to ? x.stops.findIndex((s, k) => k > first && hits(s.name, input.to!)) : x.stops.length - 1;
            if (j < 0) return [];
            // 同一班經過上車站兩次（鷗巴士 2 號：鳥羽駅 → 繞マリンターミナル → 再回鳥羽駅）：取離下車站最近的那次，同引擎（T36 模擬抓到）
            let i = first;
            if (input.from) for (let k = first + 1; k < j; k++) if (hits(x.stops[k].name, input.from)) i = k;
            return [{ headsign: x.headsign, from: x.stops[i].name, depart: x.stops[i].time, to: x.stops[j].name, arrive: x.stops[j].time }];
          })
          .filter((x) => toMinutes(x.depart) >= t)
          .sort((x, y) => toMinutes(x.depart) - toMinutes(y.depart))
          .slice(0, 10);
        if (!trips.length) return { ...head, trips, note: '這天沒有從上車站往下車站的班次（站名對不到也會這樣）；站名見 stops', stops: [...new Set(stopName.values())] };
        return { ...head, trips };
      }
      // 沒給站：站名清單（去重）和每班的起訖，要細節請 AI 再給 from、to
      const trips = runs
        .filter((x) => x.stops[0] && toMinutes(x.stops[0].time) >= t)
        .sort((x, y) => toMinutes(x.stops[0].time) - toMinutes(y.stops[0].time))
        .slice(0, 12)
        .map((x) => ({ headsign: x.headsign, first: x.stops[0], last: x.stops.at(-1) }));
      return { ...head, stops: [...new Set(stopName.values())], trips, note: '要某一站的時間，給 from（上車站）、to（下車站）再查一次' };
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

  /** 預約清單（同畫面的預約筆記）：住宿的 date 是入住那晚 */
  const reservationRows = () => noteRows(places().itinerary, d.plan.getState().plan, places().byId, d.shared.store.getState().reservations);

  function get_reservations(input: { date?: string; status?: ReservationStatus } = {}): ToolOutput {
    const rows = reservationRows().filter((r) => (!input?.date || r.date === input.date) && (!input?.status || r.status === input.status));
    return {
      ok: true,
      rows: rows.map((r) => ({ date: r.date, endDate: r.endDate, placeId: r.placeId, name: nameOf(r.placeId), role: r.role, time: r.time, people: r.people, status: r.status, note: r.note, updatedBy: r.updatedBy ? who(r.updatedBy) : null, accepted: r.accepted, methods: r.methods, phone: r.phone, url: r.url, nightsChanged: r.nightsChanged })),
    };
  }

  /** 脈絡晶片的精簡內容（規格 §6） */
  const digest = (id: string) => {
    const p = fullPlace(places(), id);
    return p ? digestOf(p, likes(id)) : null;
  };

  return { search_places, get_place, get_day, get_trip_overview, check_changes, suggest_position, get_route, get_timetable, get_opinions, get_trip_info, get_reservations, reservationRows, digest, proposalWarnings };
}

export type ReadTools = ReturnType<typeof createReadTools>;
