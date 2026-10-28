// 交通卡的純函式（T29c spec §8.2～§8.8）：數字用 spec §7.8 五段真實資料（引擎 2026-10-28 算出的 Leg）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayPlan, EngineWarning, Leg, RideDeparture, TimelineEntry, TransitRide } from '@travel-helper/engine';
import {
  compactSteps,
  departureCells,
  firstCellIndex,
  infoLines,
  legChips,
  legHidden,
  legWarnings,
  missBadge,
  pathRows,
  rideShortName,
  specAfterPickPath,
  slackHint,
  ticketTightText,
  warnCount,
  type DepartureCell,
} from '../src/lib/legView.ts';

const NAMES: Record<string, string> = {
  iseshi: '伊勢市',
  toba: '鳥羽',
  'nankai-namba': 'なんば',
  'osaka-namba': '大阪難波',
  ugata: '鵜方',
  'kansai-airport': '関西空港',
  'jr-shin-imamiya': '新今宮',
  'jr-osakajokoen': '大阪城公園',
  kashikojima: '賢島',
};
const nameOf = (id: string) => NAMES[id] ?? id;

const base = { walkMinutes: 0, waitMinutes: 0, transitAvailable: true, taxi: null, specified: true, basis: '' };

// 伊勢市 8:00 → 中之郷（2/5）
const iseRide0: TransitRide = {
  mode: 'train',
  line: '特急（往賢島）',
  from: 'iseshi',
  to: 'toba',
  depart: '08:11',
  arrive: '08:26',
  tripId: '1-4056',
  fareAdult: null,
  routeId: null,
  kind: 'timetable',
  headwayMin: null,
  first: null,
  last: null,
  operator: 'kintetsu',
  ifMissed: { depart: '08:16', arrive: '10:03', lateMinutes: 78 },
};
const iseRide1: TransitRide = {
  mode: 'bus',
  line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）',
  from: '鳥羽バスセンター',
  to: '百五銀行鳥羽支店前',
  depart: '08:30',
  arrive: '08:42',
  tripId: '2平日_08時30分_系統151004',
  fareAdult: 200,
  routeId: 'kamome-5-kuzaki',
  kind: 'timetable',
  headwayMin: null,
  first: null,
  last: null,
  operator: '鳥羽市（かもめバス）',
  ifMissed: { depart: '09:48', arrive: '10:03', lateMinutes: 78 },
};
const iseLeg: Leg = {
  ...base,
  mode: 'train',
  from: 'iseshi',
  to: 'nakanogo',
  depart: '08:00',
  arrive: '08:45',
  minutes: 45,
  walkMinutes: 6,
  waitMinutes: 11,
  rides: [iseRide0, iseRide1],
  walkBefore: 0,
  walkAfter: 3,
  ready: ['08:00', '08:29'],
  transfers: [{ walkMinutes: 3, elevator: null, elevatorWalkMinutes: null, note: null }],
};

// 關西機場 14:35 → 鵜方（2/2，第一天南下；§8.6 改完後難波留 10 分）
const NAMBA_NOTE = 'walkMin 11 是近鐵官方「月台中央 → 東改札口 → 南海なんば駅」…';
const southLeg: Leg = {
  ...base,
  mode: 'train',
  from: 'kansai-airport',
  to: 'ugata',
  depart: '14:35',
  arrive: '18:35',
  minutes: 240,
  walkMinutes: 16,
  waitMinutes: 23,
  rides: [
    {
      mode: 'train',
      line: '南海 機場急行',
      from: 'kansai-airport',
      to: 'nankai-namba',
      depart: '14:58',
      arrive: '15:44',
      tripId: null,
      fareAdult: null,
      routeId: 'nankai-airport-express',
      kind: 'headway',
      headwayMin: 15,
      first: '05:45',
      last: '23:02',
      operator: '南海電鉄',
      ifMissed: null,
    },
    {
      mode: 'train',
      line: '特急（往賢島）',
      from: 'osaka-namba',
      to: 'ugata',
      depart: '16:10',
      arrive: '18:35',
      tripId: '1-382',
      fareAdult: null,
      routeId: null,
      kind: 'timetable',
      headwayMin: null,
      first: null,
      last: null,
      operator: 'kintetsu',
      ifMissed: null,
    },
  ],
  walkBefore: 0,
  walkAfter: 0,
  ready: ['14:35', '16:00'],
  transfers: [{ walkMinutes: 16, elevator: true, elevatorWalkMinutes: 24, note: NAMBA_NOTE }],
};

