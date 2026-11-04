// T67：手機的篩選面板照類型分段（interaction-design §32）：標題寫地區；沒選類型三類收著、點了＝選那個類型；
// 選了餐廳只看到餐廳的組；「現在看」誰吃的分布小字。SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png` });
};

const groups = (page: Page) => page.locator('.fs-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));

test('手機：沒選類型三類收著，點了展開；選餐廳只看到餐廳的組；誰吃的分布小字', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('m-feed-area-shima').click();
  await page.getByTestId('fb-stick').getByTestId('region-shima-kashikojima').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 志摩・賢島');
  await expect(page.locator('.fs-fold .fs-fold-name')).toHaveText(['景點', '餐廳', '住宿']);
  // 手機沒有地圖那組
  expect(await groups(page)).toEqual(['type', 'tier']);
  await shot(page, 'mobile-filter-folded');

  await page.getByTestId('filter-fold-restaurant').click();
  await expect(page.getByTestId('filter-opt-type-restaurant')).toHaveAttribute('aria-pressed', 'true');
  expect(await groups(page)).toEqual(['type', 'group', 'context', 'kids', 'reach', 'tier']);
  await page.getByTestId('filter-opt-group-all').click();
  await expect(page.locator('[data-group="kids"]')).toHaveAttribute('data-dim', 'true');
  await shot(page, 'mobile-filter-restaurant');
  await page.getByTestId('filter-done').click();
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'shima', type: 'restaurant' });
  expect(feed.quick).toContain('who:all');
  await expect(page.locator('[data-testid="cond-note"][data-key="who"]')).toHaveText(/^(能坐一起|要分桌) \d+/);
  await shot(page, 'mobile-cond-note');
  const types = await page.getByTestId('m-feed-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
  expect(new Set(types)).toEqual(new Set(['restaurant']));
});

test('手機：選住宿只看到住宿的組；景點的適合有 2 月', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('m-feed-area-toba').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 鳥羽');
  await page.getByTestId('filter-fold-lodging').click();
  expect(await groups(page)).toEqual(['type', 'lodging', 'dinner', 'lodging-suits', 'amenity', 'tier']);
  // 換成景點：住宿的組不見
  await page.getByTestId('filter-opt-type-lodging').click();
  await page.getByTestId('filter-fold-spot').click();
  expect(await groups(page)).toEqual(['type', 'suits', 'weather', 'spot-reach', 'tier']);
  await expect(page.locator('[data-group="suits"] .ui-chip')).toHaveText(['長輩', '小孩', '2 月']);
  await page.getByTestId('filter-opt-suits-winter').click();
  await page.getByTestId('filter-done').click();
  await expect(page.locator('[data-testid="cond-chip"]:not([data-key="query"])')).toHaveText(['景點', '適合 2 月']);
});
