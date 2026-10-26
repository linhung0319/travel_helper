// 一天的 RAPTOR 網路（T29，spec §6.2）：把近鐵、巴士、船、JR 的時刻表和大阪的班距型路線
// 整理成停靠點、route、步行轉乘。同一份資料、同一種日子只整理一次（照 transit.ts 的 prepare）。
// 搜尋（search.ts）、照走法重算（path.ts）都用這裡的 Network。

import type { EngineConfig } from '../config.ts';
import type { EngineData, KintetsuTrain, RouteTimetable, UrbanRoute, UrbanService, UrbanTransfer } from '../data.ts';
import type { DateString, LonLat } from '../types.ts';
import { haversineMeters, isLonLat } from '../geo.ts';
import { busDayType, dayOfWeek, kintetsuDayType, toMinutes } from '../time.ts';
import { SHIMAKAZE_OFF } from '../transit.ts';

/** 換線的組：近鐵 'kintetsu'、路線檔 routeId、班距型 routeId（兩個方向同一組） */
export interface TimedTrip {
  tripId: string;
  line: string;
  arr: number[];
  dep: number[];
  /** 票價放不進一維陣列（是上下車站的表），一律 null；要查用 routeFare() */
  fareAdult: (number | null)[] | null;
}

export interface TimedRoute {
  kind: 'timetable';
  key: string;
  group: string;
  mode: 'train' | 'bus' | 'ferry';
  routeId: string | null;
  stops: string[];
  /** 依發車排序、FIFO */
  trips: TimedTrip[];
}

export interface HeadwayRoute {
  kind: 'headway';
  key: string;
  group: string;
  routeId: string;
  line: string;
  stops: string[];
  /** 這個方向從第一站起的車上分鐘 */
  offsets: number[];
  service: UrbanService | null;
}

export type NetRoute = TimedRoute | HeadwayRoute;

export interface Footpath {
  to: string;
  /** 係數 1 的分鐘 */
  walk: number;
  transfer: UrbanTransfer | null;
  /**
   * 轉乘表記的線（這個方向的）：從哪條線（group）下車、要上哪條線；null 是哪條都可以。
   * 例如 JR 天王寺 → 地鐵天王寺，換御堂筋線 5 分、谷町線 7 分（lineFits）
   */
  fromLine: string | null;
  toLine: string | null;
}

/** 轉乘表的線和實際的線（group）合不合：記的是 null、或不知道實際是哪條（起點走過去、下車走到終點）都算合 */
export const lineFits = (line: string | null, group: string | null) => line == null || group == null || line === group;

/**
 * from → to 的 footpath 裡，合 fromGroup（下車那條線）、toGroup（要上的線）的最短的；都不合的話取最短的那筆
 *（線只用來挑同一對站的哪一筆，不拿來擋：例如近鐵大阪難波 → 地鐵なんば記的是近鐵難波線，近鐵的特急下車也走同一條路）。
 * from → to 沒有 footpath 回傳 null
 */
export function pickFootpath(list: readonly Footpath[] | undefined, to: string, fromGroup: string | null, toGroup: string | null): Footpath | null {
  let fit: Footpath | null = null;
  let any: Footpath | null = null;
  for (const fp of list ?? []) {
    if (fp.to !== to) continue;
    if (!any || fp.walk < any.walk) any = fp;
    if (lineFits(fp.fromLine, fromGroup) && lineFits(fp.toLine, toGroup) && (!fit || fp.walk < fit.walk)) fit = fp;
  }
  return fit ?? any;
}

export interface NetStop {
  id: string;
  name: string;
  coords: LonLat | null;
  stationId: string | null;
}

export interface Network {
  stops: Map<string, NetStop>;
  routes: NetRoute[];
  routesAt: Map<string, { route: number; index: number }[]>;
  footpaths: Map<string, Footpath[]>;
  /** 同一站換線（fromGroup → toGroup）的係數 1 分鐘與轉乘資料 */
  sameStopChange(stop: string, fromGroup: string, toGroup: string): { walk: number; transfer: UrbanTransfer | null };
}

const EXPRESS = new Set(['特急', 'しまかぜ']);
export const KINTETSU = 'kintetsu';

// --- 班距型的等車 -------------------------------------------------------------

