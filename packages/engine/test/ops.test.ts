// 行程的操作、驗證、「改了什麼」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem,
  addOption,
  checkProposal,
  createItinerary,
  describeChanges,
  detachOption,
  mergeItems,
  moveOption,
  diffItinerary,
  findItem,
  ItineraryError,
  moveItem,
  moveItemTo,
  moveItemToDay,
  removeItem,
  removeOption,
  selectOption,
  getLegTravel,
  setLegTravel,
  setLodging,
  setTags,
  upgradeItinerary,
  pickMeal,
  setStart,
  setStay,
  setTravel,
  validateItinerary,
  planItinerary,
  toMinutes,
  type Itinerary,
  type TravelSpec,
  type PathRef,
  type TripRef,
  type VisitItem,
} from '../src/index.ts';
import { at, fake, lodging, spot } from './synthetic.ts';

const D = '2027-02-05';
const visit = (place: string) => ({ type: 'visit' as const, options: [{ place }] });
const ids = (it: Itinerary, date = D) => it.days.find((d) => d.date === date)?.items.map((i) => i.id);

function threeItems() {
  let it = createItinerary();
  const out: string[] = [];
  for (const p of ['a', 'b', 'c']) {
    const r = addItem(it, D, visit(p));
    it = r.itinerary;
    out.push(r.itemId);
  }
  return { it, ids: out };
}

test('一開始的行程：12 天、航班放好，其他是空的', () => {
  const it = createItinerary();
  assert.equal(it.days.length, 12);
  assert.equal(it.days[0].date, '2027-02-02');
  assert.equal(it.days[11].date, '2027-02-13');
  assert.deepEqual(it.days[0].items.map((i) => i.type === 'flight' && [i.direction, i.depart, i.arrive]), [
    ['arrive', '08:20', '11:55'],
    ['arrive', '09:45', '13:20'],
  ]);
  assert.deepEqual(it.days[11].items.map((i) => i.type === 'flight' && [i.direction, i.depart]), [
    ['depart', '12:45'],
    ['depart', '12:55'],
  ]);
  assert.deepEqual(it.party, { size: 15, elders: 5, kids: 4 });
  assert.deepEqual(validateItinerary(it), []);
});

test('新增：產生流水號 ID，預設放在最後、出發航班之前；不改原本的行程', () => {
  const it = createItinerary();
  const r = addItem(it, '2027-02-13', visit('a'));
  assert.equal(r.itemId, 'i-5');
  assert.deepEqual(ids(r.itinerary, '2027-02-13'), ['i-5', 'f-3', 'f-4']);
  assert.deepEqual(ids(it, '2027-02-13'), ['f-3', 'f-4']);
  const at0 = addItem(r.itinerary, D, visit('b'), { index: 0 });
  assert.equal(at0.itemId, 'i-6');
  assert.throws(() => addItem(it, '2027-03-01', visit('a')), ItineraryError);
  assert.throws(() => addItem(it, D, { type: 'visit', options: [] }), ItineraryError);
});

test('刪除；航班不能刪；刪掉的 ID 不會再被新項目用到', () => {
  const { it, ids: [a, b, c] } = threeItems();
  const next = removeItem(it, b);
  assert.deepEqual(ids(next), [a, c]);
  const again = addItem(removeItem(it, c), D, visit('x'));
  assert.equal(again.itemId, 'i-8');
  assert.throws(() => removeItem(it, 'f-1'), /航班/);
  assert.throws(() => removeItem(it, 'nope'), ItineraryError);
});

test('移到別天：放在那天最後（出發航班之前），或指定位置', () => {
  const { it, ids: [a, b, c] } = threeItems();
  const next = moveItemToDay(it, b, '2027-02-13');
  assert.deepEqual(ids(next), [a, c]);
  assert.deepEqual(ids(next, '2027-02-13'), [b, 'f-3', 'f-4']);
  const front = moveItemToDay(it, c, '2027-02-06', 0);
  assert.deepEqual(ids(front, '2027-02-06'), [c]);
  assert.throws(() => moveItemToDay(it, 'f-1', D), /航班/);
});

