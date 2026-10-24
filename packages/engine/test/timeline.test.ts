// 時間軸推算、衝突檢查、團體與長輩小孩檢查、空檔
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem,
  createItinerary,
  planItinerary,
  selectOption,
  setLodging,
  type ConfigOverride,
  type DayPlan,
  type EngineData,
  type Itinerary,
  type LodgingMeals,
  type NewItem,
  type PartyProfile,
  type PlaceRecord,
  toMinutes,
} from '../src/index.ts';
import { ALL_WEEK, at, fake, lodging, restaurant, spot, station } from './synthetic.ts';

const D = '2027-02-05'; // 週五

const H = lodging('h', at(0));
const A = spot('a', at(400)); // 全員走 10 分
const B = spot('b', at(800)); // a → b 10 分
const C = spot('c', at(1200));
const R = restaurant('r', at(400, 300));
const BASE = [H, A, B, C, R];

interface Opts {
  date?: string;
  lodging?: string | null;
  meals?: LodgingMeals | null;
  prev?: string | null;
  party?: PartyProfile;
}

function build(items: NewItem[], o: Opts = {}): Itinerary {
  const date = o.date ?? D;
  let it = createItinerary(o.party ? { party: o.party } : {});
  const i = it.days.findIndex((d) => d.date === date);
  if (i > 0) it = setLodging(it, it.days[i - 1].date, o.prev === undefined ? 'h' : o.prev);
  if (i < it.days.length - 1) it = setLodging(it, date, o.lodging === undefined ? 'h' : o.lodging, o.meals ?? null);
  for (const item of items) it = addItem(it, date, item).itinerary;
  return it;
}

const visit = (place: string, extra: Record<string, unknown> = {}): NewItem => ({ type: 'visit', options: [{ place, ...(extra.stay != null ? { stayMinutes: extra.stay as number } : {}) }], ...extra, stay: undefined } as NewItem);

function plan(it: Itinerary, data: EngineData, date = D, cfg: ConfigOverride = {}): DayPlan {
  const d = planItinerary(it, data, cfg).days.find((x) => x.date === date);
  assert.ok(d);
  return d;
}
const codes = (d: DayPlan) => d.warnings.map((w) => w.code);
const with_ = (p: PlaceRecord, extra: Partial<PlaceRecord>) => ({ ...p, ...extra }) as PlaceRecord;

test('時間軸：從前一晚的住宿 09:30 出發，抵達、停留、出發，最後回住宿', () => {
  const d = plan(build([visit('a'), visit('b')]), fake(BASE));
  assert.deepEqual(
    d.entries.map((e) => [e.kind, e.placeId, e.arrive, e.start, e.end]),
    [
      ['start', 'h', '09:30', '09:30', '09:30'],
      ['visit', 'a', '09:40', '09:40', '10:40'],
      ['visit', 'b', '10:50', '10:50', '11:50'],
      ['lodging', 'h', '11:53', '11:53', '11:53'],
    ],
  );
  assert.equal(d.entries[1].travel?.mode, 'walk');
  // b → h 800 m：全員走 19 分超過 15 分上限 → 計程車（直線 × 1.3 ÷ 30 km/h ≈ 2.1 → 3 分，不加叫車時間）
  assert.equal(d.entries[3].travel?.mode, 'taxi');
  assert.equal(d.stats.returnTime, '11:53');
  assert.equal(d.stats.walkMinutes, 10 + 10);
});

test('停留時間：選項的 stayMinutes → 資料的 stayMinutes → 餐廳依料理種類（§5.5）', () => {
  const r2 = restaurant('r2', at(400, 300), { cuisine: ['浜焼き・貝'] });
  const d = plan(build([visit('a', { stay: 30 }), visit('r'), visit('r2')]), fake([...BASE, r2]));
  const dur = (i: number) => toMinutes(d.entries[i].end) - toMinutes(d.entries[i].start);
  assert.deepEqual([dur(1), dur(2), dur(3)], [30, 45, 75]);
});

test('時段備案：引擎用 selected 那個選項算；切換後重算', () => {
  let it = build([{ type: 'visit', options: [{ place: 'a' }, { place: 'c' }] }]);
  assert.equal(plan(it, fake(BASE)).entries[1].placeId, 'a');
  const id = it.days.find((d) => d.date === D)?.items[0].id as string;
  it = selectOption(it, id, 1);
  const d = plan(it, fake(BASE));
  assert.equal(d.entries[1].placeId, 'c');
  assert.equal(d.entries[1].travel?.mode, 'taxi');
});

