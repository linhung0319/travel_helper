// T67：篩選面板照類型分段（網頁版，interaction-design §32）。
// T80：T75 起面板只畫目前主題的組（§35.5），類型三塊大鈕、「誰吃」「住法」那組（書架區段切過的）、分布小字、「0 個放寬照第一題」都拿掉了；
// T81 吃的面板連「分組 4～6 人」也拿掉。這裡測三個主題的組、標題、一泊二食的條件列，和區段 0 個時的「清除篩選」。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const groups = (page: Page) => page.locator('.fs-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));

test('面板只畫目前主題的組：吃是哪一餐、帶小孩、怎麼去、等級；標題寫地區和主題', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-shima').click();
  await page.getByTestId('region-shima-kashikojima').click();
  await page.getByTestId('theme-restaurant').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 賢島的餐廳');
  expect(await groups(page)).toEqual(['context', 'kids', 'reach', 'restaurant-tier', 'map']);
  await expect(page.locator('[data-group="context"] .ui-chip')).toHaveText(['午餐', '晚餐', '小吃咖啡']);
  await expect(page.locator('[data-group="group"]')).toHaveCount(0);
  await expect(page.locator('.fs-tile')).toHaveCount(0);
  await shot(page, 'web-filter-restaurant');
  await page.getByTestId('filter-opt-context-lunch').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['午餐']);
  await expect(page.getByTestId('cond-note')).toHaveCount(0);
});

test('住：晚餐、適合、其他、等級（沒有住法）；一泊二食的條件列，區段裡都是住宿', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await page.getByTestId('theme-lodging').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 鳥羽的住宿');
  expect(await groups(page)).toEqual(['dinner', 'lodging-suits', 'amenity', 'lodging-tier', 'map']);
  await expect(page.locator('[data-group="lodging"]')).toHaveCount(0);
  await page.getByTestId('filter-opt-dinner-included').click();
  await shot(page, 'web-filter-lodging');
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['一泊二食']);
  // 住宿的區段：展開「旅館飯店」，列都是住宿
  const hotel = page.locator('[data-testid="area-home"] [data-testid="section"][data-section="hotel"]');
  await hotel.getByTestId('section-head').click();
  const types = await hotel.getByTestId('explore-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
  expect(types.length).toBeGreaterThan(0);
  expect(new Set(types)).toEqual(new Set(['lodging']));
});

test('有篩選、區段 0 個：下一步多「清除篩選」，按了條件清掉、區段有東西', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await page.getByTestId('region-osatsu').click();
  await page.getByTestId('theme-restaurant').click();
  // 相差的吃：勾小吃咖啡＋S 級，某一段一定是 0
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-context-light').click();
  await page.getByTestId('filter-opt-restaurant-tier-S').click();
  await page.getByTestId('filter-done').click();
  // 本來就 0 的段（沒篩選也 0）不給「清除篩選」：找篩選後才 0 的那段
  await expect(page.getByTestId('cond-chip')).toHaveCount(2);
  let zero = null;
  for (const id of ['together', 'split', 'apart']) {
    const s = page.locator(`[data-testid="area-home"] [data-testid="section"][data-section="${id}"]`);
    if ((await s.getByTestId('section-count').innerText()) !== '0') continue;
    await s.getByTestId('section-head').click();
    if (await s.locator('[data-testid="empty-step"][data-kind="relax"]').count()) {
      zero = s;
      break;
    }
  }
  expect(zero).not.toBeNull();
  const relax = zero!.locator('[data-testid="empty-step"][data-kind="relax"]');
  await expect(relax).toHaveText(/^清除篩選（\d+）›$/);
  await shot(page, 'web-empty-relax');
  await relax.click();
  await expect(page.getByTestId('cond-row')).toHaveCount(0);
  await expect(zero!.getByTestId('explore-item').first()).toBeVisible();
});
