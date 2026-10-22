// T12 完成條件：每個地圖指令都有測試（呼叫後 store 的狀態正確）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { createAppStore } from '../src/store.ts';
import { createCommands } from '../src/commands.ts';
import type { DataState } from '../src/dataStore.ts';
import { normalizePlace } from '../src/data/normalize.ts';
import { EMPTY_FILTER } from '../src/lib/filter.ts';
import { placeDays } from '../src/lib/itinerary.ts';
import type { Area, Place } from '../src/data/types.ts';
import type { Itinerary } from '@travel-helper/engine/types';
import { itin } from './helpers.ts';

// 故意不用真的區域 ID，確認指令沒有寫死區域（PLAN T12「區域不寫死」）
const AREAS: Area[] = [
  { id: 'north', name: { ja: '北', zh: '北區' }, tripOrder: 1, center: [136.8, 34.5], bbox: [136.7, 34.45, 136.9, 34.55], regions: [{ id: 'north-port', name: { ja: '港', zh: '港邊' } }] },
  { id: 'south', name: { ja: '南', zh: '南區' }, tripOrder: 2, center: [136.8, 34.3], bbox: [136.7, 34.25, 136.9, 34.35] },
];

function place(id: string, coords: [number, number], over: Record<string, unknown> = {}): Place {
  const p = normalizePlace({ id, type: 'spot', name: { ja: id }, area: 'north', coords, sources: [], ...over });
  assert.ok(p);
  return p;
}

const PLACES = [
  place('a', [136.8, 34.5], { region: 'north-port', tier: 'S' }),
  place('b', [136.82, 34.51]),
  place('c', [136.8, 34.3], { area: 'south' }),
  place('r15', [136.81, 34.5], { type: 'restaurant', group: { fit15: 'yes' }, contexts: ['lunch'] }),
  place('r-small', [136.81, 34.49], { type: 'restaurant', group: { fit15: 'no' } }),
];

function setup(itinerary: Itinerary | null = itin({ '2027-02-05': ['a', 'b'] })) {
  const app = createAppStore();
  const data = createStore<DataState>()(() => ({
    status: 'ready',
    error: null,
    areas: AREAS,
    places: PLACES,
    byId: new Map(PLACES.map((p) => [p.id, p])),
    itinerary,
    days: placeDays(itinerary),
    stationNames: new Map(),
  }));
  return { app, data, cmd: createCommands(app, data) };
}

test('focus：一個點 → 移到那裡、閃一下；好幾個點 → 框住；找不到 → 錯誤、狀態不變', () => {
  const { app, cmd } = setup();
  const r = cmd.focus('a');
  assert.ok(r.ok);
  assert.deepEqual(app.getState().camera?.center, [136.8, 34.5]);
  assert.equal(app.getState().camera?.zoom, 15);
  assert.equal(app.getState().hoveredId, 'a');

  cmd.focus(['a', 'c', 'nope']);
  assert.deepEqual(app.getState().camera?.bbox, [136.8, 34.3, 136.8, 34.5]);

  const seq = app.getState().camera?.seq;
  const bad = cmd.focus('nope');
  assert.equal(bad.ok, false);
  assert.equal(app.getState().camera?.seq, seq);
});

test('focus：區域、子地區從 areas.json 來；天數、bbox、center', () => {
  const { app, cmd } = setup();
  assert.ok(cmd.focus({ area: 'south' }).ok);
  assert.ok(app.getState().camera?.bbox);
  const bad = cmd.focus({ area: 'osaka' });
  assert.equal(bad.ok, false);
  assert.match(!bad.ok ? bad.error : '', /north、south/);

  assert.ok(cmd.focus({ region: 'north-port' }).ok);
  assert.deepEqual(app.getState().camera?.center, [136.8, 34.5]);

  cmd.focus({ day: '2027-02-05' });
  assert.deepEqual(app.getState().camera?.bbox, [136.8, 34.5, 136.82, 34.51]);
  assert.equal(app.getState().camera?.zoom, 14);

  cmd.focus({ bbox: [1, 2, 3, 4] });
  assert.deepEqual(app.getState().camera?.bbox, [1, 2, 3, 4]);
  assert.equal(cmd.focus({ bbox: [3, 2, 1, 4] }).ok, false);
  cmd.focus({ center: [136, 34], zoom: 12 });
  assert.deepEqual([app.getState().camera?.center, app.getState().camera?.zoom], [[136, 34], 12]);
});

