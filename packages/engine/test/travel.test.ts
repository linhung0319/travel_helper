// 兩點之間的交通方式（CONVENTIONS §5.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, planLeg, resolveConfig, taxiEstimate, toMinutes, walkFactor, type Endpoint, type EngineData, type LegContext, type PlaceRecord, type RouteTimetable, type TripRef } from '../src/index.ts';
import { at, fake, restaurant, spot } from './synthetic.ts';
import { realData } from './fixtures.ts';

const cfg = resolveConfig();
const WHOLE = { size: 15, elders: 5, kids: 4 };
const ep = (p: PlaceRecord): Endpoint => ({ id: p.id, coords: p.coords, record: p });
const ctx = (data: EngineData, over: Partial<LegContext> = {}): LegContext => ({ date: '2027-02-05', depart: 600, party: WHOLE, whole: true, data, cfg, ...over });

test('團體步行係數：全員 1.4、分組有長輩小孩 1.2、只有大人 1.0', () => {
  assert.equal(walkFactor(WHOLE, true, cfg), 1.4);
  assert.equal(walkFactor({ size: 5, elders: 1, kids: 0 }, false, cfg), 1.2);
  assert.equal(walkFactor({ size: 5, elders: 0, kids: 0 }, false, cfg), 1.0);
});

test('步行在單段上限內 → 走路（直線 × 1.3 ÷ 80 × 1.4）', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(500));
  const { leg } = planLeg(ep(a), ep(b), ctx(fake([a, b])));
  assert.equal(leg.mode, 'walk');
  assert.equal(leg.minutes, Math.ceil((500 * 1.3) / 80 * 1.4)); // 12
  assert.equal(leg.walkMinutes, leg.minutes);
  assert.equal(leg.depart, '10:00');
  assert.equal(leg.arrive, '10:12');
});

test('anchors 的步行分鐘（係數 1）優先，再乘團體係數', () => {
  const a = spot('a', at(0));
  const r = restaurant('r', at(500), { anchors: [{ id: 'a', walkMinutes: 5, walkSource: 'osrm' }] });
  const { leg } = planLeg(ep(a), ep(r), ctx(fake([a, r])));
  assert.equal(leg.minutes, 7);
  assert.match(leg.basis, /anchors/);
});

test('walkMeters（OSRM 快取）優先於直線估算', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(500));
  const { leg } = planLeg(ep(a), ep(b), ctx(fake([a, b], { walkMeters: () => 400 })));
  assert.equal(leg.minutes, 7); // 400 / 80 × 1.4
  assert.match(leg.basis, /osrm/);
});

test('同一個點 → 不用移動', () => {
  const a = spot('a', at(0));
  assert.equal(planLeg(ep(a), ep(a), ctx(fake([a]))).leg.mode, 'none');
});

test('全員超過 15 分、分組 25 分內 → 分組照樣走路', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(1000)); // 全員 23 分、只有大人的分組 17 分
  const data = fake([a, b]);
  assert.equal(planLeg(ep(a), ep(b), ctx(data)).leg.mode, 'taxi');
  assert.equal(planLeg(ep(a), ep(b), ctx(data, { party: { size: 5, elders: 0, kids: 0 }, whole: false })).leg.mode, 'walk');
});

test('超過上限、沒有車 → 計程車：台數和起跳價；加算費率有設定才估費用', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(3000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b])));
  assert.equal(r.leg.mode, 'taxi');
  assert.equal(r.leg.taxi?.cars, 4);
  assert.equal(r.leg.taxi?.jumboCars, 2);
  assert.equal(r.leg.taxi?.fareEstimateYen, null);
  assert.match(r.leg.taxi?.note ?? '', /加算費率未查/);
  assert.ok(r.warnings.some((w) => w.code === 'taxi'));
  const priced = planLeg(ep(a), ep(b), ctx(fake([a, b]), { cfg: resolveConfig({ taxi: { stepMeters: 300, stepYen: 100 } }) }));
  assert.equal(priced.leg.taxi?.fareEstimateYen, 700 + Math.ceil((3000 * 1.3 - 1200) / 300) * 100);
});

