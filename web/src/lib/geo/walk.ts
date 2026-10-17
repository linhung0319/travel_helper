// 步行時間估算：直線距離 × 繞路係數 ÷ 每分鐘公尺數 × 團體步行係數

import { haversineMeters, type LonLat } from './distance.ts';

export interface WalkOptions {
  /** 繞路係數：實際路線約是直線的幾倍。預設 1.3 */
  detourFactor?: number;
  /** 步行速度（公尺／分鐘）。預設 80 */
  metersPerMinute?: number;
  /**
   * 團體步行係數：時間要乘上的倍數。預設 1（一般成人）。
   * 長輩、小孩、全員 15 人一起走時要多抓（例如 1.3～1.5），實際數值由 T7 決定。
   */
  groupFactor?: number;
}

export const DEFAULT_WALK: Required<WalkOptions> = {
  detourFactor: 1.3,
  metersPerMinute: 80,
  groupFactor: 1,
};

export interface WalkEstimate {
  /** 直線距離（公尺） */
  straightMeters: number;
  /** 估算的步行距離（直線 × 繞路係數） */
  meters: number;
  /** 估算的步行時間（分鐘，未取整） */
  minutes: number;
}

function resolve(opts: WalkOptions = {}): Required<WalkOptions> {
  const o = { ...DEFAULT_WALK, ...opts };
  for (const [k, v] of Object.entries(o)) {
    if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) throw new RangeError(`${k} 必須是正數，收到 ${v}`);
  }
  return o;
}

/** 已知步行距離（例如 OSRM 的路線距離）→ 分鐘。不再乘繞路係數。 */
export function minutesForMeters(meters: number, opts: WalkOptions = {}): number {
  const o = resolve(opts);
  return (meters / o.metersPerMinute) * o.groupFactor;
}

/** 由直線距離估算步行距離與時間 */
export function estimateWalkFromStraight(straightMeters: number, opts: WalkOptions = {}): WalkEstimate {
  const o = resolve(opts);
  const meters = straightMeters * o.detourFactor;
  return { straightMeters, meters, minutes: (meters / o.metersPerMinute) * o.groupFactor };
}

/** 由兩點座標估算步行距離與時間 */
export function estimateWalk(from: LonLat, to: LonLat, opts: WalkOptions = {}): WalkEstimate {
  return estimateWalkFromStraight(haversineMeters(from, to), opts);
}

/** 顯示用：無條件進位到整數分鐘（最少 1 分鐘） */
export function displayMinutes(minutes: number): number {
  return Math.max(1, Math.ceil(minutes - 1e-9));
}
