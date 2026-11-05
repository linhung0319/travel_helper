// 每晚住哪一區（T45a）：nights 的讀寫、一天在哪一區、連住第幾晚、升級、檢查、時間軸、改了什麼、摘要
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ItineraryError,
  buildTripSummary,
  createItinerary,
  createPlanCache,
  dayAreaLabel,
  dayAreaOf,
  describeChanges,
  diffItinerary,
  formatDay,
  lodgingMealsOn,
  lodgingOn,
  nightAreaOf,
  nightDates,
  nightRunOf,
  nightsAt,
  planItinerary,
  resolveConfig,
  setDayArea,
  setLodging,
  setNightArea,
  upgradeItinerary,
  validateItinerary,
  type Itinerary,
} from '../src/index.ts';
import { at, fake, lodging } from './synthetic.ts';

const [D1, D2, D3, D4] = ['2027-02-02', '2027-02-03', '2027-02-04', '2027-02-05'];
const LAST = '2027-02-13';
const AREA_OF: Record<string, string> = { 'shima-inn': 'shima', 'toba-inn': 'toba', 'toba-inn2': 'toba' };
const areaOf = (id: string) => AREA_OF[id] ?? null;
const NAMES: Record<string, string> = { shima: '志摩', toba: '鳥羽', ise: '伊勢', kix: '關西機場' };
const areaName = (id: string) => NAMES[id] ?? null;

test('createItinerary：nights 是空的，days 裡沒有住宿欄位', () => {
  const it = createItinerary();
  assert.deepEqual(it.nights, {});
  assert.ok(it.days.every((d) => !('lodging' in d)));
  assert.deepEqual(validateItinerary(it), []);
  assert.equal(nightDates(it).length, 11);
  assert.ok(!nightDates(it).includes(LAST));
});

test('setNightArea、setLodging：只定區、選住宿、清住宿留區、換區清住宿、清區整晚拿掉', () => {
  let it = setNightArea(createItinerary(), D1, 'shima');
  assert.deepEqual(it.nights[D1], { area: 'shima' });
  it = setLodging(it, D1, 'shima-inn', 'breakfast', 'shima');
  assert.deepEqual(it.nights[D1], { area: 'shima', lodging: 'shima-inn', meals: 'breakfast' });
  assert.equal(lodgingOn(it, D1), 'shima-inn');
  assert.equal(lodgingMealsOn(it, D1), 'breakfast');
  // 同一區再設一次：住宿留著
  assert.deepEqual(setNightArea(it, D1, 'shima').nights[D1], it.nights[D1]);
  // 清住宿：區留著，方案一起清
  assert.deepEqual(setLodging(it, D1, null).nights[D1], { area: 'shima' });
  // 換到別區：住宿要在這區，清掉
  assert.deepEqual(setNightArea(it, D1, 'toba').nights[D1], { area: 'toba' });
  // 清區：整晚拿掉
  assert.equal(setNightArea(it, D1, null).nights[D1], undefined);
  // 沒給區（undefined）時留原本的區；沒有區時只有住宿
  assert.deepEqual(setLodging(createItinerary(), D2, 'toba-inn').nights[D2], { lodging: 'toba-inn' });
  // 不改傳進來的行程
  assert.deepEqual(createItinerary().nights, {});
});

test('setNightArea：只選了住宿、沒寫區的晚上，current 是推出來的區；同區時住宿留著', () => {
  const it = setLodging(createItinerary(), D2, 'toba-inn');
  assert.deepEqual(setNightArea(it, D2, 'toba', nightAreaOf(it, D2, areaOf)).nights[D2], { area: 'toba', lodging: 'toba-inn' });
  assert.deepEqual(setNightArea(it, D2, 'ise', nightAreaOf(it, D2, areaOf)).nights[D2], { area: 'ise' });
});

test('最後一天沒有晚上；行程裡沒有的日期丟錯', () => {
  assert.throws(() => setLodging(createItinerary(), LAST, 'h'), ItineraryError);
  assert.throws(() => setNightArea(createItinerary(), LAST, 'kix'), ItineraryError);
  assert.throws(() => setNightArea(createItinerary(), '2027-03-01', 'kix'), ItineraryError);
});

