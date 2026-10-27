// 時刻表查詢：把 scripts/next-train.mjs（近鐵）、scripts/next-bus.mjs（巴士、定期船、JR）的規則搬過來，
// 改成傳資料進來的純函式。規則不變：轉乘 1 次、至少 3 分；しまかぜ固定停駛日；停留所用 near（500 m 內）。
// test/transit.test.ts 用同樣的查詢比對兩支腳本的輸出。

import type { KintetsuTimes, KintetsuTrain, RouteTimetable } from './data.ts';
import type { DateString, TimeString } from './types.ts';
import { busDayType, dayOfWeek, kintetsuDayType, toMinutes } from './time.ts';

// --- 近鐵 -------------------------------------------------------------------

const EXPRESS = new Set(['特急', 'しまかぜ']);
// しまかぜ固定停駛的星期（next-train.mjs；另有檢修停駛日，要查官網運行日曆）
export const SHIMAKAZE_OFF: Record<string, number> = { 大阪難波発着: 2, 京都発着: 3, 近鉄名古屋発着: 4 };

export interface TrainRide {
  trainNo: string;
  type: string;
  /** 終點站 ID（可能在區間外） */
  to: string;
  from: string;
  alight: string;
  dep: number;
  arr: number;
}

export interface TrainQuery {
  from: string;
  to: string;
  date: DateString;
  /** 最早可以出發的時間（分鐘） */
  after: number;
  holidays: readonly DateString[];
  allowExpress?: boolean;
  minTransfer?: number;
}

interface PreparedTrain {
  no: string;
  t: KintetsuTrain;
  stops: { station: string; arr: number | null; dep: number | null }[];
}

// 同一份時刻表、同一種日子、同樣的特急設定只整理一次（每段交通都要查好幾次，整理很花時間）
const prepared = new WeakMap<KintetsuTimes, Map<string, PreparedTrain[]>>();

function prepare(tt: KintetsuTimes, date: DateString, holidays: readonly DateString[], allowExpress: boolean): PreparedTrain[] {
  const day = kintetsuDayType(date, holidays);
  let byKey = prepared.get(tt);
  if (!byKey) prepared.set(tt, (byKey = new Map()));
  const key = `${day}|${allowExpress}`;
  let out = byKey.get(key);
  if (!out) byKey.set(key, (out = prepareDay(tt, day, allowExpress)));
  return out;
}

function prepareDay(tt: KintetsuTimes, day: ReturnType<typeof kintetsuDayType>, allowExpress: boolean): PreparedTrain[] {
  return Object.entries(tt.trains[day] ?? {})
    .filter(([, t]) => allowExpress || !EXPRESS.has(t.type))
    .map(([no, t]) => ({
      no,
      t,
      stops: t.stops.map(([s, a, d]) => ({ station: s, arr: a ? toMinutes(a) : null, dep: d ? toMinutes(d) : null })),
    }));
}

function shimakazeOff(t: KintetsuTrain, date: DateString): boolean {
  return t.type === 'しまかぜ' && SHIMAKAZE_OFF[t.note?.split('；')[0] ?? ''] === dayOfWeek(date);
}

function ride(p: PreparedTrain, a: string, b: string, after: number): TrainRide | null {
  const i = p.stops.findIndex((s) => s.station === a);
  if (i < 0 || p.stops[i].dep == null || (p.stops[i].dep as number) < after) return null;
  const j = p.stops.findIndex((s, k) => k > i && s.station === b);
  if (j < 0) return null;
  const arr = p.stops[j].arr ?? p.stops[j].dep;
  if (arr == null) return null;
  return { trainNo: p.no, type: p.t.type, to: p.t.to, from: a, alight: b, dep: p.stops[i].dep as number, arr };
}