test('營業時間：沒指定時間就等開門', () => {
  const late = with_(A, { hours: { ...ALL_WEEK, fri: [['10:00', '17:00']] } });
  const d = plan(build([visit('a')]), fake([H, late]));
  assert.equal(d.entries[1].start, '10:00');
  assert.equal(d.entries[1].waitMinutes, 20);
  assert.ok(codes(d).includes('wait-open'));
});

test('營業時間：指定的時間還沒開門 → 錯誤', () => {
  const late = with_(A, { hours: { ...ALL_WEEK, fri: [['10:00', '17:00']] } });
  const d = plan(build([visit('a', { start: '09:50' })]), fake([H, late]));
  assert.ok(codes(d).includes('before-open'));
});

test('公休、有日期的休業（closures）→ 錯誤', () => {
  const closed = with_(A, { hours: { ...ALL_WEEK, fri: [] } });
  assert.ok(codes(plan(build([visit('a')]), fake([H, closed]))).includes('closed'));
  const winter = with_(A, { closures: [{ from: '2027-01-10', to: '2027-02-28', note: '冬季休業' }] });
  const w = plan(build([visit('a')]), fake([H, winter])).warnings.find((x) => x.code === 'closed');
  assert.match(w?.message ?? '', /冬季休業/);
});

test('國定假日有寫 holiday 就用 holiday 的時段（2/11 建国記念の日）', () => {
  const p = with_(A, { hours: { ...ALL_WEEK, holiday: [] } });
  assert.ok(codes(plan(build([visit('a')], { date: '2027-02-11' }), fake([H, p]), '2027-02-11')).includes('closed'));
  assert.ok(!codes(plan(build([visit('a')], { date: '2027-02-10' }), fake([H, p]), '2027-02-10')).includes('closed'));
});

test('已經打烊、超過最後入場、停留到打烊之後', () => {
  const short = with_(B, { hours: { ...ALL_WEEK, fri: [['09:00', '10:00']] } });
  assert.ok(codes(plan(build([visit('a'), visit('b')]), fake([H, A, short]))).includes('after-hours'));
  const le = with_(A, { hours: { ...ALL_WEEK, lastEntry: '09:35' } });
  assert.ok(codes(plan(build([visit('a')]), fake([H, le]))).includes('last-entry'));
  const d = plan(build([visit('a', { stay: 480 })]), fake([H, A]));
  assert.ok(codes(d).includes('closes-during'));
});

test('午、晚各有 L.O. 的陣列，依序對應時段', () => {
  const r = with_(R, { hours: { ...ALL_WEEK, fri: [['11:00', '14:00'], ['17:00', '21:00']], lastEntry: ['13:30', '20:00'] } });
  const ok = plan(build([visit('r', { start: '13:00' })]), fake([H, r]));
  assert.ok(!codes(ok).includes('last-entry'));
  const ng = plan(build([visit('r', { start: '13:40' })]), fake([H, r]));
  assert.ok(codes(ng).includes('last-entry'));
});

test('營業時間未查 → 提示（不當成錯誤）', () => {
  const d = plan(build([visit('a')]), fake([H, with_(A, { hours: null })]));
  const w = d.warnings.find((x) => x.code === 'hours-unknown');
  assert.equal(w?.level, 'info');
});

test('指定開始時間：到得比較晚 → 錯誤；到得早 → 等，產生空檔', () => {
  const late = plan(build([visit('a', { start: '09:35' })]), fake(BASE));
  assert.ok(codes(late).includes('late'));
  const early = plan(build([visit('a', { start: '11:00' })]), fake(BASE));
  assert.equal(early.entries[1].start, '11:00');
  const idle = early.gaps.find((g) => g.kind === 'idle');
  assert.deepEqual([idle?.from, idle?.to, idle?.label], ['09:40', '11:00', '空檔 80 分']);
});