test('setDayArea：寫一日遊、null 拿掉', () => {
  const it = setDayArea(createItinerary(), D3, 'ise');
  assert.equal(it.days[2].dayArea, 'ise');
  assert.ok(!('dayArea' in setDayArea(it, D3, null).days[2]));
  assert.deepEqual(validateItinerary(it), []);
});

test('nightAreaOf：有寫 area 用它；沒寫照住宿的區；都沒有是 null', () => {
  let it = setNightArea(createItinerary(), D1, 'shima');
  it = setLodging(it, D2, 'toba-inn');
  assert.equal(nightAreaOf(it, D1), 'shima');
  assert.equal(nightAreaOf(it, D2), null, '沒給 areaOf 推不出來');
  assert.equal(nightAreaOf(it, D2, areaOf), 'toba');
  assert.equal(nightAreaOf(it, D3, areaOf), null);
  assert.equal(nightAreaOf(null, D1), null);
});

/** 志摩 2 晚 → 鳥羽 2 晚（第 2 晚只選了住宿）→ 2/6 還沒定 */
function trip(): Itinerary {
  let it = createItinerary();
  it = setNightArea(it, D1, 'shima');
  it = setLodging(it, D2, 'shima-inn', null, 'shima');
  it = setLodging(it, D3, 'toba-inn', null, 'toba');
  it = setLodging(it, D4, 'toba-inn');
  return it;
}

test('dayAreaOf：同區就是那區、不同區是移動日、一日遊、第一天、最後一天、沒決定', () => {
  const it = trip();
  // 第一天沒有前一晚：用這晚的
  assert.deepEqual(dayAreaOf(it, D1, areaOf), { area: 'shima', from: 'shima', to: 'shima', move: false, dayTrip: false });
  assert.equal(dayAreaOf(it, D2, areaOf)?.area, 'shima');
  assert.deepEqual(dayAreaOf(it, D3, areaOf), { area: null, from: 'shima', to: 'toba', move: true, dayTrip: false });
  // D4 只選了住宿、沒寫區：照住宿推
  assert.equal(dayAreaOf(it, D4, areaOf)?.area, 'toba');
  // 2/6 這晚沒定：不知道
  assert.deepEqual(dayAreaOf(it, '2027-02-06', areaOf), { area: null, from: 'toba', to: null, move: false, dayTrip: false });
  // 一日遊
  const day = dayAreaOf(setDayArea(it, D4, 'ise'), D4, areaOf);
  assert.deepEqual(day, { area: 'ise', from: 'toba', to: 'toba', move: false, dayTrip: true });
  // 最後一天沒有這晚：用前一晚的
  const end = setNightArea(createItinerary(), '2027-02-12', 'kix');
  assert.deepEqual(dayAreaOf(end, LAST), { area: 'kix', from: 'kix', to: 'kix', move: false, dayTrip: false });
  assert.equal(dayAreaOf(it, '2027-03-01'), null);
});

test('dayAreaLabel：「鳥羽」「志摩 → 鳥羽」「鳥羽（去伊勢一日）」、沒決定是 null', () => {
  const it = setDayArea(trip(), D4, 'ise');
  assert.equal(dayAreaLabel(dayAreaOf(it, D2, areaOf), areaName), '志摩');
  assert.equal(dayAreaLabel(dayAreaOf(it, D3, areaOf), areaName), '志摩 → 鳥羽');
  assert.equal(dayAreaLabel(dayAreaOf(it, D4, areaOf), areaName), '鳥羽（去伊勢一日）');
  assert.equal(dayAreaLabel(dayAreaOf(it, '2027-02-06', areaOf), areaName), null);
  // 沒給名稱用 ID
  assert.equal(dayAreaLabel(dayAreaOf(it, D3, areaOf)), 'shima → toba');
  // 一日遊但晚上還沒定：只寫白天去的區
  assert.equal(dayAreaLabel(dayAreaOf(setDayArea(createItinerary(), D3, 'ise'), D3), areaName), '伊勢');
});

