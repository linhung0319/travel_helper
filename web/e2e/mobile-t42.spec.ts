// T42：手機的探索概覽、地區列、書架（interaction-design §18.1）。SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string, fullPage = false) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png`, fullPage });
};

test('手機：概覽 → 選鳥羽 → 書架「全部 ›」→ 回到書架；類型在面板裡', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('m-feed-area-all')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'mobile-overview');

  await overview.locator('[data-area="toba"]').getByTestId('overview-go').click();
  await expect(page.getByTestId('m-feed-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('area-home')).toBeVisible();
  await shot(page, 'mobile-area-toba');

  await page.locator('[data-shelf="fit15"]').getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'toba', type: 'restaurant' });
  expect(feed.quick).toContain('fit15:yes');
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
