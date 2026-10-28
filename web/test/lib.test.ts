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
import { DAY_PALETTE, dayColor, deltaE, labOf, placeVisual, wallPlaces } from '../src/lib/visual.ts';
import { copyText } from '../src/lib/labels.ts';
import { TYPE_COLORS } from '../src/lib/typeStyle.ts';
import { dayStops, placeDays } from '../src/lib/itinerary.ts';
import { itin } from './helpers.ts';
import { itineraryFeatures, itineraryMarks } from '../src/lib/overlays.ts';
import {
  cardTime,
  cardTypeLetter,
  dayBar,
  daySummary,
  editorModeOf,
  showMinutesInput,
  formatStay,
  formatTravelTotal,
  hourTicks,
  isBarSelected,
  selectedBarKey,
  legMapsUrl,
  legTargetOf,
  legModeName,
  taxiCarsText,
  legTitle,
  rideReadyAt,
  mapMark,
  optionRows,
  shownWarnings,
  warningsByItem,
  stopMarks,
  timelineRows,
  waitNote,
} from '../src/lib/planView.ts';
import { EMPTY_FEED, explorePlaces, feedFilter, typeCounts, wishFilter } from '../src/lib/explore.ts';
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
  assert.equal(dayLabel('2027-02-11'), '2/11（四）');
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

test('stopMarks：起點 0、回住宿接著編', () => {
  // 2/3 的形狀：出發住宿 0、橫山展望台 1、La Mer 2、回住宿 3
  const day = { entries: [entry('start', 'hotel'), entry('visit', 'yokoyama'), entry('visit', 'lamer'), entry('lodging', 'hotel')] } as unknown as DayPlan;
  const { byPlace, byEntry } = stopMarks(day, (id) => id === 'hotel');
  assert.deepEqual(day.entries.map((e) => byEntry.get(e)), ['0', '1', '2', '3']);
  assert.deepEqual(byPlace.get('hotel'), ['0', '3']);
  assert.deepEqual(byPlace.get('yokoyama'), ['1']);
});

test('stopMarks：航班、分組', () => {
  // 起點是航班抵達（機場）→ 0；出發的航班是最後一個號碼
  const flights = { entries: [entry('flight', 'kix'), entry('visit', 'y'), entry('flight', 'kix2')] } as unknown as DayPlan;
  assert.deepEqual([...stopMarks(flights, () => false).byPlace], [['kix', ['0']], ['y', ['1']], ['kix2', ['2']]]);
  // 起點不是住宿也是 0
  const other = { entries: [entry('start', 'somewhere'), entry('visit', 'y')] } as unknown as DayPlan;
  assert.deepEqual([...stopMarks(other, () => false).byPlace], [['somewhere', ['0']], ['y', ['1']]]);
  // 分組：先各組的點、再會合點，連續編
  const split = entry('meet', 'meet-pt', {
    groups: [
      { id: 'g1', name: 'A', entries: [entry('visit', 'ga'), entry('meet', 'meet-pt')] },
      { id: 'g2', name: 'B', entries: [entry('visit', 'gb')] },
    ],
  });
  const day = { entries: [entry('start', 'hotel-1'), entry('visit', 'x'), split, entry('visit', 'x'), entry('lodging', 'hotel-2')] } as unknown as DayPlan;
  const { byPlace, byEntry } = stopMarks(day, (id) => id.startsWith('hotel'));
  assert.deepEqual(byPlace.get('hotel-1'), ['0']);
  assert.deepEqual(byPlace.get('ga'), ['2']);
  assert.deepEqual(byPlace.get('gb'), ['3']);
  assert.deepEqual(byPlace.get('meet-pt'), ['4']);
  // 同一個點去兩次
  assert.deepEqual(byPlace.get('x'), ['1', '5']);
  assert.deepEqual(byPlace.get('hotel-2'), ['6']);
  assert.equal(byEntry.get(day.entries[0]), '0');
});

