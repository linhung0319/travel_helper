// 多輪 RAPTOR 搜尋（T29，spec §6.2）：在一天的網路（network.ts）上找「坐 k 程最早幾點到」，
// 回傳各程數的最早到達（Pareto：到達、程數）。照走法重算、錯過的話在 path.ts。
// 規則照 transit.ts 的 earliestTrain：換車至少 minTransfer 分、到達一樣取晚出發的。

import type { EngineConfig } from '../config.ts';
import type { UrbanTransfer } from '../data.ts';
import type { TimeString } from '../types.ts';
import { headwayWait, KINTETSU, type Footpath, type HeadwayRoute, type Network, type NetRoute, type TimedTrip } from './network.ts';

/** 上下車點和走到那裡的分鐘（已套係數、已進位） */
export interface Access {
  stop: string;
  walk: number;
}

export interface JourneyRide {
  route: NetRoute;
  trip: TimedTrip | null;
  from: string;
  to: string;
  dep: number;
  arr: number;
  /** 班距型：用的班距、首末班；有時刻表的是 null */
  headway: { min: number; first: TimeString; last: TimeString } | null;
}

export interface JourneyTransfer {
  /** 已套係數、已進位；同站同 group 換車是 0（上車還是至少隔 minTransfer） */
  walk: number;
  transfer: UrbanTransfer | null;
}

export interface Journey {
  /** 第一程的上車點；起點先走一段 footpath 才上車的，步行算在這裡 */
  origin: Access;
  /** 最後一程的下車點；下車後走一段 footpath 到終點的，步行算在這裡 */
  target: Access;
  rides: JourneyRide[];
  /** rides.length - 1 個，第 i 個是第 i 程下車到第 i+1 程上車中間 */
  transfers: JourneyTransfer[];
  /** 第一程發車 */
  dep: number;
  /** 含下車步行 */
  arr: number;
}

export interface SearchQuery {
  origins: Access[];
  targets: Access[];
  depart: number;
  /** 全員（班距型等整個班距）或分組（等一半） */
  whole: boolean;
  /** 團體步行係數 */
  factor: number;
  /** 離島：只收至少有一程是船的 */
  requireFerry?: boolean;
}

/** 近鐵時刻表那一程上下車都在這幾站的不算（大阪市內用班距型的近鐵難波線，spec §6.2） */
export const OSAKA_KINTETSU = ['osaka-namba', 'osaka-uehommachi', 'tsuruhashi'];

// --- 網路的索引 ---------------------------------------------------------------

// 停靠點換成整數，搜尋時用陣列不用 Map；同一個網路只整理一次
interface Indexed {
  ids: string[];
  idx: Map<string, number>;
  /** 每個 route 的停靠點（整數） */
  stops: Int32Array[];
  at: { route: number; index: number }[][];
  /** 從這站出發的 footpath、走到這站的 footpath */
  out: { to: number; fp: Footpath }[][];
  into: { from: number; fp: Footpath }[][];
  osaka: Uint8Array;
  /** 'kintetsu' 的時刻表 route */
  kintetsu: Uint8Array;
}

const indexed = new WeakMap<Network, Indexed>();

function indexOf(net: Network): Indexed {
  let ix = indexed.get(net);
  if (ix) return ix;
  const ids = [...net.stops.keys()];
  const idx = new Map(ids.map((id, i) => [id, i]));
  // route 的停靠點都在 net.stops 裡（network.ts 建的時候補上了），保險起見補進來
  const id = (s: string) => {
    let i = idx.get(s);
    if (i == null) idx.set(s, (i = ids.push(s) - 1));
    return i;
  };
  const stops = net.routes.map((r) => Int32Array.from(r.stops, id));
  const n = () => ids.length;
  const fps: [number, number, Footpath][] = [];
  for (const [from, list] of net.footpaths) for (const fp of list) fps.push([id(from), id(fp.to), fp]);
  const at: Indexed['at'] = Array.from({ length: n() }, () => []);
  stops.forEach((st, route) => st.forEach((s, index) => at[s].push({ route, index })));
  const out: Indexed['out'] = Array.from({ length: n() }, () => []);
  const into: Indexed['into'] = Array.from({ length: n() }, () => []);
  for (const [a, b, fp] of fps) {
    out[a].push({ to: b, fp });
    into[b].push({ from: a, fp });
  }
  const osaka = new Uint8Array(n());
  for (const s of OSAKA_KINTETSU) if (idx.has(s)) osaka[idx.get(s) as number] = 1;
  const kintetsu = Uint8Array.from(net.routes, (r) => (r.kind === 'timetable' && r.group === KINTETSU ? 1 : 0));
  indexed.set(net, (ix = { ids, idx, stops, at, out, into, osaka, kintetsu }));
  return ix;
}

