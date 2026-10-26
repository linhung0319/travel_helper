// T12：路線（OSRM、沿車站、直線）、分鐘、地圖上的圖層資料、背景補路徑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { createRoadRouter, lineMeters, lineMidpoint, minutesFromMeters, railPath, rideStations, ridesPath, roadKey, routeLabel, routeProfile, type KeyValueStorage } from '../src/lib/routing.ts';
import { MODE_ICON, MODE_NAME, modeIconHtml, modeIconKey } from '../src/lib/modeIcon.ts';
import { describeChanges, itineraryFeatures, proposalFeatures, routeFeatures, routeLabels } from '../src/lib/overlays.ts';
import { createAppStore } from '../src/store.ts';
import { createCommands } from '../src/commands.ts';
import { startRouteResolver } from '../src/routeResolver.ts';
import { createPathOf, startItineraryRoutes } from '../src/itineraryRoutes.ts';
import { tripDates } from '../src/lib/trip.ts';
import type { PlanState } from '../src/planStore.ts';
import { normalizePlace } from '../src/data/normalize.ts';
import { placeDays } from '../src/lib/itinerary.ts';
import type { DataState } from '../src/dataStore.ts';
import type { Place } from '../src/data/types.ts';
import { DEFAULT_CONFIG } from '@travel-helper/engine';
import { itin } from './helpers.ts';

const PARTY = { size: 15, elders: 5, kids: 4 };

test('交通方式 → 路徑的查法', () => {
  assert.equal(routeProfile('walk'), 'foot');
  assert.equal(routeProfile('taxi'), 'car');
  assert.equal(routeProfile('bus'), 'car');
  assert.equal(routeProfile('train'), 'rail');
  assert.equal(routeProfile('ferry'), 'straight');
  assert.equal(routeProfile('transit'), 'straight');
});

test('分鐘：步行用路徑距離 ÷ 80 m/分 × 全員係數（不再乘繞路係數）；計程車用 engine 的速度；電車不算', () => {
  assert.equal(minutesFromMeters('walk', 800, PARTY), 14); // 800 / 80 × 1.4
  const taxi = minutesFromMeters('taxi', 6000, PARTY)!;
  assert.ok(taxi >= 12 && taxi < 20, String(taxi)); // 6 km、30 km/h 是 12 分，加上叫車的時間
  assert.equal(minutesFromMeters('train', 6000, PARTY), null);
  assert.equal(routeLabel('walk', 13.2), '14 分');
  assert.equal(routeLabel('train', null), '…');
  assert.equal(routeLabel('train', 12, '特急 10:05 發'), '特急 10:05 發');
});

test('minutesFromMeters：計程車有路線時間時用它（再由 routeLabel 進位）', () => {
  const cfg = DEFAULT_CONFIG;
  const m = minutesFromMeters('taxi', 4200, PARTY, cfg, 9.6)!;
  assert.equal(m, 9.6 + cfg.taxi.overheadMinutes);
  assert.equal(routeLabel('taxi', m), '10 分');
  assert.equal(minutesFromMeters('walk', 800, PARTY, cfg, 99), 14); // 步行不受影響
});

test('折線的長度和中點', () => {
  const coords: [number, number][] = [
    [136.8, 34.5],
    [136.81, 34.5],
    [136.82, 34.5],
  ];
  const m = lineMeters(coords);
  assert.ok(m > 1800 && m < 1900, String(m));
  const mid = lineMidpoint(coords);
  assert.ok(Math.abs(mid[0] - 136.81) < 1e-6);
});

const STATIONS = [
  { id: 's71', coords: [1, 0] as [number, number], operator: 'kintetsu', stationNumber: 'M71' },
  { id: 's72', coords: [2, 0] as [number, number], operator: 'kintetsu', stationNumber: 'M72' },
  { id: 's73', coords: [3, 0] as [number, number], operator: 'kintetsu', stationNumber: 'M73' },
  { id: 'jr1', coords: [5, 0] as [number, number], operator: 'jr', stationNumber: null },
  { id: 'nk', coords: [9, 0] as [number, number], operator: 'other', stationNumber: 'JR-S47／NK32' },
];

