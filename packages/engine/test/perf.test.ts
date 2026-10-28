// 效能護欄：11 天、每天 9 段近鐵的行程（真的 data/）。規劃在主執行緒，每次編輯都要重算（網站用 PlanCache 只重算有改的那天，
// 這裡測的是不用快取的整份重算）；不能每段都重跑好幾次完整搜尋（舊的寫法第一次要 2 秒以上、之後每次也一樣）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, createItinerary, createPlanCache, planItinerary, resolveConfig, setLodging, type Itinerary } from '../src/index.ts';
import { realData } from './fixtures.ts';

const SEQ = ['kashikojima', 'ugata', 'shima-isobe', 'kamo', 'toba', 'isuzugawa', 'iseshi', 'toba', 'shima-isobe', 'kashikojima'];

function elevenDays(): Itinerary {
  let it = createItinerary();
  for (let d = 2; d <= 12; d++) {
    const date = `2027-02-${String(d).padStart(2, '0')}`;
    for (const p of SEQ) it = addItem(it, date, { type: 'visit', options: [{ place: p, stayMinutes: 20 }] }).itinerary;
  }
  return it;
}

test('效能：11 天 ~90 段近鐵，第一次規劃、編輯後重算都夠快', () => {
  const data = realData();
  const it = elevenDays();
  let t = performance.now();
  const plan = planItinerary(it, data);
  const first = performance.now() - t;
  // 電車段（第一天關西機場那段是南海空港急行＋近鐵，含班距型那程，不算在內）
  const legs = plan.days.flatMap((d) => d.entries.map((e) => e.travel).filter((l) => l?.mode === 'train' && l.rides.every((r) => r.kind !== 'headway')));
  assert.ok(legs.length >= 80, `近鐵段數 ${legs.length}`);
  assert.ok(legs.every((l) => l?.rides.every((r) => r.ifMissed !== undefined)));
  // 編輯一天（中間那天多一站）後整份重算
  const edited = addItem(it, '2027-02-07', { type: 'visit', options: [{ place: 'toba', stayMinutes: 30 }] }, { index: 3 }).itinerary;
  t = performance.now();
  planItinerary(edited, data);
  const again = performance.now() - t;
  // 網站每次編輯都建新的 EngineData（陣列同一份、getPlace 等函式是新的）：快取照樣要用得到
  const edited2 = addItem(edited, '2027-02-09', { type: 'visit', options: [{ place: 'toba', stayMinutes: 30 }] }, { index: 2 }).itinerary;
  t = performance.now();
  planItinerary(edited2, { ...data, getPlace: (id) => data.getPlace(id) });
  const fresh = performance.now() - t;
  console.log(`11 天規劃：第一次 ${first.toFixed(0)} ms，編輯後重算 ${again.toFixed(0)} ms，新的 EngineData 重算 ${fresh.toFixed(0)} ms`);
  // 界線放很寬（測試平行跑會互搶 CPU）；舊的寫法兩個都在 2 秒以上
  assert.ok(first < 4000, `第一次規劃 ${first.toFixed(0)} ms`);
  assert.ok(again < 800, `編輯後重算 ${again.toFixed(0)} ms`);
  assert.ok(fresh < 800, `新的 EngineData 重算 ${fresh.toFixed(0)} ms`);
});

// 大阪（T29 spec §6.7）：伊勢志摩 9 天＋大阪 2 天＋回程那天，大阪每天 7 個景點＋回住宿 8 段，大多是班距型路線；
// 2/10 晚上起住大阪（那天最後一段是賢島 → 大阪的住宿）
const OSAKA = [
  ['osaka-castle-tenshukaku', 'osaka-umeda-sky-building', 'osaka-kaiyukan', 'osaka-tsutenkaku', 'osaka-harukas300', 'osaka-shitennoji', 'osaka-dotonbori'],
  ['osaka-kuromon-market', 'osaka-konjyakukan', 'osaka-castle-plum-grove', 'osaka-tempozan-ferris-wheel', 'osaka-tennoji-zoo', 'osaka-umeda-sky-building', 'osaka-dotonbori'],
];
const OSAKA_LODGING = 'osaka-grids-premium-namba';

