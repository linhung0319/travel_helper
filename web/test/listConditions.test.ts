// T64：條件列（條件晶片怎麼從 Filter 算出來）、搜尋篩到 0 個時的下一步、問 AI 的那句（interaction-design §30、§35.5）；區段 0 個在 sections.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionChips, emptyHelp, listDraft, placeLabel, withoutChip } from '../src/lib/listConditions.ts';
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
const port = { areas: ['north'], regions: ['port'] };
const north = { areas: ['north'], regions: [] };
const f = (over: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...over });
// 「一定要去」「全員 15 人」的條件（區段、AI 用同樣的值）
const mustAt = (base: Pick<Filter, 'areas' | 'regions'>) => f({ ...base, types: ['spot'], tiers: ['S', 'A'] });
const allAt = (base: Pick<Filter, 'areas' | 'regions'>) => f({ ...base, types: ['restaurant'], who: ['all'] });

test('placeLabel：「北・港邊」、沒選子地區是「北」、沒選地區是 null', () => {
  assert.equal(placeLabel(port, AREAS), '北・港邊');
  assert.equal(placeLabel(north, AREAS), '北');
  assert.equal(placeLabel({ areas: [], regions: [] }, AREAS), null);
  assert.equal(placeLabel({ areas: ['north', 'south'], regions: [] }, AREAS), null);
});

test('conditionChips：面板的條件照面板順序，最後是搜尋、地圖畫面；地區、子地區不列', () => {
  const chips = conditionChips({ ...allAt(port), contexts: ['lunch'] }, ' 海 ', AREAS, { inView: true });
  assert.deepEqual(
    chips.map((c) => `${c.key}:${c.label}`),
    ['types:餐廳', 'who:全員 15 人', 'contexts:午餐', 'query:搜尋「海」', 'inView:只看地圖畫面裡的'],
  );
  // 沒有條件：空的（條件列不畫）
  assert.deepEqual(conditionChips(f(port), '', AREAS), []);
});

test('withoutChip：拿掉一顆條件、搜尋', () => {
  const filter = mustAt(port);
  assert.deepEqual(withoutChip(filter, '', { key: 'tiers', value: 'S' }).filter.tiers, ['A']);
  assert.deepEqual(withoutChip(filter, '塔', { key: 'query', value: '塔' }), { filter, query: '' });
});

test('listDraft：問 AI 那句寫地區、子地區、條件', () => {
  assert.equal(listDraft(allAt(port), '', AREAS), '在北・港邊找全員 15 人能一起吃的餐廳');
  assert.equal(listDraft(f({ weather: ['rain'] }), '', AREAS), '幫我找下雨也行的地點');
  assert.equal(listDraft(mustAt(north), '', AREAS), '在北找 S、A 級的景點');
  assert.equal(listDraft(f({ ...north, suits: ['elderly'], types: ['spot'] }), '', AREAS), '在北找適合長輩的景點');
  assert.equal(listDraft(f({ weather: ['indoor'] }), '', AREAS), '幫我找室內的地點');
  assert.equal(listDraft(f(north), '塔', AREAS), '在北找地點，名稱有「塔」');
  assert.equal(listDraft(f(port), '', AREAS), '北・港邊有什麼值得去的地方？');
  // 概覽：不預填
  assert.equal(listDraft(EMPTY_FILTER, '', AREAS), null);
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
  // 拿掉最後加的那個
  const extra = emptyHelp(PLACES, { ...allAt(north), contexts: ['dinner'] }, '', AREAS);
  assert.deepEqual(extra.steps.map((s) => s.label), ['拿掉「晚餐」', '問 AI：在北找全員 15 人能一起吃、晚餐的餐廳']);
});