test('電車：同一家、同字首的站號依序連起來；反方向倒過來；連不起來 → null', () => {
  assert.deepEqual(railPath('s71', 's73', STATIONS), [
    [1, 0],
    [2, 0],
    [3, 0],
  ]);
  assert.deepEqual(railPath('s73', 's72', STATIONS), [
    [3, 0],
    [2, 0],
  ]);
  assert.equal(railPath('s71', 'jr1', STATIONS), null);
  assert.equal(railPath('s71', 'nk', STATIONS), null);
  assert.equal(railPath('s71', 'nope', STATIONS), null);
});

test('照班次畫：起點 → 上車站，每一程沿車站，轉乘的兩站直線，下車站 → 終點；亮起來的站含轉乘站', () => {
  const coordsOf = (id: string) => STATIONS.find((x) => x.id === id)?.coords ?? null;
  const rides = [
    { mode: 'train' as const, from: 's71', to: 's73' },
    { mode: 'train' as const, from: 'jr1', to: 'nk' },
  ];
  assert.deepEqual(ridesPath([0, 1], [10, 1], rides, STATIONS, coordsOf), [
    [0, 1], // 起點
    [1, 0], // s71 上車
    [2, 0], // 經過 s72
    [3, 0], // s73 下車
    [5, 0], // 走到 jr1 轉乘（JR 沒有站號：直線）
    [9, 0], // nk 下車
    [10, 1], // 終點
  ]);
  assert.deepEqual(rideStations(rides), ['s71', 's73', 'jr1', 'nk']);
  // 巴士、船不沿車站；站找不到的那一程略過，全部找不到 → null
  assert.deepEqual(ridesPath([0, 1], [10, 1], [{ mode: 'bus', from: 's71', to: 's73' }], STATIONS, coordsOf), [[0, 1], [1, 0], [3, 0], [10, 1]]);
  assert.equal(ridesPath([0, 1], [10, 1], [{ mode: 'bus', from: '鳥羽バスセンター', to: '答志' }], STATIONS, coordsOf), null);
  assert.equal(ridesPath([0, 1], [10, 1], [], STATIONS, coordsOf), null);
});

test('提議的摘要：回住宿的交通', () => {
  assert.deepEqual(describeChanges([{ kind: 'return-travel', date: '2027-02-05' }], (id) => id), [{ date: '2027-02-05', text: '2/5：回住宿的交通' }]);
});

function osrmBody(coords: [number, number][], distance: number) {
  return { code: 'Ok', routes: [{ distance, duration: 1, geometry: { coordinates: coords } }], waypoints: [{ distance: 3 }, { distance: 2 }] };
}

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('OSRM：查一次後存在記憶體和 storage；同時查同一段只打一次；距離含到道路的距離', async () => {
  const urls: string[] = [];
  const storage = memoryStorage();
  const fetch = async (url: string) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => osrmBody([[136.8, 34.5], [136.81, 34.5]], 1000) };
  };
  const router = createRoadRouter({ fetch, storage, minIntervalMs: 0 });
  const [a, b] = await Promise.all([router.route('foot', [136.8, 34.5], [136.81, 34.5]), router.route('foot', [136.8, 34.5], [136.81, 34.5])]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /routed-foot\/route\/v1\/driving\/136.8,34.5;136.81,34.5\?/);
  assert.equal(a?.meters, 1005);
  assert.deepEqual(a, b);
  assert.equal(router.cachedMeters('foot', [136.8, 34.5], [136.81, 34.5]), 1005);
  assert.equal(router.cachedMeters('car', [136.8, 34.5], [136.81, 34.5]), null);
  assert.ok(storage.data.has(`travel-helper:route:${roadKey('foot', [136.8, 34.5], [136.81, 34.5])}`));

  // 新的 router（重新整理頁面）從 storage 讀，不再查
  const again = createRoadRouter({ fetch, storage, minIntervalMs: 0 });
  assert.equal((await again.route('foot', [136.8, 34.5], [136.81, 34.5]))?.meters, 1005);
  assert.equal(urls.length, 1);

  await router.route('car', [136.8, 34.5], [136.81, 34.5]);
  assert.match(urls[1], /routed-car/);
});

