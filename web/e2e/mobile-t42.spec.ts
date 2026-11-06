// T42：手機的探索概覽、地區列（interaction-design §18.1）。SHOT_DIR 有設時存截圖。
// T63：概覽沒有四格書架，子地區在卡片裡換內容（§28）。
// T80：T75～T81 起選了一區是「主題 × 區段」（§35、§36）：書架、「全部 ›」、兩級退、「看鳥羽 ›」、代表地點都拿掉了；
// 改測點區名進那區、區段 0 個的下一步、條件帶進問 AI。主題、區段的核心流程在 mobile-t77.spec.ts。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string, fullPage = false) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png`, fullPage });
};

test('手機概覽（T52、T63）：地區照片；沒有四格書架；子地區在卡片裡換內容，點區名進那區', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  const toba = overview.locator('[data-area="toba"]');
  await expect(toba.getByTestId('overview-credit')).toHaveText('Michalkun · CC BY-SA 2.5');
  await expect(overview.getByTestId('overview-shelf')).toHaveCount(0);
  await expect(overview.getByTestId('overview-rep')).toHaveCount(0);
  await expect(page.getByTestId('m-feed-area-all')).toHaveClass(/ui-chip-overview/);
  await shot(page, 'mobile-overview-t63');

  const shima = overview.locator('[data-area="shima"]');
  await expect(shima.getByTestId('overview-region-all')).toHaveAttribute('aria-pressed', 'true');
  // 一排橫滑：不折行
  const ys = await shima.locator('[data-testid^="overview-region-"]').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
  expect(ys).toHaveLength(1);
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await expect(shima).toHaveAttribute('data-region', 'shima-kashikojima');
  await expect(overview).toBeVisible();
  await shot(page, 'mobile-overview-t63-region');
  await shima.getByTestId('overview-name').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'shima');
  await expect(page.getByTestId('region-shima-kashikojima')).toHaveAttribute('aria-pressed', 'true');

  // 「概覽」鈕：卡片換回全區
  await page.getByTestId('m-feed-area-all').click();
  await expect(shima).toHaveAttribute('data-region', '');
});

test('手機：概覽 → 點鳥羽 → 玩的三個區段；子地區列在黏頂那組裡；列點了開整頁詳情', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('m-feed-area-all')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'mobile-overview');

  await overview.locator('[data-area="toba"]').getByTestId('overview-name').click();
  await expect(page.getByTestId('m-feed-area-toba')).toHaveAttribute('aria-pressed', 'true');
  const home = page.getByTestId('area-home');
  await expect(home).toHaveAttribute('data-theme', 'spot');
  await expect(page.getByTestId('area-summary')).toHaveCount(0);
  await expect(page.getByTestId('fb-stick').getByTestId('region-chips')).toBeVisible();
  expect(await home.getByTestId('section').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')))).toEqual(['must', 'other', 'rain']);
  await shot(page, 'mobile-area-toba');

  // 列：整頁詳情
  await home.locator('[data-section="must"]').getByTestId('section-head').click();
  await home.locator('[data-section="must"]').getByTestId('m-feed-item').first().click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__thMobile.getState().detail)).toBe(true);
});

test('手機 T64、T75：區段 0 個給下一步；問 AI 到 AI 分頁；有條件時「問 AI 幫我挑」帶現在的條件', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('explore-overview').locator('[data-area="toba"]').getByTestId('overview-name').click();
  await page.getByTestId('fb-stick').getByTestId('region-toshijima').click();
  // 答志島只有 B 級：「一定要去」是 0，展開是虛線框、看鳥羽全區、問 AI
  const must = page.locator('[data-testid="area-home"] [data-section="must"]');
  await expect(must.getByTestId('section-count')).toHaveText('0');
  await must.getByTestId('section-head').click();
  await expect(must.getByTestId('empty-message')).toHaveText('答志島沒有「一定要去」的景點');
  await expect(must.getByTestId('empty-step').first()).toHaveText(/^看鳥羽全區（\d+）›$/);
  await expect(must.locator('[data-kind="relax"]')).toHaveCount(0);
  await shot(page, 'mobile-section-empty');
  // 問 AI：到 AI 分頁，問題放進輸入框，不送出、不叫鍵盤
  await must.locator('[data-kind="ask"]').click();
  const input = page.getByTestId('chat-input');
  await expect(input).toHaveValue('答志島有什麼值得去的景點？');
  await expect(input).not.toBeFocused();
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);

  // 志摩・賢島的吃，勾午餐：條件列；最下面「問 AI 幫我挑」把條件寫成一句
  await page.getByTestId('m-tab-explore').click();
  await page.getByTestId('m-feed-area-shima').click();
  await page.getByTestId('fb-stick').getByTestId('region-shima-kashikojima').click();
  await page.getByTestId('fb-stick').getByTestId('theme-restaurant').click();
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-context-lunch').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['午餐']);
  await shot(page, 'mobile-cond-row');
  await page.getByTestId('area-ask-ai').click();
  await expect(input).toHaveValue(/^在志摩・賢島找.*午餐.*的餐廳$/);
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
});
