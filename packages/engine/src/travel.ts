// 兩點之間：依 CONVENTIONS §5.4 選交通方式，算時間（不加緩衝）。
// 步行 ≤ 單段上限 → 走路；否則找近鐵、巴士、定期船（巴士要等 20 分內、不是 1 小時以上才一班）；
// 都不行 → 計程車（有 OSRM 開車時間用它，沒有照距離估算）。離島只能搭船。
// 指定 transit：一定搭大眾運輸；指定班次（TravelSpec.trip）：用那班，趕不上就警告；trip.rides 指定轉乘後每一程的班次（接不上改最早接得上的）。
// rideDepartures：一程（同一對站）那天的所有班次，給班次表、選班次用。
// T29：自動、指定方式的大眾運輸改用 RAPTOR（raptor/），可以轉乘多次、含大阪的班距型路線；
// 選定班次（trip）照舊走舊的時刻表搜尋（legacySearchTransit），T29b 拿掉選班次時一起刪。

import type { EngineConfig } from './config.ts';
import type { EngineData, PlaceRecord, RouteTimetable, UrbanTransfer } from './data.ts';
import { estimateWalk, haversineMeters, isLonLat, minutesForMeters, nearestStations } from './geo.ts';
import { anyTrainThatDay, departuresFrom, directTrains, earliestTrain, routeRides, type RouteRide, type TrainRide } from './transit.ts';
import { fromMinutes, kintetsuDayType, toMinutes } from './time.ts';
import type { DateString, EngineWarning, Leg, LegAlternative, LegTransfer, LonLat, PartyProfile, TaxiInfo, TimeString, TransitRide, TravelMode, TravelSpec, TripRef } from './types.ts';
import { buildNetwork, KINTETSU, routeFare, type Network } from './raptor/network.ts';
import { earliestRide, indexOf, searchJourneys, type Access, type Journey, type JourneyRide, type SearchQuery } from './raptor/search.ts';
import { ifMissed, pathOf } from './raptor/path.ts';

export interface Endpoint {
  id: string | null;
  coords: LonLat | null;
  record: PlaceRecord | null;
}

export interface LegContext {
  date: DateString;
  /** 從起點出發的時間（分鐘） */
  depart: number;
  party: PartyProfile;
  /** 全員（true）或分組 */
  whole: boolean;
  data: EngineData;
  cfg: EngineConfig;
}

export type LegWarning = Omit<EngineWarning, 'date'>;

/** 團體步行係數（§5.4） */
export function walkFactor(party: PartyProfile, whole: boolean, cfg: EngineConfig): number {
  if (whole) return cfg.walk.factorWhole;
  return party.elders > 0 || party.kids > 0 ? cfg.walk.factorSubgroupWithElderOrKid : cfg.walk.factorSubgroupAdults;
}

export function legWalkMax(whole: boolean, cfg: EngineConfig): number {
  return whole ? cfg.walk.legMaxWhole : cfg.walk.legMaxSubgroup;
}

/** 步行分鐘（已套係數）：anchors（係數 1 的分鐘）→ nearestStation → walkMeters（OSRM 快取）→ 直線估算 */
export function walkMinutes(a: Endpoint, b: Endpoint, factor: number, data: EngineData, cfg: EngineConfig): { minutes: number; basis: string } | null {
  if (a.id && b.id) {
    const anchor = b.record?.anchors?.find((x) => x.id === a.id) ?? a.record?.anchors?.find((x) => x.id === b.id);
    if (anchor) return { minutes: anchor.walkMinutes * factor, basis: `anchors（${anchor.walkSource ?? 'estimate'}）` };
    const ns = a.record?.nearestStation?.id === b.id ? a.record.nearestStation : b.record?.nearestStation?.id === a.id ? b.record.nearestStation : null;
    if (ns && (ns.mode ?? 'walk') === 'walk' && ns.minutes != null) return { minutes: ns.minutes * factor, basis: 'nearestStation' };
  }
  if (!isLonLat(a.coords) || !isLonLat(b.coords)) return null;
  const opts = { metersPerMinute: cfg.walk.metersPerMinute, detourFactor: cfg.walk.detourFactor, groupFactor: factor };
  const m = data.walkMeters?.(a.coords, b.coords);
  if (m != null) return { minutes: minutesForMeters(m, opts), basis: 'osrm' };
  return { minutes: estimateWalk(a.coords, b.coords, opts).minutes, basis: '直線估算' };
}

const round = (m: number) => Math.max(0, Math.ceil(m - 1e-9));

function regionOf(e: Endpoint): string | null {
  return (e.record?.region as string | undefined) ?? null;
}

function isIsland(e: Endpoint, cfg: EngineConfig): boolean {
  const r = regionOf(e);
  return !!r && cfg.transit.islandRegions.includes(r);
}

// --- 候選 -------------------------------------------------------------------

interface Candidate {
  mode: 'train' | 'bus' | 'ferry';
  /** 到達終點的時間（分鐘，含下車後走路） */
  arrive: number;
  /** 走到第一個上車點的分鐘（已進位） */
  access: number;
  /** 最後下車走到終點的分鐘（已進位） */
  egress: number;
  /** 第一程發車（分鐘） */
  dep: number;
  /** 從搜尋的出發時間算起要等的分鐘 */
  wait: number;
  rides: TransitRide[];
  headway: number | null;
  basis: string;
  /** 近鐵：上下車站和兩端走路（已套係數、未進位），找前一班、後一班時只查這對車站 */
  pair?: { from: string; to: string; walkFrom: number; walkTo: number };
  /** 近鐵：每一程的列車（換後面那程的班次時用） */
  trains?: TrainRide[];
  /** RAPTOR 的走法（T29）；舊的時刻表搜尋（選定班次）沒有 */
  journey?: Journey;
  net?: Network;
  /** 轉乘步行（rides.length − 1 個） */
  transfers?: LegTransfer[];
  /** 每一程走到上車點／轉乘完的時間（分鐘） */
  ready?: number[];
  /** 舊的 tripLeg 解讀得了的走法（近鐵 1～2 程、單一路線檔 1 程）才有前一班、後一班（spec §6.6） */
  legacy?: boolean;
  /** 套等車規則用的等車（沒有就是 wait）：第一程是班距型的只看班距型本身的等車 */
  ruleWait?: number;
}

/** 班距型那程的等車（全員整個班距、分組一半，向上取整） */
const headwayWaitOf = (r: JourneyRide, whole: boolean) => Math.ceil(whole ? (r.headway?.min ?? 0) : (r.headway?.min ?? 0) / 2);

/** 端點附近的近鐵車站（走得到的），附步行分鐘（已套係數） */
function kintetsuAccess(e: Endpoint, ctx: LegContext, factor: number): { station: string; walk: number }[] {
  const order = ctx.data.kintetsu?.stationOrder ?? [];
  if (e.id && order.includes(e.id)) return [{ station: e.id, walk: 0 }];
  const out = new Map<string, number>();
  const ns = e.record?.nearestStation;
  if (ns?.id && order.includes(ns.id) && (ns.mode ?? 'walk') === 'walk' && ns.minutes != null) out.set(ns.id, ns.minutes * factor);
  if (isLonLat(e.coords)) {
    const near = nearestStations(e.coords, ctx.data.stations as { id: string; coords: LonLat | null; operator?: string }[], {
      operator: 'kintetsu',
      limit: 2,
      maxMeters: ctx.cfg.walk.accessMaxMeters,
    });
    for (const r of near) {
      if (!order.includes(r.station.id) || out.has(r.station.id)) continue;
      const st = ctx.data.getPlace(r.station.id)?.record ?? null;
      const w = walkMinutes(e, { id: r.station.id, coords: r.station.coords, record: st }, factor, ctx.data, ctx.cfg);
      if (w) out.set(r.station.id, w.minutes);
    }
  }
  const max = legWalkMax(ctx.whole, ctx.cfg);
  return [...out].filter(([, w]) => w <= max).map(([station, walk]) => ({ station, walk }));
}

