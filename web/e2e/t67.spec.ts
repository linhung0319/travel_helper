// T67：篩選面板照類型分段（網頁版，interaction-design §32）。
// 標題寫地區；類型是三塊「景／食／宿」大鈕（T69 取代收著的三列），點了＝選那個類型；選了餐廳只看到餐廳的組；「現在看」誰吃、住法的分布小字；0 個時放寬照第一題。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const groups = (page: Page) => page.locator('.fs-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));

test('類型三塊大鈕（T69），點了＝選那個類型、另外兩塊變淡；選餐廳只看到餐廳的組，帶小孩在全員 15 人時變淡', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-shima').click();
  await page.getByTestId('region-shima-kashikojima').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 志摩・賢島');
  // 三塊大鈕（景點、餐廳、住宿），組名寫在小字；沒選類型時只畫類型和共用的組
  await expect(page.locator('.fs-tile .fs-tile-name')).toHaveText(['景點', '餐廳', '住宿']);
  await expect(page.getByTestId('filter-opt-type-restaurant')).toContainText('誰吃 · 哪一餐 · 帶小孩 · 怎麼去');
  expect(await groups(page)).toEqual(['type', 'tier', 'map']);
  await shot(page, 'web-filter-folded');

  await page.getByTestId('filter-opt-type-restaurant').click();
  await expect(page.getByTestId('filter-opt-type-restaurant')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.fs-tile.on')).toHaveCount(1);
  // 沒選的兩塊變淡，還能點（可以複選）
  await expect(page.locator('.fs-tile.off')).toHaveCount(2);
  await expect(page.locator('[data-section="restaurant"]')).toHaveCSS('border-left-style', 'solid');
  expect(await groups(page)).toEqual(['type', 'group', 'context', 'kids', 'reach', 'tier', 'map']);
  await expect(page.locator('[data-group="context"] .ui-chip')).toHaveText(['午餐', '晚餐', '小吃咖啡']);
  await expect(page.locator('[data-group="kids"]')).not.toHaveAttribute('data-dim', /.*/);
  await page.getByTestId('filter-opt-group-all').click();
  await expect(page.locator('[data-group="kids"]')).toHaveAttribute('data-dim', 'true');
  await shot(page, 'web-filter-restaurant');
  await page.getByTestId('filter-done').click();
  // 「現在看」：誰吃的晶片右邊有分布小字
  await expect(page.locator('[data-testid="cond-chip"][data-key="who"]')).toHaveText('全員 15 人');
  await expect(page.locator('[data-testid="cond-note"][data-key="who"]')).toHaveText(/^(能坐一起|要分桌) \d+/);
  await shot(page, 'web-cond-note');
});

test('選住宿：住法、晚餐、適合、其他；一泊二食的晶片和住法的分布小字', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 鳥羽');
  await page.getByTestId('filter-opt-type-lodging').click();
  expect(await groups(page)).toEqual(['type', 'lodging', 'dinner', 'lodging-suits', 'amenity', 'tier', 'map']);
  await expect(page.locator('[data-group="lodging"] .ui-chip')).toHaveText(['包棟・一棟住全團', '包棟・要和別處分住', '旅館・飯店', '民宿']);
  await page.getByTestId('filter-opt-dinner-included').click();
  await page.getByTestId('filter-opt-lodging-hotel').click();
  await shot(page, 'web-filter-lodging');
  await page.getByTestId('filter-done').click();
  await expect(page.locator('[data-testid="cond-chip"]:not([data-key="query"])')).toHaveText(['住宿', '旅館・飯店', '一泊二食']);
  await expect(page.locator('[data-testid="cond-note"][data-key="stay"]')).toHaveText(/^旅館飯店 \d+$/);
  const types = await page.getByTestId('explore-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
  expect(types.length).toBeGreaterThan(0);
  expect(new Set(types)).toEqual(new Set(['lodging']));
});

test('0 個時放寬照第一題：相差沒有全員 15 人能一起吃的店 →「看相差坐不下、還沒查的」', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await page.getByTestId('region-osatsu').click();
  // 選了全員 15 人再拿掉類型（不是整排書架）：0 個
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-type-restaurant').click();
  await page.getByTestId('filter-opt-group-all').click();
  await page.getByTestId('filter-opt-type-restaurant').click();
  await page.getByTestId('filter-done').click();
  const empty = page.locator('.ex-list').getByTestId('empty-help');
  await expect(empty.locator('[data-kind="relax"]')).toHaveText(/^看相差坐不下、還沒查的（\d+）›$/);
  await shot(page, 'web-empty-who');
  await empty.locator('[data-kind="relax"]').click();
  await expect(page.locator('[data-testid="cond-chip"][data-key="who"]')).toHaveText('15 人坐不下、還沒查');
  await expect(page.getByTestId('explore-item').first()).toBeVisible();
});
