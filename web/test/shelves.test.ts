// T42：書架的條件、探索畫哪一種畫面、目前地區、「正在看」的字（interaction-design §18.1）
// T50：書架的順序和名字、清單層返回鈕的字
// T66：書架兩級（第一級 0 個才退第二級）、每級的條件、小字、小卡第二行（interaction-design §32）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHELVES, areaOnly, backLabel, currentArea, exploreStage, listScreenLabel, matchShelf, shelfCounts, shelfFilter, shelfOf, shelfRows, shelfTierOf } from '../src/lib/shelves.ts';
import { EMPTY_FILTER, matchesFilter, placeStay, type Filter } from '../src/lib/filter.ts';
import { placeBadges, stayCaption } from '../src/lib/badges.ts';
import type { Area } from '../src/data/types.ts';
import { placeWith } from './helpers.ts';

const at = (id: string, over: Parameters<typeof placeWith>[1], raw: Record<string, unknown> = {}) => placeWith(raw, { id, area: 'toba', region: 'toba-station', ...over });

const AREAS = [
  {
    id: 'toba',
    name: { zh: '鳥羽', ja: '鳥羽' },
    regions: [
      { id: 'toba-station', name: { zh: '鳥羽站' } },
      { id: 'osatsu', name: { zh: '相差' } },
    ],
  },
] as unknown as Area[];

const PLACES = [
  at('aquarium', { type: 'spot', tier: 'S' }, { weather: 'indoor' }),
  at('pearl', { type: 'spot', tier: 'A' }, { weather: 'covered' }),
  at('beach', { type: 'spot', tier: 'B' }, { weather: 'outdoor' }),
  at('lookout', { type: 'spot', tier: 'A', region: 'osatsu' }),
  at('big-table', { type: 'restaurant', tier: 'A' }, { group: { fit15: 'yes' } }),
  at('small', { type: 'restaurant', tier: 'S' }, { group: { fit15: 'no' } }),
  at('hotel', { type: 'lodging', tier: 'A' }, { kind: 'hotel', group: { totalRooms: 40 } }),
  placeWith({ weather: 'indoor' }, { id: 'ise-museum', area: 'ise', type: 'spot', tier: 'S' }),
];

const base = (regions: string[] = []) => ({ areas: ['toba'], regions });
const row = (places: typeof PLACES, id: string, regions: string[] = []) => shelfRows(places, base(regions), AREAS).find((r) => r.shelf.id === id)!;

test('SHELVES（T50、T66）：一定要去、全員吃飯、住在這裡、下雨也行，每排兩級', () => {
  assert.deepEqual(
    SHELVES.map((s) => s.title),
    ['一定要去', '全員吃飯', '住在這裡', '下雨也行'],
  );
  assert.ok(SHELVES.every((s) => s.tiers.length === 2));
});

test('shelfFilter：書架那一級的條件疊在目前地區、子地區上；下雨也行的第二級是全區', () => {
  const [must, fit15, stay, rain] = SHELVES;
  assert.deepEqual(shelfFilter(must, base()), { ...EMPTY_FILTER, areas: ['toba'], types: ['spot'], tiers: ['S', 'A'] });
  assert.deepEqual(shelfFilter(must, base(), 2).tiers, ['B']);
  assert.deepEqual(shelfFilter(fit15, base()).who, ['all']);
  assert.deepEqual(shelfFilter(fit15, base(), 2).fit15, ['unknown', 'no']);
  assert.deepEqual(shelfFilter(stay, base()).stay, ['whole', 'hotel']);
  assert.deepEqual(shelfFilter(stay, base(), 2).stay, ['split']);
  assert.deepEqual(shelfFilter(rain, base(['osatsu'])).regions, ['osatsu']);
  assert.deepEqual(shelfFilter(rain, base(['osatsu']), 2).regions, []);
  assert.deepEqual(shelfFilter(rain, base(['osatsu'])).weather, ['rain']);
});

test('shelfRows：每排推薦順序、只看這區；第一級有東西就用第一級', () => {
  const rows = shelfRows(PLACES, base(), AREAS);
  const byId = Object.fromEntries(rows.map((r) => [r.shelf.id, r.items.map((p) => p.id)]));
  assert.deepEqual(rows.map((r) => `${r.shelf.id}:${r.tier}`), ['must:1', 'fit15:1', 'stay:1', 'rain:1']);
  // 同級照評論數、再照 ID
  assert.deepEqual(byId.must, ['aquarium', 'lookout', 'pearl']);
  assert.deepEqual(byId.rain, ['aquarium', 'pearl']);
  assert.deepEqual(byId.fit15, ['big-table']);
  assert.deepEqual(byId.stay, ['hotel']);
  assert.ok(rows.every((r) => !r.fallback));
});