function stationName(id: string, data: EngineData): string {
  return (data.getPlace(id)?.record.name.ja as string | undefined) ?? id;
}

/** 走到上車點的分鐘（已進位）→ 從哪個時間開始找車 */
type ReadyAt = (access: number) => number;

/** 近鐵 1～2 段的候選；after：從幾點開始等車 */
function trainCandidate(legs: TrainRide[], pair: NonNullable<Candidate['pair']>, after: number, ctx: LegContext): Candidate {
  const last = legs[legs.length - 1];
  return {
    mode: 'train',
    arrive: last.arr + round(pair.walkTo),
    access: round(pair.walkFrom),
    egress: round(pair.walkTo),
    dep: legs[0].dep,
    wait: legs[0].dep - after,
    rides: legs.map((r: TrainRide) => ({
      mode: 'train' as const,
      line: trainLine(r, ctx.data),
      from: r.from,
      to: r.alight,
      depart: fromMinutes(r.dep),
      arrive: fromMinutes(r.arr),
      tripId: r.trainNo,
      fareAdult: null,
      routeId: null,
    })),
    headway: null,
    basis: '近鐵時刻表',
    pair,
    trains: legs,
  };
}

/** 近鐵一程的車種和終點，例如「特急（往賢島）」 */
const trainLine = (r: TrainRide, data: EngineData) => `${r.type}（往${stationName(r.to, data)}）`;

/** 近鐵 from → to 那天的直達車（不轉乘、不含固定停駛的），after 以後發車，依發車排序 */
function directOn(from: string, to: string, after: number, ctx: Pick<LegContext, 'date' | 'data' | 'cfg'>): TrainRide[] {
  const tt = ctx.data.kintetsu;
  if (!tt) return [];
  return directTrains(tt, { from, to, date: ctx.date, after, holidays: ctx.cfg.holidays, allowExpress: ctx.cfg.transit.allowExpress }).filter((r) => !r.off);
}

/**
 * 第一程之後的每一程換成 wanted 指定的那班（同一對站）；那班接不上（發車 < 前一程到站＋minTransfer）或找不到，
 * 改成同一對站接得上的最早一班；同一對站整天都接不上就留原本的，加 missed-trip 警告。前面那程不會被後面改
 */
function chainTrains(legs: TrainRide[], wanted: readonly (string | undefined)[], ctx: LegContext, warnings: LegWarning[]): TrainRide[] {
  const out = [legs[0]];
  for (let i = 1; i < legs.length; i++) {
    const deps = directOn(legs[i].from, legs[i].alight, out[i - 1].arr + ctx.cfg.transit.minTransfer, ctx);
    const r = deps.find((x) => x.trainNo === wanted[i]) ?? deps[0];
    if (!r) warnings.push({ code: 'missed-trip', level: 'warning', message: `接不上 ${fromMinutes(legs[i].dep)} 這班` });
    out.push(r ?? legs[i]);
  }
  return out;
}

function trainCandidates(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, readyAt: ReadyAt): { cands: Candidate[]; missedLast: boolean } {
  const tt = ctx.data.kintetsu;
  if (!tt) return { cands: [], missedLast: false };
  const cands: Candidate[] = [];
  let anyDay = false;
  for (const sa of kintetsuAccess(a, ctx, factor)) {
    for (const sb of kintetsuAccess(b, ctx, factor)) {
      if (sa.station === sb.station) continue;
      const q = {
        from: sa.station,
        to: sb.station,
        date: ctx.date,
        after: readyAt(round(sa.walk)),
        holidays: ctx.cfg.holidays,
        allowExpress: ctx.cfg.transit.allowExpress,
        minTransfer: ctx.cfg.transit.minTransfer,
      };
      const legs = earliestTrain(tt, q);
      if (!legs) {
        if (!anyDay && anyTrainThatDay(tt, q)) anyDay = true;
        continue;
      }
      cands.push(trainCandidate(legs, { from: sa.station, to: sb.station, walkFrom: sa.walk, walkTo: sb.walk }, q.after, ctx));
    }
  }
  return { cands, missedLast: !cands.length && anyDay };
}

/**
 * 近鐵轉乘一次、轉乘站固定在 via 的走法（trip.via）：第一程搭 first 到 via，第二程從 via 接 second（接不上改接得上的最早一班，chainTrains）。
 * 不重新推轉乘站（節點不變）；第一程那班不到 via 回傳 null
 */
function viaCandidate(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, first: string, second: string | undefined, via: string, after: number, warnings: LegWarning[]): Candidate | null {
  if (!ctx.data.kintetsu || crossesSea(a, b, ctx.cfg)) return null;
  let found: { c: Candidate; warns: LegWarning[] } | null = null;
  for (const sa of kintetsuAccess(a, ctx, factor)) {
    for (const sb of kintetsuAccess(b, ctx, factor)) {
      if (sa.station === via || sb.station === via || sa.station === sb.station) continue;
      const r1 = directOn(sa.station, via, 0, ctx).find((r) => r.trainNo === first);
      if (!r1) continue;
      const orig = directOn(via, sb.station, 0, ctx).find((r) => r.trainNo === second) ?? directOn(via, sb.station, r1.arr + ctx.cfg.transit.minTransfer, ctx)[0];
      if (!orig) continue;
      const warns: LegWarning[] = [];
      const legs = chainTrains([r1, orig], [first, second], ctx, warns);
      const c = trainCandidate(legs, { from: sa.station, to: sb.station, walkFrom: sa.walk, walkTo: sb.walk }, after, ctx);
      if (!found || c.arrive < found.c.arrive) found = { c, warns };
    }
  }
  if (!found) return null;
  warnings.push(...found.warns);
  return found.c;
}

/** 端點對應的停留所：near 裡有這個 ID 的；沒有的話用座標找 accessMaxMeters 內的 */
function stopMatcher(e: Endpoint, cfg: EngineConfig) {
  return (doc: RouteTimetable) => {
    const m = new Map<string, number>();
    if (e.id) {
      for (const s of doc.stops) {
        const n = s.near?.find((x) => x.id === e.id);
        if (n) m.set(s.id, n.meters);
      }
    }
    if (!m.size && isLonLat(e.coords)) {
      for (const s of doc.stops) {
        if (!isLonLat(s.coords)) continue;
        const d = haversineMeters(e.coords, s.coords);
        if (d <= cfg.walk.accessMaxMeters) m.set(s.id, Math.round(d));
      }
    }
    return m;
  };
}

