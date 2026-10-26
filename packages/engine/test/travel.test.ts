// 兩點之間的交通方式（CONVENTIONS §5.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, earliestTrain, fromMinutes, planLeg, resolveConfig, rideDepartures, taxiEstimate, toMinutes, walkFactor, type Endpoint, type EngineData, type LegContext, type PlaceRecord, type RouteTimetable, type TripRef } from '../src/index.ts';
import { at, fake, restaurant, spot, station } from './synthetic.ts';
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

test('太遠、時刻表裡沒有 → 交通方式未知，請用 travel 指定', () => {
  // T29 以前用關西機場 → 鳥羽；RAPTOR 找得到南海＋近鐵（見下一個測試），改用假的兩點
  const a = spot('a', at(0));
  const b = spot('b', at(100_000));
  const r = planLeg(ep(a), ep(b), ctx(fake([a, b])));
  assert.equal(r.leg.mode, 'unknown');
  assert.ok(r.warnings.some((w) => w.code === 'travel-unknown'));
  assert.equal(r.leg.transitAvailable, false);
});

test('關西機場 → 鳥羽（T29）：南海空港急行（班距）→ 步行轉乘 → 近鐵特急', () => {
  const r = planLeg(P('kansai-airport'), P('toba'), ctx(real, { depart: 14 * 60 }));
  assert.equal(r.leg.mode, 'train');
  assert.equal(r.leg.transitAvailable, true);
  assert.deepEqual(r.leg.rides.map((x) => [x.kind, x.from, x.to]), [['headway', 'kansai-airport', 'nankai-namba'], ['timetable', 'osaka-namba', 'toba']]);
  // 南海なんば → 近鐵大阪難波：11 × 1.4 → 16 分，超過單段上限，照樣搭、加 info
  assert.equal(r.leg.transfers?.[0].walkMinutes, 16);
  assert.ok(r.warnings.some((w) => w.code === 'transfer-walk' && w.level === 'info' && w.message === '轉乘要走 16 分'));
  assert.equal(r.leg.walkMinutes, (r.leg.walkBefore ?? 0) + (r.leg.walkAfter ?? 0) + 16);
  assert.deepEqual(r.leg.ready, ['14:00', fromMinutes(toMinutes(r.leg.rides[0].arrive) + 16)]);
  // 含班距型那程：沒有前一班、後一班
  assert.equal(r.leg.prevTrip, null);
  assert.equal(r.leg.nextTrip, null);
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
  // 時間照「走到停留所後搭同一程」算：走 2 分＋車程 10 分＋下車走 2 分，不會少於走路、不會是負的
  assert.equal(r.leg.minutes, 2 + 10 + 2);
  assert.equal(r.leg.arrive, '10:54');
  assert.ok(r.warnings.some((x) => x.code === 'bus-crowd'));
  // 選定的班次在出發前就到站了（停留加長很多）：照樣 14 分
  const late = planLeg(ep(a), ep(b), ctx(data, { depart: 11 * 60 + 30 }), { trip: tripOf('t0', '10:02', '10:12') });
  assert.equal(late.leg.trip?.id, 't0');
  assert.equal(late.leg.minutes, 14);
  assert.equal(late.leg.arrive, '11:44');
  assert.ok(toMinutes(late.leg.arrive) >= toMinutes(late.leg.depart));
  assert.ok(late.warnings.some((x) => x.code === 'missed-trip'));
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

test('transitAvailable：出發後還有班次就是 true，不管等多久；步行就到的段落也要算', () => {
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
  // 末班車之後：false（大眾運輸灰掉）
  const after = planLeg(ep(a), ep(b), ctx(fake([a, b], { routes: [busRoute(['08:00', '09:58'])] })));
  assert.equal(after.leg.transitAvailable, false);
});

test('transitAvailable（真的資料）：近鐵、離島的船；末班車之後是 false', () => {
  assert.equal(planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 9 * 60 })).leg.transitAvailable, true);
  assert.equal(planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 23 * 60 + 50 })).leg.transitAvailable, false);
  assert.equal(planLeg(P('toba-sadahama-marine-terminal'), P('toba-port-kamishima'), ctx(real, { date: '2027-02-06', depart: 18 * 60 })).leg.transitAvailable, false);
  assert.equal(planLeg(P('toba-sadahama-marine-terminal'), P('toba-port-kamishima'), ctx(real, { date: '2027-02-06', depart: 8 * 60 })).leg.transitAvailable, true);
  // 近鐵的前一班、後一班是同一對車站
  const r = planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 9 * 60 }));
  assert.equal(r.leg.trip?.id, '1-375');
  assert.ok(r.leg.prevTrip && r.leg.nextTrip);
  assert.ok(r.leg.prevTrip.depart < '09:13' && r.leg.nextTrip.depart > '09:13');
});

