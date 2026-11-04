// T42：書架的條件、探索畫哪一種畫面、目前地區、「正在看」的字（interaction-design §18.1）
// T50：書架的順序和名字、「住在這裡」的排法、清單層返回鈕的字

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHELVES, areaOnly, backLabel, currentArea, exploreStage, listScreenLabel, matchShelf, shelfCounts, shelfFilter, shelfOf, shelfRows, stayScore } from '../src/lib/shelves.ts';
import { EMPTY_FILTER, matchesFilter, type Filter } from '../src/lib/filter.ts';
import { placeWith } from './helpers.ts';

const at = (id: string, over: Parameters<typeof placeWith>[1], raw: Record<string, unknown> = {}) => placeWith(raw, { id, area: 'toba', region: 'toba-station', ...over });

const PLACES = [
  at('aquarium', { type: 'spot', tier: 'S' }, { weather: 'indoor' }),
  at('pearl', { type: 'spot', tier: 'A' }, { weather: 'covered' }),
  at('beach', { type: 'spot', tier: 'B' }, { weather: 'outdoor' }),
  at('lookout', { type: 'spot', tier: 'A', region: 'osatsu' }),
  at('big-table', { type: 'restaurant', tier: 'A' }, { group: { fit15: 'yes' } }),
  at('small', { type: 'restaurant', tier: 'S' }, { group: { fit15: 'no' } }),
  at('hotel', { type: 'lodging', tier: 'A' }),
  placeWith({ weather: 'indoor' }, { id: 'ise-museum', area: 'ise', type: 'spot', tier: 'S' }),
];

test('SHELVES（T50）：一定要去、可坐 15 人、住在這裡、下雨也行，每排一行條件', () => {
  assert.deepEqual(
    SHELVES.map((s) => s.title),
    ['一定要去', '可坐 15 人', '住在這裡', '下雨也行'],
  );
  assert.deepEqual(
    SHELVES.map((s) => s.note),
    ['S、A 級景點', '全員能坐一起的餐廳', '包棟、可住 15 人排前面', '室內或有遮蔽的景點'],
  );
});

test('shelfFilter：書架的條件疊在目前地區、子地區上', () => {
  const must = SHELVES.find((s) => s.id === 'must')!;
  assert.deepEqual(shelfFilter(must, { areas: ['toba'], regions: [] }), { ...EMPTY_FILTER, areas: ['toba'], types: ['spot'], tiers: ['S', 'A'] });
  const rain = SHELVES.find((s) => s.id === 'rain')!;
  assert.deepEqual(shelfFilter(rain, { areas: ['toba'], regions: ['osatsu'] }).weather, ['indoor', 'covered']);
});

test('shelfRows：每排推薦順序、只看這區；0 個的那排也列（T64）', () => {
  const rows = shelfRows(PLACES, { areas: ['toba'], regions: [] });
  const byId = Object.fromEntries(rows.map((r) => [r.shelf.id, r.items.map((p) => p.id)]));
  assert.deepEqual(rows.map((r) => r.shelf.id), ['must', 'fit15', 'stay', 'rain']);
  // 同級照評論數、再照 ID
  assert.deepEqual(byId.must, ['aquarium', 'lookout', 'pearl']);
  assert.deepEqual(byId.rain, ['aquarium', 'pearl']);
  assert.deepEqual(byId.fit15, ['big-table']);
  assert.deepEqual(byId.stay, ['hotel']);
  // 選了子地區（相差）：只有一定要去的展望台，其他三排是 0 個（照樣列）
  const osatsu = shelfRows(PLACES, { areas: ['toba'], regions: ['osatsu'] });
  assert.deepEqual(osatsu.map((r) => `${r.shelf.id}:${r.total}`), ['must:1', 'fit15:0', 'stay:0', 'rain:0']);
});

test('shelfRows：一排最多 3 個，total 是全部', () => {
  const many = Array.from({ length: 5 }, (_, i) => at(`s${i}`, { type: 'spot', tier: 'A' }));
  const [must] = shelfRows(many, { areas: ['toba'], regions: [] });
  assert.equal(must.items.length, 3);
  assert.equal(must.total, 5);
});

test('shelfCounts（T52）：概覽的四格數字，0 的也列、順序同 SHELVES', () => {
  const counts = (areas: string[]) => shelfCounts(PLACES, { areas, regions: [] }).map((c) => `${c.shelf.id}:${c.total}`);
  assert.deepEqual(counts(['toba']), ['must:3', 'fit15:1', 'stay:1', 'rain:2']);
  assert.deepEqual(counts(['ise']), ['must:1', 'fit15:0', 'stay:0', 'rain:1']);
});

test('weather 篩選（T58）：景點的 weather 要是選的其中一個，沒判的不算；餐廳、住宿不受影響（同 search_places）', () => {
  const ids = (weather: Filter['weather']) => PLACES.filter((p) => matchesFilter(p, { ...EMPTY_FILTER, weather })).map((p) => p.id);
  assert.deepEqual(ids(['indoor', 'covered']), ['aquarium', 'pearl', 'big-table', 'small', 'hotel', 'ise-museum']);
  assert.deepEqual(ids(['indoor']), ['aquarium', 'big-table', 'small', 'hotel', 'ise-museum']);
  assert.deepEqual(ids(['covered']), ['pearl', 'big-table', 'small', 'hotel']);
});