test('上移／下移；到頭了、跨過航班都不行', () => {
  const { it, ids: [a, b, c] } = threeItems();
  assert.deepEqual(ids(moveItem(it, b, 'up')), [b, a, c]);
  assert.deepEqual(ids(moveItem(it, b, 'down')), [a, c, b]);
  assert.throws(() => moveItem(it, a, 'up'), /第一個/);
  assert.throws(() => moveItem(it, c, 'down'), /最後一個/);
  const last = addItem(createItinerary(), '2027-02-13', visit('a'));
  assert.throws(() => moveItem(last.itinerary, last.itemId, 'down'), /航班/);
});

test('改停留時間（目前的選項）；free 改 minutes', () => {
  const { it, ids: [a] } = threeItems();
  const next = setStay(it, a, 90);
  assert.equal((findItem(next, a)?.item as VisitItem).options[0].stayMinutes, 90);
  assert.throws(() => setStay(it, a, -1), ItineraryError);
  const f = addItem(it, D, { type: 'free', minutes: 60 });
  assert.equal((findItem(setStay(f.itinerary, f.itemId, 120), f.itemId)?.item as { minutes: number }).minutes, 120);
  assert.throws(() => setStay(it, 'f-1', 10), ItineraryError);
});

test('備案：加、切換、刪；刪到只剩一個不行', () => {
  const { it, ids: [a] } = threeItems();
  let next = addOption(it, a, { place: 'x', note: '雨天備案' });
  next = selectOption(next, a, 1);
  assert.equal((findItem(next, a)?.item as VisitItem).selected, 1);
  assert.throws(() => selectOption(next, a, 2), ItineraryError);
  next = removeOption(next, a, 0);
  const item = findItem(next, a)?.item as VisitItem;
  assert.deepEqual([item.options.map((o) => o.place), item.selected], [['x'], 0]);
  assert.throws(() => removeOption(next, a, 0), /至少/);
});

test('拿掉主要的那個，selected 指到還在的點', () => {
  const { it, ids: [a] } = threeItems();
  let base = addOption(addOption(it, a, { place: 'x' }), a, { place: 'y' });
  base = selectOption(base, a, 1);
  const sel = (x: Itinerary) => (findItem(x, a)?.item as VisitItem).selected;
  const gone = removeOption(base, a, 1);
  assert.equal(sel(gone), 0);
  assert.equal((findItem(gone, a)?.item as VisitItem).options.length, 2);
  // 拿掉 selected 之前的：selected 減 1，還是同一個點
  const before = removeOption(base, a, 0);
  assert.equal(sel(before), 0);
  assert.equal((findItem(before, a)?.item as VisitItem).options[0].place, 'x');
  // 拿掉 selected 之後的：不變
  assert.equal(sel(removeOption(base, a, 2)), 1);
});

test('指定開始時間、交通、住宿', () => {
  const { it, ids: [a] } = threeItems();
  assert.equal((findItem(setStart(it, a, '10:30'), a)?.item as VisitItem).start, '10:30');
  assert.throws(() => setStart(it, a, '10點半'), ItineraryError);
  assert.deepEqual((findItem(setTravel(it, a, { mode: 'charter', minutes: 20 }), a)?.item as VisitItem).travel, { mode: 'charter', minutes: 20 });
  const l = setLodging(it, D, 'h', 'breakfast').days.find((d) => d.date === D);
  assert.deepEqual([l?.lodging, l?.lodgingMeals], ['h', 'breakfast']);
});

