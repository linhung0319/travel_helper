// 兩點之間：依 CONVENTIONS §5.4 選交通方式，算時間（不加緩衝）。
// 步行 ≤ 單段上限 → 走路；否則找近鐵、巴士、定期船（巴士要等 20 分內、不是 1 小時以上才一班）；
// 都不行 → 計程車（有 OSRM 開車時間用它，沒有照距離估算）。離島只能搭船。
// 指定 transit：一定搭大眾運輸；指定班次（TravelSpec.trip）：用那班，趕不上就警告。

import type { EngineConfig } from './config.ts';
import type { EngineData, PlaceRecord, RouteTimetable } from './data.ts';
import { estimateWalk, haversineMeters, isLonLat, minutesForMeters, nearestStations } from './geo.ts';
import { anyTrainThatDay, directTrains, earliestTrain, routeRides, type RouteRide, type TrainQuery, type TrainRide } from './transit.ts';
import { fromMinutes, toMinutes } from './time.ts';
import type { DateString, EngineWarning, Leg, LonLat, PartyProfile, TaxiInfo, TransitRide, TravelMode, TravelSpec, TripRef } from './types.ts';

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
  walk: number;
  /** 走到第一個上車點的分鐘（已進位） */
  access: number;
  /** 第一程發車（分鐘） */
  dep: number;
  /** 從搜尋的出發時間算起要等的分鐘 */
  wait: number;
  rides: TransitRide[];
  headway: number | null;
  basis: string;
}

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
      const last = legs[legs.length - 1];
      cands.push({
        mode: 'train',
        arrive: last.arr + round(sb.walk),
        walk: sa.walk + sb.walk,
        access: round(sa.walk),
        dep: legs[0].dep,
        wait: legs[0].dep - q.after,
        rides: legs.map((r: TrainRide) => ({
          mode: 'train' as const,
          line: `${r.type}（往${stationName(r.to, ctx.data)}）`,
          from: r.from,
          to: r.alight,
          depart: fromMinutes(r.dep),
          arrive: fromMinutes(r.arr),
          tripId: r.trainNo,
          fareAdult: null,
        })),
        headway: null,
        basis: '近鐵時刻表',
      });
    }
  }
  return { cands, missedLast: !cands.length && anyDay };
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
      walk: walkOf(r.fromMeters) + walkOf(r.toMeters),
      access: round(walkOf(r.fromMeters)),
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

/** 近鐵和路線時刻表的所有候選（不套等車、班距規則）；離島只看船。readyAt：走到上車點後從幾點開始找車 */
function searchTransit(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, readyAt: ReadyAt): { cands: Candidate[]; missedLast: boolean } {
  const route = routeCandidates(a, b, ctx, factor, readyAt);
  if (crossesSea(a, b, ctx.cfg)) return { cands: route.cands.filter((c) => c.mode === 'ferry'), missedLast: route.missedLast };
  const train = trainCandidates(a, b, ctx, factor, readyAt);
  return { cands: [...train.cands, ...route.cands], missedLast: train.missedLast || route.missedLast };
}

/** departMinutes 從起點出發，所有搭得到的大眾運輸候選 */
export function transitCandidates(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number, departMinutes: number) {
  return searchTransit(a, b, ctx, factor, (access) => departMinutes + access);
}

/**
 * 從 ctx.depart 出發（加上走到上車點）之後，還有沒有任何班次（不管等多久）。每段交通都要算，所以先看路線、近鐵直達，
 * 沒有直達才用比較慢的轉乘搜尋；結果和 transitCandidates(…, ctx.depart) 有沒有候選相同。離島只看船
 */
function transitExists(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): boolean {
  const sea = crossesSea(a, b, ctx.cfg);
  const routes = routeCandidates(a, b, ctx, factor, (access) => ctx.depart + access).cands;
  if (routes.some((c) => !sea || c.mode === 'ferry')) return true;
  const tt = ctx.data.kintetsu;
  if (!tt || sea) return false;
  const pairs: TrainQuery[] = [];
  for (const sa of kintetsuAccess(a, ctx, factor)) {
    for (const sb of kintetsuAccess(b, ctx, factor)) {
      if (sa.station === sb.station) continue;
      const q = { from: sa.station, to: sb.station, date: ctx.date, after: ctx.depart + round(sa.walk), holidays: ctx.cfg.holidays, allowExpress: ctx.cfg.transit.allowExpress };
      if (directTrains(tt, q).some((r) => !r.off)) return true;
      pairs.push({ ...q, minTransfer: ctx.cfg.transit.minTransfer });
    }
  }
  return pairs.some((q) => earliestTrain(tt, q) != null);
}

function toTrip(c: Candidate, a: Endpoint, b: Endpoint): TripRef {
  return { id: c.rides[0].tripId ?? '', depart: c.rides[0].depart, arrive: c.rides[c.rides.length - 1].arrive, from: a.id, to: b.id };
}

/** 同一對上下車點（同一種車、同一個上車點、同一個下車點） */
const samePoints = (x: Candidate, c: Candidate) => x.mode === c.mode && x.rides[0].from === c.rides[0].from && x.rides[x.rides.length - 1].to === c.rides[c.rides.length - 1].to;

/** 同一對上下車點、c 之後的第一班 */
function nextCandidate(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): Candidate | null {
  const later = searchTransit(a, b, ctx, factor, () => c.dep + 1).cands.filter((x) => samePoints(x, c) && x.dep > c.dep);
  return later.reduce<Candidate | null>((m, x) => (!m || x.dep < m.dep ? x : m), null);
}

