// 照走法重算、錯過的話（T29，spec §6.4、§6.6）：走法＝每一程搭哪條線、哪兩站（PathRide），
// 換一個出發時刻就照同樣的走法依序搭每一程最早接得上的班；換車、步行的規則和 search.ts 一樣。

import type { EngineConfig } from '../config.ts';
import type { PathRide } from '../types.ts';
import { toMinutes } from '../time.ts';
import { KINTETSU, type Footpath, type Network } from './network.ts';
import { earliestRide, indexOf, type Access, type Indexed, type Journey, type JourneyRide, type JourneyTransfer } from './search.ts';

export function pathOf(j: Journey): PathRide[] {
  return j.rides.map((r) => ({ line: r.route.group, from: r.from, to: r.to }));
}

interface Ctx {
  net: Network;
  ix: Indexed;
  whole: boolean;
  factor: number;
  minTransfer: number;
}

/** from → to 的 footpath（同一對站有好幾筆時取最短的） */
function footpath(net: Network, from: string, to: string): Footpath | null {
  let best: Footpath | null = null;
  for (const fp of net.footpaths.get(from) ?? []) if (fp.to === to && (!best || fp.walk < best.walk)) best = fp;
  return best;
}

/** 上一程下車到這一程上車：可以上車的時刻、步行；站不同又沒有 footpath 回傳 null */
function connect(c: Ctx, prev: JourneyRide, p: PathRide): { ready: number; transfer: JourneyTransfer } | null {
  if (prev.to === p.from) {
    // 同一站換車：同 group 隔 minTransfer，其他照轉乘表（和 search.ts 的 rebuild 一樣）
    const g = prev.route.group;
    const ch = c.net.sameStopChange(p.from, g, p.line);
    const walk = g === p.line ? 0 : Math.ceil(Math.max(c.minTransfer, ch.walk * c.factor));
    return { ready: prev.arr + Math.max(c.minTransfer, walk), transfer: { walk, transfer: g === p.line ? null : ch.transfer } };
  }
  const fp = footpath(c.net, prev.to, p.from);
  if (!fp) return null;
  const walk = Math.max(c.minTransfer, Math.ceil(fp.walk * c.factor));
  return { ready: prev.arr + walk, transfer: { walk, transfer: fp.transfer } };
}

/** ready 以後這一程最早的班；近鐵時刻表不在大阪市內短程搭（同 search.ts） */
function board(c: Ctx, p: PathRide, ready: number, after?: number): JourneyRide | null {
  if (p.line === KINTETSU) {
    const a = c.ix.idx.get(p.from);
    const b = c.ix.idx.get(p.to);
    if (a != null && b != null && c.ix.osaka[a] && c.ix.osaka[b]) return null;
  }
  return earliestRide(c.net, c.ix, p.line, p.from, p.to, ready, c.whole, after);
}

/** 後面幾程照走法接最早的；終點再走一段 footpath 的算進 target.walk。接不上回傳 null */
function finish(c: Ctx, rides: JourneyRide[], transfers: JourneyTransfer[], rest: readonly PathRide[], origin: Access, target: Access): Journey | null {
  for (const p of rest) {
    const link = connect(c, rides[rides.length - 1], p);
    const r = link && board(c, p, link.ready);
    if (!link || !r) return null;
    rides.push(r);
    transfers.push(link.transfer);
  }
  const last = rides[rides.length - 1];
  let end = target;
  if (last.to !== target.stop) {
    const fp = footpath(c.net, last.to, target.stop);
    if (!fp) return null;
    end = { stop: last.to, walk: target.walk + Math.ceil(fp.walk * c.factor) };
  }
  return { origin, target: end, rides, transfers, dep: rides[0].dep, arr: last.arr + end.walk };
}

/** 從 depart 起照走法依序搭每一程最早接得上的班；接不上或那天沒車回傳 null */
export function evaluatePath(
  net: Network,
  rides: readonly PathRide[],
  origin: Access,
  target: Access,
  depart: number,
  q: { whole: boolean; factor: number },
  cfg: EngineConfig,
): Journey | null {
  if (!rides.length) return null;
  const c: Ctx = { net, ix: indexOf(net), whole: q.whole, factor: q.factor, minTransfer: cfg.transit.minTransfer };
  // 第一程的上車點和起點不同：起點先走一段 footpath（步行算在 origin，不套 minTransfer）
  let start = origin;
  if (rides[0].from !== origin.stop) {
    const fp = footpath(net, origin.stop, rides[0].from);
    if (!fp) return null;
    start = { stop: rides[0].from, walk: origin.walk + Math.ceil(fp.walk * q.factor) };
  }
  const first = board(c, rides[0], depart + start.walk);
  if (!first) return null;
  return finish(c, [first], [], rides.slice(1), start, target);
}

/**
 * 第 i 程錯過（改搭發車晚於規劃那班的下一班）：整段到達、晚幾分；沒有下一班回傳 null。
 * 有時刻表的程：同一對站發車晚於規劃發車、到得最早的那班；班距型：規劃發車＋班距（仍受首末班限制）。
 * 前面幾程不變，後面照走法重算。
 */
export function ifMissed(
  net: Network,
  j: Journey,
  i: number,
  q: { whole: boolean; factor: number },
  cfg: EngineConfig,
): { depart: number; arrive: number; lateMinutes: number } | null {
  const planned = j.rides[i];
  if (!planned) return null;
  const c: Ctx = { net, ix: indexOf(net), whole: q.whole, factor: q.factor, minTransfer: cfg.transit.minTransfer };
  const p: PathRide = { line: planned.route.group, from: planned.from, to: planned.to };
  const rides = j.rides.slice(0, i);
  const transfers = j.transfers.slice(0, Math.max(0, i - 1));
  let ready = planned.dep;
  if (i > 0) {
    const link = connect(c, rides[i - 1], p);
    if (!link) return null;
    transfers.push(link.transfer);
    ready = Math.max(ready, link.ready);
  }
  let missed: JourneyRide | null;
  if (planned.headway) {
    const dep = planned.dep + Math.ceil(planned.headway.min);
    const { first, last } = planned.headway;
    missed = dep < toMinutes(first) || dep > toMinutes(last) ? null : { ...planned, dep, arr: dep + (planned.arr - planned.dep) };
  } else {
    missed = board(c, p, ready, planned.dep);
  }
  if (!missed) return null;
  rides.push(missed);
  const out = finish(c, rides, transfers, j.rides.slice(i + 1).map((r) => ({ line: r.route.group, from: r.from, to: r.to })), j.origin, j.target);
  if (!out) return null;
  return { depart: out.dep, arrive: out.arr, lateMinutes: out.arr - j.arr };
}
