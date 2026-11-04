import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagGroupsFor, toggleLodgingPlan, toggleTag } from '../src/shared/tagOptions.ts';
import { cardActions } from '../src/shared/cardActions.ts';
import { askAiPrompts } from '../src/shared/askAiPrompts.ts';
import { dayLabel, isRedDay, tripDates } from '../src/lib/trip.ts';
import { dayGridCells } from '../src/shared/dayGrid.ts';
import { placePopover } from '../src/lib/popover.ts';
import { FILTER_GROUPS, appliedChips, groupDimmed } from '../src/shared/filterOptions.ts';
import { EMPTY_FILTER } from '../src/lib/filter.ts';
import type { Area } from '../src/data/types.ts';

test('toggleTag：全員、分組互斥', () => {
  assert.deepEqual(toggleTag(['groups', 'lunch'], 'all'), ['lunch', 'all']);
  assert.deepEqual(toggleTag(['lunch', 'all'], 'all'), ['lunch']);
});
test('toggleTag：用餐可以多選', () => assert.deepEqual(toggleTag(['breakfast'], 'lunch'), ['breakfast', 'lunch']));
test('tagGroupsFor：車站沒有誰去', () => assert.deepEqual(tagGroupsFor('station').map((g) => g.id), ['meal', 'plan']));
test('tagGroupsFor：景、餐三組都有', () => assert.equal(tagGroupsFor('spot').length, 3));
test('toggleLodgingPlan：再點一次回到 null', () => assert.equal(toggleLodgingPlan('breakfast', 'breakfast'), null));
test('toggleLodgingPlan：換一個方案', () => assert.equal(toggleLodgingPlan('breakfast', 'none'), 'none'));
test('cardActions：一般卡沒有 delete、有 withdraw', () => {
  const flat = cardActions({ kind: 'visit', surface: 'desktop' }).flat();
  assert.ok(flat.includes('withdraw'));
  assert.ok(!flat.includes('delete'));
  assert.ok(!flat.includes('stay'));
});
test('cardActions：手機版有 stay、分組動作', () => {
  const g = cardActions({ kind: 'visit', pinned: true, inGroup: true, groupTargets: [{ splitId: 's', groupId: 'g', name: 'A' }], surface: 'mobile' });
  assert.deepEqual(g[0], ['tags', 'stay', 'unpin', 'reorder', 'move', 'group-in', 'group-out']);
});
test('cardActions：visit 有 reorder，在 move 前面', () => {
  const mid = cardActions({ kind: 'visit', surface: 'mobile' })[0];
  assert.ok(mid.includes('reorder'));
  assert.ok(mid.indexOf('reorder') < mid.indexOf('move'));
  assert.ok(cardActions({ kind: 'visit', surface: 'desktop' })[0].includes('reorder'));
});
test('cardActions：重疊卡最上面是 main、detach', () => assert.deepEqual(cardActions({ kind: 'visit', overlap: true, surface: 'mobile' })[0], ['main', 'detach']));
test('cardActions：出發住宿、航班沒有選單', () => {
  assert.equal(cardActions({ kind: 'lodging-start', surface: 'desktop' }).length, 0);
  assert.equal(cardActions({ kind: 'flight', surface: 'mobile' }).length, 0);
});
test('cardActions：分組是調整順序、移到第幾天、刪除', () => assert.deepEqual(cardActions({ kind: 'split', surface: 'desktop' }), [['reorder', 'move'], ['delete']]));
test('cardActions：自由時間也能調整順序，在 move 前面', () => assert.deepEqual(cardActions({ kind: 'free', surface: 'mobile' }), [['free-length', 'reorder', 'move'], ['delete']]));
test('cardActions：別人的候選不能移天', () => assert.ok(!cardActions({ kind: 'candidate', mine: false, surface: 'desktop' }).flat().includes('move')));
test('askAiPrompts：行程打開多一題、其他類型用景點', () => {
  assert.equal(askAiPrompts('restaurant', true)[0], '這天排它會不會太趕？');
  assert.deepEqual(askAiPrompts('station', false), askAiPrompts('spot', false));
});
test('isRedDay', () => {
  assert.equal(isRedDay('2027-02-06'), true);
  assert.equal(isRedDay('2027-02-07'), true);
  assert.equal(isRedDay('2027-02-11'), true);
  assert.equal(isRedDay('2027-02-10'), false);
});
test('dayLabel 不寫假日', () => assert.equal(dayLabel('2027-02-11'), '2/11（四）'));
test('placePopover：靠右下角時往上、往左翻', () => {
  const p = placePopover({ left: 1180, top: 760, right: 1260, bottom: 790, width: 80, height: 30 }, { w: 300, h: 200 }, { w: 1280, h: 800 });
  assert.ok(p.left + 300 <= 1280 - 8);
  assert.ok(p.top + 200 <= 760);
});
test('placePopover：預設在下面、左緣對齊', () => {
  assert.deepEqual(placePopover({ left: 100, top: 100, right: 180, bottom: 130, width: 80, height: 30 }, { w: 300, h: 200 }, { w: 1280, h: 800 }), { left: 100, top: 136 });
});
test('placePopover：比視窗還大時夾在離邊緣 8px 的地方', () => {
  assert.deepEqual(placePopover({ left: 2, top: 2, right: 20, bottom: 20, width: 18, height: 18 }, { w: 300, h: 900 }, { w: 400, h: 800 }), { left: 8, top: 8 });
});

