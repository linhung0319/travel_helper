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

// 繞路倍數超過、但人工看過地圖或 Google 步行路線確定是真的要繞（中間隔著海灣、河口）的組合：照 OSRM。
// 鳥羽（T4c，2026-10-17）原本寫在 restaurant-anchors.mjs，T9e 搬過來並加志摩（Google Maps 步行路線確認，2026-10-19）。
// key 是 `${餐廳 id}>${anchor id}`。
export const REAL_DETOURS = new Set([
  // 浦村：三ノ浦、今浦一帶和海の博物館之間隔著浦村灣，要沿灣繞
  'toba-motokaki>toba-sea-folk-museum',
  'toba-yoshiyu-suisan>toba-sea-folk-museum',
  'toba-marugen-suisan>toba-sea-folk-museum',
  // 中之郷站一帶和安楽島的鳥羽シーサイドホテル、亀の井ホテル之間隔著鳥羽灣的入江，要繞約 3 km
  'toba-nishikiya>toba-seaside-hotel',
  'toba-cafeterrace-orange>toba-seaside-hotel',
  'toba-nishikiya>toba-kamenoi-hotel',
  'toba-cafeterrace-orange>toba-kamenoi-hotel',
  // 志摩（T9e）：英虞湾、立神浦隔開，Google 步行路線和 OSRM 一致
  'shima-kashikojima-cc-restaurant>shima-yokoyama-observatory', // Google 5.6 km、OSRM 5.4 km
  'shima-marena-french>shima-chichukaimura', // Google 9.0 km、OSRM 9.1 km
  'shima-makinoki>shima-yadokari', // Google 6.5 km、OSRM 6.4 km
  'shima-shosuke>shima-tomoyama-park', // Google 7.4 km、OSRM 7.3 km
  // 迫子（地中海村）↔ 賢島：Google 9.5 km（RIAS→賢島站），隔著英虞湾；地中海村 的海上計程車另計
  'shima-rias-by-cococha>kashikojima',
  'shima-rias-by-cococha>shima-kashikojima-harbor',
  'shima-rias-by-cococha>shima-hotel-bay-garden',
  'shima-taberna-azul>kashikojima',
  'shima-taberna-azul>shima-kashikojima-harbor',
  'shima-taberna-azul>shima-hotel-bay-garden',
  // 的矢（西岸）↔ 渡鹿野島対岸渡船のりば（東岸、的矢湾 BBQ 的集合地）：Google 10.0 km（かきテラス）、OSRM 10.8 km
  'shima-matoya-kaki-terrace>shima-matoya-bbq-cruise',
  'shima-ikadaso-sanjo-dining>shima-matoya-bbq-cruise',
  'shima-tachibana-dining>shima-matoya-bbq-cruise',
  'shima-hashimoto>shima-matoya-bbq-cruise',
  'shima-marusada-dining>shima-matoya-bbq-cruise',
]);

// 離島上的店（T9e）：只和同一個島上的資料點算步行，其他（本土的車站、景點、住宿）不放進 anchors。
// OSRM 會把島上的點吸附到對岸的道路，算出不存在的路線；直線估算也會讓人以為走得到。
// key 是餐廳 id，值是同島的資料點 id。
export const ISLAND_ONLY = new Map([
  // 鮨裕禅（間崎島，MOKU ISESHIMA）：賢島港搭送迎船
  ['shima-sushi-yuzen', new Set(['shima-mazakijima'])],
  // 福寿荘（渡鹿野島）：對岸の渡船のりば 搭渡船；同島的住宿 わたかの荘、はいふう
  ['shima-fukujuso-dining', new Set(['shima-fukujuso', 'shima-watakanoso', 'shima-haifu'])],
]);

// 'osrm'：照 OSRM（真的要繞）；'skip'：不放；null：照一般規則
export function pairRule(fromId, toId) {
  const k = `${fromId}>${toId}`;
  const island = ISLAND_ONLY.get(fromId);
  if (island && !island.has(toId)) return 'skip';
  if (REAL_DETOURS.has(k)) return 'osrm';
  return null;
}