test('driveMeters（OSRM 開車路徑）優先於直線 × roadDetour', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(3000));
  const straight = planLeg(ep(a), ep(b), ctx(fake([a, b])));
  const road = planLeg(ep(a), ep(b), ctx(fake([a, b], { driveMeters: () => 6000 })));
  assert.equal(road.leg.mode, 'taxi');
  assert.ok(road.leg.minutes > straight.leg.minutes);
  assert.match(road.leg.basis, /osrm/);
  assert.match(straight.leg.basis, /直線/);
  // 30 km/h：6 km 是 12 分，加上叫車的時間
  const overhead = straight.leg.minutes - Math.ceil((3000 * 1.3) / 1000 / 30 * 60);
  assert.ok(Math.abs(road.leg.minutes - (12 + overhead)) <= 1);
});

// 假的巴士路線：停留所 s1 在 a 旁、s2 在 b 旁
function busRoute(deps: string[], ride = 10): RouteTimetable {
  const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const trips = deps.map((d, i) => ({ id: `t${i}`, headsign: 'b', stops: [['s1', null, d], ['s2', pad(toM(d) + ride), null]] as [string, string | null, string | null][] }));
  return {
    id: 'test-bus',
    mode: 'bus',
    name: { ja: 'テスト線', zh: '測試線' },
    validFrom: '2026-01-01',
    stops: [
      { id: 's1', name: 'A前', near: [{ id: 'a', meters: 50 }] },
      { id: 's2', name: 'B前', near: [{ id: 'b', meters: 50 }] },
    ],
    trips: { weekday: trips },
  };
}

test('巴士：等 20 分內、班距不到 1 小時 → 搭巴士；15 人警告擠不上', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35', '11:05'])] });
  const r = planLeg(ep(a), ep(b), ctx(data));
  assert.equal(r.leg.mode, 'bus');
  assert.equal(r.leg.rides[0].depart, '10:05');
  assert.equal(r.leg.arrive, '10:17'); // 10:15 到站 + 走 50 m（1.14 分進位成 2）
  assert.ok(r.warnings.some((w) => w.code === 'bus-crowd'));
  const small = planLeg(ep(a), ep(b), ctx(data, { party: { size: 5, elders: 0, kids: 0 }, whole: false }));
  assert.ok(!small.warnings.some((w) => w.code === 'bus-crowd'));
});

test('巴士：1 小時以上才一班 → 計程車', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b], { routes: [busRoute(['10:05', '11:30'])] })));
  assert.equal(r.leg.mode, 'taxi');
  assert.ok(r.warnings.some((w) => w.code === 'bus-infrequent'));
});

test('巴士：要等超過 20 分 → 計程車', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b], { routes: [busRoute(['10:40', '11:10'])] })));
  assert.equal(r.leg.mode, 'taxi');
  assert.ok(r.warnings.some((w) => /要等/.test(w.message)));
});

test('錯過末班車：這天有車，但這個時間以後沒有 → 警告並改計程車', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b], { routes: [busRoute(['08:00', '08:30'])] })));
  assert.equal(r.leg.mode, 'taxi');
  assert.ok(r.warnings.some((w) => w.code === 'missed-last'));
});

const real = realData();
const P = (id: string): Endpoint => {
  const r = real.getPlace(id)?.record ?? null;
  return { id, coords: r?.coords ?? null, record: r };
};

test('近鐵：鳥羽站 → 賢島站用時刻表（和 next-train 同一班）', () => {
  const r = planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 9 * 60 }));
  assert.equal(r.leg.mode, 'train');
  assert.deepEqual(r.leg.rides.map((x) => [x.depart, x.arrive, x.tripId]), [['09:13', '09:42', '1-375']]);
});