test('dayGridCells：已排不能取消、現在灰掉、週末紅字', () => {
  const c = dayGridCells(tripDates(), { picked: ['2027-02-06'], scheduled: ['2027-02-05'], current: '2027-02-02' });
  assert.equal(c.length, 12);
  assert.equal(c.find((x) => x.date === '2027-02-05')!.state, 'scheduled');
  assert.equal(c.find((x) => x.date === '2027-02-02')!.state, 'current');
  assert.equal(c.find((x) => x.date === '2027-02-06')!.state, 'picked');
  assert.deepEqual(c.filter((x) => x.red).map((x) => x.date), ['2027-02-06', '2027-02-07', '2027-02-11', '2027-02-13']);
  assert.equal(c[0].label, '2/2'); assert.equal(c[0].weekday, '二');
});

const AREAS = [
  { id: 'toba', name: { ja: '鳥羽', zh: '鳥羽' }, tripOrder: 2, center: [136.8, 34.4], bbox: [136.7, 34.3, 136.9, 34.5] },
] as unknown as Area[];

test('FILTER_GROUPS：順序、想去只有想去分頁有；地區不在面板裡（T42、T57、T66）', () => {
  assert.deepEqual(FILTER_GROUPS.map((g) => g.id), ['type', 'group', 'lodging', 'weather', 'suits', 'context', 'wish', 'tier', 'map']);
  const opts = (id: string) => FILTER_GROUPS.find((g) => g.id === id)!.options(AREAS, 'explore');
  assert.deepEqual(FILTER_GROUPS.find((g) => g.id === 'group')!.title, '誰吃（餐廳）');
  assert.deepEqual(opts('group').map((o) => o.label), ['全員 15 人', '分組 4～6 人']);
  assert.deepEqual(opts('lodging').map((o) => o.label), ['包棟・一棟全團', '旅館飯店・全團住得下', '要分開住']);
  assert.deepEqual(opts('suits').map((o) => o.label), ['長輩', '小孩', '不用搭車']);
  assert.deepEqual(FILTER_GROUPS.find((g) => g.id === 'context')!.title, '用餐');
  assert.deepEqual(opts('context').find((o) => o.value === 'transit'), { value: 'transit', label: '車站旁', note: '主要車站走路 5 分內' });
  const wish = FILTER_GROUPS.find((g) => g.id === 'wish')!;
  assert.deepEqual(wish.options([], 'explore'), []);
  assert.deepEqual(wish.options([], 'wish').map((o) => o.label), ['只看我按的']);
  assert.deepEqual(wish.options([], 'wish').map((o) => o.value), ['mine']);
  assert.equal(FILTER_GROUPS.find((g) => g.id === 'map')!.desktopOnly, true);
  assert.deepEqual(FILTER_GROUPS.find((g) => g.id === 'weather')!.options(AREAS, 'explore'), [
    { value: 'rain', label: '下雨也行' },
  ]);
});
test('groupDimmed：選了景點時餐廳、住宿的組變淡（反過來也是）；沒選類型都不淡', () => {
  const dimmed = (types: ('spot' | 'restaurant' | 'lodging')[]) => FILTER_GROUPS.filter((g) => groupDimmed(g, types)).map((g) => g.id);
  assert.deepEqual(dimmed([]), []);
  assert.deepEqual(dimmed(['spot']), ['group', 'lodging', 'context']);
  assert.deepEqual(dimmed(['restaurant']), ['lodging', 'weather', 'suits']);
  assert.deepEqual(dimmed(['lodging']), ['group', 'weather', 'suits', 'context']);
  assert.deepEqual(dimmed(['spot', 'restaurant']), ['lodging']);
});
test('appliedChips：含類型，不含地區、子地區（在外面一列）', () => {
  const f = { ...EMPTY_FILTER, types: ['restaurant' as const], areas: ['toba'], regions: ['toba-station'], fit15: ['yes' as const], weather: ['covered' as const], who: ['all' as const], stay: ['whole' as const] };
  const chips = appliedChips(f, AREAS);
  assert.deepEqual(chips.map((c) => c.key), ['types', 'who', 'fit15', 'stay', 'weather']);
  assert.deepEqual(chips.map((c) => c.label).slice(1), ['全員 15 人', '可容納 15 人', '包棟・一棟全團', '有遮蔽']);
});

// rowHighlights 的測試在 placeSummary.test.ts（T44b 改成這團的標章）
