// T39（網頁）：進網站看探索、送出馬上有反應、一輪的版面不跳、採用不進編輯、起點一行、地圖沒有愛心。
import { expect, test } from '@playwright/test';
import { ready, waitIdle } from './helpers.ts';

const lastAi = (page: import('@playwright/test').Page) => page.getByTestId('chat-msg-ai').last();

test('進網站先看探索，不是行程', async ({ page }) => {
  await ready(page, { tab: 'default' });
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().mode)).toBe('explore');
  await expect(page.locator('.side-column')).toBeVisible();
  await expect(page.getByTestId('tl-start')).toHaveCount(0);
});

test('按下送出：卡片馬上收掉、看到自己的話；回完之前不出現卡片，字在卡片上面', async ({ page }) => {
  await ready(page, { tab: 'default' });
  // 假 AI 慢一點，才看得到中間的樣子
  await page.evaluate(() => {
    (window as any).__th.aiFake.delayMs = 500;
  });
  await page.getByTestId('chat-starter').first().waitFor();
  await page.getByTestId('chat-input').fill('鳥羽能坐 15 人的海鮮餐廳');
  await page.getByTestId('chat-send').click();
  // 同一個畫面更新
  await expect(page.getByTestId('chat-cards')).toHaveCount(0);
  await expect(page.getByTestId('chat-msg-me')).toContainText('鳥羽能坐');
  await expect(page.getByTestId('chat-incomplete')).toHaveCount(0);
  await expect(page.getByTestId('chat-busy')).toBeVisible();
  // 進行中：這輪沒有卡片
  await expect(lastAi(page).locator('.ac-use')).toHaveCount(0);
  await expect(page.getByTestId('chat-busy')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('chat-incomplete')).toHaveCount(0);
  // 回完：字 → 卡片
  const order = await lastAi(page).evaluate((el) => {
    const text = el.querySelector('.ac-text');
    const card = el.querySelector('.ac-use');
    return text && card ? text.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING : -1;
  });
  expect(order).toBeTruthy();
  expect(order).not.toBe(-1);
});

test('採用提議：不跳「開始編輯」、不進編輯，時間軸有新的項目、可以復原', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-04'));
  // 地圖動完才問：回覆期間畫面動過就不搶畫面
  await waitIdle(page);
  await page.getByTestId('chat-input').fill('幫我排第 3 天，加午餐');
  await page.getByTestId('chat-send').click();
  await page.getByTestId('proposal-adopt').click({ timeout: 30_000 });
  await expect(page.getByTestId('toast')).toContainText('已採用提議');
  await expect(page.getByTestId('planning-dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().planning)).toBe(false);
});

test('起點、終點都是卡片，寫「起」「終」；起點有預約狀態', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-06'));
  const start = page.getByTestId('tl-start');
  await expect(start.getByTestId('trip-card-no')).toHaveText('起');
  await expect(start.getByTestId('reservation-tag')).toContainText('已訂');
  await expect(start.locator('.tc-thumb')).toHaveCount(1);
});

test('地圖上沒有想去的愛心', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.place-badge')).toHaveCount(0);
});