test('mapMark：起終點同一點', () => {
  assert.equal(mapMark(['0', '3'], 'day'), '0');
  assert.equal(mapMark(['0', '3'], 'leg', { from: 'x', to: 'h' }, 'h'), '3');
  assert.equal(mapMark(['0', '3'], 'leg', { from: 'h', to: 'x' }, 'h'), '0');
  assert.equal(mapMark(['1', '4'], 'day'), '1・4');
  assert.equal(mapMark(['2'], 'day'), '2');
  assert.equal(mapMark([], 'day'), '');
  // 不在這段上的點照整天的規則
  assert.equal(mapMark(['1', '4'], 'leg', { from: 'a', to: 'b' }, 'x'), '1・4');
  // 整趟：住宿傳隔天的 marks，是隔天的起點
  assert.equal(mapMark(['0'], 'trip'), '0');
});

test('itineraryMarks：某一天起終點同一點是 0，點了最後一段時是最後一號', () => {
  const d = (date: string, entries: TimelineEntry[]) => ({ date, entries }) as unknown as DayPlan;
  const day = d('2027-02-03', [entry('start', 'hotel'), entry('visit', 'y'), entry('visit', 'l'), entry('lodging', 'hotel')]);
  const plan = { days: [day] };
  const m = itineraryMarks(plan, '2027-02-03', null);
  assert.deepEqual([...m], [['hotel', '0'], ['y', '1'], ['l', '2']]);
  // 最後一段（l → 回住宿）：住宿是 3、l 是 2
  const last = itineraryMarks(plan, '2027-02-03', '2027-02-03:lodging');
  assert.equal(last.get('hotel'), '3');
  assert.equal(last.get('l'), '2');
  // 第一段（住宿 → y）：住宿是 0
  assert.equal(itineraryMarks(plan, '2027-02-03', '2027-02-03:visit:y').get('hotel'), '0');
  // 別天的交通卡不影響
  assert.equal(itineraryMarks(plan, '2027-02-03', '2027-02-04:lodging').get('hotel'), '0');
  // 分組裡的一段：從分組前的點出發
  const split = entry('meet', 'mp', { groups: [{ id: 'g1', name: 'A', entries: [entry('visit', 'ga'), entry('meet', 'mp', { itemId: 'm1' })] }] });
  const g = { days: [d('2027-02-04', [entry('start', 'h'), entry('visit', 'x'), split, entry('lodging', 'x')])] };
  assert.deepEqual([...itineraryMarks(g, '2027-02-04', '2027-02-04:visit:ga')].filter(([id]) => id === 'x'), [['x', '1']]);
  assert.equal(itineraryMarks(g, '2027-02-04', '2027-02-04:lodging').get('x'), '4');

  // 同一點一天去兩次（1 和 4）：點開 4→5 那段，起點寫 4（不是最小的 1）；點開 0→1 那段，終點寫 1（不是最大的 4）
  const twice = { days: [d('2027-02-05', [entry('start', 'h'), entry('visit', 'x', { itemId: 'v1' }), entry('visit', 'a'), entry('visit', 'b'), entry('visit', 'x', { itemId: 'v4' }), entry('visit', 'c'), entry('lodging', 'h2')])] };
  assert.equal(itineraryMarks(twice, '2027-02-05', '2027-02-05:visit:c').get('x'), '4');
  assert.equal(itineraryMarks(twice, '2027-02-05', '2027-02-05:visit:v1').get('x'), '1');
  assert.equal(itineraryMarks(twice, '2027-02-05', '2027-02-05:visit:v4').get('x'), '4');
  assert.equal(itineraryMarks(twice, '2027-02-05', '2027-02-05:visit:a').get('x'), '1');
  assert.equal(itineraryMarks(twice, '2027-02-05', null).get('x'), '1・4');
});

