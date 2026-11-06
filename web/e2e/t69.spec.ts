// T69：探索、想去的「看哪裡」和「看什麼」分開（網頁版，interaction-design §33）。
// T80：T75 起「看什麼」是主題＋篩選（§35）：「看什麼」帶子、「‹ 書架」「‹ 三排」、兩級退、照片牆、三行的清單列都拿掉了。
// 還在的：換地區、子地區篩選和主題留著，地區分頁、子地區晶片寫數字；概覽離開篩選可以復原；想去換地區展開的區段留著；工具列。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { likeMany, ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const elderly = async (page: Page) => {
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-suits-elderly').click();
  await page.getByTestId('filter-done').click();
};

test('換子地區、地區篩選和主題留著；概覽離開篩選可以復原', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-shima').click();
  await elderly(page);
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);
  // 子地區晶片、地區分頁寫數字
  await expect(page.getByTestId('region-shima-yokoyama').getByTestId('scope-count')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('ex-area-toba').getByTestId('scope-count')).toHaveText(/^\d+$/);
  await shot(page, 't69-web-cond');

  // 換子地區：長輩還在
  await page.getByTestId('region-shima-yokoyama').click();
  await expect(page.getByTestId('region-shima-yokoyama')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);

  // 換地區：長輩、主題還在，子地區列換成鳥羽的
  await page.getByTestId('ex-area-toba').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-theme', 'spot');
  await expect(page.getByTestId('region-osatsu')).toBeVisible();

  // 概覽只有一層：離開篩選，出現復原
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  await expect(page.getByTestId('lens-undo')).toContainText('自己篩選 · 鳥羽');
  await shot(page, 't69-web-undo');
  await page.getByTestId('lens-undo-btn').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'toba');
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cond-chip')).toHaveText(['適合長輩']);
});

test('想去：展開的區段換地區還在', async ({ page }) => {
  await ready(page);
  await likeMany(page, 3);
  await page.getByTestId('side-tab-wish').click();
  await page.getByTestId('ex-area-all').click();
  const unsched = page.locator('[data-testid="wish-section"][data-section="unscheduled"]');
  await unsched.getByTestId('section-head').click();
  await expect(unsched).toHaveAttribute('data-open', 'true');
  await page.getByTestId('ex-area-toba').click();
  await expect(page.getByTestId('region-chips')).toBeVisible();
  await expect(unsched).toHaveAttribute('data-open', 'true');
  await shot(page, 't69-web-wish');
});

test('已訂的住宿：列上有已訂的標', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('ex-area-toba').click();
  await page.getByTestId('theme-lodging').click();
  for (const id of ['whole', 'multi', 'hotel', 'minshuku']) {
    const s = page.locator(`[data-testid="area-home"] [data-testid="section"][data-section="${id}"]`);
    if ((await s.getByTestId('section-count').innerText()) !== '0') await s.getByTestId('section-head').click();
  }
  const booked = page.locator('.pr', { has: page.getByTestId('tag-booked') }).first();
  await booked.scrollIntoViewIfNeeded();
  await expect(booked.getByTestId('tag-booked')).toBeVisible();
  await shot(page, 't69-web-rows');
});

test('工具列：概覽有問 AI、加地點；有條件時篩選鈕不變黑、有小點', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const row = page.locator('.fb-row');
  await expect(row.getByTestId('list-ask-ai')).toBeVisible();
  await expect(row.getByTestId('add-place-open')).toBeVisible();
  await page.getByTestId('ex-area-toba').click();
  await elderly(page);
  const filter = page.getByTestId('filter-open');
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(filter.locator('.fb-dot')).toHaveCount(1);
  expect(await filter.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await page.locator('.fb').evaluate((el) => getComputedStyle(el).backgroundColor));
});
