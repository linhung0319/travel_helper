// 把 JSON 檔的內容整理成介面用的形狀。純函式，本機和 API 兩種實作共用，也方便測試。

import { CONTEXTS, PLACE_TYPES, TIERS, type Area, type Context, type Place, type PlaceType, type Tier } from './types.ts';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toCoords(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lon, lat] = v;
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 一筆資料點；格式不對（沒有 id、類別不認得、沒有座標）回傳 null */
export function normalizePlace(item: unknown): Place | null {
  if (!isObject(item)) return null;
  const type = item.type;
  if (typeof type !== 'string' || !(PLACE_TYPES as readonly string[]).includes(type)) return null;
  if (typeof item.id !== 'string') return null;
  const coords = toCoords(item.coords);
  if (!coords) return null;
  const tier = str(item.tier);
  return {
    id: item.id,
    type: type as PlaceType,
    name: isObject(item.name) ? (item.name as unknown as Place['name']) : { ja: item.id },
    area: str(item.area),
    region: str(item.region),
    coords,
    tier: tier && (TIERS as readonly string[]).includes(tier) ? (tier as Tier) : null,
    photos: arr<Record<string, unknown>>(item.photos).filter((p) => isObject(p) && typeof p.url === 'string') as unknown as Place['photos'],
    summary: isObject(item.summary) && typeof item.summary.text === 'string' ? (item.summary as unknown as Place['summary']) : null,
    assessment: isObject(item.assessment) && isObject(item.assessment.scores) ? (item.assessment as unknown as Place['assessment']) : null,
    hours: isObject(item.hours) ? (item.hours as Place['hours']) : null,
    closedNote: str(item.closedNote),
    febNote: str(item.febNote),
    closures: arr<Place['closures'][number]>(item.closures).filter(isObject),
    contexts: arr<string>(item.contexts).filter((c): c is Context => (CONTEXTS as readonly string[]).includes(c)),
    tags: arr<string>(item.tags).filter((t) => typeof t === 'string'),
    cuisine: arr<string>(item.cuisine).filter((t) => typeof t === 'string'),
    anchors: arr<Place['anchors'][number]>(item.anchors).filter((a) => isObject(a) && typeof a.id === 'string'),
    links: isObject(item.links) ? (item.links as Place['links']) : {},
    sources: arr<Place['sources'][number]>(item.sources).filter(isObject),
    raw: item,
    edited: {},
    origin: 'base',
    user: null,
  };
}

/** 清單檔（最外層是陣列）裡的資料點 */
export function normalizePlaceList(content: unknown): Place[] {
  if (!Array.isArray(content)) return [];
  return content.map(normalizePlace).filter((p): p is Place => p !== null);
}

/** areas.json → 依 tripOrder 排好的區域 */
export function normalizeAreas(content: unknown): Area[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(isObject)
    .filter((a) => typeof a.id === 'string' && toCoords(a.center) && Array.isArray(a.bbox) && a.bbox.length === 4)
    .map((a) => a as unknown as Area)
    .sort((a, b) => (a.tripOrder ?? 99) - (b.tripOrder ?? 99));
}

/** 顯示用的名稱：中文優先，沒有就日文 */
export function displayName(name: { ja: string; zh?: string | null } | undefined, fallback = ''): string {
  return name?.zh || name?.ja || fallback;
}
