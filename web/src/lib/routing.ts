// 地圖上的路線怎麼畫、多遠、要多久（T12 drawRoute）。
// - 步行、計程車、包車、巴士：在瀏覽器查公開的 OSRM（routing.openstreetmap.de），沿道路走；
//   查過的存在記憶體和 localStorage，同樣的起訖點不再查。查不到就畫直線（👤 2026-10-22 決定：路徑來源用瀏覽器直接查）。
// - 電車：依序連經過的車站（同一條線、站號連續的車站），比較貼近鐵路；連不起來就畫直線。
// - 船、其他：直線。
// 時間用 engine 的預設速度和團體係數算，和行程引擎一致；查到的距離也給引擎的 walkMeters／driveMeters 用（T15）。

import { DEFAULT_CONFIG, taxiEstimate, walkFactor, type EngineConfig } from '@travel-helper/engine';
import { haversineMeters } from './geo/distance.ts';
import { minutesForMeters } from './geo/walk.ts';
import type { LonLat, PartyProfile, TravelMode } from '@travel-helper/engine/types';

export type RouteProfile = 'foot' | 'car' | 'rail' | 'straight';

export const OSRM_BASES: Record<'foot' | 'car', string> = {
  foot: 'https://routing.openstreetmap.de/routed-foot',
  car: 'https://routing.openstreetmap.de/routed-car',
};
/** routing.openstreetmap.de 的使用規範要求低頻使用 */
export const OSRM_MIN_INTERVAL_MS = 1100;

export function routeProfile(mode: TravelMode): RouteProfile {
  switch (mode) {
    case 'walk':
      return 'foot';
    case 'taxi':
    case 'charter':
    case 'car':
    case 'bus':
      return 'car';
    case 'train':
      return 'rail';
    case 'transit': // 實際路徑照 rides 畫
      return 'straight';
    default:
      return 'straight';
  }
}

/** 路線中間標籤的字，例如「14 分」（分鐘無條件進位，和引擎一樣）；有 label 用 label；都沒有是「…」（圖示由 modeIconHtml 畫在字前面） */
export function routeLabel(_mode: TravelMode, minutes: number | null, label: string | null = null): string {
  if (label) return label;
  return minutes != null ? `${Math.max(1, Math.ceil(minutes - 1e-9))} 分` : '…';
}

/**
 * 用路徑距離和預設速度算分鐘：步行乘團體係數（全員），計程車、包車、自駕用 OSRM 的開車時間（roadMinutes），沒有時用 engine 的計程車速度；
 * 電車、巴士、船看時刻表，這裡不算（回傳 null）。
 */
export function minutesFromMeters(
  mode: TravelMode,
  meters: number,
  _party: PartyProfile,
  cfg: EngineConfig = DEFAULT_CONFIG,
  roadMinutes?: number | null,
): number | null {
  if (mode === 'walk') {
    // 實際路徑不用再乘繞路係數
    return minutesForMeters(meters, { metersPerMinute: cfg.walk.metersPerMinute, detourFactor: 1, groupFactor: walkFactor(cfg) });
  }
  if (mode === 'taxi' || mode === 'charter' || mode === 'car') return taxiEstimate([0, 0], [0, 0], cfg, meters, roadMinutes).minutes;
  return null;
}

