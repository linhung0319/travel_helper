// 找最近的車站（直線距離），附估算步行時間

import { haversineMeters, isLonLat, type LonLat } from './distance.ts';
import { estimateWalkFromStraight, type WalkEstimate, type WalkOptions } from './walk.ts';

/** stations.json 的一筆（只用到這幾個欄位） */
export interface StationLike {
  id: string;
  coords: LonLat | null;
  operator?: string;
}

export interface NearestOptions extends WalkOptions {
  /** 回傳幾站。預設 3 */
  limit?: number;
  /** 只看某個業者，例如 "kintetsu"、"jr"；可以給陣列 */
  operator?: string | string[];
  /** 排除直線距離超過這個值（公尺）的車站 */
  maxMeters?: number;
}

export interface NearestResult<S extends StationLike = StationLike> {
  station: S;
  /** 直線距離（公尺） */
  distanceMeters: number;
  walk: WalkEstimate;
}

export function nearestStations<S extends StationLike>(
  point: LonLat,
  stations: readonly S[],
  opts: NearestOptions = {},
): NearestResult<S>[] {
  const { limit = 3, operator, maxMeters = Infinity, ...walkOpts } = opts;
  const ops = operator == null ? null : Array.isArray(operator) ? operator : [operator];
  return stations
    .filter((s) => isLonLat(s.coords) && (ops == null || (s.operator != null && ops.includes(s.operator))))
    .map((s) => ({ station: s, distanceMeters: haversineMeters(point, s.coords as LonLat) }))
    .filter((r) => r.distanceMeters <= maxMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.station.id.localeCompare(b.station.id))
    .slice(0, limit)
    .map((r) => ({ ...r, walk: estimateWalkFromStraight(r.distanceMeters, walkOpts) }));
}
