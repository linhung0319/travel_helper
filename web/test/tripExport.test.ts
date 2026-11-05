// T35：下載行程（PDF、MD）的內容和排版
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayPlan, Itinerary, ItineraryPlan, Leg, RideDeparture, TimelineEntry, TransitRide } from '@travel-helper/engine';
import { buildTripExport, missedOf, MISSED_ALL_MAX, type ExportDoc } from '../src/lib/tripExport.ts';
import { exportHtml, exportMarkdown, missedText } from '../src/lib/tripExportFormat.ts';
import type { Area, Place } from '../src/data/types.ts';
import { placeWith } from './helpers.ts';

const ride = (over: Partial<TransitRide> = {}): TransitRide => ({
  mode: 'train',
  line: '特急（往賢島）',
  from: 'st-a',
  to: 'st-b',
  depart: '10:00',
  arrive: '10:40',
  tripId: 't3',
  operator: 'kintetsu',
  kind: 'timetable',
  ...over,
});

const deps = (n: number, line = '急行（往鳥羽）'): RideDeparture[] =>
  Array.from({ length: n }, (_, i) => ({ tripId: `t${i}`, line: i === 4 ? '特急（往賢島）' : line, depart: `${String(7 + i).padStart(2, '0')}:00`, arrive: `${String(7 + i).padStart(2, '0')}:40` }));

test('錯過的話：12 班以內列當天全部，標出規劃那班', () => {
  const m = missedOf(ride({ mode: 'bus', line: '鷗巴士', operator: null, routeId: 'r1', tripId: 't2' }), deps(MISSED_ALL_MAX));
  assert.equal(m?.kind, 'all');
  assert.equal(m.kind === 'all' && m.times.length, 12);
  assert.deepEqual(m.kind === 'all' && m.times.filter((t) => t.planned).map((t) => t.depart), ['09:00']);
  assert.equal(missedText(m)?.includes('【09:00】'), true);
});

test('錯過的話：超過 12 班只列規劃之後的兩班，近鐵帶車種', () => {
  const m = missedOf(ride({ tripId: 't2' }), deps(13));
  assert.deepEqual(m, {
    kind: 'next',
    trains: [
      { depart: '10:00', arrive: '10:40', kind: '急行' },
      { depart: '11:00', arrive: '11:40', kind: '特急' },
    ],
  });
  assert.equal(missedText(m), '錯過的話：10:00 急行（10:40 到）、11:00 特急（11:40 到）');
});

test('錯過的話：規劃的是末班、班距型、沒有班次', () => {
  assert.deepEqual(missedOf(ride({ tripId: 't12' }), deps(13)), { kind: 'last' });
  const hw = missedOf(ride({ kind: 'headway', headwayMin: 5, first: '05:30', last: '23:50', operator: 'Osaka Metro', line: '御堂筋線' }), []);
  assert.equal(hw?.kind, 'headway');
  assert.match(missedText(hw) ?? '', /約 5 分一班/);
  assert.deepEqual(missedOf(ride({ ifMissed: null }), []), { kind: 'last' });
  assert.equal(missedOf(ride(), []), null);
});

// --- 整份 -------------------------------------------------------------------

