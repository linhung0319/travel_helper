// 新手起步（interaction-design §17）：推薦問題的規則、引導彈窗的進度（T46）、重新打開網站開新對話。
import assert from 'node:assert/strict';
import test from 'node:test';
import { blankCards, buildStarterInput, dayStarter, emptyDayFollowups, firstEmptyDate, firstStarter, lodgingStarter, nightLodgingStarter, startersFor, tripPrompts, type StarterDay, type StarterInput } from '../src/ai/prompts.ts';
import { flightCount, guideCurrent, guideProgress, shouldStartFresh } from '../src/lib/tripStart.ts';
import { tripDates } from '../src/lib/trip.ts';
import { emptyItinerary } from '../src/dev-fixtures/seed.ts';
import type { Place } from '../src/data/types.ts';
import type { Vote } from '../src/backend/types.ts';
import { harness, memoryStorage } from './aiHarness.ts';

const DATES = tripDates();

/** 排好的一天；patch 改掉要測的 */
const fullDay = (date: string): StarterDay => ({ date, area: date !== DATES.at(-1) ? 'shima' : null, lodging: date !== DATES.at(-1), dinnerIncluded: true, dinnerExcluded: false, hasStops: true, hasLunch: true, hasDinner: true, areaName: '志摩', nearbyWishes: 0, errorWarning: null });

function input(patch: Record<string, Partial<StarterDay>> = {}, rest: Partial<StarterInput> = {}): StarterInput {
  return { days: DATES.map((d) => ({ ...fullDay(d), ...patch[d] })), day: null, warnings: 0, wishesUnplaced: 0, popularUnplaced: 0, anyLiked: true, ...rest };
}

const noLodging = Object.fromEntries(DATES.map((d) => [d, { lodging: false }]));

test('規則 1：一晚住宿都還沒有', () => {
  assert.deepEqual(firstStarter(input(noLodging)), { q: '幫我決定前幾晚住哪', why: '從第一晚開始，15 人的住宿最難訂' });
});

test('規則 2：連續的晚上併成一段，最早的一段先；小字是總共幾晚', () => {
  const s = firstStarter(input({ '2027-02-05': { lodging: false }, '2027-02-09': { lodging: false }, '2027-02-10': { lodging: false }, '2027-02-11': { lodging: false } }));
  assert.deepEqual(s, { q: '幫我決定 2/5 住哪', why: '還有 4 晚沒住宿' });
  const t = firstStarter(input({ '2027-02-09': { lodging: false }, '2027-02-10': { lodging: false }, '2027-02-11': { lodging: false } }));
  assert.deepEqual(t, { q: '幫我決定 2/9～2/11 住哪', why: '還有 3 晚沒住宿' });
});

test('規則 3：有住宿但整天沒排，航班那兩天除外', () => {
  const s = firstStarter(input({ '2027-02-02': { hasStops: false }, '2027-02-03': { hasStops: false, nearbyWishes: 6 } }));
  assert.deepEqual(s, { q: '2/3 去哪？', why: '住志摩，附近大家想去的有 6 個' });
  assert.equal(firstStarter(input({ '2027-02-02': { hasStops: false }, '2027-02-13': { hasStops: false } })).q, '幫我整趟檢查一次');
  assert.equal(dayStarter({ ...fullDay('2027-02-03'), nearbyWishes: 0 }).why, '住志摩，這天還沒排');
  assert.equal(dayStarter({ ...fullDay('2027-02-03'), areaName: null }).why, '這天還沒排');
});

test('規則 4：晚餐空檔，一泊二食不算；不確定含不含晚餐時不說「不含」', () => {
  assert.deepEqual(firstStarter(input({ '2027-02-04': { hasDinner: false, dinnerIncluded: false, dinnerExcluded: true } })), { q: '2/4 晚餐吃哪？', why: '那晚不含晚餐' });
  assert.deepEqual(firstStarter(input({ '2027-02-04': { hasDinner: false, dinnerIncluded: false } })), { q: '2/4 晚餐吃哪？', why: '晚餐還空著' });
  assert.equal(firstStarter(input({ '2027-02-04': { hasDinner: false, dinnerIncluded: true } })).q, '幫我整趟檢查一次');
  // 最後一天不住，不問晚餐
  assert.equal(firstStarter(input({ '2027-02-13': { hasDinner: false, dinnerIncluded: false } })).q, '幫我整趟檢查一次');
});

