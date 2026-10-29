// 兩點之間：依 CONVENTIONS §5.4 選交通方式，算時間（不加緩衝）。
// 步行 ≤ 單段上限 → 走路；否則找近鐵、巴士、定期船（巴士要等 20 分內、不是 1 小時以上才一班）；
// 都不行 → 計程車（有 OSRM 開車時間用它，沒有照距離估算）。離島只能搭船。
// 指定 transit：一定搭大眾運輸；指定走法（TravelSpec.path）：照那條走法搭最早接得上的班。舊的選定班次（TravelSpec.trip）忽略（T29b）。
// rideDepartures：一程（同一對站）那天的所有班次，給班次表用（只能看）。
// T29：大眾運輸用 RAPTOR（raptor/），可以轉乘多次、含大阪的班距型路線。

import type { EngineConfig } from './config.ts';
import type { EngineData, PlaceRecord, RouteTimetable, UrbanTransfer } from './data.ts';
import { estimateWalk, haversineMeters, isLonLat, minutesForMeters } from './geo.ts';
import { directTrains, routeRides, type TrainRide } from './transit.ts';
import { fromMinutes, toMinutes } from './time.ts';
import { isTicketRide } from './ticket.ts';
import type { DateString, EngineWarning, Leg, LegAlternative, LegTransfer, LonLat, PartyProfile, PathRef, TaxiInfo, TimeString, TransitRide, TravelMode, TravelSpec } from './types.ts';
import { buildNetwork, KINTETSU, routeFare, type Network } from './raptor/network.ts';
import { egressSet, nextDeparture, searchJourneys, type Access, type Journey, type JourneyRide, type SearchQuery } from './raptor/search.ts';
import { evaluatePath, ifMissed, pathOf } from './raptor/path.ts';

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
  /** RAPTOR 的走法 */
  journey: Journey;
  net: Network;
  /** 轉乘步行（rides.length − 1 個） */
  transfers: LegTransfer[];
  /** 每一程走到上車點／轉乘完的時間（分鐘） */
  ready: number[];
  /** 套等車規則用的等車（沒有就是 wait）：第一程是班距型的只看班距型本身的等車 */
  ruleWait?: number;
}

/** 班距型那程的等車（全員整個班距、分組一半，向上取整） */
const headwayWaitOf = (r: JourneyRide, whole: boolean) => Math.ceil(whole ? (r.headway?.min ?? 0) : (r.headway?.min ?? 0) / 2);

function stationName(id: string, data: EngineData): string {
  return (data.getPlace(id)?.record.name.ja as string | undefined) ?? id;
}

/** 近鐵一程的車種和終點，例如「特急（往賢島）」 */
const trainLine = (r: TrainRide, data: EngineData) => `${r.type}（往${stationName(r.to, data)}）`;

/** 近鐵 from → to 那天的直達車（不轉乘、不含固定停駛的），after 以後發車，依發車排序 */
function directOn(from: string, to: string, after: number, ctx: Pick<LegContext, 'date' | 'data' | 'cfg'>): TrainRide[] {
  const tt = ctx.data.kintetsu;
  if (!tt) return [];
  return directTrains(tt, { from, to, date: ctx.date, after, holidays: ctx.cfg.holidays, allowExpress: ctx.cfg.transit.allowExpress }).filter((r) => !r.off);
}

/** 離島和其他地方之間：只能搭船 */
function crossesSea(a: Endpoint, b: Endpoint, cfg: EngineConfig): boolean {
  return regionOf(a) !== regionOf(b) && (isIsland(a, cfg) || isIsland(b, cfg));
}

// --- RAPTOR（T29，spec §6.2～§6.4） --------------------------------------------