// --- 搜尋 ---------------------------------------------------------------------

// 同樣的查詢回傳同一個結果（規劃每次編輯都整份重算）；呼叫的人不能改回傳的陣列。
// 上限照 transit.ts 的 EARLIEST_MEMO_MAX
const memo = new WeakMap<Network, Map<string, Journey[]>>();
const MEMO_MAX = 50_000;

/** 各程數的最早到達（Pareto：到達、程數），依到達排序；到達一樣取晚出發的 */
export function searchJourneys(net: Network, q: SearchQuery, cfg: EngineConfig): Journey[] {
  let byKey = memo.get(net);
  if (!byKey) memo.set(net, (byKey = new Map()));
  const t = cfg.transit;
  const key = [
    q.origins.map((a) => `${a.stop}:${a.walk}`).join(','),
    q.targets.map((a) => `${a.stop}:${a.walk}`).join(','),
    q.depart,
    q.whole,
    q.factor,
    !!q.requireFerry,
    t.maxRides,
    t.minTransfer,
  ].join('|');
  let out = byKey.get(key);
  if (out) return out;
  if (byKey.size >= MEMO_MAX) byKey.clear();
  out = search(net, q, cfg);
  byKey.set(key, out);
  return out;
}

/** 預設那條：到達 + transferPenalty × (程數 − 1) 最小；同值取程數少的 */
export function pickDefault(js: readonly Journey[], cfg: EngineConfig): Journey | null {
  let best: Journey | null = null;
  let bestScore = Infinity;
  for (const j of js) {
    const score = j.arr + cfg.transit.transferPenalty * (j.rides.length - 1);
    if (score < bestScore || (score === bestScore && best && j.rides.length < best.rides.length)) {
      best = j;
      bestScore = score;
    }
  }
  return best;
}

// 一輪的標記：坐車到的（ride）、走 footpath 到的（foot）分開記，因為坐車到的再上車要加換車時間
interface Round {
  ride: Float64Array;
  rRoute: Int32Array;
  /** 有時刻表的：班次位置；班距型：-1 */
  rTrip: Int32Array;
  rBoard: Int32Array;
  rAlight: Int32Array;
  /** 上車那站是 footpath 到的（0）還是坐車到的（1） */
  rFrom: Uint8Array;
  /** 班距型：上車那站的發車、用的班距 */
  rDep: Float64Array;
  rHeadway: Float64Array;
  /** 從起點出發的時刻（第一程發車 − 走到上車點的步行）：到達一樣時取晚出發的 */
  rLeave: Float64Array;
  foot: Float64Array;
  fLeave: Float64Array;
  /** footpath 的起點；第 0 輪是 -1（起點） */
  fFrom: Int32Array;
  fFp: (Footpath | null)[];
}

function newRound(n: number): Round {
  return {
    ride: new Float64Array(n).fill(Infinity),
    rRoute: new Int32Array(n),
    rTrip: new Int32Array(n),
    rBoard: new Int32Array(n),
    rAlight: new Int32Array(n),
    rFrom: new Uint8Array(n),
    rDep: new Float64Array(n),
    rHeadway: new Float64Array(n),
    rLeave: new Float64Array(n),
    foot: new Float64Array(n).fill(Infinity),
    fLeave: new Float64Array(n),
    fFrom: new Int32Array(n).fill(-1),
    fFp: new Array(n).fill(null),
  };
}

/** 第一個 dep[i] ≥ t 的班次（班次 FIFO，dep[i] 遞增）；沒有回傳 trips.length */
function firstTrip(trips: TimedTrip[], i: number, t: number, hi = trips.length): number {
  let lo = 0;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (trips[m].dep[i] >= t) hi = m;
    else lo = m + 1;
  }
  return lo;
}