// --- 第五輪：步驟資料、一程的所有班次、每一程的選定班次 ---------------------------

test('大眾運輸的 Leg 有 walkBefore、walkAfter、ready（巴士一程）', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35', '11:05'])] });
  const { leg } = planLeg(ep(a), ep(b), ctx(data), { mode: 'transit' });
  assert.equal(leg.walkBefore, 2);
  assert.equal(leg.walkAfter, 2);
  assert.deepEqual(leg.ready, ['10:02']);
  assert.equal(leg.ready!.length, leg.rides.length);
  assert.equal(leg.ready![0], fromMinutes(toMinutes(leg.depart) + leg.walkBefore!));
  // 合計步行＝兩段步行（各自進位）的和，和畫面上分開寫的一致
  assert.equal(leg.walkBefore! + leg.walkAfter!, leg.walkMinutes);
  assert.equal(leg.rides[0].routeId, 'test-bus');
});

test('不是大眾運輸時沒有 walkBefore、walkAfter、ready', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(500));
  const { leg } = planLeg(ep(a), ep(b), ctx(fake([a, b])));
  assert.equal(leg.mode, 'walk');
  assert.equal(leg.walkBefore, undefined);
  assert.equal(leg.walkAfter, undefined);
  assert.equal(leg.ready, undefined);
  // 只填分鐘：自動那段是巴士，但不帶班次，步驟資料也不帶
  const far = spot('b', at(4000));
  const data = fake([a, far], { routes: [busRoute(['10:05', '10:35'])] });
  assert.equal(planLeg(ep(a), ep(far), ctx(data)).leg.mode, 'bus');
  const filled = planLeg(ep(a), ep(far), ctx(data), { minutes: 30 }).leg;
  assert.deepEqual(filled.rides, []);
  assert.equal(filled.walkBefore, undefined);
  assert.equal(filled.walkAfter, undefined);
  assert.equal(filled.ready, undefined);
});

test('rideDepartures（巴士）：同一對站的所有班次，依發車排序', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['11:05', '10:05', '10:35'])] });
  const { leg } = planLeg(ep(a), ep(b), ctx(data), { mode: 'transit' });
  const deps = rideDepartures(data, cfg, '2027-02-05', leg.rides[0]);
  assert.deepEqual(
    deps.map((d) => [d.tripId, d.depart, d.arrive]),
    [['t1', '10:05', '10:15'], ['t2', '10:35', '10:45'], ['t0', '11:05', '11:15']],
  );
  assert.equal(deps[0].line, '測試線（往b）');
  // 找不到路線：空的
  assert.deepEqual(rideDepartures(data, cfg, '2027-02-05', { ...leg.rides[0], routeId: 'nope' }), []);
});

// 近鐵轉乘：伊勢市 10:00 → 加茂＝特急 1-1963（伊勢市 → 鳥羽）＋普通 1-3799（鳥羽 → 加茂）。
// T29：自動改成 RAPTOR，同時到達取程數少的（普通 1-3799 直達，一樣 11:41 到）；
// 這幾個測試測的是選定班次（舊的 tripLeg），所以用舊的近鐵搜尋（earliestTrain）組 trip 再規劃
function legacyTrip(from: string, to: string, depart: number): TripRef {
  const legs = earliestTrain(real.kintetsu!, { from, to, date: '2027-02-05', after: depart, holidays: cfg.holidays, minTransfer: cfg.transit.minTransfer });
  assert.ok(legs);
  return {
    id: legs[0].trainNo,
    depart: fromMinutes(legs[0].dep),
    arrive: fromMinutes(legs[legs.length - 1].arr),
    from,
    to,
    rides: legs.map((l) => l.trainNo),
    ...(legs.length === 2 ? { via: legs[0].alight } : {}),
  };
}
const legacyLeg = (from: string, to: string, depart: number) => planLeg(P(from), P(to), ctx(real, { depart }), { mode: 'transit', trip: legacyTrip(from, to, depart) }).leg;
const transferLeg = () => legacyLeg('iseshi', 'kamo', 10 * 60);

