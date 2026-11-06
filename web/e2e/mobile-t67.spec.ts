// T67：手機的篩選面板照類型分段（interaction-design §32）。
// T80：T75 起面板只畫目前主題的組（§35.5），類型三塊大鈕、「誰吃」「住法」那組、分布小字拿掉；T81 吃的面板連「分組 4～6 人」也拿掉。
// 手機沒有地圖那組。SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png` });
};

const groups = (page: Page) => page.locator('.fs-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));

test('手機：吃的面板只有吃的組（沒有地圖、類型、誰吃）；勾午餐，列都是餐廳', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('m-feed-area-shima').click();
  const bar = page.getByTestId('fb-stick');
  await bar.getByTestId('region-shima-kashikojima').click();
  await bar.getByTestId('theme-restaurant').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 賢島的餐廳');
  expect(await groups(page)).toEqual(['context', 'kids', 'reach', 'restaurant-tier']);
  await expect(page.locator('.fs-tile')).toHaveCount(0);
  await shot(page, 'mobile-filter-restaurant');
  await page.getByTestId('filter-opt-context-lunch').click();
  await page.getByTestId('filter-done').click();
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'shima', type: 'restaurant' });
  await expect(page.getByTestId('cond-chip')).toHaveText(['午餐']);
  await expect(page.getByTestId('cond-note')).toHaveCount(0);
  const home = page.getByTestId('area-home');
  for (const id of ['together', 'split', 'apart']) {
    const s = home.locator(`[data-section="${id}"]`);
    if ((await s.getByTestId('section-count').innerText()) !== '0') await s.getByTestId('section-head').click();
  }
  const types = await home.getByTestId('m-feed-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
  expect(types.length).toBeGreaterThan(0);
  expect(new Set(types)).toEqual(new Set(['restaurant']));
});

test('手機：住的面板沒有住法；換成玩，住宿的組不見，景點的適合有 2 月', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('m-feed-area-toba').click();
  const bar = page.getByTestId('fb-stick');
  await bar.getByTestId('theme-lodging').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 鳥羽的住宿');
  expect(await groups(page)).toEqual(['dinner', 'lodging-suits', 'amenity', 'lodging-tier']);
  await page.getByTestId('filter-close').click();
  await bar.getByTestId('theme-spot').click();
  await page.getByTestId('filter-open').click();
  expect(await groups(page)).toEqual(['suits', 'spot-reach']);
  await expect(page.locator('[data-group="suits"] .ui-chip')).toHaveText(['長輩', '小孩', '2 月']);
  await page.getByTestId('filter-opt-suits-winter').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合 2 月']);
});