test('OSRM：錯誤（HTTP、沒有路線、網路）回傳 null，不寫快取；請求之間有間隔', async () => {
  const responses = [
    async () => ({ ok: false, status: 429, json: async () => ({}) }),
    async () => ({ ok: true, status: 200, json: async () => ({ code: 'NoRoute' }) }),
    async () => {
      throw new Error('offline');
    },
  ];
  const sleeps: number[] = [];
  let t = 0;
  const storage = memoryStorage();
  const router = createRoadRouter({
    fetch: (() => {
      let i = 0;
      return () => responses[i++]();
    })(),
    storage,
    minIntervalMs: 1100,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  });
  assert.equal(await router.route('foot', [0, 0], [0, 0.01]), null);
  assert.equal(await router.route('foot', [0, 0], [0, 0.02]), null);
  assert.equal(await router.route('foot', [0, 0], [0, 0.03]), null);
  assert.equal(storage.data.size, 0);
  assert.equal(router.apiCalls, 3);
  assert.deepEqual(sleeps, [1100, 1100]);
});

test('查失敗的段落 10 分鐘內不重查，過了才再查；成功的不受影響', async () => {
  let t = 1000;
  let calls = 0;
  let fail = true;
  const router = createRoadRouter({
    fetch: async () => {
      calls++;
      return fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => osrmBody([[0, 0], [0, 0.005], [0, 0.01]], 1000) };
    },
    now: () => t,
    sleep: async () => undefined,
    minIntervalMs: 0,
  });
  assert.equal(await router.route('foot', [0, 0], [0, 0.01]), null);
  assert.equal(calls, 1);
  t += 9 * 60 * 1000;
  assert.equal(await router.route('foot', [0, 0], [0, 0.01]), null);
  assert.equal(calls, 1); // 還在 10 分鐘內
  assert.equal(await router.route('car', [0, 0], [0, 0.01]), null); // 另一個 profile 是另一個 key
  assert.equal(calls, 2);
  t += 2 * 60 * 1000;
  fail = false;
  assert.ok(await router.route('foot', [0, 0], [0, 0.01]));
  assert.equal(calls, 3); // 過了 TTL 再查
  assert.ok(await router.route('foot', [0, 0], [0, 0.01])); // 成功後走快取
  assert.equal(calls, 3);
});

function place(id: string, coords: [number, number], over: Record<string, unknown> = {}): Place {
  const p = normalizePlace({ id, type: 'spot', name: { ja: id }, area: 'x', coords, sources: [], ...over });
  assert.ok(p);
  return p;
}