test('itineraryMarks：整趟時住宿是隔天的 0', () => {
  const d = (date: string, entries: TimelineEntry[]) => ({ date, entries }) as unknown as DayPlan;
  const plan = {
    days: [
      d('2027-02-02', [entry('flight', 'kix'), entry('visit', 'a'), entry('lodging', 'h1')]),
      d('2027-02-03', [entry('start', 'h1'), entry('visit', 'b'), entry('lodging', 'h2')]),
      d('2027-02-04', [entry('start', 'h2'), entry('visit', 'c'), entry('flight', 'kix')]),
    ],
  };
  const m = itineraryMarks(plan, 'all', null);
  assert.equal(m.get('h1'), '0');
  assert.equal(m.get('h2'), '0');
  assert.equal(m.get('a'), '1');
  assert.equal(m.get('b'), '1');
  // 機場：第一天的起點 0
  assert.equal(m.get('kix'), '0');
  // 最後一天的終點沒有隔天，照那天的號碼
  const end = itineraryMarks({ days: [d('2027-02-04', [entry('start', 'h2'), entry('visit', 'c'), entry('lodging', 'h3')])] }, 'all', null);
  assert.equal(end.get('h3'), '2');
  // 同一個點排在兩天：點亮的那天優先
  const twice = { days: [d('2027-02-02', [entry('start', 'h'), entry('visit', 'z'), entry('visit', 'q'), entry('lodging', 'h')]), d('2027-02-03', [entry('start', 'h'), entry('visit', 'q')])] };
  assert.equal(itineraryMarks(twice, 'all', null).get('q'), '2');
  assert.equal(itineraryMarks(twice, 'all', null, '2027-02-03').get('q'), '1');
});

test('itineraryFeatures：整趟點了某天，其他天的路線 dim', () => {
  const it = itin({ '2027-02-05': ['a', 'b'], '2027-02-06': ['c', 'd'] });
  const byId = new Map(['a', 'b', 'c', 'd'].map((id, i) => [id, place(id, { coords: [136.8 + i * 0.01, 34.4] })]));
  const dims = (day: string, focus: string | null) =>
    itineraryFeatures(it, null, byId, tripDates(), day, undefined, focus).lines.features.map((f) => [f.properties!.date, f.properties!.dim]);
  assert.deepEqual(dims('all', null), [['2027-02-05', false], ['2027-02-06', false]]);
  assert.deepEqual(dims('all', '2027-02-06'), [['2027-02-05', true], ['2027-02-06', false]]);
  // 選了某一天時不管 focus
  assert.deepEqual(dims('2027-02-05', '2027-02-06'), [['2027-02-05', false]]);
});

test('cardTypeLetter：類型色塊上的字', () => {
  assert.equal(cardTypeLetter('lodging'), '宿');
  assert.equal(cardTypeLetter('spot'), '景');
  assert.equal(cardTypeLetter('restaurant'), '食');
  assert.equal(cardTypeLetter('station'), '駅');
  assert.equal(cardTypeLetter('airport'), '機');
  assert.equal(cardTypeLetter(null), '點');
});

const busLeg = {
  mode: 'transit' as const,
  from: 'izawa',
  to: 'daiozaki',
  depart: '15:01',
  arrive: '16:56',
  minutes: 115,
  walkMinutes: 22,
  waitMinutes: 43,
  walkBefore: 14,
  walkAfter: 8,
  ready: ['15:15'],
  rides: [{ mode: 'bus' as const, line: '御座線（往御座港）', from: 'kawabe', to: 'daiozaki-bus', depart: '15:58', arrive: '16:48' }],
  specified: false,
  basis: '',
};

test('waitNote：指定開始時間、午餐、開門、其他', () => {
  const visit = { id: 'v', type: 'visit' as const, options: [{ place: 'r' }], selected: 0 };
  const e = entry('visit', 'r', { arrive: '10:53', start: '12:00', waitMinutes: 67, meal: 'lunch', mealTags: ['lunch'] });
  assert.equal(waitNote(e, { ...visit, start: '12:00' }, place('r')), '10:53 到，等 67 分（午餐 12:00 才開始）');
  assert.equal(waitNote({ ...e, meal: 'dinner', mealTags: ['dinner'] }, { ...visit, start: '12:00' }, place('r')), '10:53 到，等 67 分（晚餐 12:00 才開始）');
  // 標了早餐＋午餐的 12:00：寫引擎用的那一餐（entry.meal），不是第一個標籤
  assert.equal(waitNote({ ...e, meal: 'lunch', mealTags: ['breakfast', 'lunch'] }, { ...visit, start: '12:00' }, place('r')), '10:53 到，等 67 分（午餐 12:00 才開始）');
  // 沒標用餐：引擎猜了午餐也不寫
  assert.equal(waitNote({ ...e, mealTags: [] }, { ...visit, start: '12:00' }, place('r')), '10:53 到，等 67 分（12:00 才開始）');
  // 沒有指定開始時間的造訪：等開門
  const open = entry('visit', 'r', { arrive: '09:40', start: '10:00', waitMinutes: 20 });
  assert.equal(waitNote(open, visit, place('r')), '09:40 到，等 20 分（10:00 才開門）');
  // 不是造訪（自由時間的指定時間）：不寫原因
  assert.equal(waitNote(open, null, undefined), '09:40 到，等 20 分');
  assert.equal(waitNote(entry('visit', 'r'), visit, place('r')), null);
});