test('分組裡的項目：可以新增、上下移、移到別天（移出分組）', () => {
  let it = createItinerary();
  const sp = addItem(it, D, {
    type: 'split',
    groups: [
      { id: 'g1', name: '一', size: 7, elders: 5, kids: 0, items: [{ id: '', ...visit('a'), selected: 0 }] },
      { id: 'g2', name: '二', size: 8, elders: 0, kids: 4, items: [] },
    ],
    meet: { place: 'a', time: '12:00' },
  });
  it = sp.itinerary;
  const inner = `${sp.itemId}-g1-1`;
  assert.ok(findItem(it, inner));
  const add = addItem(it, D, visit('b'), { split: { id: sp.itemId, group: 'g1' } });
  const g = findItem(add.itinerary, add.itemId);
  assert.deepEqual([g?.splitId, g?.groupId, g?.index], [sp.itemId, 'g1', 1]);
  assert.equal(findItem(moveItem(add.itinerary, add.itemId, 'up'), add.itemId)?.index, 0);
  const out = moveItemToDay(add.itinerary, inner, '2027-02-06');
  assert.equal(findItem(out, inner)?.splitId, null);
  assert.throws(() => addItem(it, D, { type: 'split', groups: [], meet: { place: 'a', time: '12:00' } }, { split: { id: sp.itemId, group: 'g1' } }), /不能再分組/);
});

test('驗證：格式、ID 重複、selected 範圍、時間格式、日期順序', () => {
  assert.deepEqual(validateItinerary(createItinerary()), []);
  const bad = createItinerary();
  bad.days[1].items.push({ id: 'f-1', type: 'visit', options: [{ place: 'a' }], selected: 3, start: '9點' });
  bad.days[2].date = '2027-02-02';
  const errs = validateItinerary(bad);
  assert.ok(errs.some((e) => /重複/.test(e)));
  assert.ok(errs.some((e) => /selected/.test(e)));
  assert.ok(errs.some((e) => /HH:MM/.test(e)));
  assert.ok(errs.some((e) => /依序/.test(e)));
  assert.deepEqual(validateItinerary(null), ['不是物件']);
});

test('改了什麼：新增、刪除、移到別天、換順序、改欄位、改住宿', () => {
  const { it, ids: [a, b, c] } = threeItems();
  let next = removeItem(it, a);
  next = moveItemToDay(next, c, '2027-02-06');
  next = setStay(next, b, 30);
  next = addItem(next, D, visit('d'), { index: 0 }).itinerary;
  next = setLodging(next, D, 'h');
  const ch = diffItinerary(it, next);
  const kinds = ch.map((c) => `${c.kind}:${c.itemId ?? c.after}`).sort();
  assert.deepEqual(kinds, [`added:i-8`, `changed:${b}`, `lodging:h`, `moved-day:${c}`, `removed:${a}`].sort());
  assert.deepEqual(ch.find((c) => c.kind === 'changed')?.fields, ['stayMinutes']);
  const swapped = diffItinerary(it, moveItem(it, b, 'up'));
  assert.ok(swapped.every((c) => c.kind === 'reordered'));
  assert.deepEqual(diffItinerary(it, it), []);
});

test('改了什麼：回住宿的交通也算（setLegTravel({ lodging })）', () => {
  const { it } = threeItems();
  const next = setLegTravel(it, { lodging: D }, { mode: 'taxi' });
  const ch = diffItinerary(it, next);
  assert.deepEqual(ch, [{ kind: 'return-travel', date: D }]);
  assert.deepEqual(describeChanges(ch), ['2/5：回住宿的交通']);
  // 只改備註也算；改回一樣就沒有
  assert.equal(diffItinerary(next, setLegTravel(next, { lodging: D }, { mode: 'taxi', note: '叫兩台' })).length, 1);
  assert.deepEqual(diffItinerary(next, setLegTravel(it, { lodging: D }, { mode: 'taxi' })), []);
});

