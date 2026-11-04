// T43：探索地圖的分層（縮遠收起哪些點）、選區範圍的形狀（interaction-design §21）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA_BUFFER_METERS, areaFocusShape, convexHull, DETAIL_ZOOM, hullAround, isKeyPlace, isMinorOnMap, mapTierAt, REGION_ZOOM_MAX, regionShapes, shapeLabelAt, type LayerContext } from '../src/lib/mapLayers.ts';
import { haversineMeters } from '../src/lib/geo/distance.ts';
import { placeWith } from './helpers.ts';
import type { Area, LonLat } from '../src/data/types.ts';

const far: LayerContext = { explore: true, detailed: false, area: null, listing: false };
const spotS = placeWith({}, { id: 's', type: 'spot', tier: 'S', area: 'toba' });
const spotA = placeWith({}, { id: 'a', type: 'spot', tier: 'A', area: 'ise' });
const spotB = placeWith({}, { id: 'b', type: 'spot', tier: 'B', area: 'ise' });
const food = placeWith({}, { id: 'r', type: 'restaurant', tier: 'S', area: 'toba' });
const inn = placeWith({}, { id: 'l', type: 'lodging', tier: 'A', area: 'ise' });

test('S、A 級景點才算縮遠也畫的點；S 級的餐廳、住宿不算', () => {
  assert.equal(isKeyPlace(spotS), true);
  assert.equal(isKeyPlace(spotA), true);
  assert.equal(isKeyPlace(spotB), false);
  assert.equal(isKeyPlace(food), false);
  assert.equal(isKeyPlace(inn), false);
  assert.equal(isKeyPlace(placeWith({}, { type: 'spot', tier: null })), false);
});

test('縮遠的概覽：只留 S、A 級景點', () => {
  assert.deepEqual(
    [spotS, spotA, spotB, food, inn].map((p) => isMinorOnMap(p, true, far)),
    [false, false, true, true, true],
  );
});

test('放大、行程、想去都不分層', () => {
  for (const ctx of [{ ...far, detailed: true }, { ...far, explore: false }]) {
    assert.equal(isMinorOnMap(food, true, ctx), false);
    assert.equal(isMinorOnMap(spotB, false, ctx), false);
  }
});

test('選了一區：那區的點都畫，其他區照分層', () => {
  const ctx = { ...far, area: 'toba' };
  assert.equal(isMinorOnMap(food, true, ctx), false);
  assert.equal(isMinorOnMap(inn, false, ctx), true);
  assert.equal(isMinorOnMap(spotA, false, ctx), false);
});

test('清單（搜尋、篩選）：符合的照樣畫，不符合的照分層', () => {
  const ctx = { ...far, listing: true };
  assert.equal(isMinorOnMap(inn, true, ctx), false);
  assert.equal(isMinorOnMap(inn, false, ctx), true);
});

test('凸包：裡面的點拿掉，共線的點拿掉', () => {
  const h = convexHull([
    [0, 0],
    [2, 0],
    [1, 0],
    [2, 2],
    [0, 2],
    [1, 1],
  ]);
  assert.equal(h.length, 4);
  assert.ok(!h.some(([x]) => x === 1));
});

/** 點到多邊形邊界的最短距離（公尺；用頂點近似，頂點夠密） */
const minDist = (ring: LonLat[], p: LonLat) => Math.min(...ring.map((q) => haversineMeters(p, q)));

test('範圍：每個點都在裡面，離邊界大約 1 km（圓角）', () => {
  const coords: LonLat[] = [
    [136.84, 34.48],
    [136.9, 34.45],
    [136.88, 34.52],
    [136.86, 34.49], // 在裡面
  ];
  const poly = hullAround(coords)!;
  const ring = poly.coordinates[0] as LonLat[];
  assert.deepEqual(ring[0], ring[ring.length - 1], '封閉');
  for (const c of coords.slice(0, 3)) {
    const d = minDist(ring, c);
    assert.ok(d > AREA_BUFFER_METERS * 0.97 && d < AREA_BUFFER_METERS * 1.05, `外圍的點離邊 ${d.toFixed(0)} m`);
  }
  // 裡面的點離邊比 1 km 遠
  assert.ok(minDist(ring, coords[3]) > AREA_BUFFER_METERS);
});

test('範圍：一個點是半徑 1 km 的圓；沒有點是 null', () => {
  const ring = hullAround([[136.8, 34.5]])!.coordinates[0] as LonLat[];
  for (const q of ring) {
    const d = haversineMeters([136.8, 34.5], q);
    assert.ok(Math.abs(d - AREA_BUFFER_METERS) < 10, `${d}`);
  }
  assert.equal(hullAround([]), null);
});

test('選區範圍只用那區的點；沒選、那區沒有點是 null', () => {
  const places = [
    placeWith({}, { id: 'x', area: 'toba', coords: [136.84, 34.48] }),
    placeWith({}, { id: 'y', area: 'toba', coords: [136.9, 34.45] }),
    placeWith({}, { id: 'z', area: 'ise', coords: [136.72, 34.48] }),
  ];
  const f = areaFocusShape(places, 'toba')!;
  assert.equal(f.properties?.area, 'toba');
  const ring = f.geometry.coordinates[0] as LonLat[];
  // 伊勢的點離鳥羽的範圍很遠
  assert.ok(minDist(ring, [136.72, 34.48]) > 8000);
  assert.equal(areaFocusShape(places, null), null);
  assert.equal(areaFocusShape(places, 'osaka'), null);
});

