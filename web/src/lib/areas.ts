// 區域相關的計算。區域一律從 areas.json 來，這裡不出現任何區域 ID（PLAN T11「區域不寫死」）。

import { haversineMeters } from './geo/distance.ts';
import type { Area, Bbox, LonLat, Place } from '../data/types.ts';

/** 兩個 bbox 最近的距離（公尺）；重疊時是 0 */
export function bboxGapMeters(a: Bbox, b: Bbox): number {
  const lon = a[2] < b[0] ? [a[2], b[0]] : b[2] < a[0] ? [b[2], a[0]] : null;
  const lat = a[3] < b[1] ? [a[3], b[1]] : b[3] < a[1] ? [b[3], a[1]] : null;
  if (!lon && !lat) return 0;
  const midLat = (Math.max(a[1], b[1]) + Math.min(a[3], b[3])) / 2;
  const p1: LonLat = [lon ? lon[0] : 0, lat ? lat[0] : midLat];
  const p2: LonLat = [lon ? lon[1] : 0, lat ? lat[1] : midLat];
  return haversineMeters(p1, p2);
}

/** bbox 之間距離在這以內的區域算同一群（伊勢志摩各區互相重疊；關西機場周邊在 100 km 以外） */
export const AREA_GROUP_GAP_METERS = 30_000;

/**
 * 把距離近的區域分成一群（union-find）。
 * 地圖的初始範圍用資料點最多的那一群，之後加了大阪也會自動和關西機場周邊同一群。
 */
export function groupAreas(areas: Area[], gapMeters = AREA_GROUP_GAP_METERS): Area[][] {
  const parent = areas.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      if (bboxGapMeters(areas[i].bbox, areas[j].bbox) <= gapMeters) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Area[]>();
  areas.forEach((a, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), a]);
  });
  return [...groups.values()];
}

/** 一組座標的範圍；沒有座標回傳 null */
export function extentOf(coords: LonLat[]): Bbox | null {
  if (coords.length === 0) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    s = Math.min(s, lat);
    e = Math.max(e, lon);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

export function unionBbox(boxes: Bbox[]): Bbox | null {
  return extentOf(boxes.flatMap((b) => [[b[0], b[1]] as LonLat, [b[2], b[3]] as LonLat]));
}

/**
 * 某幾個區域在地圖上的範圍：用資料點的分布（areas.json 的 bbox 是行政界、含很大一片海，只用來檢查座標），
 * 沒有資料點時才用 bbox。
 */
export function areasExtent(areas: Area[], places: Place[]): Bbox | null {
  const ids = new Set(areas.map((a) => a.id));
  return extentOf(places.filter((p) => p.area && ids.has(p.area)).map((p) => p.coords)) ?? unionBbox(areas.map((a) => a.bbox));
}

/** 初始範圍：資料點最多的那一群區域 */
export function initialExtent(areas: Area[], places: Place[]): Bbox | null {
  const count = (g: Area[]) => {
    const ids = new Set(g.map((a) => a.id));
    return places.filter((p) => p.area && ids.has(p.area)).length;
  };
  const groups = groupAreas(areas).sort((a, b) => count(b) - count(a));
  return groups.length ? areasExtent(groups[0], places) : null;
}

// 區域的顏色依 tripOrder 的順序配，不綁區域 ID
const AREA_PALETTE = ['#0a8f8f', '#cf222e', '#9a6700', '#bf3989', '#1f6feb', '#6639ba', '#1a7f37', '#bc4c00'];

export function areaColor(areas: Area[], areaId: string | null): string {
  const i = areas.findIndex((a) => a.id === areaId);
  return i < 0 ? '#57606a' : AREA_PALETTE[i % AREA_PALETTE.length];
}

export function inBbox([lon, lat]: LonLat, [w, s, e, n]: Bbox): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
