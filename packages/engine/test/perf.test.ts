// 效能護欄：11 天、每天 9 段近鐵的行程（真的 data/）。規劃在主執行緒、每次編輯都整份重算，
// 每段大眾運輸都要附前一班、後一班，所以不能每段都重跑好幾次完整搜尋（舊的寫法第一次要 2 秒以上、之後每次也一樣）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, createItinerary, planItinerary, setLodging, type Itinerary } from '../src/index.ts';
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

test('效能：11 天 ~90 段近鐵，第一次規劃、編輯後重算都夠快，而且每段都有前一班、後一班', () => {
  const data = realData();
  const it = elevenDays();
  let t = performance.now();
  const plan = planItinerary(it, data);
  const first = performance.now() - t;
  // 電車段（T29 起第一天關西機場那段是南海空港急行＋近鐵，含班距型那程，照 spec §6.6 沒有前一班、後一班，不算在內）
  const legs = plan.days.flatMap((d) => d.entries.map((e) => e.travel).filter((l) => l?.mode === 'train' && l.rides.every((r) => r.kind !== 'headway')));
  assert.ok(legs.length >= 80, `近鐵段數 ${legs.length}`);
  assert.ok(legs.every((l) => l?.trip && (l.prevTrip || l.nextTrip)));
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
  const trains = plan.days.flatMap((d) => d.entries.map((e) => e.travel).filter((l) => l?.mode === 'train' && l.rides.every((r) => r.kind !== 'headway')));
  assert.ok(trains.every((l) => l?.trip && (l.prevTrip || l.nextTrip)));
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