test('選了子地區（T56）：只畫子地區的點外圍，整區其他的點在外面', () => {
  const places = [
    placeWith({}, { id: 'x', area: 'toba', region: 'toba-center', coords: [136.84, 34.48] }),
    placeWith({}, { id: 'w', area: 'toba', region: 'toba-center', coords: [136.85, 34.49] }),
    placeWith({}, { id: 'y', area: 'toba', region: 'toba-south', coords: [136.9, 34.42] }),
    placeWith({}, { id: 'z', area: 'ise', region: 'toba-center', coords: [136.72, 34.48] }), // 別區不算（防呆）
  ];
  const f = areaFocusShape(places, 'toba', 'toba-center')!;
  assert.deepEqual(f.properties, { area: 'toba', region: 'toba-center' });
  const ring = f.geometry.coordinates[0] as LonLat[];
  // 同一區、子地區以外的點不在範圍旁邊
  assert.ok(minDist(ring, [136.9, 34.42]) > 5000);
  assert.ok(minDist(ring, [136.72, 34.48]) > 8000);
  // 子地區沒有點是 null；沒給子地區是整區
  assert.equal(areaFocusShape(places, 'toba', 'nowhere'), null);
  assert.equal(areaFocusShape(places, 'toba')!.properties?.region, null);
});

test('子地區只有 1 個點：半徑 1 km 的圓；標籤放在最北的那一點', () => {
  const places = [placeWith({}, { id: 'x', area: 'shima', region: 'goza', coords: [136.82, 34.28] })];
  const f = areaFocusShape(places, 'shima', 'goza')!;
  const ring = f.geometry.coordinates[0] as LonLat[];
  for (const q of ring) assert.ok(Math.abs(haversineMeters([136.82, 34.28], q) - AREA_BUFFER_METERS) < 10);
  const at = shapeLabelAt(f.geometry);
  assert.ok(Math.abs(haversineMeters([136.82, 34.28], at) - AREA_BUFFER_METERS) < 10);
  assert.ok(ring.every((q) => q[1] <= at[1]));
  assert.ok(Math.abs(at[0] - 136.82) < 0.001, '正北');
});

test('哪個縮放畫哪一層（T65）：縮遠地區名、中間子地區、放大只看點', () => {
  assert.equal(mapTierAt(9), 'areas');
  assert.equal(mapTierAt(DETAIL_ZOOM - 0.01), 'areas');
  assert.equal(mapTierAt(DETAIL_ZOOM), 'regions');
  assert.equal(mapTierAt(12), 'regions');
  assert.equal(mapTierAt(REGION_ZOOM_MAX - 0.01), 'regions');
  assert.equal(mapTierAt(REGION_ZOOM_MAX), 'points');
  assert.equal(mapTierAt(15), 'points');
});

test('所有子地區的範圍（T65）：每個有點的子地區一個形狀、名字在上緣；選了的子地區、沒有點的不畫', () => {
  const area = (id: string, regions: string[]): Area =>
    ({ id, name: { ja: id, zh: id }, center: [136.8, 34.4], bbox: [136, 34, 137, 35], regions: regions.map((r) => ({ id: r, name: { ja: `${r}ja`, zh: `${r}名` } })) }) as Area;
  const areas = [area('toba', ['toshijima', 'osatsu', 'empty']), area('ise', ['naiku'])];
  const places = [
    placeWith({}, { id: 't1', area: 'toba', region: 'toshijima', coords: [136.88, 34.52] }),
    placeWith({}, { id: 't2', area: 'toba', region: 'toshijima', coords: [136.9, 34.51] }),
    placeWith({}, { id: 'o1', area: 'toba', region: 'osatsu', coords: [136.91, 34.37] }),
    placeWith({}, { id: 'n1', area: 'ise', region: 'naiku', coords: [136.72, 34.45] }),
    placeWith({}, { id: 'x', area: 'ise', region: null, coords: [136.7, 34.5] }),
  ];
  const color = (a: string) => (a === 'toba' ? '#123456' : '#654321');
  const all = regionShapes(places, areas, color);
  assert.deepEqual(
    all.shapes.map((f) => f.properties),
    [
      { area: 'toba', region: 'toshijima', name: 'toshijima名', color: '#123456' },
      { area: 'toba', region: 'osatsu', name: 'osatsu名', color: '#123456' },
      { area: 'ise', region: 'naiku', name: 'naiku名', color: '#654321' },
    ],
  );
  assert.equal(all.labels.length, 3);
  // 名字在範圍最北的那一點
  assert.deepEqual(all.labels[0].geometry.coordinates, shapeLabelAt(all.shapes[0].geometry));
  assert.ok(all.labels[0].geometry.coordinates[1] > 34.52);
  // 選了答志島：T56 自己畫，這裡不再畫
  assert.deepEqual(
    regionShapes(places, areas, color, 'toshijima').shapes.map((f) => f.properties?.region),
    ['osatsu', 'naiku'],
  );
});
