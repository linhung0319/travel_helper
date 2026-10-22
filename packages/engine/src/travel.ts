// 兩點之間：依 CONVENTIONS §5.4 選交通方式，算時間。
// 步行 ≤ 單段上限 → 走路；否則找近鐵、巴士、定期船（巴士要等 20 分內、不是 1 小時以上才一班）；
// 都不行 → 計程車。離島只能搭船。

import type { EngineConfig } from './config.ts';
import type { EngineData, PlaceRecord, RouteTimetable } from './data.ts';
import { estimateWalk, haversineMeters, isLonLat, minutesForMeters, nearestStations } from './geo.ts';
import { anyTrainThatDay, earliestTrain, routeRides, type RouteRide, type TrainRide } from './transit.ts';
import { fromMinutes, toMinutes } from './time.ts';
import type { DateString, EngineWarning, Leg, LonLat, PartyProfile, TaxiInfo, TransitRide, TravelSpec } from './types.ts';

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
  arrive: number;
  walk: number;
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

function trainCandidates(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): { cands: Candidate[]; missedLast: boolean } {
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
        after: ctx.depart + round(sa.walk),
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

function routeCandidates(a: Endpoint, b: Endpoint, ctx: LegContext, factor: number): { cands: Candidate[]; missedLast: boolean } {
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
    const ready = ctx.depart + round(walkOf(r.fromMeters));
    if (toMinutes(r.dep) < ready) continue;
    const next = usable.find((o: RouteRide) => o !== r && o.routeId === r.routeId && o.fromStop === r.fromStop && toMinutes(o.dep) > toMinutes(r.dep));
    const mode = r.mode === 'ferry' ? 'ferry' : r.mode === 'jr' ? 'train' : 'bus';
    cands.push({
      mode,
      arrive: toMinutes(r.arr) + round(walkOf(r.toMeters)),
      walk: walkOf(r.fromMeters) + walkOf(r.toMeters),
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

// --- 計程車 -----------------------------------------------------------------

export function taxiEstimate(a: LonLat, b: LonLat, party: PartyProfile, cfg: EngineConfig): { minutes: number; meters: number; taxi: TaxiInfo } {
  const t = cfg.taxi;
  const meters = haversineMeters(a, b) * t.roadDetour;
  const minutes = t.overheadMinutes + (meters / 1000 / t.kmPerHour) * 60;
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
    taxi: null,
    specified: false,
    ...partial,
    minutes,
  };
}

function fromCandidate(c: Candidate, a: Endpoint, b: Endpoint, ctx: LegContext): Leg {
  return leg({ mode: c.mode, minutes: c.arrive - ctx.depart, walkMinutes: round(c.walk), waitMinutes: c.wait, rides: c.rides, basis: c.basis }, a, b, ctx.depart);
}

const best = (cs: Candidate[]) => cs.reduce<Candidate | null>((m, c) => (!m || c.arrive < m.arrive ? c : m), null);

/** 從 a 到 b 的一段交通；spec 是使用者指定的方式 */
export function planLeg(a: Endpoint, b: Endpoint, ctx: LegContext, spec?: TravelSpec | null): { leg: Leg; warnings: LegWarning[] } {
  const { cfg, party } = ctx;
  const warnings: LegWarning[] = [];
  const factor = walkFactor(party, ctx.whole, cfg);
  const walk = walkMinutes(a, b, factor, ctx.data, cfg);

  if (spec) return { leg: specifiedLeg(a, b, ctx, spec, walk?.minutes ?? null, factor, warnings), warnings };

  if ((a.id && a.id === b.id) || (a.id == null && b.id == null && a.coords && b.coords && haversineMeters(a.coords, b.coords) < 1)) {
    return { leg: leg({ mode: 'none', minutes: 0, basis: '同一個地點' }, a, b, ctx.depart), warnings };
  }
  if (!walk) {
    warnings.push({ code: 'travel-unknown', level: 'error', message: '缺座標，算不出交通時間' });
    return { leg: leg({ mode: 'unknown', minutes: 0, basis: '缺座標' }, a, b, ctx.depart), warnings };
  }

  const max = legWalkMax(ctx.whole, cfg);
  const crossesSea = regionOf(a) !== regionOf(b) && (isIsland(a, cfg) || isIsland(b, cfg));
  if (walk.minutes <= max && !crossesSea) {
    return { leg: leg({ mode: 'walk', minutes: walk.minutes, walkMinutes: round(walk.minutes), basis: `步行 ${walk.basis}` }, a, b, ctx.depart), warnings };
  }

  const train = crossesSea ? { cands: [], missedLast: false } : trainCandidates(a, b, ctx, factor);
  const route = routeCandidates(a, b, ctx, factor);

  if (crossesSea) {
    const ferry = best(route.cands.filter((c) => c.mode === 'ferry'));
    if (ferry) {
      if (ferry.wait > cfg.transit.busMaxWait) warnings.push({ code: 'long-wait', level: 'info', message: `等船 ${ferry.wait} 分` });
      return { leg: fromCandidate(ferry, a, b, ctx), warnings };
    }
    warnings.push({
      code: route.missedLast ? 'missed-last' : 'travel-unknown',
      level: 'error',
      message: route.missedLast ? '錯過末班船：這個時間以後沒有船' : '離島只能搭船，但找不到船班',
    });
    return { leg: leg({ mode: 'unknown', minutes: 0, basis: '找不到船班' }, a, b, ctx.depart), warnings };
  }

  // 巴士：等 20 分內、不是 1 小時以上才一班（§5.4 ①）；電車、船：等 trainMaxWait 分內。都要比走路早到
  const walkArrive = ctx.depart + round(walk.minutes);
  const ok = (c: Candidate) =>
    c.arrive < walkArrive &&
    (c.mode === 'bus'
      ? c.wait <= cfg.transit.busMaxWait && c.headway != null && c.headway < cfg.transit.busMinHeadwayInfrequent
      : c.wait <= cfg.transit.trainMaxWait);
  const transit = [...train.cands, ...route.cands];
  const chosen = best(transit.filter(ok));
  const name = (c: Candidate) => (c.mode === 'bus' ? '巴士' : c.mode === 'ferry' ? '船' : '電車');
  if (chosen) {
    if (chosen.mode === 'bus' && party.size >= cfg.transit.busCrowdSize) {
      warnings.push({ code: 'bus-crowd', level: 'warning', message: `路線巴士不能預約，${party.size} 人可能擠不上同一班` });
    }
    if (chosen.wait > cfg.transit.busMaxWait) warnings.push({ code: 'long-wait', level: 'info', message: `等${name(chosen)} ${chosen.wait} 分` });
    return { leg: fromCandidate(chosen, a, b, ctx), warnings };
  }

  // 有車但不合規則：寫進理由
  const rejected = best(transit.filter((c) => c.arrive < walkArrive));
  if (rejected) {
    const why =
      rejected.mode === 'bus' && rejected.wait <= cfg.transit.busMaxWait ? '1 小時以上才一班' : `要等 ${rejected.wait} 分`;
    warnings.push({ code: rejected.mode === 'bus' ? 'bus-infrequent' : 'long-wait', level: 'info', message: `${name(rejected)}${why}，改搭計程車` });
  }
  if (train.missedLast || route.missedLast) {
    warnings.push({ code: 'missed-last', level: 'warning', message: '這個時間以後沒有電車或巴士了（錯過末班車），改搭計程車' });
  }
  if (!isLonLat(a.coords) || !isLonLat(b.coords) || haversineMeters(a.coords, b.coords) / 1000 > cfg.taxi.maxKm) {
    warnings.push({ code: 'travel-unknown', level: 'error', message: '距離太遠，找不到時刻表裡的交通方式；請用 travel 指定（參考 data/access/）' });
    return { leg: leg({ mode: 'unknown', minutes: 0, basis: '找不到交通方式' }, a, b, ctx.depart), warnings };
  }
  const t = taxiEstimate(a.coords, b.coords, party, cfg);
  warnings.push({ code: 'taxi', level: 'info', message: t.taxi.note });
  return { leg: leg({ mode: 'taxi', minutes: t.minutes, taxi: t.taxi, basis: `計程車估算（${cfg.taxi.kmPerHour} km/h）` }, a, b, ctx.depart), warnings };
}

function specifiedLeg(a: Endpoint, b: Endpoint, ctx: LegContext, spec: TravelSpec, walk: number | null, factor: number, warnings: LegWarning[]): Leg {
  const base = { specified: true };
  if (spec.minutes != null) {
    return leg({ ...base, mode: spec.mode, minutes: spec.minutes, walkMinutes: spec.mode === 'walk' ? spec.minutes : 0, basis: '指定' }, a, b, ctx.depart);
  }
  if (spec.mode === 'walk') {
    if (walk == null) warnings.push({ code: 'travel-unknown', level: 'error', message: '缺座標，算不出步行時間' });
    return leg({ ...base, mode: 'walk', minutes: walk ?? 0, walkMinutes: round(walk ?? 0), basis: '指定步行' }, a, b, ctx.depart);
  }
  if (spec.mode === 'train' || spec.mode === 'bus' || spec.mode === 'ferry') {
    const all = [...trainCandidates(a, b, ctx, factor).cands, ...routeCandidates(a, b, ctx, factor).cands];
    const c = best(all.filter((x) => x.mode === spec.mode));
    if (c) return { ...fromCandidate(c, a, b, ctx), ...base };
    warnings.push({ code: 'travel-unknown', level: 'error', message: `指定的交通（${spec.mode}）在時刻表裡找不到班次；請填 minutes` });
    return leg({ ...base, mode: spec.mode, minutes: 0, basis: '找不到班次' }, a, b, ctx.depart);
  }
  if (!isLonLat(a.coords) || !isLonLat(b.coords)) {
    warnings.push({ code: 'travel-unknown', level: 'error', message: '缺座標，算不出交通時間；請填 minutes' });
    return leg({ ...base, mode: spec.mode, minutes: 0, basis: '缺座標' }, a, b, ctx.depart);
  }
  const t = taxiEstimate(a.coords, b.coords, ctx.party, ctx.cfg);
  if (spec.mode === 'taxi') warnings.push({ code: 'taxi', level: 'info', message: t.taxi.note });
  return leg({ ...base, mode: spec.mode, minutes: t.minutes, taxi: spec.mode === 'taxi' ? t.taxi : null, basis: '車程估算' }, a, b, ctx.depart);
}