/** 同一對上下車點、c 之前的最後一班：往前 15、30、60、120、180 分找，找到後再往後補到最接近 c 的那班 */
function prevCandidate(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): Candidate | null {
  for (const delta of [15, 30, 60, 120, 180]) {
    const earlier = searchTransit(a, b, ctx, factor, () => c.dep - delta).cands.filter((x) => samePoints(x, c) && x.dep < c.dep);
    let p = earlier.reduce<Candidate | null>((m, x) => (!m || x.dep > m.dep ? x : m), null);
    if (!p) continue;
    // 近鐵每對車站只回傳最早的一班：往後一班一班補，直到下一班就是 c
    for (let n = nextCandidate(p, a, b, ctx, factor); n && n.dep < c.dep; n = nextCandidate(n, a, b, ctx, factor)) p = n;
    return p;
  }
  return null;
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
 * 趕不上 c（選定的班次）時：等車 0，時間照「走到上車點後搭同一程」算（走路＋車程＋下車走路），不會少於走路、不會是負的
 */
function fromCandidate(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): Leg {
  const prev = prevCandidate(c, a, b, ctx, factor);
  const next = nextCandidate(c, a, b, ctx, factor);
  const wait = c.dep - (ctx.depart + c.access);
  return leg(
    {
      mode: c.mode,
      // c.arrive − c.dep＝車程＋下車後走路
      minutes: wait >= 0 ? c.arrive - ctx.depart : c.access + (c.arrive - c.dep),
      walkMinutes: round(c.walk),
      waitMinutes: Math.max(0, wait),
      rides: c.rides,
      trip: toTrip(c, a, b),
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
    const l = autoLeg(a, b, ctx, walk, factor, same, auto);
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

/** 用選定的班次（第一程 tripId 相同）；時刻表裡找不到回傳 null（當作沒選）。趕不上照樣用，加 missed-trip 警告 */
function tripLeg(a: Endpoint, b: Endpoint, ctx: LegContext, trip: TripRef, factor: number, warnings: LegWarning[], keep: (c: Candidate) => boolean): Leg | null {
  if (typeof trip.id !== 'string' || !trip.id || typeof trip.depart !== 'string') return null;
  const at = toMinutes(trip.depart);
  if (!Number.isFinite(at)) return null;
  const c = best(searchTransit(a, b, ctx, factor, () => at).cands.filter((x) => x.rides[0].tripId === trip.id && keep(x)));
  if (!c) return null;
  if (c.dep < ctx.depart + c.access) warnings.push({ code: 'missed-trip', level: 'warning', message: `趕不上 ${c.rides[0].depart} 這班` });
  busCrowd(c, ctx, warnings);
  return fromCandidate(c, a, b, ctx, factor);
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

  const found = transitCandidates(a, b, ctx, factor, ctx.depart);

  if (sea) {
    const ferry = best(found.cands);
    if (ferry) {
      if (ferry.wait > cfg.transit.busMaxWait) warnings.push({ code: 'long-wait', level: 'info', message: `等船 ${ferry.wait} 分` });
      return fromCandidate(ferry, a, b, ctx, factor);
    }
    warnings.push({
      code: found.missedLast ? 'missed-last' : 'travel-unknown',
      level: 'error',
      message: found.missedLast ? '錯過末班船：這個時間以後沒有船' : '離島只能搭船，但找不到船班',
    });
    return leg({ mode: 'unknown', minutes: 0, basis: '找不到船班' }, a, b, ctx.depart);
  }

  // 巴士：等 20 分內、不是 1 小時以上才一班（§5.4 ①）；電車、船：等 trainMaxWait 分內。都要比走路早到
  const walkArrive = ctx.depart + round(walk.minutes);
  const ok = (c: Candidate) =>
    c.arrive < walkArrive &&
    (c.mode === 'bus'
      ? c.wait <= cfg.transit.busMaxWait && c.headway != null && c.headway < cfg.transit.busMinHeadwayInfrequent
      : c.wait <= cfg.transit.trainMaxWait);
  const chosen = best(found.cands.filter(ok));
  const name = (c: Candidate) => (c.mode === 'bus' ? '巴士' : c.mode === 'ferry' ? '船' : '電車');
  if (chosen) {
    busCrowd(chosen, ctx, warnings);
    if (chosen.wait > cfg.transit.busMaxWait) warnings.push({ code: 'long-wait', level: 'info', message: `等${name(chosen)} ${chosen.wait} 分` });
    return fromCandidate(chosen, a, b, ctx, factor);
  }

  // 有車但不合規則：寫進理由
  const rejected = best(found.cands.filter((c) => c.arrive < walkArrive));
  if (rejected) {
    const why =
      rejected.mode === 'bus' && rejected.wait <= cfg.transit.busMaxWait ? '1 小時以上才一班' : `要等 ${rejected.wait} 分`;
    warnings.push({ code: rejected.mode === 'bus' ? 'bus-infrequent' : 'long-wait', level: 'info', message: `${name(rejected)}${why}，改搭計程車` });
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
  if (c.mode === 'bus' && ctx.party.size >= ctx.cfg.transit.busCrowdSize) {
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
    const keep = (c: Candidate) => spec.mode === 'transit' || c.mode === spec.mode;
    if (trip) {
      const l = tripLeg(a, b, ctx, trip, factor, warnings, keep);
      if (l) return { ...l, ...base };
    }
    const found = transitCandidates(a, b, ctx, factor, ctx.depart);
    const c = best(found.cands.filter(keep));
    if (c) {
      busCrowd(c, ctx, warnings);
      return { ...fromCandidate(c, a, b, ctx, factor), ...base };
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
