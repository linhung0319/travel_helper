// web/src/lib/geo/ 與 scripts/geo.mjs 的測試。不呼叫外部 API（OSRM 一律用 mock fetch）。
// 執行：npm run test:geo

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  haversineMeters,
  looksSwapped,
  estimateWalk,
  estimateWalkFromStraight,
  minutesForMeters,
  displayMinutes,
  nearestStations,
  createRouteClient,
  memoryRouteCache,
  routeCacheKey,
  type LonLat,
  type StationLike,
} from '../../web/src/lib/geo/index.ts';
import { fileRouteCache } from '../lib/route-cache.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stations: (StationLike & { name: { zh: string } })[] = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'),
);
const byId = (id: string) => stations.find((s) => s.id === id)!;

const near = (actual: number, expected: number, tol: number) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} 應該約等於 ${expected}（誤差 ${tol}）`);

describe('haversineMeters', () => {
  test('同一點距離為 0', () => {
    assert.equal(haversineMeters([136.84, 34.48], [136.84, 34.48]), 0);
  });

  test('緯度差 1 度 ≈ 111.195 km', () => {
    near(haversineMeters([0, 0], [0, 1]), 111195, 1);
  });

  test('北緯 60 度上經度差 1 度 ≈ 55.6 km（是赤道的一半）', () => {
    near(haversineMeters([135, 60], [136, 60]), 55597, 1);
  });

  test('東京站 → 大阪站 ≈ 403 km', () => {
    near(haversineMeters([139.7671, 35.6812], [135.4959, 34.7025]), 403000, 1000);
  });

  test('對稱', () => {
    const a: LonLat = [136.843063, 34.486781];
    const b: LonLat = [136.819173, 34.308581];
    assert.equal(haversineMeters(a, b), haversineMeters(b, a));
  });
});

describe('經緯度順序 [經度, 緯度]', () => {
  test('第一個值是經度：在北緯 34.5 度移動 1 度經度比移動 1 度緯度短', () => {
    const lonStep = haversineMeters([136, 34.5], [137, 34.5]);
    const latStep = haversineMeters([136, 34.5], [136, 35.5]);
    near(lonStep, 111195 * Math.cos((34.5 * Math.PI) / 180), 300);
    near(latStep, 111195, 1);
    assert.ok(lonStep < latStep);
  });

  test('鳥羽站 → 賢島站約 20 km；寫反的話會差很多', () => {
    const toba = byId('toba').coords!;
    const kashiko = byId('kashikojima').coords!;
    const d = haversineMeters(toba, kashiko);
    near(d, 20000, 2000);
    const swapped = haversineMeters([toba[1], toba[0]], [kashiko[1], kashiko[0]]);
    assert.notEqual(Math.round(swapped), Math.round(d));
  });

  test('looksSwapped 能認出 [緯度, 經度]', () => {
    assert.equal(looksSwapped([34.4818, 136.8456]), true);
    assert.equal(looksSwapped([136.8456, 34.4818]), false);
  });

  test('stations.json 的座標都是 [經度, 緯度]', () => {
    for (const s of stations) {
      if (!s.coords) continue;
      assert.equal(looksSwapped(s.coords), false, s.id);
      // 關西機場周邊（kix，T13 加）、大阪（osaka，T28 加）在大阪府，經度 135
      const [minLon, maxLon] = s.area === 'kix' || s.area === 'osaka' ? [135, 136] : [136, 137];
      assert.ok(s.coords[0] > minLon && s.coords[0] < maxLon && s.coords[1] > 34 && s.coords[1] < 35, s.id);
    }
  });
});

describe('步行時間估算', () => {
  test('預設：直線 800 m × 1.3 ÷ 80 m/分 = 13 分', () => {
    const e = estimateWalkFromStraight(800);
    assert.equal(e.meters, 1040);
    near(e.minutes, 13, 1e-9);
  });

  test('係數、步速、團體步行係數都可以調整', () => {
    near(estimateWalkFromStraight(800, { detourFactor: 1 }).minutes, 10, 1e-9);
    near(estimateWalkFromStraight(800, { metersPerMinute: 65 }).minutes, 16, 1e-9);
    near(estimateWalkFromStraight(800, { groupFactor: 1.5 }).minutes, 19.5, 1e-9);
  });

  test('estimateWalk 用座標算', () => {
    const e = estimateWalk([0, 0], [0, 0.001]);
    near(e.straightMeters, 111.195, 0.01);
    near(e.minutes, (111.195 * 1.3) / 80, 1e-3);
  });

  test('minutesForMeters 不乘繞路係數', () => {
    near(minutesForMeters(800, { detourFactor: 2, groupFactor: 1.3 }), 13, 1e-9);
  });

  test('不合法的參數會丟錯', () => {
    assert.throws(() => estimateWalkFromStraight(100, { metersPerMinute: 0 }), RangeError);
    assert.throws(() => estimateWalkFromStraight(100, { groupFactor: -1 }), RangeError);
  });

  test('displayMinutes 無條件進位、最少 1 分', () => {
    assert.equal(displayMinutes(0), 1);
    assert.equal(displayMinutes(3.01), 4);
    assert.equal(displayMinutes(13), 13);
    assert.equal(displayMinutes(13.000000000001), 13);
  });
});

describe('nearestStations（stations.json 真資料）', () => {
  test('賢島站附近 → kashikojima', () => {
    const res = nearestStations([136.8205, 34.3065], stations);
    assert.equal(res[0].station.id, 'kashikojima');
    assert.equal(res.length, 3);
    assert.ok(res[0].distanceMeters < 500);
    assert.ok(res[0].distanceMeters <= res[1].distanceMeters && res[1].distanceMeters <= res[2].distanceMeters);
    near(res[0].walk.minutes, (res[0].distanceMeters * 1.3) / 80, 1e-9);
  });

  test('鳥羽水族館附近 → 中之郷；篩選業者', () => {
    const p: LonLat = [136.8456, 34.4818];
    const all = nearestStations(p, stations, { limit: 5 });
    assert.equal(all[0].station.id, 'nakanogo');
    const jr = nearestStations(p, stations, { operator: 'jr' });
    assert.equal(jr[0].station.id, 'jr-toba');
    assert.ok(jr.length > 0 && jr.every((r) => r.station.operator === 'jr'));
    const kin = nearestStations(p, stations, { operator: 'kintetsu', limit: 10 });
    assert.deepEqual(kin.slice(0, 2).map((r) => r.station.id), ['nakanogo', 'toba']);
    assert.ok(kin.every((r) => r.station.operator === 'kintetsu'));
    const both = nearestStations(p, stations, { operator: ['kintetsu', 'jr'], limit: 100 });
    assert.equal(both.length, stations.filter((s) => s.coords && ['kintetsu', 'jr'].includes(s.operator)).length);
  });

  test('limit、maxMeters、團體步行係數', () => {
    const p: LonLat = [136.8205, 34.3065];
    assert.equal(nearestStations(p, stations, { limit: 1 }).length, 1);
    assert.deepEqual(
      nearestStations(p, stations, { maxMeters: 500 }).map((r) => r.station.id),
      ['kashikojima'],
    );
    const slow = nearestStations(p, stations, { limit: 1, groupFactor: 1.5 })[0];
    const normal = nearestStations(p, stations, { limit: 1 })[0];
    near(slow.walk.minutes, normal.walk.minutes * 1.5, 1e-9);
  });

  test('沒有座標的車站會被略過', () => {
    const res = nearestStations([136.8, 34.3], [{ id: 'x', coords: null }, { id: 'y', coords: [136.8, 34.31] }]);
    assert.deepEqual(res.map((r) => r.station.id), ['y']);
  });
});

// ---- 實際步行路線（OSRM mock）----

const FROM: LonLat = [136.8456, 34.4818];
const TO: LonLat = [136.843063, 34.486781];

function osrmBody(distance = 741.4, duration = 592.7, snap: [number, number] = [0, 0]) {
  return {
    code: 'Ok',
    routes: [{ distance, duration, geometry: { type: 'LineString', coordinates: [FROM, [136.8448, 34.4834], TO] } }],
    waypoints: snap.map((d) => ({ distance: d })),
  };
}

function mockFetch(responder: (url: string) => { ok: boolean; status: number; body?: unknown } | Error) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const r = responder(url);
    if (r instanceof Error) throw r;
    return { ok: r.ok, status: r.status, json: async () => r.body };
  };
  return { fetch, calls };
}

// 假時鐘：sleep 只推進時間，不真的等
function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

const today = () => '2026-10-17';

describe('routeCacheKey', () => {
  test('穩定：四捨五入到小數 5 位，約 1 公尺內視為同一點', () => {
    const k = routeCacheKey(FROM, TO);
    assert.equal(k, 'foot_136.84560_34.48180__136.84306_34.48678');
    assert.equal(routeCacheKey([136.845601, 34.481799], [136.8430628, 34.4867812]), k);
    assert.notEqual(routeCacheKey(TO, FROM), k);
    assert.match(k, /^[A-Za-z0-9_.-]+$/);
  });
});

describe('walkRoute（mock OSRM）', () => {
  test('成功：回傳 osrm 結果並寫入快取（含來源和取得日期）', async () => {
    const { fetch, calls } = mockFetch(() => ({ ok: true, status: 200, body: osrmBody() }));
    const cache = memoryRouteCache();
    const client = createRouteClient({ fetch, cache, today, ...fakeClock() });
    const r = await client.walkRoute(FROM, TO);
    assert.equal(r.source, 'osrm');
    assert.equal(r.cached, false);
    assert.equal(r.meters, 741.4);
    near(r.minutes, 741.4 / 80, 1e-9);
    assert.equal(r.osrmDurationSeconds, 592.7);
    assert.equal(r.geometry?.coordinates.length, 3);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/driving\/136\.8456,34\.4818;136\.84306,34\.48678\?/);

    const entry = cache.store.get(routeCacheKey(FROM, TO))!;
    assert.equal(entry.source, 'osrm');
    assert.equal(entry.retrieved, '2026-10-17');
    assert.equal(entry.sources[0].url, calls[0]);
    assert.equal(entry.sources[0].retrieved, '2026-10-17');
  });

  test('快取命中：不再呼叫 API，團體步行係數照樣套用', async () => {
    const { fetch, calls } = mockFetch(() => ({ ok: true, status: 200, body: osrmBody() }));
    const cache = memoryRouteCache();
    const client = createRouteClient({ fetch, cache, today, ...fakeClock() });
    await client.walkRoute(FROM, TO);
    const hit = await client.walkRoute(FROM, TO, { groupFactor: 1.5 });
    // 座標差一點點（四捨五入後相同）也命中
    const hit2 = await client.walkRoute([136.845601, 34.481799], TO);
    assert.equal(calls.length, 1);
    assert.equal(client.apiCalls, 1);
    assert.equal(hit.cached, true);
    assert.equal(hit.source, 'osrm');
    near(hit.minutes, (741.4 / 80) * 1.5, 1e-9);
    assert.equal(hit2.cached, true);
  });

  test('起訖點到道路的吸附距離（OSRM waypoints）計入步行距離', async () => {
    const { fetch } = mockFetch(() => ({ ok: true, status: 200, body: osrmBody(142.4, 113.7, [25.5, 243.9]) }));
    const cache = memoryRouteCache();
    const r = await createRouteClient({ fetch, cache, today, ...fakeClock() }).walkRoute(FROM, TO);
    assert.deepEqual(r.snapMeters, [25.5, 243.9]);
    near(r.meters, 142.4 + 25.5 + 243.9, 1e-9);
    near(r.minutes, r.meters / 80, 1e-9);
    assert.deepEqual(cache.store.get(routeCacheKey(FROM, TO))!.snapMeters, [25.5, 243.9]);
  });

  test('另一個 client 讀同一份快取也不呼叫 API', async () => {
    const first = mockFetch(() => ({ ok: true, status: 200, body: osrmBody() }));
    const cache = memoryRouteCache();
    await createRouteClient({ fetch: first.fetch, cache, today, ...fakeClock() }).walkRoute(FROM, TO);
    const second = mockFetch(() => new Error('不應該被呼叫'));
    const r = await createRouteClient({ fetch: second.fetch, cache, today, ...fakeClock() }).walkRoute(FROM, TO);
    assert.equal(second.calls.length, 0);
    assert.equal(r.source, 'osrm');
  });

  test('refresh：忽略快取重新查詢並覆寫', async () => {
    let distance = 741.4;
    const { fetch, calls } = mockFetch(() => ({ ok: true, status: 200, body: osrmBody(distance) }));
    const cache = memoryRouteCache();
    const client = createRouteClient({ fetch, cache, today, ...fakeClock() });
    await client.walkRoute(FROM, TO);
    distance = 800;
    const r = await client.walkRoute(FROM, TO, { refresh: true });
    assert.equal(calls.length, 2);
    assert.equal(r.meters, 800);
    assert.equal(cache.store.get(routeCacheKey(FROM, TO))!.distanceMeters, 800);
  });

  test('呼叫之間有間隔', async () => {
    const { fetch } = mockFetch(() => ({ ok: true, status: 200, body: osrmBody() }));
    const clock = fakeClock();
    const client = createRouteClient({ fetch, cache: memoryRouteCache(), today, minIntervalMs: 1100, ...clock });
    await Promise.all([
      client.walkRoute(FROM, TO),
      client.walkRoute(TO, FROM),
      client.walkRoute(FROM, [136.82, 34.31]),
    ]);
    assert.equal(client.apiCalls, 3);
    assert.deepEqual(clock.sleeps, [1100, 1100]);
  });

  for (const [name, responder] of [
    ['網路錯誤', () => new Error('ECONNRESET')],
    ['HTTP 錯誤', () => ({ ok: false, status: 503 })],
    ['OSRM 找不到路線', () => ({ ok: true, status: 200, body: { code: 'NoRoute', message: 'Impossible route' } })],
    ['格式不對', () => ({ ok: true, status: 200, body: { code: 'Ok', routes: [] } })],
  ] as const) {
    test(`API 失敗（${name}）→ 改用直線估算，標記 estimate，不寫快取`, async () => {
      const { fetch } = mockFetch(responder);
      const cache = memoryRouteCache();
      const client = createRouteClient({ fetch, cache, today, ...fakeClock() });
      const r = await client.walkRoute(FROM, TO, { groupFactor: 1.3 });
      assert.equal(r.source, 'estimate');
      assert.equal(r.geometry, null);
      assert.equal(r.osrmDurationSeconds, null);
      assert.equal(r.retrieved, '2026-10-17');
      assert.match(r.error ?? '', /OSRM 查詢失敗/);
      const e = estimateWalk(FROM, TO, { groupFactor: 1.3 });
      near(r.minutes, e.minutes, 1e-9);
      assert.equal(cache.store.size, 0);
    });
  }

  test('offline：沒有快取時直接估算，不呼叫 API', async () => {
    const { fetch, calls } = mockFetch(() => ({ ok: true, status: 200, body: osrmBody() }));
    const r = await createRouteClient({ fetch, cache: memoryRouteCache(), today }).walkRoute(FROM, TO, { offline: true });
    assert.equal(r.source, 'estimate');
    assert.equal(calls.length, 0);
  });
});

describe('fileRouteCache（data/cache/routes 的檔案快取）', () => {
  test('寫入後讀回、快取命中不呼叫 API', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-cache-'));
    try {
      const cache = fileRouteCache(dir);
      const first = mockFetch(() => ({ ok: true, status: 200, body: osrmBody() }));
      await createRouteClient({ fetch: first.fetch, cache, today, ...fakeClock() }).walkRoute(FROM, TO);
      const file = path.join(dir, `${routeCacheKey(FROM, TO)}.json`);
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(saved.source, 'osrm');
      assert.equal(saved.retrieved, '2026-10-17');
      assert.equal(saved.sources[0].type, 'osm');
      assert.deepEqual(saved.geometry.coordinates[0], FROM);

      const second = mockFetch(() => new Error('不應該被呼叫'));
      const r = await createRouteClient({ fetch: second.fetch, cache: fileRouteCache(dir), today }).walkRoute(FROM, TO);
      assert.equal(second.calls.length, 0);
      assert.equal(r.cached, true);
      assert.equal(r.meters, 741.4);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('沒有快取時回傳 null；不合法的 key 會丟錯', () => {
    const cache = fileRouteCache(path.join(os.tmpdir(), 'geo-cache-does-not-exist'));
    assert.equal(cache.get('foot_1_2__3_4'), null);
    assert.throws(() => cache.get('../x'));
  });
});

describe('scripts/geo.mjs（不連網的指令）', () => {
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/geo.mjs'), ...args], { encoding: 'utf8' });

  test('nearest 座標 → JSON', () => {
    const out = JSON.parse(run('nearest', '136.8205,34.3065', '--json'));
    assert.equal(out.results[0].id, 'kashikojima');
  });

  test('nearest 可以用資料點 ID，並排除自己', () => {
    const out = JSON.parse(run('nearest', 'jr-toba', '--operator', 'kintetsu', '--n', '1', '--json'));
    assert.deepEqual(out.results.map((r: { id: string }) => r.id), ['toba']);
  });

  test('distance 兩個 ID', () => {
    const out = JSON.parse(run('distance', 'toba', 'kashikojima', '--json'));
    near(out.straightMeters, haversineMeters(byId('toba').coords!, byId('kashikojima').coords!), 1e-6);
  });

  test('經緯度寫反會報錯', () => {
    assert.throws(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts/geo.mjs'), 'nearest', '34.4818,136.8456'], { stdio: 'pipe' }), /經度,緯度/);
  });
});