// 通天閣 10:00 → SAN-OBP（2/12，大阪環狀線，班距型）
const loopLeg: Leg = {
  ...base,
  mode: 'train',
  from: 'osaka-tsutenkaku',
  to: 'osaka-dynamic-kitchen-san-obp',
  depart: '10:00',
  arrive: '10:45',
  minutes: 45,
  walkMinutes: 26,
  waitMinutes: 4,
  rides: [
    {
      mode: 'train',
      line: '大阪環狀線',
      from: 'jr-shin-imamiya',
      to: 'jr-osakajokoen',
      depart: '10:15',
      arrive: '10:30',
      tripId: null,
      fareAdult: null,
      routeId: 'jr-osaka-loop',
      kind: 'headway',
      headwayMin: 4,
      first: '05:15',
      last: '23:48',
      operator: 'JR西日本',
      ifMissed: { depart: '10:19', arrive: '10:49', lateMinutes: 4 },
    },
  ],
  walkBefore: 11,
  walkAfter: 15,
  ready: ['10:11'],
  transfers: [],
};

// 鳥羽 10:00 → 賢島（2/5）
const kashikoLeg: Leg = {
  ...base,
  mode: 'train',
  from: 'toba',
  to: 'kashikojima',
  depart: '10:00',
  arrive: '10:39',
  minutes: 39,
  waitMinutes: 10,
  rides: [{ ...iseRide0, from: 'toba', to: 'kashikojima', depart: '10:10', arrive: '10:39', tripId: '1-1077', ifMissed: { depart: '10:29', arrive: '11:08', lateMinutes: 29 } }],
  walkBefore: 0,
  walkAfter: 0,
  ready: ['10:00'],
  transfers: [],
};

// 伊勢市 10:00 → 朝熊（計程車）
const TAXI_NOTE = '15 人：一般計程車 4 台，或大型計程車（9 人座）2 台；每台起跳 700 円（大型 840 円），加算費率未查';
const taxiLeg: Leg = {
  ...base,
  mode: 'taxi',
  from: 'iseshi',
  to: 'asama',
  depart: '10:00',
  arrive: '10:13',
  minutes: 13,
  rides: [],
  specified: false,
  taxi: { cars: 4, jumboCars: 2, fareFromYen: 700, fareEstimateYen: null, note: TAXI_NOTE },
};
const taxiWarnings: EngineWarning[] = [
  { code: 'long-wait', level: 'info', message: '電車要等 39 分，改搭計程車', itemId: 'v-asama', leg: true },
  { code: 'taxi', level: 'info', message: TAXI_NOTE, itemId: 'v-asama', leg: true },
];