// 同一個網路、同一個端點、同樣的係數只找一次上下車點（每段交通要查好幾次）。
// 步行分鐘用到 getPlace（車站的 anchors）、walkMeters（OSRM 快取），這兩個函式換了（網站每次編輯都建新的 EngineData）就重找；
// 端點的資料（e.record）換了也重找
interface AccessMemo {
  getPlace: EngineData['getPlace'];
  walkMeters: EngineData['walkMeters'];
  byKey: Map<string, { record: PlaceRecord | null; out: Access[] }>;
}
const accessMemo = new WeakMap<Network, AccessMemo>();

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
  let m = accessMemo.get(net);
  if (!m || m.getPlace !== ctx.data.getPlace || m.walkMeters !== ctx.data.walkMeters) {
    accessMemo.set(net, (m = { getPlace: ctx.data.getPlace, walkMeters: ctx.data.walkMeters, byKey: new Map() }));
  }
  const hit = m.byKey.get(key);
  if (hit && hit.record === e.record) return hit.out;
  const out = findAccess(e, ctx, factor, net, max);
  m.byKey.set(key, { record: e.record, out });
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
  const cands = byDefault(js, ctx.cfg).map((j) => journeyCandidate(j, net, departMinutes, ctx, factor, q.targets));
  const missedLast = !cands.length && searchJourneys(net, { ...q, depart: 0 }, ctx.cfg).length > 0;
  return { cands, missedLast };
}

/** 網路裡交通方式不是 mode 的 group（班距型算 train） */
function groupsNot(net: Network, mode: 'train' | 'bus' | 'ferry'): string[] {
  const out = new Set<string>();
  for (const r of net.routes) if ((r.kind === 'headway' ? 'train' : r.mode) !== mode) out.add(r.group);
  return [...out];
}

/** 最多再找幾次（只在預設那幾條都不合規則時才找）：每個上車點各一次、不搭某條線的各自算 */
const FALLBACK_MAX = 12;
const EXCLUDE_MAX = 6;

/**
 * 預設那幾條都不合規則（ok）時再找別的：RAPTOR 每種程數只給最早到的一條，舊的寫法每對上下車點、每個路線檔各有候選，
 * 晚一點到但等得短的會被蓋掉（例如最近那站要等 40 分、遠一點那站或另一條線只要等 10 分）。
 * 1. 每個上車點各找一次（最多 FALLBACK_MAX 次）；2. 不搭不合規則那條的第一程那條線（group），至少 EXCLUDE_MAX 次
 *（分開算：上車點多的時候（例如伊勢市駅前一帶 10 幾個停留所），第 1 步會用完次數，不搭那條線就沒機會找）。
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
      .map((j) => (seen.add(sig(j)), journeyCandidate(j, net, ctx.depart, ctx, factor, q.targets)));
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
  // 第 1 步沒用完的次數也給第 2 步，至少 EXCLUDE_MAX 次
  const budget = Math.max(EXCLUDE_MAX, FALLBACK_MAX - runs);
  for (let n = 0; n < budget; n++) {
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

// 路線檔的 ID → 檔案（每份路線檔整理一次）
const docsMemo = new WeakMap<readonly RouteTimetable[], Map<string, RouteTimetable>>();

function routeDoc(data: EngineData, id: string | null): RouteTimetable | null {
  if (id == null || !data.routes) return null;
  let m = docsMemo.get(data.routes);
  if (!m) docsMemo.set(data.routes, (m = new Map(data.routes.map((d) => [d.id, d]))));
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

/** RAPTOR 的走法 → 候選。targets：搜尋的下車點（巴士班距用） */
function journeyCandidate(j: Journey, net: Network, departMinutes: number, ctx: LegContext, factor: number, targets: readonly Access[]): Candidate {
  const { data, cfg } = ctx;
  const first = j.rides[0];
  const ferry = j.rides.some((r) => r.route.kind === 'timetable' && r.route.mode === 'ferry');
  const mode = ferry ? 'ferry' : first.route.kind === 'timetable' ? first.route.mode : 'train';
  const access = j.origin.walk;
  const egress = j.target.walk;
  const transfers = j.transfers.map((t) => legTransfer(t.walk, t.transfer, factor));
  const ready = j.rides.map((_, i) => (i === 0 ? departMinutes + access : j.rides[i - 1].arr + Math.max(cfg.transit.minTransfer, transfers[i - 1].walkMinutes)));
  // 第一程是巴士：同一條路線、同一個上車停留所、到得了任一個下車點（或這程的下車點）的下一班的發車差
  // （照舊的 routeCandidates；不是 1 小時以上才一班才搭）；班距型用班距
  let headway: number | null = null;
  if (first.route.kind === 'timetable' && first.route.mode === 'bus') {
    const alight = egressSet(net, targets).add(first.to);
    const next = nextDeparture(net, first.route.group, first.from, first.dep, alight);
    headway = next != null ? next - first.dep : null;
  } else if (first.headway) {
    headway = first.headway.min;
  }
  const sources = j.rides.map((r) => (r.route.kind === 'headway' ? `${r.route.routeId} 班距` : r.route.group === KINTETSU ? '近鐵時刻表' : `${r.route.routeId} 時刻表`));
  return {
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
  };
}