test('同時到達取程數少的（T29）：伊勢市 10:00 → 加茂是普通直達，候選走法有特急轉乘', () => {
  const leg = planLeg(P('iseshi'), P('kamo'), ctx(real, { depart: 10 * 60 }), { mode: 'transit' }).leg;
  assert.deepEqual(leg.rides.map((r) => [r.tripId, r.depart, r.arrive]), [['1-3799', '11:07', '11:41']]);
  assert.equal(leg.arrive, transferLeg().arrive);
});

test('伊勢市 8:00 → 中之郷（T29）：近鐵接巴士比舊的近鐵轉乘早到', () => {
  const leg = planLeg(P('iseshi'), P('nakanogo'), ctx(real, { depart: 8 * 60 }), { mode: 'transit' }).leg;
  assert.ok(toMinutes(leg.arrive) < toMinutes(legacyLeg('iseshi', 'nakanogo', 8 * 60).arrive));
  assert.deepEqual(leg.rides.map((r) => r.mode), ['train', 'bus']);
  assert.equal(leg.prevTrip, null);
});

test('近鐵轉乘：ready＝出發＋走到車站、前一程到站＋轉乘時間；近鐵的 routeId 是 null', () => {
  const leg = transferLeg();
  assert.deepEqual(leg.rides.map((r) => [r.tripId, r.from, r.to, r.depart, r.arrive]), [
    ['1-1963', 'iseshi', 'toba', '11:14', '11:28'],
    ['1-3799', 'toba', 'kamo', '11:31', '11:41'],
  ]);
  assert.deepEqual([leg.walkBefore, leg.walkAfter], [0, 0]);
  assert.deepEqual(leg.ready, ['10:00', fromMinutes(toMinutes('11:28') + cfg.transit.minTransfer)]);
  assert.equal(leg.rides[0].routeId ?? null, null);
  assert.deepEqual(leg.trip?.rides, ['1-1963', '1-3799']);
});

test('rideDepartures（近鐵）：只列這一程那對車站的直達車（不轉乘），依發車排序', () => {
  const leg = transferLeg();
  const first = rideDepartures(real, cfg, '2027-02-05', leg.rides[0]);
  assert.ok(first.length >= 2);
  assert.ok(first.some((d) => d.tripId === '1-1963' && d.depart === '11:14' && d.arrive === '11:28'));
  assert.deepEqual(first.map((d) => d.depart), [...first.map((d) => d.depart)].sort());
  const second = rideDepartures(real, cfg, '2027-02-05', leg.rides[1]);
  assert.ok(second.some((d) => d.tripId === '1-3799' && d.depart === '11:31' && d.arrive === '11:41'));
  for (const d of second) assert.ok(d.arrive > d.depart);
  assert.match(second[0].line, /普通（往/);
  assert.deepEqual(second.map((d) => d.depart), [...second.map((d) => d.depart)].sort());
});

test('換第一程後第二程接不上：改成同一對站接得上的最早一班，節點不變', () => {
  const base = transferLeg();
  // 晚一班的特急 1-4141（伊勢市 11:33 → 鳥羽 11:47）：原本的 1-3799（鳥羽 11:31）接不上
  const { leg } = planLeg(P('iseshi'), P('kamo'), ctx(real, { depart: 10 * 60 }), {
    mode: 'transit',
    trip: { ...base.trip!, id: '1-4141', depart: '11:33', rides: ['1-4141', '1-3799'] },
  });
  assert.deepEqual(leg.rides.map((r) => [r.tripId, r.from, r.to]), [
    ['1-4141', 'iseshi', 'toba'],
    ['1-3805', 'toba', 'kamo'],
  ]);
  assert.ok(toMinutes(leg.rides[1].depart) >= toMinutes(leg.rides[0].arrive) + cfg.transit.minTransfer);
  assert.equal(leg.arrive, leg.rides[1].arrive);
  assert.deepEqual(leg.trip?.rides, ['1-4141', '1-3805']);
});

