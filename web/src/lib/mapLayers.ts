// 探索的地圖分層（T43，interaction-design §21）：縮遠只畫地區標籤和 S、A 級景點；選了一區畫那區的範圍（凸包往外擴、圓角）。
// 純邏輯，MapView 讀。區域一律從 areas.json／資料點來，不寫死區域 ID。

import type { Feature, Polygon } from 'geojson';
import type { LonLat, Place } from '../data/types.ts';

/** 縮放到這裡以上（看一區）才畫全部的點、拿掉地區標籤；以下只畫 S、A 級景點 */
export const DETAIL_ZOOM = 11;

/** 選區範圍往外擴多少（公尺） */
export const AREA_BUFFER_METERS = 1000;

/** 縮遠時也畫的點：S、A 級景點 */
export function isKeyPlace(p: Pick<Place, 'type' | 'tier'>): boolean {
  return p.type === 'spot' && (p.tier === 'S' || p.tier === 'A');
}

export interface LayerContext {
  /** 探索分頁（行程、想去不分層） */
  explore: boolean;
  /** 縮放 >= DETAIL_ZOOM */
  detailed: boolean;
  /** 目前選的一區（currentArea）；沒有是 null */
  area: string | null;
  /** 探索是清單（搜尋、AI 結果集、面板的條件）：符合條件的點照樣畫 */
  listing: boolean;
}

/** 這個點縮遠時收起來（不畫、點不到）。match：符合探索的篩選和搜尋 */
export function isMinorOnMap(p: Pick<Place, 'type' | 'tier' | 'area'>, match: boolean, ctx: LayerContext): boolean {
  if (!ctx.explore || ctx.detailed || isKeyPlace(p)) return false;
  if (ctx.area && p.area === ctx.area) return false;
  if (ctx.listing && match) return false;
  return true;
}

const EARTH = 6_371_000;

/** 凸包（Andrew monotone chain），回傳逆時針、不重複起點 */
export function convexHull(pts: [number, number][]): [number, number][] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length <= 2) return s;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * 一組座標外圍包起來的形狀：凸包往外擴 bufferMeters、圓角（每個凸包頂點放一圈圓，再取凸包＝凸包和圓的閔可夫斯基和）。
 * 在中心點附近用等距投影換成公尺算，區域只有幾十公里，誤差可以不管。沒有座標回傳 null。
 */
export function hullAround(coords: LonLat[], bufferMeters = AREA_BUFFER_METERS, segments = 24): Polygon | null {
  if (!coords.length) return null;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const kx = (Math.PI / 180) * EARTH * Math.cos((lat0 * Math.PI) / 180);
  const ky = (Math.PI / 180) * EARTH;
  const toXY = ([lon, lat]: LonLat): [number, number] => [(lon - lon0) * kx, (lat - lat0) * ky];
  const toLL = ([x, y]: [number, number]): LonLat => [x / kx + lon0, y / ky + lat0];
  const core = convexHull(coords.map(toXY));
  const ring: [number, number][] = [];
  for (const [x, y] of core) {
    for (let i = 0; i < segments; i++) {
      const t = (2 * Math.PI * i) / segments;
      ring.push([x + bufferMeters * Math.cos(t), y + bufferMeters * Math.sin(t)]);
    }
  }
  const out = convexHull(ring).map(toLL);
  return { type: 'Polygon', coordinates: [[...out, out[0]]] };
}

/**
 * 選了一區時的範圍：那區所有的點（含自己加的）外圍。選了子地區（T56）只畫子地區的點外圍，整區不畫；
 * 只有一兩個點時是 1 km 的圓角形（hullAround 本來就是）。沒有點回傳 null
 */
export function areaFocusShape(places: Place[], area: string | null, region: string | null = null): Feature<Polygon> | null {
  if (!area) return null;
  const inside = places.filter((p) => p.area === area && (!region || p.region === region));
  const poly = hullAround(inside.map((p) => p.coords));
  return poly ? { type: 'Feature', geometry: poly, properties: { area, region } } : null;
}

/** 子地區名的小標籤放哪（T56）：範圍最北的那一點（標籤的底邊貼在框的上緣，不蓋住裡面的點） */
export function shapeLabelAt(poly: Polygon): LonLat {
  const ring = poly.coordinates[0] as LonLat[];
  return ring.reduce((best, c) => (c[1] > best[1] ? c : best), ring[0]);
}
