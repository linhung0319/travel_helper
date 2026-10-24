// 時刻表查詢和 scripts/next-train.mjs、next-bus.mjs 的結果一致（同一份規則搬進 engine）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, departuresFrom, directTrains, earliestTrain, fromMinutes, routeRides, toMinutes, type RouteTimetable } from '../src/index.ts';
import { ROOT } from './fixtures.ts';

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const tt = readJson(path.join(ROOT, 'data/timetables/kintetsu/_travel-times.json'));
const routes: RouteTimetable[] = ['bus', 'ferry', 'jr'].flatMap((m) => {
  const dir = path.join(ROOT, 'data/timetables', m);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(dir, f)))
    .filter((d) => d.stops && d.trips);
});
const run = (script: string, args: string[]) =>
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { encoding: 'utf8', cwd: ROOT }).stdout;

const TRAIN_CASES: [string, string, string, string][] = [
  ['toba', 'kashikojima', '2027-02-05', '09:00'],
  ['ugata', 'iseshi', '2027-02-06', '16:40'],
  ['isuzugawa', 'shima-isobe', '2027-02-09', '10:05'],
  ['kashikojima', 'iseshi', '2027-02-11', '07:00'],
  ['nakanogo', 'ujiyamada', '2027-02-03', '13:30'],
];

for (const [from, to, date, time] of TRAIN_CASES) {
  test(`近鐵最早抵達和 next-train 相同：${from} → ${to} ${date} ${time}`, () => {
    const block = run('next-train.mjs', [from, to, date, time]).split('最早抵達：')[1] ?? '';
    const expected = [...block.matchAll(/(\d\d:\d\d) \S+ → (\d\d:\d\d) \S+　.*?#(\S+)/g)].map((m) => [m[1], m[2], m[3]]);
    assert.ok(expected.length > 0);
    const got = earliestTrain(tt, { from, to, date, after: toMinutes(time), holidays: DEFAULT_CONFIG.holidays });
    assert.deepEqual(got?.map((r) => [fromMinutes(r.dep), fromMinutes(r.arr), r.trainNo]), expected);
  });
}

test('近鐵：末班車之後沒有車', () => {
  assert.equal(earliestTrain(tt, { from: 'kashikojima', to: 'toba', date: '2027-02-08', after: toMinutes('23:59'), holidays: DEFAULT_CONFIG.holidays }), null);
});

test('近鐵：同樣的查詢第二次直接回傳同一個結果；不同日子分開算', () => {
  const q = { from: 'toba', to: 'kashikojima', date: '2027-02-05', after: toMinutes('09:00'), holidays: DEFAULT_CONFIG.holidays };
  const a = earliestTrain(tt, q);
  assert.equal(earliestTrain(tt, { ...q }), a);
  const b = earliestTrain(tt, { ...q, date: '2027-02-06' });
  assert.notEqual(b, a);
});

test('近鐵：A 站這天的發車時刻由早到晚、不重複，包含直達車的每一班', () => {
  const q = { from: 'toba', date: '2027-02-05', holidays: DEFAULT_CONFIG.holidays };
  const deps = departuresFrom(tt, q);
  assert.ok(deps.length > 20);
  assert.deepEqual(deps, [...new Set(deps)].sort((x, y) => x - y));
  for (const r of directTrains(tt, { ...q, to: 'kashikojima', after: 0 }).filter((x) => !x.off)) assert.ok(deps.includes(r.dep));
});

const BUS_CASES: [string, string, string, string][] = [
  ['isuzugawa', 'ise-naiku', '2027-02-11', '09:00'],
  ['toba-sadahama-marine-terminal', 'toba-port-kamishima', '2027-02-06', '08:00'],
  ['toba', 'toba-osatsu-ishigami', '2027-02-05', '10:00'],
];

for (const [from, to, date, time] of BUS_CASES) {
  test(`巴士、定期船和 next-bus 相同：${from} → ${to} ${date} ${time}`, () => {
    const expected = [...run('next-bus.mjs', [from, to, date, time, '--count', '200']).matchAll(/^ {2}(\d\d:\d\d) → (\d\d:\d\d)/gm)].map((m) => [m[1], m[2]]);
    assert.ok(expected.length > 0);
    const got = routeRides(routes, from, to, date, time, DEFAULT_CONFIG.holidays).map((r) => [r.dep, r.arr]);
    assert.deepEqual(got, expected);
  });
}