/** 班距型路線在 t（分鐘）上車的等車分鐘；不能搭回傳 null */
export function headwayWait(service: UrbanService | null, t: number, whole: boolean): { wait: number; headway: number } | null {
  if (!service || service.first == null || service.last == null || !service.headway?.length) return null;
  // 用包含 t 的時段（from ≤ t < to）；沒有就用 from／to 離 t 最近的那段
  const spans = service.headway.map((h) => ({ h, from: toMinutes(h.from), to: toMinutes(h.to) }));
  let span = spans.find((s) => s.from <= t && t < s.to);
  if (!span) {
    const gap = (s: (typeof spans)[number]) => Math.min(Math.abs(s.from - t), Math.abs(s.to - t));
    span = spans.reduce((m, s) => (gap(s) < gap(m) ? s : m));
  }
  const min = span.h.min;
  if (min == null) return null;
  const wait = Math.ceil(whole ? min : min / 2);
  const dep = t + wait;
  if (dep < toMinutes(service.first) || dep > toMinutes(service.last)) return null;
  return { wait, headway: min };
}

// --- 建網路 -------------------------------------------------------------------

// 同一份資料、同一種日子、同樣的設定只整理一次（每段交通都要查好幾次）。
// 網路只用到 stations、kintetsu、routes、urban、urbanTransfers（不用 getPlace、walkMeters 這些函式），
// 所以快取掛在這幾個陣列上，不掛在 EngineData：網站每次編輯都建新的 EngineData（{ ...data }），陣列還是同一份，照樣用快取
interface Built {
  kintetsu: EngineData['kintetsu'];
  routes: EngineData['routes'];
  urban: EngineData['urban'];
  urbanTransfers: EngineData['urbanTransfers'];
  byKey: Map<string, Network>;
}
const built = new WeakMap<object, Built[]>();
/** 同一份 stations 最多記幾組（其他資料換了的） */
const BUILT_MAX = 4;

function builtFor(data: EngineData): Map<string, Network> {
  let list = built.get(data.stations);
  if (!list) built.set(data.stations, (list = []));
  let b = list.find((x) => x.kintetsu === data.kintetsu && x.routes === data.routes && x.urban === data.urban && x.urbanTransfers === data.urbanTransfers);
  if (!b) {
    if (list.length >= BUILT_MAX) list.shift();
    list.push((b = { kintetsu: data.kintetsu, routes: data.routes, urban: data.urban, urbanTransfers: data.urbanTransfers, byKey: new Map() }));
  }
  return b.byKey;
}

// 路線檔有沒有那天才有的班次、還沒生效的（有的話網路要分日期）：每份路線檔、每個日期只看一次
const byDateMemo = new WeakMap<readonly RouteTimetable[], Map<string, boolean>>();

function routesByDate(routes: readonly RouteTimetable[] | undefined, date: DateString, bd: 'weekday' | 'saturday' | 'holiday'): boolean {
  if (!routes?.length) return false;
  let m = byDateMemo.get(routes);
  if (!m) byDateMemo.set(routes, (m = new Map()));
  let v = m.get(`${date}|${bd}`);
  if (v == null) m.set(`${date}|${bd}`, (v = routes.some((doc) => date < doc.validFrom || (doc.trips[bd] ?? []).some((t) => t.dates))));
  return v;
}

export function buildNetwork(data: EngineData, cfg: EngineConfig, date: DateString): Network {
  const kd = kintetsuDayType(date, cfg.holidays);
  const bd = busDayType(date, cfg.holidays);
  const allowExpress = cfg.transit.allowExpress;
  // しまかぜ固定停駛看星期，不看日別：只把當天停駛的種類放進 key
  const off = Object.keys(SHIMAKAZE_OFF).filter((k) => SHIMAKAZE_OFF[k] === dayOfWeek(date));
  // 有指定日期的班次、還沒生效的路線檔，結果會因日期不同，才把日期放進 key
  const byDate = routesByDate(data.routes, date, bd);
  const { walk, transit } = cfg;
  const key = [
    kd,
    bd,
    allowExpress,
    off.join(','),
    byDate ? date : '',
    walk.detourFactor,
    walk.metersPerMinute,
    transit.minTransfer,
    transit.urbanTransferDefault,
    transit.transferMaxMeters,
  ].join('|');
  const byKey = builtFor(data);
  let net = byKey.get(key);
  if (!net) byKey.set(key, (net = build(data, cfg, date, kd, bd, new Set(off))));
  return net;
}

