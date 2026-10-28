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
