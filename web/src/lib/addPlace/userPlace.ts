// 自己加的點（UserPlace）轉成畫面用的 Place（T31 spec §4、§5）。
// 自己加的點只有名稱、座標、備註：沒查過，所以 tier、營業時間、照片都是空的。
// 子地區（region）照最近的官方點：引擎靠它判斷離島（島上走路、和本土之間只能搭船）和要不要包車。

import type { LonLat } from '@travel-helper/engine/types';
import type { UserPlace } from '../../backend/types.ts';
import type { Area, Place } from '../../data/types.ts';
import { haversineMeters } from '../geo/index.ts';

/** 找子地區時，最近的官方點最遠可以多遠（公尺）；再遠就不給（null） */
export const REGION_NEAREST_MAX_M = 1500;

/** 座標最近的官方點（有 region 的）的子地區；REGION_NEAREST_MAX_M 內都沒有是 null */
export function regionOfCoords(coords: LonLat, places: readonly Place[]): string | null {
  let best: { region: string; d: number } | null = null;
  for (const p of places) {
    if (!p.region || p.origin === 'user' || !p.coords) continue;
    const d = haversineMeters(coords, p.coords);
    if (d <= REGION_NEAREST_MAX_M && (!best || d < best.d)) best = { region: p.region, d };
  }
  return best?.region ?? null;
}

/** 座標落在哪個區域的 bbox（[西, 南, 東, 北]）：第一個符合的，都不在是 null */
export function areaOfCoords(coords: LonLat, areas: Area[]): string | null {
  const [lon, lat] = coords;
  const a = areas.find((x) => lon >= x.bbox[0] && lat >= x.bbox[1] && lon <= x.bbox[2] && lat <= x.bbox[3]);
  return a?.id ?? null;
}

/** base：官方的點（找子地區用）；沒給時 region 是 null */
export function userPlaceToPlace(up: UserPlace, areas: Area[], base: readonly Place[] = []): Place {
  const { data } = up;
  const area = areaOfCoords(data.coords, areas);
  const region = regionOfCoords(data.coords, base);
  const name = { ja: data.name.ja ?? '', zh: data.name.zh };
  return {
    id: up.id,
    type: up.type,
    name,
    area,
    region,
    coords: data.coords,
    tier: null,
    photos: [],
    summary: null,
    assessment: null,
    hours: null,
    closedNote: null,
    febNote: null,
    closures: [],
    contexts: [],
    tags: [],
    cuisine: [],
    anchors: [],
    links: { googleMaps: data.links?.googleMaps ?? null },
    sources: [],
    // 給引擎的 PlaceRecord 形狀
    raw: { id: up.id, type: up.type, name, coords: data.coords, area, ...(region ? { region } : {}) },
    edited: {},
    origin: 'user',
    user: { author: up.author, createdAt: up.createdAt, updatedBy: up.updatedBy, note: data.note ?? null, addedVia: data.addedVia, deletedAt: up.deletedAt },
  };
}