function search(net: Network, q: SearchQuery, cfg: EngineConfig): Journey[] {
  const ix = indexOf(net);
  const n = ix.ids.length;
  const { minTransfer, maxRides } = cfg.transit;
  const f = q.factor;
  const routes = net.routes;
  /** footpath 的步行：係數 1 的分鐘 × 係數，向上取整 */
  const walkOf = (fp: Footpath) => Math.ceil(fp.walk * f);
  /** 同站換線：同 group 是 minTransfer，其他至少 minTransfer */
  const change = (p: number, from: string, to: string) =>
    from === to ? minTransfer : Math.ceil(Math.max(minTransfer, net.sameStopChange(ix.ids[p], from, to).walk * f));

  // 第 0 輪：起點，再走一次 footpath（起點的步行不套 minTransfer）
  const rounds: Round[] = [newRound(n)];
  const r0 = rounds[0];
  let marked: number[] = [];
  const isMarked = new Uint8Array(n);
  const mark = (s: number) => {
    if (!isMarked[s]) {
      isMarked[s] = 1;
      marked.push(s);
    }
  };
  for (const o of q.origins) {
    const s = ix.idx.get(o.stop);
    if (s == null) continue;
    const at = q.depart + o.walk;
    if (at < r0.foot[s]) {
      r0.foot[s] = at;
      r0.fFrom[s] = -1;
      r0.fFp[s] = null;
      mark(s);
    }
  }
  for (const o of q.origins) {
    const s = ix.idx.get(o.stop);
    if (s == null) continue;
    for (const { to, fp } of ix.out[s]) {
      const at = q.depart + o.walk + walkOf(fp);
      if (at < r0.foot[to]) {
        r0.foot[to] = at;
        r0.fFrom[to] = s;
        r0.fFp[to] = fp;
        mark(to);
      }
    }
  }

  // 終點：下車點 → 到終點的步行（target 本身，或走一段 footpath 到 target；下車後的步行不套 minTransfer）
  const egress = new Float64Array(n).fill(Infinity);
  for (const a of q.targets) {
    const s = ix.idx.get(a.stop);
    if (s == null) continue;
    egress[s] = Math.min(egress[s], a.walk);
    for (const { from, fp } of ix.into[s]) egress[from] = Math.min(egress[from], walkOf(fp) + a.walk);
  }
  const egressStops: number[] = [];
  let minEgress = Infinity;
  for (let s = 0; s < n; s++) {
    if (egress[s] === Infinity) continue;
    egressStops.push(s);
    minEgress = Math.min(minEgress, egress[s]);
  }
  if (!egressStops.length || !marked.length) return [];

  const bestRide = new Float64Array(n).fill(Infinity);
  const bestFoot = Float64Array.from(r0.foot);
  let bestTarget = Infinity;
  const queue = new Int32Array(routes.length).fill(-1);
  const results: Journey[] = [];

  for (let k = 1; k <= maxRides && marked.length; k++) {
    const prev = rounds[k - 1];
    const cur = newRound(n);
    rounds.push(cur);
    // 被標記的停靠點經過的 route，從最前面那個標記的位置開始掃（環狀線同一站有兩個位置，取前面的）
    const scan: number[] = [];
    for (const p of marked) {
      for (const { route, index } of ix.at[p]) {
        if (queue[route] < 0) scan.push(route);
        if (queue[route] < 0 || index < queue[route]) queue[route] = index;
      }
    }
    for (const p of marked) isMarked[p] = 0;
    marked = [];
    const rideMarked: number[] = [];

    /**
     * 上一輪到 p、可以上 group 的最早時刻；fromRide：上車那站是坐車到的。
     * leaveAt：從起點出發的時刻；第一輪還沒有第一程，照上車那班的發車算（leaveOf）
     */
    let fromRide = 0;
    let readyLeave = 0;
    const ready = (p: number, group: string): number => {
      let t = prev.foot[p];
      fromRide = 0;
      readyLeave = prev.fLeave[p];
      if (prev.ride[p] < Infinity) {
        const r = prev.ride[p] + change(p, routes[prev.rRoute[p]].group, group);
        if (r < t || (r === t && prev.rLeave[p] > readyLeave)) {
          t = r;
          fromRide = 1;
          readyLeave = prev.rLeave[p];
        }
      }
      return t;
    };
    const leaveOf = (t: number, dep: number) => (k === 1 ? dep - (t - q.depart) : readyLeave);
    const label = (s: number, arr: number, route: number, trip: number, board: number, alight: number, from: number, dep: number, hw: number, leave: number) => {
      // 同一輪同時到的，取晚出發的
      const tie = arr === cur.ride[s] && leave > cur.rLeave[s];
      if ((arr >= bestRide[s] && !tie) || arr + minEgress >= bestTarget) return;
      bestRide[s] = arr;
      cur.rLeave[s] = leave;
      cur.ride[s] = arr;
      cur.rRoute[s] = route;
      cur.rTrip[s] = trip;
      cur.rBoard[s] = board;
      cur.rAlight[s] = alight;
      cur.rFrom[s] = from;
      cur.rDep[s] = dep;
      cur.rHeadway[s] = hw;
      if (!isMarked[s]) rideMarked.push(s);
      mark(s);
    };

    for (const ri of scan) {
      const start = queue[ri];
      queue[ri] = -1;
      const route = routes[ri];
      const st = ix.stops[ri];
      if (route.kind === 'timetable') {
        const trips = route.trips;
        const kin = ix.kintetsu[ri] === 1;
        let trip = -1;
        let board = -1;
        let from = 0;
        let leave = 0;
        for (let i = start; i < st.length; i++) {
          const p = st[i];
          if (trip >= 0 && !(kin && ix.osaka[p] && ix.osaka[st[board]])) {
            label(p, trips[trip].arr[i], ri, trip, board, i, from, trips[trip].dep[board], 0, leave);
          }
          if (prev.foot[p] === Infinity && prev.ride[p] === Infinity) continue;
          const t = ready(p, route.group);
          if (trip >= 0 && t > trips[trip].dep[i]) continue;
          // 早一班的就換；同一班從這站上、比較晚出發的也換
          const e = firstTrip(trips, i, t, trip >= 0 ? trip + 1 : trips.length);
          if (e >= trips.length) continue;
          const l = leaveOf(t, trips[e].dep[i]);
          if (trip < 0 || e < trip || l > leave) {
            trip = e;
            board = i;
            from = fromRide;
            leave = l;
          }
        }
      } else {
        const off = route.offsets;
        // 維持「虛擬發車 − offset」最小的上車
        let base = Infinity;
        let board = -1;
        let from = 0;
        let hw = 0;
        let leave = 0;
        for (let i = start; i < st.length; i++) {
          const p = st[i];
          if (base < Infinity) label(p, base + off[i], ri, -1, board, i, from, base + off[board], hw, leave);
          if (prev.foot[p] === Infinity && prev.ride[p] === Infinity) continue;
          const t = ready(p, route.group);
          const w = headwayWait(route.service, t, q.whole);
          if (!w) continue;
          const b = t + w.wait - off[i];
          const l = leaveOf(t, t + w.wait);
          if (b < base || (b === base && l > leave)) {
            base = b;
            board = i;
            from = fromRide;
            hw = w.headway;
            leave = l;
          }
        }
      }
    }

    // footpath：到達＋係數後的步行（坐車之後的轉乘至少 minTransfer）
    for (const s of rideMarked) {
      for (const { to, fp } of ix.out[s]) {
        const at = cur.ride[s] + Math.max(minTransfer, walkOf(fp));
        const tie = at === cur.foot[to] && cur.rLeave[s] > cur.fLeave[to];
        if (at >= bestFoot[to] && !tie) continue;
        bestFoot[to] = at;
        cur.foot[to] = at;
        cur.fLeave[to] = cur.rLeave[s];
        cur.fFrom[to] = s;
        cur.fFp[to] = fp;
        mark(to);
      }
    }

    // 終點：比前面幾輪早才收
    const cands: { s: number; arr: number; leave: number }[] = [];
    for (const s of egressStops) {
      if (cur.ride[s] < Infinity && cur.ride[s] + egress[s] < bestTarget) cands.push({ s, arr: cur.ride[s] + egress[s], leave: cur.rLeave[s] });
    }
    cands.sort((a, b) => a.arr - b.arr || b.leave - a.leave);
    for (const c of cands) {
      const j = rebuild(net, ix, rounds, k, c.s, egress[c.s], q, cfg);
      if (q.requireFerry && !j.rides.some((r) => r.route.kind === 'timetable' && r.route.mode === 'ferry')) continue;
      results.push(laterDeparture(net, ix, j, minTransfer, q.whole));
      bestTarget = c.arr;
      break;
    }
  }
  // 程數越多到得越早；依到達排序
  return results.reverse();
}

