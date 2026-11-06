// lib/shelves.ts 留下的小工具（目前地區、「正在看」的字）和書架區段靠的篩選欄位（住法、天氣）。
// T79 起舊的書架（SHELVES、兩級退、scopeCounts、exploreStage…）刪掉，區段的測試在 sections.test.ts。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentArea, listScreenLabel } from '../src/lib/shelves.ts';
import { EMPTY_FILTER, fitsWholeGroup, matchesFilter, matchesStay, placeStayKind, type Filter } from '../src/lib/filter.ts';
import { mealsCaption, placeBadges, stayCaption } from '../src/lib/badges.ts';
import { placeWith } from './helpers.ts';

const at = (id: string, over: Parameters<typeof placeWith>[1], raw: Record<string, unknown> = {}) => placeWith(raw, { id, area: 'toba', region: 'toba-station', ...over });

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


test('住法（T66、T69）：包棟住得下、旅館飯店 5 間房以上住得下全團，其他要分開住（三種住宿各一例）', () => {
  const whole16 = at('whole16', { type: 'lodging' }, { kind: 'rental-house', meals: 'none', group: { wholeRental: true, maxGuests: 16 } });
  const ryokan = at('ryokan', { type: 'lodging' }, { kind: 'ryokan', meals: 'dinner+breakfast', group: { totalRooms: 12 } });
  const whole8 = at('whole8', { type: 'lodging' }, { kind: 'rental-house', meals: 'varies', group: { wholeRental: true, maxGuests: 8 } });
  const minshuku = at('minshuku', { type: 'lodging' }, { kind: 'minshuku', group: { totalRooms: 6 } });
  const tinyHotel = at('tiny-hotel', { type: 'lodging' }, { kind: 'hotel', group: { totalRooms: 3 } });
  const unknownHotel = at('hotel-unknown', { type: 'lodging' }, { kind: 'hotel' });

  assert.deepEqual([whole16, ryokan, whole8, minshuku, tinyHotel, unknownHotel].map(placeStayKind), ['whole', 'hotel', 'multi', 'other', 'hotel', 'hotel']);
  // 民宿房間再多也不算旅館飯店；旅館 5 間以下、房數不明都要分開住
  assert.deepEqual([whole16, ryokan, whole8, minshuku, tinyHotel, unknownHotel].map(fitsWholeGroup), [true, true, false, false, false, false]);

  const all = [whole16, ryokan, whole8, minshuku, tinyHotel, unknownHotel];
  // 面板的「民宿」（T69）：不能包棟的民宿；以前住法三顆都篩不到
  assert.deepEqual(all.filter((p) => matchesStay(p, 'other')).map((p) => p.id), ['minshuku']);
  // 列的第二行、詳情的住法那句：住法＋餐食
  const cap = (id: string) => {
    const p = all.find((x) => x.id === id)!;
    const meals = mealsCaption(p);
    return [stayCaption(p)?.label, meals].filter(Boolean).join(' · ');
  };
  assert.equal(cap('whole16'), '包棟 · 16 人 · 全團一棟 · 不含餐');
  // T69：旅館、飯店直接寫房數（不寫「全團住得下」）；包棟住不下寫「要分住」（不寫棟數）
  assert.equal(cap('ryokan'), '旅館 · 12 間房 · 一泊二食');
  assert.equal(cap('whole8'), '包棟 · 8 人 · 要分住 · 可選');
  assert.equal(cap('minshuku'), '民宿 · 6 間房');
  assert.equal(cap('hotel-unknown'), '飯店 · 房數不明');

  // 標章同樣寫法
  assert.deepEqual(placeBadges(ryokan).map((b) => b.label), ['旅館 · 12 間房', '一泊二食']);
  assert.equal(stayCaption(at('whole5', { type: 'lodging' }, { kind: 'rental-house', group: { wholeRental: true, maxGuests: 5 } }))!.label, '包棟 · 5 人 · 要分住');
});

test('weather 篩選（T58、T66）：rain 是室內、有遮蔽都算；沒判的不算；餐廳、住宿不受影響（同 search_places）', () => {
  const ids = (weather: Filter['weather']) => PLACES.filter((p) => matchesFilter(p, { ...EMPTY_FILTER, weather })).map((p) => p.id);
  assert.deepEqual(ids(['rain']), ['aquarium', 'pearl', 'big-table', 'small', 'hotel', 'ise-museum']);
  assert.deepEqual(ids(['indoor', 'covered']), ids(['rain']));
  assert.deepEqual(ids(['indoor']), ['aquarium', 'big-table', 'small', 'hotel', 'ise-museum']);
  assert.deepEqual(ids(['covered']), ['pearl', 'big-table', 'small', 'hotel']);
});

test('currentArea：目前地區只看一區', () => {
  assert.equal(currentArea({ areas: [] }), null);
  assert.equal(currentArea({ areas: ['toba'] }), 'toba');
  assert.equal(currentArea({ areas: ['toba', 'ise'] }), null);
});

test('listScreenLabel：正在看的字', () => {
  assert.equal(listScreenLabel('explore', null), '概覽');
  assert.equal(listScreenLabel('explore', '鳥羽'), '鳥羽');
  assert.equal(listScreenLabel('wish', null), '想去');
  assert.equal(listScreenLabel('wish', '鳥羽'), '想去・鳥羽');
});
