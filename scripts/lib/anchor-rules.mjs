// restaurant-anchors.mjs 的「步行圈／需搭車」判斷（T8e 從 restaurant-anchors.mjs 拆出來，附測試）。
//
// 鳥羽（T4c）是手寫的清單：相差 在 areas.json 是 needsCar，但店、景點、住宿都在同一個步行圈裡，所以照清單。
// 其他區域（伊勢、二見、志摩……）沒有手寫清單，照 areas.json 的 needsCar：false → 步行圈，true 或沒寫 → 需搭車。

export const TOBA_WALK_REGIONS = new Set([
  'toba-station', 'nakanogo', 'osatsu', 'toshijima', 'sugashima', 'kamishima',
  '鳥羽站周邊', '中之郷', '相差', '離島（答志島）', '離島（菅島）', '離島（神島）', // T7b 之前的 extra.region
]);

// areas：data/areas.json（陣列，每個區域有 regions[{ id, needsCar }]）
export function needsCarMap(areas) {
  const m = new Map();
  for (const a of areas) for (const r of a.regions ?? []) m.set(r.id, r.needsCar);
  return m;
}

export function isWalkRegion(area, region, needsCar) {
  if (area === 'toba') return TOBA_WALK_REGIONS.has(region);
  return needsCar.get(region) === false;
}