test('離島只能搭船：佐田浜 → 神島港；末班船之後是錯誤', () => {
  const r = planLeg(P('toba-sadahama-marine-terminal'), P('toba-port-kamishima'), ctx(real, { date: '2027-02-06', depart: 8 * 60 }));
  assert.equal(r.leg.mode, 'ferry');
  assert.equal(r.leg.rides[0].depart, '10:40');
  const late = planLeg(P('toba-sadahama-marine-terminal'), P('toba-port-kamishima'), ctx(real, { date: '2027-02-06', depart: 18 * 60 }));
  assert.equal(late.leg.mode, 'unknown');
  assert.ok(late.warnings.some((w) => w.code === 'missed-last' && w.level === 'error'));
});

test('太遠、時刻表裡沒有（關西機場 → 鳥羽）→ 交通方式未知，請用 travel 指定', () => {
  const r = planLeg(P('kansai-airport'), P('toba'), ctx(real, { depart: 14 * 60 }));
  assert.equal(r.leg.mode, 'unknown');
  assert.ok(r.warnings.some((w) => w.code === 'travel-unknown'));
});

test('使用者指定交通：有分鐘就照用；沒有就依方式估算；指定的班次找不到是錯誤', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(3000));
  const data = fake([a, b]);
  const charter = planLeg(ep(a), ep(b), ctx(data), { mode: 'charter', minutes: 25 });
  assert.equal(charter.leg.minutes, 25);
  assert.ok(charter.leg.specified);
  const walk = planLeg(ep(a), ep(b), ctx(data), { mode: 'walk' });
  assert.equal(walk.leg.mode, 'walk');
  assert.ok(walk.leg.minutes > 15);
  const bus = planLeg(ep(a), ep(b), ctx(data), { mode: 'bus' });
  assert.ok(bus.warnings.some((w) => w.code === 'travel-unknown'));
});

test('缺座標 → 算不出交通時間', () => {
  const a = spot('a', at(0));
  const r = planLeg(ep(a), { id: 'x', coords: null, record: null }, ctx(fake([a])));
  assert.equal(r.leg.mode, 'unknown');
  assert.ok(r.warnings.some((w) => w.level === 'error'));
});

test('只填分鐘（方式自動）：不帶自動那段的班次、步行分鐘看最後的方式、不報算不出交通', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35'])] });
  assert.equal(planLeg(ep(a), ep(b), ctx(data)).leg.rides.length, 1);
  const r = planLeg(ep(a), ep(b), ctx(data), { minutes: 30 });
  assert.equal(r.leg.mode, 'bus');
  assert.equal(r.leg.minutes, 30);
  assert.equal(r.leg.arrive, '10:30');
  assert.deepEqual(r.leg.rides, []);
  assert.equal(r.leg.walkMinutes, 0);
  assert.equal(r.leg.specified, true);
  // 自動是步行時，步行分鐘就是填的分鐘
  const c = spot('c', at(300));
  const w = planLeg(ep(a), ep(c), ctx(fake([a, c])), { minutes: 20 });
  assert.equal(w.leg.mode, 'walk');
  assert.equal(w.leg.walkMinutes, 20);
  // 缺座標算不出自動的交通，但時間是填的，就不再報錯
  const nowhere: Endpoint = { id: null, coords: null, record: null };
  const u = planLeg(ep(a), nowhere, ctx(fake([a])), { minutes: 15 });
  assert.ok(!u.warnings.some((x) => x.code === 'travel-unknown'));
  assert.equal(u.leg.minutes, 15);
});

// --- 第四輪：計程車用路線時間、大眾運輸、選定班次 --------------------------------

test('計程車有路線時間就用它，不加叫車時間', () => {
  const r = taxiEstimate(at(0), at(3000), WHOLE, DEFAULT_CONFIG, 4200, 9.6);
  assert.equal(r.minutes, 9.6);
  assert.equal(r.meters, 4200);
});