test('提議的摘要與檢查：套用前後都跑引擎，列出新出現、消失的警告', () => {
  const H = lodging('h', at(0));
  const A = spot('a', at(400));
  const S = spot('s', at(500), { accessibility: { stairs: '多' } });
  const data = fake([H, A, S]);
  let before = createItinerary();
  before = setLodging(before, '2027-02-04', 'h');
  before = setLodging(before, D, 'h');
  before = addItem(before, D, visit('a')).itinerary;
  const after = addItem(before, D, visit('s')).itinerary;
  const r = checkProposal(before, after, data, {}, (id) => ({ s: '展望台', a: '水族館' })[id] ?? id);
  assert.deepEqual(r.summary, ['2/5：＋展望台 10:43～11:43']); // a 10:40 結束，走 100 m 3 分（不加緩衝）
  assert.ok(r.newWarnings.some((w) => w.code === 'stairs'));
  assert.deepEqual(r.resolvedWarnings, []);
  const back = checkProposal(after, before, data);
  assert.ok(back.resolvedWarnings.some((w) => w.code === 'stairs'));
  assert.deepEqual(describeChanges(back.changes), ['2/5：－s']);
});

test('moveItemTo：同一天換位置、移到別天的某個位置', () => {
  const { it, ids: [a, b, c] } = threeItems();
  assert.deepEqual(ids(moveItemTo(it, c, D, 0)), [c, a, b]);
  assert.deepEqual(ids(moveItemTo(it, a, D, 2)), [b, c, a]);
  const other = '2027-02-06';
  const moved = moveItemTo(addItem(it, other, visit('x')).itinerary, b, other, 0);
  assert.deepEqual(ids(moved), [a, c]);
  assert.equal(ids(moved, other)?.[0], b);
});

test('moveItemTo：移進分組、移出分組；分組不能放進分組；不能跨過航班', () => {
  let { it, ids: [a, b] } = threeItems();
  const sp = addItem(it, D, { type: 'split', groups: [{ id: 'g1', name: '一組', size: 15, elders: 5, kids: 4, items: [] }], meet: { place: 'a', time: '15:00' } } as never);
  it = sp.itinerary;
  const inGroup = moveItemTo(it, a, D, 0, { id: sp.itemId, group: 'g1' });
  const split = inGroup.days.find((d) => d.date === D)!.items.find((x) => x.id === sp.itemId)!;
  assert.deepEqual(split.type === 'split' && split.groups[0].items.map((x) => x.id), [a]);
  const out = moveItemTo(inGroup, a, D, 0);
  assert.equal(ids(out)?.[0], a);
  assert.throws(() => moveItemTo(it, sp.itemId, D, 0, { id: sp.itemId, group: 'g1' }), ItineraryError);
  const first = '2027-02-02';
  assert.throws(() => moveItemTo(it, b, first, 0), ItineraryError);
  const last = '2027-02-13';
  assert.throws(() => moveItemTo(it, b, last, 2), ItineraryError);
  assert.deepEqual(ids(moveItemTo(it, b, last, 0), last)?.[0], b);
});

test('setLegTravel：只有 path 也算有設定；舊的 trip 不寫（T29b）；全空存 null', () => {
  const { it, ids: [a] } = threeItems();
  const path = { rides: [{ line: 'kintetsu', from: 'toba', to: 'kashikojima' }], from: 'x', to: 'y' };
  const one = setLegTravel(it, { itemId: a }, { path });
  assert.deepEqual(getLegTravel(one, { itemId: a }), { path });
  assert.equal(getLegTravel(it, { itemId: a }), null);
  const trip = { id: 't1', depart: '10:35', arrive: '10:45', from: 'x', to: 'y' };
  assert.equal(getLegTravel(setLegTravel(it, { itemId: a }, { trip }), { itemId: a }), null);
  assert.deepEqual(getLegTravel(setLegTravel(it, { itemId: a }, { mode: 'transit', trip }), { itemId: a }), { mode: 'transit' });
  const cleared = setLegTravel(one, { itemId: a }, { mode: null, minutes: null, path: null, note: null });
  assert.equal((findItem(cleared, a)?.item as VisitItem).travel, null);
  const ret = setLegTravel(it, { lodging: D }, { mode: 'walk' });
  assert.deepEqual(ret.days.find((d) => d.date === D)?.returnTravel, { mode: 'walk' });
  assert.deepEqual(getLegTravel(ret, { lodging: D }), { mode: 'walk' });
  assert.equal(it.days.find((d) => d.date === D)?.returnTravel, undefined); // 不改原本的
});

