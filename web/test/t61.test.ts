// T61：算得出問題的入口把問題放進輸入框（不送出、不帶晶片、不畫 lead 卡，建議問題照舊）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { blankCards, emptyDayDraft, lodgingDraft, nightLodgingStarter, WISH_EMPTY_DRAFT, type StarterDay } from '../src/ai/prompts.ts';
import { harness } from './aiHarness.ts';

const day = (patch: Partial<StarterDay>): StarterDay => ({ date: '2027-02-09', area: 'toba', lodging: true, dinnerIncluded: false, dinnerExcluded: false, hasStops: false, hasLunch: false, hasDinner: false, areaName: '鳥羽', nearbyWishes: 0, errorWarning: null, ...patch });

test('放進輸入框的句子：住宿加人數、空的一天寫日期和住哪', () => {
  assert.equal(lodgingDraft(nightLodgingStarter(['2027-02-09', '2027-02-10', '2027-02-11'], '二見')), '幫我決定 2/9～2/11 在二見住哪，要 15 人住得下');
  assert.equal(emptyDayDraft(day({})), '2/9 住鳥羽，這天還沒排，幫我排一天');
  assert.equal(emptyDayDraft(day({ areaName: null })), '2/9 這天還沒排，幫我排一天');
  assert.equal(WISH_EMPTY_DRAFT, '推薦幾個適合全家去的地方');
});

test('draft：放進輸入框、不送出、沒有晶片和 lead；建議問題當卡片', async () => {
  const h = await harness();
  await h.chat.ask([{ kind: 'trip' }], { q: 'L', why: 'l' });
  h.chat.removeContext(0);
  await h.chat.draft('幫我排 2/9', ['甲', '乙']);
  const s = h.chat.store.getState();
  assert.equal(s.draftText, '幫我排 2/9');
  assert.equal(s.lead, null);
  assert.deepEqual(s.contexts, []);
  assert.equal(s.messages.length, 0);
  assert.equal(s.status, 'idle');
  assert.deepEqual(blankCards(s.lead, s.suggestions, [{ q: 'A', why: '' }], s.draftText.trim() !== '').map((c) => c.q), ['甲', '乙']);
  h.close();
});

test('draft 沒帶建議問題：卡片照推薦問題', async () => {
  const h = await harness();
  await h.chat.draft(WISH_EMPTY_DRAFT);
  const s = h.chat.store.getState();
  assert.deepEqual(blankCards(s.lead, s.suggestions, [{ q: 'A', why: '' }], true).map((c) => c.q), ['A']);
  h.close();
});

test('dayDraft：行程裡的那天才有', async () => {
  const h = await harness();
  assert.match(h.chat.dayDraft('2027-02-07')!, /^2\/7 .*幫我排一天$/);
  assert.equal(h.chat.dayDraft('2027-03-01'), null);
  h.close();
});