function setup(router: Parameters<typeof startRouteResolver>[2]) {
  const places = [
    place('a', [136.8, 34.5]),
    place('b', [136.81, 34.5]),
    place('st1', [136.7, 34.4], { type: 'station', operator: 'kintetsu', stationNumber: 'M1' }),
    place('st2', [136.72, 34.41], { type: 'station', operator: 'kintetsu', stationNumber: 'M2' }),
    place('st3', [136.74, 34.42], { type: 'station', operator: 'kintetsu', stationNumber: 'M3' }),
  ];
  const app = createAppStore();
  const data = createStore<DataState>()(() => ({
    status: 'ready',
    error: null,
    areas: [],
    basePlaces: places,
    places,
    byId: new Map(places.map((p) => [p.id, p])),
    itinerary: null,
    days: new Map(),
    stationNames: new Map(),
  }));
  const stop = startRouteResolver(app, data, router);
  return { app, cmd: createCommands(app, data), stop };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('背景補路徑：步行沿道路並算分鐘；電車沿車站；查不到畫直線；給了分鐘就不改', async () => {
  const fetch = async (url: string) =>
    url.includes('routed-foot')
      ? { ok: true, status: 200, json: async () => osrmBody([[136.8, 34.5], [136.805, 34.502], [136.81, 34.5]], 795) }
      : { ok: false, status: 503, json: async () => ({}) };
  const { app, cmd, stop } = setup(createRoadRouter({ fetch, minIntervalMs: 0 }));
  cmd.drawRoute('a', 'b', 'walk');
  cmd.drawRoute('st1', 'st3', 'train', { minutes: 6 });
  cmd.drawRoute('a', 'b', 'taxi');
  cmd.drawRoute('a', 'b', 'ferry');
  await tick();
  await tick();
  const [walk, train, taxi, ferry] = app.getState().routes;
  assert.equal(walk.source, 'osrm');
  assert.equal(walk.meters, 800); // 795 + 吸附 3 + 2
  assert.equal(walk.minutes, 14);
  assert.equal(walk.geometry?.length, 5); // 起訖點接上 OSRM 的路徑
  assert.equal(train.source, 'rail');
  assert.equal(train.geometry?.length, 3);
  assert.equal(train.minutes, 6);
  assert.equal(taxi.source, 'straight');
  assert.ok(taxi.minutes! > 0);
  assert.equal(ferry.source, 'straight');
  assert.equal(ferry.minutes, null);
  stop();
});

test('路線在查的時候被清掉，結果不寫回', async () => {
  let release: () => void = () => {};
  const fetch = () =>
    new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>((resolve) => {
      release = () => resolve({ ok: true, status: 200, json: async () => osrmBody([[0, 0], [1, 1]], 10) });
    });
  const { app, cmd, stop } = setup(createRoadRouter({ fetch, minIntervalMs: 0 }));
  cmd.drawRoute('a', 'b', 'walk');
  await tick();
  cmd.clearHighlights();
  release();
  await tick();
  await tick();
  assert.deepEqual(app.getState().routes, []);
  stop();
});

test('路線的圖層資料：還在查、直線的比較淡；步行點線、船虛線；中間的標籤', () => {
  const base = { from: { place: 'a', coords: [0, 0] as [number, number] }, to: { place: 'b', coords: [0, 1] as [number, number] }, label: null, meters: null, minutesGiven: false };
  const routes = [
    { ...base, id: 'r1', mode: 'walk' as const, minutes: null, geometry: null, source: 'pending' as const },
    { ...base, id: 'r2', mode: 'ferry' as const, minutes: 30, minutesGiven: true, geometry: [[0, 0], [0, 1]] as [number, number][], source: 'straight' as const },
    { ...base, id: 'r3', mode: 'train' as const, minutes: 12, geometry: [[0, 0], [0, 0.5], [0, 1]] as [number, number][], source: 'rail' as const },
  ];
  const f = routeFeatures(routes);
  assert.deepEqual(
    f.features.map((x) => [x.properties?.dash, x.properties?.estimate]),
    [
      ['dot', 1],
      ['dash', 1],
      ['solid', 0],
    ],
  );
  assert.deepEqual(
    routeLabels(routes).map((l) => l.text),
    ['…', '30 分', '12 分'],
  );
  const ls = routeLabels(routes);
  assert.deepEqual(
    ls.map((l) => [l.mode, l.minutes]),
    [
      ['walk', null],
      ['ferry', 30],
      ['train', 12],
    ],
  );
  for (const l of ls) assert.doesNotMatch(l.text, /\p{Extended_Pictographic}/u);
  assert.equal(modeIconKey('transit'), 'bus');
  assert.equal(modeIconKey('charter'), 'car');
  assert.equal(modeIconKey('train'), 'train');
});

test('交通未定：灰色問號圖示（不是車）；drawRoute 帶 unknown 時標籤也用問號', () => {
  assert.equal(modeIconKey('unknown'), 'unknown');
  assert.equal(MODE_NAME.unknown, '交通未定');
  assert.notEqual(MODE_ICON.unknown.path, MODE_ICON.car.path);
  assert.match(modeIconHtml('unknown', 's'), /aria-label="交通未定"/);
  assert.equal(modeIconKey('other'), 'car');
  const base = { from: { place: 'a', coords: [0, 0] as [number, number] }, to: { place: 'b', coords: [0, 1] as [number, number] }, label: null, meters: null, minutesGiven: false, minutes: null, geometry: null, source: 'pending' as const };
  const ls = routeLabels([
    { ...base, id: 'r1', mode: 'other' as const, unknown: true },
    { ...base, id: 'r2', mode: 'other' as const },
  ]);
  assert.deepEqual(ls.map((l) => l.mode), ['unknown', 'other']);
});

test('提議的圖層資料：提議的順序、新增的點、拿掉的點、虛線；摘要一天一行', () => {
  const places = [place('a', [0, 0]), place('b', [0, 1]), place('c', [0, 2])];
  const byId = new Map(places.map((p) => [p.id, p]));
  const current = itin({ '2027-02-05': ['a', 'b'] });
  const proposed = itin({ '2027-02-05': ['a', 'c'] });
  const dates = ['2027-02-04', '2027-02-05'];
  const changes = [
    { kind: 'added' as const, date: '2027-02-05', place: 'c' },
    { kind: 'removed' as const, date: '2027-02-05', place: 'b' },
  ];
  const { points, lines } = proposalFeatures({ itinerary: proposed, dates: ['2027-02-05'], changes, summary: null }, current, byId, dates);
  assert.deepEqual(
    points.features.map((f) => [f.properties?.id, f.properties?.order, f.properties?.status]),
    [
      ['a', 1, 'kept'],
      ['c', 2, 'added'],
      ['b', 0, 'removed'],
    ],
  );
  assert.equal(lines.features.length, 1);
  assert.equal(lines.features[0].geometry.coordinates.length, 2);
  // 確定的行程沒有那天時，全部算新增
  const fresh = proposalFeatures({ itinerary: proposed, dates: ['2027-02-05'], changes, summary: null }, null, byId, dates);
  assert.deepEqual(
    fresh.points.features.map((f) => f.properties?.status),
    ['added', 'added'],
  );

  const names: Record<string, string> = { b: '海の博物館', c: '鳥羽水族館' };
  assert.deepEqual(
    describeChanges([...changes, { kind: 'moved-day', date: '2027-02-06', fromDate: '2027-02-05', place: 'a' }], (id) => names[id] ?? id),
    [
      { date: '2027-02-05', text: '2/5：＋鳥羽水族館、－海の博物館、－a（移到 2/6）' },
      { date: '2027-02-06', text: '2/6：＋a（從 2/5）' },
    ],
  );
});

test('placeDays 用的是 engine 的行程：同一個點排在兩天', () => {
  const days = placeDays(itin({ '2027-02-05': ['a', 'b'], '2027-02-06': ['b'] }));
  assert.deepEqual(days.get('b'), [
    { date: '2027-02-05', order: 2 },
    { date: '2027-02-06', order: 1 },
  ]);
});

// --- 地圖上的行程線（第三輪 Task 7） ---------------------------------------------

const DAY = '2027-02-05';
const leg = (mode: string) => ({ mode, from: null, to: null, depart: '09:00', arrive: '09:10', minutes: 10, walkMinutes: 0, waitMinutes: 0 });
/** 只有 itineraryFeatures 用得到的欄位 */
function fakePlan(mode: string, legs: [string, string, string][] = [[DAY, 'a', 'b']]) {
  return {
    days: legs.map(([date, from, to]) => ({
      date,
      entries: [
        { placeId: from, travel: null },
        { placeId: to, travel: leg(mode) },
      ],
    })),
  } as never;
}
const DAY2 = '2027-02-06';
const itinAB = () => itin({ [DAY]: ['a', 'b'], [DAY2]: ['c', 'd'] });
const TWO_DAYS = (): [string, string, string][] => [[DAY, 'a', 'b'], [DAY2, 'c', 'd']];
const A = place('a', [136.8, 34.5]);
const B = place('b', [136.81, 34.5]);
const C = place('c', [136.9, 34.6]);
const D = place('d', [136.91, 34.6]);
const byIdAB = new Map([['a', A], ['b', B], ['c', C], ['d', D]]);

test('行程線：pathOf 給三個點的路徑就接起來，標籤放在路徑中點；不給就是直線', () => {
  const mid: [number, number] = [136.805, 34.502];
  const calls: string[] = [];
  const withPath = itineraryFeatures(itinAB(), fakePlan('walk'), byIdAB, tripDates(), DAY, (from, to, mode) => {
    calls.push(`${from.id}>${to.id}:${mode}`);
    return [A.coords, mid, B.coords];
  });
  assert.deepEqual(calls, ['a>b:walk']);
  assert.deepEqual(withPath.lines.features[0].geometry.coordinates, [A.coords, mid, B.coords]);
  assert.deepEqual(withPath.legs[0].coords, lineMidpoint([A.coords, mid, B.coords]));
  const plain = itineraryFeatures(itinAB(), fakePlan('walk'), byIdAB, tripDates(), DAY);
  assert.deepEqual(plain.lines.features[0].geometry.coordinates, [A.coords, B.coords]);
  const none = itineraryFeatures(itinAB(), fakePlan('walk'), byIdAB, tripDates(), DAY, () => null);
  assert.deepEqual(none.lines.features[0].geometry.coordinates, [A.coords, B.coords]);
});

test('itineraryFeatures：選了某天只畫那天，全部時兩天都畫', () => {
  const dates = (day: string) => itineraryFeatures(itinAB(), fakePlan('walk', TWO_DAYS()), byIdAB, tripDates(), day).lines.features.map((f) => f.properties!.date);
  assert.deepEqual(dates(DAY), [DAY]);
  assert.deepEqual(dates(DAY2), [DAY2]);
  assert.deepEqual(dates('all'), [DAY, DAY2]);
  const alts = itineraryFeatures(itinAB(), null, byIdAB, tripDates(), DAY).alts.features;
  assert.ok(alts.every((f) => f.properties!.date === DAY));
});

test('行程線：createPathOf 步行看快取、電車沿車站、船和未知是 null', async () => {
  const router = createRoadRouter({ fetch: async () => ({ ok: true, status: 200, json: async () => osrmBody([[136.8, 34.5], [136.805, 34.502], [136.81, 34.5]], 795) }), minIntervalMs: 0 });
  const { data } = setupItinerary(router);
  const pathOf = createPathOf(router, data);
  assert.equal(pathOf(A, B, 'walk'), null); // 還沒查
  await router.route('foot', A.coords, B.coords);
  assert.equal(pathOf(A, B, 'walk')?.length, 3);
  assert.equal(pathOf(A, B, 'taxi'), null); // 車是另一個 profile
  const st = (id: string) => data.getState().byId.get(id)!;
  assert.equal(pathOf(st('st1'), st('st3'), 'train')?.length, 3);
  assert.equal(pathOf(A, B, 'ferry'), null);
  assert.equal(pathOf(A, B, 'unknown'), null);
  // 地點 → 地點的電車：照班次，從 A 走到 st1，沿車站到 st3，再到 B
  const ride = { mode: 'train' as const, line: '普通', from: 'st1', to: 'st3', depart: '09:00', arrive: '09:10' };
  assert.deepEqual(pathOf(A, B, 'train', [ride]), [A.coords, st('st1').coords, st('st2').coords, st('st3').coords, B.coords]);
  assert.equal(pathOf(A, B, 'train'), null); // 沒有班次、起訖不是車站
});

function setupItinerary(router: ReturnType<typeof createRoadRouter>, mode = 'walk') {
  const places = [
    A,
    B,
    C,
    D,
    place('st1', [136.7, 34.4], { type: 'station', operator: 'kintetsu', stationNumber: 'M1' }),
    place('st2', [136.72, 34.41], { type: 'station', operator: 'kintetsu', stationNumber: 'M2' }),
    place('st3', [136.74, 34.42], { type: 'station', operator: 'kintetsu', stationNumber: 'M3' }),
  ];
  const app = createAppStore();
  const data = createStore<DataState>()(() => ({
    status: 'ready',
    error: null,
    areas: [],
    basePlaces: places,
    places,
    byId: new Map(places.map((p) => [p.id, p])),
    itinerary: itinAB(),
    days: new Map(),
    stationNames: new Map(),
  }));
  const plan = createStore<PlanState>()(() => ({ status: 'ready', error: null, plan: fakePlan(mode, TWO_DAYS()) }));
  return { app, data, plan, router };
}

const OK = (url: string) => ({ ok: true, status: 200, json: async () => osrmBody([[136.8, 34.5], [136.805, 34.502], [136.81, 34.5]], 795), url });
const ticks = async (n = 6) => {
  for (let i = 0; i < n; i++) await tick();
};

test('行程線：選「全部」每一天都查（照日期）；選了某天，那天先、其他天照日期接著', async () => {
  const urls: string[] = [];
  const router = createRoadRouter({ fetch: async (u: string) => (urls.push(u), OK(u)), minIntervalMs: 0 });
  const { app, data, plan } = setupItinerary(router);
  const stop = startItineraryRoutes(app, data, plan, router);
  await ticks();
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes('136.8,34.5;136.81,34.5') && urls[1].includes('136.9,34.6;136.91,34.6'), urls.join('\n'));
  assert.equal(app.getState().routesVersion, 2);
  stop();

  // 選了 2/6：2/6 的先查
  const urls2: string[] = [];
  const router2 = createRoadRouter({ fetch: async (u: string) => (urls2.push(u), OK(u)), minIntervalMs: 0 });
  const s2 = setupItinerary(router2);
  s2.app.getState().selectDay(DAY2);
  const stop2 = startItineraryRoutes(s2.app, s2.data, s2.plan, router2);
  await ticks();
  assert.equal(urls2.length, 2);
  assert.ok(urls2[0].includes('136.9,34.6') && urls2[1].includes('136.8,34.5'), urls2.join('\n'));
  // 同樣的資料再觸發不重查
  s2.plan.setState({ plan: fakePlan('walk', TWO_DAYS()) });
  await ticks();
  assert.equal(urls2.length, 2);
  stop2();
});

