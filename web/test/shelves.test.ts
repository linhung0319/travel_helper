// T42：書架的條件、探索畫哪一種畫面、目前地區、「正在看」的字（interaction-design §18.1）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHELVES, areaOnly, currentArea, exploreStage, listScreenLabel, shelfFilter, shelfRows } from '../src/lib/shelves.ts';
import { EMPTY_FILTER, matchesFilter } from '../src/lib/filter.ts';
import { placeWith } from './helpers.ts';

const at = (id: string, over: Parameters<typeof placeWith>[1], raw: Record<string, unknown> = {}) => placeWith(raw, { id, area: 'toba', region: 'toba-station', ...over });

const PLACES = [
  at('aquarium', { type: 'spot', tier: 'S' }, { indoor: true }),
  at('pearl', { type: 'spot', tier: 'A' }, { indoor: true }),
  at('beach', { type: 'spot', tier: 'B' }),
  at('lookout', { type: 'spot', tier: 'A', region: 'osatsu' }),
  at('big-table', { type: 'restaurant', tier: 'A' }, { group: { fit15: 'yes' } }),
  at('small', { type: 'restaurant', tier: 'S' }, { group: { fit15: 'no' } }),
  at('hotel', { type: 'lodging', tier: 'A' }),
  placeWith({ indoor: true }, { id: 'ise-museum', area: 'ise', type: 'spot', tier: 'S' }),
];

test('shelfFilter：書架的條件疊在目前地區、子地區上', () => {
  const must = SHELVES.find((s) => s.id === 'must')!;
  assert.deepEqual(shelfFilter(must, { areas: ['toba'], regions: [] }), { ...EMPTY_FILTER, areas: ['toba'], types: ['spot'], tiers: ['S', 'A'] });
  const rain = SHELVES.find((s) => s.id === 'rain')!;
  assert.deepEqual(shelfFilter(rain, { areas: ['toba'], regions: ['osatsu'] }).indoor, ['yes']);
});

test('shelfRows：每排推薦順序、只看這區；沒東西的那排不列', () => {
  const rows = shelfRows(PLACES, { areas: ['toba'], regions: [] });
  const byId = Object.fromEntries(rows.map((r) => [r.shelf.id, r.items.map((p) => p.id)]));
  // 同級照評論數、再照 ID
  assert.deepEqual(byId.must, ['aquarium', 'lookout', 'pearl']);
  assert.deepEqual(byId.rain, ['aquarium', 'pearl']);
  assert.deepEqual(byId.fit15, ['big-table']);
  assert.deepEqual(byId.stay, ['hotel']);
  // 選了子地區（相差）：只剩一定要去的展望台
  const osatsu = shelfRows(PLACES, { areas: ['toba'], regions: ['osatsu'] });
  assert.deepEqual(osatsu.map((r) => r.shelf.id), ['must']);
  assert.equal(osatsu[0].total, 1);
});

test('shelfRows：一排最多 3 個，total 是全部', () => {
  const many = Array.from({ length: 5 }, (_, i) => at(`s${i}`, { type: 'spot', tier: 'A' }));
  const [must] = shelfRows(many, { areas: ['toba'], regions: [] });
  assert.equal(must.items.length, 3);
  assert.equal(must.total, 5);
});

test('indoor 篩選：只留 indoor 是 true 的', () => {
  const f = { ...EMPTY_FILTER, indoor: ['yes' as const] };
  assert.deepEqual(PLACES.filter((p) => matchesFilter(p, f)).map((p) => p.id), ['aquarium', 'pearl', 'ise-museum']);
});

test('exploreStage：概覽、選了一區、清單', () => {
  assert.equal(exploreStage(EMPTY_FILTER, '', false), 'overview');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'] }, '', false), 'area');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'], regions: ['osatsu'] }, '', false), 'area');
  // 搜尋、其他條件、AI 的結果集、一次好幾區：清單
  assert.equal(exploreStage(EMPTY_FILTER, '水族', false), 'list');
  assert.equal(exploreStage(EMPTY_FILTER, '  ', false), 'overview');
  assert.equal(exploreStage({ ...EMPTY_FILTER, types: ['restaurant'] }, '', false), 'list');
  assert.equal(exploreStage({ ...EMPTY_FILTER, areas: ['toba'], indoor: ['yes'] }, '', false), 'list');
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