interface Raw {
  stops: string[];
  trip: TimedTrip;
}

function build(
  data: EngineData,
  cfg: EngineConfig,
  date: DateString,
  kd: 'weekday' | 'holiday',
  bd: 'weekday' | 'saturday' | 'holiday',
  shimakazeOff: Set<string>,
): Network {
  const stations = new Map(data.stations.map((s) => [s.id, s]));
  const stationName = (id: string) => (stations.get(id)?.name.ja as string | undefined) ?? id;
  const stops = new Map<string, NetStop>();
  const addStation = (id: string) => {
    if (stops.has(id)) return;
    const s = stations.get(id);
    stops.set(id, { id, name: stationName(id), coords: s && isLonLat(s.coords) ? s.coords : null, stationId: s ? id : null });
  };
  for (const s of data.stations) addStation(s.id);

  const routes: NetRoute[] = [];

  // 近鐵：不放不能搭的特急、當天固定停駛的しまかぜ
  if (data.kintetsu) {
    const raws: Raw[] = [];
    for (const [no, t] of Object.entries(data.kintetsu.trains[kd] ?? {})) {
      if (!cfg.transit.allowExpress && EXPRESS.has(t.type)) continue;
      if (isShimakazeOff(t, shimakazeOff)) continue;
      const r = rawTrip(no, `${t.type}（往${stationName(t.to)}）`, t.stops, (s) => s);
      for (const s of r.stops) addStation(s);
      raws.push(r);
    }
    routes.push(...timedRoutes(raws, { key: KINTETSU, group: KINTETSU, mode: 'train', routeId: null }));
  }

  // 巴士、船、JR 的路線檔：停留所加路線 ID 當前綴；JR 的停留所 ID 是車站 ID 的照用
  for (const doc of data.routes ?? []) {
    if (date < doc.validFrom) continue;
    const id = (s: string) => (doc.mode === 'jr' && stations.has(s) ? s : `${doc.id}/${s}`);
    for (const s of doc.stops) {
      const sid = id(s.id);
      if (stations.has(sid)) addStation(sid);
      else if (!stops.has(sid)) stops.set(sid, { id: sid, name: s.name, coords: isLonLat(s.coords) ? s.coords : null, stationId: null });
    }
    const raws: Raw[] = [];
    for (const trip of doc.trips[bd] ?? []) {
      if (trip.dates && !trip.dates.includes(date)) continue;
      const r = rawTrip(trip.id, `${doc.name.zh ?? doc.name.ja}（往${trip.headsign}）`, trip.stops, id);
      for (const s of r.stops) if (!stops.has(s)) stops.set(s, { id: s, name: s, coords: null, stationId: null });
      raws.push(r);
    }
    routes.push(...timedRoutes(raws, { key: doc.id, group: doc.id, mode: routeMode(doc), routeId: doc.id }));
  }

  // 班距型：每條線兩個方向
  const headwayGroups = new Set<string>();
  for (const u of data.urban ?? []) {
    headwayGroups.add(u.id);
    for (const s of u.stops) addStation(s.id);
    routes.push(...headwayRoutes(u, bd));
  }

  const routesAt = new Map<string, { route: number; index: number }[]>();
  routes.forEach((r, route) =>
    r.stops.forEach((s, index) => {
      let list = routesAt.get(s);
      if (!list) routesAt.set(s, (list = []));
      list.push({ route, index });
    }),
  );

  const footpaths = buildFootpaths(data, cfg, stops);

  // 同站換線：轉乘表裡 from === to 的
  const changes = new Map<string, UrbanTransfer[]>();
  for (const t of data.urbanTransfers ?? []) {
    if (t.from !== t.to) continue;
    let list = changes.get(t.from);
    if (!list) changes.set(t.from, (list = []));
    list.push(t);
  }
  const lineIs = (line: string | null | undefined, g: string) => line == null || line === g;
  const sameStopChange = (stop: string, fromGroup: string, toGroup: string) => {
    if (fromGroup === toGroup) return { walk: cfg.transit.minTransfer, transfer: null };
    const t = changes.get(stop)?.find(
      (x) => (lineIs(x.fromLine, fromGroup) && lineIs(x.toLine, toGroup)) || (!x.oneWay && lineIs(x.fromLine, toGroup) && lineIs(x.toLine, fromGroup)),
    );
    if (t) return { walk: t.walkMin ?? cfg.transit.urbanTransferDefault, transfer: t };
    if (headwayGroups.has(fromGroup) || headwayGroups.has(toGroup)) return { walk: cfg.transit.urbanTransferDefault, transfer: null };
    return { walk: cfg.transit.minTransfer, transfer: null };
  };

  return { stops, routes, routesAt, footpaths, sameStopChange };
}