test('timelineRows：等待的空檔（idle）不另外一列，「住宿（未排）」照舊放在最後', () => {
  const gap = (kind: 'idle' | 'lodging', afterItemId: string | null, beforeItemId: string | null) => ({ kind, date: '2027-02-03', label: kind === 'idle' ? '空檔 67 分' : '住宿（未排）', from: null, to: null, afterItemId, beforeItemId });
  const split = entry('meet', 'meet-pt', { itemId: 'sp', groups: [{ id: 'g1', name: 'A', entries: [entry('visit', 'ga')] }] });
  const day = {
    entries: [entry('start', 'hotel'), entry('visit', 'a'), entry('visit', 'r', { waitMinutes: 67 }), split],
    gaps: [gap('idle', 'a', 'r'), gap('idle', 'r', 'sp'), gap('lodging', 'sp', null)],
  } as unknown as DayPlan;
  const rows = timelineRows(day);
  assert.deepEqual(
    rows.map((r) => (r.kind === 'gap' ? `gap:${r.gap.kind}` : `entry:${r.entry.placeId}`)),
    ['entry:hotel', 'entry:a', 'entry:r', 'entry:meet-pt', 'gap:lodging'],
  );
  assert.ok(rows.every((r) => r.kind === 'gap' || !('gapsBeforeMeet' in r)));
});

test('dayBar：類型色段落、交通、等待', () => {
  // 2/3 的形狀：出發住宿 → 橫山展望台（景點）→ La Mer（餐廳，📌 等）→ 回住宿
  const day = {
    entries: [
      entry('start', 'hotel', { start: '09:30', end: '09:30' }),
      entry('visit', 'yokoyama', { itemId: 'v1', travel: leg('09:30', 11), arrive: '09:41', start: '09:41', end: '10:41' }),
      entry('visit', 'lamer', { itemId: 'v2', travel: leg('10:41', 12), arrive: '10:53', start: '12:00', end: '13:30' }),
      entry('lodging', 'hotel', { itemId: null, travel: leg('13:30', 16), arrive: '13:46', start: '13:46', end: '13:46' }),
    ],
  } as unknown as DayPlan;
  const types: Record<string, 'spot' | 'restaurant' | 'lodging'> = { hotel: 'lodging', yokoyama: 'spot', lamer: 'restaurant' };
  const bar = dayBar(day, (id) => (id ? (types[id] ?? null) : null));
  assert.deepEqual(bar.map((s) => s.kind), ['travel', 'spot', 'travel', 'wait', 'restaurant', 'travel']);
  assert.deepEqual(bar.map((s) => s.mark), [null, '1', null, null, '2', null]);
  assert.deepEqual(bar.map((s) => [s.from, s.to]), [
    ['09:30', '09:41'],
    ['09:41', '10:41'],
    ['10:41', '10:53'],
    ['10:53', '12:00'],
    ['12:00', '13:30'],
    ['13:30', '13:46'],
  ]);
});