test('shelfRows（T66）：第一級 0 個才退到第二級，小字換成「賢島沒有…」；兩級都 0 才是 0', () => {
  // 相差：只有展望台（A 級、沒判天氣）
  const osatsu = shelfRows(PLACES, base(['osatsu']), AREAS);
  assert.deepEqual(osatsu.map((r) => `${r.shelf.id}:${r.tier}:${r.total}`), ['must:1:1', 'fit15:1:0', 'stay:1:0', 'rain:2:2']);
  const rain = osatsu.find((r) => r.shelf.id === 'rain')!;
  assert.equal(rain.note, '相差沒有，這是鳥羽全區的');
  assert.equal(rain.fallback, true);
  assert.deepEqual(rain.filter.regions, []);
  assert.deepEqual(rain.items.map((p) => p.id), ['aquarium', 'pearl']);
  // 兩級都 0：小字照第一級的條件寫
  assert.equal(osatsu.find((r) => r.shelf.id === 'fit15')!.note, '15 人能一起吃的店');
  assert.equal(osatsu.find((r) => r.shelf.id === 'fit15')!.fallback, false);

  // 一定要去：只有 B 級
  const onlyB = [at('b1', { type: 'spot', tier: 'B' }), at('food', { type: 'restaurant', tier: 'S' })];
  const must = row(onlyB, 'must');
  assert.equal(must.tier, 2);
  assert.equal(must.note, '鳥羽沒有 S、A 級，這是 B 級');
  assert.deepEqual(must.items.map((p) => p.id), ['b1']);
  // 「全部 ›」套那一級
  assert.deepEqual(must.filter.tiers, ['B']);
  assert.deepEqual(row([], 'must').total, 0);
});

test('全員吃飯（T66）：第一級 fit15 yes、split 而且收小孩；第二級還沒查、坐不下', () => {
  const shops = [
    at('yes', { type: 'restaurant' }, { group: { fit15: 'yes' } }),
    at('split', { type: 'restaurant' }, { group: { fit15: 'split' }, kids: { allowed: 'unknown' } }),
    at('adults', { type: 'restaurant' }, { group: { fit15: 'yes' }, kids: { allowed: 'age-limit' } }),
    at('no-kids', { type: 'restaurant' }, { group: { fit15: 'split' }, kids: { allowed: 'no' } }),
    at('unknown', { type: 'restaurant' }, { group: { fit15: 'unknown' } }),
    at('blank', { type: 'restaurant' }),
    at('tiny', { type: 'restaurant' }, { group: { fit15: 'no' } }),
  ];
  const first = row(shops, 'fit15');
  assert.equal(first.tier, 1);
  assert.deepEqual(first.items.map((p) => p.id).sort(), ['split', 'yes']);
  assert.equal(first.note, '能坐一起 1 · 要分桌 1');
  assert.deepEqual(first.items.map((p) => first.shelf.caption!(p)).sort(), ['15 人能坐一起', '15 人要分桌']);

  const second = row(shops.slice(2), 'fit15');
  assert.equal(second.tier, 2);
  assert.equal(second.note, '鳥羽沒有容納得下 15 人的店，這些要分組去');
  assert.deepEqual(second.items.map((p) => p.id).sort(), ['blank', 'tiny', 'unknown']);
  assert.deepEqual(second.items.map((p) => second.shelf.caption!(p)).sort(), ['15 人還沒查', '15 人還沒查', '坐不下 15 人']);
});

test('住在這裡（T66）：包棟住得下、旅館飯店 5 間房以上是第一級，其他退到第二級（三種住宿各一例）', () => {
  const whole16 = at('whole16', { type: 'lodging' }, { kind: 'rental-house', meals: 'none', group: { wholeRental: true, maxGuests: 16 } });
  const ryokan = at('ryokan', { type: 'lodging' }, { kind: 'ryokan', meals: 'dinner+breakfast', group: { totalRooms: 12 } });
  const whole8 = at('whole8', { type: 'lodging' }, { kind: 'rental-house', meals: 'varies', group: { wholeRental: true, maxGuests: 8 } });
  const minshuku = at('minshuku', { type: 'lodging' }, { kind: 'minshuku', group: { totalRooms: 6 } });
  const tinyHotel = at('tiny-hotel', { type: 'lodging' }, { kind: 'hotel', group: { totalRooms: 3 } });
  const unknownHotel = at('hotel-unknown', { type: 'lodging' }, { kind: 'hotel' });

  assert.equal(placeStay(whole16), 'whole');
  assert.equal(placeStay(ryokan), 'hotel');
  assert.equal(placeStay(whole8), 'split');
  // 民宿房間再多也不算旅館飯店；旅館 5 間以下、房數不明都要分開住
  assert.equal(placeStay(minshuku), 'split');
  assert.equal(placeStay(tinyHotel), 'split');
  assert.equal(placeStay(unknownHotel), 'split');

  const all = [whole16, ryokan, whole8, minshuku, tinyHotel, unknownHotel];
  const first = row(all, 'stay');
  assert.equal(first.tier, 1);
  assert.deepEqual(first.items.map((p) => p.id).sort(), ['ryokan', 'whole16']);
  assert.equal(first.note, '包棟 1 · 旅館飯店 1');
  const cap = (id: string) => first.shelf.caption!(all.find((p) => p.id === id)!);
  assert.equal(cap('whole16'), '包棟 · 16 人 · 不含餐');
  assert.equal(cap('ryokan'), '旅館 · 全團住得下 · 一泊二食');
  assert.equal(cap('whole8'), '包棟 · 8 人 · 要兩棟 · 可選');
  assert.equal(cap('minshuku'), '民宿 · 6 間房');
  assert.equal(cap('hotel-unknown'), '飯店 · 房數不明');

  const second = row(all.slice(2), 'stay');
  assert.equal(second.tier, 2);
  assert.equal(second.note, '鳥羽沒有一間住得下全團的，這些要分開住');
  assert.equal(second.total, 4);

  // 照片牆、清單的標章同樣寫法
  assert.deepEqual(placeBadges(ryokan).map((b) => b.label), ['旅館 · 全團住得下', '一泊二食']);
  assert.equal(stayCaption(at('whole5', { type: 'lodging' }, { kind: 'rental-house', group: { wholeRental: true, maxGuests: 5 } }))!.label, '包棟 · 5 人 · 要三棟');
});