const PLACES: Place[] = [
  placeWith({}, { id: 'kix', type: 'station', name: { ja: '関西空港', zh: '關西機場', en: null } }),
  placeWith({}, { id: 'st-a', type: 'station', name: { ja: '大阪難波', zh: '', en: null } }),
  placeWith({}, { id: 'st-b', type: 'station', name: { ja: '鳥羽', zh: '鳥羽站', en: null } }),
  placeWith({ reservation: { accepted: 'yes' } }, { id: 'ama', name: { ja: '海女小屋', zh: '海女小屋 相差', en: null }, area: 'toba', links: { googleMaps: 'https://maps.google.com/?cid=1' } }),
  placeWith({}, { id: 'aq', type: 'spot', name: { ja: '鳥羽水族館', zh: '鳥羽水族館', en: null }, area: 'toba' }),
  placeWith({}, { id: 'mk', type: 'spot', name: { ja: 'ミキモト真珠島', zh: '御木本珍珠島', en: null }, area: 'toba' }),
  placeWith(
    { address: '三重県鳥羽市1-1', checkIn: '15:00', meals: 'dinner+breakfast', reservation: { accepted: 'yes', phone: '0599-00-0000' } },
    { id: 'inn', type: 'lodging', name: { ja: '鳥羽の宿', zh: '鳥羽<旅館>', en: null }, area: 'toba' },
  ),
];
const byId = new Map(PLACES.map((p) => [p.id, p]));
const AREAS = [{ id: 'toba', name: { ja: '鳥羽', zh: '鳥羽' }, center: [136.8, 34.5], bbox: [0, 0, 0, 0] }] as Area[];

const ITIN: Itinerary = {
  format: 'itinerary-v1',
  party: { size: 15, elders: 5, kids: 4 },
  nights: { '2027-02-02': { area: 'toba', lodging: 'inn' } },
  days: [
    {
      date: '2027-02-02',
      note: '第一天輕鬆',
      items: [
        { id: 'f1', type: 'flight', direction: 'arrive', airport: 'kix', depart: '08:20', arrive: '11:55', flightNo: 'CI152', people: 8 },
        { id: 'v1', type: 'visit', options: [{ place: 'ama' }], selected: 0, note: '要脫鞋', travel: { note: '大件行李寄放' } },
        { id: 'v2', type: 'visit', options: [{ place: 'aq' }, { place: 'mk' }], selected: 0 },
      ],
    },
    { date: '2027-02-03', items: [] },
  ],
};

const leg = (over: Partial<Leg>): Leg => ({ mode: 'walk', from: null, to: null, depart: '00:00', arrive: '00:00', minutes: 0, walkMinutes: 0, waitMinutes: 0, rides: [], specified: false, basis: '', ...over });
const entry = (over: Partial<TimelineEntry>): TimelineEntry => ({ kind: 'visit', itemId: null, placeId: null, travel: null, arrive: '', start: '', end: '', waitMinutes: 0, ...over });

const TRAIN = ride({ from: 'st-a', to: 'st-b', depart: '12:30', arrive: '14:10', tripId: 't5' });
const DAY1: DayPlan = {
  date: '2027-02-02',
  gaps: [],
  warnings: [],
  stats: { walkMinutes: 0, mainSpots: 0, returnTime: null, tiring: false, freeMinutes: 0 },
  entries: [
    entry({ kind: 'flight', itemId: 'f1', placeId: 'kix', arrive: '11:55', start: '11:55', end: '12:10' }),
    entry({
      itemId: 'v1',
      placeId: 'ama',
      travel: leg({ mode: 'transit', depart: '12:10', arrive: '14:30', minutes: 140, rides: [TRAIN], walkBefore: 10, walkAfter: 20 }),
      arrive: '14:30',
      start: '14:30',
      end: '15:30',
      mealTags: ['lunch'],
    }),
    entry({ itemId: 'v2', placeId: 'aq', travel: leg({ mode: 'taxi', depart: '15:30', arrive: '15:45', minutes: 15, taxi: { cars: 2, jumboCars: 1, fareFromYen: null, fareEstimateYen: null, note: '' } }), arrive: '15:45', start: '15:45', end: '16:30' }),
    entry({ kind: 'lodging', placeId: 'inn', travel: leg({ mode: 'taxi', depart: '16:30', arrive: '16:50', minutes: 20 }), arrive: '16:50', start: '16:50', end: '16:50' }),
  ],
};
const PLAN: ItineraryPlan = { days: [DAY1, { ...DAY1, date: '2027-02-03', entries: [] }], warnings: [] };

