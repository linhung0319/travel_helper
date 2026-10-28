import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayPlan, KintetsuTimes, RouteTimetable, TimelineEntry, TransitRide } from '@travel-helper/engine';
import { findLegEntry, legKeyOf } from '../src/lib/planView.ts';
import { headwayText, timetableSource, timetableSubtitle } from '../src/lib/timetableView.ts';

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

const ride = (r: Partial<TransitRide>): TransitRide => ({ mode: 'train', line: '', from: 'a', to: 'b', depart: '08:11', arrive: '08:26', ...r });

test('timetableSubtitle：業者或路線・往哪・日期（星期）・到站時間；巴士加票價', () => {
  // 2027-02-05 是週五
  assert.equal(timetableSubtitle(ride({ line: '特急（往賢島）', operator: 'kintetsu', tripId: '1234' }), '2027-02-05', '08:00'), '近鐵・往賢島・2/5（五）・08:00 到站');
  // 舊資料沒有 operator 的近鐵、沒寫往哪
  assert.equal(timetableSubtitle(ride({ line: '急行' }), '2027-02-05', '08:00'), '近鐵・2/5（五）・08:00 到站');
  assert.equal(
    timetableSubtitle(ride({ mode: 'bus', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）', routeId: 'kamome-5', fareAdult: 260 }), '2027-02-05', '08:29'),
    '鷗巴士 5 號・往国崎・2/5（五）・08:29 到站・260 円',
  );
  // 巴士沒有票價：不寫
  assert.equal(timetableSubtitle(ride({ mode: 'bus', line: '外宮內宮線', routeId: 'x', fareAdult: null }), '2027-02-10', '10:05'), '外宮內宮線・2/10（三）・10:05 到站');
  // 班距型：業者簡稱＋線名
  assert.equal(
    timetableSubtitle(ride({ line: '大阪環狀線', operator: 'JR西日本', kind: 'headway', routeId: 'jr-loop', headwayMin: 5 }), '2027-02-12', '09:00'),
    'JR 環狀線・2/12（五）・09:00 到站',
  );
});

test('headwayText：約 N 分一班・首班／末班；沒查到的寫「沒查到」', () => {
  assert.equal(headwayText(ride({ kind: 'headway', headwayMin: 15, first: '05:45', last: '23:02' })), '約 15 分一班・首班 05:45／末班 23:02');
  assert.equal(headwayText(ride({ kind: 'headway', headwayMin: null, first: null, last: '23:02' })), '班距沒查到・首班 沒查到／末班 23:02');
  assert.equal(headwayText(ride({ kind: 'headway' })), '班距沒查到・首班 沒查到／末班 沒查到');
});
