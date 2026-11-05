// 行程摘要（T34）：時間軸 → 摘要 → LINE 的文字
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem,
  buildTripSummary,
  createItinerary,
  formatDay,
  formatNow,
  formatReservations,
  formatTrip,
  jstNow,
  planItinerary,
  setLodging,
  tripRange,
  type DayPlan,
  type Itinerary,
  type ItineraryPlan,
  type TimelineEntry,
  type TripSummary,
} from '../src/index.ts';
import { at, fake, lodging, spot } from './synthetic.ts';

const NAMES: Record<string, string> = { h: '海邊旅館', a: '伊勢神宮', b: '托福橫丁', kix: '關西機場', st: '鳥羽站' };
const nameOf = (id: string) => NAMES[id] ?? null;

const entry = (kind: TimelineEntry['kind'], placeId: string | null, start: string, end = start, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  kind,
  itemId: null,
  placeId,
  travel: null,
  arrive: start,
  start,
  end,
  waitMinutes: 0,
  ...extra,
});

const dayPlan = (date: string, entries: TimelineEntry[]): DayPlan => ({
  date,
  entries,
  gaps: [],
  warnings: [],
  stats: { walkMinutes: 0, mainSpots: 0, returnTime: null, tiring: false, freeMinutes: 0 },
});

test('引擎算出的時間軸：每個造訪一行，最後一行是住哪', () => {
  const D = '2027-02-05';
  let it = createItinerary();
  it = setLodging(it, '2027-02-04', 'h');
  it = setLodging(it, D, 'h');
  it = addItem(it, D, { type: 'visit', options: [{ place: 'a' }] }).itinerary;
  it = addItem(it, D, { type: 'visit', options: [{ place: 'b' }] }).itinerary;
  const plan = planItinerary(it, fake([lodging('h', at(0)), spot('a', at(400)), spot('b', at(800))]));
  const s = buildTripSummary({ itinerary: it, plan, nameOf });
  const day = s.days.find((d) => d.date === D)!;
  assert.deepEqual(
    day.lines.map((l) => l.text),
    ['伊勢神宮', '托福橫丁'],
  );
  assert.equal(day.lodging, '海邊旅館');
  const text = formatDay(day);
  assert.match(text, /^2\/5（五）\n\d\d:\d\d-\d\d:\d\d 伊勢神宮\n\d\d:\d\d-\d\d:\d\d 托福橫丁\n住：海邊旅館$/);
  // 還沒排的日子
  assert.equal(formatDay(s.days.find((d) => d.date === '2027-02-08')!), '2/8（一）\n還沒排');
  assert.equal(tripRange(s), '2/2～2/13');
});

const it2 = (): Itinerary => ({
  format: createItinerary().format,
  party: { size: 15, elders: 5, kids: 4 },
  nights: { '2027-02-02': { lodging: 'h' } },
  days: [
    {
      date: '2027-02-02',
      items: [{ id: 'f1', type: 'flight', direction: 'arrive', airport: 'kix', depart: '08:20', arrive: '11:55', flightNo: 'CI152' }],
    },
    { date: '2027-02-03', items: [] },
  ],
});

test('航班、自由時間；最後一天不寫住', () => {
  const plan: ItineraryPlan = {
    warnings: [],
    days: [
      dayPlan('2027-02-02', [entry('flight', 'kix', '11:55', '12:55', { itemId: 'f1' }), entry('visit', 'a', '15:00', '16:00'), entry('lodging', 'h', '18:00')]),
      dayPlan('2027-02-03', [
        entry('start', 'h', '09:30'),
        entry('visit', 'a', '10:00', '12:00'),
        entry('free', null, '12:30', '14:00'),
        entry('visit', 'b', '15:30', '17:00'),
      ]),
    ],
  };
  const s = buildTripSummary({ itinerary: it2(), plan, nameOf });
  assert.equal(formatDay(s.days[0]), '2/2（二）\n11:55 抵達 關西機場（CI152）\n15:00-16:00 伊勢神宮\n住：海邊旅館');
  // 最後一天沒有晚上，不寫「住：」
  assert.equal(formatDay(s.days[1]), '2/3（三）\n10:00-12:00 伊勢神宮\n12:30-14:00 自由時間\n15:30-17:00 托福橫丁');
  assert.equal(formatTrip(s), `${formatDay(s.days[0])}\n\n${formatDay(s.days[1])}`);
});

const SUMMARY: TripSummary = {
  days: [
    {
      date: '2027-02-03',
      lodging: '海邊旅館',
      lines: [
        { start: '10:00', end: '12:00', text: '伊勢神宮' },
        { start: '12:00', end: '13:00', text: '海女小屋' },
        { start: '15:30', end: '17:00', text: '托福橫丁' },
      ],
    },
  ],
  reservations: [
    { date: '2027-02-03', placeId: 'r', name: '海女小屋', time: '12:00', endDate: null },
    { date: '2027-02-02', placeId: 'h', name: '海邊旅館', time: null, endDate: '2027-02-04' },
  ],
};

test('現在、下一個', () => {
  assert.equal(
    formatNow(SUMMARY, { date: '2027-02-03', time: '11:00' }),
    '現在 11:00（2/3（三））\n進行中：10:00-12:00 伊勢神宮\n下一個：12:00-13:00 海女小屋\n住：海邊旅館',
  );
  assert.equal(formatNow(SUMMARY, { date: '2027-02-03', time: '16:00' }), '現在 16:00（2/3（三））\n進行中：15:30-17:00 托福橫丁\n住：海邊旅館');
  assert.equal(formatNow(SUMMARY, { date: '2027-02-03', time: '18:00' }), '現在 18:00（2/3（三））\n今天的行程都結束了\n住：海邊旅館');
  assert.equal(formatNow(SUMMARY, { date: '2026-11-02', time: '18:00' }), null);
});

test('預約狀態：讀最新的筆記，沒有的是還沒訂；住宿在入住～退房前一晚都列', () => {
  const saved = [{ date: '2027-02-03', placeId: 'r', status: 'booked' as const, note: '15 人、電話訂' }];
  assert.equal(formatReservations(SUMMARY, '2027-02-03', saved), '2/3（三）的預約\n12:00 海女小屋：已訂（15 人、電話訂）\n住 2/2～2/4 海邊旅館：還沒訂\n※ 這是大家的筆記，網站不會幫忙訂。還沒訂的要自己打電話或上網訂，訂好後到網站改成「已訂」。');
  assert.equal(formatReservations(SUMMARY, null, []), '整趟的預約\n2/3 12:00 海女小屋：還沒訂\n住 2/2～2/4 海邊旅館：還沒訂\n※ 這是大家的筆記，網站不會幫忙訂。還沒訂的要自己打電話或上網訂，訂好後到網站改成「已訂」。');
  assert.equal(formatReservations(SUMMARY, '2027-02-05', []), '2/5（五）的預約\n沒有要預約的');
});

test('jstNow：UTC 加 9 小時', () => {
  assert.deepEqual(jstNow(Date.UTC(2027, 1, 4, 15, 30)), { date: '2027-02-05', time: '00:30', weekday: '五' });
});