test('指定第二程：接得上就用那班；接不上改最早接得上的；第一程不變', () => {
  const base = transferLeg();
  const pick = (second: string) =>
    planLeg(P('iseshi'), P('kamo'), ctx(real, { depart: 10 * 60 }), { mode: 'transit', trip: { ...base.trip!, rides: ['1-1963', second] } }).leg;
  const later = pick('1-3805');
  assert.deepEqual(later.rides.map((r) => r.tripId), ['1-1963', '1-3805']);
  assert.equal(later.rides[1].depart, '12:29');
  assert.equal(later.arrive, '12:39');
  assert.equal(later.waitMinutes, base.waitMinutes);
  // 鳥羽 10:29 那班比第一程到站早：接不上
  const early = pick('1-3798');
  assert.deepEqual(early.rides.map((r) => r.tripId), ['1-1963', '1-3799']);
  // 時刻表裡沒有的 id：一樣改最早接得上的
  assert.deepEqual(pick('nope').rides.map((r) => r.tripId), ['1-1963', '1-3799']);
});

test('trip.via：近鐵兩程的轉乘站；一程的沒有', () => {
  assert.equal(transferLeg().trip?.via, 'toba');
  const r = planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 9 * 60 }));
  assert.equal(r.leg.trip?.via ?? null, null);
});

test('節點不變：第一程換成班次表裡的任何一班，轉乘站和程數都不變', () => {
  for (const [from, to, depart] of [['iseshi', 'kamo', 10 * 60], ['iseshi', 'nakanogo', 8 * 60]] as const) {
    const base = legacyLeg(from, to, depart);
    assert.equal(base.rides.length, 2, `${from}→${to}`);
    const via = base.rides[0].to;
    const firsts = rideDepartures(real, cfg, '2027-02-05', base.rides[0]);
    assert.ok(firsts.length > 8);
    for (const f of firsts) {
      const { leg } = planLeg(P(from), P(to), ctx(real, { depart }), {
        mode: 'transit',
        trip: { ...base.trip!, id: f.tripId, depart: f.depart, rides: [f.tripId, base.rides[1].tripId!] },
      });
      const where = `${from}→${to} 第一程 ${f.tripId}`;
      assert.equal(leg.rides.length, 2, where);
      assert.equal(leg.rides[0].tripId, f.tripId, where);
      assert.equal(leg.rides[0].to, via, where);
      assert.equal(leg.rides[1].from, via, where);
      assert.equal(leg.trip?.via, via, where);
    }
  }
});

test('第二程整天都接不上：留原本那班，警告 missed-trip', () => {
  const base = transferLeg();
  // 伊勢市 → 鳥羽的末班之後已經沒有鳥羽 → 加茂的車
  const firsts = rideDepartures(real, cfg, '2027-02-05', base.rides[0]);
  const last = firsts[firsts.length - 1];
  const r = planLeg(P('iseshi'), P('kamo'), ctx(real, { depart: 10 * 60 }), {
    mode: 'transit',
    trip: { ...base.trip!, id: last.tripId, depart: last.depart, rides: [last.tripId, '1-3799'] },
  });
  assert.deepEqual(r.leg.rides.map((x) => x.tripId), [last.tripId, '1-3799']);
  assert.ok(r.warnings.some((w) => w.code === 'missed-trip' && w.message === '接不上 11:31 這班'));
});

test('舊的 trip（沒有 rides）照樣用第一程；只有一程的忽略第 1 個以後的', () => {
  const base = transferLeg();
  const { rides: _, ...old } = base.trip!;
  const again = planLeg(P('iseshi'), P('kamo'), ctx(real, { depart: 10 * 60 }), { mode: 'transit', trip: old }).leg;
  assert.deepEqual(again.rides, base.rides);
  assert.equal(again.arrive, base.arrive);
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  const data = fake([a, b], { routes: [busRoute(['10:05', '10:35', '11:05'])] });
  const bus = planLeg(ep(a), ep(b), ctx(data), { trip: { ...tripOf('t1', '10:35', '10:45'), rides: ['t1', 't2'] } }).leg;
  assert.deepEqual(bus.rides.map((r) => r.tripId), ['t1']);
  assert.deepEqual(bus.trip?.rides, ['t1']);
});

