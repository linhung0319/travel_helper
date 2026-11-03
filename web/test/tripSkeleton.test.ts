// T45b：整趟骨架的色帶分段、子地區推算、這天在哪一區（移動日、一日遊、只決定一邊）、住宿欄、地圖的晚數、單天頂端
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDayArea, setLodging, setNightArea } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { dayRegions, isUndecided, nightLine, nightsDecided, nightsPerArea, nightsPerAreaDiff, openLodgingRun, skeletonCounts, skeletonDiff, skeletonRows, undecidedRun, whereLabel, placeAreaOf } from '../src/lib/tripSkeleton.ts';
import type { Area, Place } from '../src/data/types.ts';
import { itin, placeWith } from './helpers.ts';
import { areaColor, areaTint } from '../src/lib/areas.ts';

const area = (id: string, zh: string, regions: [string, string][] = []): Area =>
  ({ id, name: { ja: zh, zh, en: null }, center: [0, 0], bbox: [0, 0, 1, 1], regions: regions.map(([rid, rzh]) => ({ id: rid, name: { ja: rzh, zh: rzh, en: null } })) }) as unknown as Area;
const AREAS = [area('shima', '志摩', [['kashikojima', '賢島']]), area('toba', '鳥羽', [['toba-st', '鳥羽站周邊'], ['osatsu', '相差']]), area('ise', '伊勢', [['naiku', '內宮']]), area('kix', '關西機場周邊')];
const P = (id: string, type: Place['type'], a: string | null, region: string | null = null, zh = id) => placeWith({}, { id, type, area: a, region, name: { ja: zh, zh, en: null } });
const PLACES = [
  P('aquarium', 'spot', 'toba', 'toba-st', '鳥羽水族館'),
  P('mikimoto', 'spot', 'toba', 'toba-st', '珍珠島'),
  P('ama', 'spot', 'toba', 'osatsu', '海女小屋'),
  P('naiku', 'spot', 'ise', 'naiku', '內宮'),
  P('toba-inn', 'lodging', 'toba', 'toba-st', '鳥羽國際飯店'),
  P('kix-inn', 'lodging', 'kix', null, '機場飯店'),
];
const byId = new Map(PLACES.map((p) => [p.id, p]));
const D = (n: number) => `2027-02-${String(n).padStart(2, '0')}`;

/** 2/2～2/13 的空行程（12 天、11 晚） */
function empty(): Itinerary {
  return itin(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [D(i + 2), []])));
}

/** 志摩 2 晚（只定區）→ 鳥羽 3 晚（住宿）→ 其他沒決定，最後一晚關西 */
function sample(): Itinerary {
  let it = empty();
  it = setNightArea(it, D(2), 'shima');
  it = setNightArea(it, D(3), 'shima');
  for (const d of [4, 5, 6]) it = setLodging(it, D(d), 'toba-inn', null, 'toba');
  it = setLodging(it, D(12), 'kix-inn', null, 'kix');
  it = setDayArea(it, D(6), 'ise');
  it.days.find((d) => d.date === D(5))!.items = ['aquarium', 'mikimoto', 'ama'].map((place) => ({ id: `x:${place}`, type: 'visit' as const, options: [{ place }], selected: 0 }));
  return it;
}

test('色帶：連住同一區連成一段（top、mid、bot），一晚自己 one；沒決定的晚上也連成一段虛線；最後一天沒有色帶', () => {
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId });
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.map((r) => r.rail && `${r.rail.area ?? '?'}:${r.rail.pos}`), [
    'shima:top', 'shima:bot', 'toba:top', 'toba:mid', 'toba:bot', '?:top', '?:mid', '?:mid', '?:mid', '?:bot', 'kix:one', null,
  ]);
});

test('這天在哪一區：同區、移動日、一日遊、只決定一邊、最後一天用前一晚', () => {
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId });
  const where = Object.fromEntries(rows.map((r) => [r.date.slice(8), r.where]));
  assert.equal(where['02'], '志摩'); // 第一天沒有前一晚，用這晚的
  assert.equal(where['03'], '志摩');
  assert.equal(where['04'], '志摩 → 鳥羽');
  assert.equal(where['05'], '鳥羽');
  assert.equal(where['06'], '鳥羽（去伊勢一日）');
  assert.equal(where['07'], '鳥羽 → ？');
  assert.equal(where['08'], null);
  assert.equal(where['12'], '？ → 關西機場周邊');
  assert.equal(where['13'], '關西機場周邊');
});