test('setLegTravel：航班可以；split 項目本身丟錯', () => {
  const it = createItinerary();
  const dep = it.days[11].items.find((i) => i.type === 'flight')!;
  assert.deepEqual(getLegTravel(setLegTravel(it, { itemId: dep.id }, { minutes: 90 }), { itemId: dep.id }), { minutes: 90 });
  const sp = addItem(it, D, {
    type: 'split',
    groups: [
      { id: 'g1', name: '一', size: 7, elders: 5, kids: 0, items: [{ id: '', ...visit('a'), selected: 0 }] },
      { id: 'g2', name: '二', size: 8, elders: 0, kids: 4, items: [] },
    ],
    meet: { place: 'b', time: '12:00' },
  });
  assert.throws(() => setLegTravel(sp.itinerary, { itemId: sp.itemId }, { minutes: 5 }), ItineraryError);
  assert.throws(() => setLegTravel(sp.itinerary, { itemId: 'nope' }, { minutes: 5 }), ItineraryError);
  const inner = (findItem(sp.itinerary, sp.itemId)?.item as { groups: { items: { id: string }[] }[] }).groups[0].items[0].id;
  assert.deepEqual(getLegTravel(setLegTravel(sp.itinerary, { itemId: inner }, { minutes: 5 }), { itemId: inner }), { minutes: 5 });
});

test('setTags：去重、照 TAG_IDS 排序；validateItinerary 接受', () => {
  const { it, ids: [a] } = threeItems();
  const next = setTags(it, a, ['rest', 'lunch', 'lunch', 'breakfast']);
  assert.deepEqual((findItem(next, a)?.item as VisitItem).tags, ['breakfast', 'lunch', 'rest']);
  assert.deepEqual(validateItinerary(next), []);
  assert.throws(() => setTags(it, 'nope', ['lunch']), ItineraryError);
  const bad2 = setLegTravel(it, { itemId: a }, { minutes: -1 });
  assert.ok(validateItinerary(bad2).some((e) => e.includes('minutes')));
});

function withVisit(extra: Record<string, unknown>): Itinerary {
  const { it, ids: [a] } = threeItems();
  const copy = JSON.parse(JSON.stringify(it)) as Itinerary;
  Object.assign(findItem(copy, a)!.item, extra);
  return copy;
}
const firstVisit = (it: Itinerary) => it.days.find((d) => d.date === D)!.items[0] as VisitItem;

test('upgradeItinerary：meal、dining 轉成 tags', () => {
  const old = withVisit({ meal: 'lunch', dining: 'separate' });
  const v = firstVisit(upgradeItinerary(old));
  assert.deepEqual(v.tags, ['lunch', 'groups']);
  assert.equal('meal' in v, false);
  assert.equal('dining' in v, false);
  assert.deepEqual(firstVisit(upgradeItinerary(withVisit({ meal: null, dining: 'together' }))).tags, ['all']);
  const clean = withVisit({ tags: ['rest'] });
  assert.equal(upgradeItinerary(clean), clean);
});

test('validateItinerary：舊欄位、未知的 tag 報錯', () => {
  assert.ok(validateItinerary(withVisit({ meal: 'lunch' })).some((e) => e.includes('upgradeItinerary')));
  assert.ok(validateItinerary(withVisit({ dining: 'together' })).some((e) => e.includes('upgradeItinerary')));
  assert.ok(validateItinerary(withVisit({ tags: ['brunch'] })).length > 0);
  assert.ok(validateItinerary(withVisit({ tags: 'lunch' })).length > 0);
});

test('pickMeal', () => {
  assert.equal(pickMeal(['lunch'], 'dinner'), 'lunch');
  assert.equal(pickMeal(['breakfast', 'lunch'], 'lunch'), 'lunch');
  assert.equal(pickMeal(['dinner', 'breakfast'], null), 'breakfast');
  assert.equal(pickMeal([], 'snack'), 'snack');
  assert.equal(pickMeal(['rest'], null), null);
  assert.equal(pickMeal(undefined, 'dinner'), 'dinner');
});
function withTravel(spec: TravelSpec): Itinerary {
  let it = createItinerary();
  it = setLodging(it, '2027-02-04', 'h');
  it = setLodging(it, D, 'h');
  it = addItem(it, D, visit('a')).itinerary;
  const b = addItem(it, D, visit('b'));
  return setLegTravel(b.itinerary, { itemId: b.itemId }, spec);
}