function build(): ExportDoc {
  return buildTripExport({
    itinerary: ITIN,
    plan: PLAN,
    byId,
    fullOf: (id) => byId.get(id) ?? null,
    areas: AREAS,
    reservations: [{ date: '2027-02-02', placeId: 'ama', status: 'booked', note: null, nights: null, updatedBy: 'u', updatedAt: '' }],
    departures: () => deps(13),
    version: 12,
    updated: '1/20 21:05 王小明 更新',
    generatedAt: '2026-11-02 14:05',
  });
}

test('整份：航班、總覽、交通的車次和特急券、預約狀態、計程車、住宿', () => {
  const doc = build();
  assert.equal(doc.range, '2/2（二） ～ 2/3（三）');
  assert.deepEqual(doc.flights, [{ date: '2027-02-02', direction: 'arrive', flightNo: 'CI152', depart: '08:20', arrive: '11:55', airport: '關西機場', people: 8 }]);
  const d1 = doc.days[0];
  assert.equal(d1.area, '鳥羽');
  assert.equal(d1.note, '第一天輕鬆');
  const kinds = d1.rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['stop', 'leg', 'stop', 'leg', 'stop', 'leg', 'stop']);
  const legRow = d1.rows[1];
  assert.ok(legRow.kind === 'leg');
  assert.equal(legRow.leg.title, '大眾運輸 140 分');
  assert.equal(legRow.leg.note, '大件行李寄放');
  assert.deepEqual({ ...legRow.leg.rides[0], missed: null }, { mode: 'train', name: '近鐵特急', from: '大阪難波', to: '鳥羽站', depart: '12:30', arrive: '14:10', ticket: '特急券', missed: null });
  const ama = d1.rows[2];
  assert.ok(ama.kind === 'stop');
  assert.deepEqual([ama.stop.time, ama.stop.reservation, ama.stop.meals, ama.stop.note, ama.stop.place?.ja], ['14:30–15:30', '已訂', ['午餐'], '要脫鞋', '海女小屋']);
  const taxiLeg = d1.rows[3];
  assert.equal(taxiLeg.kind === 'leg' && taxiLeg.leg.taxi, '大型 1 台或一般 2 台');
  const aq = d1.rows[4];
  assert.deepEqual(aq.kind === 'stop' && [aq.stop.time, aq.stop.place?.name], ['15:45–16:30', '鳥羽水族館']);
  assert.deepEqual(d1.lodging, {
    place: { name: '鳥羽<旅館>', ja: '鳥羽の宿', mapsUrl: d1.lodging?.place.mapsUrl },
    address: '三重県鳥羽市1-1',
    phone: '0599-00-0000',
    checkIn: '15:00',
    meals: '一泊二食',
    reservation: '待訂',
  });
  assert.deepEqual(doc.days[1].rows, []);
});

