// T69：手機的探索「看哪裡」和「看什麼」分開（interaction-design §33）。
// T80：T75 起「看什麼」是主題＋篩選（§35）：「看什麼」帶子、「‹ 書架」、兩級退、排序鈕、想去的「全部 ›」拿掉了。
// 還在的：換子地區、地區篩選留著，子地區晶片寫數字；概覽離開篩選可以復原；工具列不擠出畫面；想去的子地區列、展開的區段換地區留著。
// SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { likeMany, ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png` });
};

test('手機：換子地區、地區篩選留著；概覽離開篩選可以復原', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const bar = page.getByTestId('fb-stick');
  await page.getByTestId('m-feed-area-shima').click();
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-suits-elderly').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);
  await expect(bar.getByTestId('region-shima-yokoyama').getByTestId('scope-count')).toHaveText(/^\d+$/);
  await shot(page, 't69-mobile-cond');

  await bar.getByTestId('region-shima-kashikojima').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);

  await page.getByTestId('m-feed-area-toba').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);
  await expect(bar.getByTestId('region-osatsu')).toBeVisible();

  await page.getByTestId('m-feed-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  await expect(page.getByTestId('lens-undo')).toContainText('自己篩選 · 鳥羽');
  await shot(page, 't69-mobile-undo');
  await page.getByTestId('lens-undo-btn').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'toba');
  await expect(page.getByTestId('m-feed-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);
});

test('手機：工具列不擠出畫面；想去也有子地區列，展開的區段換地區還在', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const row = page.locator('.fb-row').first();
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const id of ['list-ask-ai', 'add-place-open']) await expect(row.getByTestId(id)).toBeInViewport({ ratio: 1 });
  await page.getByTestId('m-feed-area-toba').click();
  await expect(page.locator('.fb-row').first().getByTestId('filter-open')).toBeInViewport({ ratio: 1 });

  await likeMany(page, 3);
  await page.getByTestId('m-tab-wish').click();
  const wish = page.getByTestId('m-wish');
  const unsched = wish.locator('[data-testid="wish-section"][data-section="unscheduled"]');
  await unsched.getByTestId('section-head').click();
  await expect(unsched).toHaveAttribute('data-open', 'true');
  // 換區帶著（換子地區、換主題才收合，T77）
  await page.getByTestId('m-wish-area-toba').click();
  await expect(wish.getByTestId('region-chips')).toBeVisible();
  await expect(unsched).toHaveAttribute('data-open', 'true');
  await shot(page, 't69-mobile-wish');
});