test('nightRunOf：連住第幾晚（同一間、同一區），沒選是 null；nightsAt 列住某間的晚上', () => {
  let it = trip();
  it = setLodging(it, '2027-02-06', 'toba-inn2', null, 'toba');
  assert.deepEqual(nightRunOf(it, D4, 'lodging'), { index: 2, total: 2, first: D3, last: D4 });
  assert.deepEqual(nightRunOf(it, '2027-02-06', 'lodging'), { index: 1, total: 1, first: '2027-02-06', last: '2027-02-06' });
  // 同一區：D4 沒寫區，照住宿推
  assert.deepEqual(nightRunOf(it, D4, 'area', areaOf), { index: 2, total: 3, first: D3, last: '2027-02-06' });
  assert.deepEqual(nightRunOf(it, D1, 'area'), { index: 1, total: 2, first: D1, last: D2 });
  assert.equal(nightRunOf(it, D1, 'lodging'), null, 'D1 只定了區');
  assert.equal(nightRunOf(it, LAST, 'area'), null);
  assert.deepEqual(nightsAt(it, 'toba-inn'), [D3, D4]);
});

test('upgradeItinerary：每天的 lodging、lodgingMeals 搬到 nights；有 areaOf 時寫區；最後一天的丟掉；乾淨的原樣回傳', () => {
  const old = createItinerary() as Itinerary & { nights?: unknown };
  delete old.nights;
  old.days.forEach((d, i) => Object.assign(d, { lodging: i < 2 ? 'shima-inn' : i === 11 ? 'x' : null, lodgingMeals: i === 1 ? 'none' : null }));
  assert.ok(validateItinerary(old).some((e) => e.includes('upgradeItinerary')), '舊格式 validate 擋下來');
  const up = upgradeItinerary(old);
  assert.deepEqual(up.nights, { [D1]: { lodging: 'shima-inn' }, [D2]: { lodging: 'shima-inn', meals: 'none' } });
  assert.ok(up.days.every((d) => !('lodging' in d) && !('lodgingMeals' in d)));
  assert.deepEqual(validateItinerary(up), []);
  assert.ok('lodging' in old.days[0], '不改傳進來的');
  assert.deepEqual(upgradeItinerary(old, areaOf).nights[D1], { area: 'shima', lodging: 'shima-inn' });
  const clean = createItinerary();
  assert.equal(upgradeItinerary(clean), clean);
  assert.equal(upgradeItinerary(up), up);
});

test('validateItinerary：nights 的日期、欄位、方案', () => {
  const it = createItinerary();
  const bad = (nights: unknown) => validateItinerary({ ...it, nights } as Itinerary);
  assert.ok(bad(undefined).some((e) => e.includes('nights 要是物件')));
  assert.ok(bad([]).some((e) => e.includes('nights 要是物件')));
  assert.ok(bad({ [LAST]: { area: 'kix' } }).some((e) => e.includes('最後一天沒有晚上')));
  assert.ok(bad({ '2027-03-01': { area: 'kix' } }).some((e) => e.includes('有晚上的日期')));
  assert.ok(bad({ [D1]: { area: 3 } }).some((e) => e.includes('area')));
  assert.ok(bad({ [D1]: { lodging: '' } }).some((e) => e.includes('lodging')));
  assert.ok(bad({ [D1]: { meals: 'lunch' } }).some((e) => e.includes('meals')));
  assert.ok(bad({ [D1]: null }).some((e) => e.includes('要是物件')));
  assert.deepEqual(bad({ [D1]: { area: 'shima', lodging: null, meals: null } }), []);
  const day = { ...it, days: it.days.map((d, i) => (i === 2 ? { ...d, dayArea: 5 } : d)) } as unknown as Itinerary;
  assert.ok(validateItinerary(day).some((e) => e.includes('dayArea')));
});

const H = lodging('toba-inn', at(0), { area: 'toba' } as never);
const DATA = fake([H]);

