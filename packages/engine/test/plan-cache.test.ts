// 只重算有改的那一天（T29b spec §7.3、§7.4）：用快取算的結果要和整份重算一模一樣，沒改的天沿用上次的 DayPlan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, createItinerary, createPlanCache, moveItemTo, planItinerary, resolveConfig, setLodging, type EngineData, type Itinerary } from '../src/index.ts';
import { realData } from './fixtures.ts';

const real = realData();
const cfg = resolveConfig();
const SEQ = ['kashikojima', 'ugata', 'toba', 'isuzugawa'];

function base(): Itinerary {
  let it = createItinerary();
  for (const date of ['2027-02-04', '2027-02-05', '2027-02-06']) {
    it = setLodging(it, date, 'toba');
    for (const p of SEQ) it = addItem(it, date, { type: 'visit', options: [{ place: p, stayMinutes: 20 }] }).itinerary;
  }
  return it;
}

/** 用快取算，檢查和整份重算一樣；回傳結果 */
function check(it: Itinerary, data: EngineData, cache: ReturnType<typeof createPlanCache>) {
  const cached = planItinerary(it, data, cfg, cache);
  assert.deepEqual(cached, planItinerary(it, data, cfg));
  return cached;
}

const dayOf = (plan: ReturnType<typeof planItinerary>, date: string) => plan.days.find((d) => d.date === date);

test('快取：移動一張資料卡只重算那一天', () => {
  const cache = createPlanCache();
  const it = base();
  const before = check(it, real, cache);
  const id = it.days.find((d) => d.date === '2027-02-05')!.items[3].id;
  const after = check(moveItemTo(it, id, '2027-02-05', 0), real, cache);
  for (const d of after.days) {
    if (d.date === '2027-02-05') assert.notEqual(d, dayOf(before, d.date));
    else assert.equal(d, dayOf(before, d.date), d.date);
  }
});

test('快取：改住宿重算當天和隔天', () => {
  const cache = createPlanCache();
  const it = base();
  const before = check(it, real, cache);
  const after = check(setLodging(it, '2027-02-04', 'kashikojima'), real, cache);
  const changed = after.days.filter((d) => d !== dayOf(before, d.date)).map((d) => d.date);
  assert.deepEqual(changed, ['2027-02-04', '2027-02-05']);
});

test('快取：隔天有自己的起點時，改住宿只重算當天', () => {
  const cache = createPlanCache();
  let it = base();
  it = { ...it, days: it.days.map((d) => (d.date === '2027-02-05' ? { ...d, start: 'ugata' } : d)) };
  const before = check(it, real, cache);
  const after = check(setLodging(it, '2027-02-04', 'kashikojima'), real, cache);
  const changed = after.days.filter((d) => d !== dayOf(before, d.date)).map((d) => d.date);
  assert.deepEqual(changed, ['2027-02-04']);
});

test('快取：改 party、換資料、換設定都整份重算，結果一樣', () => {
  const cache = createPlanCache();
  const it = base();
  const before = check(it, real, cache);
  const fewer = check({ ...it, party: { size: 6, elders: 0, kids: 0 } }, real, cache);
  assert.ok(fewer.days.every((d) => d !== dayOf(before, d.date)));
  // 新的 EngineData（網站：資料點變了、道路快取有新值）
  const walkSlow: EngineData = { ...real, walkMeters: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 300000 };
  const again = planItinerary(it, walkSlow, cfg, cache);
  assert.deepEqual(again, planItinerary(it, walkSlow, cfg));
  assert.ok(again.days.every((d) => d !== dayOf(before, d.date)));
  // 換設定
  const other = resolveConfig({ walk: { legMaxWhole: 5 } });
  const otherPlan = planItinerary(it, real, other, cache);
  assert.deepEqual(otherPlan, planItinerary(it, real, other));
});

test('快取：跨天的警告照最新的各天算', () => {
  const cache = createPlanCache();
  let it = base();
  check(it, real, cache);
  // 多加一天的行程：no-free-time 這類跨天警告要跟著變
  for (const p of SEQ) it = addItem(it, '2027-02-07', { type: 'visit', options: [{ place: p, stayMinutes: 20 }] }).itinerary;
  check(it, real, cache);
});
