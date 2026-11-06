// T78：探索改版的網頁接線（interaction-design §35）。核心流程的保險：
// 概覽 → 進志摩「玩」→ 區段收合、數字加起來等於總數 → 展開「其他景點」看到 B 級 → 標題黏頂 → 子地區晶片的數字、換子地區收合 →
// 篩選面板勾長輩 → 條件列 → 換鳥羽條件、主題、展開的區段帶過去、子地區清掉、右欄捲到頂 → 點列開彈窗（T83 起不原地展開） →
// 點地圖的點彈窗蓋右欄 → revealInExplore 切主題、展開區段、捲到那列 → 換主題收合 → 回概覽全收 → 想去三個區段 → 1180 寬的右欄照片縮小（T82 起 92）。
// SHOT_DIR 有設時把畫面存下來（和 design-lab/d.html 比）。

import { test, type Page } from '@playwright/test';
import { centerOn, expect, likeMany, ready, waitIdle } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const th = <T,>(page: Page, fn: string) => page.evaluate((f) => new Function(`return (${f})(window.__th)`)() as T, fn);
const home = (page: Page) => page.getByTestId('area-home');
const sec = (page: Page, id: string) => home(page).locator(`[data-testid="section"][data-section="${id}"]`);
const sideTop = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('.side-body')!.scrollTop);