// --- T29：RAPTOR（轉乘步行、候選走法、班距型、錯過的話） ---------------------------

test('舊行程在大阪存了 trip：當作沒選，照自動算', () => {
  const trip: TripRef = { id: '1-382', depart: '16:10', arrive: '18:35', from: 'osaka-castle-tenshukaku', to: 'osaka-harukas300' };
  const r = planLeg(P('osaka-castle-tenshukaku'), P('osaka-harukas300'), ctx(real, { date: '2027-02-12', depart: 10 * 60 }), { trip });
  assert.notEqual(r.leg.mode, 'unknown');
  assert.ok(r.leg.rides.length >= 1);
  assert.ok(!r.warnings.some((w) => w.code === 'missed-trip'));
});

test('大阪：Leg 有 transfers、alternatives，班距型那程有班距', () => {
  const { leg } = planLeg(P('osaka-dotonbori'), P('osaka-castle-tenshukaku'), ctx(real, { date: '2027-02-12', depart: 10 * 60 }));
  assert.ok(leg.rides.length >= 1);
  assert.equal(leg.transfers?.length, leg.rides.length - 1);
  const hw = leg.rides.find((r) => r.kind === 'headway');
  assert.ok(hw);
  assert.ok(hw.headwayMin != null && hw.first != null && hw.last != null);
  assert.equal(hw.tripId, null);
  assert.ok(leg.alternatives && leg.alternatives.length >= 1);
  assert.deepEqual(leg.alternatives[0].rides, leg.rides);
  assert.ok(leg.walkMinutes >= (leg.walkBefore ?? 0) + (leg.walkAfter ?? 0));
  // 班距型那程沒有班次表
  assert.deepEqual(rideDepartures(real, cfg, '2027-02-12', hw), []);
});

test('近鐵段照舊有前一班、後一班', () => {
  const { leg } = planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 10 * 60 }));
  assert.ok(leg.prevTrip || leg.nextTrip);
  assert.equal(leg.rides[0].kind, 'timetable');
  assert.ok((leg.rides[0].ifMissed?.lateMinutes ?? 0) > 0);
});

// --- T29 修正第 1 輪：預設那條不合規則時再找、舊方式只搭那種、不是舊路徑的沒有 trip、班距型第一程往後挪 ---

/** 假的巴士路線：id、停留所前綴、發車、車程 */
function busLine(id: string, deps: string[], ride: number): RouteTimetable {
  const r = busRoute(deps, ride);
  return { ...r, id, name: { ja: id, zh: id } };
}

test('預設那條不合規則（巴士要等 25 分）：再找另一個上車點的巴士，不改計程車', () => {
  const a = spot('a', at(0));
  const b = spot('b', at(4000));
  // fast：10:27 發、5 分到（最早到，但要等 25 分）；slow：10:12 發、30 分到（等 10 分）
  const data = fake([a, b], { routes: [busLine('fast', ['10:27', '10:57'], 5), busLine('slow', ['10:12', '10:42'], 30)] });
  const r = planLeg(ep(a), ep(b), ctx(data));
  assert.equal(r.leg.mode, 'bus');
  assert.deepEqual(r.leg.rides.map((x) => [x.routeId, x.depart]), [['slow', '10:12']]);
  assert.ok(!r.warnings.some((w) => w.code === 'taxi'));
});

test('預設那條不合規則（近鐵要等 40 分）：不搭那條線再找，車站旁的巴士可以搭', () => {
  const sa = station('sa', at(0));
  const sb = station('sb', at(4000));
  const kintetsu = {
    validFrom: '2026-01-01',
    stationOrder: ['sa', 'sb'],
    trains: { weekday: { k1: { type: '普通', note: null, to: 'sb', dir: 'down', stops: [['sa', null, '10:40'], ['sb', '10:50', null]] } }, holiday: {} },
  } as EngineData['kintetsu'];
  // 巴士停留所在車站旁 50 m（步行轉乘）；10:10 發、11:00 到，比近鐵晚到
  const bus: RouteTimetable = {
    ...busRoute(['10:10', '10:40'], 50),
    stops: [
      { id: 's1', name: 'A前', coords: at(50) },
      { id: 's2', name: 'B前', coords: at(4050) },
    ],
  };
  const data = fake([sa, sb], { kintetsu, routes: [bus] });
  const r = planLeg(ep(sa), ep(sb), ctx(data));
  assert.equal(r.leg.mode, 'bus');
  assert.equal(r.leg.rides[0].depart, '10:10');
  // 近鐵那條還在候選走法裡
  assert.ok(r.leg.alternatives?.some((x) => x.rides[0].tripId === 'k1'));
});

