// T44b：卡片標章怎麼挑、四格、時間怎麼併、費用估計、小提醒（lib/placeSummary.ts、hours.ts 的 hoursLine）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adultYen, childYen, dateSpanLabel, fitBadges, fitCells, priceLine, rowPrice, scoreMark, shortReason, tipLine, tripClosure, yenAmounts } from '../src/lib/placeSummary.ts';
import { hoursLine } from '../src/lib/hours.ts';
import { rowHighlights } from '../src/shared/rowHighlights.ts';
import type { Assessment, Hours, Place } from '../src/data/types.ts';
import { placeWith } from './helpers.ts';

const spot = (scores: Record<string, number | null>, raw: Record<string, unknown> = {}, over: Partial<Place> = {}) =>
  placeWith(raw, { type: 'spot', assessment: { scores, rationale: {}, confidence: 'high' } as unknown as Assessment, ...over });
const labels = (p: Place, max?: number) => fitBadges(p, max).map((b) => b.label);

test('scoreMark：4、5 ◎，3 ○，2 △，1 ✕，沒有分數 null', () => {
  assert.deepEqual([5, 4, 3, 2, 1, null].map(scoreMark), ['◎', '◎', '○', '△', '✕', null]);
});

test('fitBadges：最好的一個＋最差的一個，好的在前', () => {
  // 鳥羽水族館：長輩 4、小孩 5、室內 → 沒有壞的，挑兩個好的（小孩 5 > 室內 > 長輩 4）
  assert.deepEqual(labels(spot({ elderFit: 4, kidsFit: 5 }, { weather: 'indoor' })), ['小孩 ◎', '室內']);
  // 橫山展望台這種：長輩 2、小孩 3、戶外 → 只有一個壞的
  assert.deepEqual(labels(spot({ elderFit: 2, kidsFit: 3 }, { weather: 'outdoor' })), ['長輩 △']);
  // 有好有壞：最好的＋最差的
  assert.deepEqual(labels(spot({ elderFit: 1, kidsFit: 5 }, { weather: 'indoor' })), ['小孩 ◎', '長輩 ✕']);
  // 有遮蔽排在 4 分後面（T58）：海女小屋這種
  assert.deepEqual(labels(spot({ elderFit: 4, kidsFit: 3 }, { weather: 'covered' })), ['長輩 ◎', '有遮蔽']);
  assert.deepEqual(labels(spot({ elderFit: 3, kidsFit: 3 }, { weather: 'covered' })), ['有遮蔽']);
  // 同分時長輩在前
  assert.deepEqual(labels(spot({ elderFit: 5, kidsFit: 5 })), ['長輩 ◎', '小孩 ◎']);
});

test('fitBadges：旅程期間休業；全部休是「二月休」，最差', () => {
  const all = spot({ elderFit: 5, kidsFit: 1 }, {}, { closures: [{ from: '2027-01-12', to: '2027-02-12', note: '冬季休園' }] });
  assert.deepEqual(labels(all), ['長輩 ◎', '二月休']);
  const part = spot({ elderFit: 3 }, {}, { closures: [{ from: '2027-02-12', to: '2027-02-12', note: null }] });
  assert.deepEqual(labels(part), ['2/12 休']);
  // 旅程之外的休業不算
  assert.deepEqual(labels(spot({}, {}, { closures: [{ from: '2026-12-29', to: '2027-01-03', note: null }] })), []);
});

test('fitBadges：max 1 時先放最差的；車站、自己加的沒有', () => {
  assert.deepEqual(labels(spot({ elderFit: 5, kidsFit: 2 }), 1), ['小孩 △']);
  assert.deepEqual(labels(spot({ elderFit: 5 }), 1), ['長輩 ◎']);
  assert.deepEqual(labels(spot({ elderFit: 5 }), 0), []);
  assert.deepEqual(labels(placeWith({}, { type: 'station' })), []);
  assert.deepEqual(labels(spot({ elderFit: 5 }, {}, { origin: 'user' })), []);
});

