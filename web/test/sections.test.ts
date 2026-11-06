// T75：探索改版的純邏輯（interaction-design §35.4、35.5）——主題 × 區段、區段的數量、who 拆值、面板照主題分組、探索的層、0 個的下一步、AI 的 set_filter

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeAreas, normalizePlaceList } from '../src/data/normalize.ts';
import type { Area } from '../src/data/types.ts';
import { EMPTY_FILTER, matchesFilter, matchesWho, toFilterPatch, type Filter } from '../src/lib/filter.ts';
import { SECTIONS, THEMES, exploreLayer, scopeCountsByTheme, sectionById, sectionCounts, sectionFilter, sectionPlaces, themeCounts, themeOf, type Theme } from '../src/lib/shelves.ts';
import { sectionEmptyHelp } from '../src/lib/listConditions.ts';
import { THEME_GROUPS, sheetTitle, themeApplied, themeFilter, themePanel } from '../src/shared/filterOptions.ts';
import { WISH_SECTION_HEADS, wishSections } from '../src/shared/wishSections.ts';
import { placeWith } from './helpers.ts';
import { harness } from './aiHarness.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const json = (...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const REAL_AREAS = normalizeAreas(json('data', 'areas.json'));
const REAL = readdirSync(join(ROOT, 'data', 'areas')).flatMap((a) =>
  readdirSync(join(ROOT, 'data', 'areas', a))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => normalizePlaceList(json('data', 'areas', a, f))),
);

const scope = (areas: string[], regions: string[] = [], types: Theme[] = []): Filter => ({ ...EMPTY_FILTER, areas, regions, types });
const counts = (theme: Theme, f: Filter) => sectionCounts(REAL, theme, f).sections.map((s) => s.count);

test('志摩的區段數字（真資料）：景點 5／19／8、餐廳 26／18／34、住宿 2／9／38／7', () => {
  assert.deepEqual(counts('spot', scope(['shima'])), [5, 19, 8]);
  assert.deepEqual(counts('restaurant', scope(['shima'])), [26, 18, 34]);
  assert.deepEqual(counts('lodging', scope(['shima'])), [2, 9, 38, 7]);
  assert.equal(sectionCounts(REAL, 'spot', scope(['shima'])).total, 24);
  assert.equal(sectionCounts(REAL, 'restaurant', scope(['shima'])).total, 78);
  assert.equal(sectionCounts(REAL, 'lodging', scope(['shima'])).total, 56);
});

test('每個地區、子地區、主題：不重疊的區段加起來等於總數（下雨也行除外），區段裡的列不重複', () => {
  for (const area of REAL_AREAS) {
    for (const regions of [[], ...(area.regions ?? []).map((r) => [r.id])]) {
      for (const theme of THEMES) {
        const f = scope([area.id], regions);
        const { total, sections } = sectionCounts(REAL, theme, f);
        const sum = sections.filter((s) => !s.section.overlap).reduce((n, s) => n + s.count, 0);
        assert.equal(sum, total, `${area.id} ${regions.join()} ${theme}`);
        const ids = SECTIONS[theme].filter((s) => !s.overlap).flatMap((s) => sectionPlaces(REAL, s, f).map((p) => p.id));
        assert.equal(new Set(ids).size, ids.length, `${area.id} ${theme} 重複`);
      }
    }
  }
});

test('區段的條件（§35.4 的表）：標題、說明、Filter 的值', () => {
  const show = (t: Theme) => SECTIONS[t].map((s) => [s.title, s.filter]);
  assert.deepEqual(show('spot'), [
    ['一定要去', { tiers: ['S', 'A'] }],
    ['其他景點', { tiers: ['B'] }],
    ['下雨也行', { weather: ['rain'] }],
  ]);
  assert.deepEqual(show('restaurant'), [
    ['全員吃飯', { who: ['together'] }],
    ['要分桌', { who: ['split'] }],
    ['要分組去', { who: ['apart'] }],
  ]);
  assert.deepEqual(show('lodging'), [
    ['包棟・全團一棟', { stay: ['whole'] }],
    ['包棟・要分住', { stay: ['multi'] }],
    ['旅館飯店', { stay: ['hotel'] }],
    ['民宿', { stay: ['other'] }],
  ]);
  assert.ok(SECTIONS.spot.find((s) => s.id === 'rain')!.overlap);
  assert.ok(!JSON.stringify(SECTIONS).includes('主辦'));
});