test('dayBar：交通卡裡的等車切成 wait 段；不是景點、餐廳的停留是 other；分組每組一條 lane', () => {
  const transit = { ...busLeg, depart: '10:00', arrive: '11:00', ready: ['10:10'], rides: [{ ...busLeg.rides[0], depart: '10:30', arrive: '10:52' }] };
  const split = entry('meet', 'm', {
    itemId: 's',
    arrive: '12:00',
    start: '12:00',
    end: '12:00',
    groups: [
      { id: 'g1', name: 'A', entries: [entry('visit', 'ga', { itemId: 'ga', travel: leg('11:30', 20), arrive: '11:50', start: '11:50', end: '11:55' })] },
      { id: 'g2', name: 'B', entries: [entry('visit', 'gb', { itemId: 'gb', travel: leg('11:30', 10), arrive: '11:40', start: '11:45', end: '11:50' })] },
    ],
  });
  const day = {
    entries: [entry('start', 'h', { start: '10:00', end: '10:00' }), entry('visit', 'st', { itemId: 'v1', travel: transit, arrive: '11:00', start: '11:00', end: '11:30' }), split],
  } as unknown as DayPlan;
  const bar = dayBar(day, (id) => (id === 'st' ? 'station' : 'spot'));
  assert.deepEqual(bar.filter((s) => s.lane === 0).map((s) => [s.kind, s.from, s.to, s.itemId]), [
    ['travel', '10:00', '10:10', 'v1'],
    ['wait', '10:10', '10:30', 'v1'],
    ['travel', '10:30', '11:00', 'v1'],
    ['other', '11:00', '11:30', 'v1'],
  ]);
  assert.deepEqual(bar.filter((s) => s.lane === 2).map((s) => [s.kind, s.from, s.to, s.mark]), [
    ['travel', '11:30', '11:40', null],
    ['wait', '11:40', '11:45', null],
    ['spot', '11:45', '11:50', '3'],
  ]);
});