test('rowHighlights：已排、候選在前，剩下的位置放這團的標章（T82：顏色照記號，◎ good、△ warn、✕ bad、其他 muted）', () => {
  const p = spot({ elderFit: 5, kidsFit: 2 });
  assert.deepEqual(rowHighlights(p, { candidate: ['2027-02-10'], scheduled: ['2027-02-05'] }).map((h) => [h.label, h.tone]), [['2/5 已排', 'plan'], ['主辦考慮放 2/10', 'indigo']]);
  assert.deepEqual(rowHighlights(p, { candidate: ['2027-02-10'], scheduled: [] }).map((h) => [h.label, h.tone]), [['主辦考慮放 2/10', 'indigo'], ['小孩 △ 要注意', 'warn']]);
  assert.deepEqual(rowHighlights(p, { candidate: [], scheduled: [] }).map((h) => [h.label, h.tone]), [['長輩 ◎ 很適合', 'good'], ['小孩 △ 要注意', 'warn']]);
  assert.deepEqual(rowHighlights(spot({ elderFit: 4, kidsFit: 5 }, { weather: 'indoor' }), { candidate: [], scheduled: [] }).map((h) => [h.label, h.tone]), [['小孩 ◎ 很適合', 'good'], ['室內', 'muted']]);
  // 15 人、預約不再放在卡片上（移到詳情）
  assert.deepEqual(rowHighlights(placeWith({ group: { fit15: 'yes' }, reservation: { required: true } }), { candidate: [], scheduled: [] }), []);
});

test('tripClosure、dateSpanLabel：連續的日期併起來', () => {
  assert.equal(dateSpanLabel(['2027-02-02', '2027-02-03', '2027-02-04', '2027-02-09']), '2/2～2/4、2/9');
  const c = tripClosure([{ from: '2027-02-01', to: '2027-02-03', note: '維修' }])!;
  assert.deepEqual([c.dates, c.all, c.note], [['2027-02-02', '2027-02-03'], false, '維修']);
  assert.equal(tripClosure([]), null);
});

test('shortReason：拿掉括號（含巢狀），取到第一個；或。', () => {
  assert.equal(shortReason('有坡道與電梯、可借輪椅 16 台（不能預約），停車場搭電梯到入口；但館內大（部落格（2024）），扣一顆'), '有坡道與電梯、可借輪椅 16 台，停車場搭電梯到入口');
  assert.equal(shortReason('（只有括號）'), null);
  assert.equal(shortReason(null), null);
});

test('fitCells：四格的記號和理由', () => {
  const p = spot(
    { elderFit: 4, kidsFit: 5, winterFit: 5 },
    { group: { reservation: '一般團體不需預約，到售票處申報即可（25 人以上才有團體價）。' } },
    {},
  );
  p.assessment!.rationale = { elderFit: '有坡道與電梯（官網）；但館內大', winterFit: '全館室內、2 月照常營業' };
  const cells = fitCells(p);
  assert.deepEqual(
    cells.map((c) => [c.label, c.mark, c.reason]),
    [
      ['長輩', '◎', '有坡道與電梯'],
      ['小孩', '◎', null],
      ['2 月', '◎', '全館室內、2 月照常營業'],
      ['15 人', '◎', '一般團體不需預約，到售票處申報即可'],
    ],
  );
});

