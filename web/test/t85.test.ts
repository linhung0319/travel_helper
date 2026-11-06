// T85（interaction-design §37）：AI 給點時的右欄與地圖——結果集列的書架名小標、set_filter 打開有結果的區段、
// 「AI 幫你套了」的狀態（記 key、使用者動了就清、復原）、set_filter 回給 AI 的區段數字、地圖水滴（aiDrops）只畫最新的一組

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureCollection, Point } from 'geojson';
import { normalizePlaceList } from '../src/data/normalize.ts';
import { EMPTY_FILTER, type Filter } from '../src/lib/filter.ts';
import { filterMatches, filterSummary, sectionCounts, sectionsWithResults, shelfOf, withTheme } from '../src/lib/shelves.ts';
import { aiDrops } from '../src/lib/overlays.ts';
import { createAppStore } from '../src/store.ts';
import { aiFilterKey } from '../src/shared/aiFilter.ts';
import { placeWith } from './helpers.ts';
import { harness } from './aiHarness.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const json = (...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const REAL = readdirSync(join(ROOT, 'data', 'areas')).flatMap((a) =>
  readdirSync(join(ROOT, 'data', 'areas', a))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => normalizePlaceList(json('data', 'areas', a, f))),
);
const f = (over: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...over });
const at = (id: string, over: Parameters<typeof placeWith>[1], raw: Record<string, unknown> = {}) => placeWith(raw, { id, area: 'toba', region: 'toba-station', ...over });
const NO_POINTS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };

test('書架名小標（shelfOf）：取第一個符合的區段，下雨也行不標；三類各一例，車站沒有', () => {
  assert.equal(shelfOf(at('aq', { type: 'spot', tier: 'S' }, { weather: 'indoor' }))?.title, '一定要去');
  assert.equal(shelfOf(at('beach', { type: 'spot', tier: null }, { weather: 'indoor' }))?.title, '其他景點');
  assert.equal(shelfOf(at('big', { type: 'restaurant' }, { group: { fit15: 'yes' } }))?.title, '全員吃飯');
  assert.equal(shelfOf(at('split', { type: 'restaurant' }, { group: { fit15: 'split' } }))?.title, '要分桌');
  assert.equal(shelfOf(at('small', { type: 'restaurant' }, {}))?.title, '要分組去');
  assert.equal(shelfOf(at('whole', { type: 'lodging' }, { kind: 'rental-house', group: { wholeRental: true, maxGuests: 16 } }))?.title, '包棟・全團一棟');
  assert.equal(shelfOf(at('st', { type: 'station' })), null);
  // 真資料：每個景點、餐廳都標得出來，景點一定是前兩排
  for (const p of REAL) {
    if (p.type === 'spot') assert.match(shelfOf(p)?.id ?? '', /^(must|other)$/, p.id);
    if (p.type === 'restaurant') assert.ok(shelfOf(p), p.id);
  }
});

test('set_filter 打開的區段（sectionsWithResults）：只開數字大於 0 的；條件剛好是某一格時只開那格；沒選地區不動', () => {
  const toba = f({ areas: ['toba'], types: ['restaurant'] });
  const open = sectionsWithResults(REAL, toba);
  const counts = sectionCounts(REAL, 'restaurant', toba).sections;
  assert.deepEqual(open, counts.filter((c) => c.count > 0).map((c) => c.section.id));
  assert.ok(open.length >= 2);
  assert.deepEqual(sectionsWithResults(REAL, { ...toba, who: ['together'] }), ['together']);
  assert.deepEqual(sectionsWithResults(REAL, f({ types: ['restaurant'], kids: ['ok'] })), []);
  assert.deepEqual(sectionsWithResults(REAL, f({ areas: ['toba'] })), []);
});

test('選了一區一定有主題（withTheme）：沒給是玩、好幾類取第一個、本來就有的不換物件', () => {
  assert.deepEqual(withTheme(f({ areas: ['toba'] })).types, ['spot']);
  assert.deepEqual(withTheme(f({ areas: ['toba'], types: ['lodging', 'spot'] })).types, ['lodging']);
  const ok = f({ areas: ['toba'], types: ['restaurant'] });
  assert.equal(withTheme(ok), ok);
  const none = f({ types: [] });
  assert.equal(withTheme(none), none);
});

test('回給 AI 的數字（filterSummary）：選了一區照區段名寫，和右欄的區段數一樣；沒選地區只有總數', () => {
  const toba = f({ areas: ['toba'], types: ['restaurant'] });
  const s = filterSummary(REAL, toba);
  const c = sectionCounts(REAL, 'restaurant', toba);
  assert.equal(s.total, c.total);
  assert.deepEqual(Object.keys(s.sections ?? {}), ['全員吃飯', '要分桌', '要分組去']);
  assert.equal(s.sections!['全員吃飯'], c.sections[0].count);
  const all = filterSummary(REAL, f({ types: ['restaurant'], kids: ['ok'] }));
  assert.equal(all.sections, undefined);
  assert.equal(all.total, filterMatches(REAL, f({ types: ['restaurant'], kids: ['ok'] })).length);
});

