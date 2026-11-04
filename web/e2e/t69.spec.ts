// T69：探索、想去的「看哪裡」和「看什麼」分開（網頁版，interaction-design §33）。
// 換地區、子地區篩選留著（書架照新範圍重挑級數）、「‹ 書架」回到目前地區＋子地區的書架、概覽離開篩選可以復原；
// 想去進了某一排換地區還是那一排；清單列永遠三行。SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const shelfAll = (page: Page, shelf: string) => page.locator(`[data-testid="shelf"][data-shelf="${shelf}"]`).getByTestId('shelf-all').click();

test('換子地區、地區篩選留著；‹ 書架 回到這裡的書架；概覽離開篩選可以復原', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-shima').click();
  await shelfAll(page, 'must');
  await expect(page.getByTestId('lens-title')).toHaveText('一定要去');
  // 子地區列在照片牆那層也在，後面寫這個篩選在那裡有幾個
  await expect(page.getByTestId('region-shima-yokoyama').getByTestId('scope-count')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('ex-area-toba').getByTestId('scope-count')).toHaveText(/^\d+$/);
  await shot(page, 't69-web-lens');

  // 換子地區：還是一定要去
  await page.getByTestId('region-shima-yokoyama').click();
  await expect(page.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(page.getByTestId('region-shima-yokoyama')).toHaveAttribute('aria-pressed', 'true');
  // 賢島沒有 S、A：退到 B 級，帶子寫那句
  await page.getByTestId('region-shima-kashikojima').click();
  await expect(page.getByTestId('lens-note')).toHaveText('賢島沒有 S、A 級，這是 B 級');
  await expect(page.locator('[data-testid="cond-chip"][data-key="tiers"]')).toHaveText(['B 級']);
  await shot(page, 't69-web-fallback');

  // 換地區：還是一定要去，子地區列換成鳥羽的
  await page.getByTestId('ex-area-toba').click();
  await expect(page.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(page.getByTestId('lens-note')).toHaveCount(0);
  await expect(page.getByTestId('region-osatsu')).toBeVisible();

  // ‹ 書架：回到鳥羽的書架
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('lens')).toHaveCount(0);
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'toba');

  // 概覽只有一層：離開篩選，出現復原
  await shelfAll(page, 'must');
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  await expect(page.getByTestId('lens-undo')).toContainText('一定要去 · 鳥羽');
  await shot(page, 't69-web-undo');
  await page.getByTestId('lens-undo-btn').click();
  await expect(page.getByTestId('lens-title')).toHaveText('一定要去');
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
});

test('想去：進了「已是候選」換地區還是那一排；‹ 三排 回到三排', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-wish').click();
  await page.getByTestId('ex-area-all').click();
  await page.getByTestId('wish-shelf-all-candidate').click();
  await expect(page.getByTestId('lens-title')).toHaveText('已是候選');
  await page.getByTestId('ex-area-toba').click();
  await expect(page.getByTestId('lens-title')).toHaveText('已是候選');
  await expect(page.getByTestId('region-chips')).toBeVisible();
  await shot(page, 't69-web-wish');
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('lens')).toHaveCount(0);
  await expect(page.getByTestId('wish-shelf-all-candidate')).toBeVisible();
});

test('清單列永遠三行：有已訂的列也是 88px，小標在名稱那行；住法那句在第二行', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await shelfAll(page, 'stay');
  await page.getByTestId('view-list').click();
  const heights = await page.locator('.pr').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights.length).toBeGreaterThan(5);
  expect([...new Set(heights)]).toEqual([88]);
  const booked = page.locator('.pr', { has: page.getByTestId('tag-booked') }).first();
  await expect(booked.locator('.pr-name').getByTestId('tag-booked')).toBeVisible();
  await expect(page.locator('.pr .pr-meta').first()).toContainText(/間房|包棟/);
  await booked.scrollIntoViewIfNeeded();
  await shot(page, 't69-web-rows');
});

test('照片牆：已訂、待訂放在照片右上角，文字區不多一行', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await shelfAll(page, 'stay');
  await page.getByTestId('view-photo').click();
  const tile = page.locator('.pt', { has: page.getByTestId('tag-booked') }).first();
  await expect(tile.locator('.pt-photo .pt-tags').getByTestId('tag-booked')).toBeVisible();
  await expect(tile.locator('.pt-text').getByTestId('tag-booked')).toHaveCount(0);
  await tile.scrollIntoViewIfNeeded();
  await shot(page, 't69-web-tiles');
});

test('工具列：問 AI、加地點在第一列；有條件時篩選鈕不變黑、有小點', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const row = page.locator('.fb-row');
  await expect(row.getByTestId('list-ask-ai')).toBeVisible();
  await expect(row.getByTestId('add-place-open')).toBeVisible();
  await page.getByTestId('ex-area-toba').click();
  await shelfAll(page, 'must');
  const filter = page.getByTestId('filter-open');
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  expect(await filter.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none');
  expect(await filter.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await page.locator('.fb').evaluate((el) => getComputedStyle(el).backgroundColor));
});