function isShimakazeOff(t: KintetsuTrain, off: Set<string>): boolean {
  return t.type === 'しまかぜ' && off.has(t.note?.split('；')[0] ?? '');
}

/** 交通方式照 travel.ts：ferry → ferry、jr → train、其他 bus */
function routeMode(doc: RouteTimetable): TimedRoute['mode'] {
  return doc.mode === 'ferry' ? 'ferry' : doc.mode === 'jr' ? 'train' : 'bus';
}

/** 一班車的停站和時刻；到、發只有一個的用另一個補，兩個都沒有的站不算停 */
function rawTrip(tripId: string, line: string, list: [string, string | null, string | null][], id: (s: string) => string): Raw {
  const stops: string[] = [];
  const arr: number[] = [];
  const dep: number[] = [];
  for (const [s, a, d] of list) {
    if (!a && !d) continue;
    stops.push(id(s));
    arr.push(toMinutes((a ?? d) as string));
    dep.push(toMinutes((d ?? a) as string));
  }
  return { stops, trip: { tripId, line, arr, dep, fareAdult: null } };
}

/** 依停站序列分組；同一組依發車排序，不 FIFO（後發車的比較早到某站）的拆到另一個 route */
function timedRoutes(raws: Raw[], meta: Omit<TimedRoute, 'kind' | 'stops' | 'trips'>): TimedRoute[] {
  const bySeq = new Map<string, Raw[]>();
  for (const r of raws) {
    if (r.stops.length < 2) continue;
    const k = r.stops.join('\n');
    let list = bySeq.get(k);
    if (!list) bySeq.set(k, (list = []));
    list.push(r);
  }
  const out: TimedRoute[] = [];
  for (const list of bySeq.values()) {
    const n = list[0].stops.length;
    list.sort((x, y) => x.trip.dep[0] - y.trip.dep[0] || x.trip.arr[n - 1] - y.trip.arr[n - 1]);
    const parts: TimedTrip[][] = [];
    for (const { trip } of list) {
      const fifo = (p: TimedTrip[]) => {
        const last = p[p.length - 1];
        return last.arr.every((a, i) => trip.arr[i] >= a && trip.dep[i] >= last.dep[i]);
      };
      const part = parts.find(fifo);
      if (part) part.push(trip);
      else parts.push([trip]);
    }
    for (const trips of parts) out.push({ kind: 'timetable', ...meta, stops: [...list[0].stops], trips });
  }
  return out;
}

/** 那天的服務：日別照巴士；週六是 null 的用假日 */
function serviceOn(u: UrbanRoute, bd: 'weekday' | 'saturday' | 'holiday'): UrbanService | null {
  return bd === 'saturday' ? (u.service.saturday ?? u.service.holiday) : u.service[bd];
}

/**
 * 班距型的兩個方向。一般的線：+ 照資料順序、- 反過來。
 * 環狀線（loop、loopMin）：+ 是資料順序（内回り）、- 是反方向（外回り），都從第一站出發；
 * 繞完一圈接著第二圈，到第一站的前一站為止，跨過接點的站分鐘加 loopMin，這樣任兩站都能直達。
 */