test('aiDrops：AI 套的篩選不論幾個都畫、頭是類型字；和結果集、提議照「最新的一組」互相取代', () => {
  const ids = Array.from({ length: 60 }, (_, i) => `p${i}`);
  const filterDrops = aiDrops({ aiResult: null, aiFilter: { ids }, highlights: {}, proposalPoints: NO_POINTS, latest: 'filter' });
  assert.equal(filterDrops.length, 60);
  assert.ok(filterDrops.every((d) => d.glyph && d.head === undefined));
  // 結果集最新：畫結果集，不畫篩選
  const result = { ids: ['a', 'b'], lettered: true };
  assert.deepEqual(
    aiDrops({ aiResult: result, aiFilter: { ids }, highlights: {}, proposalPoints: NO_POINTS, latest: 'result' }).map((d) => d.head),
    ['A', 'B'],
  );
  // 提議最新：畫提議新增的點
  const points: FeatureCollection<Point> = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { id: 'x', order: 2, status: 'added' } }] };
  assert.deepEqual(
    aiDrops({ aiResult: null, aiFilter: { ids }, highlights: {}, proposalPoints: points, latest: 'proposal' }).map((d) => [d.id, d.head]),
    [['x', '2']],
  );
  // 篩選最新：提議還在也畫篩選
  assert.equal(aiDrops({ aiResult: null, aiFilter: { ids }, highlights: {}, proposalPoints: points, latest: 'filter' }).length, 60);
  // 使用者動了篩選（aiFilter 是 null）：沒有水滴
  assert.equal(aiDrops({ aiResult: null, aiFilter: null, highlights: {}, proposalPoints: NO_POINTS, latest: 'filter' }).length, 0);
});

test('appStore.aiFilter：設了是最新的一組；記 key 只記第一次；新的結果集清掉它', () => {
  const app = createAppStore();
  const undo = () => {};
  app.getState().setAiFilter({ ids: ['a'], key: null, undo });
  assert.equal(app.getState().aiLatest, 'filter');
  app.getState().setAiFilterKey('k1');
  assert.equal(app.getState().aiFilter?.key, 'k1');
  app.getState().setAiResult({ title: 't', ids: ['b'], notes: {}, lettered: false });
  assert.equal(app.getState().aiFilter, null);
  assert.equal(app.getState().aiLatest, 'result');
});

test('aiFilterKey：值的順序不影響；改了任何條件、搜尋就不一樣', () => {
  const a = f({ areas: ['toba'], types: ['restaurant'], contexts: ['lunch', 'dinner'] });
  const b = f({ areas: ['toba'], types: ['restaurant'], contexts: ['dinner', 'lunch'] });
  assert.equal(aiFilterKey(a, ''), aiFilterKey(b, ' '));
  assert.notEqual(aiFilterKey(a, ''), aiFilterKey({ ...a, kids: ['ok'] }, ''));
  assert.notEqual(aiFilterKey(a, ''), aiFilterKey({ ...a, types: ['spot'] }, ''));
  assert.notEqual(aiFilterKey(a, ''), aiFilterKey(a, '海女'));
});

test('set_filter 從工具到畫面：回傳區段數字；套好後切到探索、有結果的區段打開、符合的點是水滴；復原回到套用前', async () => {
  const h = await harness();
  const app = h.app;
  // 原本在行程分頁、看志摩的景點、開著一個區段
  app.getState().setMode('map');
  app.getState().setFilter({ areas: ['shima'], types: ['spot'] });
  app.getState().setSectionsOpen(['must'], 'explore');
  const tool = h.chat.tools.find((t) => t.name === 'set_filter')!;
  const run = (await tool.run({ areas: ['toba'], types: ['restaurant'] })) as { output: { ok: boolean; total: number; sections: Record<string, number> } };
  const after = f({ areas: ['toba'], types: ['restaurant'] });
  assert.equal(run.output.ok, true);
  assert.equal(run.output.total, sectionCounts(h.data.getState().places, 'restaurant', after).total);
  assert.deepEqual(Object.keys(run.output.sections), ['全員吃飯', '要分桌', '要分組去']);

  assert.equal(h.stage.setFilter({ areas: ['toba'], types: ['restaurant'] }, false), null);
  const s = app.getState();
  assert.equal(s.mode, 'explore');
  assert.deepEqual(s.sectionsOpen.explore, sectionsWithResults(h.data.getState().places, s.filter));
  assert.equal(s.aiLatest, 'filter');
  assert.deepEqual(s.aiFilter?.ids, filterMatches(h.data.getState().places, s.filter).map((p) => p.id));
  assert.ok((s.aiFilter?.ids.length ?? 0) > 10);
  // 沒給主題、選了一區：補成「玩」（不然探索畫面自己補，會被當成使用者動了）
  h.stage.setFilter({ areas: ['ise'], types: [] }, false);
  assert.deepEqual(app.getState().filter.types, ['spot']);

  // 復原：回到第二次套用之前（鳥羽 · 吃，區段是第一次打開的那些）
  const before = app.getState().aiFilter!;
  app.getState().setAiFilter(null);
  before.undo();
  assert.deepEqual(app.getState().filter.areas, ['toba']);
  assert.deepEqual(app.getState().filter.types, ['restaurant']);

  // clear_view 收掉水滴
  h.stage.setFilter({ who: ['together'] }, false);
  assert.deepEqual(app.getState().sectionsOpen.explore, ['together']);
  h.stage.clear();
  assert.equal(app.getState().aiFilter, null);
  h.close();
});