test('exploreStage：概覽、選了一區、清單', () => {
  assert.equal(exploreStage(EMPTY_FILTER, '', false), 'overview');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'] }, '', false), 'area');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'], regions: ['osatsu'] }, '', false), 'area');
  // 搜尋、其他條件、AI 的結果集、一次好幾區：清單
  assert.equal(exploreStage(EMPTY_FILTER, '水族', false), 'list');
  assert.equal(exploreStage(EMPTY_FILTER, '  ', false), 'overview');
  assert.equal(exploreStage({ ...EMPTY_FILTER, types: ['restaurant'] }, '', false), 'list');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'], weather: ['indoor'] }, '', false), 'list');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'] }, '', true), 'list');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba', 'ise'] }, '', false), 'list');
});

test('currentArea、areaOnly：目前地區只看一區；回到書架只留地區、子地區', () => {
  assert.equal(currentArea({ areas: [] }), null);
  assert.equal(currentArea({ areas: ['toba'] }), 'toba');
  assert.equal(currentArea({ areas: ['toba', 'ise'] }), null);
  const f = { ...EMPTY_FILTER, areas: ['toba'], regions: ['osatsu'], types: ['spot' as const], tiers: ['S' as const] };
  assert.deepEqual(areaOnly(f), { ...EMPTY_FILTER, areas: ['toba'], regions: ['osatsu'] });
});

test('listScreenLabel：正在看的字', () => {
  assert.equal(listScreenLabel('explore', null), '概覽');
  assert.equal(listScreenLabel('explore', '鳥羽'), '鳥羽');
  assert.equal(listScreenLabel('wish', null), '想去');
  assert.equal(listScreenLabel('wish', '鳥羽'), '想去・鳥羽');
});

test('住在這裡（T50）：能包棟、可住 15 人以上的排前面；可住人數在詳情層，給了 full 才看得到', () => {
  const inns = [
    at('plain', { type: 'lodging', tier: 'S' }),
    at('big', { type: 'lodging', tier: 'B' }),
    at('whole', { type: 'lodging', tier: 'B' }, { group: { wholeRental: true } }),
    at('both', { type: 'lodging', tier: 'B' }, { group: { wholeRental: true } }),
  ];
  const detail: Record<string, ReturnType<typeof at>> = {
    big: at('big', { type: 'lodging', tier: 'B' }, { group: { maxGuests: 20 } }),
    both: at('both', { type: 'lodging', tier: 'B' }, { group: { wholeRental: true, maxGuests: 16 } }),
    plain: at('plain', { type: 'lodging', tier: 'S' }, { group: { maxGuests: 6 } }),
  };
  const full = (id: string) => detail[id] ?? null;
  assert.equal(stayScore(inns[3], full), 2);
  assert.equal(stayScore(inns[1], full), 1);
  assert.equal(stayScore(inns[1]), 0);
  const stay = (f?: (id: string) => ReturnType<typeof at> | null) => shelfRows(inns, { areas: ['toba'], regions: [] }, 4, f).find((r) => r.shelf.id === 'stay')!.items.map((p) => p.id);
  // 同分照推薦順序（S 級的 plain 在 B 級前面）
  assert.deepEqual(stay(full), ['both', 'big', 'whole', 'plain']);
  // 詳情還沒讀到：只看包棟
  assert.deepEqual(stay(), ['both', 'whole', 'plain', 'big']);
});

test('backLabel（T50、T64）：條件裡還有一整排書架寫書架名（自己多加的、搜尋不影響），拿掉書架的條件寫「自己篩選」', () => {
  const base = { areas: ['toba'], regions: [] };
  const [must, fit15, stay, rain] = SHELVES;
  assert.equal(backLabel(shelfFilter(must, base)), '一定要去');
  assert.equal(backLabel(shelfFilter(fit15, base)), '可坐 15 人');
  assert.equal(backLabel(shelfFilter(stay, { areas: ['toba'], regions: ['osatsu'] })), '住在這裡');
  // 順序不同也算同一組（手機的條件從 quick 轉回來）
  assert.equal(backLabel({ ...shelfFilter(rain, base), weather: ['covered', 'indoor'] }), '下雨也行');
  // 自己多加條件：還是那排書架
  assert.equal(backLabel({ ...shelfFilter(fit15, base), contexts: ['lunch'] }), '可坐 15 人');
  assert.equal(shelfOf({ ...shelfFilter(must, base), suits: ['elderly'] }), must);
  assert.equal(matchShelf({ ...shelfFilter(must, base), suits: ['elderly'] }), null);
  // 拿掉書架帶來的條件（少了 S 級）、同一欄多選（放寬）：自己篩選
  assert.equal(backLabel({ ...shelfFilter(must, base), tiers: ['A'] }), '自己篩選');
  assert.equal(backLabel({ ...shelfFilter(stay, base), types: ['lodging', 'spot'] }), '自己篩選');
  assert.equal(backLabel({ ...EMPTY_FILTER, ...base, types: ['restaurant'] }), '自己篩選');
});