test('highlight：每種樣式一組，再叫一次取代；不認得的 ID 回報出來；clearHighlights 清掉', () => {
  const { app, cmd } = setup();
  const r = cmd.highlight(['a', 'b', 'nope']);
  assert.deepEqual(r, { ok: true, ids: ['a', 'b'], unknown: ['nope'] });
  cmd.highlight(['c'], 'warning');
  cmd.highlight(['b']);
  assert.deepEqual(app.getState().highlights, { primary: ['b'], warning: ['c'] });
  assert.equal(cmd.highlight(['a'], 'neon' as never).ok, false);
  assert.equal(cmd.highlight(['nope']).ok, false);
  cmd.highlight([], 'warning');
  assert.deepEqual(app.getState().highlights, { primary: ['b'] });
  cmd.clearHighlights();
  assert.deepEqual(app.getState().highlights, {});
});

test('drawRoute：資料點或座標都可以；先是 pending，給了路徑就不查；clearHighlights 清掉', () => {
  const { app, cmd } = setup();
  const r = cmd.drawRoute('a', 'b', 'walk');
  assert.ok(r.ok);
  const route = app.getState().routes[0];
  assert.equal(route.id, r.ok ? r.routeId : '');
  assert.deepEqual([route.from.place, route.to.place, route.mode, route.source, route.minutes], ['a', 'b', 'walk', 'pending', null]);

  cmd.drawRoute([136.8, 34.5], 'c', 'taxi', { minutes: 25, geometry: [[136.8, 34.5], [136.8, 34.4], [136.8, 34.3]] });
  const given = app.getState().routes[1];
  assert.deepEqual([given.from.place, given.source, given.minutes, given.minutesGiven], [null, 'given', 25, true]);

  assert.equal(cmd.drawRoute('a', 'nope').ok, false);
  assert.equal(cmd.drawRoute('a', 'b', 'rocket' as never).ok, false);
  assert.equal(cmd.drawRoute('a', [999, 0]).ok, false);
  assert.equal(app.getState().routes.length, 2);
  cmd.clearHighlights();
  assert.deepEqual(app.getState().routes, []);
});

test('compare：2～6 個點，地圖框住，回傳 A、B、C 和重點', () => {
  const { app, cmd } = setup();
  const r = cmd.compare(['r15', 'r-small', 'nope']);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.places.map((p) => [p.letter, p.id]), [['A', 'r15'], ['B', 'r-small']]);
    assert.ok(r.places[0].badges.includes('可容納 15 人'));
    assert.deepEqual(r.unknown, ['nope']);
  }
  assert.deepEqual(app.getState().compare, ['r15', 'r-small']);
  assert.ok(app.getState().camera?.bbox);
  assert.equal(cmd.compare(['a']).ok, false);
  assert.deepEqual(app.getState().compare, ['r15', 'r-small']);
  cmd.clearHighlights();
  assert.deepEqual(app.getState().compare, []);
});

test('selectDay：切換、地圖移到那天；all 不動地圖；不在旅程的日期 → 錯誤', () => {
  const { app, cmd } = setup();
  const r = cmd.selectDay('2027-02-05');
  assert.deepEqual(r, { ok: true, day: '2027-02-05', stops: 2 });
  assert.equal(app.getState().day, '2027-02-05');
  assert.ok(app.getState().camera?.bbox);
  const seq = app.getState().camera?.seq;
  cmd.selectDay('2027-02-07'); // 沒排東西：切過去，地圖不動
  assert.equal(app.getState().day, '2027-02-07');
  assert.equal(app.getState().camera?.seq, seq);
  cmd.selectDay('all');
  assert.equal(app.getState().day, 'all');
  assert.equal(cmd.selectDay('2030-01-01').ok, false);
  assert.equal(app.getState().day, 'all');
});

test('setFilter／clearFilter：給的項目取代、其他不動；值從 areas.json 和常數檢查；回傳標籤和筆數', () => {
  const { app, cmd } = setup();
  const r = cmd.setFilter({ types: ['restaurant'], fit15: ['yes'] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.labels, ['餐廳', '可容納 15 人']);
    assert.equal(r.count, 1);
  }
  cmd.setFilter({ areas: ['north'] });
  assert.deepEqual(app.getState().filter, { ...EMPTY_FILTER, types: ['restaurant'], fit15: ['yes'], areas: ['north'] });
  cmd.setFilter({ types: [] });
  assert.deepEqual(app.getState().filter.types, []);

  const before = app.getState().filter;
  assert.equal(cmd.setFilter({ areas: ['osaka'] }).ok, false);
  assert.equal(cmd.setFilter({ tiers: ['Z'] } as never).ok, false);
  assert.equal(cmd.setFilter({ color: ['red'] } as never).ok, false);
  assert.equal(cmd.setFilter({ types: 'restaurant' } as never).ok, false);
  assert.equal(app.getState().filter, before);

  const c = cmd.clearFilter();
  assert.ok(c.ok);
  assert.deepEqual(app.getState().filter, EMPTY_FILTER);
});

