import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore } from '../src/store.ts';
import { EMPTY_FILTER } from '../src/lib/filter.ts';

test('store 的初始狀態', () => {
  const s = createAppStore().getState();
  assert.equal(s.day, 'all');
  assert.deepEqual(s.filter, EMPTY_FILTER);
  assert.equal(s.mode, 'map');
  assert.equal(s.planning, false);
  assert.deepEqual(s.selection, []);
});

test('篩選：toggle 加上、再 toggle 取消；clearFilter 全部清掉', () => {
  const store = createAppStore();
  store.getState().toggleFilter('types', 'restaurant');
  store.getState().toggleFilter('tiers', 'S');
  assert.deepEqual(store.getState().filter.types, ['restaurant']);
  store.getState().toggleFilter('types', 'restaurant');
  assert.deepEqual(store.getState().filter.types, []);
  assert.deepEqual(store.getState().filter.tiers, ['S']);
  store.getState().clearFilter();
  assert.deepEqual(store.getState().filter, EMPTY_FILTER);
});

test('開詳情：小卡片收起；關詳情', () => {
  const store = createAppStore();
  store.getState().openPreview('a');
  store.getState().openDetail('a');
  assert.equal(store.getState().previewId, null);
  assert.equal(store.getState().detailId, 'a');
  store.getState().closeDetail();
  assert.equal(store.getState().detailId, null);
});

test('選取（問 AI）不重複；移動地圖的請求每次 seq 加 1', () => {
  const store = createAppStore();
  store.getState().addToSelection('a');
  store.getState().addToSelection('a');
  store.getState().addToSelection('b');
  assert.deepEqual(store.getState().selection, ['a', 'b']);
  store.getState().removeFromSelection('a');
  assert.deepEqual(store.getState().selection, ['b']);
  store.getState().moveCamera({ center: [1, 2] });
  store.getState().moveCamera({ bbox: [0, 0, 1, 1] });
  assert.equal(store.getState().camera?.seq, 2);
  assert.deepEqual(store.getState().camera?.bbox, [0, 0, 1, 1]);
});

test('編輯中換天照樣在編輯；選「全部」就結束編輯', () => {
  const store = createAppStore();
  store.getState().selectDay('2027-02-03');
  store.getState().setPlanning(true);
  store.getState().selectDay('2027-02-04');
  assert.equal(store.getState().planning, true);
  store.getState().selectDay('all');
  assert.equal(store.getState().day, 'all');
  assert.equal(store.getState().planning, false);
});

test('tripFocusDay：整趟點了某天的路線；換天清掉', () => {
  const store = createAppStore();
  store.getState().setTripFocusDay('2027-02-05');
  assert.equal(store.getState().tripFocusDay, '2027-02-05');
  store.getState().selectDay('2027-02-03');
  assert.equal(store.getState().tripFocusDay, null);
  store.getState().setTripFocusDay('2027-02-05');
  store.getState().selectDay('all');
  assert.equal(store.getState().tripFocusDay, null);
});

test('dayPanelShowing：時間軸面板不在畫面上時才要顯示精簡的編輯中條', async () => {
  const { dayPanelShowing } = await import('../src/lib/editing.ts');
  const s = { mode: 'map' as const, detailId: null };
  assert.equal(dayPanelShowing(s), true);
  assert.equal(dayPanelShowing({ ...s, mode: 'explore' }), false);
  assert.equal(dayPanelShowing({ ...s, mode: 'wish' }), false);
  assert.equal(dayPanelShowing({ ...s, detailId: 'x' }), false);
});
