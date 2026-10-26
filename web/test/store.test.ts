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

test('選中（§8.1）：同一時間一個；再選同一個 selectSeq 加 1（水滴再跳）；換分頁、換天清掉', () => {
  const store = createAppStore();
  store.getState().select('a');
  assert.equal(store.getState().selectedId, 'a');
  const seq = store.getState().selectSeq;
  store.getState().select('a');
  assert.equal(store.getState().selectSeq, seq + 1);
  store.getState().select('b');
  assert.equal(store.getState().selectedId, 'b');
  store.getState().setMode('explore');
  assert.equal(store.getState().selectedId, null);
  store.getState().select('b');
  store.getState().setMode('explore'); // 同一個分頁：不清
  assert.equal(store.getState().selectedId, 'b');
  store.getState().selectDay('2027-02-05');
  assert.equal(store.getState().selectedId, null);
  store.getState().select('c');
  store.getState().select(null);
  assert.equal(store.getState().selectedId, null);
});

test('打開詳情＝選中那個點', () => {
  const store = createAppStore();
  store.getState().openDetail('x', 'map');
  assert.equal(store.getState().selectedId, 'x');
});

test('交通的路線（legRoute）不是 AI 的 routes，clearHighlights 不清', () => {
  const store = createAppStore();
  store.getState().setLegRoute({ from: { place: 'a', coords: [1, 2] }, to: { place: 'b', coords: [3, 4] }, mode: 'walk', minutes: 5, minutesGiven: true, label: null, geometry: null, meters: null, source: 'pending', stations: [] });
  assert.equal(store.getState().routes.length, 0);
  store.getState().clearHighlights();
  assert.equal(store.getState().legRoute?.mode, 'walk');
  store.getState().setLegRoute(null);
  assert.equal(store.getState().legRoute, null);
});

test('網頁的探索、想去各自一份篩選和搜尋（最終 review #3）：換分頁換成那頁的，行程分頁沿用探索的', () => {
  const store = createAppStore();
  const s = () => store.getState();
  s().setMode('wish');
  s().setFilter({ votes: ['mine'] });
  s().setQuery('海女');
  s().setMode('explore');
  assert.deepEqual(s().filter, EMPTY_FILTER);
  assert.equal(s().query, '');
  s().toggleFilter('types', 'restaurant');
  s().setQuery('うどん');
  s().setMode('wish');
  assert.deepEqual(s().filter.votes, ['mine']);
  assert.deepEqual(s().filter.types, []);
  assert.equal(s().query, '海女');
  // 到行程：篩選換回探索那份（行程分頁的地圖不套篩選；從時間軸空檔「找附近的…」設的篩選是給探索的）
  s().setMode('map');
  assert.deepEqual(s().filter.types, ['restaurant']);
  assert.equal(s().query, 'うどん');
  s().setFilter({ tiers: ['S'] });
  s().setMode('explore');
  assert.deepEqual(s().filter.tiers, ['S']);
  assert.deepEqual(s().filter.types, ['restaurant']);
  s().setMode('wish');
  assert.deepEqual(s().filter.tiers, []);
});