test('舊方式 bus／train：每一程都是那種；近鐵接巴士不算 bus，也不算 train', () => {
  const at8 = ctx(real, { depart: 8 * 60 });
  const auto = planLeg(P('iseshi'), P('nakanogo'), at8, { mode: 'transit' }).leg;
  assert.deepEqual(auto.rides.map((r) => r.mode), ['train', 'bus']);
  const train = planLeg(P('iseshi'), P('nakanogo'), at8, { mode: 'train' }).leg;
  assert.ok(train.rides.length >= 1 && train.rides.every((r) => r.mode === 'train'));
  // 只搭電車：跟舊的近鐵搜尋一樣（不會因為近鐵接巴士比較早而只剩慢的直達）
  assert.equal(train.arrive, legacyLeg('iseshi', 'nakanogo', 8 * 60).arrive);
  const bus = planLeg(P('iseshi'), P('nakanogo'), at8, { mode: 'bus' });
  assert.ok(bus.leg.rides.every((r) => r.mode === 'bus'));
  assert.ok(!bus.leg.alternatives?.some((x) => x.rides.some((r) => r.mode !== 'bus')));
});

test('舊的 tripLeg 解讀不了的走法：trip、prevTrip、nextTrip 都是 null', () => {
  const kix = planLeg(P('kansai-airport'), P('toba'), ctx(real, { depart: 14 * 60 })).leg;
  assert.equal(kix.trip, null);
  const osaka = planLeg(P('osaka-dotonbori'), P('osaka-castle-tenshukaku'), ctx(real, { date: '2027-02-12', depart: 10 * 60 })).leg;
  assert.equal(osaka.trip, null);
  const mixed = planLeg(P('iseshi'), P('nakanogo'), ctx(real, { depart: 8 * 60 }), { mode: 'transit' }).leg;
  assert.deepEqual([mixed.trip, mixed.prevTrip, mixed.nextTrip], [null, null, null]);
  // 近鐵一程照舊有
  assert.equal(planLeg(P('toba'), P('kashikojima'), ctx(real, { depart: 9 * 60 })).leg.trip?.id, '1-375');
});

test('第一程是班距型：上車往後挪，等車移到起點，到達不變（關西機場 14:00 → 鵜方）', () => {
  const day = ctx(real, { date: '2027-02-02', depart: 14 * 60 });
  const { leg } = planLeg(P('kansai-airport'), P('ugata'), day);
  assert.equal(leg.rides[0].kind, 'headway');
  assert.equal(leg.rides.length, 2);
  // 難波轉乘：到站＋轉乘步行之後，等近鐵不到 20 分
  const transferWait = toMinutes(leg.rides[1].depart) - toMinutes(leg.ready![1]);
  assert.ok(transferWait >= 0 && transferWait < 20, `難波等 ${transferWait} 分`);
  // 到達和不挪的時候一樣：近鐵特急 1-382，16:10 → 18:35（data/access/kix.json）
  assert.deepEqual([leg.rides[1].tripId, leg.rides[1].depart, leg.rides[1].arrive], ['1-382', '16:10', '18:35']);
  assert.equal(leg.arrive, '18:35');
});

// --- 選定的走法（TravelSpec.path） ---

// 大阪裡有 2 條以上走法的一對（osaka-dotonbori → osaka-castle-tenshukaku 只有 1 條）
const PA = 'osaka-tsutenkaku', PB = 'osaka-dynamic-kitchen-san-obp';