test('whereLabel：只有一日遊、兩晚都沒決定時寫那一區', () => {
  const it = setDayArea(empty(), D(8), 'ise');
  assert.equal(whereLabel(it, D(8), AREAS, placeAreaOf(byId)), '伊勢');
});

test('子地區：照排了的點的順序，連續相同的併成一個；沒排是空的；住宿、機場不算', () => {
  const it = sample();
  assert.deepEqual(dayRegions(it, D(5), AREAS, byId), ['鳥羽站周邊', '相差']);
  assert.deepEqual(dayRegions(it, D(4), AREAS, byId), []); // 只有住宿
  it.days.find((d) => d.date === D(7))!.items = ['aquarium', 'ama', 'mikimoto'].map((place) => ({ id: `y:${place}`, type: 'visit' as const, options: [{ place }], selected: 0 }));
  assert.deepEqual(dayRegions(it, D(7), AREAS, byId), ['鳥羽站周邊', '相差', '鳥羽站周邊']);
  assert.deepEqual(dayRegions(it, '2027-03-01', AREAS, byId), []);
});

test('住宿欄：選了住宿（預約狀態看連住的第一晚）、只定區、都沒有；最後一天是 null', () => {
  const booking = (id: string, date: string) => (id === 'toba-inn' && date === D(4) ? ('booked' as const) : undefined);
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId, booking });
  assert.deepEqual(rows[0].stay, { kind: 'area', area: 'shima' });
  assert.deepEqual(rows[3].stay, { kind: 'lodging', id: 'toba-inn', name: '鳥羽國際飯店', booking: 'booked' });
  assert.deepEqual(rows[4].stay, { kind: 'lodging', id: 'toba-inn', name: '鳥羽國際飯店', booking: 'booked' }); // 連住第二晚照第一晚
  assert.deepEqual(rows[10].stay, { kind: 'lodging', id: 'kix-inn', name: '機場飯店', booking: 'pending' }); // 沒寫過是待訂
  assert.deepEqual(rows[5].stay, { kind: 'none' });
  assert.equal(rows[11].stay, null);
});

test('只選了住宿、沒寫區（舊行程升級上來的）：區照住宿的資料', () => {
  const it = empty();
  it.nights = { [D(2)]: { lodging: 'toba-inn' } };
  const rows = skeletonRows({ itinerary: it, areas: AREAS, byId });
  assert.equal(rows[0].nightArea, 'toba');
  assert.equal(rows[0].rail?.area, 'toba');
});

test('地圖的晚數、決定了幾晚', () => {
  const it = sample();
  assert.deepEqual(nightsPerArea(it, AREAS, byId), [{ area: 'shima', nights: 2 }, { area: 'toba', nights: 3 }, { area: 'kix', nights: 1 }]);
  assert.deepEqual(nightsDecided(it, byId), { total: 11, decided: 6 });
});

test('單天頂端：這晚的區、連住第幾晚、住宿；還沒決定、最後一天是 null', () => {
  const it = sample();
  assert.deepEqual(nightLine(it, D(5), AREAS, byId), { area: 'toba', areaName: '鳥羽', index: 2, total: 3, lodging: 'toba-inn' });
  assert.deepEqual(nightLine(it, D(2), AREAS, byId), { area: 'shima', areaName: '志摩', index: 1, total: 2, lodging: null });
  assert.equal(nightLine(it, D(8), AREAS, byId), null);
  assert.equal(nightLine(it, D(13), AREAS, byId), null);
});

test('地區的顏色照 areas 的順序；找不到是灰、白', () => {
  assert.equal(areaColor(AREAS, 'shima'), '#24468a');
  assert.equal(areaColor(AREAS, 'toba'), '#3d6a22');
  assert.equal(areaColor(AREAS, null), '#a3a9b8');
  assert.equal(areaTint(AREAS, 'nope'), '#ffffff');
});

test('看提議（T48）：骨架照提議之後畫，有變的格子給舊值；沒變的列不列', () => {
  const before = sample();
  let after = before;
  for (const d of [9, 10, 11]) after = setNightArea(after, D(d), 'ise');
  after = setLodging(after, D(3), 'toba-inn', null, 'toba');
  const rowsAfter = skeletonRows({ itinerary: after, areas: AREAS, byId });
  const diff = skeletonDiff(rowsAfter, skeletonRows({ itinerary: before, areas: AREAS, byId }), AREAS);
  // 2/9～2/11 原本沒決定 → 伊勢
  assert.deepEqual(diff.get(D(9)), { where: { before: null }, area: { before: null }, stay: { before: null } });
  assert.equal(rowsAfter.find((r) => r.date === D(9))!.nightArea, 'ise');
  // 2/3 志摩只定區 → 鳥羽國際飯店：這晚的住宿、2/3 和 2/4 在哪一區都變了
  assert.deepEqual(diff.get(D(3))?.stay, { before: '未選住宿' });
  assert.deepEqual(diff.get(D(3))?.area, { before: '志摩' });
  assert.equal(diff.get(D(3))?.where?.before, '志摩');
  assert.equal(diff.get(D(4))?.where?.before, '志摩 → 鳥羽');
  assert.equal(diff.get(D(4))?.stay, undefined);
  // 沒變的
  assert.equal(diff.has(D(5)), false);
  assert.equal(diff.has(D(13)), false);
});