function routeCandidates(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, readyAt: ReadyAt): { cands: Candidate[]; missedLast: boolean } {
  const routes = ctx.data.routes ?? [];
  if (!routes.length) return { cands: [], missedLast: false };
  const { cfg } = ctx;
  const walkOf = (meters: number) => minutesForMeters(meters * cfg.walk.detourFactor, { metersPerMinute: cfg.walk.metersPerMinute, groupFactor: factor });
  const max = legWalkMax(ctx.whole, cfg);
  const ma = stopMatcher(a, cfg);
  const mb = stopMatcher(b, cfg);
  const all = routeRides(routes, ma, mb, ctx.date, '00:00', cfg.holidays);
  const usable = all.filter((r) => walkOf(r.fromMeters) <= max && walkOf(r.toMeters) <= max);
  const cands: Candidate[] = [];
  for (const r of usable) {
    const ready = readyAt(round(walkOf(r.fromMeters)));
    if (toMinutes(r.dep) < ready) continue;
    const next = usable.find((o: RouteRide) => o !== r && o.routeId === r.routeId && o.fromStop === r.fromStop && toMinutes(o.dep) > toMinutes(r.dep));
    const mode = r.mode === 'ferry' ? 'ferry' : r.mode === 'jr' ? 'train' : 'bus';
    cands.push({
      mode,
      arrive: toMinutes(r.arr) + round(walkOf(r.toMeters)),
      access: round(walkOf(r.fromMeters)),
      egress: round(walkOf(r.toMeters)),
      dep: toMinutes(r.dep),
      wait: toMinutes(r.dep) - ready,
      rides: [
        {
          mode,
          line: `${r.line}（往${r.headsign}）`,
          from: r.fromStopName,
          to: r.toStopName,
          depart: r.dep,
          arrive: r.arr,
          tripId: r.tripId,
          fareAdult: r.fareAdult,
          routeId: r.routeId,
        },
      ],
      headway: next ? toMinutes(next.dep) - toMinutes(r.dep) : null,
      basis: `${r.routeId} 時刻表`,
    });
  }
  return { cands, missedLast: !cands.length && usable.length > 0 };
}

/** 離島和其他地方之間：只能搭船 */
function crossesSea(a: Endpoint, b: Endpoint, cfg: EngineConfig): boolean {
  return regionOf(a) !== regionOf(b) && (isIsland(a, cfg) || isIsland(b, cfg));
}

/**
 * 近鐵和路線時刻表的所有候選（不套等車、班距規則）；離島只看船。readyAt：走到上車點後從幾點開始找車。
 * 舊的搜尋：只剩選定班次（tripLeg）用，T29b 拿掉選班次時刪掉
 */
function legacySearchTransit(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, readyAt: ReadyAt): { cands: Candidate[]; missedLast: boolean } {
  const route = routeCandidates(a, b, ctx, factor, readyAt);
  if (crossesSea(a, b, ctx.cfg)) return { cands: route.cands.filter((c) => c.mode === 'ferry'), missedLast: route.missedLast };
  const train = trainCandidates(a, b, ctx, factor, readyAt);
  return { cands: [...train.cands, ...route.cands], missedLast: train.missedLast || route.missedLast };
}

// --- RAPTOR（T29，spec §6.2～§6.4） --------------------------------------------

// 同一個網路、同一個端點、同樣的係數只找一次上下車點（每段交通要查好幾次）
const accessMemo = new WeakMap<Network, Map<string, Access[]>>();

/** 路線檔的停留所在網路裡的 ID（照 network.ts：加路線 ID 當前綴；JR 的停留所 ID 是車站 ID 的照用） */
const netStopId = (net: Network, doc: RouteTimetable, stop: string) => (doc.mode === 'jr' && net.stops.get(stop)?.stationId ? stop : `${doc.id}/${stop}`);

/**
 * 端點的上下車點（kintetsuAccess、stopMatcher 推廣到所有路線）：端點本身是停靠點 → 步行 0；
 * 否則 nearestStation（步行）、停留所的 near（有 near 的路線檔不再用座標找），
 * 再加 accessMaxMeters 內每種 group（近鐵、路線檔、班距型路線）最近的 2 個，步行照 walkMinutes()。
 * 超過單段步行上限的不要；步行已套係數、向上取整
 */
function accessStops(e: Endpoint, ctx: LegContext, factor: number, net: Network): Access[] {
  const { cfg } = ctx;
  const max = legWalkMax(ctx.whole, cfg);
  const key = [e.id ?? '', e.coords?.join(',') ?? '', factor, max, cfg.walk.accessMaxMeters, cfg.walk.metersPerMinute, cfg.walk.detourFactor].join('|');
  let byKey = accessMemo.get(net);
  if (!byKey) accessMemo.set(net, (byKey = new Map()));
  let out = byKey.get(key);
  if (!out) byKey.set(key, (out = findAccess(e, ctx, factor, net, max)));
  return out;
}

function findAccess(e: Endpoint, ctx: LegContext, factor: number, net: Network, max: number): Access[] {
  const { cfg, data } = ctx;
  if (e.id && net.routesAt.has(e.id)) return [{ stop: e.id, walk: 0 }];
  const walks = new Map<string, number>();
  const seen = new Set<string>();
  const put = (stop: string, w: number) => {
    seen.add(stop);
    if (w <= max && w < (walks.get(stop) ?? Infinity)) walks.set(stop, w);
  };
  const ns = e.record?.nearestStation;
  if (ns?.id && net.routesAt.has(ns.id) && (ns.mode ?? 'walk') === 'walk' && ns.minutes != null) put(ns.id, ns.minutes * factor);
  const nearDocs = new Set<string>();
  if (e.id) {
    for (const doc of data.routes ?? []) {
      for (const s of doc.stops) {
        const n = s.near?.find((x) => x.id === e.id);
        if (!n) continue;
        const sid = netStopId(net, doc, s.id);
        if (!net.routesAt.has(sid)) continue;
        nearDocs.add(doc.id);
        put(sid, minutesForMeters(n.meters * cfg.walk.detourFactor, { metersPerMinute: cfg.walk.metersPerMinute, groupFactor: factor }));
      }
    }
  }
  if (isLonLat(e.coords)) {
    // 每種 group 最近的 2 個（直線距離）
    const near = new Map<string, { stop: string; m: number }[]>();
    for (const s of net.stops.values()) {
      const at = s.coords ? net.routesAt.get(s.id) : undefined;
      if (!s.coords || !at) continue;
      const m = haversineMeters(e.coords, s.coords);
      if (m > cfg.walk.accessMaxMeters) continue;
      for (const { route } of at) {
        const g = net.routes[route].group;
        if (nearDocs.has(g)) continue;
        let list = near.get(g);
        if (!list) near.set(g, (list = []));
        if (list.some((x) => x.stop === s.id)) continue;
        list.push({ stop: s.id, m });
        list.sort((x, y) => x.m - y.m);
        if (list.length > 2) list.pop();
      }
    }
    for (const list of near.values()) {
      for (const { stop } of list) {
        if (seen.has(stop)) continue;
        seen.add(stop);
        const s = net.stops.get(stop);
        const record = s?.stationId ? (data.getPlace(s.stationId)?.record ?? null) : null;
        const w = walkMinutes(e, { id: s?.stationId ?? null, coords: s?.coords ?? null, record }, factor, data, cfg);
        if (w) put(stop, w.minutes);
      }
    }
  }
  return [...walks].map(([stop, w]) => ({ stop, walk: round(w) }));
}

/** a → b 的搜尋條件；上車點或下車點找不到回傳 null */
function raptorQuery(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, net: Network, departMinutes: number): SearchQuery | null {
  const origins = accessStops(a, ctx, factor, net);
  const targets = accessStops(b, ctx, factor, net);
  if (!origins.length || !targets.length) return null;
  return { origins, targets, depart: departMinutes, whole: ctx.whole, factor, requireFerry: crossesSea(a, b, ctx.cfg) };
}