test('行程線：查到一半換天（2/5 → 2/6）：新的那天優先，routesVersion 照樣加', async () => {
  const urls: string[] = [];
  const gates: (() => void)[] = [];
  const fetch = (url: string) =>
    new Promise<ReturnType<typeof OK>>((resolve) => {
      urls.push(url);
      gates.push(() => resolve(OK(url)));
    });
  const router = createRoadRouter({ fetch, minIntervalMs: 0 });
  const { app, data, plan } = setupItinerary(router);
  app.getState().selectDay(DAY);
  const stop = startItineraryRoutes(app, data, plan, router);
  await tick();
  assert.equal(urls.length, 1); // 2/5 的那段送出去了，還沒回來
  app.getState().selectDay(DAY2);
  await tick();
  gates[0](); // 2/5 的回來：舊的一輪不再往下，但路徑已進快取，地圖要重畫
  await ticks();
  assert.equal(app.getState().routesVersion, 1);
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes('136.9,34.6'), urls.join('\n')); // 新的那天接著查
  gates[1]();
  await ticks();
  assert.ok(app.getState().routesVersion >= 2, String(app.getState().routesVersion)); // 新一輪也會等到還在飛的 2/5 那段，多加一次無妨
  assert.equal(urls.length, 2); // 2/5 已在快取，不重查
  stop();
});