function headwayOf(route: HeadwayRoute, min: number): JourneyRide['headway'] {
  return { min, first: route.service?.first as TimeString, last: route.service?.last as TimeString };
}

/** 從第 k 輪坐車到 s 的標記倒回去，組出走法 */
function rebuild(net: Network, ix: Indexed, rounds: Round[], k: number, s: number, egressWalk: number, q: SearchQuery, cfg: EngineConfig): Journey {
  const { minTransfer } = cfg.transit;
  const rides: JourneyRide[] = [];
  const transfers: JourneyTransfer[] = [];
  let stop = s;
  let origin: Access | null = null;
  for (let r = k; r > 0; r--) {
    const R = rounds[r];
    const route = net.routes[R.rRoute[stop]];
    const st = ix.stops[R.rRoute[stop]];
    const board = st[R.rBoard[stop]];
    if (route.kind === 'timetable') {
      const trip = route.trips[R.rTrip[stop]];
      rides.unshift({ route, trip, from: ix.ids[board], to: ix.ids[stop], dep: trip.dep[R.rBoard[stop]], arr: trip.arr[R.rAlight[stop]], headway: null });
    } else {
      rides.unshift({ route, trip: null, from: ix.ids[board], to: ix.ids[stop], dep: R.rDep[stop], arr: R.ride[stop], headway: headwayOf(route, R.rHeadway[stop]) });
    }
    const P = rounds[r - 1];
    if (R.rFrom[stop] === 1) {
      // 同一站換車
      const g = net.routes[P.rRoute[board]].group;
      const c = net.sameStopChange(ix.ids[board], g, route.group);
      transfers.unshift(g === route.group ? { walk: 0, transfer: null } : { walk: Math.ceil(Math.max(minTransfer, c.walk * q.factor)), transfer: c.transfer });
      stop = board;
    } else if (r > 1) {
      const fp = P.fFp[board] as Footpath;
      transfers.unshift({ walk: Math.max(minTransfer, Math.ceil(fp.walk * q.factor)), transfer: fp.transfer });
      stop = P.fFrom[board];
    } else {
      origin = { stop: ix.ids[board], walk: P.foot[board] - q.depart };
    }
  }
  const last = rides[rides.length - 1];
  return {
    origin: origin as Access,
    target: { stop: ix.ids[s], walk: egressWalk },
    rides,
    transfers,
    dep: rides[0].dep,
    arr: last.arr + egressWalk,
  };
}

