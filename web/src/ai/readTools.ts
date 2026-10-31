// 查資料的工具（規格 §4.1）：畫面不動。能算的交給引擎，資料沒寫就原樣回傳 null，不說成沒有。

import { ItineraryError, bestInsertIndex, checkProposal, kintetsuDayType, busDayType, planLeg, type EngineData, type NewItem } from '@travel-helper/engine';
import type { DayPlan, Leg, LonLat, TimelineEntry, TravelMode, TravelSpec } from '@travel-helper/engine/types';
import { departuresAround, toMinutes } from '../lib/timetable.ts';
import { dayCandidates, likedPlaces, placeDayStatus } from '../lib/wishlist.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import { memberName } from '../sharedStore.ts';
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
};
export const PLACE_SECTIONS = Object.keys(SECTIONS);
const MAX_GET_PLACE = 6;

export function createReadTools(d: AiDeps) {
  const places = () => d.data.getState();
  const votes = () => d.shared.store.getState().votes;
  const likes = (id: string) => votes().filter((v) => v.placeId === id && v.value === 'like').length;
  const nameOf = (id: string | null | undefined) => (id ? placeName(places().byId.get(id), id) : '');
  const who = (id: string) => memberName(d.shared.store.getState().members, id);

  function needDate(date: unknown): string | null {
    return typeof date === 'string' && tripDates().includes(date) ? date : null;
  }

  function search_places(input: SearchInput): ToolOutput {
    const s = places();
    const r = searchPlaces(input ?? {}, { places: s.places, byId: s.byId, bounds: d.app.getState().view?.bounds ?? null, likes, config: d.config });
    return { ok: true, ...r };
  }

  function get_place(input: { ids: string[]; sections?: string[] }): ToolOutput {
    if (!Array.isArray(input?.ids) || !input.ids.length) return fail('ids 要是資料點 ID 的陣列');
    if (input.ids.length > MAX_GET_PLACE) return fail(`一次最多 ${MAX_GET_PLACE} 個點`);
    const sections = input.sections?.length ? input.sections : ['summary', 'group', 'hours'];
    const bad = sections.filter((x) => !SECTIONS[x]);
    if (bad.length) return fail(`沒有分區 ${bad.join('、')}（可用：${PLACE_SECTIONS.join('、')}）`);
    const { byId } = places();
    const unknown = input.ids.filter((id) => !byId.has(id));
    const found = input.ids.flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
    if (!found.length) return fail(`找不到資料點 ${unknown.join('、')}`);
    return {
      ok: true,
      places: found.map((p) => {
        const raw = p.raw as Record<string, unknown>;
        const out: Record<string, unknown> = { id: p.id, name: placeName(p), ja: p.name.ja, type: p.type, area: p.area, region: p.region, tier: p.tier, verified: raw.verified ?? null };
        if (p.origin === 'user') out.origin = '使用者自己加的，我們沒查過：營業時間、能不能坐 15 人都不知道';
        // 沒有這個欄位＝資料沒寫，回 null，不說成沒有
        for (const s of sections) out[s] = Object.fromEntries(SECTIONS[s].map((k) => [k, raw[k] ?? null]));
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

  const compactDay = (date: string, p: DayPlan) => {
    const s = d.shared.store.getState();
    const day = places().itinerary?.days.find((x) => x.date === date);
    const cands = dayCandidates(s.candidates, date, places().itinerary, places().byId);
    return {
      date,
      lodging: day?.lodging ? { id: day.lodging, name: nameOf(day.lodging), meals: day.lodgingMeals ?? null } : null,
      entries: p.entries.map(compactEntry),
      // 備選：引擎只用選定的算，AI 要知道還有哪幾個
      options: (day?.items ?? []).flatMap((i) => (i.type === 'visit' && i.options.length > 1 ? [{ itemId: i.id, selected: i.selected, places: i.options.map((o) => ({ id: o.place, name: nameOf(o.place) })), note: i.note ?? null }] : [])),
      gaps: p.gaps.map((g) => ({ label: g.label, from: g.from, to: g.to, afterItemId: g.afterItemId, beforeItemId: g.beforeItemId })),
      warnings: p.warnings.map((w) => ({ level: w.level, message: w.message, itemId: w.itemId ?? null })),
      stats: p.stats,
      candidates: cands.map((c) => ({ id: c.placeId, name: nameOf(c.placeId), addedBy: who(c.addedBy) })),
      comments: s.comments.filter((c) => c.target === dayTarget(date)).length,
    };
  };

  function get_day(input: { date: string }): ToolOutput {
    const date = needDate(input?.date);
    if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
    const p = dayPlanOf(d.plan.getState().plan, date);
    if (!p) return fail('行程引擎還沒算好，請稍等再查');
    return { ok: true, ...compactDay(date, p) };
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

  function check_changes(input: { ops: Op[] }): ToolOutput {
    const engine = d.engine();
    const before = places().itinerary;
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

  function suggest_position(input: { placeId: string; date: string }): ToolOutput {
    const engine = d.engine();
    const it = places().itinerary;
    if (!engine || !it) return fail('行程引擎還沒算好，請稍等再查');
    const date = needDate(input?.date);
    if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
    const p = places().byId.get(input.placeId);
    if (!p) return fail(`找不到資料點 ${input.placeId}`);
    if (p.type === 'lodging' || p.type === 'station') return fail('住宿、車站不用找位置：住宿用 setLodging，車站不排進行程');
    const item: NewItem = { type: 'visit', options: [{ place: p.id, stayMinutes: null }] };
    const index = bestInsertIndex(it, date, item, engine, d.config);
    const check = check_changes({ ops: [{ op: 'add', date, place: p.id, index }] });
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

  async function get_timetable(input: { station?: string; route?: string; date: string; after?: string }): Promise<ToolOutput> {
    const date = needDate(input?.date);
    if (!date) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)} 的日期`);
    const after = input.after ?? '09:00';
    if (input.station) {
      const tt = await d.source.loadTimetable(input.station);
      if (!tt) return fail(`${input.station} 沒有車站時刻表（巴士、船用 route 查）`);
      const dayType = kintetsuDayType(date, d.config.holidays);
      return { ok: true, station: nameOf(input.station), dayType, directions: departuresAround(tt, dayType, after, 1, 6) };
    }
    if (input.route) {
      const q = input.route;
      const route = d.engine()?.routes?.find((r) => r.id === q || r.name.ja.includes(q) || r.name.zh?.includes(q));
      if (!route) return fail(`找不到路線 ${q}`);
      const t = toMinutes(after);
      const trips = (route.trips[busDayType(date, d.config.holidays)] ?? [])
        .filter((x) => !x.dates || x.dates.includes(date))
        .map((x) => ({ headsign: x.headsign, stops: x.stops.flatMap(([s, a2, d2]) => (d2 || a2 ? [{ stop: s, time: (d2 ?? a2) as string }] : [])) }))
        .filter((x) => x.stops[0] && toMinutes(x.stops[0].time) >= t)
        .sort((x, y) => toMinutes(x.stops[0].time) - toMinutes(y.stops[0].time))
        .slice(0, 8);
      return { ok: true, route: route.name.zh ?? route.name.ja, mode: route.mode, validFrom: route.validFrom, stops: route.stops.map((s) => ({ id: s.id, name: s.name })), trips };
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

  async function get_trip_info(input: { topic: string }): Promise<ToolOutput> {
    const topic = input?.topic;
    if (topic === 'party') return { ok: true, party: places().itinerary?.party ?? null };
    if (topic !== 'passes' && topic !== 'airport') return fail('topic 要是 passes、airport、party');
    const info = await d.source.loadTripInfo(topic);
    return info ? { ok: true, info } : fail('沒有這份資料');
  }

  /** 脈絡晶片的精簡內容（規格 §6） */
  const digest = (id: string) => {
    const p = places().byId.get(id);
    return p ? digestOf(p, likes(id)) : null;
  };

  return { search_places, get_place, get_day, get_trip_overview, check_changes, suggest_position, get_route, get_timetable, get_opinions, get_trip_info, digest };
}

export type ReadTools = ReturnType<typeof createReadTools>;