test('行程線：等待中的那段被別人查到（快取裡出現）：下一次檢查時地圖照樣重畫', async () => {
  const storage = memoryStorage();
  const router = createRoadRouter({ fetch: () => new Promise(() => undefined), storage, minIntervalMs: 0 }); // 第一段一直不回來
  const { app, data, plan } = setupItinerary(router);
  const stop = startItineraryRoutes(app, data, plan, router);
  await tick();
  assert.equal(app.getState().routesVersion, 0);
  storage.setItem('travel-helper:route:' + roadKey('foot', C.coords, D.coords), JSON.stringify({ geometry: [C.coords, D.coords], meters: 100, seconds: 60 }));
  plan.setState({ plan: fakePlan('walk', TWO_DAYS()) }); // 時間軸重算
  await ticks(2);
  assert.equal(app.getState().routesVersion, 1);
  assert.equal(createPathOf(router, data)(C, D, 'walk')?.length, 2);
  stop();
});

test('行程線：查不到時 routesVersion 不變、不丟錯，行程線維持直線', async () => {
  const router = createRoadRouter({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }), minIntervalMs: 0 });
  const { app, data, plan } = setupItinerary(router, 'taxi');
  const stop = startItineraryRoutes(app, data, plan, router);
  app.getState().selectDay(DAY);
  await tick();
  await tick();
  assert.equal(app.getState().routesVersion, 0);
  const f = itineraryFeatures(data.getState().itinerary, plan.getState().plan, data.getState().byId, tripDates(), DAY, createPathOf(router, data));
  assert.deepEqual(f.lines.features[0].geometry.coordinates, [A.coords, B.coords]);
  stop();
});