function twelveDays(): Itinerary {
  let it = createItinerary();
  for (let d = 2; d <= 10; d++) {
    const date = `2027-02-${String(d).padStart(2, '0')}`;
    for (const p of SEQ) it = addItem(it, date, { type: 'visit', options: [{ place: p, stayMinutes: 20 }] }).itinerary;
  }
  it = setLodging(it, '2027-02-10', OSAKA_LODGING);
  OSAKA.forEach((places, i) => {
    const date = `2027-02-${11 + i}`;
    it = setLodging(it, date, OSAKA_LODGING);
    for (const p of places) it = addItem(it, date, { type: 'visit', options: [{ place: p, stayMinutes: 30 }] }).itinerary;
  });
  return it;
}

test('效能：12 天裡有 2 天大阪、每天 8 段', () => {
  // 網路的快取掛在資料的陣列上（同一個程序裡 realData() 的陣列是同一份）：換一份 stations，第一次規劃才是重新整理網路
  const real = realData();
  const data = { ...real, stations: [...real.stations] };
  const it = twelveDays();
  let t = performance.now();
  const plan = planItinerary(it, data);
  const first = performance.now() - t;
  // 大阪兩天：每天 8 段，都算得出來（通天閣 → ハルカス這種 1 km 左右的，全員走 21 分、地鐵也沒比較快，照規則是計程車）
  assert.equal(plan.days.length, 12);
  const osaka = plan.days.filter((d) => d.date === '2027-02-11' || d.date === '2027-02-12');
  assert.equal(osaka.length, 2);
  for (const d of osaka) {
    const legs = d.entries.map((e) => e.travel).filter((l) => l);
    assert.equal(legs.length, 8, `${d.date} ${legs.length} 段`);
    assert.ok(legs.every((l) => l?.mode !== 'unknown'), `${d.date} ${legs.map((l) => l?.mode).join(',')}`);
  }
  // 編輯大阪那天（多一站）後整份重算
  const edited = addItem(it, '2027-02-12', { type: 'visit', options: [{ place: 'osaka-kuromon-market', stayMinutes: 30 }] }, { index: 2 }).itinerary;
  t = performance.now();
  planItinerary(edited, data);
  const again = performance.now() - t;
  const edited2 = addItem(edited, '2027-02-11', { type: 'visit', options: [{ place: 'osaka-kuromon-market', stayMinutes: 30 }] }, { index: 1 }).itinerary;
  t = performance.now();
  planItinerary(edited2, { ...data, getPlace: (id) => data.getPlace(id) });
  const fresh = performance.now() - t;
  console.log(`12 天（含大阪 2 天）規劃：第一次 ${first.toFixed(0)} ms，編輯後重算 ${again.toFixed(0)} ms，新的 EngineData 重算 ${fresh.toFixed(0)} ms`);
  assert.ok(first < 4000, `第一次規劃 ${first.toFixed(0)} ms`);
  assert.ok(again < 800, `編輯後重算 ${again.toFixed(0)} ms`);
  assert.ok(fresh < 800, `新的 EngineData 重算 ${fresh.toFixed(0)} ms`);
});

// 網站的方式（T29b spec §7.4）：buildEngineData 沿用同一個 EngineData、planItinerary 帶 PlanCache，
// 動一張卡只重算那一天（伊勢志摩、大阪的天都要測）；結果和整份重算一樣
test('效能：網站的方式（同一個 EngineData＋PlanCache），動一張卡只重算那一天', () => {
  const real = realData();
  const data = { ...real, stations: [...real.stations] };
  const cfg = resolveConfig();
  const cache = createPlanCache();
  let it = twelveDays();
  let t = performance.now();
  planItinerary(it, data, cfg, cache);
  const first = performance.now() - t;
  const times: number[] = [];
  for (const [date, place, index] of [
    ['2027-02-06', 'toba', 2],
    ['2027-02-12', 'osaka-kuromon-market', 2],
    ['2027-02-07', 'isuzugawa', 4],
    ['2027-02-11', 'osaka-dotonbori', 1],
  ] as const) {
    it = addItem(it, date, { type: 'visit', options: [{ place, stayMinutes: 30 }] }, { index }).itinerary;
    t = performance.now();
    const plan = planItinerary(it, data, cfg, cache);
    times.push(performance.now() - t);
    assert.deepEqual(plan, planItinerary(it, data, cfg));
  }
  const max = Math.max(...times);
  console.log(`網站的方式：第一次 ${first.toFixed(0)} ms，動一張卡後重算 ${times.map((x) => x.toFixed(1)).join('、')} ms`);
  // 界線放寬（測試平行跑會互搶 CPU）；整份重算（新的 EngineData）約 100～200 ms
  assert.ok(max < 100, `動一張卡後重算 ${max.toFixed(0)} ms`);
});