/** 每一程加上「錯過的話」（path.ts 的 ifMissed） */
function withMissed(c: Candidate, ctx: LegContext, factor: number): TransitRide[] {
  const { journey: j, net } = c;
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

/**
 * 給畫面的候選走法：c 放第一個，其他照 alts 的順序；同一條走法（每一程的線、上下車點一樣，pathOf）、
 * 摘要一樣的只留前面那條（例如 pathLeg 選的那條，raptorCandidates 又找到一次；不同上車點搭同一條線），最多 maxAlternatives 條
 */
function distinctAlternatives(c: Candidate, alts: readonly Candidate[], ctx: LegContext): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const x of [c, ...alts]) {
    const { journey: j, net } = x;
    const keys = [pathOf(j).map((r) => `${r.line}:${r.from}:${r.to}`).join('|'), `summary:${summaryOf(j, net, ctx.data)}`];
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(x);
    if (out.length >= ctx.cfg.transit.maxAlternatives) break;
  }
  return out;
}

function alternativeOf(c: Candidate, rides: TransitRide[], a: Endpoint, b: Endpoint, ctx: LegContext): LegAlternative {
  const { journey: j, net } = c;
  return {
    path: { rides: pathOf(j), from: a.id, to: b.id },
    summary: summaryOf(j, net, ctx.data),
    arrive: fromMinutes(c.arrive),
    minutes: c.arrive - ctx.depart,
    waitMinutes: Math.max(0, c.wait),
    walkMinutes: totalWalk(c),
    ridesCount: c.rides.length,
    rides,
    transfers: c.transfers,
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
 * 一程（ride.from → ride.to）那天的所有班次，依發車排序（班次表用）。只列同一對站：
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
    transitAvailable: false,
    taxi: null,
    specified: false,
    ...partial,
    minutes,
  };
}

/**
 * 搭 c 的一段：等車＝發車 −（出發＋走到上車點）。
 * alts：RAPTOR 的其他走法（依 pickDefault 的值排序），c 放第一個，最多 maxAlternatives 條
 */
