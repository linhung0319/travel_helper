import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayPlan, KintetsuTimes, RouteTimetable, TimelineEntry } from '@travel-helper/engine';
import { departureRows, findLegEntry, legKeyOf, type DepartureRow } from '../src/lib/planView.ts';
import { departureLabel, readyHint, timetableSource, timetableWindow } from '../src/lib/timetableView.ts';

const dep = (h: number, m: number, i: number) => {
  const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { tripId: `t${i}`, line: '普通', depart: t, arrive: t };
};
/** 每 20 分一班，08:00 起共 n 班 */
const many = (n: number) => Array.from({ length: n }, (_, i) => dep(8 + Math.floor((i * 20) / 60), (i * 20) % 60, i));

test('timetableWindow：8 班以內全列', () => {
  const rows = departureRows(many(8), '09:00', null);
  assert.deepEqual(timetableWindow(rows, '09:00'), { rows, hidden: 0 });
});

test('timetableWindow：超過 8 班列走到站之前 1 班、之後 4 班', () => {
  const rows = departureRows(many(20), '09:10', null);
  const w = timetableWindow(rows, '09:10');
  // 09:10 之後第一班是 09:20
  assert.deepEqual(w.rows.map((r) => r.depart), ['09:00', '09:20', '09:40', '10:00', '10:20']);
  assert.equal(w.hidden, 15);
  assert.equal(timetableWindow(rows, '09:10', true).hidden, 0);
});

test('timetableWindow：最早的一班之前、最後一班之後', () => {
  const rows = departureRows(many(12), '07:00', null);
  assert.deepEqual(timetableWindow(rows, '07:00').rows.map((r) => r.depart), ['08:00', '08:20', '08:40', '09:00']);
  // 走到站時已經沒有班次：只列最後一班（搭不到）
  assert.deepEqual(timetableWindow(rows, '23:00').rows.map((r) => r.depart), ['11:40']);
});

test('timetableWindow：選定的那班在範圍外時拉進來', () => {
  const rows = departureRows(many(20), '09:10', 't15');
  const w = timetableWindow(rows, '09:10');
  assert.equal(w.rows[0].depart, '09:00');
  assert.equal(w.rows.at(-1)!.tripId, 't15');
  assert.equal(w.hidden, 20 - w.rows.length);
});

test('departureLabel：搭不到、等 N 分、1 小時以上、選定', () => {
  const row = (state: DepartureRow['state'], wait: number | null, missedSelected?: boolean) => ({ tripId: 'x', line: '', depart: '10:00', arrive: '10:30', state, wait, ...(missedSelected ? { missedSelected } : {}) }) as DepartureRow;
  assert.deepEqual(departureLabel(row('missed', null)), { text: '搭不到', long: false });
  assert.deepEqual(departureLabel(row('ok', 43)), { text: '等 43 分', long: false });
  assert.deepEqual(departureLabel(row('ok', 113)), { text: '等 1小時53分', long: true });
  assert.deepEqual(departureLabel(row('ok', 60)), { text: '等 1小時00分', long: true });
  assert.deepEqual(departureLabel(row('selected', 43)), { text: '等 43 分・選定', long: false });
  assert.deepEqual(departureLabel(row('selected', null, true)), { text: '搭不到・選定', long: false });
});

test('readyHint：走到上車站、轉乘完', () => {
  const names: Record<string, string> = { kawabe: '川辺', ujiyamada: '宇治山田' };
  const nameOf = (id: string) => names[id] ?? id;
  const leg = {
    depart: '15:01',
    ready: ['15:15', '16:53'],
    rides: [
      { mode: 'bus' as const, line: '御座線', from: 'kawabe', to: 'ujiyamada', depart: '15:58', arrive: '16:48' },
      { mode: 'train' as const, line: '特急', from: 'ujiyamada', to: 'toba', depart: '17:00', arrive: '17:15' },
    ],
  };
  assert.equal(readyHint(leg, 0, '伊雜宮', nameOf), '走到 川辺：15:15（伊雜宮 15:01 出發）');
  assert.equal(readyHint(leg, 1, '伊雜宮', nameOf), '宇治山田 轉乘完：16:53（16:48 到站）');
});

