// T45c：AI 提議「這晚住某區」、get_trip_overview 回各晚的區、推薦問題先問區。
import assert from 'node:assert/strict';
import test from 'node:test';
import { ItineraryError, lodgingOn, nightAreaOf, setNightArea } from '@travel-helper/engine';
import { applyOps, type OpsContext } from '../src/ai/ops.ts';
import { firstStarter, startersFor, type StarterDay, type StarterInput } from '../src/ai/prompts.ts';
import { SYSTEM_PROMPT } from '../src/ai/systemPrompt.ts';
import { emptyItinerary, seedItinerary } from '../src/dev-fixtures/seed.ts';
import { tripDates } from '../src/lib/trip.ts';
import { harness } from './aiHarness.ts';

const ctx: OpsContext = {
  placeType: (id) => (id.startsWith('toba-') || id.startsWith('futami-') ? 'lodging' : undefined),
  placeArea: (id) => id.split('-')[0],
  hasArea: (id) => ['shima', 'toba', 'futami', 'ise', 'osaka', 'kix'].includes(id),
  likesOf: () => [],
  me: null,
};

test('setNightArea：只定區不選住宿；換到別區住宿清掉；同區留著；null 清掉', () => {
  const it = seedItinerary();
  const a = applyOps(it, [{ op: 'setNightArea', date: '2027-02-07', area: 'toba' }], ctx);
  assert.deepEqual(a.nights['2027-02-07'], { area: 'toba' });
  assert.equal(lodgingOn(a, '2027-02-07'), null);
  const same = applyOps(it, [{ op: 'setNightArea', date: '2027-02-07', area: 'futami' }], ctx);
  assert.equal(lodgingOn(same, '2027-02-07'), 'futami-oishiya');
  const cleared = applyOps(it, [{ op: 'setNightArea', date: '2027-02-07', area: null }], ctx);
  assert.equal(cleared.nights['2027-02-07'], undefined);
  // 空的行程一次排好幾晚
  const e = applyOps(emptyItinerary(), [
    { op: 'setNightArea', date: '2027-02-02', area: 'shima' },
    { op: 'setNightArea', date: '2027-02-03', area: 'shima' },
  ], ctx);
  assert.equal(nightAreaOf(e, '2027-02-03'), 'shima');
});

test('setNightArea：只選了住宿、沒寫區的晚上，同區照住宿推，住宿不清', () => {
  const it = emptyItinerary();
  it.nights['2027-02-05'] = { lodging: 'toba-kokusai-hotel' };
  const a = applyOps(it, [{ op: 'setNightArea', date: '2027-02-05', area: 'toba' }], ctx);
  assert.equal(lodgingOn(a, '2027-02-05'), 'toba-kokusai-hotel');
  // 和 engine 直接呼叫一樣
  assert.deepEqual(a, setNightArea(it, '2027-02-05', 'toba', 'toba'));
});

test('setNightArea：沒有的區、最後一天、不在旅程的日期都丟錯', () => {
  const it = emptyItinerary();
  assert.throws(() => applyOps(it, [{ op: 'setNightArea', date: '2027-02-05', area: 'nagoya' }], ctx), ItineraryError);
  assert.throws(() => applyOps(it, [{ op: 'setNightArea', date: '2027-02-13', area: 'kix' }], ctx), ItineraryError);
  assert.throws(() => applyOps(it, [{ op: 'setNightArea', date: '2030-01-01', area: 'toba' }], ctx), ItineraryError);
  assert.throws(() => applyOps(it, [{ op: 'setNightArea', date: '2027-02-05', area: 3 as never }], ctx), ItineraryError);
});

test('get_trip_overview：每天的區、每晚住哪一區和連住第幾晚、還沒決定的晚上', async () => {
  const h = await harness();
  const run = async (name: string, input: Record<string, unknown> = {}) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as Record<string, any>;
  let o = await run('get_trip_overview');
  assert.deepEqual(o.undecidedNights, []);
  const day = (date: string) => o.days.find((x: any) => x.date === date);
  assert.equal(day('2027-02-05').area, '志摩 → 鳥羽');
  assert.deepEqual(day('2027-02-05').stayArea, { id: 'toba', name: '鳥羽' });
  assert.equal(day('2027-02-06').areaNight, '2/2');
  // 最後一天沒有晚上
  assert.equal('stayArea' in day('2027-02-13'), false);
  assert.equal(day('2027-02-13').area, '關西機場周邊');

  await h.shared.changeItinerary((it) => setNightArea(setNightArea(it, '2027-02-10', null), '2027-02-11', null), 'test');
  o = await run('get_trip_overview');
  assert.deepEqual(o.undecidedNights, ['2027-02-10', '2027-02-11']);
  assert.equal(day('2027-02-10').stayArea, null);
  assert.equal(day('2027-02-10').area, null);

  // get_day 也帶
  const d = await run('get_day', { date: '2027-02-09' });
  assert.deepEqual(d.stayArea, { id: 'ise', name: '伊勢' });
  h.close();
});

