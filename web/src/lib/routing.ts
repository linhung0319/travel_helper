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
  party: PartyProfile,
  cfg: EngineConfig = DEFAULT_CONFIG,
  roadMinutes?: number | null,
): number | null {
  if (mode === 'walk') {
    // 實際路徑不用再乘繞路係數
    return minutesForMeters(meters, { metersPerMinute: cfg.walk.metersPerMinute, detourFactor: 1, groupFactor: walkFactor(party, true, cfg) });
  }
  if (mode === 'taxi' || mode === 'charter' || mode === 'car') return taxiEstimate([0, 0], [0, 0], party, cfg, meters, roadMinutes).minutes;
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

/** 一程車：交通方式和上下車的站（引擎的 TransitRide 的子集） */
export interface RideStops {
  mode: 'train' | 'bus' | 'ferry';
  from: string;
  to: string;
}

/**
 * 照班次畫一段交通（地點 → 地點）：起點直線到第一程上車的站，每一程電車沿車站（連不起來、巴士、船直線），
 * 轉乘時兩站之間直線（走過去），最後一程下車的站直線到終點。
 * coordsOf 找站的座標；沒有班次、或每一程的站都找不到時回傳 null。
 */
export function ridesPath(from: LonLat, to: LonLat, rides: RideStops[], stations: RailStation[], coordsOf: (id: string) => LonLat | null): LonLat[] | null {
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
    found = true;
    const rail = r.mode === 'train' ? railPath(r.from, r.to, stations) : null;
    (rail && rail.length >= 2 ? rail : [a, b]).forEach(push);
  }
  if (!found) return null;
  push(to);
  return out.length >= 2 ? out : null;
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
  };
}

export type RoadRouter = ReturnType<typeof createRoadRouter>;