/** group 裡停 from 再停 to 的 route，ready 以後最早到 to 的那一程；沒有回傳 null */
function earliestRide(net: Network, ix: Indexed, group: string, from: string, to: string, ready: number, whole: boolean, after = -Infinity): JourneyRide | null {
  const a = ix.idx.get(from);
  const b = ix.idx.get(to);
  if (a == null || b == null) return null;
  let best: JourneyRide | null = null;
  for (const { route: ri, index: i } of ix.at[a]) {
    const route = net.routes[ri];
    if (route.group !== group) continue;
    const st = ix.stops[ri];
    let j = i + 1;
    while (j < st.length && st[j] !== b) j++;
    if (j >= st.length) continue;
    let ride: JourneyRide | null = null;
    if (route.kind === 'timetable') {
      // after：發車要晚於這個時刻（試後面的班用）
      const e = firstTrip(route.trips, i, Math.max(ready, after + 1e-9));
      if (e >= route.trips.length) continue;
      const trip = route.trips[e];
      ride = { route, trip, from, to, dep: trip.dep[i], arr: trip.arr[j], headway: null };
    } else {
      const w = headwayWait(route.service, ready, whole);
      if (!w) continue;
      const dep = ready + w.wait;
      ride = { route, trip: null, from, to, dep, arr: dep + route.offsets[j] - route.offsets[i], headway: headwayOf(route, w.headway) };
    }
    if (!best || ride.arr < best.arr || (ride.arr === best.arr && ride.dep > best.dep)) best = ride;
  }
  return best;
}

/**
 * 到達一樣取晚出發（照 earliestTrain）：同一條走法的第一程試後面的班，
 * 後面幾程照樣接最早的，仍然同時到就換成晚的。第一程是班距型的不用試。
 */
function laterDeparture(net: Network, ix: Indexed, j: Journey, minTransfer: number, whole: boolean): Journey {
  const first = j.rides[0];
  if (first.route.kind !== 'timetable') return j;
  const egress = j.target.walk;
  let best = j;
  for (;;) {
    const r0 = earliestRide(net, ix, first.route.group, first.from, first.to, best.rides[0].dep, whole, best.rides[0].dep);
    if (!r0 || r0.dep > j.arr) return best;
    const rides = [r0];
    for (let i = 1; i < j.rides.length && rides.length === i; i++) {
      const p = j.rides[i];
      const ready = rides[i - 1].arr + Math.max(minTransfer, j.transfers[i - 1].walk);
      const r = earliestRide(net, ix, p.route.group, p.from, p.to, ready, whole);
      if (r) rides.push(r);
    }
    if (rides.length < j.rides.length) return best;
    const arr = rides[rides.length - 1].arr + egress;
    if (arr > j.arr) return best;
    best = { ...j, rides, dep: r0.dep, arr };
  }
}