test('舊的 bufferMinutes 忽略、舊的方式照樣算', () => {
  const it = withTravel({ mode: 'charter', minutes: 20, bufferMinutes: 10 } as TravelSpec);
  assert.deepEqual(validateItinerary(it), []);
  const data = fake([lodging('h', at(0)), spot('a', at(400)), spot('b', at(3000))]);
  const day = planItinerary(it, data).days.find((d) => d.date === D)!;
  const leg = day.entries[2].travel!;
  assert.equal(leg.mode, 'charter');
  assert.equal(leg.minutes, 20);
  assert.equal(toMinutes(day.entries[2].arrive), toMinutes(leg.depart) + 20);
  // 舊的方式都還合法
  for (const mode of ['train', 'bus', 'ferry', 'charter', 'car', 'other'] as const) assert.deepEqual(validateItinerary(withTravel({ mode })), []);
});

test('validateItinerary：mode transit 合法；舊的 trip 忽略，格式不對也不報錯（T29b）', () => {
  assert.deepEqual(validateItinerary(withTravel({ mode: 'transit' })), []);
  assert.deepEqual(validateItinerary(withTravel({ mode: 'transit', trip: { id: 't1', depart: '10:35', arrive: '10:45', from: 'a', to: 'b' } })), []);
  assert.deepEqual(validateItinerary(withTravel({ mode: 'transit', trip: { id: '', depart: '9:5' } as TripRef })), []);
  const trip = { id: '1-1963', depart: '11:14', arrive: '11:41', from: 'a', to: 'b' };
  assert.deepEqual(validateItinerary(withTravel({ trip: { ...trip, rides: ['1-1963', '1-3799'], via: 'toba' } })), []);
  assert.deepEqual(validateItinerary(withTravel({ trip: { ...trip, via: 3 as unknown as string, rides: [1] as unknown as string[] } })), []);
});

// --- 合併、拆開、搬移備卡 ---------------------------------------------------

const typeOf = (id: string) => (id.startsWith('h') ? 'lodging' : id.startsWith('r') ? 'restaurant' : 'spot');
const visitOf = (it: Itinerary, id: string) => findItem(it, id)?.item as VisitItem;

function mergeSetup() {
  let it = createItinerary();
  const t = addItem(it, D, { type: 'visit', options: [{ place: 'r1' }], selected: 0, start: '12:00', tags: ['lunch'] });
  it = t.itinerary;
  const s = addItem(it, D, { type: 'visit', options: [{ place: 'r2', stayMinutes: 45 }], selected: 0, start: '11:30' });
  return { it: s.itinerary, target: t.itemId, source: s.itemId };
}

test('mergeItems：source 的點變成 target 的最後一個選項，target 的欄位不變', () => {
  const { it, target, source } = mergeSetup();
  const r = mergeItems(it, source, target, typeOf);
  const t = visitOf(r.itinerary, target);
  assert.deepEqual(t.options, [{ place: 'r1' }, { place: 'r2', stayMinutes: 45 }]);
  assert.equal(t.selected, 0);
  assert.equal(t.start, '12:00');
  assert.deepEqual(t.tags, ['lunch']);
  assert.equal(findItem(r.itinerary, source), null);
  assert.equal(r.droppedStart, '11:30');
  assert.equal(visitOf(it, target).options.length, 1, '不改原本的行程');
});