test('fitCells：餐廳的 15 人看 fit15、2 月看營業時間；住宿的小孩看 allowed', () => {
  const week: Hours = { mon: [['11:00', '14:00']], tue: [], wed: [['11:00', '14:00']], thu: [['11:00', '14:00']], fri: [['11:00', '14:00']], sat: [['11:00', '14:00']], sun: [['11:00', '14:00']] };
  const r = placeWith({ group: { fit15: 'split' } }, { hours: week });
  const [, , feb, group] = fitCells(r);
  assert.deepEqual([feb.mark, feb.reason], ['○', '週二休']);
  assert.deepEqual([group.mark, group.reason], ['○', '15 人要分桌']);
  const l = placeWith({ kids: { allowed: 'age-limit' }, group: { maxGuests: 18, wholeRental: true } }, { type: 'lodging' });
  const cells = fitCells(l);
  assert.deepEqual([cells[1].mark, cells[1].reason], ['△', '有年齡限制']);
  assert.deepEqual([cells[2].mark, cells[2].reason], [null, null]);
  assert.deepEqual([cells[3].mark, cells[3].reason], [null, '包棟，最多 18 人']);
  // 旅程期間休業：2 月那格是 ✕／△
  const closed = placeWith({}, { hours: week, closures: [{ from: '2027-01-23', to: '2027-03-04', note: '改裝（TableCheck）' }] });
  assert.deepEqual([fitCells(closed)[2].mark, fitCells(closed)[2].reason], ['✕', '旅程期間都休：改裝']);
  assert.deepEqual(fitCells(placeWith({}, { type: 'station' })), []);
});

test('hoursLine：七天一樣寫每天、公休、分組、最後入場', () => {
  const day = [['09:30', '17:00']] as [string, string][];
  const all: Hours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day, holiday: day, lastEntry: '16:00', note: '黃金週延長' };
  assert.equal(hoursLine(all), '每天 09:30–17:00（最後入場 16:00）');
  const two = [['11:00', '14:00'], ['17:00', '20:00']] as [string, string][];
  assert.equal(hoursLine({ mon: two, tue: two, wed: [], thu: two, fri: two, sat: two, sun: two }), '週三休，其他 11:00–14:00、17:00–20:00');
  const wk = [['11:00', '15:00']] as [string, string][];
  const we = [['10:00', '16:00']] as [string, string][];
  assert.equal(hoursLine({ mon: [], tue: wk, wed: wk, thu: wk, fri: wk, sat: we, sun: we }), '週二～五 11:00–15:00；週六、日 10:00–16:00；週一休');
  assert.equal(hoursLine({ mon: wk, tue: wk, wed: null, thu: wk, fri: wk, sat: wk, sun: wk }), '週一、二、四～日 11:00–15:00；週三不明');
  assert.equal(hoursLine({ always: true }), '全天開放');
  assert.equal(hoursLine({ mon: null }), null);
  assert.equal(hoursLine(null), null);
});

test('yenAmounts、adultYen、childYen：只算錢，不算人數、歲數', () => {
  assert.deepEqual(yenAmounts('¥1,000～1,999'), [1000, 1999]);
  assert.deepEqual(yenAmounts('包棟每晚 110,000 円＋第 11 人起每人 6,600 円'), [110000, 6600]);
  assert.deepEqual(yenAmounts('15 人約 143,000 円'), [143000]);
  assert.deepEqual(yenAmounts('4 人以上 8,000 円'), [8000]);
  assert.equal(adultYen('2,800 円（團體 25 人以上 2,600 円）'), 2800);
  assert.equal(adultYen('800 日圓（18 歲以上）'), 800);
  assert.equal(adultYen('免費'), 0);
  assert.equal(adultYen('官方頁沒寫'), null);
  assert.equal(childYen('小中學生 1,600 円（團體 1,500 円）；幼兒（3 歲以上）800 円；未滿 3 歲免費'), 1600);
  assert.equal(childYen('幼兒（4 歲以上）600 円；小中學生 1,200 円'), 1200);
  assert.equal(childYen('免費'), 0);
});

