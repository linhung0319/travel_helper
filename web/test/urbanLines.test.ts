// 車站面板的班距型路線（T29c spec §8.11）：urbanLinesAt
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { UrbanRoute } from '@travel-helper/engine';
import { urbanLinesAt } from '../src/lib/legView.ts';

const urbanDir = new URL('../../data/timetables/urban/', import.meta.url);
const realUrban = (): UrbanRoute[] =>
  fs
    .readdirSync(urbanDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(fs.readFileSync(new URL(f, urbanDir), 'utf8').replace(/^﻿/, '')) as UrbanRoute);

const route = (service: UrbanRoute['service']): UrbanRoute => ({
  id: 'x',
  mode: 'metro',
  name: { ja: 'X線', zh: 'X 線' },
  stops: [
    { id: 's', min: 0 },
    { id: 't', min: 5 },
  ],
  loop: false,
  loopMin: null,
  service,
});

test('urbanLinesAt：新今宮平日有大阪環狀線，班距 4、首班 05:15、末班 23:48', () => {
  const lines = urbanLinesAt('jr-shin-imamiya', realUrban(), 'weekday');
  const loop = lines.find((l) => l.line.includes('環狀線'));
  assert.ok(loop);
  assert.equal(loop.headwayMin, 4);
  assert.equal(loop.first, '05:15');
  assert.equal(loop.last, '23:48');
});

test('urbanLinesAt：saturday 是 null 照 holiday；班距取服務時數最長的那個', () => {
  const hol = {
    first: '06:00',
    last: '23:00',
    headway: [
      { from: '06:00', to: '12:00', min: 6 },
      { from: '12:00', to: '23:00', min: 8 },
    ],
  };
  const routes = [route({ weekday: null, saturday: null, holiday: hol })];
  assert.deepEqual(urbanLinesAt('s', routes, 'saturday'), [{ line: 'X 線', headwayMin: 8, first: '06:00', last: '23:00' }]);
});

test('urbanLinesAt：沒停的站回 []；那天沒有資料或班距是 null 時照樣列出，欄位是 null', () => {
  const hol = { first: '06:00', last: '23:00', headway: [{ from: '06:00', to: '23:00', min: 6 }] };
  const routes = [route({ weekday: null, saturday: null, holiday: hol })];
  assert.deepEqual(urbanLinesAt('nope', routes, 'holiday'), []);
  assert.deepEqual(urbanLinesAt('s', routes, 'weekday'), [{ line: 'X 線', headwayMin: null, first: null, last: null }]);
  const none = [route({ weekday: { first: null, last: null, headway: null }, saturday: null, holiday: hol })];
  assert.deepEqual(urbanLinesAt('t', none, 'weekday'), [{ line: 'X 線', headwayMin: null, first: null, last: null }]);
});

test('urbanLinesAt：市巴士停留所的 station 是這站的也列，線名加停留所名（T88）', () => {
  const svc = { first: '06:00', last: '22:00', headway: [{ from: '06:00', to: '22:00', min: 8 }] };
  const bus: UrbanRoute = {
    id: 'citybus-206',
    mode: 'bus',
    name: { ja: '市バス 206 系統', zh: '市巴士 206 系統' },
    stops: [
      { id: 'citybus-kyoto-ekimae', min: 0, name: { ja: '京都駅前', zh: '京都站前' }, coords: [135.759, 34.986], station: 'jr-kyoto' },
      { id: 'citybus-gojozaka', min: 8, name: { ja: '五条坂', zh: '五條坂' }, coords: [135.778, 34.995], station: null },
    ],
    loop: false,
    loopMin: null,
    service: { weekday: svc, saturday: null, holiday: svc },
  };
  assert.deepEqual(urbanLinesAt('jr-kyoto', [bus], 'weekday'), [{ line: '市巴士 206 系統（京都站前）', headwayMin: 8, first: '06:00', last: '22:00' }]);
  assert.deepEqual(urbanLinesAt('jr-osaka', [bus], 'weekday'), []);
});

test('urbanLinesAt：京都站（JR）有奈良線、嵯峨野線、新快速（T88）', () => {
  const lines = urbanLinesAt('jr-kyoto', realUrban(), 'weekday').map((l) => l.line);
  for (const l of ['奈良線', '嵯峨野線', '新快速']) assert.ok(lines.some((x) => x.includes(l)), `${l}：${lines.join('、')}`);
});
