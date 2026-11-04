// T42：手機的探索概覽、地區列、書架（interaction-design §18.1）。SHOT_DIR 有設時存截圖。
// T63：概覽沒有四格書架，子地區在卡片裡換內容（§28）。
// T50：子地區列在篩選列裡、書架的順序、返回鈕「‹ 全員吃飯」、切換鈕只在清單層。
// T66：書架兩級（第一級 0 個退到第二級）、兩級都 0 才是虛線框。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string, fullPage = false) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png`, fullPage });
};

test('手機概覽（T52、T63）：地區照片；沒有四格書架；子地區在卡片裡換內容，「看賢島 ›」進那區', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  const toba = overview.locator('[data-area="toba"]');
  await expect(toba.getByTestId('overview-credit')).toHaveText('Michalkun · CC BY-SA 2.5');
  await expect(overview.getByTestId('overview-shelf')).toHaveCount(0);
  await expect(page.getByTestId('m-feed-area-all')).toHaveClass(/ui-chip-overview/);
  await shot(page, 'mobile-overview-t63');

  const shima = overview.locator('[data-area="shima"]');
  await expect(shima.getByTestId('overview-region-all')).toHaveAttribute('aria-pressed', 'true');
  // 一排橫滑：不折行
  const ys = await shima.locator('[data-testid^="overview-region-"]').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
  expect(ys).toHaveLength(1);
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await expect(shima.getByTestId('overview-reps-title')).toHaveText('賢島的代表地點');
  await expect(overview).toBeVisible();
  await shot(page, 'mobile-overview-t63-region');
  await shima.getByTestId('overview-go').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'shima');
  await expect(page.getByTestId('region-shima-kashikojima')).toHaveAttribute('aria-pressed', 'true');

  // 「概覽」鈕：卡片換回全區
  await page.getByTestId('m-feed-area-all').click();
  await expect(shima).toHaveAttribute('data-region', '');
});

test('手機：概覽 → 選鳥羽 → 書架「全部 ›」→ 回到書架；類型在面板裡', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('m-feed-area-all')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'mobile-overview');

  await overview.locator('[data-area="toba"]').getByTestId('overview-go').click();
  await expect(page.getByTestId('m-feed-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('area-home')).toBeVisible();
  await expect(page.getByTestId('area-summary')).toHaveCount(0);
  await expect(page.getByTestId('fb-stick').getByTestId('region-chips')).toBeVisible();
  await expect(page.getByTestId('view-photo')).toHaveCount(0);
  expect(await page.getByTestId('shelf').evaluateAll((els) => els.map((e) => e.getAttribute('data-shelf')))).toEqual(['must', 'fit15', 'stay', 'rain']);
  await shot(page, 'mobile-area-toba');

  await page.locator('[data-shelf="fit15"]').getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  const feed = await page.evaluate(() => (window as any).__thMobile.getState().feed);
  expect(feed).toMatchObject({ area: 'toba', type: 'restaurant' });
  expect(feed.quick).toContain('who:all');
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 全員吃飯');
  await expect(page.locator('.fb-listhead').getByTestId('view-photo')).toBeVisible();
  await shot(page, 'mobile-shelf-all');
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

test('手機 T66：第一級 0 個退到第二級——賢島沒有 S、A 級，放 B 級、小字換色，「全部 ›」套 B 級', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('explore-overview').locator('[data-area="shima"]').getByTestId('overview-go').click();
  await page.getByTestId('fb-stick').getByTestId('region-shima-kashikojima').click();
  const must = page.locator('[data-shelf="must"]');
  await expect(must).toHaveAttribute('data-tier', '2');
  await expect(must.getByTestId('shelf-note')).toHaveText('賢島沒有 S、A 級，這是 B 級');
  await expect(must.getByTestId('shelf-note')).toHaveClass(/fallback/);
  await expect(must.getByTestId('empty-help')).toHaveCount(0);
  await expect(page.locator('[data-shelf="stay"] [data-testid="shelf-caption"]').first()).toHaveText(/全團住得下|包棟 · \d+ 人/);
  await shot(page, 'mobile-shelf-fallback');
  await must.getByTestId('shelf-all').click();
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 一定要去');
  await expect(page.getByTestId('cond-chip')).toHaveText(['景點', 'B 級']);
});

test('手機 T64、T66：兩級都 0 個的書架給下一步；條件列拿掉一顆；問 AI 帶現在的條件', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('explore-overview').locator('[data-area="toba"]').getByTestId('overview-go').click();
  await page.getByTestId('fb-stick').getByTestId('region-sakatejima').click();
  const must = page.locator('[data-shelf="must"]');
  await expect(must.getByTestId('empty-message')).toHaveText('坂手島沒有 S、A、B 級的景點');
  await expect(must.getByTestId('empty-step').first()).toHaveText(/^看鳥羽全區的一定要去（\d+）›$/);
  await expect(must.locator('[data-kind="relax"]')).toHaveCount(0);
  await shot(page, 'mobile-shelf-empty');
  // 問 AI：到 AI 分頁，問題放進輸入框，不送出、不叫鍵盤
  await must.locator('[data-kind="ask"]').click();
  const input = page.getByTestId('chat-input');
  await expect(input).toHaveValue('坂手島有什麼值得去的景點？');
  await expect(input).not.toBeFocused();
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);

  await page.getByTestId('m-tab-explore').click();
  await page.getByTestId('m-feed-area-shima').click();
  await page.getByTestId('fb-stick').getByTestId('region-shima-kashikojima').click();
  await page.locator('[data-shelf="fit15"]').getByTestId('shelf-all').click();
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 全員吃飯');
  await expect(page.getByTestId('list-where')).toHaveText('志摩・賢島');
  await expect(page.getByTestId('cond-chip')).toHaveText(['餐廳', '全員 15 人']);
  await expect(page.getByTestId('fb-stick').getByTestId('cond-row')).toBeVisible();
  await shot(page, 'mobile-cond-row');
  // 拿掉「餐廳」：自己篩選
  await page.locator('[data-testid="cond-chip"][data-key="types"]').click();
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 自己篩選');
  expect((await page.evaluate(() => (window as any).__thMobile.getState().feed)).type).toBe('all');
  // 問 AI：晶片照舊、句子放進輸入框
  await page.getByTestId('list-ask-ai').click();
  await expect(input).toHaveValue('在志摩・賢島找全員 15 人能一起吃的地點');
  await expect(page.getByTestId('chat-context')).toHaveAttribute('data-kind', 'list');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
});