test('規則 5：午餐空檔，晚餐排在午餐前面；航班那兩天不問午餐', () => {
  assert.deepEqual(firstStarter(input({ '2027-02-05': { hasLunch: false } })), { q: '2/5 午餐吃哪？', why: '11:30～13:30 還空著' });
  assert.equal(firstStarter(input({ '2027-02-03': { hasLunch: false }, '2027-02-08': { hasDinner: false, dinnerIncluded: false } })).q, '2/8 晚餐吃哪？');
  assert.equal(firstStarter(input({ '2027-02-02': { hasLunch: false }, '2027-02-13': { hasLunch: false } })).q, '幫我整趟檢查一次');
});

test('規則 6：引擎有錯誤級的警告，小字是警告的內容', () => {
  assert.deepEqual(firstStarter(input({ '2027-02-06': { errorWarning: '趕不上指定的 12:00' } })), { q: '2/6 的問題怎麼改？', why: '趕不上指定的 12:00' });
});

test('規則 7：2 人以上想去、還沒排', () => {
  assert.deepEqual(firstStarter(input({}, { popularUnplaced: 4 })), { q: '大家想去的還沒排的，排哪天？', why: '4 個' });
});

test('規則 8：都沒有', () => {
  assert.deepEqual(firstStarter(input()), { q: '幫我整趟檢查一次', why: '每天都排好了' });
});

test('startersFor：第一張照規則，另外兩張補滿；同一件事不問兩次', () => {
  const lodging = startersFor(input(noLodging, { wishesUnplaced: 2, warnings: 1 }));
  assert.deepEqual(lodging.map((s) => s.q), ['幫我決定前幾晚住哪', '哪天最趕？', '把想去的排進行程']);
  assert.ok(lodging.every((s) => s.why));
  assert.equal(lodging[1].why, '1 天要處理'); // 只數有要處理的天（T74a）
  const popular = startersFor(input({}, { popularUnplaced: 1, wishesUnplaced: 3 }));
  assert.deepEqual(popular.map((s) => s.q), ['大家想去的還沒排的，排哪天？', '鳥羽能坐 15 人的海鮮餐廳', '長輩走起來輕鬆的景點']);
  assert.equal(startersFor(input({}, { day: '2027-02-05' }))[1].q, '幫我檢查 2/5');
  // 正在看空的一天：沒有東西可以檢查
  assert.ok(!startersFor(input({ '2027-02-05': { hasStops: false } }, { day: '2027-02-05' })).some((s) => s.q.startsWith('幫我檢查')));
});

test('blankCards：帶晶片用晶片的問題，開始卡、空的一天帶來的那一句在第一張，最多 3 張', () => {
  const starters = [{ q: 'A', why: 'a' }, { q: 'B', why: 'b' }, { q: 'C', why: 'c' }];
  assert.deepEqual(blankCards(null, [], starters, false).map((c) => [c.q, c.source]), [['A', 'starter'], ['B', 'starter'], ['C', 'starter']]);
  assert.deepEqual(blankCards(null, ['x', 'y'], starters, true).map((c) => [c.q, c.source]), [['x', 'chip'], ['y', 'chip']]);
  assert.deepEqual(blankCards({ q: 'L', why: 'l' }, ['x', 'y', 'z'], starters, true).map((c) => c.q), ['L', 'x', 'y']);
  // 開始卡、空的一天：不帶晶片，下面是那一步的問題
  assert.deepEqual(blankCards({ q: 'L', why: 'l' }, ['x', 'y'], starters, false).map((c) => c.q), ['L', 'x', 'y']);
  // 晶片拿掉了：回到照行程算的
  assert.deepEqual(blankCards(null, ['x'], starters, false).map((c) => c.q), ['A', 'B', 'C']);
  // 沒有晶片但有帶來的那一句（想去頁的問 AI 推薦）
  assert.deepEqual(blankCards({ q: 'L', why: 'l' }, [], starters, false).map((c) => c.q), ['L', 'A', 'B']);
  assert.deepEqual(blankCards({ q: 'A', why: 'l' }, [], starters, false).map((c) => c.q), ['A', 'B', 'C']);
});

