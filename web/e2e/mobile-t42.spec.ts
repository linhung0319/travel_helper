// T42：手機的探索概覽、地區列、書架（interaction-design §18.1）。SHOT_DIR 有設時存截圖。
// T50：子地區列在篩選列裡、書架的順序、返回鈕「‹ 可坐 15 人」、切換鈕只在清單層。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string, fullPage = false) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png`, fullPage });
};

test('手機概覽（T52）：地區照片、四格書架的數字點進那排、子地區點進那區', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  const toba = overview.locator('[data-area="toba"]');
  await expect(toba.getByTestId('overview-credit')).toHaveText('Michalkun · CC BY-SA 2.5');
  await expect(toba.getByTestId('overview-shelf')).toHaveCount(4);
  await shot(page, 'mobile-overview-t52');

  await toba.locator('[data-shelf="fit15"]').click();
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'toba', type: 'restaurant', query: '' });
  expect(feed.quick).toContain('fit15:yes');
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 可坐 15 人');
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'toba');

  await page.getByTestId('m-feed-area-all').click();
  const region = toba.getByTestId('overview-region').first();
  const rid = await region.getAttribute('data-region');
  await region.click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'toba');
  await expect(page.getByTestId(`region-${rid}`)).toHaveAttribute('aria-pressed', 'true');
});

test('手機：概覽 → 選鳥羽 → 書架「全部 ›」→ 回到書架；類型在面板裡', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('m-feed-area-all')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'mobile-overview');

  await overview.locator('[data-area="toba"]').getByTestId('overview-go').click();
  await expect(page.getByTestId('m-feed-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('area-home')).toBeVisible();
  await expect(page.getByTestId('area-summary')).toHaveCount(0);
  await expect(page.getByTestId('fb-stick').getByTestId('region-chips')).toBeVisible();
  await expect(page.getByTestId('view-photo')).toHaveCount(0);
  expect(await page.getByTestId('shelf').evaluateAll((els) => els.map((e) => e.getAttribute('data-shelf')))).toEqual(['must', 'fit15', 'stay', 'rain']);
  await shot(page, 'mobile-area-toba');

  await page.locator('[data-shelf="fit15"]').getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'toba', type: 'restaurant' });
  expect(feed.quick).toContain('fit15:yes');
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 可坐 15 人');
  await expect(page.locator('.fb-listhead').getByTestId('view-photo')).toBeVisible();
  await shot(page, 'mobile-shelf-all');
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-opt-type-restaurant')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'mobile-filter-sheet');
  await page.getByTestId('filter-done').click();
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('area-home')).toBeVisible();

  // 書架的小卡：整頁詳情
  await page.locator('[data-shelf="must"]').getByTestId('shelf-card').first().click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__thMobile.getState().detail)).toBe(true);
});