test('餐廳在午餐時段內自動算午餐；指定 meal 照指定', () => {
  const d = plan(build([visit('a', { stay: 120 }), visit('r')]), fake(BASE));
  assert.equal(d.entries[2].meal, 'lunch');
  const s = plan(build([visit('r', { meal: 'snack' })]), fake(BASE));
  assert.equal(s.entries[1].meal, 'snack');
});

test('團體：全員用餐 fit15 不是 yes → 警告；no → 錯誤；打電話確認過就不警告', () => {
  const lvl = (r: PlaceRecord) => plan(build([visit('r')]), fake([H, r])).warnings.find((w) => w.code === 'group-seats')?.level;
  assert.equal(lvl(with_(R, { group: { fit15: 'split' } })), 'warning');
  assert.equal(lvl(with_(R, { group: { fit15: 'no' } })), 'error');
  assert.equal(lvl(with_(R, { group: { fit15: 'unknown', confirmed15: { date: '2026-12-01' } } })), undefined);
  assert.equal(lvl(R), undefined);
});

test('團體：全員用餐一定要預約（§5.6）', () => {
  const d = plan(build([visit('r')]), fake([H, with_(R, { reservation: { accepted: 'no' } })]));
  assert.equal(d.warnings.find((w) => w.code === 'no-reservation')?.level, 'error');
});

test('小孩：不接受小孩、有年齡限制的店 → 有小孩時錯誤；只有大人的分組不警告', () => {
  const noKids = with_(R, { kids: { allowed: 'age-limit', minAge: 12 } });
  const whole = plan(build([visit('r')]), fake([H, noKids]));
  assert.match(whole.warnings.find((w) => w.code === 'kids-not-allowed')?.message ?? '', /12 歲/);
  const adults = plan(build([visit('r')], { party: { size: 5, elders: 0, kids: 0 } }), fake([H, noKids]));
  assert.ok(!codes(adults).includes('kids-not-allowed'));
});

function splitItem(g1: NewItem[], g2: NewItem[], meet = { place: 'b', time: '12:00' }, sizes = [6, 9]): NewItem {
  const strip = (x: NewItem) => ({ ...x, id: '', selected: 0 }) as never;
  return {
    type: 'split',
    groups: [
      { id: 'g1', name: '長輩組', size: sizes[0], elders: 5, kids: 0, items: g1.map(strip) },
      { id: 'g2', name: '小孩組', size: sizes[1], elders: 0, kids: 4, items: g2.map(strip) },
    ],
    meet,
  };
}

test('分組：各組自己的時間軸，在會合點會合，之後從會合點、會合時間接著算', () => {
  const d = plan(build([splitItem([visit('a')], [visit('c', { stay: 30 })]), visit('r')]), fake(BASE));
  const meet = d.entries[1];
  assert.equal(meet.kind, 'meet');
  assert.deepEqual(meet.groups?.map((g) => g.entries.map((e) => [e.kind, e.placeId])), [
    [['visit', 'a'], ['meet', 'b']],
    [['visit', 'c'], ['meet', 'b']],
  ]);
  assert.equal(meet.start, '12:00');
  assert.equal(d.entries[2].travel?.depart, '12:00');
  // 分組的步行係數：長輩組 1.2 → h→a 8 分（全員 1.4 是 10 分）
  assert.equal(meet.groups?.[0].entries[0].arrive, '09:38');
});

test('分組：人數加起來不是全員 → 警告；趕不上會合 → 錯誤；分組坐不下 → 錯誤', () => {
  const small = with_(R, { group: { fit15: 'no', fitSubgroup: 'no' } });
  const d = plan(build([splitItem([visit('r')], [visit('a', { stay: 300 })], { place: 'b', time: '11:00' }, [6, 8])]), fake([...BASE.filter((p) => p.id !== 'r'), small]));
  assert.ok(codes(d).includes('split-size'));
  const late = d.warnings.find((w) => w.code === 'meet-late');
  assert.equal(late?.groupId, 'g2');
  assert.ok(d.warnings.some((w) => w.code === 'group-seats' && w.groupId === 'g1'));
});

test('長輩：階梯多 → 警告，那天算累；只有沒長輩的分組去就不警告', () => {
  const stairs = with_(A, { accessibility: { stairs: '多' } });
  const d = plan(build([visit('a')]), fake([H, stairs]));
  assert.ok(codes(d).includes('stairs'));
  assert.ok(d.stats.tiring);
  const g = plan(build([splitItem([], [visit('a')], { place: 'a', time: '12:00' })]), fake([H, stairs]));
  assert.ok(!codes(g).includes('stairs'));
  assert.ok(g.stats.tiring);
});