const place = (id: string, type: string, area: string, raw: Record<string, unknown> = {}) => ({ id, type, area, raw, name: { zh: id, ja: id } }) as unknown as Place;
const like = (placeId: string, memberId: string, value: 'like' | 'dislike' = 'like') => ({ placeId, memberId, value, updatedAt: '2026-11-01T00:00:00Z', deletedAt: null }) as unknown as Vote;
const AREAS = [{ id: 'shima', name: { zh: '志摩', ja: '志摩' } }] as never;

test('buildStarterInput：只有航班的行程（先問區，T45c）', () => {
  const i = buildStarterInput({ itinerary: emptyItinerary(), plan: null, votes: [], byId: new Map(), areas: AREAS, day: null });
  assert.equal(i.days.length, 12);
  assert.equal(firstStarter(i).q, '幫我先排每晚住哪一區');
  assert.deepEqual(guideProgress(i), { liked: false, areas: false, lodging: false, stops: false, done: 0 });
});

test('buildStarterInput：附近想去的算同區、沒排的景點和餐廳；2 人以上才算大家想去；方案看行程再看資料', () => {
  const it = emptyItinerary();
  const day = it.days[1];
  it.nights[day.date] = { lodging: 'inn' };
  day.items = [{ id: 'v', type: 'visit', options: [{ place: 'placed', stayMinutes: null }], selected: 0 }];
  it.nights[it.days[2].date] = { lodging: 'inn', meals: 'none' };
  const byId = new Map(
    [place('inn', 'lodging', 'shima', { meals: 'dinner+breakfast' }), place('placed', 'spot', 'shima'), place('near', 'spot', 'shima'), place('food', 'restaurant', 'shima'), place('far', 'spot', 'toba'), place('other-inn', 'lodging', 'shima')].map((p) => [p.id, p]),
  );
  const votes = [like('placed', 'a'), like('near', 'a'), like('near', 'b'), like('food', 'a'), like('far', 'a'), like('far', 'b'), like('other-inn', 'a'), like('far', 'c', 'dislike')];
  const i = buildStarterInput({ itinerary: it, plan: null, votes, byId, areas: AREAS, day: null });
  const d = i.days[1];
  assert.equal(d.hasStops, true);
  assert.equal(d.areaName, '志摩');
  assert.equal(d.nearbyWishes, 2);
  assert.equal(d.dinnerIncluded, true);
  assert.equal(i.days[2].dinnerIncluded, false);
  assert.equal(i.days[2].dinnerExcluded, true);
  assert.equal(i.days[2].hasStops, false);
  assert.equal(i.wishesUnplaced, 4);
  assert.equal(i.popularUnplaced, 2);
  assert.equal(i.anyLiked, true);
  // 引擎還沒算好：不亂推薦餐
  assert.equal(d.hasLunch, true);
  assert.equal(d.hasDinner, true);
});

test('buildStarterInput：引擎算好的餐和錯誤', () => {
  const entry = (meal: string) => ({ kind: 'visit', meal, mealTags: [] });
  const plan = {
    warnings: [],
    days: DATES.map((date) => ({
      date,
      gaps: [],
      stats: {},
      entries: date === '2027-02-03' ? [entry('lunch'), entry('dinner')] : [],
      warnings: date === '2027-02-04' ? [{ code: 'stairs', level: 'note', message: '小事' }, { code: 'late', level: 'act', message: '趕不上' }] : [],
    })),
  } as never;
  const i = buildStarterInput({ itinerary: emptyItinerary(), plan, votes: [], byId: new Map(), areas: AREAS, day: null });
  assert.equal(i.days[1].hasLunch, true);
  assert.equal(i.days[1].hasDinner, true);
  assert.equal(i.days[2].hasLunch, false);
  assert.equal(i.days[2].errorWarning, '趕不上');
  assert.equal(i.warnings, 1);
});

test('引導彈窗的進度（T46）：① 任何一位家人按過 ♡ ② 每晚都定了區 ③ 每晚都有住宿 ④ 2/3～2/12 每天排了東西', () => {
  assert.equal(guideProgress(input()).done, 4);
  assert.equal(guideProgress(input({}, { anyLiked: false })).liked, false);
  // 只定了區、還沒選住宿：② 完成、③ 還沒
  const areaOnly = guideProgress(input({ '2027-02-12': { lodging: false } }));
  assert.equal(areaOnly.areas, true);
  assert.equal(areaOnly.lodging, false);
  // 選了住宿、區照住宿（area 沒寫也算定了區）
  assert.equal(guideProgress(input({ '2027-02-05': { area: null } })).areas, true);
  assert.equal(guideProgress(input({ '2027-02-05': { area: null, lodging: false } })).areas, false);
  // 最後一天不住：沒有區、沒有住宿也算完成
  assert.equal(guideProgress(input({ '2027-02-13': { area: null, lodging: false } })).done, 4);
  // 2/2、2/13 沒排東西也算完成
  assert.equal(guideProgress(input({ '2027-02-02': { hasStops: false }, '2027-02-13': { hasStops: false } })).stops, true);
  assert.equal(guideProgress(input({ '2027-02-12': { hasStops: false } })).stops, false);
});

