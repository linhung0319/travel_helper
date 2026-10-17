// 實際步行路線：查公開的 OSRM（routing.openstreetmap.de 的 foot profile），結果快取。
// 查不到時改用直線估算（source = "estimate"），估算結果不寫進快取，下次會再試。
//
// 這個模組不碰檔案系統：快取透過 RouteCache 介面注入。
// Node 端的檔案快取（data/cache/routes/）在 scripts/lib/route-cache.mjs；
// 前端可以用 routeCacheKey() 算出檔名，直接讀已經快取好的 JSON。

import { haversineMeters, type LonLat } from './distance.ts';
import { estimateWalkFromStraight, minutesForMeters, type WalkOptions } from './walk.ts';

export const OSRM_FOOT_BASE = 'https://routing.openstreetmap.de/routed-foot';
/** 快取 key 的座標精度（小數位數）。5 位約 1 公尺 */
export const KEY_DECIMALS = 5;
/** 呼叫公開 API 的最小間隔（毫秒）。routing.openstreetmap.de 的使用規範要求低頻使用 */
export const DEFAULT_MIN_INTERVAL_MS = 1100;

export type RouteSource = 'osrm' | 'estimate';

/** 快取檔的內容（data/cache/routes/<key>.json） */
export interface CachedRoute {
  key: string;
  profile: 'foot';
  source: 'osrm';
  /** 四捨五入後的起點、終點（[經度, 緯度]） */
  from: LonLat;
  to: LonLat;
  /** OSRM 的路線距離（公尺），不含吸附距離 */
  distanceMeters: number;
  /** 起點、終點各自到最近道路的距離（公尺，OSRM waypoints[].distance） */
  snapMeters: [number, number];
  /** OSRM 回傳的時間（秒），以 OSRM 自己的步行速度算 */
  osrmDurationSeconds: number;
  geometry: { type: 'LineString'; coordinates: LonLat[] };
  retrieved: string;
  sources: { type: 'osm'; url: string; retrieved: string; note: string }[];
}

export interface RouteCache {
  get(key: string): CachedRoute | null | Promise<CachedRoute | null>;
  set(key: string, value: CachedRoute): void | Promise<void>;
}