test('一天累計步行超過 60 分 → 警告', () => {
  const ps = [0, 1, 2, 3, 4, 5].map((k) => spot(`w${k}`, at(600 * k, 0), { stayMinutes: 10 }));
  const d = plan(build(ps.slice(1).map((p) => visit(p.id))), fake([with_(H, { coords: at(0) }), ...ps]));
  assert.ok(d.stats.walkMinutes > 60);
  assert.ok(codes(d).includes('daily-walk'));
});

test('一天太滿：主要景點超過 2 個 → 警告', () => {
  const d = plan(build([visit('a'), visit('b'), visit('c')]), fake(BASE));
  assert.equal(d.stats.mainSpots, 3);
  assert.ok(codes(d).includes('too-full'));
});

test('沒有休息：有長輩小孩時連續活動超過 180 分 → 警告；中間吃飯就重新算', () => {
  const tired = plan(build([visit('a', { stay: 120 }), visit('b', { stay: 120 })]), fake(BASE));
  assert.ok(codes(tired).includes('no-rest'));
  const rested = plan(build([visit('a', { stay: 120 }), visit('r'), visit('b', { stay: 100 })]), fake(BASE));
  assert.ok(!codes(rested).includes('no-rest'));
  const adults = plan(build([visit('a', { stay: 120 }), visit('b', { stay: 120 })], { party: { size: 15, elders: 0, kids: 0 } }), fake(BASE));
  assert.ok(!codes(adults).includes('no-rest'));
});

test('到達日、最後一天不排景點', () => {
  const d = plan(build([visit('a')], { date: '2027-02-02', prev: null }), fake([...BASE, station('kansai-airport', at(500))]), '2027-02-02');
  assert.ok(codes(d).includes('travel-day-spot'));
});

test('一整天都在巴士稀少的子地區 → 建議包車', () => {
  const d = plan(build([visit('a')]), fake(BASE, { regionNeedsCar: { r1: true } }));
  assert.ok(codes(d).includes('charter-suggested'));
});

test('住宿：一泊二食 17:00 前要到；不含晚餐的 17:00 後回也警告；方案不定要填；入住前提示', () => {
  const late = plan(build([visit('a', { stay: 480 })]), fake(BASE));
  assert.match(late.warnings.find((w) => w.code === 'late-return')?.message ?? '', /一泊二食/);
  const none = plan(build([visit('a', { stay: 480 })], { meals: 'none' }), fake(BASE));
  assert.match(none.warnings.find((w) => w.code === 'late-return')?.message ?? '', /天黑早/);
  const varies = plan(build([visit('a')]), fake([with_(H, { meals: 'varies' }), A]));
  assert.ok(codes(varies).includes('lodging-meals-unknown'));
  assert.ok(codes(varies).includes('before-checkin'));
});

test('使用者加的點：照樣算交通，營業時間、團體條件標「未查」不檢查', () => {
  const u = { id: 'user-1', type: 'spot', name: { ja: '自己加的' }, coords: at(400), sources: [] } as PlaceRecord;
  const d = plan(build([visit('user-1')]), fake([H], { users: [u] }));
  assert.equal(d.entries[1].arrive, '09:40');
  assert.ok(codes(d).includes('unchecked'));
  assert.ok(!codes(d).includes('hours-unknown'));
});

test('已下架的點照樣算，但發警告；查不到的點是錯誤', () => {
  const d = plan(build([visit('a')]), fake(BASE, { retired: ['a'] }));
  assert.equal(d.entries[1].end, '10:40');
  assert.ok(codes(d).includes('place-retired'));
  const m = plan(build([visit('nope')]), fake(BASE));
  assert.ok(codes(m).includes('place-missing'));
});

