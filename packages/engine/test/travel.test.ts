// 兩點之間的交通方式（CONVENTIONS §5.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLeg, resolveConfig, walkFactor, type Endpoint, type EngineData, type LegContext, type PlaceRecord, type RouteTimetable } from '../src/index.ts';
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
