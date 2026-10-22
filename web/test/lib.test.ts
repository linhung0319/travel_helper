import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAreas, normalizePlace } from '../src/data/normalize.ts';
import { areasExtent, bboxGapMeters, groupAreas, initialExtent } from '../src/lib/areas.ts';
import { photoCandidates, wikimediaThumb } from '../src/lib/photos.ts';
import { departuresAround, terminusName } from '../src/lib/timetable.ts';
import { dayLabel, hoursKeys, timetableDayType, tripDates } from '../src/lib/trip.ts';
import { EMPTY_FILTER, filterChips, matchesFilter } from '../src/lib/filter.ts';
import { closedDaysLabel, rowForDate } from '../src/lib/hours.ts';
import { nearbyPlaces } from '../src/lib/nearby.ts';
import { placeVisual, wallPlaces } from '../src/lib/visual.ts';
import { placeDays } from '../src/lib/itinerary.ts';
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
  const days = placeDays({ days: [{ date: '2027-02-05', items: [{ place: 'a' }, { place: 'b' }] }] });
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
