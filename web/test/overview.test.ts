// T63：探索的概覽卡（interaction-design §28）—— 子地區切換的狀態、卡片內容跟著子地區換
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRegionsLabel, areaSubName, overviewContent } from '../src/lib/overview.ts';
import { createOverviewStore } from '../src/shared/overviewStore.ts';
import type { Area } from '../src/data/types.ts';

// 故意不用真的區域 ID（區域不寫死）
const NORTH: Area = {
  id: 'north',
  name: { ja: '北', zh: '北', kana: 'きた' } as Area['name'],
  center: [136.8, 34.5],
  bbox: [136.7, 34.45, 136.9, 34.55],
  intro: { summary: '整區的特色', transport: '', highlights: ['a', 'b'], february: [{ text: '整區的二月注意' }, { text: '第二則' }] },
  regions: [
    { id: 'north-port', name: { ja: '港', zh: '港邊' }, intro: { summary: '港邊的特色', highlights: ['c'], febNote: '港邊的二月注意' } },
    { id: 'north-hill', name: { ja: '丘', zh: '山丘' }, intro: { summary: '山丘的特色', highlights: [], febNote: null } },
    { id: 'north-bare', name: { ja: '空', zh: '空地' } },
  ],
};

test('沒選子地區：整區的簡介、第一則二月注意、代表點，標題是區名', () => {
  assert.deepEqual(overviewContent(NORTH, null), { regionId: null, label: '北', summary: '整區的特色', feb: '整區的二月注意' });
});

test('選了子地區：換成那個子地區的簡介、二月注意、代表點', () => {
  assert.deepEqual(overviewContent(NORTH, 'north-port'), { regionId: 'north-port', label: '港邊', summary: '港邊的特色', feb: '港邊的二月注意' });
});

test('子地區沒寫的那一行不放（不拿整區的補）', () => {
  assert.deepEqual(overviewContent(NORTH, 'north-hill'), { regionId: 'north-hill', label: '山丘', summary: '山丘的特色', feb: null });
  assert.deepEqual(overviewContent(NORTH, 'north-bare'), { regionId: 'north-bare', label: '空地', summary: null, feb: null });
});

test('找不到的子地區當全區', () => {
  assert.equal(overviewContent(NORTH, 'gone').regionId, null);
});

test('「北全區」、日文名（和中文一樣時寫假名）', () => {
  assert.equal(allRegionsLabel(NORTH), '北全區');
  assert.equal(areaSubName(NORTH), 'きた');
  assert.equal(areaSubName({ ...NORTH, name: { ja: '関西空港周辺', zh: '關西機場周邊' } }), '関西空港周辺');
  assert.equal(areaSubName({ ...NORTH, name: { ja: '北', zh: '北' } }), null);
});

test('點子地區：那張卡換、地圖框到那裡；別張卡不動', () => {
  const s = createOverviewStore();
  s.getState().pick('north', 'north-port');
  s.getState().pick('south', null);
  assert.deepEqual(s.getState().picks, { north: 'north-port', south: null });
  // 地圖框的是最後點的那張卡
  assert.deepEqual(s.getState().focus, { area: 'south', region: null });
});

test('點「全區」換回整區的內容，地圖框到整區', () => {
  const s = createOverviewStore();
  s.getState().pick('north', 'north-port');
  s.getState().pick('north', null);
  assert.equal(s.getState().picks.north, null);
  assert.deepEqual(s.getState().focus, { area: 'north', region: null });
});

test('離開概覽：地圖的框拿掉，卡片選的子地區留著', () => {
  const s = createOverviewStore();
  s.getState().pick('north', 'north-port');
  s.getState().clearFocus();
  assert.equal(s.getState().focus, null);
  assert.equal(s.getState().picks.north, 'north-port');
});

test('「概覽」鈕、看全部地區：全部換回全區、框拿掉', () => {
  const s = createOverviewStore();
  s.getState().pick('north', 'north-port');
  s.getState().pick('south', 'south-x');
  s.getState().reset();
  assert.deepEqual(s.getState().picks, {});
  assert.equal(s.getState().focus, null);
});
