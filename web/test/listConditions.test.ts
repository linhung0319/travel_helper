// T64：探索的「現在看」那一列（條件晶片怎麼從 Filter 和書架算出來）、0 個時的下一步、問 AI 的那句（interaction-design §30）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionChips, emptyHelp, listDraft, placeLabel, shelfEmptyHelp, withoutChip } from '../src/lib/listConditions.ts';
import { SHELVES, shelfFilter } from '../src/lib/shelves.ts';
import { EMPTY_FILTER, type Filter } from '../src/lib/filter.ts';
import type { Area } from '../src/data/types.ts';
import { placeWith } from './helpers.ts';

// 故意不用真的區域 ID（區域不寫死）
const AREAS: Area[] = [
  {
    id: 'north',
    name: { ja: '北', zh: '北' } as Area['name'],
    center: [136.8, 34.5],
    bbox: [136.7, 34.45, 136.9, 34.55],
    regions: [
      { id: 'port', name: { ja: '港', zh: '港邊' } },
      { id: 'hill', name: { ja: '丘', zh: '山丘' } },
    ],
  },
];

const at = (id: string, over: Parameters<typeof placeWith>[1], raw: Record<string, unknown> = {}) => placeWith(raw, { id, area: 'north', region: 'port', ...over });
const PLACES = [
  at('tower', { type: 'spot', tier: 'S', region: 'hill', name: { ja: '塔', zh: '塔', en: null } }),
  at('temple', { type: 'spot', tier: 'A', region: 'hill' }, { weather: 'indoor' }),
  at('pier', { type: 'spot', tier: 'B' }, { weather: 'outdoor' }),
  at('shed', { type: 'spot', tier: 'B' }, { weather: 'outdoor' }),
  at('diner', { type: 'restaurant', tier: 'A' }, { group: { fit15: 'split' } }),
  at('hall', { type: 'restaurant', tier: 'A', region: 'hill' }, { group: { fit15: 'yes' } }),
];
const [must, fit15, stay, rain] = SHELVES;
const port = { areas: ['north'], regions: ['port'] };
const north = { areas: ['north'], regions: [] };
const f = (over: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...over });

test('placeLabel：「北・港邊」、沒選子地區是「北」、沒選地區是 null', () => {
  assert.equal(placeLabel(port, AREAS), '北・港邊');
  assert.equal(placeLabel(north, AREAS), '北');
  assert.equal(placeLabel({ areas: [], regions: [] }, AREAS), null);
  assert.equal(placeLabel({ areas: ['north', 'south'], regions: [] }, AREAS), null);
});

test('conditionChips：書架帶來的是藍底、排前面；自己加的、搜尋、地圖畫面在後面；地區、子地區不列', () => {
  const chips = conditionChips({ ...shelfFilter(fit15, port), contexts: ['lunch'] }, ' 海 ', AREAS, { inView: true });
  assert.deepEqual(
    chips.map((c) => `${c.preset ? '藍' : '白'}:${c.key}:${c.label}`),
    ['藍:types:餐廳', '藍:fit15:可容納 15 人', '白:contexts:午餐', '白:query:搜尋「海」', '白:inView:只看地圖畫面裡的'],
  );
  // 拿掉書架帶來的一個條件：剩下的都是白底（不再是書架）
  assert.ok(conditionChips(f({ ...port, types: ['restaurant'] }), '', AREAS).every((c) => !c.preset));
  // 想去沒有書架：都是白底
  assert.ok(conditionChips(shelfFilter(must, port), '', AREAS, { shelves: false }).every((c) => !c.preset));
  // 沒有條件：空的（條件列不畫）
  assert.deepEqual(conditionChips(f(port), '', AREAS), []);
});

test('withoutChip：拿掉一顆條件、搜尋', () => {
  const filter = shelfFilter(must, port);
  assert.deepEqual(withoutChip(filter, '', { key: 'tiers', value: 'S' }).filter.tiers, ['A']);
  assert.deepEqual(withoutChip(filter, '塔', { key: 'query', value: '塔' }), { filter, query: '' });
});