test('path：照選的走法搭；出發晚 90 分同一條走法、arrive 變晚', () => {
  const dc = P(PA), tn = P(PB);
  const base = ctx(real, { date: '2027-02-12', depart: 8 * 60 });
  const alts = planLeg(dc, tn, base).leg.alternatives ?? [];
  const pick = alts.length > 1 ? alts[1] : null;
  assert.ok(pick, '大阪這一對要有 2 條以上的走法');
  const l1 = planLeg(dc, tn, base, { path: pick.path }).leg;
  assert.equal(l1.rides.length, pick.ridesCount);
  assert.equal(l1.specified, true);
  assert.equal(l1.arrive, pick.arrive);
  const l2 = planLeg(dc, tn, ctx(real, { date: '2027-02-12', depart: 8 * 60 + 90 }), { path: pick.path }).leg;
  assert.equal(l2.rides.length, pick.ridesCount);
  assert.ok(toMinutes(l2.arrive) > toMinutes(l1.arrive));
});

test('path：那天不能搭的線 → path-unavailable，改自動', () => {
  const dc = P(PA), tn = P(PB);
  const path = { rides: [{ line: 'no-such-line', from: 'x', to: 'y' }], from: dc.id, to: tn.id };
  const { leg, warnings } = planLeg(dc, tn, ctx(real, { date: '2027-02-11', depart: 10 * 60 }), { path });
  assert.ok(warnings.some((w) => w.code === 'path-unavailable' && w.level === 'info' && w.message.startsWith('選的走法這時間沒有車，改用')));
  assert.notEqual(leg.mode, 'unknown');
});

test('path：from 和 a.id 不同 → 照自動', () => {
  const dc = P(PA), tn = P(PB);
  const c = ctx(real, { date: '2027-02-12', depart: 8 * 60 });
  const auto = planLeg(dc, tn, c);
  const alt = auto.leg.alternatives?.[1];
  assert.ok(alt);
  const r = planLeg(dc, tn, c, { path: { ...alt.path, from: 'other' } });
  assert.deepEqual(r, auto);
});

// --- 最終審查的修正 -----------------------------------------------------------

const SUB = { size: 5, elders: 2, kids: 1 };

test('transitMaxLateVsTaxi 預設 30', () => {
  assert.equal(cfg.transit.transitMaxLateVsTaxi, 30);
});

test('鄉下轉乘比計程車晚超過 30 分 → 計程車：一葉（志摩）→ 鳥羽 久兵衛 11:16 全員', () => {
  // 巴士 → 特急 → 巴士要 14:33 才到；計程車 12:03
  const { leg, warnings } = planLeg(P('shima-ichiyo'), P('toba-umino-shokudo-kyubei'), ctx(real, { date: '2027-02-04', depart: 11 * 60 + 16 }));
  assert.equal(leg.mode, 'taxi');
  assert.equal(leg.arrive, '12:03');
  assert.ok(warnings.some((w) => w.code === 'transit-slow' && /比計程車晚 \d+ 分到/.test(w.message)), warnings.map((w) => w.message).join(' / '));
});

test('鄉下轉乘比計程車晚超過 30 分 → 計程車：かき秋 はなれ（伊勢）→ 志摩 ocean villa 9:37 分組', () => {
  // 巴士 3 程要 12:06 才到；計程車 10:24
  const { leg } = planLeg(P('ise-kakiaki-hanare'), P('shima-ocean-villa-wa'), ctx(real, { date: '2027-02-04', depart: 9 * 60 + 37, party: SUB, whole: false }));
  assert.equal(leg.mode, 'taxi');
  assert.equal(leg.arrive, '10:24');
});

test('比計程車晚的規則只管搭 2 程以上的：直達的電車照舊（伊勢市 → 大阪難波太遠，計程車叫不到也照樣搭）', () => {
  const { leg } = planLeg(P('iseshi'), P('osaka-namba'), ctx(real, { depart: 10 * 60 }));
  assert.equal(leg.mode, 'train');
  assert.equal(leg.rides.length, 1);
});

test('指定 transit 不和計程車比：一葉 → 久兵衛 照樣搭大眾運輸', () => {
  const { leg } = planLeg(P('shima-ichiyo'), P('toba-umino-shokudo-kyubei'), ctx(real, { date: '2027-02-04', depart: 11 * 60 + 16 }), { mode: 'transit' });
  assert.ok(leg.rides.length >= 2);
});