export interface WalkRoute {
  source: RouteSource;
  from: LonLat;
  to: LonLat;
  straightMeters: number;
  /** 步行距離：osrm 是路線距離 + 起訖點到道路的吸附距離；estimate 是直線 × 繞路係數 */
  meters: number;
  /** 起點、終點到最近道路的距離；太大（例如超過 50 m）代表座標可能在海上、建物或園區內，結果不準。estimate 時為 null */
  snapMeters: [number, number] | null;
  /** 步行時間（分鐘，未取整）：距離 ÷ 步速 × 團體步行係數，兩種來源算法一致 */
  minutes: number;
  /** OSRM 原始時間（秒）；estimate 時為 null */
  osrmDurationSeconds: number | null;
  geometry: { type: 'LineString'; coordinates: LonLat[] } | null;
  /** 資料取得日期；estimate 時是今天 */
  retrieved: string;
  /** 是否來自快取 */
  cached: boolean;
  /** 改用估算時的原因 */
  error?: string;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface RouteClientOptions {
  cache?: RouteCache;
  /** 預設用全域 fetch；測試時注入 mock */
  fetch?: FetchLike;
  baseUrl?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  /** 瀏覽器不能設定 User-Agent，只在 Node 端有效 */
  userAgent?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  today?: () => string;
}

export interface RouteRequestOptions extends WalkOptions {
  /** 忽略快取、重新查詢（成功的話覆寫快取） */
  refresh?: boolean;
  /** 不呼叫 API：有快取用快取，沒有就估算 */
  offline?: boolean;
}

const round = (v: number, d = KEY_DECIMALS): number => Number(v.toFixed(d));
const roundPoint = ([lon, lat]: LonLat, d = KEY_DECIMALS): LonLat => [round(lon, d), round(lat, d)];

/** 快取 key（也是檔名，不含 .json）。同樣的起訖點（四捨五入到約 1 公尺）一定得到同樣的 key。 */
export function routeCacheKey(from: LonLat, to: LonLat): string {
  const f = (p: LonLat) => roundPoint(p).map((v) => v.toFixed(KEY_DECIMALS)).join('_');
  return `foot_${f(from)}__${f(to)}`;
}

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function osrmRouteUrl(from: LonLat, to: LonLat, baseUrl = OSRM_FOOT_BASE): string {
  // routing.openstreetmap.de 的每個 profile 是獨立的伺服器，網址裡的 profile 名稱固定寫 driving
  return `${baseUrl}/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson&steps=false`;
}

function parseOsrm(body: unknown): { distance: number; duration: number; coordinates: LonLat[]; snap: [number, number] } {
  const b = body as {
    code?: string;
    message?: string;
    routes?: { distance?: unknown; duration?: unknown; geometry?: { coordinates?: unknown } }[];
    waypoints?: { distance?: unknown }[];
  };
  if (b?.code !== 'Ok') throw new Error(`OSRM 回傳 ${b?.code ?? '格式不明'}${b?.message ? `：${b.message}` : ''}`);
  const r = b.routes?.[0];
  const coordinates = r?.geometry?.coordinates;
  if (!r || typeof r.distance !== 'number' || typeof r.duration !== 'number' || !Array.isArray(coordinates)) {
    throw new Error('OSRM 回傳沒有路線');
  }
  const snapOf = (i: number): number => {
    const d = b.waypoints?.[i]?.distance;
    return typeof d === 'number' && Number.isFinite(d) ? d : 0;
  };
  return { distance: r.distance, duration: r.duration, coordinates: coordinates as LonLat[], snap: [snapOf(0), snapOf(1)] };
}

function fromCached(c: CachedRoute, straightMeters: number, opts: WalkOptions, cached: boolean): WalkRoute {
  const snap: [number, number] = c.snapMeters ?? [0, 0];
  const meters = c.distanceMeters + snap[0] + snap[1];
  return {
    source: 'osrm',
    from: c.from,
    to: c.to,
    straightMeters,
    meters,
    minutes: minutesForMeters(meters, opts),
    snapMeters: snap,
    osrmDurationSeconds: c.osrmDurationSeconds,
    geometry: c.geometry,
    retrieved: c.retrieved,
    cached,
  };
}

export function createRouteClient(clientOpts: RouteClientOptions = {}) {
  const {
    cache,
    baseUrl = OSRM_FOOT_BASE,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    timeoutMs = 15000,
    userAgent,
    now = () => Date.now(),
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    today = () => localDate(),
  } = clientOpts;
  const doFetch: FetchLike | undefined = clientOpts.fetch ?? (globalThis.fetch as FetchLike | undefined);
  let lastRequestAt = -Infinity;
  let apiCalls = 0;
  // 同一個 client 的請求排成一列，確保間隔
  let queue: Promise<unknown> = Promise.resolve();

  async function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastRequestAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = now();
      apiCalls++;
      return fn();
    });
    queue = run.catch(() => undefined);
    return run;
  }

  async function walkRoute(from: LonLat, to: LonLat, opts: RouteRequestOptions = {}): Promise<WalkRoute> {
    const { refresh = false, offline = false, ...walkOpts } = opts;
    const key = routeCacheKey(from, to);
    const rFrom = roundPoint(from);
    const rTo = roundPoint(to);
    const straightMeters = haversineMeters(from, to);

    if (cache && !refresh) {
      const hit = await cache.get(key);
      if (hit) return fromCached(hit, straightMeters, walkOpts, true);
    }

    const estimate = (error?: string): WalkRoute => {
      const e = estimateWalkFromStraight(straightMeters, walkOpts);
      return {
        source: 'estimate',
        from: rFrom,
        to: rTo,
        straightMeters,
        meters: e.meters,
        minutes: e.minutes,
        snapMeters: null,
        osrmDurationSeconds: null,
        geometry: null,
        retrieved: today(),
        cached: false,
        ...(error ? { error } : {}),
      };
    };

    if (offline) return estimate('離線模式，沒有快取');
    if (!doFetch) return estimate('沒有 fetch 可用');

    const url = osrmRouteUrl(rFrom, rTo, baseUrl);
    try {
      const body = await throttled(async () => {
        const res = await doFetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      const r = parseOsrm(body);
      const date = today();
      const entry: CachedRoute = {
        key,
        profile: 'foot',
        source: 'osrm',
        from: rFrom,
        to: rTo,
        distanceMeters: Math.round(r.distance * 10) / 10,
        snapMeters: [Math.round(r.snap[0] * 10) / 10, Math.round(r.snap[1] * 10) / 10],
        osrmDurationSeconds: Math.round(r.duration * 10) / 10,
        geometry: { type: 'LineString', coordinates: r.coordinates.map((p) => roundPoint(p, 6)) },
        retrieved: date,
        sources: [
          {
            type: 'osm',
            url,
            retrieved: date,
            note: 'OSRM foot profile（FOSSGIS routing.openstreetmap.de）；路網資料 © OpenStreetMap contributors',
          },
        ],
      };
      if (cache) await cache.set(key, entry);
      return fromCached(entry, straightMeters, walkOpts, false);
    } catch (e) {
      return estimate(`OSRM 查詢失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    walkRoute,
    /** 這個 client 實際呼叫 API 的次數 */
    get apiCalls() {
      return apiCalls;
    },
  };
}

export type RouteClient = ReturnType<typeof createRouteClient>;

/** 記憶體快取（前端或測試用） */
export function memoryRouteCache(initial: Record<string, CachedRoute> = {}): RouteCache & { store: Map<string, CachedRoute> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: (key) => store.get(key) ?? null,
    set: (key, value) => {
      store.set(key, value);
    },
  };
}