/** 依 pickDefault 的值排序（到達＋每多一程 transferPenalty；同值程數少的在前），第一個就是 pickDefault 挑的。複製一份再排（searchJourneys 的結果是共用的） */
function byDefault(js: readonly Journey[], cfg: EngineConfig): Journey[] {
  const score = (j: Journey) => j.arr + cfg.transit.transferPenalty * (j.rides.length - 1);
  return [...js].sort((x, y) => score(x) - score(y) || x.rides.length - y.rides.length);
}

/**
 * departMinutes 從起點出發，RAPTOR 找到的走法（不套等車、班距規則），依 pickDefault 的值排序。
 * missedLast：現在沒有，但這天從 0 點起有（錯過末班車）。
 * only：只搭這種交通方式（舊的 train／bus／ferry；班距型算 train），其他方式的 group 不搭
 */
function raptorCandidates(
  a: Endpoint,
  b: Endpoint,
  ctx: LegContext,
  factor: number,
  departMinutes: number,
  only?: 'train' | 'bus' | 'ferry',
): { cands: Candidate[]; missedLast: boolean } {
  const net = buildNetwork(ctx.data, ctx.cfg, ctx.date);
  const base = raptorQuery(a, b, ctx, factor, net, departMinutes);
  if (!base) return { cands: [], missedLast: false };
  const q = only ? { ...base, exclude: groupsNot(net, only) } : base;
  const js = searchJourneys(net, q, ctx.cfg);
  const cands = byDefault(js, ctx.cfg).map((j) => journeyCandidate(j, net, departMinutes, ctx, factor));
  const missedLast = !cands.length && searchJourneys(net, { ...q, depart: 0 }, ctx.cfg).length > 0;
  return { cands, missedLast };
}

/** 網路裡交通方式不是 mode 的 group（班距型算 train） */
function groupsNot(net: Network, mode: 'train' | 'bus' | 'ferry'): string[] {
  const out = new Set<string>();
  for (const r of net.routes) if ((r.kind === 'headway' ? 'train' : r.mode) !== mode) out.add(r.group);
  return [...out];
}

/** 最多再找幾次（只在預設那幾條都不合規則時才找） */
const FALLBACK_MAX = 12;

/**
 * 預設那幾條都不合規則（ok）時再找別的：RAPTOR 每種程數只給最早到的一條，舊的寫法每對上下車點、每個路線檔各有候選，
 * 晚一點到但等得短的會被蓋掉（例如最近那站要等 40 分、遠一點那站或另一條線只要等 10 分）。
 * 1. 每個上車點各找一次；2. 不搭不合規則那條的第一程那條線（group），最多 FALLBACK_MAX 次。
 * 回傳第一條合規則的（依 pickDefault 的值）和找到的所有走法
 */
function fallbackCandidates(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, tried: readonly Candidate[], ok: (c: Candidate) => boolean): { chosen: Candidate | null; cands: Candidate[] } {
  const net = buildNetwork(ctx.data, ctx.cfg, ctx.date);
  const q = raptorQuery(a, b, ctx, factor, net, ctx.depart);
  const all = [...tried];
  if (!q) return { chosen: null, cands: all };
  // 同一條走法、同一班（不同上車點各找一次會找到同樣的）
  const sig = (j: Journey) => j.rides.map((r) => `${r.route.group}:${r.from}:${r.to}:${r.dep}`).join('|');
  const seen = new Set(all.map((c) => c.journey && sig(c.journey)));
  let runs = 0;
  const run = (sub: SearchQuery): Candidate | null => {
    runs++;
    const found = byDefault(searchJourneys(net, sub, ctx.cfg), ctx.cfg)
      .filter((j) => !seen.has(sig(j)))
      .map((j) => (seen.add(sig(j)), journeyCandidate(j, net, ctx.depart, ctx, factor)));
    all.push(...found);
    return found.find(ok) ?? null;
  };
  const pick = () => byDefault(all.map((c) => c.journey as Journey), ctx.cfg).map((j) => all.find((c) => c.journey === j) as Candidate);
  if (q.origins.length > 1) {
    for (const o of q.origins) {
      if (runs >= FALLBACK_MAX) break;
      run({ ...q, origins: [o] });
    }
    const hit = pick().find(ok);
    if (hit) return { chosen: hit, cands: pick() };
  }
  const exclude: string[] = [];
  while (runs < FALLBACK_MAX) {
    // 不合規則、依 pickDefault 最前面那條的第一程那條線
    const bad = pick().find((c) => !ok(c) && c.journey && !exclude.includes(c.journey.rides[0].route.group));
    if (!bad?.journey) break;
    exclude.push(bad.journey.rides[0].route.group);
    if (run({ ...q, exclude: [...exclude] })) break;
  }
  const sorted = pick();
  return { chosen: sorted.find(ok) ?? null, cands: sorted };
}

/** 從 ctx.depart 出發（加上走到上車點）之後，還有沒有任何走法（不管等多久）；離島只看有船的 */
function transitExists(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): boolean {
  const net = buildNetwork(ctx.data, ctx.cfg, ctx.date);
  const q = raptorQuery(a, b, ctx, factor, net, ctx.depart);
  return !!q && searchJourneys(net, q, ctx.cfg).length > 0;
}

/** 地點的顯示名稱（摘要用）：資料點的中文名 → 日文名 → 網路裡的停靠點名稱 */
function placeName(id: string, net: Network, data: EngineData): string {
  const name = data.getPlace(id)?.record.name;
  return name?.zh ?? name?.ja ?? net.stops.get(id)?.name ?? id;
}

// 路線檔的 ID → 檔案（每份資料整理一次）
const docsMemo = new WeakMap<EngineData, Map<string, RouteTimetable>>();

function routeDoc(data: EngineData, id: string | null): RouteTimetable | null {
  if (id == null) return null;
  let m = docsMemo.get(data);
  if (!m) docsMemo.set(data, (m = new Map((data.routes ?? []).map((d) => [d.id, d]))));
  return m.get(id) ?? null;
}

/** RAPTOR 的一程 → TransitRide。近鐵、班距型的 from／to 是車站 ID；巴士、船、JR 照舊是停留所名稱 */
function transitRide(r: JourneyRide, net: Network, data: EngineData): TransitRide {
  const times = { depart: fromMinutes(r.dep), arrive: fromMinutes(r.arr) };
  const route = r.route;
  if (route.kind === 'headway') {
    const u = data.urban?.find((x) => x.id === route.routeId);
    return {
      mode: 'train',
      line: route.line,
      from: r.from,
      to: r.to,
      ...times,
      tripId: null,
      fareAdult: u?.fares?.adult?.[r.from]?.[r.to] ?? null,
      routeId: route.routeId,
      kind: 'headway',
      headwayMin: r.headway?.min ?? null,
      first: r.headway?.first ?? null,
      last: r.headway?.last ?? null,
      operator: u?.operator ?? null,
    };
  }
  const trip = r.trip as NonNullable<JourneyRide['trip']>;
  const timetable = { kind: 'timetable' as const, headwayMin: null, first: null, last: null };
  if (route.group === KINTETSU) {
    return { mode: 'train', line: trip.line, from: r.from, to: r.to, ...times, tripId: trip.tripId, fareAdult: null, routeId: null, ...timetable, operator: 'kintetsu' };
  }
  const doc = routeDoc(data, route.routeId);
  const raw = (s: string) => (doc && s.startsWith(`${doc.id}/`) ? s.slice(doc.id.length + 1) : s);
  const name = (s: string) => doc?.stops.find((x) => x.id === raw(s))?.name ?? net.stops.get(s)?.name ?? s;
  const i = route.stops.indexOf(r.from);
  const j = route.stops.indexOf(r.to, i + 1);
  return {
    mode: route.mode,
    line: trip.line,
    from: name(r.from),
    to: name(r.to),
    ...times,
    tripId: trip.tripId,
    fareAdult: i >= 0 && j >= 0 ? routeFare(data, route, i, j) : null,
    routeId: route.routeId,
    ...timetable,
    operator: doc?.operator ?? null,
  };
}