test('引導彈窗現在該做的那一步：第一個還沒完成的；全部完成是 null', () => {
  const all = { liked: true, areas: true, lodging: true, stops: true, done: 4 };
  assert.equal(guideCurrent(all), null);
  assert.equal(guideCurrent({ ...all, liked: false, areas: false, done: 2 }), 1);
  assert.equal(guideCurrent({ ...all, areas: false, lodging: false, done: 2 }), 2);
  assert.equal(guideCurrent({ ...all, lodging: false, done: 3 }), 3);
  assert.equal(guideCurrent({ ...all, stops: false, done: 3 }), 4);
  // 前面的步驟沒做，後面的照樣可以先做：只決定哪一顆按鈕是實心
  assert.equal(guideCurrent({ ...all, liked: false, done: 3 }), 1);
});

test('lodgingStarter：第 ③ 步問住宿，區還沒定完也問住宿；每晚都有住宿是 null', () => {
  const noArea = Object.fromEntries(DATES.map((d) => [d, { lodging: false, area: null }]));
  // 第一張卡先問區，第 ③ 步的「問 AI」直接問住宿
  assert.equal(firstStarter(input(noArea)).q, '幫我先排每晚住哪一區');
  assert.deepEqual(lodgingStarter(input(noArea)), { q: '幫我決定前幾晚住哪', why: '從第一晚開始，15 人的住宿最難訂' });
  assert.deepEqual(lodgingStarter(input({ '2027-02-09': { lodging: false }, '2027-02-10': { lodging: false } })), { q: '幫我決定 2/9～2/10 住哪', why: '還有 2 晚沒住宿' });
  assert.equal(lodgingStarter(input()), null);
});

test('flightCount：只算航班', () => {
  const it = emptyItinerary();
  assert.equal(flightCount(it, '2027-02-02'), 2);
  assert.equal(flightCount(it, '2027-02-05'), 0);
  assert.equal(flightCount(null, '2027-02-02'), 0);
});

test('開新對話的判斷：有訊息、最後一則超過 30 分鐘', () => {
  const at = (iso: string) => ({ createdAt: iso });
  const now = '2026-12-10T10:00:00.000Z';
  assert.equal(shouldStartFresh([], now), false);
  assert.equal(shouldStartFresh([at('2026-12-10T09:30:00.000Z')], now), false);
  assert.equal(shouldStartFresh([at('2026-12-10T09:29:59.000Z')], now), true);
  // 看最後一則，不是第一則
  assert.equal(shouldStartFresh([at('2026-12-01T00:00:00.000Z'), at('2026-12-10T09:59:00.000Z')], now), false);
  assert.equal(shouldStartFresh([at('壞掉的時間')], now), false);
});

test('重新打開網站：隔太久開新對話，舊的還在清單、接得回來；不到 30 分鐘接著原本的', async () => {
  const storage = memoryStorage();
  const t0 = Date.parse('2026-12-10T10:00:00.000Z');
  const a = await harness({ storage, now: () => new Date(t0).toISOString() });
  await a.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const id = a.chat.store.getState().currentId;
  a.close();

  const soon = await harness({ storage, now: () => new Date(t0 + 29 * 60_000).toISOString() });
  assert.equal(soon.chat.store.getState().currentId, id);
  soon.close();

  const later = await harness({ storage, now: () => new Date(t0 + 31 * 60_000).toISOString() });
  const s = later.chat.store.getState();
  assert.equal(s.currentId, null);
  assert.equal(s.messages.length, 0);
  assert.equal(s.conversations.length, 1);
  await later.chat.switchTo(id!);
  assert.ok(later.chat.store.getState().messages.length > 0);
  later.close();
});

