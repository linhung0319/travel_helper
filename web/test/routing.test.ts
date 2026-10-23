// T12：路線（OSRM、沿車站、直線）、分鐘、地圖上的圖層資料、背景補路徑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { createRoadRouter, lineMeters, lineMidpoint, minutesFromMeters, railPath, roadKey, routeLabel, routeProfile, type KeyValueStorage } from '../src/lib/routing.ts';
import { describeChanges, proposalFeatures, routeFeatures, routeLabels } from '../src/lib/overlays.ts';
import { createAppStore } from '../src/store.ts';
import { createCommands } from '../src/commands.ts';
import { startRouteResolver } from '../src/routeResolver.ts';
import { normalizePlace } from '../src/data/normalize.ts';
import { placeDays } from '../src/lib/itinerary.ts';
import type { DataState } from '../src/dataStore.ts';
import type { Place } from '../src/data/types.ts';
import { itin } from './helpers.ts';

const PARTY = { size: 15, elders: 5, kids: 4 };

test('交通方式 → 路徑的查法', () => {
  assert.equal(routeProfile('walk'), 'foot');
  assert.equal(routeProfile('taxi'), 'car');
  assert.equal(routeProfile('bus'), 'car');
  assert.equal(routeProfile('train'), 'rail');
  assert.equal(routeProfile('ferry'), 'straight');
});

test('分鐘：步行用路徑距離 ÷ 80 m/分 × 全員係數（不再乘繞路係數）；計程車用 engine 的速度；電車不算', () => {
  assert.equal(minutesFromMeters('walk', 800, PARTY), 14); // 800 / 80 × 1.4
  const taxi = minutesFromMeters('taxi', 6000, PARTY)!;
  assert.ok(taxi >= 12 && taxi < 20, String(taxi)); // 6 km、30 km/h 是 12 分，加上叫車的時間
  assert.equal(minutesFromMeters('train', 6000, PARTY), null);
  assert.equal(routeLabel('walk', 13.2), '🚶 14 分');
  assert.equal(routeLabel('train', null), '🚃');
  assert.equal(routeLabel('train', 12, '特急 10:05 發'), '🚃 特急 10:05 發');
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
    ['🚶 …', '⛴️ 30 分', '🚃 12 分'],
  );
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