function legTransfer(walk: number, t: UrbanTransfer | null, factor: number): LegTransfer {
  return {
    walkMinutes: walk,
    elevator: t?.elevator ?? null,
    elevatorWalkMinutes: t?.elevatorWalkMin != null ? round(t.elevatorWalkMin * factor) : null,
    note: t?.note ?? null,
  };
}

/** RAPTOR 的走法 → 候選。只有舊的 tripLeg 解讀得了的（近鐵 1～2 程同站轉乘、單一路線檔 1 程）才帶 pair／trains、legacy */
function journeyCandidate(j: Journey, net: Network, departMinutes: number, ctx: LegContext, factor: number): Candidate {
  const { data, cfg } = ctx;
  const first = j.rides[0];
  const ferry = j.rides.some((r) => r.route.kind === 'timetable' && r.route.mode === 'ferry');
  const mode = ferry ? 'ferry' : first.route.kind === 'timetable' ? first.route.mode : 'train';
  const access = j.origin.walk;
  const egress = j.target.walk;
  const transfers = j.transfers.map((t) => legTransfer(t.walk, t.transfer, factor));
  const ready = j.rides.map((_, i) => (i === 0 ? departMinutes + access : j.rides[i - 1].arr + Math.max(cfg.transit.minTransfer, transfers[i - 1].walkMinutes)));
  // 第一程是巴士：同一對站下一班的發車差（不是 1 小時以上才一班才搭）；班距型用班距
  let headway: number | null = null;
  if (first.route.kind === 'timetable' && first.route.mode === 'bus') {
    const next = earliestRide(net, indexOf(net), first.route.group, first.from, first.to, first.dep, ctx.whole, first.dep);
    headway = next ? next.dep - first.dep : null;
  } else if (first.headway) {
    headway = first.headway.min;
  }
  const kin = j.rides.every((r) => r.route.kind === 'timetable' && r.route.group === KINTETSU);
  const legacyKin = kin && j.rides.length <= 2 && (j.rides.length === 1 || j.rides[0].to === j.rides[1].from);
  const legacyRoute = j.rides.length === 1 && first.route.kind === 'timetable' && first.route.routeId != null;
  const sources = j.rides.map((r) => (r.route.kind === 'headway' ? `${r.route.routeId} 班距` : r.route.group === KINTETSU ? '近鐵時刻表' : `${r.route.routeId} 時刻表`));
  const c: Candidate = {
    mode,
    arrive: j.arr,
    access,
    egress,
    dep: j.dep,
    wait: first.dep - (departMinutes + access),
    // 第一程是班距型：上車可以往後挪（laterHeadway 把等車移到起點），規則只看班距型本身的等車
    ruleWait: first.headway ? Math.min(first.dep - (departMinutes + access), headwayWaitOf(first, ctx.whole)) : undefined,
    rides: j.rides.map((r) => transitRide(r, net, data)),
    headway,
    basis: [...new Set(sources)].join('＋'),
    journey: j,
    net,
    transfers,
    ready,
    legacy: legacyKin || legacyRoute,
  };
  if (legacyKin && data.kintetsu) {
    // neighbours、viaCandidate 用的 TrainRide：車種、終點從時刻表查
    const day = data.kintetsu.trains[kintetsuDayType(ctx.date, cfg.holidays)] ?? {};
    c.pair = { from: first.from, to: j.rides[j.rides.length - 1].to, walkFrom: access, walkTo: egress };
    c.trains = j.rides.map((r) => {
      const no = r.trip?.tripId ?? '';
      const t = day[no];
      return { trainNo: no, type: t?.type ?? '', to: t?.to ?? r.to, from: r.from, alight: r.to, dep: r.dep, arr: r.arr };
    });
  }
  return c;
}

/** 每一程加上「錯過的話」（path.ts 的 ifMissed）；舊的時刻表搜尋的候選照原樣 */
function withMissed(c: Candidate, ctx: LegContext, factor: number): TransitRide[] {
  const { journey: j, net } = c;
  if (!j || !net) return c.rides;
  return c.rides.map((r, i) => {
    const m = ifMissed(net, j, i, { whole: ctx.whole, factor }, ctx.cfg);
    return { ...r, ifMissed: m && { depart: fromMinutes(m.depart), arrive: fromMinutes(m.arrive), lateMinutes: m.lateMinutes } };
  });
}

/** 走法的摘要：線名 → 轉乘站 → 線名（近鐵用車種，其他用路線名） */
function summaryOf(j: Journey, net: Network, data: EngineData): string {
  const lineName = (r: JourneyRide) => {
    if (r.route.kind === 'headway') return r.route.line;
    if (r.route.group === KINTETSU) return (r.trip?.line ?? '近鐵').split('（')[0];
    const doc = routeDoc(data, r.route.routeId);
    return doc ? (doc.name.zh ?? doc.name.ja) : (r.trip?.line ?? '').split('（')[0];
  };
  const parts: string[] = [];
  j.rides.forEach((r, i) => {
    if (i > 0) parts.push(placeName(j.rides[i - 1].to, net, data));
    parts.push(lineName(r));
  });
  return parts.join(' → ');
}

/** 這段的步行：走到上車點＋下車走到終點＋所有轉乘步行（spec §6.4） */
const totalWalk = (c: Candidate) => c.access + c.egress + (c.transfers ?? []).reduce((s, t) => s + t.walkMinutes, 0);

function alternativeOf(c: Candidate, rides: TransitRide[], a: Endpoint, b: Endpoint, ctx: LegContext): LegAlternative | null {
  const { journey: j, net } = c;
  if (!j || !net) return null;
  return {
    path: { rides: pathOf(j), from: a.id, to: b.id },
    summary: summaryOf(j, net, ctx.data),
    arrive: fromMinutes(c.arrive),
    minutes: c.arrive - ctx.depart,
    waitMinutes: Math.max(0, c.wait),
    walkMinutes: totalWalk(c),
    ridesCount: c.rides.length,
    rides,
    transfers: c.transfers ?? [],
  };
}

function toTrip(c: Candidate, a: Endpoint, b: Endpoint): TripRef {
  return {
    id: c.rides[0].tripId ?? '',
    depart: c.rides[0].depart,
    arrive: c.rides[c.rides.length - 1].arrive,
    from: a.id,
    to: b.id,
    rides: c.rides.map((r) => r.tripId ?? ''),
    // 近鐵轉乘：轉乘站（換班次時不變）
    ...(c.pair && c.rides.length === 2 ? { via: c.rides[0].to } : {}),
  };
}

export interface RideDeparture {
  tripId: string;
  /** 路線或車種，例如「特急（往賢島）」「伊勢鳥羽線（往鳥羽バスセンター）」 */
  line: string;
  depart: TimeString;
  /** 這一程下車站的到站時間 */
  arrive: TimeString;
}

/**
 * 一程（ride.from → ride.to）那天的所有班次，依發車排序（班次表、選班次用）。只列同一對站：
 * 近鐵是兩站間的直達車（不轉乘、不含固定停駛的しまかぜ）；巴士、船、JR 是 ride.routeId 那條路線、同一個上下車停留所的班次。
 * 查不到回傳 []
 */