test('看提議（T48）：地圖的晚數照提議之後算，晚數有變的區標 changed', () => {
  const before = sample();
  let after = before;
  for (const d of [9, 10, 11]) after = setNightArea(after, D(d), 'ise');
  assert.deepEqual(nightsPerAreaDiff(after, before, AREAS, byId), [
    { area: 'shima', nights: 2, changed: false },
    { area: 'toba', nights: 3, changed: false },
    { area: 'ise', nights: 3, changed: true },
    { area: 'kix', nights: 1, changed: false },
  ]);
});

test('整趟的數字（T54）：幾晚、區幾晚、住宿幾晚、已訂幾晚', () => {
  const booking = (id: string, date: string) => (id === 'toba-inn' && date === D(4) ? ('booked' as const) : id === 'kix-inn' ? ('skip' as const) : undefined);
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId, booking });
  assert.deepEqual(skeletonCounts(rows), { total: 11, areas: 6, lodgings: 4, booked: 3 });
  assert.deepEqual(skeletonCounts(skeletonRows({ itinerary: empty(), areas: AREAS, byId })), { total: 11, areas: 0, lodgings: 0, booked: 0 });
});

test('每晚的狀態（T54）：未選區、未選住宿、待訂、已訂；「只看還沒決定的」留未選區、未選住宿的晚上', () => {
  const booking = (id: string, date: string) => (id === 'toba-inn' && date === D(4) ? ('booked' as const) : undefined);
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId, booking });
  const state = (r: (typeof rows)[number]) => (!r.stay ? null : r.stay.kind === 'none' ? '未選區' : r.stay.kind === 'area' ? '未選住宿' : r.stay.booking);
  assert.deepEqual(rows.map(state), ['未選住宿', '未選住宿', 'booked', 'booked', 'booked', '未選區', '未選區', '未選區', '未選區', '未選區', 'pending', null]);
  assert.deepEqual(rows.filter(isUndecided).map((r) => r.date), [D(2), D(3), D(7), D(8), D(9), D(10), D(11)]);
});

test('連著好幾晚沒決定區（T54 的「都套用」）：整段；有區、只有一晚、最後一天是 null', () => {
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId });
  const run = [D(7), D(8), D(9), D(10), D(11)];
  assert.deepEqual(undecidedRun(rows, D(7)), run);
  assert.deepEqual(undecidedRun(rows, D(9)), run);
  assert.equal(undecidedRun(rows, D(2)), null);
  assert.equal(undecidedRun(rows, D(13)), null);
  const one = skeletonRows({ itinerary: setNightArea(setNightArea(sample(), D(8), 'ise'), D(10), 'ise'), areas: AREAS, byId });
  assert.equal(undecidedRun(one, D(9)), null);
  assert.equal(undecidedRun(one, D(11)), null);
});

test('一次套好幾晚（T54）：setNightArea 依序套那一段，每晚都住那區', () => {
  let it = sample();
  for (const d of [7, 8, 9]) it = setNightArea(it, D(d), 'ise');
  const rows = skeletonRows({ itinerary: it, areas: AREAS, byId });
  assert.deepEqual(rows.slice(5, 9).map((r) => r.nightArea), ['ise', 'ise', 'ise', null]);
  assert.deepEqual(undecidedRun(rows, D(10)), [D(10), D(11)]);
});

test('問 AI 推薦帶的晚上（T54）：從這晚起同一區還沒選住宿的連續晚上', () => {
  const rows = skeletonRows({ itinerary: sample(), areas: AREAS, byId });
  assert.deepEqual(openLodgingRun(rows, D(2)), [D(2), D(3)]);
  assert.deepEqual(openLodgingRun(rows, D(3)), [D(3)]);
  assert.deepEqual(openLodgingRun(rows, D(4)), []);
  assert.deepEqual(openLodgingRun(rows, D(8)), []);
});