test('計程車沒有路線時間時照距離估算', () => {
  const r = taxiEstimate(at(0), at(3000), WHOLE, DEFAULT_CONFIG, 6000, null);
  assert.equal(r.minutes, 12); // 6 km ÷ 30 km/h，overheadMinutes 0
});

test('planLeg 的計程車：有 driveMinutes 用它，basis 寫 osrm 時間', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(3000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b], { driveMeters: () => 4200, driveMinutes: () => 9.6 })));
  assert.equal(r.leg.mode, 'taxi');
  assert.equal(r.leg.minutes, 10);
  assert.equal(r.leg.basis, '計程車（osrm 時間）');
  const est = planLeg(ep(a), ep(b), ctx(fake([a, b])));
  assert.equal(est.leg.basis, '計程車估算（直線，30 km/h）');
});

test('transit：一定搭大眾運輸，不套等車上限', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  // 出發 10:00、走到停留所 2 分，下一班 10:52：等 50 分（超過 busMaxWait 20）
  const data = fake([a, b], { routes: [busRoute(['10:52', '11:22'])] });
  assert.equal(planLeg(ep(a), ep(b), ctx(data)).leg.mode, 'taxi');
  const r = planLeg(ep(a), ep(b), ctx(data), { mode: 'transit' });
  assert.equal(r.leg.mode, 'bus');
  assert.equal(r.leg.waitMinutes, 50);
  assert.equal(r.leg.trip?.id, 't0');
  assert.equal(r.leg.trip?.depart, '10:52');
  assert.equal(r.leg.trip?.arrive, '11:02');
  assert.equal(r.leg.trip?.from, 'a');
  assert.equal(r.leg.trip?.to, 'b');
  assert.equal(r.leg.specified, true);
});

test('transit：時刻表裡沒有班次時是 unknown', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b])), { mode: 'transit' });
  assert.equal(r.leg.mode, 'unknown');
  assert.ok(r.warnings.some((w) => w.code === 'travel-unknown'));
});

const tripOf = (id: string, depart: string, arrive: string, from: string | null = 'a', to: string | null = 'b'): TripRef => ({ id, depart, arrive, from, to });

test('選定班次：用那班，等車寫在 waitMinutes', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35', '11:05'])] });
  const r = planLeg(ep(a), ep(b), ctx(data), { trip: tripOf('t1', '10:35', '10:45') });
  assert.equal(r.leg.mode, 'bus');
  assert.equal(r.leg.trip?.id, 't1');
  assert.equal(r.leg.waitMinutes, 10 * 60 + 35 - (600 + 2)); // 發車 − (出發 + 走到停留所)
  assert.equal(r.leg.arrive, '10:47');
  assert.ok(!r.warnings.some((w) => w.code === 'missed-trip'));
  // 寫了 mode transit 也一樣
  const t = planLeg(ep(a), ep(b), ctx(data), { mode: 'transit', trip: tripOf('t1', '10:35', '10:45') });
  assert.equal(t.leg.trip?.id, 't1');
});

test('趕不上選定的班次：照樣用、警告', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:02', '10:32', '11:02'])] });
  const r = planLeg(ep(a), ep(b), ctx(data, { depart: 10 * 60 + 40 }), { trip: tripOf('t1', '10:32', '10:42') });
  assert.equal(r.leg.trip?.id, 't1');
  assert.equal(r.leg.waitMinutes, 0);
  const w = r.warnings.find((x) => x.code === 'missed-trip');
  assert.ok(w);
  assert.equal(w.level, 'warning');
  assert.match(w.message, /趕不上 10:32 這班/);
});