test('tiers B 收得到沒評等級的（其他景點）；S、A 不收', () => {
  const none = placeWith({}, { id: 'x', type: 'spot', tier: null });
  assert.ok(matchesFilter(none, { ...EMPTY_FILTER, tiers: ['B'] }));
  assert.ok(!matchesFilter(none, { ...EMPTY_FILTER, tiers: ['S', 'A'] }));
  // 鳥羽有沒評等級的景點：一定要去＋其他景點＝全部
  const toba = sectionCounts(REAL, 'spot', scope(['toba']));
  assert.equal(toba.sections[0].count + toba.sections[1].count, toba.total);
});

test('who 拆值：together＝fit15 yes、split＝fit15 split、apart＝其他（三個切完，不看收不收小孩）；all 照舊', () => {
  const r = (fit15: string | undefined, kids?: string) => placeWith({ group: fit15 ? { fit15 } : {}, kids: kids ? { allowed: kids } : undefined }, { id: `r-${fit15}-${kids}`, type: 'restaurant' });
  const yesNoKids = r('yes', 'no');
  assert.ok(matchesWho(yesNoKids, 'together'));
  assert.ok(!matchesWho(yesNoKids, 'all'));
  assert.ok(matchesWho(r('split'), 'split') && matchesWho(r('split'), 'all'));
  for (const p of [r('no'), r('unknown'), r(undefined)]) {
    assert.ok(matchesWho(p, 'apart'));
    assert.ok(!matchesWho(p, 'together') && !matchesWho(p, 'split'));
  }
  // AI 的舊 fit15 轉成新的
  assert.deepEqual(toFilterPatch({ fit15: ['yes'] }), { who: ['together'] });
  assert.deepEqual(toFilterPatch({ fit15: ['split', 'no'] }), { who: ['split', 'apart'] });
});

test('區段和篩選是「而且」：吃選了分組 4～6 人，全員吃飯只剩也能分組的', () => {
  const together = sectionById('together')!;
  const f: Filter = { ...scope(['shima'], [], ['restaurant']), who: ['sub'] };
  const list = sectionPlaces(REAL, together, f);
  assert.ok(list.length > 0);
  for (const p of list) assert.ok(matchesWho(p, 'together') && matchesWho(p, 'sub'), p.id);
  // sectionFilter：同一欄位交集，交集空的留區段的
  assert.deepEqual(sectionFilter(together, f).who, ['together']);
  assert.deepEqual(sectionFilter(sectionById('must')!, { ...EMPTY_FILTER, tiers: ['A', 'B'] }).tiers, ['A']);
  assert.deepEqual(sectionFilter(sectionById('must')!, EMPTY_FILTER).types, ['spot']);
});

test('有篩選時區段數字是符合篩選的數；主題列的數字不看篩選', () => {
  const plain = sectionCounts(REAL, 'spot', scope(['shima']));
  const elderly = sectionCounts(REAL, 'spot', { ...scope(['shima']), suits: ['elderly'] });
  assert.ok(elderly.total < plain.total);
  assert.deepEqual(themeCounts(REAL, scope(['shima'])), { spot: 24, restaurant: 78, lodging: 56 });
  // 搜尋也算進去
  assert.ok(sectionCounts(REAL, 'spot', scope(['shima']), { query: 'zzzz-找不到' }).total === 0);
});