test('航班：第一天從較晚那班的抵達＋出關時間開始；最後一天趕不上起飛前 2 小時 → 錯誤', () => {
  const kix = station('kansai-airport', at(0, 500));
  const k = lodging('k', at(0, 900));
  let it = createItinerary();
  it = setLodging(it, '2027-02-02', 'k');
  it = setLodging(it, '2027-02-12', 'k');
  it = addItem(it, '2027-02-02', visit('k', { stay: 0 }), { index: 2 }).itinerary;
  const data = fake([kix, k]);
  const all = planItinerary(it, data);
  const d1 = all.days[0];
  assert.deepEqual(d1.entries.slice(0, 2).map((e) => [e.kind, e.arrive, e.end]), [
    ['flight', '11:55', '13:10'],
    ['flight', '13:20', '14:35'],
  ]);
  assert.equal(d1.entries[2].travel?.depart, '14:35');
  assert.ok(!d1.gaps.some((g) => g.kind === 'lunch')); // 航班跨過午餐時段
  const d12 = all.days[11];
  assert.equal(d12.entries[0].placeId, 'k');
  assert.ok(!d12.warnings.some((w) => w.code === 'flight-late'));
  const lateIt = addItem(it, '2027-02-13', visit('k', { stay: 120, start: '09:30' })).itinerary;
  const d12b = planItinerary(lateIt, data).days[11];
  assert.ok(d12b.warnings.some((w) => w.code === 'flight-late'));
});

test('空檔：只有住宿（未排）；午餐、晚餐不產生空檔', () => {
  const d = plan(build([visit('a', { stay: 120 }), visit('b', { stay: 120 })], { meals: 'breakfast' }), fake(BASE));
  assert.ok(!d.gaps.some((g) => (g.kind as string) === 'lunch' || (g.kind as string) === 'dinner'));
  const noLodging = plan(build([visit('a')], { lodging: null }), fake(BASE));
  assert.ok(noLodging.gaps.some((g) => g.kind === 'lodging' && g.label === '住宿（未排）'));
});

test('自由時間：留在原地或到指定地點，算進 freeMinutes', () => {
  const d = plan(build([visit('a'), { type: 'free', minutes: 180, place: 'h', note: '回飯店休息' }]), fake(BASE));
  const f = d.entries[2];
  assert.deepEqual([f.kind, f.placeId, f.start, f.end], ['free', 'h', '10:50', '13:50']);
  assert.equal(d.stats.freeMinutes, 180);
});