test('時間軸：住宿卡從 nights 畫；只定區是住宿未排；住宿不在這晚的區時警告', () => {
  let it = setLodging(setNightArea(createItinerary(), D2, 'toba'), D3, 'toba-inn', null, 'toba');
  const p = planItinerary(it, DATA);
  const day3 = p.days.find((d) => d.date === D3)!;
  assert.equal(day3.entries.at(-1)?.kind, 'lodging');
  assert.equal(day3.entries.at(-1)?.placeId, 'toba-inn');
  assert.ok(!day3.gaps.some((g) => g.kind === 'lodging'));
  // 隔天從這晚的住宿出發
  assert.equal(p.days.find((d) => d.date === D4)!.entries[0]?.placeId, 'toba-inn');
  // 只定了區：還是「住宿（未排）」
  assert.ok(p.days.find((d) => d.date === D2)!.gaps.some((g) => g.kind === 'lodging'));
  assert.ok(!day3.warnings.some((w) => w.code === 'lodging-area-mismatch'));
  it = setLodging(it, D3, 'toba-inn', null, 'ise');
  const mis = planItinerary(it, DATA).days.find((d) => d.date === D3)!.warnings.find((w) => w.code === 'lodging-area-mismatch');
  assert.deepEqual([mis?.level, mis?.message], ['act', '不在這晚選的區']);
  const named = planItinerary(it, { ...DATA, areaNames: { ise: '伊勢' } }).days.find((d) => d.date === D3)!.warnings.find((w) => w.code === 'lodging-area-mismatch');
  assert.equal(named?.message, '不在這晚選的伊勢');
});

test('只重算有改的那天：改了這晚的住宿，這天和隔天重算，其他天沿用', () => {
  const cache = createPlanCache();
  const cfg = resolveConfig({});
  const it = setLodging(createItinerary(), D2, 'toba-inn', null, 'toba');
  const a = planItinerary(it, DATA, cfg, cache);
  const b = planItinerary(setLodging(it, D3, 'toba-inn', null, 'toba'), DATA, cfg, cache);
  const same = (date: string) => a.days.find((d) => d.date === date) === b.days.find((d) => d.date === date);
  assert.ok(same(D1) && same(D2));
  assert.ok(!same(D3) && !same(D4));
  assert.ok(same('2027-02-06'));
});

test('diffItinerary、describeChanges：住的區、住宿、一日遊', () => {
  const before = setNightArea(createItinerary(), D1, 'shima');
  let after = setLodging(setNightArea(before, D1, 'toba'), D1, 'toba-inn');
  after = setDayArea(after, D2, 'ise');
  const changes = diffItinerary(before, after);
  assert.deepEqual(
    changes.map((c) => [c.kind, c.date, c.before, c.after]),
    [
      ['night-area', D1, 'shima', 'toba'],
      ['lodging', D1, null, 'toba-inn'],
      ['day-area', D2, null, 'ise'],
    ],
  );
  assert.deepEqual(describeChanges(changes, { nameOf: (id) => (id === 'toba-inn' ? '鳥羽旅館' : id), areaName: (id) => NAMES[id] ?? id }), [
    '2/2：住的區 志摩 → 鳥羽',
    '2/2：住宿 （無） → 鳥羽旅館',
    '2/3：白天去伊勢一日遊',
  ]);
  assert.deepEqual(describeChanges(diffItinerary(after, before), { areaName: (id) => NAMES[id] ?? id }).at(-1), '2/3：不排一日遊（原本去伊勢）');
});

test('摘要（LINE）：日期旁寫這天在哪一區；只定區寫「住：志摩（還沒選住宿）」', () => {
  let it = setNightArea(createItinerary(), D1, 'shima');
  it = setLodging(it, D2, 'toba-inn', null, 'toba');
  const plan = planItinerary(it, DATA);
  const s = buildTripSummary({ itinerary: it, plan, nameOf: (id) => (id === 'toba-inn' ? '鳥羽旅館' : null), areaName });
  assert.equal(s.days[0].stayArea, '志摩');
  assert.equal(formatDay(s.days[0]), '2/2（二） 志摩\n11:55 抵達 kansai-airport\n13:20 抵達 kansai-airport\n住：志摩（還沒選住宿）');
  assert.match(formatDay(s.days[1]), /^2\/3（三） 志摩 → 鳥羽\n[\s\S]*住：鳥羽旅館$/);
  assert.equal(formatDay(s.days[2]), '2/4（四）\n還沒排');
  // T45a 之前存的摘要沒有 area、stayArea：照舊
  assert.equal(formatDay({ date: D1, lines: [], lodging: null }), '2/2（二）\n還沒排');
});