test('mergeItems：有備卡的 source、不同類型、住宿都丟錯', () => {
  const { it, target, source } = mergeSetup();
  const withBackup = addOption(it, source, { place: 'r3' });
  assert.throws(() => mergeItems(withBackup, source, target, typeOf), /有備卡的卡片不能合併，只能換順序/);
  const spotItem = addItem(it, D, visit('s1')).itemId;
  const it2 = addItem(it, D, visit('s1')).itinerary;
  assert.throws(() => mergeItems(it2, spotItem, target, typeOf), /只有同類型的點能合併/);
  const h1 = addItem(it, D, visit('h1'));
  const h2 = addItem(h1.itinerary, D, visit('h2'));
  assert.throws(() => mergeItems(h2.itinerary, h2.itemId, h1.itemId, typeOf), /住宿不能合併/);
  assert.throws(() => mergeItems(it, source, source, typeOf), ItineraryError);
});

test('detachOption：備卡變成獨立一站；主卡不能拆', () => {
  const { it, ids: [a] } = threeItems();
  const two = addOption(it, a, { place: 'a2' });
  const r = detachOption(two, a, 1, D, 0);
  assert.deepEqual(ids(r.itinerary)?.[0], r.itemId);
  assert.equal(ids(r.itinerary)?.[1], a);
  assert.deepEqual(visitOf(r.itinerary, r.itemId).options, [{ place: 'a2' }]);
  assert.equal(visitOf(r.itinerary, r.itemId).selected, 0);
  assert.equal(visitOf(r.itinerary, a).options.length, 1);
  assert.equal(r.itinerary.seq, Number(r.itemId.split('-')[1]));
  assert.throws(() => detachOption(two, a, 0, D, 0), /主卡要先把皇冠給別張/);
});

test('detachOption：拆掉前面的選項時 selected 跟著指原本那個', () => {
  const { it, ids: [a] } = threeItems();
  let x = addOption(addOption(it, a, { place: 'b' }), a, { place: 'c' });
  x = selectOption(x, a, 2);
  const r = detachOption(x, a, 0, D, 0);
  const v = visitOf(r.itinerary, a);
  assert.equal(v.selected, 1);
  assert.equal(v.options[v.selected].place, 'c');
});

test('moveOption：備卡搬到別張同類型卡', () => {
  const { it, target, source } = mergeSetup();
  const two = addOption(it, source, { place: 'r3' });
  const r = moveOption(two, source, 1, target, typeOf);
  assert.deepEqual(visitOf(r, source).options.map((o) => o.place), ['r2']);
  assert.deepEqual(visitOf(r, target).options.map((o) => o.place), ['r1', 'r3']);
  assert.throws(() => moveOption(two, source, 0, target, typeOf), /主卡要先把皇冠給別張/);
  const s1 = addItem(two, D, visit('s1')).itemId;
  assert.throws(() => moveOption(addItem(two, D, visit('s1')).itinerary, source, 1, s1, typeOf), /只有同類型的點能合併/);
});

test('moveOption：類型看被搬的那個選項，不是來源卡的主卡', () => {
  const { it, target, source } = mergeSetup();
  const mixed = addOption(it, source, { place: 's9' });
  assert.throws(() => moveOption(mixed, source, 1, target, typeOf), /只有同類型的點能合併/);
});

test('validateItinerary：path 合法不報錯，rides 的 line 是空字串要報錯', () => {
  const path = { rides: [{ line: 'kintetsu', from: 'toba', to: 'kashikojima' }], from: 'toba', to: 'kashikojima' };
  assert.deepEqual(validateItinerary(withTravel({ path })), []);
  const errs = validateItinerary(withTravel({ path: { rides: [{ line: '' }], from: null, to: null } as unknown as PathRef }));
  assert.ok(errs.some((e) => e.includes('path.rides')), errs.join('；'));
});

test('setLegTravel：只有 path 也算有設定，getLegTravel 拿得回來', () => {
  const { it, ids: [a] } = threeItems();
  const path = { rides: [{ line: 'kintetsu', from: 'toba', to: 'kashikojima' }], from: 'x', to: 'y' };
  const one = setLegTravel(it, { itemId: a }, { path });
  assert.deepEqual(getLegTravel(one, { itemId: a }), { path });
});
