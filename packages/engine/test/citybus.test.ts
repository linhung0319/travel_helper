// 班距型的市巴士（mode bus，T88；資料格式見 data/raw/access/kyoto.md §9、§14）：真的市巴士資料還沒進來（T87 等 ODPT），
// 用假路線測引擎：停留所不在 stations.json、同 ID 停留所換車、station 走到車站、等車和班距照 §5.4 巴士的規則
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLeg, resolveConfig, type EngineData, type Endpoint, type LegContext, type UrbanRoute, type UrbanService } from '../src/index.ts';
import { buildNetwork, type HeadwayRoute } from '../src/raptor/network.ts';
import { searchJourneys } from '../src/raptor/search.ts';
import { realData } from './fixtures.ts';

const cfg = resolveConfig();
const base = realData();
const WHOLE = { size: 15, elders: 5, kids: 4 };

// 京都駅前（旁邊是 JR 京都）→ 五条坂（清水寺西邊約 600 m）→ 祇園；另一個系統 五条坂 → 東山三条
const EKIMAE = { id: 'citybus-test-ekimae', name: { ja: '京都駅前', zh: '京都站前' }, coords: [135.759, 34.9862] as [number, number], station: 'jr-kyoto' };
const GOJOZAKA = { id: 'citybus-test-gojozaka', name: { ja: '五条坂', zh: '五條坂' }, coords: [135.7781, 34.9947] as [number, number], station: null };
const GION = { id: 'citybus-test-gion', name: { ja: '祇園', zh: '祇園' }, coords: [135.7768, 35.0037] as [number, number], station: null };
const HIGASHIYAMA = { id: 'citybus-test-higashiyama-sanjo', name: { ja: '東山三条', zh: '東山三條' }, coords: [135.7799, 35.0095] as [number, number], station: null };

const svc = (min: number): UrbanService => ({ first: '06:00', last: '22:00', headway: [{ from: '06:00', to: '22:00', min }] });
const bus = (id: string, stops: (typeof EKIMAE & { min: number })[], min: number): UrbanRoute => ({
  id,
  mode: 'bus',
  operator: '京都市交通局',
  name: { ja: `市バス ${id}`, zh: `市巴士 ${id}` },
  stops,
  loop: false,
  loopMin: null,
  service: { weekday: svc(min), saturday: null, holiday: svc(min) },
  fares: { adult: null },
});

/** 真的資料加上假的市巴士（headway：206 系統的班距） */
function withBus(headway = 8): EngineData {
  const urban = [
    ...(base.urban ?? []),
    bus('citybus-test-206', [{ ...EKIMAE, min: 0 }, { ...GOJOZAKA, min: 8 }, { ...GION, min: 13 }], headway),
    bus('citybus-test-80', [{ ...GOJOZAKA, min: 0 }, { ...HIGASHIYAMA, min: 8 }], 10),
  ];
  return { ...base, urban };
}

const P = (data: EngineData, id: string): Endpoint => {
  const r = data.getPlace(id)?.record ?? null;
  return { id, coords: r?.coords ?? null, record: r };
};
const ctx = (data: EngineData, over: Partial<LegContext> = {}): LegContext => ({ date: '2027-02-09', depart: 600, party: WHOLE, data, cfg, ...over });

test('網路：市巴士的停留所用路線檔的名稱、座標，不是車站；路線是 bus', () => {
  const net = buildNetwork(withBus(), cfg, '2027-02-09');
  const s = net.stops.get(EKIMAE.id);
  assert.ok(s);
  assert.equal(s.name, '京都駅前');
  assert.deepEqual(s.coords, EKIMAE.coords);
  assert.equal(s.stationId, null);
  const r = net.routes.find((x): x is HeadwayRoute => x.kind === 'headway' && x.key === 'citybus-test-206:+');
  assert.ok(r);
  assert.equal(r.mode, 'bus');
  assert.deepEqual(r.stops, [EKIMAE.id, GOJOZAKA.id, GION.id]);
  // 電車的班距型照舊是 train
  assert.equal(net.routes.find((x) => x.kind === 'headway' && x.group === 'jr-nara')?.mode, 'train');
  // 市巴士不算近鐵的短程站
  assert.ok(!net.kintetsuShort.has(EKIMAE.id));
});

test('網路：停留所的 station 走到車站（兩個方向）', () => {
  const net = buildNetwork(withBus(), cfg, '2027-02-09');
  const to = net.footpaths.get(EKIMAE.id)?.find((f) => f.to === 'jr-kyoto');
  const back = net.footpaths.get('jr-kyoto')?.find((f) => f.to === EKIMAE.id);
  assert.ok(to && back);
  assert.ok(to.walk > 0 && to.walk < 5, `${to.walk}`);
});