export function rideDepartures(data: EngineData, cfg: EngineConfig, date: DateString, ride: TransitRide): RideDeparture[] {
  if (ride.routeId) {
    const doc = (data.routes ?? []).find((r) => r.id === ride.routeId);
    if (!doc) return [];
    return routeRides([doc], ride.from, ride.to, date, '00:00', cfg.holidays)
      .filter((r) => r.fromStopName === ride.from && r.toStopName === ride.to)
      .map((r) => ({ tripId: r.tripId, line: `${r.line}（往${r.headsign}）`, depart: r.dep, arrive: r.arr }));
  }
  if (ride.mode !== 'train') return [];
  return directOn(ride.from, ride.to, 0, { date, data, cfg }).map((r) => ({
    tripId: r.trainNo,
    line: trainLine(r, data),
    depart: fromMinutes(r.dep),
    arrive: fromMinutes(r.arr),
  }));
}

/** 同一對上下車點（同一種車、同一個上車點、同一個下車點） */
const samePoints = (x: Candidate, c: Candidate) => x.mode === c.mode && x.rides[0].from === c.rides[0].from && x.rides[x.rides.length - 1].to === c.rides[c.rides.length - 1].to;

/** 前一班最多往前找幾分 */
const PREV_WINDOW = 180;

/**
 * c 的前一班、後一班（同一對上下車點）。每段大眾運輸都要算，所以只查 c 那對車站或停留所：
 * 近鐵：後一班＝c 發車後 1 分起最早到的；前一班＝A 站發車時刻由晚往早試，第一個發車早於 c 的。
 * 路線：整天的班次已經排好，直接取 c 前後那班。前一班只找 PREV_WINDOW 分內
 */
function neighbours(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): { prev: Candidate | null; next: Candidate | null } {
  if (c.pair) {
    const tt = ctx.data.kintetsu;
    if (!tt) return { prev: null, next: null };
    const p = c.pair;
    const query = (after: number) => ({ from: p.from, to: p.to, date: ctx.date, after, holidays: ctx.cfg.holidays, allowExpress: ctx.cfg.transit.allowExpress, minTransfer: ctx.cfg.transit.minTransfer });
    const at = (after: number) => {
      const legs = earliestTrain(tt, query(after));
      return legs && trainCandidate(legs, p, after, ctx);
    };
    const next = at(c.dep + 1);
    let prev: Candidate | null = null;
    const deps = departuresFrom(tt, query(0)).filter((t) => t < c.dep && t >= c.dep - PREV_WINDOW);
    for (let i = deps.length - 1; i >= 0 && !prev; i--) {
      const x = at(deps[i]);
      if (x && x.dep < c.dep) prev = x;
    }
    return { prev, next };
  }
  const same = routeCandidates(a, b, ctx, factor, () => 0).cands.filter((x) => samePoints(x, c));
  let prev: Candidate | null = null;
  let next: Candidate | null = null;
  for (const x of same) {
    if (x.dep < c.dep && x.dep >= c.dep - PREV_WINDOW && (!prev || x.dep > prev.dep)) prev = x;
    if (x.dep > c.dep && (!next || x.dep < next.dep)) next = x;
  }
  return { prev, next };
}

// --- 計程車 -----------------------------------------------------------------

/**
 * roadMeters：實際開車距離（EngineData.driveMeters），沒有時用直線 × roadDetour；
 * roadMinutes：實際開車時間（EngineData.driveMinutes），有就用它，沒有時用距離 ÷ kmPerHour。都再加 overheadMinutes（預設 0）
 */
export function taxiEstimate(
  a: LonLat,
  b: LonLat,
  party: PartyProfile,
  cfg: EngineConfig,
  roadMeters?: number | null,
  roadMinutes?: number | null,
): { minutes: number; meters: number; taxi: TaxiInfo } {
  const t = cfg.taxi;
  const meters = roadMeters ?? haversineMeters(a, b) * t.roadDetour;
  const minutes = t.overheadMinutes + (roadMinutes ?? (meters / 1000 / t.kmPerHour) * 60);
  const cars = Math.ceil(party.size / t.carCapacity);
  const jumboCars = Math.ceil(party.size / t.jumboCapacity);
  const fare =
    t.stepMeters != null && t.stepYen != null ? t.baseYen + Math.ceil(Math.max(0, meters - t.baseMeters) / t.stepMeters) * t.stepYen : null;
  const note =
    `${party.size} 人：一般計程車 ${cars} 台，或大型計程車（${t.jumboCapacity} 人座）${jumboCars} 台；` +
    (fare != null ? `每台約 ${fare.toLocaleString('en-US')} 円（估算）` : `每台起跳 ${t.baseYen} 円（大型 ${t.jumboBaseYen} 円），加算費率未查`);
  return { minutes, meters, taxi: { cars, jumboCars, fareFromYen: t.baseYen, fareEstimateYen: fare, note } };
}

// --- 主程式 -----------------------------------------------------------------

function leg(partial: Partial<Leg> & Pick<Leg, 'mode' | 'minutes' | 'basis'>, a: Endpoint, b: Endpoint, depart: number): Leg {
  const minutes = round(partial.minutes);
  return {
    from: a.id,
    to: b.id,
    depart: fromMinutes(depart),
    arrive: fromMinutes(depart + minutes),
    walkMinutes: 0,
    waitMinutes: 0,
    rides: [],
    trip: null,
    prevTrip: null,
    nextTrip: null,
    transitAvailable: false,
    taxi: null,
    specified: false,
    ...partial,
    minutes,
  };
}

/**
 * 搭 c 的一段：等車＝發車 −（出發＋走到上車點）；附上這班、前一班、後一班。
 * 趕不上 c（選定的班次）時：等車 0，時間照「走到上車點後搭同一程」算（走路＋車程＋下車走路），不會少於走路、不會是負的。
 * alts：RAPTOR 的其他走法（依 pickDefault 的值排序），c 放第一個，最多 maxAlternatives 條
 */
function fromCandidate(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, warnings: LegWarning[], alts: readonly Candidate[] = []): Leg {
  // 前一班、後一班：只有舊的 tripLeg 解讀得了的走法才給（spec §6.6）
  const { prev, next } = c.legacy === false ? { prev: null, next: null } : neighbours(c, a, b, ctx, factor);
  const wait = c.dep - (ctx.depart + c.access);
  const transfers = c.transfers ?? c.rides.slice(1).map(() => legTransfer(0, null, factor));
  const max = legWalkMax(ctx.whole, ctx.cfg);
  // 轉乘步行不受單段步行上限管（站內轉乘躲不掉），超過時提醒
  for (const t of transfers) if (t.walkMinutes > max) warnings.push({ code: 'transfer-walk', level: 'info', message: `轉乘要走 ${t.walkMinutes} 分` });
  const rides = withMissed(c, ctx, factor);
  const alternatives = c.journey
    ? [c, ...alts.filter((x) => x !== c)]
        .slice(0, ctx.cfg.transit.maxAlternatives)
        .map((x) => alternativeOf(x, x === c ? rides : withMissed(x, ctx, factor), a, b, ctx))
        .filter((x): x is LegAlternative => !!x)
    : undefined;
  return leg(
    {
      mode: c.mode,
      // c.arrive − c.dep＝車程＋下車後走路
      minutes: wait >= 0 ? c.arrive - ctx.depart : c.access + (c.arrive - c.dep),
      // 合計＝兩段步行（各自進位）＋轉乘步行，和畫面上分開寫的一致
      walkMinutes: c.access + c.egress + transfers.reduce((s, t) => s + t.walkMinutes, 0),
      waitMinutes: Math.max(0, wait),
      rides,
      walkBefore: c.access,
      walkAfter: c.egress,
      ready: c.ready
        ? c.ready.map(fromMinutes)
        : c.rides.map((_, i) => fromMinutes(i === 0 ? ctx.depart + c.access : toMinutes(c.rides[i - 1].arrive) + ctx.cfg.transit.minTransfer)),
      transfers,
      ...(alternatives ? { alternatives } : {}),
      // 舊的 tripLeg 解讀不了的走法（含班距型、近鐵接巴士）沒有 trip（換班次會被解讀成別的走法）
      trip: c.legacy === false ? null : toTrip(c, a, b),
      prevTrip: prev && toTrip(prev, a, b),
      nextTrip: next && toTrip(next, a, b),
      basis: c.basis,
    },
    a,
    b,
    ctx.depart,
  );
}

