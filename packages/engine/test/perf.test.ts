// 效能護欄：11 天、每天 9 段近鐵的行程（真的 data/）。規劃在主執行緒、每次編輯都整份重算，
// 每段大眾運輸都要附前一班、後一班，所以不能每段都重跑好幾次完整搜尋（舊的寫法第一次要 2 秒以上、之後每次也一樣）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, createItinerary, planItinerary, type Itinerary } from '../src/index.ts';
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
  console.log(`11 天規劃：第一次 ${first.toFixed(0)} ms，編輯後重算 ${again.toFixed(0)} ms`);
  // 界線放很寬（測試平行跑會互搶 CPU）；舊的寫法兩個都在 2 秒以上
  assert.ok(first < 4000, `第一次規劃 ${first.toFixed(0)} ms`);
  assert.ok(again < 800, `編輯後重算 ${again.toFixed(0)} ms`);
});
