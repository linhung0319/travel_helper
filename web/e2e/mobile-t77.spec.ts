// T77：手機探索、想去接上 §35 的新長相（主題列＋收合的區段）。核心流程的保險：
// 概覽 → 玩 → 區段收合＋數字加起來等於總數 → 展開「其他景點」看到 B 級 → 子地區 0 的那排 → 篩選面板勾長輩 → 條件列 →
// 換鳥羽條件帶過去 → 開詳情、返回字、按我想去有提示、退回停在原位 → 想去分頁三個區段。SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png` });
};

const sectionCounts = (page: Page) =>
  page.getByTestId('area-home').getByTestId('section').evaluateAll((els) => els.map((e) => [e.getAttribute('data-section'), Number(e.querySelector('[data-testid="section-count"]')?.textContent)] as const));

test('手機探索（T77）：主題列、收合的區段、子地區、篩選、換區帶條件、詳情返回、想去三段', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  // 概覽：工具列是搜尋＋問 AI＋加地點，沒有篩選鈕
  await expect(page.getByTestId('list-ask-ai')).toBeVisible();
  await expect(page.getByTestId('filter-open')).toHaveCount(0);

  // 概覽卡的主題列「玩」→ 志摩的景點
  await overview.locator('[data-area="shima"]').getByTestId('theme-spot').click();
  const home = page.getByTestId('area-home');
  await expect(home).toHaveAttribute('data-theme', 'spot');
  await expect(page.getByTestId('fb-stick').getByTestId('theme-spot')).toHaveAttribute('aria-selected', 'true');
  // 區段預設收合，「一定要去」＋「其他景點」＝主題列的總數（下雨也行和前兩排重疊）
  await expect(home.locator('[data-testid="section"][data-open]')).toHaveCount(0);
  const counts = Object.fromEntries(await sectionCounts(page));
  const total = Number(await page.getByTestId('fb-stick').getByTestId('theme-spot').getByTestId('theme-count').textContent());
  expect(counts.must + counts.other).toBe(total);
  await expect(page.getByTestId('cond-row')).toHaveCount(0);
  await shot(page, 'm-t77-area');

  // 展開「其他景點」：列出 B 級
  await home.locator('[data-section="other"]').getByTestId('section-head').click();
  const other = home.locator('[data-section="other"]');
  await expect(other).toHaveAttribute('data-open', 'true');
  await expect(other.getByTestId('m-feed-item')).toHaveCount(Math.min(counts.other, 60));

  // 子地區：選一個有 0 的區段的子地區，區段收合、0 的展開是虛線框
  const regions = await page.getByTestId('region-chips').locator('[data-testid^="region-shima"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
  let zeroAt: string | null = null;
  for (const r of regions) {
    await page.getByTestId(r).click();
    await expect(page.getByTestId(r)).toHaveAttribute('aria-pressed', 'true');
    if ((await home.getByTestId('section').count()) === 0) continue;
    const c = await sectionCounts(page);
    if (c.some(([, n]) => n === 0) && c.some(([, n]) => n > 0)) {
      zeroAt = r;
      break;
    }
  }
  expect(zeroAt).not.toBeNull();
  await expect(home.locator('[data-testid="section"][data-open]')).toHaveCount(0);
  const zeroId = (await sectionCounts(page)).find(([, n]) => n === 0)![0]!;
  await home.locator(`[data-section="${zeroId}"]`).getByTestId('section-head').click();
  await expect(home.locator(`[data-section="${zeroId}"]`).getByTestId('section-empty')).toBeVisible();
  await page.getByTestId('region-all').click();

  // 篩選面板：只有玩的組，勾長輩 → 條件列
  await page.getByTestId('filter-open').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('篩選 · 志摩的景點');
  await sheet.getByRole('button', { name: '長輩', exact: true }).click();
  await sheet.getByRole('button', { name: /^看 \d+ 個景點$/ }).click();
  await expect(page.getByTestId('cond-row')).toContainText('長輩');

  // 換鳥羽：主題、條件帶過去，子地區清掉
  await page.getByTestId('m-feed-area-toba').click();
  await expect(home).toHaveAttribute('data-area', 'toba');
  await expect(home).toHaveAttribute('data-theme', 'spot');
  await expect(page.getByTestId('cond-row')).toContainText('長輩');
  await expect(page.getByTestId('region-all')).toHaveAttribute('aria-pressed', 'true');

  // 開詳情：返回寫目的地；按我想去有提示；退回停在原位
  await home.locator('[data-section="must"]').getByTestId('section-head').click();
  const row = home.locator('[data-section="must"]').getByTestId('m-feed-item').first();
  await row.click();
  await expect(page.getByTestId('m-detail-back')).toContainText('回到 鳥羽 › 玩');
  // 假資料裡可能已經按過：按了、收回都有提示＋復原
  const liked = (await page.getByTestId('detail-like').getAttribute('aria-pressed')) === 'true';
  await page.getByTestId('detail-like').click();
  await expect(page.getByTestId('toast')).toContainText(liked ? '已收回想去' : '已加到想去');
  await expect(page.getByTestId('toast-undo')).toBeVisible();
  await page.getByTestId('m-detail-back').click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(home.locator('[data-section="must"]')).toHaveAttribute('data-open', 'true');

  // 想去分頁：三個區段
  await page.getByTestId('m-tab-wish').click();
  await expect(page.getByTestId('wish-section')).toHaveCount(3);
  await expect(page.getByTestId('wish-note')).toBeVisible();
  await shot(page, 'm-t77-wish');
});

test('手機探索（T77）：換主題收合區段、篩選留下新主題有的；回概覽收合', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('explore-overview').locator('[data-area="shima"]').getByTestId('theme-restaurant').click();
  const home = page.getByTestId('area-home');
  await expect(home).toHaveAttribute('data-theme', 'restaurant');
  await home.locator('[data-section="together"]').getByTestId('section-head').click();
  await expect(home.locator('[data-section="together"]')).toHaveAttribute('data-open', 'true');

  await page.getByTestId('fb-stick').getByTestId('theme-spot').click();
  await expect(home).toHaveAttribute('data-theme', 'spot');
  await expect(home.locator('[data-testid="section"][data-open]')).toHaveCount(0);
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'shima', type: 'spot' });

  await home.locator('[data-section="must"]').getByTestId('section-head').click();
  await page.getByTestId('m-feed-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__thMobile.getState().feedOpen)).toEqual([]);
});