const best = (cs: Candidate[]) => cs.reduce<Candidate | null>((m, c) => (!m || c.arrive < m.arrive ? c : m), null);

/** 計程車、包車的車程：OSRM 的開車時間 → OSRM 的距離 ÷ 速度 → 直線估算 */
function drive(a: LonLat, b: LonLat, ctx: LegContext) {
  const road = ctx.data.driveMeters?.(a, b) ?? null;
  const roadMinutes = ctx.data.driveMinutes?.(a, b) ?? null;
  return { road, roadMinutes, ...taxiEstimate(a, b, ctx.party, ctx.cfg, road, roadMinutes) };
}

/** 從 a 到 b 的一段交通；spec 是使用者指定的方式 */
export function planLeg(a: Endpoint, b: Endpoint, ctx: LegContext, spec?: TravelSpec | null): { leg: Leg; warnings: LegWarning[] } {
  const { cfg, party } = ctx;
  const warnings: LegWarning[] = [];
  const factor = walkFactor(party, ctx.whole, cfg);
  const walk = walkMinutes(a, b, factor, ctx.data, cfg);
  const same = !!((a.id && a.id === b.id) || (a.id == null && b.id == null && a.coords && b.coords && haversineMeters(a.coords, b.coords) < 1));
  // 出發後還有沒有電車、巴士、船（不管等多久）：沒有時規劃模式的「大眾運輸」灰掉
  const transitAvailable = !same && transitExists(a, b, ctx, factor);
  const done = (l: Leg) => ({ leg: { ...l, transitAvailable }, warnings });
  // 選定的班次：起訖點和選的時候一樣才用；換了順序（起訖點不同）就當作沒選
  const trip = spec?.trip && spec.trip.from === a.id && spec.trip.to === b.id ? spec.trip : null;

  if (spec?.mode) return done(specifiedLeg(a, b, ctx, { ...spec, mode: spec.mode }, trip, walk?.minutes ?? null, factor, warnings));
  // 只填分鐘：方式自動，時間用填的
  if (spec?.minutes != null) {
    const auto: LegWarning[] = [];
    // 自動那段的步驟資料（walkBefore、walkAfter、ready）也不帶
    const { walkBefore: _wb, walkAfter: _wa, ready: _r, ...l } = autoLeg(a, b, ctx, walk, factor, same, auto);
    const minutes = round(spec.minutes);
    // 時間是使用者填的：不帶自動那段的班次，步行分鐘看最後的方式，也不再報「算不出交通」
    const walkMinutes = l.mode === 'walk' ? minutes : 0;
    warnings.push(...auto.filter((w) => w.code !== 'travel-unknown'));
    return done({ ...l, minutes, arrive: fromMinutes(ctx.depart + minutes), walkMinutes, waitMinutes: 0, rides: [], trip: null, prevTrip: null, nextTrip: null, specified: true, basis: '指定' });
  }
  if (trip) {
    const l = tripLeg(a, b, ctx, trip, factor, warnings, () => true);
    if (l) return done({ ...l, specified: true });
  }
  return done(autoLeg(a, b, ctx, walk, factor, same, warnings));
}

/**
 * 用選定的班次（第一程 tripId 相同）；時刻表裡找不到回傳 null（當作沒選）。趕不上照樣用，加 missed-trip 警告。
 * trip.via（近鐵轉乘站）：照 via 直接組兩程（viaCandidate），不重新推轉乘站。
 * 沒有 via 的：照第一程找候選；trip.rides 有第 2 程以後的，後面每一程換成指定的那班，接不上改同一對站接得上的最早一班（chainTrains）
 */
function tripLeg(a: Endpoint, b: Endpoint, ctx: LegContext, trip: TripRef, factor: number, warnings: LegWarning[], keep: (c: Candidate) => boolean): Leg | null {
  if (typeof trip.id !== 'string' || !trip.id || typeof trip.depart !== 'string') return null;
  const at = toMinutes(trip.depart);
  if (!Number.isFinite(at)) return null;
  const wanted = Array.isArray(trip.rides) && trip.rides.length > 1 ? trip.rides : null;
  let c: Candidate | null;
  if (typeof trip.via === 'string' && trip.via) {
    const w: LegWarning[] = [];
    c = viaCandidate(a, b, ctx, factor, trip.rides?.[0] ?? trip.id, trip.rides?.[1], trip.via, at, w);
    if (c && !keep(c)) c = null;
    if (c) warnings.push(...w);
  } else {
    c = best(legacySearchTransit(a, b, ctx, factor, () => at).cands.filter((x) => x.rides[0].tripId === trip.id && keep(x) && (!wanted || !x.trains || x.trains.length > 1)));
    if (c && wanted && c.trains && c.pair && c.trains.length > 1) c = trainCandidate(chainTrains(c.trains, wanted, ctx, warnings), c.pair, at, ctx);
  }
  if (!c) return null;
  if (c.dep < ctx.depart + c.access) warnings.push({ code: 'missed-trip', level: 'warning', message: `趕不上 ${c.rides[0].depart} 這班` });
  busCrowd(c, ctx, warnings);
  return fromCandidate(c, a, b, ctx, factor, warnings);
}