test('網頁探索：主題、區段、篩選跟著換區、詳情彈窗、revealInExplore、想去', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  // 概覽：工具列是搜尋＋問 AI＋加地點，沒有篩選鈕；地區分頁不寫數字
  await expect(page.getByTestId('filter-bar')).toHaveAttribute('data-stage', 'overview');
  await expect(page.getByTestId('filter-open')).toHaveCount(0);
  await expect(page.getByTestId('list-ask-ai')).toBeVisible();
  await expect(page.getByTestId('ex-area-chips').getByTestId('scope-count')).toHaveCount(0);
  await shot(page, 't78-overview');

  // 概覽卡的主題列「吃」：直接進志摩的吃
  await page.locator('[data-testid="overview-card"][data-area="shima"]').getByTestId('theme-restaurant').click();
  await expect(home(page)).toHaveAttribute('data-area', 'shima');
  await expect(home(page)).toHaveAttribute('data-theme', 'restaurant');
  await expect(page.getByTestId('theme-restaurant')).toHaveAttribute('aria-selected', 'true');

  // 換「玩」：三個區段都收著，前兩個加起來＝主題列的數字（下雨也行重疊）
  await page.getByTestId('theme-spot').click();
  await expect(home(page)).toHaveAttribute('data-theme', 'spot');
  await expect(home(page).locator('[data-testid="section"][data-open]')).toHaveCount(0);
  const n = async (loc: ReturnType<typeof sec>) => Number(await loc.getByTestId('section-count').innerText());
  const total = Number(await page.getByTestId('theme-spot').getByTestId('theme-count').innerText());
  expect((await n(sec(page, 'must'))) + (await n(sec(page, 'other')))).toBe(total);
  // 地區分頁每顆都寫數字（目前主題）：志摩那顆＝玩的總數
  await expect(page.getByTestId('ex-area-shima').getByTestId('scope-count')).toHaveText(String(total));
  await expect(page.getByTestId('area-ask-ai')).toBeVisible();
  await expect(page.getByTestId('area-add-place')).toBeVisible();
  await shot(page, 't78-shima-spot');

  // 展開「其他景點」：列出 B 級（或沒評的），數量＝標題的數字
  await sec(page, 'other').getByTestId('section-head').click();
  await expect(sec(page, 'other')).toHaveAttribute('data-open', 'true');
  const otherRows = sec(page, 'other').getByTestId('explore-item');
  await expect(otherRows.first()).toBeVisible();
  const otherIds = await otherRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  expect(otherIds.length).toBe(await n(sec(page, 'other')));
  const tiers = await th<(string | null)[]>(page, `(t) => ${JSON.stringify(otherIds)}.map((id) => t.dataStore.getState().byId.get(id).tier)`);
  expect(tiers.every((x) => x === 'B' || x == null)).toBe(true);
  expect(await th<string[]>(page, `(t) => t.appStore.getState().sectionsOpen.explore`)).toEqual(['other']);

  // 標題黏頂：捲下去，「其他景點」的標題停在篩選列下面
  await page.evaluate(() => (document.querySelector('.side-body') as HTMLElement).scrollBy(0, 600));
  const bar = (await page.getByTestId('filter-bar').boundingBox())!;
  const head = (await sec(page, 'other').getByTestId('section-head').boundingBox())!;
  expect(Math.abs(head.y - (bar.y + bar.height))).toBeLessThan(3);
  await shot(page, 't78-sticky');

  // 子地區晶片帶數字；換子地區：區段收合、捲到頂
  const regions = await th<{ id: string; spot: number }[]>(
    page,
    `(t) => t.dataStore.getState().areas.find((a) => a.id === 'shima').regions.map((r) => ({ id: r.id, spot: t.dataStore.getState().places.filter((p) => p.type === 'spot' && p.region === r.id).length }))`,
  );
  const zero = regions.find((r) => r.spot === 0);
  const some = regions.find((r) => r.spot > 0)!;
  await expect(page.getByTestId(`region-${some.id}`).getByTestId('scope-count')).toHaveText(String(some.spot));
  if (zero) await expect(page.getByTestId(`region-${zero.id}`)).toHaveClass(/zero/);
  await page.getByTestId(`region-${some.id}`).click();
  await expect(home(page).locator('[data-testid="section"][data-open]')).toHaveCount(0);
  expect(await sideTop(page)).toBe(0);
  await page.getByTestId('region-all').click();

  // 篩選面板：只有玩的組，標題「篩選 · 志摩的景點」；勾長輩 → 條件列、篩選鈕有點
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toContainText('志摩的景點');
  await expect(page.getByTestId('filter-opt-type-spot')).toHaveCount(0);
  await page.getByTestId('filter-opt-suits-elderly').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-open')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cond-row').getByTestId('cond-chip')).toHaveCount(1);
  const elderShima = Number((await page.getByTestId('cond-count').innerText()).match(/\d+/)![0]);
  expect(elderShima).toBeLessThanOrEqual(total);
  await sec(page, 'must').getByTestId('section-head').click();

  // 換鳥羽：主題、長輩、展開的區段都帶過去，子地區清掉，右欄捲到頂
  await page.evaluate(() => (document.querySelector('.side-body') as HTMLElement).scrollBy(0, 400));
  await page.getByTestId('ex-area-toba').click();
  await expect(home(page)).toHaveAttribute('data-area', 'toba');
  await expect(home(page)).toHaveAttribute('data-theme', 'spot');
  await expect(page.getByTestId('cond-chip')).toHaveCount(1);
  await expect(page.getByTestId('region-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(sec(page, 'must')).toHaveAttribute('data-open', 'true');
  expect(await sideTop(page)).toBe(0);
  await shot(page, 't78-toba-elder');
  // 條件列的 ✕ 拿掉長輩
  await page.getByTestId('cond-chip').click();
  await expect(page.getByTestId('cond-row')).toHaveCount(0);

  // 點列直接開彈窗（T83；蓋在地圖右側），列標成目前這個
  const row = sec(page, 'must').getByTestId('explore-item').first();
  const rowId = (await row.getAttribute('data-id'))!;
  await row.click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('detail-float')).toHaveAttribute('data-at', 'map');
  expect(await th<string>(page, `(t) => t.appStore.getState().detailId`)).toBe(rowId);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detail-float')).toHaveCount(0);

  // 點地圖上的點：彈窗蓋住整個右欄（§13.3 照舊），右欄的區段不動
  const pt = await centerOn(page, rowId, 16);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByTestId('detail-float')).toHaveAttribute('data-at', 'side');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detail-float')).toHaveCount(0);
  await expect(sec(page, 'must')).toHaveAttribute('data-open', 'true');

  // revealInExplore：伊勢的一間住宿（排在後面的那段）→ 換區、換「住」、展開它那段、捲到那列
  const lodge = await th<{ id: string }>(
    page,
    `(t) => { const ps = t.dataStore.getState().places.filter((p) => p.type === 'lodging' && p.area === 'ise'); return { id: ps[ps.length - 1].id }; }`,
  );
  await page.evaluate((id) => (window as any).__th.appStore.getState().revealInExplore(id), lodge.id);
  await expect(home(page)).toHaveAttribute('data-area', 'ise');
  await expect(home(page)).toHaveAttribute('data-theme', 'lodging');
  const target = home(page).locator(`[data-testid="explore-item"][data-id="${lodge.id}"]`);
  await expect(target).toBeInViewport();
  await shot(page, 't78-reveal');

  // 換主題：區段全部收合、捲到頂
  await page.getByTestId('theme-restaurant').click();
  await expect(home(page).locator('[data-testid="section"][data-open]')).toHaveCount(0);
  expect(await sideTop(page)).toBe(0);
  // 回概覽：展開全清
  await sec(page, 'together').getByTestId('section-head').click();
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  expect(await th<string[]>(page, `(t) => t.appStore.getState().sectionsOpen.explore`)).toEqual([]);

  // 想去：按幾個景點，三個區段（收合）、主題列、地區列第一顆「全部」
  await likeMany(page, 3);
  await page.getByTestId('side-tab-wish').click();
  const wl = page.getByTestId('wish-list');
  await expect(wl.getByTestId('wish-section')).toHaveCount(3);
  await expect(page.getByTestId('ex-area-all')).toContainText('全部');
  await expect(page.getByTestId('theme-spot')).toHaveAttribute('aria-selected', 'true');
  await wl.locator('[data-testid="wish-section"][data-section="unscheduled"]').getByTestId('section-head').click();
  await expect(wl.locator('[data-section="unscheduled"] [data-id]').first()).toBeVisible();
  await expect(page.getByTestId('wish-note')).toBeVisible();
  // 想去的面板多「只看我按的」
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-opt-wish-mine')).toBeVisible();
  await page.getByTestId('filter-close').click();
  await shot(page, 't78-wish');
  // 換回探索：探索的展開狀態、想去的各自留著
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('side-tab-wish').click();
  await expect(wl.locator('[data-testid="wish-section"][data-section="unscheduled"]')).toHaveAttribute('data-open', 'true');
});

test('1180 寬：右欄 360，列的照片縮到 92；區段標題照樣黏在篩選列下面', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-shima').click();
  await sec(page, 'other').getByTestId('section-head').click();
  const photo = (await sec(page, 'other').locator('.pr-photo').first().boundingBox())!;
  expect(Math.round(photo.width)).toBe(92);
  await page.evaluate(() => (document.querySelector('.side-body') as HTMLElement).scrollBy(0, 500));
  await waitIdle(page);
  const bar = (await page.getByTestId('filter-bar').boundingBox())!;
  const head = (await sec(page, 'other').getByTestId('section-head').boundingBox())!;
  expect(Math.abs(head.y - (bar.y + bar.height))).toBeLessThan(3);
  await shot(page, 't78-1180');
});