/** 直達車：A 站發車 ≥ after 的班次，依發車時刻排序（含當天固定停駛的しまかぜ，next-train 也會列） */
export function directTrains(tt: KintetsuTimes, q: TrainQuery): (TrainRide & { off: boolean })[] {
  const trains = prepare(tt, q.date, q.holidays, q.allowExpress ?? true);
  return trains
    .map((p) => {
      const r = ride(p, q.from, q.to, q.after);
      return r && { ...r, off: shimakazeOff(p.t, q.date) };
    })
    .filter((r): r is TrainRide & { off: boolean } => !!r)
    .sort((x, y) => x.dep - y.dep);
}

/** A 站這天所有發車時刻（分鐘，由早到晚、不重複；不含當天固定停駛的しまかぜ）：找前一班時用 */
export function departuresFrom(tt: KintetsuTimes, q: Omit<TrainQuery, 'after' | 'to'>): number[] {
  const out = new Set<number>();
  for (const p of prepare(tt, q.date, q.holidays, q.allowExpress ?? true)) {
    if (shimakazeOff(p.t, q.date)) continue;
    for (const s of p.stops) if (s.station === q.from && s.dep != null) out.add(s.dep);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * 最早抵達：允許轉乘 1 次（轉乘至少 minTransfer 分）。同時抵達時取晚出發的。
 * 回傳 1～2 段；沒有車回傳 null。
 */
export function earliestTrain(tt: KintetsuTimes, q: TrainQuery): TrainRide[] | null {
  if (q.from === q.to) return null;
  let memo = earliestMemo.get(tt);
  if (!memo) earliestMemo.set(tt, (memo = new Map()));
  const key = [q.from, q.to, q.date, kintetsuDayType(q.date, q.holidays), q.allowExpress ?? true, q.minTransfer ?? 3, q.after].join('|');
  if (memo.has(key)) return memo.get(key) as TrainRide[] | null;
  if (memo.size >= EARLIEST_MEMO_MAX) memo.clear();
  const out = searchEarliest(tt, q);
  memo.set(key, out);
  return out;
}

// 同樣的查詢回傳同一個結果（規劃每次編輯都整份重算、插入位置要每個空檔算一次）；呼叫的人不能改回傳的陣列
const earliestMemo = new WeakMap<KintetsuTimes, Map<string, TrainRide[] | null>>();
const EARLIEST_MEMO_MAX = 50_000;

function searchEarliest(tt: KintetsuTimes, q: TrainQuery): TrainRide[] | null {
  const minTransfer = q.minTransfer ?? 3;
  const trains = prepare(tt, q.date, q.holidays, q.allowExpress ?? true).filter((p) => !shimakazeOff(p.t, q.date));
  let best: TrainRide[] | null = null;
  const better = (legs: TrainRide[]) => {
    if (!best) return true;
    const a = legs[legs.length - 1].arr;
    const b = best[best.length - 1].arr;
    return a < b || (a === b && legs[0].dep > best[0].dep);
  };
  for (const p of trains) {
    const r = ride(p, q.from, q.to, q.after);
    if (r && better([r])) best = [r];
  }
  // 第二程一定要停目的地：先挑出來，轉乘時只看這些車（順序不變，結果一樣）
  const toTrains = trains.filter((p) => p.stops.some((s) => s.station === q.to));
  for (const p1 of trains) {
    const i = p1.stops.findIndex((s) => s.station === q.from);
    if (i < 0 || p1.stops[i].dep == null || (p1.stops[i].dep as number) < q.after) continue;
    for (const x of p1.stops.slice(i + 1)) {
      const leg1 = ride(p1, q.from, x.station, q.after);
      if (!leg1) continue;
      for (const p2 of toTrains) {
        if (p2 === p1) continue;
        const leg2 = ride(p2, x.station, q.to, leg1.arr + minTransfer);
        if (leg2 && better([leg1, leg2])) best = [leg1, leg2];
      }
    }
  }
  return best;
}

/** 這天 A → B 還有沒有任何車（用來分辨「錯過末班車」和「根本沒有車」） */
export function anyTrainThatDay(tt: KintetsuTimes, q: Omit<TrainQuery, 'after'>): boolean {
  return earliestTrain(tt, { ...q, after: 0 }) != null;
}

// --- 巴士、定期船、JR -------------------------------------------------------

export interface RouteRide {
  routeId: string;
  mode: string;
  line: string;
  headsign: string;
  tripId: string;
  fromStop: string;
  toStop: string;
  fromStopName: string;
  toStopName: string;
  /** 停留所到出發地、目的地的直線距離（公尺） */
  fromMeters: number;
  toMeters: number;
  dep: TimeString;
  arr: TimeString;
  fareAdult: number | null;
}

/** 停留所的端點：資料點 ID（用 near 找）、停留所名稱，或附上座標距離的停留所清單 */
export type StopMatcher = string | ((doc: RouteTimetable) => Map<string, number>);

function matchStops(doc: RouteTimetable, q: StopMatcher): Map<string, number> {
  if (typeof q === 'function') return q(doc);
  const m = new Map<string, number>();
  for (const s of doc.stops) {
    if (s.name === q || s.id === q) m.set(s.id, 0);
    const n = s.near?.find((x) => x.id === q);
    if (n) m.set(s.id, n.meters);
  }
  return m;
}

const pad = (t: string) => t.padStart(5, '0');

/**
 * time 以後 A → B 的直達班次（next-bus.mjs 的規則）：
 * 每班車取「時刻之後離 A 最近的停留所」和「A 之後離 B 最近的停留所」；
 * 繞遠路的（有別班比它晚出發、早到）不列。依發車時刻排序。
 */
export function routeRides(
  routes: readonly RouteTimetable[],
  from: StopMatcher,
  to: StopMatcher,
  date: DateString,
  time: TimeString,
  holidays: readonly DateString[],
): RouteRide[] {
  const type = busDayType(date, holidays);
  const results: RouteRide[] = [];
  for (const doc of routes) {
    const A = matchStops(doc, from);
    const B = matchStops(doc, to);
    if (!A.size || !B.size) continue;
    if (date < doc.validFrom) continue;
    const name = (id: string) => doc.stops.find((s) => s.id === id)?.name ?? id;
    for (const trip of doc.trips[type] ?? []) {
      if (trip.dates && !trip.dates.includes(date)) continue;
      const idx = trip.stops.map((_, i) => i);
      const best = (cands: number[], dist: (i: number) => number) => cands.reduce((m, i) => (m < 0 || dist(i) < dist(m) ? i : m), -1);
      const ia = best(
        idx.filter((i) => A.has(trip.stops[i][0]) && trip.stops[i][2] && pad(trip.stops[i][2] as string) >= pad(time)),
        (i) => A.get(trip.stops[i][0]) as number,
      );
      if (ia < 0) continue;
      const ib = best(
        idx.filter((i) => i > ia && B.has(trip.stops[i][0]) && (trip.stops[i][1] ?? trip.stops[i][2])),
        (i) => B.get(trip.stops[i][0]) as number,
      );
      if (ib < 0) continue;
      const [aId, , dep] = trip.stops[ia];
      const [bId, bArr, bDep] = trip.stops[ib];
      results.push({
        routeId: doc.id,
        mode: doc.mode,
        line: doc.name.zh ?? doc.name.ja,
        headsign: trip.headsign,
        tripId: trip.id,
        fromStop: aId,
        toStop: bId,
        fromStopName: name(aId),
        toStopName: name(bId),
        fromMeters: A.get(aId) as number,
        toMeters: B.get(bId) as number,
        dep: pad(dep as string),
        arr: pad((bArr ?? bDep) as string),
        fareAdult: doc.fares?.adult?.[aId]?.[bId] ?? null,
      });
    }
  }
  results.sort((a, b) => a.dep.localeCompare(b.dep) || a.arr.localeCompare(b.arr));
  return results.filter((r) => !results.some((o) => o !== r && o.dep >= r.dep && o.arr < r.arr));
}