function headwayRoutes(u: UrbanRoute, bd: 'weekday' | 'saturday' | 'holiday'): HeadwayRoute[] {
  const service = serviceOn(u, bd);
  const line = u.name.zh ?? u.name.ja;
  const mk = (dir: '+' | '-', seq: { id: string; off: number }[]): HeadwayRoute => ({
    kind: 'headway',
    key: `${u.id}:${dir}`,
    group: u.id,
    routeId: u.id,
    line,
    stops: seq.map((s) => s.id),
    offsets: seq.map((s) => s.off),
    service,
  });
  const st = u.stops;
  if (u.loop && u.loopMin != null && st.length > 1) {
    const loopMin = u.loopMin;
    const lap = (one: { id: string; off: number }[]) => [...one, ...one.slice(0, -1).map((s) => ({ id: s.id, off: s.off + loopMin }))];
    const inner = st.map((s) => ({ id: s.id, off: s.min - st[0].min }));
    const outer = [{ id: st[0].id, off: 0 }, ...st.slice(1).reverse().map((s) => ({ id: s.id, off: loopMin - (s.min - st[0].min) }))];
    return [mk('+', lap(inner)), mk('-', lap(outer))];
  }
  const first = st[0]?.min ?? 0;
  const last = st[st.length - 1]?.min ?? 0;
  return [
    mk('+', st.map((s) => ({ id: s.id, off: s.min - first }))),
    mk('-', [...st].reverse().map((s) => ({ id: s.id, off: last - s.min }))),
  ];
}

/**
 * 步行轉乘（係數 1 的分鐘）：
 * 1. 轉乘表 from !== to 的（oneWay 只加一個方向，walkMin 是 null 用 urbanTransferDefault）；
 * 2. stations.json 的 transfers 沒在轉乘表的：直線 × detourFactor ÷ 步速；
 * 3. 有座標的停靠點之間 transferMaxMeters 內的：同樣直線估算。
 * 同一對站同方向，前面的有了就不再加後面的；轉乘表同一對站有好幾筆（不同線）的都留著，搭的時候照線挑（pickFootpath）。
 */
function buildFootpaths(data: EngineData, cfg: EngineConfig, stops: Map<string, NetStop>): Map<string, Footpath[]> {
  const out = new Map<string, Footpath[]>();
  const seen = new Set<string>();
  const add = (from: string, to: string, walk: number, transfer: UrbanTransfer | null, fromLine: string | null = null, toLine: string | null = null) => {
    if (from === to) return;
    let list = out.get(from);
    if (!list) out.set(from, (list = []));
    list.push({ to, walk, transfer, fromLine, toLine });
    seen.add(`${from}\n${to}`);
  };
  const has = (from: string, to: string) => seen.has(`${from}\n${to}`);
  const estimate = (meters: number) => (meters * cfg.walk.detourFactor) / cfg.walk.metersPerMinute;

  for (const t of data.urbanTransfers ?? []) {
    if (t.from === t.to) continue;
    const walk = t.walkMin ?? cfg.transit.urbanTransferDefault;
    // 反方向：下車、上車的線對調
    add(t.from, t.to, walk, t, t.fromLine ?? null, t.toLine ?? null);
    if (!t.oneWay) add(t.to, t.from, walk, t, t.toLine ?? null, t.fromLine ?? null);
  }

  for (const s of data.stations) {
    const a = stops.get(s.id)?.coords;
    for (const to of (s.transfers as string[] | null | undefined) ?? []) {
      const b = stops.get(to)?.coords;
      if (!a || !b || has(s.id, to)) continue;
      add(s.id, to, estimate(haversineMeters(a, b)), null);
    }
  }

  // 依緯度排序，只比緯度差在範圍內的
  const max = cfg.transit.transferMaxMeters;
  const dLat = max / 111_000;
  const pts = [...stops.values()].filter((s): s is NetStop & { coords: LonLat } => !!s.coords).sort((x, y) => x.coords[1] - y.coords[1]);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length && pts[j].coords[1] - pts[i].coords[1] <= dLat; j++) {
      const [a, b] = [pts[i], pts[j]];
      const m = haversineMeters(a.coords, b.coords);
      if (m > max) continue;
      if (!has(a.id, b.id)) add(a.id, b.id, estimate(m), null);
      if (!has(b.id, a.id)) add(b.id, a.id, estimate(m), null);
    }
  }
  return out;
}

/** 路線檔的大人票價（route 是路線檔的 TimedRoute，i、j 是 stops 的位置）；沒有資料回傳 null */
export function routeFare(data: EngineData, route: TimedRoute, i: number, j: number): number | null {
  if (route.routeId == null) return null;
  const doc = data.routes?.find((d) => d.id === route.routeId);
  if (!doc) return null;
  const raw = (s: string) => (s.startsWith(`${doc.id}/`) ? s.slice(doc.id.length + 1) : s);
  return doc.fares?.adult?.[raw(route.stops[i])]?.[raw(route.stops[j])] ?? null;
}