test('priceLine：景點的這團估計＝11 位大人＋4 位小孩', () => {
  const aq = placeWith({ fares: { adult: '2,800 円（團體 25 人以上 2,600 円）', child: '小中學生 1,600 円（團體 1,500 円）；幼兒 800 円' } }, { type: 'spot' });
  assert.deepEqual(priceLine(aq), { text: '大人 2,800 円・小孩 1,600 円', estimate: '這團約 37,200 円' });
  assert.deepEqual(priceLine(placeWith({ fares: { adult: '免費', child: '免費' } }, { type: 'spot' })), { text: '免費', estimate: null });
  // 小孩價不知道：不估計
  assert.deepEqual(priceLine(placeWith({ admission: '大人 500 円' }, { type: 'spot' })), { text: '大人 500 円', estimate: null });
  assert.equal(priceLine(placeWith({}, { type: 'spot' })), null);
});

test('priceLine：餐廳、住宿用價位；一段每人的才乘 15', () => {
  assert.deepEqual(priceLine(placeWith({ priceRange: '¥2,400～5,500（官網菜單）' })), { text: '¥2,400～5,500', estimate: '15 人約 36,000～82,500 円' });
  assert.deepEqual(priceLine(placeWith({ priceRange: '午 ～¥999／晚 ¥1,000～1,999' })), { text: '午 ～¥999／晚 ¥1,000～1,999', estimate: null });
  assert.deepEqual(priceLine(placeWith({ priceRange: '包棟每晚 110,000 円（10 人以內）＋第 11 人起每人 6,600 円；15 人約 143,000 円' }, { type: 'lodging' })), {
    text: '包棟每晚 110,000 円＋第 11 人起每人 6,600 円',
    estimate: '15 人約 143,000 円／晚',
  });
  assert.deepEqual(priceLine(placeWith({ priceRange: '一泊二食每人約 18,700～27,500 円（2027-02 平日、4 名 1 室）' }, { type: 'lodging' })), {
    text: '一泊二食每人約 18,700～27,500 円',
    estimate: '15 人約 280,500～412,500 円／晚',
  });
  assert.deepEqual(priceLine(placeWith({ priceRange: '每人 8,000 円起（4 人以上、平日素泊）' }, { type: 'lodging' })), { text: '每人 8,000 円起', estimate: '15 人約 120,000 円 起／晚' });
});

test('tipLine：要預約、不能預約，否則缺點的第一句', () => {
  assert.equal(tipLine(placeWith({ reservation: { required: true, leadDays: 3 } })), '要預約（3 天前）');
  const s = { text: '', pros: [], cons: ['海獺要排隊（年底中午 40～70 分）；15 人要分組'] };
  assert.equal(tipLine(placeWith({ reservation: { accepted: 'no' } }, { summary: s })), '不能預約；海獺要排隊');
  assert.equal(tipLine(placeWith({}, { type: 'spot', summary: s })), '海獺要排隊');
  assert.equal(tipLine(placeWith()), null);
});

test('rowPrice（T76）：餐廳是價位第一段、住宿是每人價下限，包棟不寫', () => {
  const r = (priceRange: string, type: Place['type'] = 'restaurant') => rowPrice(placeWith({ priceRange }, { type }));
  assert.equal(r('午 ¥1,000～2,000／晚 ¥3,000～4,000'), '午 ¥1,000～2,000');
  assert.equal(r('～¥1,000'), '～¥1,000');
  assert.equal(r('每人約 15,020～19,250 円（依方案，含素泊／附早餐；詳見 prices）', 'lodging'), '每人 15,020 円起');
  assert.equal(r('一泊二食每人約 15,400～23,100 円（2027-02 平日、4 名 1 室）；團體方案每人 15,400 円起', 'lodging'), '每人 15,400 円起');
  assert.equal(r('每人 8,000 円起（4 人以上、平日素泊）；附 BBQ', 'lodging'), '每人 8,000 円起');
  assert.equal(r('每間（棟）約 19,000～30,000 円（詳見 prices）', 'lodging'), null);
  assert.equal(r('包棟每晚 110,000 円（10 人以內）＋第 11 人起每人 6,600 円', 'lodging'), null);
  assert.equal(rowPrice(placeWith({}, { type: 'lodging' })), null);
  assert.equal(r('¥500', 'spot'), null);
});
