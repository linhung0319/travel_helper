// scripts/validate.mjs：班距型路線（timetables/urban/<route-id>.json）和站內轉乘（_transfers.json），T28。
// 用 test-area 的假資料：兩個車站 test-station、test-station-b。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, writeTestData, writeTestSchemas, testArea, testStation } from './helpers/test-area.ts';

const schemaDir = writeTestSchemas();
const SRC = [{ type: 'official', url: 'https://example.com/', retrieved: '2026-10-26' }];

function validate(dataDir: string) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.mjs'), '--data', dataDir, '--schema', schemaDir], {
    encoding: 'utf8',
  });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}

const stations = () => [testStation(), { ...testStation(), id: 'test-station-b', coords: [135.51, 34.7] }];
const area = () => ({ ...testArea(), stations: ['test-station', 'test-station-b'] });

function route(over: Record<string, unknown> = {}) {
  return {
    id: 'test-line',
    mode: 'metro',
    operator: 'テスト',
    name: { ja: 'テスト線', zh: '測試線' },
    serviceType: null,
    stops: [
      { id: 'test-station', min: 0 },
      { id: 'test-station-b', min: 4 },
    ],
    loop: false,
    loopMin: null,
    service: {
      weekday: { first: '05:00', last: '24:00', headway: [{ from: '05:00', to: '24:00', min: 5 }] },
      saturday: null,
      holiday: { first: '05:00', last: '24:00', headway: null },
    },
    fares: { currency: 'JPY', adult: { 'test-station': { 'test-station-b': 190 } }, child: '半價', note: null },
    passes: { 'kintetsu-rail-pass-5day': false },
    retrieved: '2026-10-26',
    sources: SRC,
    ...over,
  };
}

function transfer(over: Record<string, unknown> = {}) {
  return { from: 'test-station', to: 'test-station-b', walkMin: 5, elevator: true, sources: SRC, ...over };
}

function data(files: Record<string, unknown>) {
  return writeTestData({ extraFiles: { 'areas.json': [area()], 'stations.json': stations(), ...files } });
}

describe('validate：班距型路線', () => {
  test('正確的路線可以通過', () => {
    const r = validate(data({ 'timetables/urban/test-line.json': route() }));
    assert.ok(r.ok, r.out);
  });

  test('檔名要和 id 相同', () => {
    const r = validate(data({ 'timetables/urban/other-name.json': route() }));
    assert.ok(!r.ok);
    assert.match(r.out, /id 是「test-line」，但檔名是 other-name\.json/);
  });

  test('停站要在 stations.json', () => {
    const r = validate(data({ 'timetables/urban/test-line.json': route({ stops: [{ id: 'test-station', min: 0 }, { id: 'nowhere', min: 3 }] }) }));
    assert.ok(!r.ok);
    assert.match(r.out, /stops 的「nowhere」不在 stations\.json/);
  });

  test('min 從 0 開始、依序不減少；停站不重複', () => {
    const notZero = validate(data({ 'timetables/urban/test-line.json': route({ stops: [{ id: 'test-station', min: 2 }, { id: 'test-station-b', min: 4 }] }) }));
    assert.match(notZero.out, /第一站的 min 要是 0/);
    const back = validate(data({ 'timetables/urban/test-line.json': route({ stops: [{ id: 'test-station', min: 0 }, { id: 'test-station-b', min: 4 }, { id: 'test-station', min: 3 }] }) }));
    assert.match(back.out, /min 比前一站小/);
    assert.match(back.out, /停站「test-station」重複/);
  });

  test('環狀線要有比最後一站大的 loopMin；不是環狀線 loopMin 要是 null', () => {
    const noLoopMin = validate(data({ 'timetables/urban/test-line.json': route({ loop: true, loopMin: null }) }));
    assert.match(noLoopMin.out, /環狀線的 loopMin 要大於最後一站的 min/);
    const small = validate(data({ 'timetables/urban/test-line.json': route({ loop: true, loopMin: 3 }) }));
    assert.match(small.out, /環狀線的 loopMin 要大於最後一站的 min/);
    assert.ok(validate(data({ 'timetables/urban/test-line.json': route({ loop: true, loopMin: 20 }) })).ok);
    const extra = validate(data({ 'timetables/urban/test-line.json': route({ loopMin: 20 }) }));
    assert.match(extra.out, /不是環狀線，loopMin 要是 null/);
  });

  test('票價的車站要存在', () => {
    const r = validate(data({ 'timetables/urban/test-line.json': route({ fares: { adult: { 'test-station': { nowhere: 190 } } } }) }));
    assert.ok(!r.ok);
    assert.match(r.out, /fares\.adult 的「nowhere」不在 stations\.json/);
  });

  test('班距的時段要 from < to', () => {
    const svc = { first: null, last: null, headway: [{ from: '10:00', to: '09:00', min: 5 }] };
    const r = validate(data({ 'timetables/urban/test-line.json': route({ service: { weekday: svc, saturday: null, holiday: svc } }) }));
    assert.ok(!r.ok);
    assert.match(r.out, /service\.weekday\.headway\[0\] 的時段 10:00～09:00 不對/);
  });

  test('schema：沒定義的欄位、缺 service 都是錯誤', () => {
    const r = validate(data({ 'timetables/urban/test-line.json': { ...route({ foo: 1 }), service: undefined } }));
    assert.ok(!r.ok);
    assert.match(r.out, /foo/);
    assert.match(r.out, /service/);
  });
});

describe('validate：站內轉乘（_transfers.json）', () => {
  const line = { 'timetables/urban/test-line.json': route() };

  test('正確的轉乘可以通過（含同站換線）', () => {
    const r = validate(
      data({
        ...line,
        'timetables/urban/_transfers.json': [
          transfer(),
          transfer({ to: 'test-station', fromLine: 'test-line', toLine: 'kintetsu', walkMin: null, elevator: null }),
        ],
      }),
    );
    assert.ok(r.ok, r.out);
  });

  test('車站要存在', () => {
    const r = validate(data({ ...line, 'timetables/urban/_transfers.json': [transfer({ to: 'nowhere' })] }));
    assert.ok(!r.ok);
    assert.match(r.out, /to「nowhere」不在 stations\.json/);
  });

  test('同站換線要寫 fromLine、toLine，而且不同', () => {
    const r = validate(data({ ...line, 'timetables/urban/_transfers.json': [transfer({ to: 'test-station' })] }));
    assert.ok(!r.ok);
    assert.match(r.out, /from、to 都是「test-station」：同站換線要寫不同的 fromLine、toLine/);
  });

  test('fromLine、toLine 要是班距型路線的 ID 或 kintetsu', () => {
    const r = validate(data({ ...line, 'timetables/urban/_transfers.json': [transfer({ fromLine: 'no-such-line' })] }));
    assert.ok(!r.ok);
    assert.match(r.out, /fromLine「no-such-line」不是班距型路線/);
  });

  test('同一組重複（兩個方向算同一組，oneWay 除外）', () => {
    const dup = validate(data({ ...line, 'timetables/urban/_transfers.json': [transfer(), transfer({ from: 'test-station-b', to: 'test-station' })] }));
    assert.ok(!dup.ok);
    assert.match(dup.out, /test-station ↔ test-station-b 重複/);
    const oneWay = validate(
      data({
        ...line,
        'timetables/urban/_transfers.json': [transfer({ oneWay: true }), transfer({ from: 'test-station-b', to: 'test-station', oneWay: true })],
      }),
    );
    assert.ok(oneWay.ok, oneWay.out);
  });
});
