// scripts/build-static.mjs：時刻表照車站拆開、靜態資料的 manifest（architecture §3.7）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers/test-area.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import { build, withNextStops } from '../build-static.mjs';

test('withNextStops：每一班加上這站之後的停站；找不到列車就是 null', () => {
  const tt = { trains: { weekday: { t1: { stops: [['a', null, '10:00'], ['b', '10:05', '10:06'], ['c', '10:10', null]] } }, holiday: {} } };
  const st = { station: 'b', directions: { 'for-x': { weekday: [{ dep: '10:06', trainNo: 't1' }, { dep: '11:00', trainNo: 'nope' }], holiday: [] } } };
  const out = withNextStops(st, tt);
  assert.deepEqual(out.directions['for-x'].weekday[0].next, [['c', '10:10', null]]);
  assert.equal(out.directions['for-x'].weekday[1].next, null);
  assert.equal((st.directions['for-x'].weekday[0] as any).next, undefined, '不改原本的物件');
});

test('真的資料：每個近鐵車站一個檔案、index 和 manifest 列出全部檔案', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'th-static-'));
  const m = build({ data: path.join(ROOT, 'data'), out });
  const stations = fs.readdirSync(path.join(ROOT, 'data/timetables/kintetsu')).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of stations) assert.ok(m.files[`timetables/kintetsu/${f}`], f);
  assert.ok(m.files['areas.json']);
  assert.ok(!fs.existsSync(path.join(out, 'timetables/kintetsu/_travel-times.json')), 'trains 已經拆進各站');
  const index = JSON.parse(fs.readFileSync(path.join(out, 'timetables/index.json'), 'utf8'));
  assert.equal(index.kintetsu.length, stations.length);
  for (const f of Object.keys(m.files)) assert.ok(fs.existsSync(path.join(out, f)), f);
  // 每一班近鐵都找得到停站（validate 已經檢查 trainNo 都在 _travel-times.json）
  const toba = JSON.parse(fs.readFileSync(path.join(out, 'timetables/kintetsu/toba.json'), 'utf8'));
  for (const days of Object.values<any>(toba.directions)) for (const d of days.weekday) assert.ok(Array.isArray(d.next), d.trainNo);
});
