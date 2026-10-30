// 自己加的點（UserPlace）轉成畫面用的 Place（T31 spec §4、§5）。
// 自己加的點只有名稱、座標、備註：沒查過，所以 tier、營業時間、照片都是空的。

import type { LonLat } from '@travel-helper/engine/types';
import type { UserPlace } from '../../backend/types.ts';
import type { Area, Place } from '../../data/types.ts';

/** 座標落在哪個區域的 bbox（[西, 南, 東, 北]）：第一個符合的，都不在是 null */
export function areaOfCoords(coords: LonLat, areas: Area[]): string | null {
  const [lon, lat] = coords;
  const a = areas.find((x) => lon >= x.bbox[0] && lat >= x.bbox[1] && lon <= x.bbox[2] && lat <= x.bbox[3]);
  return a?.id ?? null;
}

export function userPlaceToPlace(up: UserPlace, areas: Area[]): Place {
  const { data } = up;
  const area = areaOfCoords(data.coords, areas);
  const name = { ja: data.name.ja ?? '', zh: data.name.zh };
  return {
    id: up.id,
    type: up.type,
    name,
    area,
    region: null,
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
    raw: { id: up.id, type: up.type, name, coords: data.coords, area },
    edited: {},
    origin: 'user',
    user: { author: up.author, createdAt: up.createdAt, updatedBy: up.updatedBy, note: data.note ?? null, addedVia: data.addedVia },
  };
}