/** 方式自動：同一點 → 不用移動；走得到 → 走路；合規則的大眾運輸；都不行 → 計程車 */
function autoLeg(a: Endpoint, b: Endpoint, ctx: LegContext, walk: { minutes: number; basis: string } | null, factor: number, same: boolean, warnings: LegWarning[]): Leg {
  const { cfg } = ctx;
  if (same) return leg({ mode: 'none', minutes: 0, basis: '同一個地點' }, a, b, ctx.depart);
  if (!walk) {
    warnings.push({ code: 'travel-unknown', level: 'error', message: '缺座標，算不出交通時間' });
    return leg({ mode: 'unknown', minutes: 0, basis: '缺座標' }, a, b, ctx.depart);
  }

  const max = legWalkMax(ctx.whole, cfg);
  const sea = crossesSea(a, b, cfg);
  if (walk.minutes <= max && !sea) {
    return leg({ mode: 'walk', minutes: walk.minutes, walkMinutes: round(walk.minutes), basis: `步行 ${walk.basis}` }, a, b, ctx.depart);
  }

  // RAPTOR 的走法，依 pickDefault 的值排序（第一個是預設那條）
  const found = raptorCandidates(a, b, ctx, factor, ctx.depart);

  if (sea) {
    const ferry = found.cands[0] ?? null;
    if (ferry) {
      if (ferry.wait > cfg.transit.busMaxWait) warnings.push({ code: 'long-wait', level: 'info', message: `等船 ${ferry.wait} 分` });
      return fromCandidate(ferry, a, b, ctx, factor, warnings, found.cands);
    }
    warnings.push({
      code: found.missedLast ? 'missed-last' : 'travel-unknown',
      level: 'error',
      message: found.missedLast ? '錯過末班船：這個時間以後沒有船' : '離島只能搭船，但找不到船班',
    });
    return leg({ mode: 'unknown', minutes: 0, basis: '找不到船班' }, a, b, ctx.depart);
  }

  // 第一程是巴士：等 20 分內、不是 1 小時以上才一班（§5.4 ①）；電車、船：等 trainMaxWait 分內。都要比走路早到。
  // 中間轉乘的等車不另外設限；預設那條不合規則時，照 pickDefault 的順序看下一條
  const walkArrive = ctx.depart + round(walk.minutes);
  const firstBus = (c: Candidate) => c.rides[0]?.mode === 'bus';
  const ok = (c: Candidate) => {
    const wait = c.ruleWait ?? c.wait;
    return (
      c.arrive < walkArrive &&
      (firstBus(c)
        ? wait <= cfg.transit.busMaxWait && c.headway != null && c.headway < cfg.transit.busMinHeadwayInfrequent
        : wait <= cfg.transit.trainMaxWait)
    );
  };
  let chosen = found.cands.find(ok) ?? null;
  let cands = found.cands;
  // 預設那幾條都不合規則：換上車點、不搭那條線再找（舊的寫法每對上下車點都有候選）
  if (!chosen && cands.some((c) => c.arrive < walkArrive)) ({ chosen, cands } = fallbackCandidates(a, b, ctx, factor, cands, ok));
  const name = (c: Candidate) => (firstBus(c) ? '巴士' : c.rides[0]?.mode === 'ferry' ? '船' : '電車');
  if (chosen) {
    busCrowd(chosen, ctx, warnings);
    if (chosen.wait > cfg.transit.busMaxWait) warnings.push({ code: 'long-wait', level: 'info', message: `等${name(chosen)} ${chosen.wait} 分` });
    return fromCandidate(chosen, a, b, ctx, factor, warnings, cands);
  }

  // 有車但不合規則：寫進理由
  const rejected = found.cands.find((c) => c.arrive < walkArrive) ?? null;
  if (rejected) {
    const why =
      firstBus(rejected) && rejected.wait <= cfg.transit.busMaxWait ? '1 小時以上才一班' : `要等 ${rejected.wait} 分`;
    warnings.push({ code: firstBus(rejected) ? 'bus-infrequent' : 'long-wait', level: 'info', message: `${name(rejected)}${why}，改搭計程車` });
  }
  if (found.missedLast) {
    warnings.push({ code: 'missed-last', level: 'warning', message: '這個時間以後沒有電車或巴士了（錯過末班車），改搭計程車' });
  }
  if (!isLonLat(a.coords) || !isLonLat(b.coords) || haversineMeters(a.coords, b.coords) / 1000 > cfg.taxi.maxKm) {
    warnings.push({ code: 'travel-unknown', level: 'error', message: '距離太遠，找不到時刻表裡的交通方式；請用 travel 指定（參考 data/access/）' });
    return leg({ mode: 'unknown', minutes: 0, basis: '找不到交通方式' }, a, b, ctx.depart);
  }
  const t = drive(a.coords, b.coords, ctx);
  warnings.push({ code: 'taxi', level: 'info', message: t.taxi.note });
  const basis = t.roadMinutes != null ? '計程車（osrm 時間）' : `計程車估算（${t.road != null ? 'osrm' : '直線'}，${cfg.taxi.kmPerHour} km/h）`;
  return leg({ mode: 'taxi', minutes: t.minutes, taxi: t.taxi, basis }, a, b, ctx.depart);
}

/** 路線巴士不能預約：人多時提醒可能擠不上同一班 */
function busCrowd(c: Candidate, ctx: LegContext, warnings: LegWarning[]): void {
  if (c.rides.some((r) => r.mode === 'bus') && ctx.party.size >= ctx.cfg.transit.busCrowdSize) {
    warnings.push({ code: 'bus-crowd', level: 'warning', message: `路線巴士不能預約，${ctx.party.size} 人可能擠不上同一班` });
  }
}

function specifiedLeg(
  a: Endpoint,
  b: Endpoint,
  ctx: LegContext,
  spec: TravelSpec & { mode: TravelMode },
  trip: TripRef | null,
  walk: number | null,
  factor: number,
  warnings: LegWarning[],
): Leg {
  const base = { specified: true };
  if (spec.minutes != null) {
    return leg({ ...base, mode: spec.mode, minutes: spec.minutes, walkMinutes: spec.mode === 'walk' ? spec.minutes : 0, basis: '指定' }, a, b, ctx.depart);
  }
  if (spec.mode === 'walk') {
    if (walk == null) warnings.push({ code: 'travel-unknown', level: 'error', message: '缺座標，算不出步行時間' });
    return leg({ ...base, mode: 'walk', minutes: walk ?? 0, walkMinutes: round(walk ?? 0), basis: '指定步行' }, a, b, ctx.depart);
  }
  if (spec.mode === 'transit' || spec.mode === 'train' || spec.mode === 'bus' || spec.mode === 'ferry') {
    // transit：電車、巴士、船都可以，不套等車、班距的規則；舊的 train／bus／ferry 只找那一種
    // 舊的方式：每一程都是那種（班距型算 train），近鐵接巴士不算 bus
    const keep = (c: Candidate) => spec.mode === 'transit' || c.rides.every((r) => r.mode === spec.mode);
    if (trip) {
      const l = tripLeg(a, b, ctx, trip, factor, warnings, keep);
      if (l) return { ...l, ...base };
    }
    const found = raptorCandidates(a, b, ctx, factor, ctx.depart, spec.mode === 'transit' ? undefined : spec.mode);
    const kept = found.cands.filter(keep);
    const c = kept[0] ?? null;
    if (c) {
      busCrowd(c, ctx, warnings);
      return { ...fromCandidate(c, a, b, ctx, factor, warnings, kept), ...base };
    }
    if (spec.mode === 'transit') {
      warnings.push(
        found.missedLast
          ? { code: 'missed-last', level: 'error', message: '這個時間以後沒有電車、巴士或船了（錯過末班車）' }
          : { code: 'travel-unknown', level: 'error', message: '這兩點之間時刻表裡沒有電車、巴士或船；請改方式或填 minutes' },
      );
      return leg({ ...base, mode: 'unknown', minutes: 0, basis: '找不到班次' }, a, b, ctx.depart);
    }
    warnings.push({ code: 'travel-unknown', level: 'error', message: `指定的交通（${spec.mode}）在時刻表裡找不到班次；請填 minutes` });
    return leg({ ...base, mode: spec.mode, minutes: 0, basis: '找不到班次' }, a, b, ctx.depart);
  }
  if (!isLonLat(a.coords) || !isLonLat(b.coords)) {
    warnings.push({ code: 'travel-unknown', level: 'error', message: '缺座標，算不出交通時間；請填 minutes' });
    return leg({ ...base, mode: spec.mode, minutes: 0, basis: '缺座標' }, a, b, ctx.depart);
  }
  const t = drive(a.coords, b.coords, ctx);
  if (spec.mode === 'taxi') warnings.push({ code: 'taxi', level: 'info', message: t.taxi.note });
  const basis = t.roadMinutes != null ? '車程（osrm 時間）' : t.road != null ? '車程估算（osrm）' : '車程估算';
  return leg({ ...base, mode: spec.mode, minutes: t.minutes, taxi: spec.mode === 'taxi' ? t.taxi : null, basis }, a, b, ctx.depart);
}