test('問 AI 帶來的那一句：放進 lead；拿掉晶片還在；送出、換對話都清掉', async () => {
  const h = await harness();
  const lead = { q: '幫我決定前幾晚住哪', why: '從第一晚開始，15 人的住宿最難訂' };
  await h.chat.ask([{ kind: 'trip' }], lead);
  assert.deepEqual(h.chat.store.getState().lead, lead);
  h.chat.removeContext(0);
  assert.deepEqual(h.chat.store.getState().lead, lead);
  await h.chat.ask([{ kind: 'trip' }], lead);
  await h.chat.newConversation();
  assert.equal(h.chat.store.getState().lead, null);
  await h.chat.ask([{ kind: 'trip' }], lead);
  await h.chat.send(lead.q);
  assert.equal(h.chat.store.getState().lead, null);
  h.close();
});

test('啟動完成前就按了問 AI：晶片和那一句留著；換人時清掉', async () => {
  const h = await harness();
  const lead = { q: '幫我決定前幾晚住哪', why: '從第一晚開始，15 人的住宿最難訂' };
  await h.chat.ask([{ kind: 'trip' }], lead);
  await h.chat.init();
  assert.deepEqual(h.chat.store.getState().contexts, [{ kind: 'trip' }]);
  assert.deepEqual(h.chat.store.getState().lead, lead);
  await h.chat.init({ keepAsked: false });
  assert.deepEqual(h.chat.store.getState().contexts, []);
  assert.equal(h.chat.store.getState().lead, null);
  h.close();
});

test('引導彈窗第 ④ 步：第一個還沒排的天，航班的天不算；住宿沒定也一樣', () => {
  assert.equal(firstEmptyDate(input({ '2027-02-02': { hasStops: false }, '2027-02-06': { hasStops: false }, '2027-02-09': { hasStops: false } })), '2027-02-06');
  assert.equal(firstEmptyDate(input({ ...noLodging, '2027-02-03': { lodging: false, hasStops: false } })), '2027-02-03');
  assert.equal(firstEmptyDate(input({ '2027-02-13': { hasStops: false } })), null);
});

test('整趟晶片的問題：沒有提醒不問最趕，住宿都定了不問哪幾晚', () => {
  assert.deepEqual(tripPrompts(input()), []);
  assert.deepEqual(tripPrompts(input({}, { warnings: 2 })), ['哪天最趕？']);
  assert.deepEqual(tripPrompts(input(noLodging)), ['哪幾晚還沒定住宿？']);
});

test('問 AI 可以換掉晶片的建議問題', async () => {
  const h = await harness();
  await h.chat.ask([{ kind: 'day', date: '2027-02-07' }], h.chat.dayStarter('2027-02-07'), ['甲', '乙']);
  assert.deepEqual(h.chat.store.getState().suggestions, ['甲', '乙']);
  h.close();
});

test('dayStarter：行程裡的那天才有', async () => {
  const h = await harness();
  assert.match(h.chat.dayStarter('2027-02-07')!.q, /^2\/7 去哪/);
  assert.equal(h.chat.dayStarter('2027-03-01'), null);
  h.close();
});

test('空的一天不帶晶片：下面兩張直接寫日期', () => {
  assert.deepEqual(emptyDayFollowups('2027-02-03'), ['想去的點哪些適合 2/3？', '2/3 長輩走起來輕鬆的安排']);
});

test('引導彈窗的問法：沒有晶片也有藍卡和下面兩張，拿掉別的晶片不影響', async () => {
  const h = await harness();
  const lead = { q: '幫我決定前幾晚住哪', why: '從第一晚開始，15 人的住宿最難訂' };
  await h.chat.ask([], lead, ['a', 'b']);
  const s = h.chat.store.getState();
  assert.deepEqual(s.contexts, []);
  assert.deepEqual(blankCards(s.lead, s.suggestions, [], s.contexts.length > 0).map((c) => c.q), [lead.q, 'a', 'b']);
  h.close();
});

test('nightLodgingStarter（T54）：整趟「未選住宿」問 AI，同第 ③ 步的問法帶日期和區；最多 3 晚', () => {
  assert.deepEqual(nightLodgingStarter(['2027-02-09'], '二見'), { q: '幫我決定 2/9 在二見住哪', why: '二見還沒選住宿' });
  assert.deepEqual(nightLodgingStarter(['2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12'], '伊勢').q, '幫我決定 2/9～2/11 在伊勢住哪');
});