test('listDraft：問 AI 那句寫地區、子地區、條件', () => {
  assert.equal(listDraft(shelfFilter(fit15, port), '', AREAS), '在北・港邊找可容納 15 人的餐廳');
  assert.equal(listDraft(shelfFilter(must, north), '', AREAS), '在北找 S、A 級的景點');
  assert.equal(listDraft(f({ ...north, suits: ['elderly'], types: ['spot'] }), '', AREAS), '在北找適合長輩的景點');
  assert.equal(listDraft(f({ weather: ['indoor'] }), '', AREAS), '幫我找室內的地點');
  assert.equal(listDraft(f(north), '塔', AREAS), '在北找地點，名稱有「塔」');
  assert.equal(listDraft(f(port), '', AREAS), '北・港邊有什麼值得去的地方？');
  // 概覽：不預填
  assert.equal(listDraft(EMPTY_FILTER, '', AREAS), null);
});

test('書架 0 個：寫「港邊沒有 S、A 級的景點」，下一步是看整區、降到 B 級、問 AI', () => {
  const help = shelfEmptyHelp(PLACES, must, port, AREAS);
  assert.equal(help.message, '港邊沒有 S、A 級的景點');
  assert.deepEqual(
    help.steps.map((s) => (s.kind === 'ask' ? `ask:${s.draft}` : `${s.kind}:${s.label}:${s.count}`)),
    ['widen:看北全區的一定要去:2', 'relax:看港邊的 B 級景點:2', 'ask:港邊有什麼值得去的景點？'],
  );
  const widen = help.steps[0];
  assert.ok(widen.kind === 'widen' && widen.filter.regions.length === 0 && widen.filter.tiers.join() === 'S,A');
});

test('書架 0 個：數字是 0 的下一步不放；可坐 15 人換成要分桌、下雨也行換成餐廳', () => {
  // 可坐 15 人：整區有 1 家、港邊有要分桌的 1 家
  assert.deepEqual(
    shelfEmptyHelp(PLACES, fit15, port, AREAS).steps.map((s) => s.label),
    ['看北全區的可坐 15 人', '看港邊 15 人要分桌的餐廳', '問 AI：港邊有哪裡可以 15 人一起吃飯？'],
  );
  // 住在這裡：整區也沒有、沒有放寬的條件，只剩問 AI
  const inn = shelfEmptyHelp(PLACES, stay, port, AREAS);
  assert.equal(inn.message, '港邊沒有住宿的資料');
  assert.deepEqual(inn.steps.map((s) => s.kind), ['ask']);
  // 下雨也行：港邊沒有室內的景點，整區有寺；餐廳都在室內
  assert.deepEqual(
    shelfEmptyHelp(PLACES, rain, port, AREAS).steps.map((s) => s.label),
    ['看北全區的下雨也行', '看港邊的餐廳（都在室內）', '問 AI：港邊下雨天可以去哪裡？'],
  );
  // 沒選子地區：沒有「看全區」
  assert.deepEqual(shelfEmptyHelp(PLACES, stay, north, AREAS).steps.map((s) => s.kind), ['ask']);
});

test('清單篩到 0 個：拿掉最後加的、有東西的那個條件；搜尋先清', () => {
  // 港邊的 B 級景點、適合長輩（評分都沒有）→ 拿掉「適合長輩」
  const help = emptyHelp(PLACES, f({ ...port, types: ['spot'], tiers: ['B'], suits: ['elderly'] }), '', AREAS);
  assert.equal(help.message, '港邊沒有符合這些條件的地點');
  assert.deepEqual(help.steps.map((s) => s.label), ['拿掉「適合長輩」', '問 AI：在北・港邊找 B 級、適合長輩的景點']);
  // 只有搜尋：找不到「塔」，整區有（塔在山丘）、清掉搜尋
  const q = emptyHelp(PLACES, f(port), '塔', AREAS);
  assert.equal(q.message, '港邊找不到「塔」');
  assert.deepEqual(q.steps.map((s) => s.label), ['看北全區', '清掉搜尋', '問 AI：在北・港邊找地點，名稱有「塔」']);
  // 書架加了自己的條件：不用書架的放寬，拿掉自己加的
  const extra = emptyHelp(PLACES, { ...shelfFilter(fit15, north), contexts: ['dinner'] }, '', AREAS);
  assert.deepEqual(extra.steps.map((s) => s.label), ['拿掉「晚餐」', '問 AI：在北找可容納 15 人、晚餐的餐廳']);
});