test('scopeCountsByTheme：地區分頁＝目前主題＋篩選；目前地區的子地區＝目前主題（不看篩選）', () => {
  const f: Filter = { ...scope(['shima'], [], ['spot']), suits: ['elderly'] };
  const m = scopeCountsByTheme(REAL, f, '', REAL_AREAS);
  assert.equal(m.get('shima'), sectionCounts(REAL, 'spot', f).total);
  assert.equal(m.get('toba'), sectionCounts(REAL, 'spot', { ...f, areas: ['toba'] }).total);
  const shima = REAL_AREAS.find((a) => a.id === 'shima')!;
  const regionSum = (shima.regions ?? []).reduce((n, r) => n + (m.get(r.id) ?? 0), 0);
  assert.equal(regionSum, 24, '子地區加起來是志摩的景點總數（不看「長輩」）');
  // 沒有主題（概覽）：三類加起來
  const all = scopeCountsByTheme(REAL, EMPTY_FILTER, '', REAL_AREAS);
  assert.equal(all.get('shima'), 24 + 78 + 56);
});

test('exploreLayer：概覽、選了一區（書架不進清單）、清單只給搜尋和 AI 結果集', () => {
  assert.equal(exploreLayer(EMPTY_FILTER, '', false), 'overview');
  assert.equal(exploreLayer({ ...EMPTY_FILTER, types: ['spot'] }, '', false), 'overview');
  assert.equal(exploreLayer(scope(['shima'], [], ['spot']), '', false), 'area');
  assert.equal(exploreLayer({ ...scope(['shima'], ['kashikojima'], ['restaurant']), who: ['sub'], tiers: ['S'] }, '', false), 'area');
  assert.equal(exploreLayer(scope(['shima']), '海', false), 'list');
  assert.equal(exploreLayer(scope(['shima']), '', true), 'list');
  assert.equal(exploreLayer(scope(['shima', 'toba']), '', false), 'list');
  assert.equal(exploreLayer({ ...EMPTY_FILTER, types: ['lodging'], stay: ['whole'] }, '', false), 'list');
  assert.equal(themeOf({ types: ['spot'] }), 'spot');
  assert.equal(themeOf({ types: [] }), null);
  assert.equal(themeOf({ types: ['spot', 'lodging'] }), null);
});

test('面板照主題分組（§35.5）：書架切過的不進面板，吃、住有等級；想去最前面多「誰想去」；網頁多地圖', () => {
  const ids = (t: Theme, src: 'explore' | 'wish' = 'explore') => themePanel(t, src).map((g) => g.id);
  assert.deepEqual(ids('spot'), ['suits', 'spot-reach', 'map']);
  assert.deepEqual(ids('restaurant'), ['group', 'context', 'kids', 'reach', 'restaurant-tier', 'map']);
  assert.deepEqual(ids('lodging'), ['dinner', 'lodging-suits', 'amenity', 'lodging-tier', 'map']);
  assert.deepEqual(ids('spot', 'wish')[0], 'wish');
  assert.deepEqual(themePanel('spot', 'wish')[0].options([], 'wish').map((o) => o.label), ['只看我按的']);
  const keys = (t: Theme) => THEME_GROUPS[t].map((g) => g.key);
  assert.ok(!keys('spot').includes('weather') && !keys('spot').includes('tiers'));
  assert.ok(!keys('lodging').includes('stay'));
  assert.deepEqual(THEME_GROUPS.restaurant[0].options([], 'explore').map((o) => o.value), ['sub']);
  assert.ok(!keys('spot').includes('types'));
  assert.equal(sheetTitle('志摩', 'spot'), '篩選 · 志摩的景點');
  assert.equal(sheetTitle('賢島', 'restaurant'), '篩選 · 賢島的餐廳');
  assert.equal(sheetTitle('志摩・賢島'), '篩選 · 志摩・賢島');
});

test('themeFilter：換主題時拿掉那個主題面板沒有的條件；themeApplied 算面板裡選了幾個', () => {
  const f: Filter = { ...scope(['shima'], ['kashikojima'], ['lodging']), dinner: ['included'], suits: ['elderly', 'winter'], tiers: ['S'], who: ['together', 'sub'], votes: ['mine'] };
  const spot = themeFilter(f, 'spot');
  assert.deepEqual(spot, { ...EMPTY_FILTER, areas: ['shima'], regions: ['kashikojima'], types: ['spot'], suits: ['elderly', 'winter'] });
  const food = themeFilter(f, 'restaurant', 'wish');
  assert.deepEqual([food.who, food.tiers, food.votes, food.suits], [['sub'], ['S'], ['mine'], []]);
  assert.deepEqual(themeFilter(f, 'lodging').suits, ['elderly']);
  assert.equal(themeApplied('lodging', f), 3); // 一泊二食、長輩、S
  assert.equal(themeApplied('spot', { ...EMPTY_FILTER, types: ['spot'] }), 0);
});