test('select／unselect：累加、不重複；不給 ids 全部取消', () => {
  const { app, cmd } = setup();
  cmd.select('a');
  cmd.select(['b', 'a', 'nope']);
  assert.deepEqual(app.getState().selection, ['a', 'b']);
  assert.equal(cmd.select('nope').ok, false);
  cmd.unselect('a');
  assert.deepEqual(app.getState().selection, ['b']);
  cmd.select('c');
  cmd.unselect();
  assert.deepEqual(app.getState().selection, []);
});

test('showProposal：算出改動、只有一天時切到那天；格式不對或沒改動 → 錯誤；clearProposal', () => {
  const { app, cmd } = setup(itin({ '2027-02-05': ['a', 'b'], '2027-02-06': ['c'] }));
  const proposed = itin({ '2027-02-05': ['a', 'r15'], '2027-02-06': ['c'] });
  const r = cmd.showProposal(proposed, { summary: '午餐換成能坐 15 人的店' });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.dates, ['2027-02-05']);
  const p = app.getState().proposal;
  assert.ok(p);
  assert.deepEqual(p.dates, ['2027-02-05']);
  assert.deepEqual(p.changes.map((c) => [c.kind, c.place]).sort(), [['added', 'r15'], ['removed', 'b']]);
  assert.equal(p.summary, '午餐換成能坐 15 人的店');
  assert.equal(app.getState().day, '2027-02-05');

  assert.equal(cmd.showProposal({ format: 'nope' } as never).ok, false);
  assert.equal(cmd.showProposal(itin({ '2027-02-05': ['a', 'b'], '2027-02-06': ['c'] })).ok, false);
  assert.equal(app.getState().proposal, p);

  cmd.clearProposal();
  assert.equal(app.getState().proposal, null);
});

test('showProposal：還沒有確定的行程時，有排東西的天都算提議', () => {
  const { app, cmd } = setup(null);
  const r = cmd.showProposal(itin({ '2027-02-03': ['a'], '2027-02-04': [], '2027-02-05': ['b'] }));
  assert.ok(r.ok);
  assert.deepEqual(app.getState().proposal?.dates, ['2027-02-03', '2027-02-05']);
  assert.equal(app.getState().day, 'all');
});

test('getViewState：給 AI 的畫面狀態（範圍、天、篩選、選取、模式、詳情、標示、提議）', () => {
  const { app, cmd } = setup();
  app.getState().setView({ center: [136.8, 34.5], zoom: 13, bounds: [136.75, 34.45, 136.85, 34.55] });
  cmd.selectDay('2027-02-05');
  cmd.setFilter({ types: ['spot'] });
  cmd.select(['a']);
  cmd.highlight(['b'], 'warning');
  app.getState().setPlanning(true);
  app.getState().openDetail('a');
  const v = cmd.getViewState();
  assert.deepEqual(v.view?.bounds, [136.75, 34.45, 136.85, 34.55]);
  assert.equal(v.visibleCount, 2); // a、b 在畫面裡，c 不在；餐廳被篩掉
  assert.equal(v.day, '2027-02-05');
  assert.match(v.dayLabel ?? '', /^2\/5/);
  assert.deepEqual(v.dayStops.map((s) => s.place), ['a', 'b']);
  assert.deepEqual(v.filterLabels, ['景點']);
  assert.equal(v.filterCount, 3);
  assert.deepEqual(v.selection, [{ id: 'a', name: 'a', type: 'spot' }]);
  assert.equal(v.planning, true);
  assert.equal(v.mode, 'map');
  assert.deepEqual(v.detail, { id: 'a', name: 'a' });
  assert.deepEqual(v.highlights, { warning: ['b'] });
  assert.equal(v.proposal, null);
  // 給 AI 的脈絡要能直接轉成 JSON
  assert.doesNotThrow(() => JSON.stringify(v));
});