test('起訖點變了的 trip 不用', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35', '11:05'])] });
  const plain = planLeg(ep(a), ep(b), ctx(data));
  const stale = planLeg(ep(a), ep(b), ctx(data), { trip: tripOf('t1', '10:35', '10:45', 'x', 'b') });
  assert.deepEqual({ ...stale.leg, specified: false, basis: '' }, { ...plain.leg, specified: false, basis: '' });
  assert.deepEqual(stale.warnings, plain.warnings);
  assert.ok(!stale.warnings.some((w) => w.code === 'missed-trip'));
  // 時刻表裡找不到那班（例如時刻表改了）也當作沒有 trip
  const gone = planLeg(ep(a), ep(b), ctx(data), { trip: tripOf('nope', '10:35', '10:45') });
  assert.equal(gone.leg.trip?.id, plain.leg.trip?.id);
});

test('前一班、後一班', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35', '11:05'])] });
  const first = planLeg(ep(a), ep(b), ctx(data));
  assert.equal(first.leg.trip?.id, 't0');
  assert.equal(first.leg.prevTrip ?? null, null);
  assert.equal(first.leg.nextTrip?.id, 't1');
  const mid = planLeg(ep(a), ep(b), ctx(data, { depart: 10 * 60 + 10 }), { mode: 'transit' });
  const { prevTrip, trip, nextTrip } = mid.leg;
  assert.ok(prevTrip && trip && nextTrip);
  assert.deepEqual([prevTrip.id, trip.id, nextTrip.id], ['t0', 't1', 't2']);
  assert.ok(toMinutes(prevTrip.depart) < toMinutes(trip.depart) && toMinutes(trip.depart) < toMinutes(nextTrip.depart));
  for (const t of [prevTrip, trip, nextTrip]) assert.deepEqual([t.from, t.to], ['a', 'b']);
  // 前一班找得到最接近的那班（不是區間裡最早的）
  const dense = fake([a, b], { routes: [busRoute(['10:20', '10:25', '10:30', '10:35'])] });
  const d = planLeg(ep(a), ep(b), ctx(dense), { trip: tripOf('t3', '10:35', '10:45') });
  assert.equal(d.leg.prevTrip?.id, 't2');
  assert.equal(d.leg.nextTrip ?? null, null);
});

test('transitAvailable：有班次就是 true，不管等多久；步行就到的段落也要算', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(400)); // 走 10 分
  const near = planLeg(ep(a), ep(b), ctx(fake([a, b], { routes: [busRoute(['16:00'])] })));
  assert.equal(near.leg.mode, 'walk');
  assert.equal(near.leg.transitAvailable, true);
  assert.equal(near.leg.trip ?? null, null);
  const c = spot('c', at(4000));
  const none = planLeg(ep(a), ep(c), ctx(fake([a, c])));
  assert.equal(none.leg.mode, 'taxi');
  assert.equal(none.leg.transitAvailable, false);
  // 指定了計程車也照樣標（規劃模式要知道大眾運輸能不能選）
  const taxi = planLeg(ep(a), ep(b), ctx(fake([a, b], { routes: [busRoute(['16:00'])] })), { mode: 'taxi' });
  assert.equal(taxi.leg.transitAvailable, true);
});

test('transitAvailable（真的資料）：近鐵、離島的船；末班車之後也算有班次', () => {
  assert.equal(planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 23 * 60 + 50 })).leg.transitAvailable, true);
  assert.equal(planLeg(P('toba-sadahama-marine-terminal'), P('toba-port-kamishima'), ctx(real, { date: '2027-02-06', depart: 18 * 60 })).leg.transitAvailable, true);
  // 太遠、時刻表裡沒有
  assert.equal(planLeg(P('kansai-airport'), P('toba'), ctx(real, { depart: 14 * 60 })).leg.transitAvailable, false);
  // 近鐵的前一班、後一班是同一對車站
  const r = planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 9 * 60 }));
  assert.equal(r.leg.trip?.id, '1-375');
  assert.ok(r.leg.prevTrip && r.leg.nextTrip);
  assert.ok(r.leg.prevTrip.depart < '09:13' && r.leg.nextTrip.depart > '09:13');
});