test('sectionEmptyHelp：區段 0 個的那句和下一步（看全區、清除篩選、問 AI）', () => {
  const AREAS = [{ id: 'shima', name: { zh: '志摩' }, regions: [{ id: 'kashikojima', name: { zh: '賢島' } }] }] as unknown as Area[];
  const places = [
    placeWith({}, { id: 'a', type: 'spot', tier: 'S', area: 'shima', region: 'other' }),
    placeWith({}, { id: 'b', type: 'spot', tier: 'B', area: 'shima', region: 'kashikojima' }),
  ];
  const must = sectionById('must')!;
  const f: Filter = { ...scope(['shima'], ['kashikojima'], ['spot']) };
  const h = sectionEmptyHelp(places, f, AREAS, must);
  assert.equal(h.message, '賢島沒有「一定要去」的景點');
  assert.deepEqual(
    h.steps.map((s) => [s.kind, s.label]),
    [
      ['widen', '看志摩全區'],
      ['ask', '問 AI：賢島有什麼值得去的景點？'],
    ],
  );
  // 有篩選：多「清除篩選」，數字照區段算
  const withCond = sectionEmptyHelp(places, { ...f, regions: [], suits: ['elderly'] }, AREAS, must);
  assert.deepEqual(withCond.steps.map((s) => s.kind), ['relax', 'ask']);
  assert.equal(withCond.steps[0].kind === 'relax' && withCond.steps[0].count, 1);
  // 整個主題 0 個
  assert.equal(sectionEmptyHelp(places, scope(['shima'], ['kashikojima'], ['lodging']), AREAS).message, '賢島沒有住宿');
  assert.equal(sectionEmptyHelp(places, { ...scope(['shima'], [], ['lodging']), dinner: ['included'] }, AREAS).message, '志摩沒有符合條件的住宿');
});

test('想去的三段用同一個區段的頭（標題、說明）', () => {
  const s = wishSections(['x'], [], null, () => 0);
  assert.deepEqual(
    s.map((x) => [x.id, x.title, x.rule]),
    Object.values(WISH_SECTION_HEADS).map((h) => [h.id, h.title, h.rule]),
  );
  assert.deepEqual(s.map((x) => x.title), ['還沒排', '已是候選', '已排進行程']);
});

test('AI set_filter：給好幾類只用第一個並說明；區段的值收得到', async () => {
  const h = await harness();
  const tool = h.chat.tools.find((t) => t.name === 'set_filter')!;
  const run = (await tool.run({ areas: ['shima'], types: ['spot', 'restaurant'] })) as { output: { ok: boolean; note?: string }; present?: { patch?: Partial<Filter> } };
  assert.equal(run.output.ok, true);
  assert.match(run.output.note ?? '', /只套用了 spot/);
  assert.deepEqual(run.present?.patch?.types, ['spot']);
  const one = (await tool.run({ types: ['restaurant'], who: ['together'] })) as { output: { note?: string }; present?: { patch?: Partial<Filter> } };
  assert.equal(one.output.note, undefined);
  assert.deepEqual(one.present?.patch?.who, ['together']);
  const bad = (await tool.run({ who: ['everyone'] })) as { output: { ok: boolean } };
  assert.equal(bad.output.ok, false);
  const search = h.chat.tools.find((t) => t.name === 'search_places')!;
  const s = (await search.run({ areas: ['shima'], types: ['restaurant'], who: ['split'], limit: 30 })) as unknown as { output: { total: number } };
  assert.equal(s.output.total, 18);
  h.close();
});