test('MD：總覽表、每天一段、特急券、錯過的話、住宿', () => {
  const md = exportMarkdown(build());
  assert.match(md, /^# 伊勢志摩・大阪 行程\n/);
  assert.match(md, /第 12 版・1\/20 21:05 王小明 更新・2026-11-02 14:05 產生（日本時間）/);
  assert.match(md, /\| 2\/2（二） \| 鳥羽 \| 鳥羽<旅館> \|/);
  assert.match(md, /- 2\/2（二） 抵達 關西機場：CI152 08:20 → 11:55（8 人）/);
  assert.match(md, /- \*\*11:55 抵達 關西機場（CI152）\*\*/);
  assert.match(md, /12:30 大阪難波 → 14:10 鳥羽站　近鐵特急　\*\*先買特急券\*\*/);
  assert.match(md, /錯過的話：/);
  assert.match(md, /\*\*14:30–15:30 海女小屋 相差\*\*　海女小屋・午餐・預約：已訂　\[地圖\]\(https:\/\/maps.google.com\/\?cid=1\)/);
  assert.match(md, /\*\*15:45–16:30 鳥羽水族館\*\*/);
  assert.doesNotMatch(md, /分組|集合/);
  assert.match(md, /- 入住 15:00・一泊二食・預約：待訂/);
  assert.match(md, /## 2\/3（三） 鳥羽\n\n還沒排/);
});

test('每晚住哪一區（T45a）：移動日寫「鳥羽 → 志摩」，只定區的晚上寫「志摩（還沒選住宿）」', () => {
  const three: Itinerary = {
    ...ITIN,
    nights: { ...ITIN.nights, '2027-02-03': { area: 'shima' } },
    days: [...ITIN.days, { date: '2027-02-04', items: [] }],
  };
  const doc = buildTripExport({
    itinerary: three,
    plan: { days: [...PLAN.days, { ...DAY1, date: '2027-02-04', entries: [] }], warnings: [] },
    byId,
    fullOf: (id) => byId.get(id) ?? null,
    areas: [...AREAS, { id: 'shima', name: { ja: '志摩', zh: '志摩' }, center: [136.8, 34.3], bbox: [0, 0, 0, 0] }] as Area[],
    reservations: [],
    departures: () => deps(13),
    version: 12,
    updated: '1/20 21:05 王小明 更新',
    generatedAt: '2026-11-02 14:05',
  });
  assert.deepEqual(
    doc.days.map((d) => [d.area, d.lodging?.place.name ?? null, d.stayArea]),
    [
      ['鳥羽', '鳥羽<旅館>', null],
      ['鳥羽 → 志摩', null, '志摩'],
      // 最後一天沒有晚上：用前一晚的區
      ['志摩', null, null],
    ],
  );
  const md = exportMarkdown(doc);
  assert.match(md, /\| 2\/3（三） \| 鳥羽 → 志摩 \| 志摩（還沒選住宿） \|/);
  assert.match(md, /## 2\/3（三） 鳥羽 → 志摩\n\n還沒排\n\n\*\*住宿\*\*：志摩（還沒選住宿）/);
  const html = exportHtml(doc);
  assert.match(html, /<td>鳥羽 → 志摩<\/td><td>志摩（還沒選住宿）<\/td>/);
  assert.match(html, /<div class="lodging"><div>今晚住<\/div><div class="n">志摩（還沒選住宿）<\/div><\/div>/);
});

test('HTML：一天一頁、跳脫特殊字元、頁尾版本', () => {
  const html = exportHtml(build());
  assert.equal(html.match(/<section class="page">/g)?.length, 4);
  assert.ok(html.includes('鳥羽&lt;旅館&gt;'));
  assert.ok(!html.includes('鳥羽<旅館>'));
  assert.ok(html.includes('<span class="ticket">先買特急券</span>'));
  assert.ok(html.includes('<span class="r-pending">預約：待訂</span>'));
  assert.ok(html.includes('PDF 不會跟著行程更新'));
  assert.match(html, /<title>伊勢志摩・大阪 行程（第 12 版）<\/title>/);
});

test('預約一覽：說明、下載時間、狀態（§17.6）', () => {
  const doc = build();
  assert.ok(doc.reservations.some((r) => r.status === '已訂'));
  const md = exportMarkdown(doc);
  assert.ok(md.includes('## 預約一覽'));
  assert.ok(md.includes('這是家人的筆記，網站不會幫忙訂'));
  assert.ok(md.includes('2026-11-02 14:05 下載'));
  const html = exportHtml(doc);
  assert.ok(html.includes('<h2>預約一覽</h2>'));
  assert.ok(html.includes('這是家人的筆記，網站不會幫忙訂'));
  assert.ok(html.includes('2026-11-02 14:05 下載'));
  // 沒有要預約的：不放這一頁
  const none = { ...doc, reservations: [] };
  assert.ok(!exportMarkdown(none).includes('預約一覽'));
  assert.ok(!exportHtml(none).includes('預約一覽'));
});