/** 折線的長度（公尺） */
export function lineMeters(coords: LonLat[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += haversineMeters(coords[i - 1], coords[i]);
  return m;
}

/** 折線的中點（標籤放的位置） */
export function lineMidpoint(coords: LonLat[]): LonLat {
  if (coords.length === 1) return coords[0];
  const half = lineMeters(coords) / 2;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineMeters(coords[i - 1], coords[i]);
    if (acc + d >= half && d > 0) {
      const t = (half - acc) / d;
      const [a, b] = [coords[i - 1], coords[i]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    acc += d;
  }
  return coords[coords.length - 1];
}

// --- 電車：依序連經過的車站 ---------------------------------------------------

export interface RailStation {
  id: string;
  coords: LonLat;
  operator?: string | null;
  stationNumber?: string | null;
}

/** 站號，例如 M73 → { prefix: 'M', n: 73 }；「JR-S47／NK32」這種有好幾個的取第一個 */
function parseNumber(s: string | null | undefined): { prefix: string; n: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec((s ?? '').split(/[／/]/)[0].trim());
  return m ? { prefix: m[1], n: Number(m[2]) } : null;
}

/**
 * 兩個車站之間經過的車站（含起訖站），依站號排；同一家公司、同一個站號字首才連得起來，否則 null。
 * 站號是 data/stations.json 的 stationNumber，所以近鐵（M71～M93）沿著鐵路畫；JR 沒有站號，畫直線。
 */
export function railPath(fromId: string, toId: string, stations: RailStation[]): LonLat[] | null {
  const a = stations.find((s) => s.id === fromId);
  const b = stations.find((s) => s.id === toId);
  const na = parseNumber(a?.stationNumber);
  const nb = parseNumber(b?.stationNumber);
  if (!a || !b || !na || !nb || na.prefix !== nb.prefix || a.operator !== b.operator) return null;
  const lo = Math.min(na.n, nb.n);
  const hi = Math.max(na.n, nb.n);
  const between = stations
    .map((s) => ({ s, num: parseNumber(s.stationNumber) }))
    .filter(({ s, num }) => s.operator === a.operator && num?.prefix === na.prefix && num.n >= lo && num.n <= hi)
    .sort((x, y) => x.num!.n - y.num!.n)
    .map(({ s }) => s.coords);
  return na.n <= nb.n ? between : between.reverse();
}

/** 一程車：交通方式和上下車的站（引擎的 TransitRide 的子集）；routeId 是大阪班距型路線（data/timetables/urban）的 ID */
export interface RideStops {
  mode: 'train' | 'bus' | 'ferry';
  from: string;
  to: string;
  routeId?: string | null;
}

/** 照順序的停靠站（大阪班距型路線，引擎的 UrbanRoute 的子集）：環狀線 loop 是 true，loopMin 是一圈的分鐘 */
export interface RouteLine {
  id: string;
  loop: boolean;
  loopMin?: number | null;
  stops: { id: string; min: number }[];
}

/**
 * 路線裡 from → to 經過的站（含起訖站）：照路線的停靠順序；反方向倒過來。
 * 環狀線兩個方向都走得到，取分鐘少的那邊（一樣時照資料的順序）。站不在路線上回傳 null
 */
export function lineStops(line: RouteLine, from: string, to: string): string[] | null {
  const ids = line.stops.map((s) => s.id);
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;
  if (!line.loop) return a < b ? ids.slice(a, b + 1) : ids.slice(b, a + 1).reverse();
  const n = ids.length;
  const walk = (step: 1 | -1) => {
    const out = [ids[a]];
    for (let i = a; i !== b; ) {
      i = (i + step + n) % n;
      out.push(ids[i]);
    }
    return out;
  };
  const total = line.loopMin ?? null;
  const ma = line.stops[a].min;
  const mb = line.stops[b].min;
  // 照資料順序走的分鐘；沒有一圈的分鐘就比站數
  const forward = total != null ? (mb - ma + total) % total : (b - a + n) % n;
  const backward = total != null ? total - forward : n - forward;
  return forward <= backward ? walk(1) : walk(-1);
}

/**
 * 照班次畫一段交通（地點 → 地點）：起點直線到第一程上車的站，每一程電車沿車站（大阪的路線照 lines 的停靠順序、環狀線走近的那邊；
 * 其他照站號；連不起來、巴士、船直線），
 * 轉乘時兩站之間直線（走過去），最後一程下車的站直線到終點。
 * coordsOf 找站的座標；沒有班次、或每一程的站都找不到時回傳 null。
 */
export function ridesPath(
  from: LonLat,
  to: LonLat,
  rides: RideStops[],
  stations: RailStation[],
  coordsOf: (id: string) => LonLat | null,
  lines?: ReadonlyMap<string, RouteLine>,
  ends?: { first?: LonLat[] | null; last?: LonLat[] | null },
): LonLat[] | null {
  const out: LonLat[] = [from];
  const push = (c: LonLat) => {
    const last = out[out.length - 1];
    if (last[0] !== c[0] || last[1] !== c[1]) out.push(c);
  };
  let found = false;
  for (const r of rides) {
    const a = coordsOf(r.from);
    const b = coordsOf(r.to);
    if (!a || !b) continue;
    // 起點走到（或搭計程車到）第一程上車站：有道路的路徑就沿路
    if (!found) ends?.first?.forEach(push);
    found = true;
    (rideLine(r, stations, coordsOf, lines) ?? [a, b]).forEach(push);
  }
  if (!found) return null;
  ends?.last?.forEach(push);
  push(to);
  return out.length >= 2 ? out : null;
}

/** 頭尾那一小段要向 OSRM 查的：profile 和查的方向；reverse 是畫的時候要倒過來（查的是「點 → 站」，畫的是「站 → 點」） */
export interface EndQuery {
  profile: 'foot' | 'car';
  from: LonLat;
  to: LonLat;
  reverse: boolean;
}

/** 頭尾離站不到這麼遠（公尺）就不查（點就在車站上） */
export const END_MIN_METERS = 30;

/**
 * 一段大眾運輸的頭尾（起點 → 第一程上車站、最後一程下車站 → 終點）：走路或計程車（taxiBefore／taxiAfter），要查的道路。
 * 查的方向照引擎問快取的方向，查到的距離引擎才用得到：走路一律「點 → 站」（engine 的 walkMinutes(端點, 站)），
 * 計程車照行進方向（drive(點, 站)、drive(站, 點)）。站找不到、點就在站上是 null
 */
export function transitEnds(
  from: LonLat,
  to: LonLat,
  rides: readonly RideStops[],
  taxi: { taxiBefore?: { station: string } | null; taxiAfter?: { station: string } | null } | null | undefined,
  coordsOf: (id: string) => LonLat | null,
): { first: EndQuery | null; last: EndQuery | null } {
  if (!rides.length) return { first: null, last: null };
  const far = (a: LonLat, b: LonLat) => haversineMeters(a, b) >= END_MIN_METERS;
  const firstStop = coordsOf(taxi?.taxiBefore?.station ?? rides[0].from);
  const lastStop = coordsOf(taxi?.taxiAfter?.station ?? rides[rides.length - 1].to);
  const first: EndQuery | null =
    firstStop && far(from, firstStop) ? { profile: taxi?.taxiBefore ? 'car' : 'foot', from, to: firstStop, reverse: false } : null;
  const last: EndQuery | null = !lastStop || !far(lastStop, to) ? null : taxi?.taxiAfter ? { profile: 'car', from: lastStop, to, reverse: false } : { profile: 'foot', from: to, to: lastStop, reverse: true };
  return { first, last };
}

/** 一程電車經過的站的座標：大阪的路線照停靠順序（站都要找得到），其他照站號（railPath）；連不起來回傳 null */
function rideLine(r: RideStops, stations: RailStation[], coordsOf: (id: string) => LonLat | null, lines?: ReadonlyMap<string, RouteLine>): LonLat[] | null {
  if (r.mode !== 'train') return null;
  const line = r.routeId ? lines?.get(r.routeId) : undefined;
  const ids = line ? lineStops(line, r.from, r.to) : null;
  if (ids) {
    const coords = ids.map(coordsOf);
    if (coords.every((c): c is LonLat => c != null)) return coords;
  }
  const rail = railPath(r.from, r.to, stations);
  return rail && rail.length >= 2 ? rail : null;
}

/** 一段交通要亮起來的車站：每一程上車和下車的站（轉乘的站也算），不重複 */
export function rideStations(rides: RideStops[]): string[] {
  return [...new Set(rides.flatMap((r) => [r.from, r.to]))];
}

// --- 步行、開車：OSRM -----------------------------------------------------------

export interface RoadRoute {
  geometry: LonLat[];
  /** 路線距離＋起訖點到道路的距離（和 lib/geo/route.ts、引擎的 walkMeters 算法一致） */
  meters: number;
  /** OSRM routes[0].duration（開車時間，秒）；步行路線也存，但只有開車用 */
  seconds: number;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** localStorage 的子集；測試時注入假的 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RoadRouterOptions {
  fetch?: FetchLike;
  storage?: KeyValueStorage | null;
  minIntervalMs?: number;
  timeoutMs?: number;
  /** 查失敗的段落多久內不再查（預設 10 分鐘，只放記憶體） */
  failureTtlMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** 查失敗（OSRM 掛了、查不到路）後不再重查的時間：公開的 OSRM 要求低頻使用 */
export const FAILURE_TTL_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = 'travel-helper:route:';
const r5 = (v: number) => v.toFixed(5);

/** 快取 key：座標四捨五入到約 1 公尺 */
export function roadKey(profile: 'foot' | 'car', from: LonLat, to: LonLat): string {
  return `${profile}_${r5(from[0])}_${r5(from[1])}__${r5(to[0])}_${r5(to[1])}`;
}

function parseOsrm(body: unknown): RoadRoute {
  const b = body as {
    code?: string;
    routes?: { distance?: unknown; duration?: unknown; geometry?: { coordinates?: unknown } }[];
    waypoints?: { distance?: unknown }[];
  };
  if (b?.code !== 'Ok') throw new Error(`OSRM 回傳 ${b?.code ?? '格式不明'}`);
  const r = b.routes?.[0];
  const coords = r?.geometry?.coordinates;
  if (!r || typeof r.distance !== 'number' || typeof r.duration !== 'number' || !Array.isArray(coords) || coords.length < 2) throw new Error('OSRM 回傳沒有路線');
  const snap = (i: number) => {
    const d = b.waypoints?.[i]?.distance;
    return typeof d === 'number' && Number.isFinite(d) ? d : 0;
  };
  return { geometry: coords as LonLat[], meters: r.distance + snap(0) + snap(1), seconds: r.duration };
}

export function createRoadRouter(opts: RoadRouterOptions = {}) {
  const {
    storage = null,
    minIntervalMs = OSRM_MIN_INTERVAL_MS,
    timeoutMs = 15000,
    failureTtlMs = FAILURE_TTL_MS,
    now = () => Date.now(),
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  } = opts;
  const doFetch = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
  const memory = new Map<string, RoadRoute>();
  const inflight = new Map<string, Promise<RoadRoute | null>>();
  /** 查失敗的 key → 可以再查的時間 */
  const failedUntil = new Map<string, number>();
  let lastAt = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  let calls = 0;
  /** 查到新路線的次數：行程引擎靠它判斷道路快取有沒有新值（T29b） */
  let version = 0;

  function cached(profile: 'foot' | 'car', from: LonLat, to: LonLat): RoadRoute | null {
    const key = roadKey(profile, from, to);
    const hit = memory.get(key);
    if (hit) return hit;
    try {
      const raw = storage?.getItem(STORAGE_PREFIX + key);
      if (raw) {
        const r = JSON.parse(raw) as Partial<RoadRoute>;
        // 舊資料沒有 seconds：當作沒查過（會再查一次）
        if (typeof r.seconds === 'number') {
          memory.set(key, r as RoadRoute);
          return r as RoadRoute;
        }
      }
    } catch {
      // 讀不到 localStorage（無痕模式等）就當作沒有快取
    }
    return null;
  }

  /** 查路徑；查不到（網路、OSRM 錯誤）回傳 null，由呼叫者改畫直線 */
  function route(profile: 'foot' | 'car', from: LonLat, to: LonLat): Promise<RoadRoute | null> {
    const hit = cached(profile, from, to);
    if (hit) return Promise.resolve(hit);
    const key = roadKey(profile, from, to);
    // 剛失敗過：不再送請求，直接當查不到（呼叫者畫直線）
    const retryAt = failedUntil.get(key);
    if (retryAt != null) {
      if (now() < retryAt) return Promise.resolve(null);
      failedUntil.delete(key);
    }
    const pending = inflight.get(key);
    if (pending) return pending;
    if (!doFetch) return Promise.resolve(null);
    // 同一個 router 的請求排成一列，確保間隔
    const run = queue.then(async () => {
      const wait = lastAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastAt = now();
      calls++;
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        const url = `${OSRM_BASES[profile]}/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson&steps=false`;
        const res = await doFetch(url, ctrl ? { signal: ctrl.signal } : undefined);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r = parseOsrm(await res.json());
        memory.set(key, r);
        version++;
        try {
          storage?.setItem(STORAGE_PREFIX + key, JSON.stringify(r));
        } catch {
          // 存不了（容量滿、無痕模式）不影響這次的結果
        }
        return r;
      } catch {
        failedUntil.set(key, now() + failureTtlMs);
        return null;
      } finally {
        if (timer) clearTimeout(timer);
        inflight.delete(key);
      }
    });
    queue = run.catch(() => undefined);
    inflight.set(key, run);
    return run;
  }

  return {
    route,
    /** 只看快取（同步）：給 engine 的 walkMeters／driveMeters 用；沒查過回傳 null */
    cachedMeters: (profile: 'foot' | 'car', from: LonLat, to: LonLat): number | null => cached(profile, from, to)?.meters ?? null,
    /** 只看快取（同步）：給 engine 的 driveMinutes 用；沒查過回傳 null */
    cachedMinutes: (profile: 'foot' | 'car', from: LonLat, to: LonLat): number | null => {
      const s = cached(profile, from, to)?.seconds;
      return s != null ? s / 60 : null;
    },
    /** 只看快取（同步）：地圖上的行程線用；沒查過回傳 null */
    cachedPath: (profile: 'foot' | 'car', from: LonLat, to: LonLat): LonLat[] | null => cached(profile, from, to)?.geometry ?? null,
    get apiCalls() {
      return calls;
    },
    get version() {
      return version;
    },
  };
}

export type RoadRouter = ReturnType<typeof createRoadRouter>;
