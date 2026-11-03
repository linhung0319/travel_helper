// T42：探索的概覽、地區列、選區後的書架（網頁版，interaction-design §18.1）。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

test('進網站是探索的概覽：一區一張卡，代表的點開詳情，「看鳥羽 ›」進那一區', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('ex-area-all')).toHaveAttribute('aria-pressed', 'true');
  // 照行程順序：志摩在最前面
  const cards = overview.getByTestId('overview-card');
  await expect(cards.first()).toHaveAttribute('data-area', 'shima');
  await expect(cards.first().getByTestId('overview-feb')).toContainText('2 月');
  await expect(page.getByTestId('chat-panel')).toContainText('正在看：概覽');
  await shot(page, 'web-overview');

  // 代表的點：開詳情
  const rep = cards.first().getByTestId('overview-rep').first();
  const id = await rep.getAttribute('data-id');
  await rep.click();
  await expect(page.locator('[data-testid="detail-panel"], [data-testid="detail-popup"]').first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().detailId)).toBe(id);
  await page.keyboard.press('Escape');

  // 看鳥羽：地區列跟著選、頂端一句特色、子地區、書架
  await overview.locator('[data-area="toba"]').getByTestId('overview-go').click();
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  const home = page.getByTestId('area-home');
  await expect(home).toHaveAttribute('data-area', 'toba');
  await expect(home.getByTestId('area-summary')).toBeVisible();
  await expect(home.getByTestId('region-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.locator('[data-shelf="must"] [data-testid="shelf-card"]')).toHaveCount(3);
  await expect(page.getByTestId('chat-panel')).toContainText('正在看：鳥羽');
  await shot(page, 'web-area-toba');
});

test('選了一區：書架的「全部 ›」套條件變照片牆，「‹ 鳥羽」回到書架；類型在篩選面板裡', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-toba').click();
  const must = page.locator('[data-shelf="must"]');
  await must.getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  const filter = await page.evaluate(() => (window as any).__th.appStore.getState().filter);
  expect(filter).toMatchObject({ areas: ['toba'], types: ['spot'], tiers: ['S', 'A'] });
  await expect(page.getByTestId('explore-item').first()).toBeVisible();
  // 篩選上的數字：類型一個、等級兩個（地區不算）
  await expect(page.getByTestId('filter-count')).toHaveText('3');
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-opt-type-spot')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-group="area"]')).toHaveCount(0);
  await shot(page, 'web-filter-sheet');
  // 全部清除：地區留著，回到書架
  await page.getByTestId('filter-clear').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('area-home')).toBeVisible();

  // 子地區當篩選；搜尋時變清單，「‹ 鳥羽」回到書架（子地區留著）
  const region = page.getByTestId('region-chips').locator('button').nth(1);
  await region.click();
  await expect(region).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('search').fill('水族');
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('area-home')).toBeVisible();
  await expect(page.getByTestId('search')).toHaveValue('');
  await expect(region).toHaveAttribute('aria-pressed', 'true');

  // 換到想去：地區跟著走，第一顆叫「全部」
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('wish'));
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ex-area-all')).toHaveText('全部');
  // 回到概覽
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('explore'));
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
});