test('timetableSource：路線檔、近鐵、沒有來源', () => {
  const route = {
    id: 'sanco-goza',
    mode: 'bus',
    operator: '三重交通',
    name: { ja: '御座線' },
    validFrom: '2026-10-01',
    stops: [],
    trips: {},
    retrieved: '2026-10-19',
    sources: [{ url: 'https://example.com/goza', retrieved: '2026-10-19' }],
  } as unknown as RouteTimetable;
  const kintetsu = { validFrom: '2026-03-14', stationOrder: [], trains: { weekday: {}, holiday: {} }, retrieved: '2026-10-17' } as unknown as KintetsuTimes;
  // 2027-02-04 是週四、2027-02-06 週六、2027-02-11 國定假日
  assert.deepEqual(timetableSource({ mode: 'bus', routeId: 'sanco-goza' }, { routes: [route], kintetsu }, '2027-02-04', []), {
    text: '時刻表來源：三重交通（2026-10-19 取得）・平日',
    url: 'https://example.com/goza',
  });
  assert.equal(timetableSource({ mode: 'bus', routeId: 'sanco-goza' }, { routes: [route] }, '2027-02-06', [])?.text, '時刻表來源：三重交通（2026-10-19 取得）・週六');
  assert.equal(timetableSource({ mode: 'bus', routeId: 'sanco-goza' }, { routes: [route] }, '2027-02-11', ['2027-02-11'])?.text.endsWith('週日、假日'), true);
  assert.deepEqual(timetableSource({ mode: 'train', routeId: null }, { routes: [route], kintetsu }, '2027-02-06', []), {
    text: '時刻表來源：近鐵（2026-10-17 取得）・週末、假日',
    url: null,
  });
  // 沒有取得日期也沒有網址、找不到路線檔：不寫
  const bare = { ...kintetsu, retrieved: undefined } as unknown as KintetsuTimes;
  assert.equal(timetableSource({ mode: 'train', routeId: null }, { kintetsu: bare }, '2027-02-04', []), null);
  assert.equal(timetableSource({ mode: 'bus', routeId: 'nope' }, { routes: [route] }, '2027-02-04', []), null);
});

test('legKeyOf、findLegEntry：用交通卡的 key 找那段交通（含分組裡的）', () => {
  const leg = { mode: 'walk', rides: [] };
  const e = (kind: TimelineEntry['kind'], itemId: string | null, extra: Partial<TimelineEntry> = {}) => ({ kind, itemId, placeId: `p-${itemId}`, travel: leg, ...extra }) as unknown as TimelineEntry;
  const inGroup = e('visit', 'g1');
  const day = {
    date: '2027-02-04',
    entries: [e('start', null, { travel: null }), e('visit', 'v1'), e('meet', 'm1', { groups: [{ id: 'a', name: 'A', entries: [inGroup] }] }), e('lodging', null)],
  } as unknown as DayPlan;
  assert.equal(legKeyOf(day.entries[1], day.date), '2027-02-04:visit:v1');
  assert.equal(legKeyOf(day.entries[3], day.date), '2027-02-04:lodging');
  assert.equal(findLegEntry(day, '2027-02-04:visit:v1'), day.entries[1]);
  assert.equal(findLegEntry(day, '2027-02-04:visit:g1'), inGroup);
  assert.equal(findLegEntry(day, '2027-02-04:lodging'), day.entries[3]);
  assert.equal(findLegEntry(day, '2027-02-04:visit:gone'), null);
  // 起點沒有交通
  assert.equal(findLegEntry(day, legKeyOf(day.entries[0], day.date)), null);
  assert.equal(findLegEntry(null, '2027-02-04:visit:v1'), null);
});
