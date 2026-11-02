// T37 新手起步（interaction-design §17.1～§17.5）手機版：開始卡、整趟清單併列、訊息區的卡片（半屏放不下時只放第一張）、空白狀態、第一次按 ♡、怎麼用。
import { test, type Page } from '@playwright/test';
import { expect, goTab, ready, scrollsSideways } from './mobileHelpers.ts';

async function flightsOnly(page: Page) {
  await ready(page);
  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  await page.getByRole('button', { name: '重設成只有航班的行程' }).click();
  await expect(page.getByTestId('dev-menu')).toHaveCount(0);
}

const showOverview = async (page: Page) => {
  await goTab(page, 'trip');
  await page.getByTestId('m-day-all').click();
};

test('只有航班的行程：開始卡、清單併成一列、航班的天寫幾筆；沒有橫向捲動', async ({ page }) => {
  await flightsOnly(page);
  await showOverview(page);
  await expect(page.getByTestId('start-card')).toHaveAttribute('data-view', 'steps');
  await expect(page.getByTestId('start-count')).toHaveText('0 / 3');
  const rows = page.getByTestId('m-overview-day');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('航班 2 筆');
  await expect(rows.nth(0)).not.toContainText('0 個點');
  await expect(rows.nth(1)).toHaveText('2/3～2/12 還沒排 · 10 天');
  await rows.nth(1).click();
  await expect(page.getByTestId('m-day-2027-02-03')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('m-trip-empty')).toContainText('這天還沒排');
  expect(await scrollsSideways(page)).toBe(false);
});

test('AI 分頁：一句話加三張卡片，第一張橫跨兩欄，都至少 44px；按了送出後卡片不見', async ({ page }) => {
  await flightsOnly(page);
  await goTab(page, 'ai');
  await expect(page.getByTestId('chat-empty')).toContainText('麥克風');
  const cards = page.getByTestId('chat-starter');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('chat-cards')).toHaveAttribute('data-compact', 'false');
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  const third = (await cards.nth(2).boundingBox())!;
  expect(first.width).toBeGreaterThan(second.width * 1.5);
  expect(Math.abs(second.y - third.y)).toBeLessThan(2);
  for (const b of [first, second, third]) expect(b.height).toBeGreaterThanOrEqual(44);
  await cards.nth(0).click();
  await expect(page.getByTestId('chat-msg-me')).toContainText('幫我決定每晚住哪');
  await expect(page.getByTestId('chat-cards')).toHaveCount(0);
});

test('半屏聊天放不下三張：第一張留著，其他縮成一行膠囊', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 });
  await flightsOnly(page);
  await showOverview(page);
  await page.getByTestId('start-step-2').getByTestId('start-ask').click();
  await expect(page.getByTestId('chat-context')).toHaveAttribute('data-kind', 'trip');
  await expect(page.getByTestId('chat-cards')).toHaveAttribute('data-compact', 'true');
  const cards = page.locator('[data-testid="chat-cards"] button');
  await expect(cards.first()).toContainText('幫我決定每晚住哪');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('chat-empty')).toBeHidden();
  const a = (await cards.nth(1).boundingBox())!;
  const b = (await cards.nth(2).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(await scrollsSideways(page)).toBe(false);
});

test('想去頁空白：三格小圖；去探索', async ({ page }) => {
  await flightsOnly(page);
  await goTab(page, 'wish');
  await expect(page.getByTestId('wish-empty')).toContainText('數字代表幾個人想去');
  await expect(page.getByTestId('wish-section-unscheduled')).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByTestId('wish-empty-explore').click();
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
});

test('第一次按 ♡：提示在分頁列上面，去看到想去', async ({ page }) => {
  await flightsOnly(page);
  await goTab(page, 'explore');
  await page.getByTestId('card-like').first().click();
  const toast = page.getByTestId('hint');
  await expect(toast).toContainText('已加到想去');
  const box = (await toast.boundingBox())!;
  const bar = (await page.getByTestId('m-tabbar').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  await page.getByTestId('hint-action').click();
  await expect(page.getByTestId('m-tab-wish')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-tab-count')).toHaveText('1');
});

test('怎麼用：「我」分頁第一列，四點', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  await expect(page.locator('.m-list .m-row').first()).toHaveAttribute('data-testid', 'm-me-howto');
  await page.getByTestId('m-me-howto').click();
  await expect(page.getByTestId('howto-dialog').locator('.howto li')).toHaveCount(4);
  expect(await scrollsSideways(page)).toBe(false);
});
