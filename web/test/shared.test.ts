import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagGroupsFor, toggleLodgingPlan, toggleTag } from '../src/shared/tagOptions.ts';
import { cardActions } from '../src/shared/cardActions.ts';
import { askAiPrompts } from '../src/shared/askAiPrompts.ts';
import { dayLabel, isRedDay } from '../src/lib/trip.ts';

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
  assert.deepEqual(g[0], ['tags', 'stay', 'unpin', 'move', 'group-in', 'group-out']);
});
test('cardActions：重疊卡最上面是 main、detach', () => assert.deepEqual(cardActions({ kind: 'visit', overlap: true, surface: 'mobile' })[0], ['main', 'detach']));
test('cardActions：出發住宿、航班沒有選單', () => {
  assert.equal(cardActions({ kind: 'lodging-start', surface: 'desktop' }).length, 0);
  assert.equal(cardActions({ kind: 'flight', surface: 'mobile' }).length, 0);
});
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
