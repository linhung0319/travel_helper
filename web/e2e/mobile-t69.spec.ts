// T69：手機的探索「看哪裡」和「看什麼」分開（interaction-design §33）：換子地區、地區篩選留著，「‹ 書架」回書架，概覽離開篩選可以復原；
// 想去的子地區列。SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png` });
};

test('手機：換子地區、地區篩選留著；‹ 書架 回書架；概覽離開篩選可以復原', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const bar = page.getByTestId('fb-stick');
  await page.getByTestId('m-feed-area-shima').click();
  await page.locator('[data-testid="shelf"][data-shelf="must"]').getByTestId('shelf-all').click();
  await expect(bar.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(bar.getByTestId('region-shima-yokoyama').getByTestId('scope-count')).toHaveText(/^\d+$/);
  await shot(page, 't69-mobile-lens');

  await bar.getByTestId('region-shima-kashikojima').click();
  await expect(bar.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(bar.getByTestId('lens-note')).toHaveText('賢島沒有 S、A 級，這是 B 級');

  await page.getByTestId('m-feed-area-toba').click();
  await expect(bar.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(bar.getByTestId('region-osatsu')).toBeVisible();

  await bar.getByTestId('back-to-area').click();
  await expect(bar.getByTestId('lens')).toHaveCount(0);
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'toba');

  await page.locator('[data-testid="shelf"][data-shelf="must"]').getByTestId('shelf-all').click();
  await page.getByTestId('m-feed-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  await expect(page.getByTestId('lens-undo')).toContainText('一定要去 · 鳥羽');
  await shot(page, 't69-mobile-undo');
  await page.getByTestId('lens-undo-btn').click();
  await expect(bar.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(page.getByTestId('m-feed-area-toba')).toHaveAttribute('aria-pressed', 'true');
});

test('手機：工具列五顆不擠出畫面；想去也有子地區列，換子地區還是那一排', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const row = page.locator('.fb-row').first();
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const id of ['filter-open', 'sort-open', 'list-ask-ai', 'add-place-open']) await expect(row.getByTestId(id)).toBeInViewport({ ratio: 1 });

  await page.getByTestId('m-tab-wish').click();
  await page.getByTestId('m-wish-area-toba').click();
  const wish = page.getByTestId('m-wish');
  await expect(wish.getByTestId('region-chips')).toBeVisible();
  await page.getByTestId('wish-shelf-all-candidate').click();
  await expect(wish.getByTestId('lens-title')).toHaveText('已是候選');
  await wish.getByTestId('region-chips').locator('button').nth(1).click();
  await expect(wish.getByTestId('lens-title')).toHaveText('已是候選');
  await shot(page, 't69-mobile-wish');
});