test('網路：同一個停留所 ID 換另一個系統不用走（轉乘步行 0，上車照樣隔 minTransfer）；巴士換電車照 urbanTransferDefault', () => {
  const net = buildNetwork(withBus(), cfg, '2027-02-09');
  assert.deepEqual(net.sameStopChange(GOJOZAKA.id, 'citybus-test-206', 'citybus-test-80'), { walk: cfg.transit.minTransfer, transfer: null, none: true });
  assert.equal(net.sameStopChange(GOJOZAKA.id, 'citybus-test-206', 'jr-nara').none, false);
});

test('搜尋：京都駅前 → 東山三条，在五条坂換另一個系統', () => {
  const data = withBus();
  const net = buildNetwork(data, cfg, '2027-02-09');
  // 只搭巴士（地鐵東西線比較快）
  const exclude = [...new Set(net.routes.filter((r) => r.mode !== 'bus').map((r) => r.group))];
  const js = searchJourneys(net, { origins: [{ stop: EKIMAE.id, walk: 0 }], targets: [{ stop: HIGASHIYAMA.id, walk: 0 }], depart: 600, factor: 1.4, exclude }, cfg);
  const two = js.find((j) => j.rides.length === 2 && j.rides.every((r) => r.route.kind === 'headway' && r.route.mode === 'bus'));
  assert.ok(two, js.map((j) => j.rides.map((r) => r.route.group).join('>')).join(' | '));
  assert.equal(two.rides[0].to, GOJOZAKA.id);
  assert.equal(two.rides[1].from, GOJOZAKA.id);
  assert.equal(two.transfers[0].walk, 0);
  // 換車至少隔 minTransfer：第二程的等車從到站＋minTransfer 起算（班距 10 → 等 10）
  assert.equal(two.rides[1].dep, two.rides[0].arr + cfg.transit.minTransfer + 10);
});

test('planLeg：京都站 → 清水寺搭市巴士（班距 8 分）：交通方式是巴士，停留所寫名稱', () => {
  const data = withBus(8);
  const { leg, warnings } = planLeg(P(data, 'jr-kyoto'), P(data, 'kyoto-kiyomizudera'), ctx(data, { depart: 600 }));
  assert.equal(leg.mode, 'bus', `${leg.mode} ${leg.basis}`);
  const r = leg.rides[0];
  assert.equal(r.kind, 'headway');
  assert.equal(r.mode, 'bus');
  assert.equal(r.routeId, 'citybus-test-206');
  assert.equal(r.from, '京都駅前');
  assert.equal(r.to, '五条坂');
  assert.equal(r.headwayMin, 8);
  assert.ok((leg.walkBefore ?? 0) > 0, '京都站走到京都駅前');
  assert.ok((leg.walkAfter ?? 0) > 0 && (leg.walkAfter ?? 0) <= cfg.walk.legMaxWhole, `五条坂走到清水寺 ${leg.walkAfter}`);
  assert.ok(leg.minutes < 45, `${leg.minutes} 分`);
  assert.ok(!warnings.some((w) => w.code === 'travel-unknown'));
});

test('planLeg：市巴士照 §5.4 巴士的規則：等超過 busMaxWait（班距 25）就改搭計程車，理由是巴士要等', () => {
  // 班距 25：搭巴士還是比走路早到，但要等 25 分 > busMaxWait 20
  const data = withBus(25);
  const { leg, warnings } = planLeg(P(data, 'jr-kyoto'), P(data, 'kyoto-kiyomizudera'), ctx(data, { depart: 600 }));
  assert.equal(leg.mode, 'taxi');
  assert.ok(warnings.some((w) => w.code === 'bus-infrequent' && w.message.startsWith('巴士要等')), warnings.map((w) => w.code).join(','));
});

test('planLeg：指定搭巴士（mode bus）只搭巴士；指定電車不搭市巴士', () => {
  const data = withBus(8);
  const a = P(data, 'jr-kyoto');
  const b = P(data, 'kyoto-kiyomizudera');
  const byBus = planLeg(a, b, ctx(data), { mode: 'bus' }).leg;
  assert.ok(byBus.rides.length > 0 && byBus.rides.every((r) => r.mode === 'bus'), byBus.basis);
  const byTrain = planLeg(a, b, ctx(data), { mode: 'train' }).leg;
  assert.ok(byTrain.rides.every((r) => r.mode !== 'bus'), byTrain.basis);
});