test('OSRM 的 duration 存成 seconds，cachedMinutes 換成分鐘', async () => {
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 4200, duration: 576, geometry: { coordinates: [[136.8, 34.5], [136.81, 34.5]] } }] }) });
  const router = createRoadRouter({ fetch, minIntervalMs: 0 });
  const a: [number, number] = [136.8, 34.5];
  const b: [number, number] = [136.81, 34.5];
  assert.equal(router.cachedMinutes('car', a, b), null);
  const r = await router.route('car', a, b);
  assert.equal(r?.seconds, 576);
  assert.ok(Math.abs(router.cachedMinutes('car', a, b)! - 9.6) < 1e-9);
});

test('舊快取沒有 seconds 當作沒查過', async () => {
  const a: [number, number] = [136.8, 34.5];
  const b: [number, number] = [136.81, 34.5];
  const storage = memoryStorage();
  storage.setItem('travel-helper:route:' + roadKey('car', a, b), JSON.stringify({ geometry: [a, b], meters: 4200 }));
  let calls = 0;
  const fetch = async () => {
    calls++;
    return { ok: true, status: 200, json: async () => osrmBody([a, b], 4200) };
  };
  const router = createRoadRouter({ fetch, storage, minIntervalMs: 0 });
  assert.equal(router.cachedMinutes('car', a, b), null);
  assert.equal(router.cachedMeters('car', a, b), null);
  await router.route('car', a, b);
  assert.equal(calls, 1);
});
