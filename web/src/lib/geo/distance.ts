// 直線距離（haversine）。座標一律是 [經度, 緯度]，和 GeoJSON、MapLibre、data/ 的 coords 相同。

export type LonLat = [number, number];

/** 地球平均半徑（公尺，IUGG） */
export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** 兩點的直線（大圓）距離，單位公尺 */
export function haversineMeters(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isLonLat(v: unknown): v is LonLat {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x)) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

/**
 * 看起來像是把 [緯度, 經度] 寫反了（以日本附近為準：經度 122～154、緯度 20～46）。
 * 只是提示用，不保證正確。
 */
export function looksSwapped([x, y]: LonLat): boolean {
  const isLon = (v: number) => v >= 122 && v <= 154;
  const isLat = (v: number) => v >= 20 && v <= 46;
  return isLat(x) && isLon(y) && !(isLon(x) && isLat(y));
}