test('rideReadyAt：用引擎的 ready，沒有時第一程用出發、之後用前一程到站', () => {
  assert.equal(rideReadyAt(busLeg, 0), '15:15');
  const old = { depart: '10:00', rides: [{ arrive: '10:30' }, { arrive: '10:45' }] } as unknown as Parameters<typeof rideReadyAt>[0];
  assert.equal(rideReadyAt(old, 0), '10:00');
  assert.equal(rideReadyAt(old, 1), '10:30');
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

test('feedFilter：手機探索的類型、地區、快速篩選換成 Filter；認不得的條件略過；不看地圖範圍', () => {
  assert.deepEqual(feedFilter(EMPTY_FEED), EMPTY_FILTER);
  assert.deepEqual(feedFilter({ type: 'restaurant', area: 'toba', quick: ['fit15:yes', 'tiers:S', 'tiers:A', 'votes:popular', 'regions:toba-x'] }), {
    ...EMPTY_FILTER,
    types: ['restaurant'],
    areas: ['toba'],
    fit15: ['yes'],
    tiers: ['S', 'A'],
    votes: ['popular'],
    regions: ['toba-x'],
  });
  // 類型、地區只看 type、area；壞掉的條件略過
  assert.deepEqual(feedFilter({ type: 'all', area: null, quick: ['types:spot', 'areas:ise', 'nope:1', 'bad', ':x'] }), EMPTY_FILTER);
  assert.deepEqual(wishFilter('spot', null), { ...EMPTY_FILTER, types: ['spot'] });
  assert.deepEqual(wishFilter('lodging', 'ise'), { ...EMPTY_FILTER, types: ['lodging'], areas: ['ise'] });
  // 全部類型：車站照樣不列；bounds 給 null＝不看範圍
  const ps = [place('s1', { type: 'station' }), place('a', { type: 'spot', coords: [140, 40] }), place('b', { type: 'restaurant' })];
  assert.deepEqual(explorePlaces(ps, feedFilter(EMPTY_FEED), null, 'recommend', () => 0).map((p) => p.id).sort(), ['a', 'b']);
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

test('legTitle：方式＋分鐘，電車、巴士、船都叫大眾運輸', () => {
  assert.equal(legTitle(legWith({ mode: 'train', minutes: 34, waitMinutes: 11 })), '大眾運輸 34 分');
  assert.equal(legTitle(legWith({ mode: 'taxi', minutes: 12 })), '計程車 12 分');
  assert.equal(legTitle(legWith({ mode: 'walk', minutes: 8 })), '步行 8 分');
  assert.equal(legTitle(legWith({ mode: 'charter', minutes: 30 })), '包車 30 分');
  assert.equal(legTitle(legWith({ mode: 'unknown', minutes: 0 })), '交通未定 0 分');
  assert.equal(legTitle(legWith({ mode: 'none' })), '');
  assert.equal(legModeName('bus'), '大眾運輸');
  assert.equal(legModeName('transit'), '大眾運輸');
});

test('taxiCarsText：計程車的台數（收合時第二行）；不是計程車是 null', () => {
  assert.equal(taxiCarsText(legWith({ mode: 'taxi', taxi: { cars: 4, jumboCars: 2, fareEstimateYen: 3200 } as never })), '大型 2 台或一般 4 台');
  assert.equal(taxiCarsText(legWith({ mode: 'taxi', taxi: { cars: 2, jumboCars: null } as never })), '2 台');
  assert.equal(taxiCarsText(legWith({ mode: 'walk' })), null);
});

test('showMinutesInput：算不出來（交通未定、指定的方式找不到班次、缺座標）或填過分鐘才有分鐘欄', () => {
  const leg = (over: Record<string, unknown>) => ({ mode: 'walk', minutes: 5, basis: '步行估算', ...over }) as unknown as Parameters<typeof showMinutesInput>[0];
  assert.equal(showMinutesInput(leg({}), null), false);
  assert.equal(showMinutesInput(leg({ mode: 'unknown', minutes: 0, basis: '找不到交通方式' }), null), true);
  // 指定舊的電車、時刻表找不到：引擎照 train 回傳 0 分，警告要填 minutes
  assert.equal(showMinutesInput(leg({ mode: 'train', minutes: 0, basis: '找不到班次' }), { mode: 'train' }), true);
  assert.equal(showMinutesInput(leg({ mode: 'charter', minutes: 0, basis: '缺座標' }), { mode: 'charter' }), true);
  assert.equal(showMinutesInput(leg({ mode: 'train', minutes: 165, basis: '指定' }), { mode: 'train', minutes: 165 }), true);
  assert.equal(showMinutesInput(leg({ mode: 'walk', minutes: 0, basis: '指定' }), { minutes: 0 }), true);
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

test('formatStay：X小時MM分', () => {
  assert.equal(formatStay(45), '0小時45分');
  assert.equal(formatStay(60), '1小時00分');
  assert.equal(formatStay(315), '5小時15分');
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

test('cardTime：起點、終點只寫一個時間；其他寫開始–結束', () => {
  assert.deepEqual(cardTime(entry('start', null, { start: '09:30', end: '09:30' })), { text: '09:30 出發', stay: null });
  assert.deepEqual(cardTime(entry('lodging', 'h', { arrive: '15:10', start: '15:10', end: '15:10' })), { text: '15:10 到住宿', stay: null });
  assert.deepEqual(cardTime(entry('visit', 'a', { start: '09:42', end: '11:12' })), { text: '09:42–11:12', stay: 90 });
  assert.deepEqual(cardTime(entry('visit', 'a', { start: '09:42', end: '09:42' })), { text: '09:42', stay: null });
});

test('DAY_PALETTE：4 色彼此、和類型色分得出來', () => {
  assert.deepEqual(DAY_PALETTE, ['#c2255c', '#0b7285', '#343a40', '#8b5a2b']);
  for (const c of DAY_PALETTE) assert.ok(labOf(c)[0] <= 70, `${c} 太淺，畫在淺色地圖上看不清楚`);
  for (const [i, a] of DAY_PALETTE.entries()) {
    for (const b of DAY_PALETTE.slice(i + 1)) assert.ok(deltaE(a, b) >= 20, `${a} 和 ${b} 太像（ΔE ${deltaE(a, b).toFixed(0)}）`);
    for (const t of Object.values(TYPE_COLORS)) assert.ok(deltaE(a, t) >= 20, `${a} 和類型色 ${t} 太像（ΔE ${deltaE(a, t).toFixed(0)}）`);
  }
  // 照日期順序輪流
  const dates = ['2027-02-02', '2027-02-03', '2027-02-04', '2027-02-05', '2027-02-06'];
  assert.equal(dayColor(dates, '2027-02-06'), '#c2255c');
  assert.equal(dayColor(dates, '2027-02-03'), '#0b7285');
});

test('copyText：日文名稱優先，沒有用中文', () => {
  assert.equal(copyText(place('a', { name: { ja: '鳥羽水族館', zh: '鳥羽水族館（中）' } })), '鳥羽水族館');
  assert.equal(copyText(place('b', { name: { ja: '', zh: '海女小屋' } })), '海女小屋');
});

test('shownWarnings：看主卡是全部；看備卡只留指名那張備卡的', () => {
  const list = [
    { code: 'closed', level: 'warning' as const, message: '公休', itemId: 'i1', placeId: 'main' },
    { code: 'late', level: 'info' as const, message: '晚了', itemId: 'i1' },
    { code: 'closed', level: 'warning' as const, message: '公休', itemId: 'i1', placeId: 'b' },
  ];
  assert.equal(shownWarnings(list, 'main', true), list);
  assert.deepEqual(shownWarnings(list, 'b', false), [list[2]]);
  assert.equal(shownWarnings(list, 'c', false), undefined);
  assert.equal(shownWarnings(undefined, 'b', false), undefined);
});

test('warningsByItem：交通的警告（leg: true）不掛到資料卡、也不進整天的警告（交通卡自己顯示）；計程車台數照舊不列', () => {
  const day = {
    warnings: [
      { code: 'closed', level: 'warning' as const, message: '公休', itemId: 'i1' },
      { code: 'bus-crowd', level: 'warning' as const, message: '擠不上', itemId: 'i1', leg: true as const },
      { code: 'ticket-tight', level: 'warning' as const, message: '買票', leg: true as const },
      { code: 'taxi', level: 'info' as const, message: '台數', itemId: 'i2' },
      { code: 'no-rest', level: 'warning' as const, message: '累' },
    ],
  } as unknown as DayPlan;
  const { byItem, day: rest } = warningsByItem(day);
  assert.deepEqual(byItem.get('i1')?.map((w) => w.code), ['closed']);
  assert.equal(byItem.has('i2'), false);
  assert.deepEqual(rest.map((w) => w.code), ['no-rest']);
  // 當天摘要的數字照舊全部算
  assert.equal(daySummary({ ...day, entries: [] } as DayPlan).warnings, 4);
});

test('warningsByItem：分組各組走到會合點那段的交通警告（itemId 是分組）沒有交通卡，留在分組卡', () => {
  const day = {
    entries: [
      { kind: 'visit', itemId: 'i1' },
      { kind: 'meet', itemId: 's1', groups: [{ id: 'g1', name: 'A', entries: [{ kind: 'visit', itemId: 'g1a' }] }] },
    ],
    warnings: [
      { code: 'travel-unknown', level: 'error' as const, message: '缺座標', itemId: 's1', groupId: 'g1', leg: true as const },
      { code: 'meet-late', level: 'error' as const, message: '來不及', itemId: 's1', groupId: 'g1' },
      // 組裡資料卡那段有交通卡：照舊不掛到資料卡
      { code: 'bus-crowd', level: 'warning' as const, message: '擠不上', itemId: 'g1a', groupId: 'g1', leg: true as const },
      { code: 'bus-crowd', level: 'warning' as const, message: '擠不上', itemId: 'i1', leg: true as const },
    ],
  } as unknown as DayPlan;
  const { byItem } = warningsByItem(day);
  assert.deepEqual(byItem.get('s1')?.map((w) => w.code), ['travel-unknown', 'meet-late']);
  assert.equal(byItem.has('g1a'), false);
  assert.equal(byItem.has('i1'), false);
});

test('hourTicks：整點刻度的位置（百分比）', () => {
  const ticks = hourTicks(9 * 60 + 30, 13 * 60 + 30);
  assert.deepEqual(ticks.map((t) => t.label), ['10', '11', '12', '13']);
  assert.deepEqual(ticks.map((t) => t.pct), [12.5, 37.5, 62.5, 87.5]);
  assert.deepEqual(hourTicks(600, 600).map((t) => t.label), ['10']);
});

test('formatTravelTotal：不到 60 分寫分鐘，之後寫小時', () => {
  assert.equal(formatTravelTotal(39), '39 分');
  assert.equal(formatTravelTotal(60), '1小時00分');
  assert.equal(formatTravelTotal(125), '2小時05分');
});

test('isBarSelected、selectedBarKey：交通段看 legKey，停留看項目 ID', () => {
  const travel = { kind: 'travel', from: '09:00', to: '09:10', itemId: 'v1', lane: 0, mark: null, legKey: '2027-02-03:visit:v1' } as const;
  const stay = { ...travel, kind: 'spot', legKey: null } as const;
  assert.equal(isBarSelected(travel, '2027-02-03:visit:v1'), true);
  assert.equal(isBarSelected(travel, 'v1'), false);
  assert.equal(isBarSelected(stay, 'v1'), true);
  assert.equal(isBarSelected(stay, null), false);
  const day = { date: '2027-02-03', entries: [entry('start', 'h', {}), entry('visit', 'a', { itemId: 'v1' })] } as unknown as DayPlan;
  assert.equal(selectedBarKey(day, '2027-02-03:visit:v1', 'a'), '2027-02-03:visit:v1');
  assert.equal(selectedBarKey(day, '2027-02-04:lodging', 'a'), 'v1');
  assert.equal(selectedBarKey(day, null, null), null);
});

test('這天的標題：日期、週幾、第幾天、最常出現的地區', async () => {
  const { dayAreaName, dayTitle } = await import('../src/lib/dayTitle.ts');
  const byId = new Map([
    ['a', { area: 'toba' }],
    ['b', { area: 'toba' }],
    ['c', { area: 'ise' }],
    ['d', { area: null }],
  ]) as never;
  const areas = [
    { id: 'ise', name: { ja: '伊勢', zh: '伊勢' } },
    { id: 'toba', name: { ja: '鳥羽', zh: '鳥羽' } },
  ] as never;
  const stops = (ids: string[]) => ids.map((place) => ({ itemId: null, place, kind: 'visit', time: null })) as never;
  assert.equal(dayAreaName(stops(['c', 'a', 'b']), byId, areas), '鳥羽');
  assert.equal(dayAreaName(stops(['c', 'a']), byId, areas), '伊勢');
  assert.equal(dayAreaName(stops(['d']), byId, areas), null);
  assert.deepEqual(dayTitle('2027-02-05', '鳥羽'), { date: '2/5', sub: '週五 · 第 4 天 · 鳥羽' });
  assert.deepEqual(dayTitle('2027-02-02', null), { date: '2/2', sub: '週二 · 第 1 天' });
});

// T15m 第七輪 §8.2：選中一個點時地圖能不動就不動
import { selectCamera, visibleArea } from '../src/lib/mapCamera.ts';

const R = { left: 0, top: 0, right: 800, bottom: 600 };
test('selectCamera：看得到就不動', () => assert.deepEqual(selectCamera({ x: 200, y: 200 }, R, 14), { kind: 'stay' }));
test('selectCamera：被面板蓋住算看不到', () => assert.deepEqual(selectCamera({ x: 200, y: 700 }, { left: 0, top: 0, right: 390, bottom: 330 }, 14), { kind: 'pan' }));
test('selectCamera：太遠才拉到 13', () => assert.deepEqual(selectCamera({ x: 900, y: 200 }, R, 10), { kind: 'zoom', zoom: 13 }));
test('selectCamera：貼著邊（24px 內）算看不到；縮放 12 以上只平移', () => {
  assert.deepEqual(selectCamera({ x: 790, y: 300 }, R, 12), { kind: 'pan' });
  assert.deepEqual(selectCamera({ x: 776, y: 300 }, R, 11), { kind: 'stay' });
});
test('visibleArea：扣掉蓋在地圖上的東西（下面的面板、右邊的浮動詳情），只扣蓋到的那一邊', () => {
  const box = { left: 0, top: 0, right: 1000, bottom: 800 };
  // 右邊浮動的詳情（上下留一點空）
  assert.deepEqual(visibleArea(box, [{ left: 600, top: 16, right: 984, bottom: 784 }]), { left: 0, top: 0, right: 600, bottom: 800 });
  // 下面的面板
  assert.deepEqual(visibleArea(box, [{ left: 0, top: 500, right: 1000, bottom: 900 }]), { left: 0, top: 0, right: 1000, bottom: 500 });
  // 沒蓋到地圖的不算
  assert.deepEqual(visibleArea(box, [{ left: 1100, top: 0, right: 1300, bottom: 800 }]), box);
});
