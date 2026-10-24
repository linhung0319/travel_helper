import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAreas, normalizePlace } from '../src/data/normalize.ts';
import { areasExtent, bboxGapMeters, groupAreas, initialExtent } from '../src/lib/areas.ts';
import { photoCandidates, wikimediaThumb } from '../src/lib/photos.ts';
import { departuresAround, terminusName } from '../src/lib/timetable.ts';
import { dayLabel, hoursKeys, timetableDayType, tripDates } from '../src/lib/trip.ts';
import { EMPTY_FILTER, filterChips, matchesFilter, matchesQuery } from '../src/lib/filter.ts';
import { closedDaysLabel, rowForDate } from '../src/lib/hours.ts';
import { nearbyPlaces } from '../src/lib/nearby.ts';
import { DAY_PALETTE, deltaE, hueOf, labOf, placeVisual, wallPlaces } from '../src/lib/visual.ts';
import { copyText } from '../src/lib/labels.ts';
import { TYPE_COLORS } from '../src/lib/typeStyle.ts';
import { dayStops, placeDays } from '../src/lib/itinerary.ts';
import { itin } from './helpers.ts';
import { cardTime, dayBar, daySummary, editorModeOf, formatStay, formatDistance, legMapsUrl, legTargetOf, legText, optionRows, rideLines, stopMarks } from '../src/lib/planView.ts';
import { explorePlaces, typeCounts } from '../src/lib/explore.ts';
import type { DayPlan, TimelineEntry } from '@travel-helper/engine';
import type { Area, Place, StationTimetable } from '../src/data/types.ts';

// 測試用的區域：故意不用真的區域 ID，確認程式沒有寫死（PLAN T11「區域不寫死」）
const areaA: Area = { id: 'area-a', name: { ja: 'A' }, tripOrder: 1, center: [136.8, 34.4], bbox: [136.7, 34.3, 136.9, 34.5] };
const areaB: Area = { id: 'area-b', name: { ja: 'B' }, tripOrder: 2, center: [136.95, 34.45], bbox: [136.88, 34.4, 137.0, 34.55] };
const far: Area = { id: 'far-away', name: { ja: '遠' }, tripOrder: 3, center: [135.3, 34.4], bbox: [135.2, 34.36, 135.36, 34.45] };

function place(id: string, over: Partial<Record<string, unknown>> = {}): Place {
  const p = normalizePlace({ id, type: 'spot', name: { ja: id }, area: 'area-a', coords: [136.8, 34.4], sources: [], ...over });
  assert.ok(p);
  return p;
}

test('normalizePlace：格式不對的回傳 null，欄位有預設值', () => {
  assert.equal(normalizePlace({ id: 'x', type: 'unknown', coords: [1, 2] }), null);
  assert.equal(normalizePlace({ id: 'x', type: 'spot' }), null);
  const p = place('a', { tier: 'Z', contexts: ['lunch', 'bogus'] });
  assert.equal(p.tier, null);
  assert.deepEqual(p.contexts, ['lunch']);
  assert.deepEqual(p.photos, []);
  assert.deepEqual(p.edited, {});
});

test('normalizeAreas：依 tripOrder 排序，缺 bbox 的略過', () => {
  const out = normalizeAreas([far, areaB, { id: 'bad', center: [0, 0] }, areaA]);
  assert.deepEqual(
    out.map((a) => a.id),
    ['area-a', 'area-b', 'far-away'],
  );
});

test('區域分群：重疊或相近的同一群，遠的另一群；初始範圍用資料點多的那群', () => {
  assert.equal(bboxGapMeters(areaA.bbox, areaB.bbox), 0);
  assert.ok(bboxGapMeters(areaA.bbox, far.bbox) > 100_000);
  const groups = groupAreas([areaA, areaB, far]).map((g) => g.map((a) => a.id).sort());
  assert.deepEqual(groups.sort(), [['area-a', 'area-b'], ['far-away']]);

  const places = [
    place('p1', { coords: [136.75, 34.35] }),
    place('p2', { area: 'area-b', coords: [136.95, 34.5] }),
    place('p3', { area: 'far-away', coords: [135.3, 34.4] }),
  ];
  assert.deepEqual(initialExtent([areaA, areaB, far], places), [136.75, 34.35, 136.95, 34.5]);
  // 沒有資料點的區域用 bbox
  assert.deepEqual(areasExtent([far], []), far.bbox);
});