test('check_changes：區的改動寫名字', async () => {
  const h = await harness();
  const r = (await h.chat.tools.find((t) => t.name === 'check_changes')!.run({ ops: [{ op: 'setNightArea', date: '2027-02-07', area: 'toba' }] })).output as Record<string, any>;
  assert.equal(r.ok, true);
  assert.ok(r.summary.includes('2/7：住的區 二見 → 鳥羽'), r.summary.join('\n'));
  assert.ok(r.summary.some((s: string) => s.startsWith('2/7：住宿')));
  h.close();
});

test('鳥羽多住一晚：提議只改區；採用後寫進 nights，整趟時不跳到那天；復原回去', async () => {
  const h = await harness();
  h.app.getState().selectDay('all');
  await h.chat.send('鳥羽多住一晚');
  assert.deepEqual(h.called(), ['get_trip_overview', 'check_changes', 'propose_changes']);
  const proposal = h.app.getState().proposal!;
  assert.ok(proposal.changes.some((c) => c.kind === 'night-area' && c.after === 'toba'));
  // 還沒寫進去
  assert.equal(h.data.getState().itinerary!.nights['2027-02-07'].area, 'futami');
  assert.deepEqual(await h.chat.confirmCard(h.lastUse('propose_changes').id), { ok: true });
  const it = h.data.getState().itinerary!;
  assert.deepEqual(it.nights['2027-02-07'], { area: 'toba' });
  assert.equal(h.cardOf('propose_changes')?.status, 'confirmed');
  await h.shared.store.getState().toast!.action!.run();
  assert.equal(h.data.getState().itinerary!.nights['2027-02-07'].lodging, 'futami-oishiya');
  h.close();
});

test('系統提示：整趟先定區再挑住宿，單天先看這晚的區', () => {
  assert.match(SYSTEM_PROMPT, /undecidedNights/);
  assert.match(SYSTEM_PROMPT, /setNightArea/);
  assert.match(SYSTEM_PROMPT, /先定區再挑住宿/);
  assert.match(SYSTEM_PROMPT, /單天的問題/);
});

const DATES = tripDates();
const blank = (date: string, patch: Partial<StarterDay> = {}): StarterDay => ({ date, area: null, lodging: false, dinnerIncluded: false, dinnerExcluded: false, hasStops: false, hasLunch: false, hasDinner: false, areaName: null, nearbyWishes: 0, errorWarning: null, ...patch });
const input = (days: StarterDay[]): StarterInput => ({ days, day: null, warnings: 0, wishesUnplaced: 0, popularUnplaced: 0, anyLiked: false });

test('推薦問題：每晚的區都還沒定 → 先排區', () => {
  assert.deepEqual(firstStarter(input(DATES.map((d) => blank(d)))), { q: '幫我先排每晚住哪一區', why: '先定區，再挑住宿' });
});

test('推薦問題：有晚上還沒定區 → 連續的一段（不限 3 晚），區排在住宿前面', () => {
  const days = DATES.map((d, i) => blank(d, i < 3 ? { area: 'shima', areaName: '志摩' } : i === 6 ? { area: 'ise', areaName: '伊勢', lodging: true } : {}));
  assert.deepEqual(firstStarter(input(days)), { q: '幫我決定 2/5～2/7 住哪一區', why: '還有 7 晚沒決定區' });
  // 不重複問住宿
  assert.ok(!startersFor(input(days)).some((s) => s.q === '哪幾晚還沒定住宿？'));
});

test('推薦問題：區都定了才問住宿（只選了住宿的晚上也算定了區）', () => {
  const days = DATES.map((d, i) => blank(d, i === 0 ? { lodging: true } : { area: 'shima', areaName: '志摩' }));
  assert.equal(firstStarter(input(days)).q, '幫我決定 2/3～2/5 住哪');
});