function fromCandidate(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, warnings: LegWarning[], alts: readonly Candidate[] = []): Leg {
  const wait = c.dep - (ctx.depart + c.access);
  const { transfers } = c;
  const max = legWalkMax(ctx.whole, ctx.cfg);
  // 轉乘步行不受單段步行上限管（站內轉乘躲不掉），超過時提醒
  for (const t of transfers) if (t.walkMinutes > max) warnings.push({ code: 'transfer-walk', level: 'info', message: `轉乘要走 ${t.walkMinutes} 分` });
  const rides = withMissed(c, ctx, factor);
  // 買票站：到站到發車的空檔不到 ticketMargin 分，買票可能來不及（每個買票站一則，第一程也算）
  rides.forEach((r, i) => {
    if (!isTicketRide(rides, i) || c.ready[i] == null) return;
    const gap = toMinutes(r.depart) - c.ready[i];
    if (gap >= ctx.cfg.transit.ticketMargin) return;
    const kintetsu = r.operator === 'kintetsu';
    const station = kintetsu ? placeName(r.from, c.net, ctx.data) : r.from;
    warnings.push({ code: 'ticket-tight', level: 'warning', message: `${station}到站 ${Math.max(0, gap)} 分就發車，買${kintetsu ? '特急券' : '票'}可能來不及` });
  });
  const alternatives = distinctAlternatives(c, alts, ctx).map((x) => alternativeOf(x, x === c ? rides : withMissed(x, ctx, factor), a, b, ctx));
  return leg(
    {
      mode: c.mode,
      minutes: c.arrive - ctx.depart,
      // 合計＝兩段步行（各自進位）＋轉乘步行，和畫面上分開寫的一致
      walkMinutes: c.access + c.egress + transfers.reduce((s, t) => s + t.walkMinutes, 0),
      waitMinutes: Math.max(0, wait),
      rides,
      walkBefore: c.access,
      walkAfter: c.egress,
      ready: c.ready.map(fromMinutes),
      transfers,
      alternatives,
      basis: c.basis,
    },
    a,
    b,
    ctx.depart,
  );
}

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
  // 走到 done 時，有 path 就是選的走法這時間沒有車（pathLeg 成功會先 return）：照自動算，說明改用哪條
  let pathMissed = false;
  const done = (l: Leg) => {
    if (pathMissed) warnings.push({ code: 'path-unavailable', level: 'info', message: `選的走法這時間沒有車，改用 ${l.alternatives?.[0]?.summary ?? l.basis}` });
    return { leg: { ...l, transitAvailable }, warnings };
  };
  // 舊的選定班次（spec.trip）忽略（T29b）
  // 選定的走法（T29）：起訖點和選的時候一樣、方式沒寫或是 transit、時間不是使用者填的才用；不套等車、班距規則
  const path =
    !same && spec?.path && spec.path.from === a.id && spec.path.to === b.id && (!spec.mode || spec.mode === 'transit') && spec.minutes == null ? spec.path : null;
  if (path) {
    const l = pathLeg(a, b, ctx, path, factor, warnings);
    if (l) return done({ ...l, specified: true });
    pathMissed = true;
  }

  if (spec?.mode) return done(specifiedLeg(a, b, ctx, { ...spec, mode: spec.mode }, walk?.minutes ?? null, factor, warnings));
  // 只填分鐘：方式自動，時間用填的
  if (spec?.minutes != null) {
    const auto: LegWarning[] = [];
    // 自動那段的步驟資料（walkBefore、walkAfter、ready）也不帶
    const { walkBefore: _wb, walkAfter: _wa, ready: _r, ...l } = autoLeg(a, b, ctx, walk, factor, same, auto);
    const minutes = round(spec.minutes);
    // 時間是使用者填的：不帶自動那段的班次，步行分鐘看最後的方式，也不再報「算不出交通」
    const walkMinutes = l.mode === 'walk' ? minutes : 0;
    warnings.push(...auto.filter((w) => w.code !== 'travel-unknown'));
    return done({ ...l, minutes, arrive: fromMinutes(ctx.depart + minutes), walkMinutes, waitMinutes: 0, rides: [], specified: true, basis: '指定' });
  }
  return done(autoLeg(a, b, ctx, walk, factor, same, warnings));
}

/**
 * 照選定的走法（PathRef）算：每一程搭最早接得上的班，不套等車、班距規則。
 * 起訖的上下車點用 accessStops（和自動算一樣），每種組合各算一次取最早到的；那天沒車、站不在網路裡回傳 null（當作沒選）。
 * 其他走法（自動算的）接在 alternatives 後面，選的放第一個
 */