// 只有 rides 的舊資料（沒有 ready、transfers、walkBefore、ifMissed）
const bareLeg: Leg = {
  ...base,
  mode: 'train',
  from: 'iseshi',
  to: 'nakanogo',
  depart: '08:00',
  arrive: '08:45',
  minutes: 45,
  rides: [
    { mode: 'train', line: '特急（往賢島）', from: 'iseshi', to: 'toba', depart: '08:11', arrive: '08:26' },
    { mode: 'bus', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）', from: '鳥羽バスセンター', to: '百五銀行鳥羽支店前', depart: '08:30', arrive: '08:42' },
  ],
};

// --- 短名稱、膠囊 ---------------------------------------------------------------

test('rideShortName：近鐵寫車種、巴士寫路線簡稱、班距型寫業者簡稱＋線名', () => {
  assert.equal(rideShortName(iseRide0), '近鐵特急');
  assert.equal(rideShortName({ ...iseRide0, line: '普通（往鳥羽）' }), '近鐵普通');
  assert.equal(rideShortName({ ...iseRide0, line: '快速急行（往大阪難波）' }), '近鐵快速急行');
  assert.equal(rideShortName({ ...iseRide0, line: 'しまかぜ（往賢島）' }), '近鐵しまかぜ');
  assert.equal(rideShortName(iseRide1), '鷗巴士 5 號');
  assert.equal(rideShortName({ ...iseRide1, line: '伊勢鳥羽線（經二見）（往鳥羽バスセンター）', operator: '三重交通', routeId: 'sanco-ise-toba' }), '伊勢鳥羽線');
  assert.equal(rideShortName({ ...iseRide1, mode: 'train', line: 'JR 參宮線（伊勢市～鳥羽）（往鳥羽）', operator: 'JR 東海', routeId: 'jr-toba' }), 'JR 參宮線');
  assert.equal(rideShortName({ ...iseRide1, mode: 'ferry', line: '鳥羽市營定期船 神島航線（往神島）', operator: '鳥羽市営定期船' }), '鳥羽市營定期船 神島航線');
  assert.equal(rideShortName(loopLeg.rides[0]), 'JR 環狀線');
  assert.equal(rideShortName(southLeg.rides[0]), '南海 機場急行');
  assert.equal(rideShortName({ ...loopLeg.rides[0], line: '御堂筋線', operator: 'Osaka Metro', routeId: 'metro-midosuji' }), '地鐵 御堂筋線');
  assert.equal(rideShortName({ ...loopLeg.rides[0], line: '近鐵 難波線（大阪難波～鶴橋）', operator: '近畿日本鉄道' }), '近鐵 難波線');
  // 路線檔的名稱有給就用它（不管 line 寫什麼）
  assert.equal(rideShortName({ ...iseRide1, line: '?' }, (id) => (id === 'kamome-5-kuzaki' ? '鷗巴士 5 號 鳥羽～國崎線（經相差）' : null)), '鷗巴士 5 號');
  // 對不上的：line 去掉括號
  assert.equal(rideShortName({ mode: 'bus', line: '某某線（往某處）', from: 'a', to: 'b', depart: '10:00', arrive: '10:10' }), '某某線');
});

test('legChips：每一程一顆膠囊，中間寫換車站', () => {
  assert.deepEqual(legChips(iseLeg, nameOf), {
    rides: [
      { mode: 'train', name: '近鐵特急' },
      { mode: 'bus', name: '鷗巴士 5 號' },
    ],
    stops: ['鳥羽'],
  });
  assert.deepEqual(legChips(southLeg, nameOf), {
    rides: [
      { mode: 'train', name: '南海 機場急行' },
      { mode: 'train', name: '近鐵特急' },
    ],
    stops: ['なんば'],
  });
  assert.deepEqual(legChips(loopLeg, nameOf), { rides: [{ mode: 'train', name: 'JR 環狀線' }], stops: [] });
  assert.deepEqual(legChips(taxiLeg, nameOf), { rides: [], stops: [] });
});

// --- 警告 ---------------------------------------------------------------------

const entry = (kind: TimelineEntry['kind'], itemId: string | null): TimelineEntry => ({
  kind,
  itemId,
  placeId: null,
  travel: null,
  arrive: '10:00',
  start: '10:00',
  end: '11:00',
  waitMinutes: 0,
});
const dayWith = (warnings: EngineWarning[]): DayPlan => ({
  date: '2027-02-05',
  entries: [],
  gaps: [],
  warnings,
  stats: { walkMinutes: 0, mainSpots: 0, returnTime: null, tiring: false, freeMinutes: 0 },
});

test('legWarnings：只取這段交通的（leg: true），回住宿那段取沒有 itemId 的；照等級排', () => {
  const ws: EngineWarning[] = [
    { code: 'long-wait', level: 'info', message: '等很久', itemId: 'v1', leg: true },
    { code: 'closed', level: 'error', message: '公休', itemId: 'v1' },
    { code: 'bus-crowd', level: 'warning', message: '巴士擠', itemId: 'v1', leg: true },
    { code: 'missed-last', level: 'error', message: '沒車', itemId: 'v1', leg: true },
    { code: 'bus-crowd', level: 'warning', message: '別段', itemId: 'v2', leg: true },
    { code: 'ticket-tight', level: 'warning', message: '回住宿太趕', leg: true },
    { code: 'walk-total', level: 'warning', message: '整天' },
  ];
  const day = dayWith(ws);
  assert.deepEqual(
    legWarnings(day, entry('visit', 'v1')).map((w) => w.message),
    ['沒車', '巴士擠', '等很久'],
  );
  assert.deepEqual(
    legWarnings(day, entry('lodging', null)).map((w) => w.message),
    ['回住宿太趕'],
  );
  assert.deepEqual(legWarnings(day, entry('visit', 'v9')), []);
  assert.deepEqual(legWarnings(day, entry('start', null)), []);
});

test('legHidden：不用移動、0 分沒搭車的藏起來；交通未定（缺座標，引擎給 unknown 0 分）或有警告的不藏；使用者設定過的不藏', () => {
  const plain = { ...base, from: 'a', to: 'b', depart: '10:00', arrive: '10:00', rides: [], specified: false } as unknown as Leg;
  assert.equal(legHidden({ ...plain, mode: 'none', minutes: 0 }, false, []), true);
  assert.equal(legHidden({ ...plain, mode: 'walk', minutes: 0 }, false, []), true);
  assert.equal(legHidden({ ...plain, mode: 'walk', minutes: 0 }, true, []), false);
  // 引擎 autoLeg 缺座標：mode unknown、0 分、沒有班次，travel-unknown 錯誤標了 leg: true（資料卡不顯示）→ 不能藏
  const unknown = { ...plain, mode: 'unknown', minutes: 0 } as Leg;
  const err: EngineWarning = { code: 'travel-unknown', level: 'error', message: '缺座標，算不出交通時間', itemId: 'v1', leg: true };
  assert.equal(legHidden(unknown, false, [err]), false);
  assert.equal(legHidden(unknown, false, []), false);
  assert.equal(legHidden({ ...plain, mode: 'walk', minutes: 0 }, false, [err]), false);
  assert.equal(legHidden(null, false, []), true);
});

test('warnCount：只數 error、warning', () => {
  assert.equal(warnCount([{ code: 'bus-crowd', level: 'warning', message: '' }, { code: 'transfer-walk', level: 'info', message: '' }, { code: 'x', level: 'error', message: '' }]), 2);
  assert.equal(warnCount([{ code: 'long-wait', level: 'info', message: '' }]), 0);
  assert.equal(warnCount([]), 0);
});

test('infoLines：警告文字（ticket-tight、taxi 不放）、計程車起跳價、可以多待', () => {
  assert.deepEqual(infoLines(taxiLeg, taxiWarnings, null), ['電車要等 39 分，改搭計程車', '每台起跳 700 円（大型 840 円）']);
  // note 裡沒有大型的價錢：只寫一般的；起跳價 null 不寫
  assert.deepEqual(infoLines({ ...taxiLeg, taxi: { ...taxiLeg.taxi!, note: '15 人' } }, [], null), ['每台起跳 700 円']);
  assert.deepEqual(infoLines({ ...taxiLeg, taxi: { ...taxiLeg.taxi!, fareFromYen: null } }, [], null), []);
  const ws: EngineWarning[] = [
    { code: 'transfer-walk', level: 'info', message: '轉乘要走 16 分', leg: true },
    { code: 'ticket-tight', level: 'warning', message: '大阪難波到站 3 分就發車，買特急券可能來不及', leg: true },
    { code: 'bus-crowd', level: 'warning', message: '路線巴士不能預約，15 人可能擠不上同一班', leg: true },
  ];
  assert.deepEqual(infoLines(southLeg, ws, '前一站多待 5 分，一樣搭 16:10'), [
    '路線巴士不能預約，15 人可能擠不上同一班',
    '轉乘要走 16 分',
    '前一站多待 5 分，一樣搭 16:10',
  ]);
  assert.deepEqual(infoLines(iseLeg, [], null), []);
});

// --- 錯過的話 -------------------------------------------------------------------

test('missBadge：照 spec §8.5 的表', () => {
  assert.deepEqual(missBadge(iseRide0), { text: '錯過 +78 分', tone: 'hot' });
  assert.deepEqual(missBadge(kashikoLeg.rides[0]), { text: '錯過 +29 分', tone: 'muted' });
  assert.deepEqual(missBadge({ ...iseRide0, ifMissed: { depart: '08:41', arrive: '09:15', lateMinutes: 30 } }), { text: '錯過 +30 分', tone: 'hot' });
  assert.deepEqual(missBadge(kashikoLeg.rides[0], 20), { text: '錯過 +29 分', tone: 'hot' });
  assert.deepEqual(missBadge(southLeg.rides[1]), { text: '錯過 無下一班', tone: 'bad' });
  assert.deepEqual(missBadge(southLeg.rides[0]), { text: '錯過 無下一班', tone: 'bad' });
  assert.deepEqual(missBadge(loopLeg.rides[0]), { text: '約 4 分一班', tone: 'muted' });
  // 沒有 ifMissed 欄位（舊資料）：不顯示
  assert.equal(missBadge(bareLeg.rides[0]), null);
});

test('missBadge：班距型的 headwayMin 是 null 時，只有 ifMissed null 才有標籤（Review Focus 2）', () => {
  const r: TransitRide = { ...loopLeg.rides[0], headwayMin: null, first: null, last: null };
  assert.equal(missBadge(r), null);
  assert.deepEqual(missBadge({ ...r, ifMissed: null }), { text: '錯過 無下一班', tone: 'bad' });
});

// --- 步驟 ---------------------------------------------------------------------

test('compactSteps：伊勢市 → 中之郷，7 行', () => {
  const s = compactSteps(iseLeg, '伊勢市', '中之郷', nameOf, 10);
  assert.deepEqual(s, [
    { kind: 'node', time: '08:00', name: '伊勢市', wait: 11, walk: null, walkLast: false, board: 0, ticketTight: null },
    { kind: 'ride', index: 0, mode: 'train', name: '近鐵特急', depart: '08:11', minutes: 15, badge: { text: '錯過 +78 分', tone: 'hot' } },
    { kind: 'node', time: '08:26', name: '鳥羽', wait: null, walk: 3, walkLast: false, board: null, ticketTight: null },
    { kind: 'node', time: '08:29', name: '鳥羽バスセンター', wait: 1, walk: null, walkLast: false, board: 1, ticketTight: null },
    { kind: 'ride', index: 1, mode: 'bus', name: '鷗巴士 5 號', depart: '08:30', minutes: 12, badge: { text: '錯過 +78 分', tone: 'hot' } },
    { kind: 'node', time: '08:42', name: '百五銀行鳥羽支店前', wait: null, walk: 3, walkLast: true, board: null, ticketTight: null },
    { kind: 'node', time: '08:45', name: '中之郷', wait: null, walk: null, walkLast: false, board: null, ticketTight: null },
  ]);
});

test('compactSteps：第一天南下，轉乘有 note → 另一行 transfer；16:10 那程無下一班', () => {
  const s = compactSteps(southLeg, '關西機場', '鵜方', nameOf, 10);
  assert.deepEqual(s, [
    { kind: 'node', time: '14:35', name: '關西機場', wait: 23, walk: null, walkLast: false, board: 0, ticketTight: null },
    { kind: 'ride', index: 0, mode: 'train', name: '南海 機場急行', depart: null, minutes: 46, badge: { text: '錯過 無下一班', tone: 'bad' } },
    { kind: 'node', time: '15:44', name: 'なんば', wait: null, walk: null, walkLast: false, board: null, ticketTight: null },
    { kind: 'transfer', walk: 16, elevatorWalk: 24, note: NAMBA_NOTE },
    { kind: 'node', time: '16:00', name: '大阪難波', wait: 10, walk: null, walkLast: false, board: 1, ticketTight: null },
    { kind: 'ride', index: 1, mode: 'train', name: '近鐵特急', depart: '16:10', minutes: 145, badge: { text: '錯過 無下一班', tone: 'bad' } },
    { kind: 'node', time: '18:35', name: '鵜方', wait: null, walk: null, walkLast: false, board: null, ticketTight: null },
  ]);
});

test('compactSteps：買票站空檔不到 margin → ticketTight', () => {
  const tight: Leg = { ...southLeg, ready: ['14:35', '16:07'] };
  const node = compactSteps(tight, '關西機場', '鵜方', nameOf, 10).find((x) => x.kind === 'node' && x.board === 1);
  assert.deepEqual(node, { kind: 'node', time: '16:07', name: '大阪難波', wait: 3, walk: null, walkLast: false, board: 1, ticketTight: 3 });
  // 剛好接上（空檔 0）：wait null、ticketTight 0
  const zero = compactSteps({ ...southLeg, ready: ['14:35', '16:10'] }, '關西機場', '鵜方', nameOf, 10).find((x) => x.kind === 'node' && x.board === 1);
  assert.ok(zero?.kind === 'node');
  assert.equal(zero.wait, null);
  assert.equal(zero.ticketTight, 0);
  // 巴士不是買票站
  const bus = compactSteps({ ...iseLeg, ready: ['08:00', '08:29'] }, '伊勢市', '中之郷', nameOf, 10).find((x) => x.kind === 'node' && x.board === 1);
  assert.ok(bus?.kind === 'node');
  assert.equal(bus.ticketTight, null);
});

test('compactSteps：通天閣 → SAN-OBP，班距型 depart null，前後走路', () => {
  const s = compactSteps(loopLeg, '通天閣', 'SAN-OBP', nameOf, 10);
  assert.deepEqual(s, [
    { kind: 'node', time: '10:00', name: '通天閣', wait: null, walk: 11, walkLast: false, board: null, ticketTight: null },
    { kind: 'node', time: '10:11', name: '新今宮', wait: 4, walk: null, walkLast: false, board: 0, ticketTight: null },
    { kind: 'ride', index: 0, mode: 'train', name: 'JR 環狀線', depart: null, minutes: 15, badge: { text: '約 4 分一班', tone: 'muted' } },
    { kind: 'node', time: '10:30', name: '大阪城公園', wait: null, walk: 15, walkLast: true, board: null, ticketTight: null },
    { kind: 'node', time: '10:45', name: 'SAN-OBP', wait: null, walk: null, walkLast: false, board: null, ticketTight: null },
  ]);
});

test('compactSteps：計程車、步行沒有步驟', () => {
  assert.deepEqual(compactSteps(taxiLeg, '伊勢市', '朝熊', nameOf, 10), []);
});

test('compactSteps：只有 rides 的舊資料不會當掉，等車用前一程到站算、轉乘步行當 0（Review Focus 1）', () => {
  const s = compactSteps(bareLeg, '伊勢市', '中之郷', nameOf, 10);
  assert.deepEqual(s, [
    { kind: 'node', time: '08:00', name: '伊勢市', wait: 11, walk: null, walkLast: false, board: 0, ticketTight: null },
    { kind: 'ride', index: 0, mode: 'train', name: '近鐵特急', depart: '08:11', minutes: 15, badge: null },
    { kind: 'node', time: '08:26', name: '鳥羽', wait: null, walk: null, walkLast: false, board: null, ticketTight: null },
    { kind: 'node', time: '08:26', name: '鳥羽バスセンター', wait: 4, walk: null, walkLast: false, board: 1, ticketTight: null },
    { kind: 'ride', index: 1, mode: 'bus', name: '鷗巴士 5 號', depart: '08:30', minutes: 12, badge: null },
    { kind: 'node', time: '08:42', name: '中之郷', wait: null, walk: null, walkLast: false, board: null, ticketTight: null },
  ]);
});

test('compactSteps：同一站換車（轉乘 0 分、沒有說明）合成一個節點', () => {
  const l: Leg = {
    ...base,
    mode: 'train',
    from: 'iseshi',
    to: 'kashikojima',
    depart: '10:00',
    arrive: '11:00',
    minutes: 60,
    rides: [
      { ...iseRide0, depart: '10:05', arrive: '10:20', ifMissed: undefined },
      { ...iseRide0, line: '普通（往賢島）', from: 'toba', to: 'kashikojima', depart: '10:30', arrive: '11:00', ifMissed: undefined },
    ],
    walkBefore: 0,
    walkAfter: 0,
    ready: ['10:00', '10:23'],
    transfers: [{ walkMinutes: 0, elevator: null, elevatorWalkMinutes: null, note: null }],
  };
  const s = compactSteps(l, '伊勢市', '賢島', nameOf, 10);
  assert.deepEqual(
    s.map((x) => (x.kind === 'node' ? `${x.time} ${x.name} 等${x.wait} 上${x.board}` : x.kind)),
    ['10:00 伊勢市 等5 上0', 'ride', '10:20 鳥羽 等10 上1', 'ride', '11:00 賢島 等null 上null'],
  );
  // 伊勢市是買票站：等 5 分 < 10 → ticketTight 5
  const first = s[0];
  assert.ok(first.kind === 'node');
  assert.equal(first.ticketTight, 5);
});

// --- 前一站可以多待 --------------------------------------------------------------

test('ticketTightText：近鐵特急（含沒有 operator 的舊資料）寫買特急券，JR、船寫買票', () => {
  const r = (over: Partial<TransitRide>) => ({ mode: 'train', line: '特急（往賢島）', from: 'a', to: 'b', depart: '10:00', arrive: '10:30', ...over }) as TransitRide;
  assert.equal(ticketTightText(r({ operator: 'kintetsu' }), 0), '到站 0 分就發車，買特急券可能來不及');
  assert.equal(ticketTightText(r({ operator: 'kintetsu', line: 'しまかぜ（往賢島）' }), 3), '到站 3 分就發車，買特急券可能來不及');
  // 舊資料沒有 operator：照近鐵判斷（電車、沒有 routeId、不是班距型）
  assert.equal(ticketTightText(r({}), 5), '到站 5 分就發車，買特急券可能來不及');
  assert.equal(ticketTightText(r({ operator: 'jr-central', routeId: 'jr-sangu', line: '快速みえ' }), 4), '到站 4 分就發車，買票可能來不及');
  assert.equal(ticketTightText(r({ mode: 'ferry', operator: 'toba-city', routeId: 'kamishima', line: '鳥羽市営定期船' }), 2), '到站 2 分就發車，買票可能來不及');
});

test('slackHint：鳥羽 → 賢島等 10 分、買票站扣 margin', () => {
  assert.equal(slackHint(kashikoLeg, 10), null);
  assert.equal(slackHint(kashikoLeg, 0), '前一站多待 10 分，一樣搭 10:10');
  // 伊勢市 → 中之郷：等 11 分、買票站 → 1 分
  assert.equal(slackHint(iseLeg, 10), '前一站多待 1 分，一樣搭 08:11');
});

test('slackHint：班距型、計程車、沒有 ready 都是 null（Review Focus 1）', () => {
  assert.equal(slackHint(loopLeg, 10), null);
  assert.equal(slackHint(southLeg, 10), null);
  assert.equal(slackHint(taxiLeg, 10), null);
  assert.equal(slackHint(bareLeg, 10), null);
  assert.equal(slackHint(bareLeg, 0), null);
});

// --- 班次表的格子 ------------------------------------------------------------------

// 伊勢市 → 鳥羽，2/5 07:30 以後
const iseDeps: RideDeparture[] = [
  { tripId: 'a', line: '急行（往鳥羽）', depart: '07:51', arrive: '08:08' },
  { tripId: 'b', line: '特急（往賢島）', depart: '07:53', arrive: '08:10' },
  { tripId: '1-4056', line: '特急（往賢島）', depart: '08:11', arrive: '08:26' },
  { tripId: 'c', line: '急行（往鳥羽）', depart: '08:16', arrive: '08:33' },
  { tripId: 'd', line: '特急（往賢島）', depart: '08:37', arrive: '08:52' },
  { tripId: 'e', line: '普通（往鳥羽）', depart: '08:43', arrive: '08:59' },
  { tripId: 'f', line: '特急（往賢島）', depart: '08:55', arrive: '09:09' },
];

test('departureCells：伊勢市 → 鳥羽 08:00 到站', () => {
  const cells = departureCells(iseDeps, iseRide0, '08:00');
  const brief = (c: DepartureCell) => [c.depart, c.kind, c.express, c.mark, c.isLast, c.gone, c.late];
  assert.deepEqual(cells.map(brief), [
    ['07:51', '急行', false, null, false, true, null],
    ['07:53', '特急', true, null, false, true, null],
    ['08:11', '特急', true, 'plan', false, false, null],
    ['08:16', '急行', false, 'next', false, false, 78],
    ['08:37', '特急', true, null, false, false, null],
    ['08:43', '普通', false, null, false, false, null],
    ['08:55', '特急', true, null, true, false, null],
  ]);
  assert.equal(cells[2].arrive, '08:26');
  assert.equal(departureCells([{ tripId: 's', line: 'しまかぜ（往賢島）', depart: '10:00', arrive: '10:30' }], iseRide0, '08:00')[0].express, true);
});

test('departureCells：規劃或下一班也是末班時兩個都標', () => {
  const two = iseDeps.slice(2, 4);
  const cells = departureCells(two, iseRide0, '08:00');
  assert.deepEqual(cells.map((c) => [c.mark, c.isLast]), [
    ['plan', false],
    ['next', true],
  ]);
  const one = departureCells(iseDeps.slice(2, 3), { ...iseRide0, ifMissed: null }, '08:00');
  assert.deepEqual(one.map((c) => [c.mark, c.isLast]), [['plan', true]]);
});

test('departureCells：tripId 對不到時用發車時間，只標一格（Review Focus 3）', () => {
  // 近鐵 tripId 對不上
  const cells = departureCells(iseDeps, { ...iseRide0, tripId: 'zzz' }, '08:00');
  assert.deepEqual(cells.filter((c) => c.mark === 'plan').map((c) => c.depart), ['08:11']);
  // 巴士同時刻不同 trip：只標第一班
  const bus: RideDeparture[] = [
    { tripId: 't1', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）', depart: '07:37', arrive: '07:49' },
    { tripId: 't2', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）', depart: '08:30', arrive: '08:42' },
    { tripId: 't3', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往相差）', depart: '08:30', arrive: '08:42' },
    { tripId: 't4', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）', depart: '09:48', arrive: '10:00' },
    { tripId: 't5', line: '鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）', depart: '13:38', arrive: '13:50' },
  ];
  const bc = departureCells(bus, iseRide1, '08:29');
  assert.deepEqual(bc.map((c) => c.mark), [null, 'plan', null, 'next', null]);
  assert.deepEqual(bc.map((c) => c.kind), [null, null, null, null, null]);
  assert.deepEqual(bc.map((c) => c.gone), [true, false, false, false, false]);
  assert.equal(bc[3].late, 78);
  // tripId 對得到時用 tripId（同時刻的第二班）
  const bt = departureCells(bus, { ...iseRide1, tripId: 't3' }, '08:29');
  assert.deepEqual(bt.map((c) => c.mark), [null, null, 'plan', 'next', null]);
  // 都對不到：沒有規劃，下一班照發車時間找
  const none = departureCells(bus, { ...iseRide1, tripId: 'x', depart: '08:31' }, '08:29');
  assert.deepEqual(none.map((c) => c.mark), [null, null, null, 'next', null]);
});

test('firstCellIndex：捲到規劃那列的前一列第一格', () => {
  const cells = departureCells(iseDeps, iseRide0, '08:00');
  assert.equal(firstCellIndex(cells, 4), 0); // 規劃在第 0 列
  assert.equal(firstCellIndex(cells, 3), 0); // 規劃在第 0 列（index 2）
  assert.equal(firstCellIndex(cells, 2), 0); // 規劃在第 1 列 → 第 0 列
  const later = departureCells(iseDeps, { ...iseRide0, tripId: 'e', depart: '08:43' }, '08:00');
  assert.equal(firstCellIndex(later, 2), 2); // index 5 在第 2 列 → 第 1 列的第一格
  assert.equal(firstCellIndex(later, 3), 0); // index 5 在第 1 列 → 第 0 列
  // 沒有規劃：用第一班搭得到的
  const none = departureCells(iseDeps, { ...iseRide0, tripId: 'x', depart: '09:30' }, '08:40');
  assert.equal(firstCellIndex(none, 2), 2); // 08:43 index 5 → 第 2 列 → 第 1 列
  assert.equal(firstCellIndex([], 4), 0);
});

// 候選走法（T29c spec §8.9）：伊勢市 → 中之郷兩條
const iseRide2: TransitRide = { ...iseRide0, line: '普通（往賢島）', depart: '08:24', arrive: '09:31', tripId: '1-4100', ifMissed: null, to: 'nakanogo' };
const pathA = { rides: [], from: 'iseshi', to: 'nakanogo' };
const pathB = { rides: [], from: 'iseshi', to: 'nakanogo', note: 'b' } as unknown as typeof pathA;
const altLeg: Leg = {
  ...iseLeg,
  alternatives: [
    { path: pathA, summary: '', arrive: '08:45', minutes: 45, waitMinutes: 11, walkMinutes: 6, ridesCount: 2, rides: [iseRide0, iseRide1], transfers: [] },
    { path: pathB, summary: '', arrive: '09:31', minutes: 91, waitMinutes: 67, walkMinutes: 0, ridesCount: 1, rides: [iseRide2], transfers: [] },
  ],
};

test('pathRows：兩條走法的標題和說明；少於兩條回空', () => {
  const rows = pathRows(altLeg, nameOf);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, '近鐵特急 → 鳥羽 → 鷗巴士 5 號');
  assert.equal(rows[0].sub, '08:45 到・45 分・轉乘 1 次・等 11 分');
  assert.equal(rows[0].current, true);
  assert.equal(rows[1].title, '近鐵普通');
  assert.equal(rows[1].sub, '09:31 到・91 分・不用轉乘・等 67 分');
  assert.equal(rows[1].current, false);
  assert.deepEqual(pathRows({ ...altLeg, alternatives: altLeg.alternatives!.slice(0, 1) }, nameOf), []);
  assert.deepEqual(pathRows(iseLeg, nameOf), []);
});

test('specAfterPickPath：選別條存 path 並清掉分鐘；選第一條（不論有沒有指定 path）不改', () => {
  assert.deepEqual(specAfterPickPath({ note: 'n' }, altLeg, 1), { note: 'n', mode: 'transit', path: pathB });
  assert.deepEqual(specAfterPickPath({ mode: 'transit', minutes: 30, note: 'n' }, altLeg, 1), { mode: 'transit', note: 'n', path: pathB });
  assert.equal(specAfterPickPath(null, altLeg, 0), undefined);
  assert.equal(specAfterPickPath({ mode: 'transit' }, altLeg, 0), undefined);
  assert.equal(specAfterPickPath({ mode: 'transit', path: pathB, note: 'n' }, altLeg, 0), undefined);
  assert.equal(specAfterPickPath(null, altLeg, 5), undefined);
});
