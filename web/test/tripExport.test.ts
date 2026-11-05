// T35：下載行程（PDF、MD）的內容和排版；T73：沒排的天、空檔、末班、小時、備選、總覽去哪裡、預約一覽移到最後
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

test('錯過的話：12 班以內列規劃那班之後的全部；對不到規劃的那班才列當天全部', () => {
  const bus = ride({ mode: 'bus', line: '鷗巴士', operator: null, routeId: 'r1', tripId: 't2' });
  const m = missedOf(bus, deps(MISSED_ALL_MAX));
  assert.deepEqual(m, { kind: 'later', times: ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'] });
  assert.equal(missedText(m), '錯過的話還有：10:00 11:00 12:00 13:00 14:00 15:00 16:00 17:00 18:00');
  const unknown = missedOf({ ...bus, tripId: 'nope', depart: '05:00' }, deps(3));
  assert.deepEqual(unknown, { kind: 'all', times: ['07:00', '08:00', '09:00'] });
  assert.equal(missedText(unknown), '當天班次：07:00 08:00 09:00');
  assert.equal(missedOf({ ...bus, tripId: 'nope', depart: '05:00' }, deps(13)), null);
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

test('錯過的話：規劃的是末班（班次多、班次少都一樣）、班距型、沒有班次', () => {
  assert.deepEqual(missedOf(ride({ tripId: 't12' }), deps(13)), { kind: 'last' });
  assert.deepEqual(missedOf(ride({ mode: 'bus', operator: null, routeId: 'r1', tripId: 't8' }), deps(9)), { kind: 'last' });
  assert.equal(missedText({ kind: 'last' }), '這是末班，錯過就沒有車');
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
  placeWith({}, { id: 'mk', type: 'spot', name: { ja: 'ミキモト真珠島', zh: '御木本珍珠島（海女表演）', en: null }, area: 'toba', links: { googleMaps: 'https://maps.google.com/?cid=2' } }),
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
  nights: { '2027-02-02': { area: 'toba', lodging: 'inn' }, '2027-02-03': { area: 'toba', lodging: 'inn' } },
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
    { date: '2027-02-04', items: [] },
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
      start: '15:30',
      end: '16:30',
      waitMinutes: 60,
      mealTags: ['lunch'],
    }),
    entry({ itemId: 'v2', placeId: 'aq', travel: leg({ mode: 'taxi', depart: '16:30', arrive: '16:45', minutes: 15 }), arrive: '16:45', start: '16:45', end: '17:30' }),
    entry({ kind: 'lodging', placeId: 'inn', travel: leg({ mode: 'taxi', depart: '17:30', arrive: '17:50', minutes: 20 }), arrive: '17:50', start: '17:50', end: '17:50' }),
  ],
};
/** 有住宿、沒有任何點的一天：只有出發和回住宿 */
const DAY2: DayPlan = {
  ...DAY1,
  date: '2027-02-03',
  entries: [entry({ kind: 'start', placeId: 'inn', arrive: '09:30', start: '09:30', end: '09:30' }), entry({ kind: 'lodging', placeId: 'inn', arrive: '09:30', start: '09:30', end: '09:30' })],
};
const PLAN: ItineraryPlan = { days: [DAY1, DAY2, { ...DAY1, date: '2027-02-04', entries: [] }], warnings: [] };

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

test('整份：航班、總覽、交通的車次和特急券、空檔、預約狀態、備選、計程車、住宿；沒有點的那天沒有列', () => {
  const doc = build();
  assert.equal(doc.range, '2/2（二） ～ 2/4（四）');
  assert.deepEqual(doc.flights, [{ date: '2027-02-02', direction: 'arrive', flightNo: 'CI152', depart: '08:20', arrive: '11:55', airport: '關西機場', people: 8 }]);
  const d1 = doc.days[0];
  assert.equal(d1.area, '鳥羽');
  assert.equal(d1.note, '第一天輕鬆');
  assert.deepEqual(d1.places, ['海女小屋 相差', '鳥羽水族館']);
  const kinds = d1.rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['stop', 'leg', 'gap', 'stop', 'leg', 'stop', 'leg', 'stop']);
  const legRow = d1.rows[1];
  assert.ok(legRow.kind === 'leg');
  assert.equal(legRow.leg.title, '大眾運輸 2 小時 20 分');
  assert.equal(legRow.leg.note, '大件行李寄放');
  assert.deepEqual({ ...legRow.leg.rides[0], missed: null }, { mode: 'train', name: '近鐵特急', from: '大阪難波', to: '鳥羽站', depart: '12:30', arrive: '14:10', ticket: '特急券', missed: null });
  assert.deepEqual(d1.rows[2], { kind: 'gap', gap: { from: '14:30', to: '15:30', minutes: 60 } });
  const ama = d1.rows[3];
  assert.ok(ama.kind === 'stop');
  assert.deepEqual([ama.stop.time, ama.stop.reservation, ama.stop.meals, ama.stop.note, ama.stop.place?.ja, ama.stop.alternatives], ['15:30–16:30', '已訂', ['午餐'], '要脫鞋', '海女小屋', []]);
  const taxiLeg = d1.rows[4];
  assert.equal(taxiLeg.kind === 'leg' && taxiLeg.leg.taxi, null); // 台數不印（T74a）
  const aq = d1.rows[5];
  assert.ok(aq.kind === 'stop');
  assert.deepEqual([aq.stop.time, aq.stop.place?.name], ['16:45–17:30', '鳥羽水族館']);
  assert.deepEqual(aq.stop.alternatives, [{ name: '御木本珍珠島（海女表演）', ja: 'ミキモト真珠島', mapsUrl: 'https://maps.google.com/?cid=2' }]);
  // 回住宿那行不印日文名（住宿框已經有）
  const back = d1.rows[7];
  assert.ok(back.kind === 'stop' && back.stop.kind === 'lodging');
  assert.equal(back.stop.place?.ja, null);
  assert.deepEqual(d1.lodging, {
    place: { name: '鳥羽<旅館>', ja: '鳥羽の宿', mapsUrl: d1.lodging?.place.mapsUrl },
    address: '三重県鳥羽市1-1',
    phone: '0599-00-0000',
    checkIn: '15:00',
    meals: '一泊二食',
    reservation: '待訂',
  });
  // 有住宿、沒有任何點：不印出發和到住宿
  assert.deepEqual(doc.days[1].rows, []);
  assert.deepEqual(doc.days[1].places, []);
  assert.equal(doc.days[1].lodging?.place.name, '鳥羽<旅館>');
  assert.deepEqual(doc.days[2].rows, []);
});

test('MD：開頭的說明、總覽表有去哪裡、每天一段、特急券、錯過的話、空檔、備案、住宿、預約一覽在最後', () => {
  const md = exportMarkdown(build());
  assert.match(md, /^# 伊勢志摩・大阪 行程\n\n> 這是 15 人（長輩 5、小孩 4）家族旅行 2\/2（二） ～ 2\/4（四） 的行程，以網站為準。時間是規劃的，不是預約好的。\n/);
  assert.match(md, /第 12 版・1\/20 21:05 王小明 更新・2026-11-02 14:05 產生（日本時間）/);
  assert.match(md, /\| 日期 \| 地區 \| 去哪裡 \| 住宿 \|/);
  assert.match(md, /\| 2\/2（二） \| 鳥羽 \| 海女小屋 相差、鳥羽水族館 \| 鳥羽<旅館> \|/);
  assert.match(md, /\| 2\/3（三） \| 鳥羽 \| 還沒排 \| 鳥羽<旅館> \|/);
  assert.match(md, /- 2\/2（二） 抵達 關西機場：CI152 08:20 → 11:55（8 人）/);
  assert.match(md, /- \*\*11:55 抵達 關西機場（CI152）\*\*/);
  assert.match(md, /- ↓ 大眾運輸 2 小時 20 分（12:10 → 14:30）/);
  assert.match(md, /12:30 大阪難波 → 14:10 鳥羽站　近鐵特急　\*\*先買特急券\*\*/);
  assert.match(md, /錯過的話：/);
  assert.match(md, /- 14:30–15:30 空檔 1 小時\n- \*\*15:30–16:30 海女小屋 相差\*\*　海女小屋・午餐・預約：已訂　\[地圖\]\(https:\/\/maps.google.com\/\?cid=1\)/);
  assert.match(md, /\*\*16:45–17:30 鳥羽水族館\*\*[^\n]*\n  - 備案：御木本珍珠島（海女表演）　\[地圖\]\(https:\/\/maps.google.com\/\?cid=2\)/);
  assert.match(md, /\*\*17:50 到住宿 鳥羽<旅館>\*\*\n/);
  assert.doesNotMatch(md, /分組|集合/);
  assert.match(md, /- 入住 15:00・一泊二食・預約：待訂/);
  assert.match(md, /## 2\/3（三） 鳥羽\n\n還沒排\n\n\*\*住宿\*\*：/);
  assert.ok(md.indexOf('## 預約一覽') > md.indexOf('## 2/4（四）'));
});

test('每晚住哪一區（T45a）：移動日寫「鳥羽 → 志摩」，只定區的晚上寫「志摩（還沒選住宿）」', () => {
  const three: Itinerary = {
    ...ITIN,
    nights: { '2027-02-02': { area: 'toba', lodging: 'inn' }, '2027-02-03': { area: 'shima' } },
  };
  const doc = buildTripExport({
    itinerary: three,
    plan: { days: [DAY1, { ...DAY1, date: '2027-02-03', entries: [] }, { ...DAY1, date: '2027-02-04', entries: [] }], warnings: [] },
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
  assert.match(md, /\| 2\/3（三） \| 鳥羽 → 志摩 \| 還沒排 \| 志摩（還沒選住宿） \|/);
  assert.match(md, /## 2\/3（三） 鳥羽 → 志摩\n\n還沒排\n\n\*\*住宿\*\*：志摩（還沒選住宿）/);
  const html = exportHtml(doc);
  assert.match(html, /<td>鳥羽 → 志摩<\/td><td class="places empty">還沒排<\/td><td>志摩（還沒選住宿）<\/td>/);
  assert.match(html, /<div class="lodging"><div>今晚住<\/div><div class="n">志摩（還沒選住宿）<\/div><\/div>/);
});

test('HTML：總覽、一天一頁、預約一覽在最後一頁；跳脫特殊字元、頁尾版本；空檔、備案', () => {
  const html = exportHtml(build());
  assert.equal(html.match(/<section class="page">/g)?.length, 5);
  assert.ok(html.includes('鳥羽&lt;旅館&gt;'));
  assert.ok(!html.includes('鳥羽<旅館>'));
  assert.ok(html.includes('<span class="ticket">先買特急券</span>'));
  assert.ok(html.includes('<span class="r-pending">預約：待訂</span>'));
  assert.ok(html.includes('<div class="gap">14:30–15:30 空檔 1 小時</div>'));
  assert.ok(html.includes('<div class="m">備案：御木本珍珠島（海女表演）　<a href="https://maps.google.com/?cid=2">地圖</a></div>'));
  assert.ok(html.includes('<th>去哪裡</th>'));
  assert.ok(html.includes('<td class="places">海女小屋 相差、鳥羽水族館</td>'));
  assert.ok(html.includes('PDF 不會跟著行程更新'));
  assert.match(html, /<title>伊勢志摩・大阪 行程（第 12 版）<\/title>/);
  assert.ok(html.indexOf('<h2>預約一覽</h2>') > html.indexOf('2/4（四）'));
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