test('整趟：連續兩天都累 → 警告；中間沒有半天自由時間 → 警告', () => {
  const stairs = with_(A, { accessibility: { stairs: '多' } });
  let it = createItinerary();
  for (const d of ['2027-02-03', '2027-02-04', '2027-02-05', '2027-02-06']) it = setLodging(it, d, 'h');
  for (const d of ['2027-02-04', '2027-02-05', '2027-02-06']) it = addItem(it, d, visit('a')).itinerary;
  const data = fake([H, stairs]);
  const plan1 = planItinerary(it, data);
  assert.ok(plan1.warnings.some((w) => w.code === 'tiring-streak' && w.date === '2027-02-05'));
  // 其他天沒排東西時不警告（還在規劃）；每天都排滿才警告
  assert.ok(!plan1.warnings.some((w) => w.code === 'no-free-time'));
  for (const d of ['2027-02-03', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12']) {
    it = setLodging(it, d, 'h');
    it = addItem(it, d, visit('a', { stay: 300 })).itinerary;
  }
  for (const d of ['2027-02-04', '2027-02-05', '2027-02-06']) it = addItem(it, d, visit('a', { stay: 240 })).itinerary;
  assert.ok(planItinerary(it, data).warnings.some((w) => w.code === 'no-free-time'));
  const rest = addItem(it, '2027-02-08', { type: 'free', minutes: 180 }).itinerary;
  assert.ok(!planItinerary(rest, data).warnings.some((w) => w.code === 'no-free-time'));
});

test('規則的數字可以調整：單段步行上限改 30 分 → 改走路', () => {
  const it = build([visit('c')]);
  assert.equal(plan(it, fake(BASE)).entries[1].travel?.mode, 'taxi');
  assert.equal(plan(it, fake(BASE), D, { walk: { legMaxWhole: 30 } }).entries[1].travel?.mode, 'walk');
});

test('交通不加緩衝：到達＝出發＋交通分鐘', () => {
  const check = (entries: DayPlan['entries']) => {
    for (const e of entries) {
      if (e.travel) assert.equal(toMinutes(e.arrive) - toMinutes(e.travel.depart), e.travel.minutes);
      for (const g of e.groups ?? []) check(g.entries);
    }
  };
  const d = planItinerary(build([visit('a'), visit('c'), visit('b')]), fake(BASE)).days.find((x) => x.date === D)!;
  assert.ok(d.entries.filter((e) => e.travel && e.travel.minutes > 0).length >= 3);
  check(d.entries);
  check(planItinerary(build([splitItem([visit('a'), visit('c')], [visit('c')])]), fake(BASE)).days.find((x) => x.date === D)!.entries);
});

test('同一個點連續兩項（沒有移動）：到達＝上一項結束', () => {
  const d = planItinerary(build([visit('a', { stay: 30 }), visit('a', { stay: 30 })]), fake(BASE)).days.find((x) => x.date === D)!;
  assert.equal(d.entries[2].arrive, d.entries[1].end);
});

test('沒排餐不產生午餐、晚餐空檔', () => {
  const d = plan(build([visit('a', { stay: 120 }), visit('b', { stay: 240 })], { meals: 'breakfast' }), fake(BASE));
  assert.ok(d.gaps.every((g) => g.kind !== ('lunch' as string) && g.kind !== ('dinner' as string)));
  assert.ok(!d.warnings.some((w) => w.code.includes('meal')));
});

test('mealTag 只反映使用者標的', () => {
  const none = plan(build([visit('a', { stay: 120 }), visit('r')]), fake(BASE));
  assert.equal(none.entries[2].meal, 'lunch'); // 引擎猜的照舊
  assert.equal(none.entries[2].mealTag ?? null, null);
  const tagged = plan(build([visit('a', { stay: 120 }), visit('r', { meal: 'lunch' })]), fake(BASE));
  assert.equal(tagged.entries[2].mealTag, 'lunch');
});

test('只填分鐘、方式自動：用填的分鐘，標記為指定', () => {
  const l = plan(build([visit('a'), visit('b', { travel: { minutes: 33 } })]), fake(BASE)).entries[2].travel!;
  assert.equal(l.minutes, 33);
  assert.equal(l.specified, true);
  assert.equal(l.basis, '指定');
});

test('回住宿那段可以指定', () => {
  const it = build([visit('a')]);
  it.days.find((d) => d.date === D)!.returnTravel = { mode: 'taxi', minutes: 30 };
  const e = plan(it, fake(BASE)).entries.find((x) => x.kind === 'lodging')!;
  assert.equal(e.travel?.mode, 'taxi');
  assert.equal(e.travel?.minutes, 30);
  assert.equal(e.travel?.specified, true);
});

test('去機場那段可以指定', () => {
  const kix = station('kansai-airport', at(0, 500));
  const k = lodging('k', at(0, 900));
  let it = createItinerary();
  it = setLodging(it, '2027-02-12', 'k');
  const dep = it.days[11].items.find((i) => i.type === 'flight')!;
  if (dep.type === 'flight') dep.travel = { minutes: 90 };
  const e = planItinerary(it, fake([kix, k])).days[11].entries.find((x) => x.kind === 'flight')!;
  assert.equal(e.travel?.minutes, 90);
});

test('舊格式的行程結果不變', async () => {
  const { realData } = await import('./fixtures.ts');
  const { TOBA_DATE, tobaDay } = await import('./toba-day.ts');
  type E = { kind: string; start: string; travel?: { minutes: number } | null; groups?: { entries: E[] }[] };
  const f = (es: E[]): unknown[] => es.map((e) => [e.kind, e.start, e.travel?.minutes ?? null, ...(e.groups ? [e.groups.map((g) => f(g.entries))] : [])]);
  const run = (cfg: ConfigOverride) => f(planItinerary(tobaDay(), realData(), cfg).days.find((x) => x.date === TOBA_DATE)!.entries as E[]);
  // 第一段是計程車：第四輪拿掉叫車的 5 分（8 → 3 分）；其他段不加緩衝
  assert.deepEqual(run({}), [["start","09:30",null],["visit","09:33",3],["visit","12:00",8],["meet","15:45",null,[[["visit","13:23",8],["meet","14:49",11]],[["visit","13:20",5],["visit","13:59",9],["meet","15:08",9]]]],["visit","15:55",10],["lodging","16:39",14]]);
});