test('巴士班距照舊：同一條路線、同一個上車停留所、到得了任一個下車點的下一班（宿屋 五十鈴 → 月讀宮 8:00 分組搭巴士）', () => {
  const { leg } = planLeg(P('ise-yadoya-isuzu'), P('ise-tsukiyomi-no-miya-geku'), ctx(real, { date: '2027-02-03', depart: 8 * 60, party: SUB, whole: false }));
  assert.equal(leg.mode, 'bus');
  assert.equal(leg.rides[0].from, '浦田町');
  assert.equal(leg.rides[0].depart, '08:10');
  assert.equal(leg.arrive, '08:31');
});

test('巴士班距照舊：とら丸 → 五十鈴茶屋 10:12 全員搭 51 系統，不是「1 小時以上才一班」改計程車', () => {
  // 舊的寫法：外宮內宮線 51 系統 伊勢市駅前 10:43 → 内宮前（A 線最近那班 1 小時一班，換一條線找）
  const { leg, warnings } = planLeg(P('ise-toramaru'), P('ise-isuzu-chaya-honten'), ctx(real, { date: '2027-02-06', depart: 10 * 60 + 12 }));
  assert.equal(leg.mode, 'bus');
  assert.equal(leg.rides[0].routeId, 'sanco-gaiku-naiku-chokokan');
  assert.ok(toMinutes(leg.arrive) <= toMinutes('11:14'), leg.arrive);
  assert.ok(!warnings.some((w) => w.code === 'bus-infrequent'));
});

test('alternatives 沒有重複的走法、摘要：梅田 Sky → 海遊館（自動、照走法都一樣）', () => {
  const c = ctx(real, { date: '2027-02-11', depart: 12 * 60 + 23 });
  const auto = planLeg(P('osaka-umeda-sky-building'), P('osaka-kaiyukan'), c).leg;
  const check = (alts: typeof auto.alternatives) => {
    assert.ok(alts && alts.length >= 1);
    const paths = alts.map((x) => JSON.stringify(x.path.rides));
    assert.equal(new Set(paths).size, paths.length, paths.join(' | '));
    const sums = alts.map((x) => x.summary);
    assert.equal(new Set(sums).size, sums.length, sums.join(' | '));
  };
  check(auto.alternatives);
  for (const alt of auto.alternatives ?? []) {
    const p = planLeg(P('osaka-umeda-sky-building'), P('osaka-kaiyukan'), c, { path: alt.path }).leg;
    check(p.alternatives);
    assert.deepEqual(p.alternatives?.[0].path, alt.path);
  }
});

test('選畫面上的走法：班次和畫面上那條一樣（五十鈴川 → 中之郷 11:40，早一班的特急不會被選）', () => {
  const c = ctx(real, { date: '2027-02-11', depart: 11 * 60 + 40 });
  const auto = planLeg(P('isuzugawa'), P('nakanogo'), c).leg;
  assert.ok(auto.alternatives?.length);
  for (const alt of auto.alternatives ?? []) {
    const p = planLeg(P('isuzugawa'), P('nakanogo'), c, { path: alt.path }).leg;
    assert.deepEqual(
      p.rides.map((r) => [r.depart, r.arrive]),
      alt.rides.map((r) => [r.depart, r.arrive]),
      alt.summary,
    );
  }
});

test('太遠不能搭計程車 → 照樣搭要等很久的電車（伊勢市 10:00 → 大阪難波，特急 10:49）', () => {
  const { leg, warnings } = planLeg(P('iseshi'), P('osaka-namba'), ctx(real, { depart: 10 * 60 }));
  assert.equal(leg.mode, 'train');
  assert.equal(leg.rides[0].depart, '10:49');
  assert.ok(warnings.some((w) => w.code === 'long-wait' && w.message.includes('太遠，不能改搭計程車')));
  assert.ok(!warnings.some((w) => w.code === 'travel-unknown'));
});

test('近的、電車要等很久 → 照舊改計程車（伊勢市 10:00 → 朝熊，要等 39 分）', () => {
  const { leg, warnings } = planLeg(P('iseshi'), P('asama'), ctx(real, { depart: 10 * 60 }));
  assert.equal(leg.mode, 'taxi');
  assert.ok(warnings.some((w) => w.code === 'long-wait' && w.message.includes('改搭計程車')));
});
