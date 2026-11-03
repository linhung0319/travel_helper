// T34：行程摘要什麼時候存、存什麼（給 LINE 機器人讀）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { removeItem, type DayPlan, type ItineraryPlan } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { createShared } from '../src/sharedStore.ts';
import { createMockBackend } from '../src/backend/mock.ts';
import type { DataState } from '../src/dataStore.ts';
import type { PlanState } from '../src/planStore.ts';
import { startSummaryPush, summaryOf } from '../src/lib/tripSummary.ts';
import { itin, placeWith } from './helpers.ts';

const PLACES = [
  placeWith({}, { id: 'x', type: 'spot', name: { ja: 'エックス', zh: '景點X', en: null } }),
  placeWith({ reservation: { accepted: 'yes' } }, { id: 'r', name: { ja: 'アール', zh: '', en: null } }),
  placeWith({}, { id: 'h', type: 'lodging', name: { ja: '宿', zh: '海邊旅館', en: null } }),
];
const byId = new Map(PLACES.map((p) => [p.id, p]));

/** 每個造訪排一小時，從 10:00 開始 */
function fakePlan(it: Itinerary): ItineraryPlan {
  const days: DayPlan[] = it.days.map((d) => ({
    date: d.date,
    gaps: [],
    warnings: [],
    stats: { walkMinutes: 0, mainSpots: 0, returnTime: null, tiring: false, freeMinutes: 0 },
    entries: d.items.map((x, i) => ({
      kind: 'visit' as const,
      itemId: x.id,
      placeId: x.type === 'visit' ? x.options[x.selected].place : null,
      travel: null,
      arrive: `${10 + i}:00`,
      start: `${10 + i}:00`,
      end: `${10 + i}:50`,
      waitMinutes: 0,
    })),
  }));
  return { days, warnings: [] };
}

test('摘要：名稱中文優先，要預約的列出主選和住宿', () => {
  const it = itin({ '2027-02-03': ['x', 'r'] }, { '2027-02-03': 'h' });
  const s = summaryOf(it, fakePlan(it), byId);
  assert.deepEqual(s.days[0], {
    date: '2027-02-03',
    lodging: '海邊旅館',
    area: null,
    stayArea: null,
    lines: [
      { start: '10:00', end: '10:50', text: '景點X' },
      { start: '11:00', end: '11:50', text: 'アール' },
    ],
  });
  assert.deepEqual(s.reservations, [
    { date: '2027-02-03', placeId: 'r', name: 'アール', time: '11:00', endDate: null },
    { date: '2027-02-03', placeId: 'h', name: '海邊旅館', time: null, endDate: '2027-02-04' },
  ]);
});

const tick = () => new Promise((r) => setTimeout(r, 5));

test('自己存完行程、時間軸算好後存摘要；別人已經存了就不存', async () => {
  const backend = createMockBackend({ members: [{ id: 'm-a', displayName: '阿公', pictureUrl: null }], me: 'm-a', itinerary: itin({ '2027-02-03': ['x', 'r'] }) });
  const data = createStore<DataState>()(() => ({
    status: 'ready',
    error: null,
    areas: [],
    basePlaces: PLACES,
    places: PLACES,
    byId,
    itinerary: null,
    days: new Map(),
    stationNames: new Map(),
    details: null,
    detailsError: null,
    placeEdits: [],
  }));
  const plan = createStore<PlanState>()(() => ({ status: 'loading', error: null, plan: null }));
  // 時間軸跟著行程算（同 planStore 的 startPlanner）
  data.subscribe((s, prev) => {
    if (s.itinerary !== prev.itinerary) plan.setState({ status: 'ready', plan: s.itinerary ? fakePlan(s.itinerary) : null });
  });
  const shared = createShared(() => backend, data);
  let puts = 0;
  const real = backend.putTripSummary;
  backend.putTripSummary = (v, s) => {
    puts++;
    return real(v, s);
  };
  const stop = startSummaryPush({ shared: shared.store, data, plan, backend: () => backend, delayMs: 0 });

  // 打開網站：後端還沒有摘要 → 補存第 1 版
  await shared.load();
  await tick();
  assert.equal((await backend.sync()).summary, 1);
  assert.equal(puts, 1);

  // 改行程：存完才存摘要（第 2 版）
  await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '拿掉 X');
  await tick();
  assert.equal((await backend.sync()).summary, 2);
  assert.equal(puts, 2);

  // 重新載入：後端已經是這一版的摘要 → 不再存
  await shared.load();
  await tick();
  assert.equal(puts, 2);
  stop();
});