test('shelfCounts（T52、T66）：概覽的四格數字（第一級 0 個時是第二級的），0 的也列、順序同 SHELVES', () => {
  const counts = (areas: string[]) => shelfCounts(PLACES, { areas, regions: [] }).map((c) => `${c.shelf.id}:${c.tier}:${c.total}`);
  assert.deepEqual(counts(['toba']), ['must:1:3', 'fit15:1:1', 'stay:1:1', 'rain:1:2']);
  // 伊勢：沒有餐廳、住宿
  assert.deepEqual(counts(['ise']), ['must:1:1', 'fit15:1:0', 'stay:1:0', 'rain:1:1']);
});

test('weather 篩選（T58、T66）：rain 是室內、有遮蔽都算；沒判的不算；餐廳、住宿不受影響（同 search_places）', () => {
  const ids = (weather: Filter['weather']) => PLACES.filter((p) => matchesFilter(p, { ...EMPTY_FILTER, weather })).map((p) => p.id);
  assert.deepEqual(ids(['rain']), ['aquarium', 'pearl', 'big-table', 'small', 'hotel', 'ise-museum']);
  assert.deepEqual(ids(['indoor', 'covered']), ids(['rain']));
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
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'], weather: ['rain'] }, '', false), 'list');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'], who: ['all'] }, '', false), 'list');
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

test('backLabel（T50、T64、T66）：條件裡還有一整排書架（哪一級都算）寫書架名，拿掉書架的條件寫「自己篩選」', () => {
  const b = base();
  const [must, fit15, stay, rain] = SHELVES;
  assert.equal(backLabel(shelfFilter(must, b)), '一定要去');
  assert.equal(backLabel(shelfFilter(must, b, 2)), '一定要去');
  assert.deepEqual(shelfTierOf(shelfFilter(must, b, 2)), { shelf: must, tier: 2 });
  assert.equal(backLabel(shelfFilter(fit15, b)), '全員吃飯');
  assert.equal(backLabel(shelfFilter(fit15, b, 2)), '全員吃飯');
  assert.equal(backLabel(shelfFilter(stay, base(['osatsu']))), '住在這裡');
  // 順序不同也算同一組（手機的條件從 quick 轉回來）
  assert.equal(backLabel({ ...shelfFilter(stay, b), stay: ['hotel', 'whole'] }), '住在這裡');
  assert.equal(backLabel(shelfFilter(rain, base(['osatsu']), 2)), '下雨也行');
  // 自己多加條件：還是那排書架
  assert.equal(backLabel({ ...shelfFilter(fit15, b), contexts: ['lunch'] }), '全員吃飯');
  assert.equal(shelfOf({ ...shelfFilter(must, b), suits: ['elderly'] }), must);
  assert.equal(matchShelf({ ...shelfFilter(must, b), suits: ['elderly'] }), null);
  assert.equal(matchShelf(shelfFilter(stay, b, 2)), stay);
  // 拿掉書架帶來的條件（少了 S 級）、同一欄多選（放寬）：自己篩選
  assert.equal(backLabel({ ...shelfFilter(must, b), tiers: ['A'] }), '自己篩選');
  assert.equal(backLabel({ ...shelfFilter(stay, b), types: ['lodging', 'spot'] }), '自己篩選');
  assert.equal(backLabel({ ...EMPTY_FILTER, ...b, types: ['restaurant'] }), '自己篩選');
});