function pathLeg(a: Endpoint, b: Endpoint, ctx: LegContext, path: PathRef, factor: number, warnings: LegWarning[]): Leg | null {
  if (!Array.isArray(path.rides) || !path.rides.length) return null;
  const net = buildNetwork(ctx.data, ctx.cfg, ctx.date);
  const q = { whole: ctx.whole, factor };
  let j: Journey | null = null;
  const targets = accessStops(b, ctx, factor, net);
  for (const o of accessStops(a, ctx, factor, net)) {
    for (const t of targets) {
      const x = evaluatePath(net, path.rides, o, t, ctx.depart, q, ctx.cfg);
      if (x && (!j || x.arr < j.arr)) j = x;
    }
  }
  if (!j) return null;
  const c = journeyCandidate(j, net, ctx.depart, ctx, factor, targets);
  busCrowd(c, ctx, warnings);
  return fromCandidate(c, a, b, ctx, factor, warnings, raptorCandidates(a, b, ctx, factor, ctx.depart).cands);
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
  // 太遠不能搭計程車（例如伊勢市 → 大阪，特急一小時一班）：不合等車規則也照樣搭，不當成「找不到交通」
  const tooFar = !isLonLat(a.coords) || !isLonLat(b.coords) || haversineMeters(a.coords, b.coords) / 1000 > cfg.taxi.maxKm;
  // 計程車叫得到時，計程車幾點到（要用到才算）：搭 2 程以上的走法比它晚超過 transitMaxLateVsTaxi 分就不搭
  // （例如志摩的鄉下巴士 → 特急 → 巴士 14:33 才到，計程車 12:03 就到）；只搭 1 程的照舊不比，直達的電車、巴士不受影響。
  // 只比鄉下（每一程都是時刻表的）：含班距型那程的是大阪市內，照 spec §6.3 先搭地鐵、環狀線，不和計程車比
  let taxiArrive: number | null | undefined;
  const taxiAt = () => {
    if (taxiArrive === undefined) taxiArrive = tooFar ? null : ctx.depart + round(drive(a.coords as LonLat, b.coords as LonLat, ctx).minutes);
    return taxiArrive;
  };
  const lateVsTaxi = (c: Candidate) => {
    if (c.rides.length < 2 || c.rides.some((r) => r.kind === 'headway')) return 0;
    const t = taxiAt();
    return t == null ? 0 : c.arrive - t;
  };
  const ok = (c: Candidate) => {
    const wait = c.ruleWait ?? c.wait;
    return (
      c.arrive < walkArrive &&
      (firstBus(c)
        ? wait <= cfg.transit.busMaxWait && c.headway != null && c.headway < cfg.transit.busMinHeadwayInfrequent
        : wait <= cfg.transit.trainMaxWait) &&
      lateVsTaxi(c) <= cfg.transit.transitMaxLateVsTaxi
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
  if (rejected && tooFar) {
    busCrowd(rejected, ctx, warnings);
    warnings.push({ code: 'long-wait', level: 'info', message: `等${name(rejected)} ${rejected.wait} 分（太遠，不能改搭計程車）` });
    return fromCandidate(rejected, a, b, ctx, factor, warnings, found.cands);
  }
  if (rejected) {
    const wait = rejected.ruleWait ?? rejected.wait;
    const waitOk = firstBus(rejected) ? wait <= cfg.transit.busMaxWait : wait <= cfg.transit.trainMaxWait;
    const headwayOk = !firstBus(rejected) || (rejected.headway != null && rejected.headway < cfg.transit.busMinHeadwayInfrequent);
    const late = lateVsTaxi(rejected);
    if (waitOk && headwayOk && late > cfg.transit.transitMaxLateVsTaxi) {
      warnings.push({ code: 'transit-slow', level: 'info', message: `${name(rejected)}要轉 ${rejected.rides.length - 1} 次、比計程車晚 ${late} 分到，改搭計程車` });
    } else {
      const why = firstBus(rejected) && wait <= cfg.transit.busMaxWait ? '1 小時以上才一班' : `要等 ${rejected.wait} 分`;
      warnings.push({ code: firstBus(rejected) ? 'bus-infrequent' : 'long-wait', level: 'info', message: `${name(rejected)}${why}，改搭計程車` });
    }
  }
  if (found.missedLast) {
    warnings.push({ code: 'missed-last', level: 'warning', message: '這個時間以後沒有電車或巴士了（錯過末班車），改搭計程車' });
  }
  if (tooFar || !isLonLat(a.coords) || !isLonLat(b.coords)) {
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