test('Wikimedia 原圖改縮圖，原圖留在下一個候選；其他照片照順序', () => {
  const orig = 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Toba_Aquarium.jpg';
  assert.equal(wikimediaThumb(orig), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Toba_Aquarium.jpg/800px-Toba_Aquarium.jpg');
  assert.equal(wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/X.jpg/800px-X.jpg'), null);
  assert.equal(wikimediaThumb('https://example.com/a.jpg'), null);
  assert.deepEqual(photoCandidates([{ url: 'https://example.com/1.jpg' }, { url: orig }]), [
    'https://example.com/1.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Toba_Aquarium.jpg/800px-Toba_Aquarium.jpg',
    orig,
  ]);
});

test('旅程日期：12 天、星期、國定假日、時刻表的日別', () => {
  const dates = tripDates();
  assert.equal(dates.length, 12);
  assert.equal(dates[0], '2027-02-02');
  assert.equal(dates[11], '2027-02-13');
  assert.equal(dayLabel('2027-02-02'), '2/2（二）');
  assert.equal(dayLabel('2027-02-11'), '2/11（四・假日）');
  assert.deepEqual(hoursKeys('2027-02-11'), ['holiday', 'thu']);
  assert.equal(timetableDayType('2027-02-05'), 'weekday');
  assert.equal(timetableDayType('2027-02-06'), 'holiday'); // 週六
  assert.equal(timetableDayType('2027-02-07'), 'holiday'); // 週日
  assert.equal(timetableDayType('2027-02-11'), 'holiday'); // 建国記念の日
});

test('營業時間：那天用哪一列、公休標章', () => {
  const h = { mon: [], tue: [['09:00', '17:00']] as [string, string][], holiday: [['10:00', '16:00']] as [string, string][] };
  assert.equal(rowForDate(h, '2027-02-02'), 'tue');
  assert.equal(rowForDate(h, '2027-02-11'), 'holiday');
  assert.equal(rowForDate({ thu: [] }, '2027-02-11'), 'thu');
  assert.equal(closedDaysLabel(h), '週一休');
  assert.equal(closedDaysLabel(null), null);
});

const tt: StationTimetable = {
  station: 'x',
  validFrom: null,
  validTo: null,
  retrieved: '2026-10-17',
  source: 'https://example.com',
  sources: [],
  directions: {
    'for-kashikojima': {
      weekday: ['08:10', '08:40', '09:05', '09:30', '10:00', '10:30', '11:00'].map((dep) => ({ dep, type: '普通', to: 'kashikojima' })),
      holiday: [{ dep: '09:15', type: '急行', to: 'kashikojima' }],
    },
    'for-ise-nakagawa': { weekday: [{ dep: '23:50', type: '普通', to: 'osaka-namba' }], holiday: [] },
  },
};

test('時刻表：指定時間前 2 班、後 4 班（含同一分鐘），每個方向分開', () => {
  const [south, north] = departuresAround(tt, 'weekday', '09:05');
  assert.deepEqual(
    south.before.map((t) => t.dep),
    ['08:10', '08:40'],
  );
  assert.deepEqual(
    south.after.map((t) => t.dep),
    ['09:05', '09:30', '10:00', '10:30'],
  );
  assert.equal(north.after[0].dep, '23:50');
  assert.equal(departuresAround(tt, 'holiday', '10:00')[0].before[0].dep, '09:15');
  assert.equal(terminusName('osaka-namba', new Map()), '大阪難波');
  assert.equal(terminusName('kashikojima', new Map([['kashikojima', '賢島']])), '賢島');
  assert.equal(terminusName('somewhere', new Map()), 'somewhere');
});

test('篩選：空的不篩；各項是「且」，同一項是「或」；標籤的名稱從區域來', () => {
  const r = place('r', { type: 'restaurant', area: 'area-b', region: 'b-1', tier: 'A', contexts: ['lunch'] });
  const s = place('s', { tier: 'B' });
  const st = place('st', { type: 'station' });
  assert.ok(matchesFilter(r, EMPTY_FILTER));
  assert.ok(matchesFilter(r, { ...EMPTY_FILTER, areas: ['area-a', 'area-b'] }));
  assert.ok(!matchesFilter(r, { ...EMPTY_FILTER, areas: ['area-a'] }));
  assert.ok(!matchesFilter(s, { ...EMPTY_FILTER, contexts: ['lunch'] }));
  assert.ok(!matchesFilter(r, { ...EMPTY_FILTER, types: ['restaurant'], tiers: ['S'] }));
  // 只篩分級時車站照樣顯示
  assert.ok(matchesFilter(st, { ...EMPTY_FILTER, tiers: ['S'] }));
  const areas: Area[] = [{ ...areaB, regions: [{ id: 'b-1', name: { ja: 'B1', zh: '乙一' } }] }];
  assert.deepEqual(
    filterChips({ ...EMPTY_FILTER, areas: ['area-b'], regions: ['b-1'], types: ['restaurant'] }, areas).map((c) => c.label),
    ['B', '乙一', '餐廳'],
  );
});

test('選定的天：不在那天的點變淡，在那天的有順序', () => {
  const days = placeDays(itin({ '2027-02-05': ['a', 'b'] }));
  const a = place('a');
  const c = place('c');
  assert.deepEqual(placeVisual(a, EMPTY_FILTER, 'all', days), { match: true, dim: false, order: null });
  assert.deepEqual(placeVisual(a, EMPTY_FILTER, '2027-02-05', days), { match: true, dim: false, order: 1 });
  assert.deepEqual(placeVisual(c, EMPTY_FILTER, '2027-02-05', days), { match: true, dim: true, order: null });
  assert.equal(placeVisual(a, { ...EMPTY_FILTER, types: ['restaurant'] }, 'all', days).dim, true);
});

test('圖片牆：只放畫面裡、符合篩選的點，S → A → B', () => {
  const ps = [
    place('b', { tier: 'B', coords: [136.8, 34.4] }),
    place('s', { tier: 'S', coords: [136.81, 34.41] }),
    place('a', { tier: 'A', coords: [136.82, 34.42] }),
    place('out', { tier: 'S', coords: [137.5, 34.4] }),
  ];
  assert.deepEqual(
    wallPlaces(ps, [136.7, 34.3, 136.9, 34.5], EMPTY_FILTER).map((p) => p.id),
    ['s', 'a', 'b'],
  );
  assert.deepEqual(wallPlaces(ps, null, EMPTY_FILTER), []);
});

test('附近：anchors 的分鐘優先，反向 anchors 也算，沒有的用直線估算', () => {
  const spot = place('spot', { coords: [136.8, 34.4] });
  const rest = place('rest', { type: 'restaurant', coords: [136.801, 34.4], anchors: [{ id: 'spot', walkMinutes: 4, walkSource: 'osrm' }] });
  const station = place('sta', { type: 'station', coords: [136.802, 34.401] });
  const far = place('far', { type: 'restaurant', coords: [136.9, 34.5] });
  const g = nearbyPlaces(spot, [spot, rest, station, far]);
  assert.deepEqual(g.get('restaurant'), [{ place: rest, minutes: 4, estimated: false }]);
  assert.equal(g.get('station')?.[0].estimated, true);
  assert.ok(!g.get('restaurant')?.some((x) => x.place.id === 'far'));
});

test('一天的順序：選定的選項、同機場的航班只算一站、住宿放最後', () => {
  const day = {
    date: '2027-02-02',
    lodging: 'hotel',
    items: [
      { id: 'f-1', type: 'flight' as const, direction: 'arrive' as const, airport: 'kix', depart: '08:20', arrive: '11:55' },
      { id: 'f-2', type: 'flight' as const, direction: 'arrive' as const, airport: 'kix', depart: '09:45', arrive: '13:20' },
      { id: 'i-1', type: 'visit' as const, options: [{ place: 'a' }, { place: 'b' }], selected: 1, start: '15:00' },
      { id: 'i-2', type: 'free' as const, minutes: 30 },
    ],
  };
  assert.deepEqual(
    dayStops(day).map((s) => [s.place, s.kind, s.time]),
    [
      ['kix', 'flight', '11:55'],
      ['b', 'visit', '15:00'],
      ['hotel', 'lodging', null],
    ],
  );
});

// --- T15m 版面調整：地圖和時間軸共用的編號、探索清單 ---

const entry = (kind: TimelineEntry['kind'], placeId: string | null, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  kind,
  itemId: placeId,
  placeId,
  travel: null,
  arrive: '09:00',
  start: '09:00',
  end: '09:00',
  waitMinutes: 0,
  ...extra,
});

test('stopMarks：住宿是「宿」、機場是「機」，其他依序編號；分組先編各組再編會合點', () => {
  const split = entry('meet', 'meet-pt', {
    groups: [
      { id: 'g1', name: 'A', entries: [entry('visit', 'ga'), entry('meet', 'meet-pt')] },
      { id: 'g2', name: 'B', entries: [entry('visit', 'gb')] },
    ],
  });
  const day = { entries: [entry('start', 'hotel-1'), entry('visit', 'x'), split, entry('visit', 'x'), entry('lodging', 'hotel-2')] } as unknown as DayPlan;
  const { byPlace, byEntry } = stopMarks(day, (id) => id.startsWith('hotel'));
  assert.equal(byPlace.get('hotel-1'), '宿');
  assert.equal(byPlace.get('ga'), '2');
  assert.equal(byPlace.get('gb'), '3');
  assert.equal(byPlace.get('meet-pt'), '4');
  // 同一個點去兩次
  assert.equal(byPlace.get('x'), '1・5');
  assert.equal(byPlace.get('hotel-2'), '宿');
  assert.equal(byEntry.get(day.entries[0]), '宿');
  const flights = { entries: [entry('flight', 'kix'), entry('visit', 'y')] } as unknown as DayPlan;
  assert.deepEqual([...stopMarks(flights, () => false).byPlace], [['kix', '機'], ['y', '1']]);
});

test('explorePlaces：不列車站；依評分、❤️ 排序時同分保留推薦的順序；可以只看畫面裡的', () => {
  const ps = [
    place('s1', { type: 'station' }),
    place('r1', { type: 'restaurant', tier: 'S', ratings: { google: 4.0 } }),
    place('r2', { type: 'restaurant', tier: 'A', ratings: { google: 4.5 } }),
    place('r3', { type: 'restaurant', tier: 'B', ratings: { tabelog: 3.6 }, coords: [137.5, 34.4] }),
  ];
  const ids = (list: Place[]) => list.map((p) => p.id);
  assert.deepEqual(ids(explorePlaces(ps, EMPTY_FILTER, null, 'recommend', () => 0)), ['r1', 'r2', 'r3']);
  // 食べログ 3.6 ≈ 4.1 星
  assert.deepEqual(ids(explorePlaces(ps, EMPTY_FILTER, null, 'rating', () => 0)), ['r2', 'r3', 'r1']);
  assert.deepEqual(ids(explorePlaces(ps, EMPTY_FILTER, null, 'likes', (id) => (id === 'r3' ? 2 : 0))), ['r3', 'r1', 'r2']);
  assert.deepEqual(ids(explorePlaces(ps, EMPTY_FILTER, [136.7, 34.3, 136.9, 34.5], 'recommend', () => 0)), ['r1', 'r2']);
  assert.deepEqual(typeCounts(ps, { ...EMPTY_FILTER, types: ['lodging'] }, null), { restaurant: 3, lodging: 0, spot: 0 });
});

test('matchesQuery：中文、日文、假名、英文都找得到；不分大小寫、全形半形；空字串都符合', () => {
  const p = normalizePlace({ id: 'q', type: 'spot', name: { zh: '鳥羽水族館', ja: '鳥羽水族館', kana: 'とばすいぞくかん', en: 'Toba Aquarium' }, area: 'toba', coords: [136.8, 34.5], sources: [] })!;
  assert.ok(matchesQuery(p, ''));
  assert.ok(matchesQuery(p, '  '));
  assert.ok(matchesQuery(p, '水族'));
  assert.ok(matchesQuery(p, 'すいぞく'));
  assert.ok(matchesQuery(p, 'aquarium'));
  assert.ok(matchesQuery(p, 'ＴＯＢＡ'));
  assert.ok(matchesQuery(p, 'toba aqua'));
  assert.ok(!matchesQuery(p, '珍珠'));
});

// --- 時間軸改版：晚餐順序、比例橫條、摘要、停留時間 ---

const leg = (depart: string, minutes: number): NonNullable<TimelineEntry['travel']> => ({
  mode: 'taxi',
  from: null,
  to: null,
  depart,
  arrive: '00:00',
  minutes,
  walkMinutes: 0,
  waitMinutes: 0,
  rides: [],
  specified: false,
  basis: '',
});

test('dayBar：交通、停留、等待各一段；分組的時段每組一條 lane', () => {
  const split = entry('meet', 'm', {
    itemId: 's',
    arrive: '12:00',
    start: '12:00',
    end: '12:00',
    groups: [
      { id: 'g1', name: 'A', entries: [entry('visit', 'ga', { itemId: 'ga', travel: leg('10:00', 20), arrive: '10:20', start: '10:20', end: '11:30' })] },
      { id: 'g2', name: 'B', entries: [entry('visit', 'gb', { itemId: 'gb', travel: leg('10:00', 10), arrive: '10:10', start: '10:30', end: '11:00' })] },
    ],
  });
  const day = { entries: [entry('start', 'h', { start: '09:30', end: '09:30' }), entry('visit', 'a', { travel: leg('09:30', 10), arrive: '09:40', start: '09:40', end: '10:00', meal: null }), split] } as unknown as DayPlan;
  const bar = dayBar(day);
  assert.deepEqual(bar.filter((s) => s.lane === 0).map((s) => [s.kind, s.from, s.to]), [
    ['travel', '09:30', '09:40'],
    ['visit', '09:40', '10:00'],
  ]);
  assert.deepEqual(bar.filter((s) => s.lane === 2).map((s) => [s.kind, s.from, s.to]), [
    ['travel', '10:00', '10:10'],
    ['idle', '10:10', '10:30'],
    ['visit', '10:30', '11:00'],
  ]);
});

test('daySummary：出發、回住宿、交通總分鐘（含各組、不含緩衝）、警告數（不算 info）', () => {
  const day = {
    entries: [
      entry('start', 'h', { start: '09:30' }),
      entry('visit', 'a', { travel: leg('09:30', 10) }),
      entry('meet', 'm', { groups: [{ id: 'g', name: 'g', entries: [entry('visit', 'b', { travel: leg('11:00', 5) })] }] }),
      entry('lodging', 'h', { travel: leg('15:00', 20), arrive: '15:30' }),
    ],
    warnings: [{ level: 'warning' }, { level: 'info' }, { level: 'error' }],
  } as unknown as DayPlan;
  assert.deepEqual(daySummary(day), { start: '09:30', back: '15:30', travelMinutes: 35, warnings: 2 });
});

/** 只寫要的欄位，其他照 leg() 的預設 */
const legWith = (p: Partial<NonNullable<TimelineEntry['travel']>>) => ({ ...leg('10:00', 0), ...p });

test('legText：等車寫在交通卡，沒有緩衝', () => {
  assert.equal(legText(legWith({ mode: 'train', minutes: 34, waitMinutes: 11 })), '🚃 34 分・等 11 分');
  assert.equal(legText(legWith({ mode: 'taxi', minutes: 12, taxi: { cars: 4, jumboCars: 2 } as never })), '🚕 12 分・大型 2 台或 4 台');
  assert.equal(legText(legWith({ mode: 'walk', minutes: 8, bufferMinutes: 10 } as never)), '🚶 8 分');
  assert.equal(legText(legWith({ mode: 'unknown', minutes: 0 })), '❓ 交通未定 0 分');
  assert.equal(legText(legWith({ mode: 'none' })), '');
});

test('editorModeOf：舊的方式對到新選單', () => {
  assert.equal(editorModeOf(null), 'auto');
  assert.equal(editorModeOf({ note: '集合' }), 'auto');
  assert.equal(editorModeOf({ mode: 'walk' }), 'walk');
  assert.equal(editorModeOf({ mode: 'taxi' }), 'taxi');
  assert.equal(editorModeOf({ mode: 'transit' }), 'transit');
  assert.equal(editorModeOf({ mode: 'bus' }), 'transit');
  assert.equal(editorModeOf({ mode: 'train' }), 'transit');
  assert.equal(editorModeOf({ mode: 'ferry' }), 'transit');
  assert.equal(editorModeOf({ mode: 'charter' }), 'legacy');
  assert.equal(editorModeOf({ mode: 'car' }), 'legacy');
  assert.equal(editorModeOf({ mode: 'other' }), 'legacy');
});

test('formatStay', () => {
  assert.equal(formatStay(45), '45 分');
  assert.equal(formatStay(60), '1 小時');
  assert.equal(formatStay(150), '2.5 小時');
  assert.equal(formatStay(80), '1 小時 20 分');
});

test('多點卡片的清單：主要的排第一、走路分鐘是 null，其他照 anchors 或直線估算', () => {
  const a = place('a', { type: 'restaurant', coords: [136.8, 34.4] });
  const b = place('b', { type: 'restaurant', coords: [136.801, 34.4], anchors: [{ id: 'a', walkMinutes: 4, walkSource: 'osrm' }] });
  const c = place('c', { type: 'restaurant', coords: [136.802, 34.4] });
  const byId = new Map([a, b, c].map((p) => [p.id, p]));
  const item = { id: 'i-1', type: 'visit' as const, options: [{ place: 'b' }, { place: 'a' }, { place: 'gone' }, { place: 'c' }], selected: 1 };
  const rows = optionRows(item, byId);
  assert.deepEqual(
    rows.map((r) => [r.place.id, r.index, r.main]),
    [
      ['a', 1, true],
      ['b', 0, false],
      ['c', 3, false],
    ],
  );
  assert.equal(rows[0].walkMinutesFromMain, null);
  assert.equal(rows[1].walkMinutesFromMain, 4);
  assert.ok(typeof rows[2].walkMinutesFromMain === 'number' && rows[2].walkMinutesFromMain > 0);
});

// --- 交通細列：每一程、設定的對象、Google Maps 連結 ---

test('rideLines：每程一行，兩程之間寫轉乘幾分', () => {
  const l = {
    ...leg('10:12', 26),
    mode: 'train' as const,
    rides: [
      { mode: 'train' as const, line: '近鐵', from: 'toba', to: 'ujiyamada', depart: '10:12', arrive: '10:30' },
      { mode: 'bus' as const, line: '三重交通', from: 'ujiyamada', to: 'geku', depart: '10:38', arrive: '10:45' },
    ],
  };
  const names: Record<string, string> = { toba: '鳥羽', ujiyamada: '宇治山田', geku: '外宮前' };
  assert.deepEqual(
    rideLines(l, (id) => names[id] ?? id),
    ['10:12 近鐵 鳥羽 → 宇治山田 10:30', '轉乘 8 分', '10:38 三重交通 宇治山田 → 外宮前 10:45'],
  );
  assert.deepEqual(rideLines(leg('10:00', 5), (id) => id), []);
});

test('legTargetOf：住宿用日期，造訪、自由時間、航班用項目 ID，起點和會合不能改', () => {
  assert.deepEqual(legTargetOf(entry('lodging', 'hotel-a', { itemId: null }), '2027-02-05'), { lodging: '2027-02-05' });
  assert.deepEqual(legTargetOf(entry('visit', 'a', { itemId: 'v1' }), '2027-02-05'), { itemId: 'v1' });
  assert.deepEqual(legTargetOf(entry('free', null, { itemId: 'f1' }), '2027-02-05'), { itemId: 'f1' });
  assert.deepEqual(legTargetOf(entry('flight', 'kix', { itemId: 'fl1' }), '2027-02-05'), { itemId: 'fl1' });
  assert.equal(legTargetOf(entry('meet', 'a', { itemId: 'm1' }), '2027-02-05'), null);
  assert.equal(legTargetOf(entry('start', 'a', { itemId: null }), '2027-02-05'), null);
});

test('legMapsUrl：步行 walking、電車巴士船、大眾運輸 transit、其他 driving；座標是 緯度,經度', () => {
  const a = place('a', { coords: [136.8, 34.4] });
  const b = place('b', { coords: [136.9, 34.5] });
  const base = 'https://www.google.com/maps/dir/?api=1&origin=34.4,136.8&destination=34.5,136.9&travelmode=';
  assert.equal(legMapsUrl(a, b, 'walk'), base + 'walking');
  for (const m of ['train', 'bus', 'ferry', 'transit'] as const) assert.equal(legMapsUrl(a, b, m), base + 'transit');
  for (const m of ['taxi', 'charter', 'car', 'other'] as const) assert.equal(legMapsUrl(a, b, m), base + 'driving');
});

test('formatDistance：不到 1 公里寫公尺，其他寫公里一位小數', () => {
  assert.equal(formatDistance(850), '850 公尺');
  assert.equal(formatDistance(849.6), '850 公尺');
  assert.equal(formatDistance(1200), '1.2 公里');
  assert.equal(formatDistance(12345), '12.3 公里');
});

test('cardTime：起點、終點只寫一個時間；其他寫開始–結束', () => {
  assert.deepEqual(cardTime(entry('start', null, { start: '09:30', end: '09:30' })), { text: '09:30 出發', stay: null });
  assert.deepEqual(cardTime(entry('lodging', 'h', { arrive: '15:10', start: '15:10', end: '15:10' })), { text: '15:10 到住宿', stay: null });
  assert.deepEqual(cardTime(entry('visit', 'a', { start: '09:42', end: '11:12' })), { text: '09:42–11:12', stay: 90 });
  assert.deepEqual(cardTime(entry('visit', 'a', { start: '09:42', end: '09:42' })), { text: '09:42', stay: null });
});

test('每天的色盤：12 色、不重複、避開類型色', () => {
  assert.equal(DAY_PALETTE.length, 12);
  assert.equal(new Set(DAY_PALETTE).size, 12);
  for (const c of DAY_PALETTE) {
    const a = hueOf(c);
    if (a.s < 0.15) continue; // 灰色不算撞色
    for (const t of Object.values(TYPE_COLORS)) {
      const b = hueOf(t);
      const d = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
      assert.ok(d >= 25, `${c} 和類型色 ${t} 太像（色相差 ${d.toFixed(0)}°）`);
    }
  }
  assert.ok(DAY_PALETTE.filter((c) => hueOf(c).s < 0.15).length <= 1, '灰色最多一個');
  for (const c of DAY_PALETTE) assert.ok(labOf(c)[0] <= 70, `${c} 太淺，畫在淺色地圖上看不清楚`);
  for (const [i, a] of DAY_PALETTE.entries()) {
    for (const b of DAY_PALETTE.slice(i + 1)) assert.ok(deltaE(a, b) >= 20, `${a} 和 ${b} 太像（ΔE ${deltaE(a, b).toFixed(0)}）`);
  }
});

test('copyText：日文名稱優先，沒有用中文', () => {
  assert.equal(copyText(place('a', { name: { ja: '鳥羽水族館', zh: '鳥羽水族館（中）' } })), '鳥羽水族館');
  assert.equal(copyText(place('b', { name: { ja: '', zh: '海女小屋' } })), '海女小屋');
});
