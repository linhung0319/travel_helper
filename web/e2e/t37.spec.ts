// T37 新手起步（interaction-design §17.1～§17.5）網頁版：開始卡、整趟清單併列、訊息區的卡片、空白狀態、第一次按 ♡、怎麼用。
import { test, type Page } from '@playwright/test';
import { expect, ready } from './helpers.ts';

async function flightsOnly(page: Page) {
  await ready(page);
  await page.getByTestId('account-menu').click();
  await page.getByRole('button', { name: '重設成只有航班的行程' }).click();
  await expect(page.getByTestId('account-popover')).toHaveCount(0);
}

const showOverview = async (page: Page) => {
  await page.getByTestId('side-tab-day').click();
  await page.evaluate(() => (window as any).__th.commands.selectDay('all'));
};

test('只有航班的行程：開始卡 0/3、清單併成一列、航班的天寫幾筆；問 AI 不帶晶片，第一張是住宿，按了才送出', async ({ page }) => {
  await flightsOnly(page);
  await showOverview(page);
  const card = page.getByTestId('start-card');
  await expect(card).toHaveAttribute('data-view', 'steps');
  await expect(page.getByTestId('start-count')).toHaveText('0 / 3');
  await expect(page.getByTestId('overview-empty')).toHaveText('2/3～2/12 還沒排 · 10 天');
  await expect(page.locator('[data-overview-day="2027-02-02"]')).toContainText('航班 2 筆');
  await expect(page.locator('[data-overview-day="2027-02-13"]')).toContainText('航班 2 筆');
  await expect(page.locator('.overview-day')).toHaveCount(3);

  await page.getByTestId('start-step-2').getByTestId('start-ask').click();
  await expect(page.getByTestId('chat-context')).toHaveCount(0);
  const first = page.locator('[data-testid="chat-starter"][data-first="true"]');
  await expect(first).toContainText('幫我決定前幾晚住哪');
  await expect(first).toContainText('15 人的住宿最難訂');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await first.click();
  await expect(page.getByTestId('chat-msg-me')).toContainText('幫我決定前幾晚住哪');
  await expect(page.getByTestId('chat-cards')).toHaveCount(0);
});

test('排了一半的行程：前兩步做完收成一列；新對話第一張是空的那天', async ({ page }) => {
  await ready(page);
  await showOverview(page);
  await expect(page.getByTestId('start-card')).toHaveAttribute('data-view', 'last');
  await expect(page.getByTestId('start-step-1')).toHaveCount(0);
  await expect(page.getByTestId('start-step-3')).toBeVisible();
  await expect(page.getByTestId('chat-empty')).toContainText('問我行程的事');
  await expect(page.getByTestId('chat-starter')).toHaveCount(3);
  await expect(page.getByTestId('chat-starter').first()).toContainText('2/7 去哪？');
});

test('想去頁空白：三格小圖、沒有段落標題；去探索、問 AI 推薦', async ({ page }) => {
  await flightsOnly(page);
  await page.getByTestId('side-tab-wish').click();
  await expect(page.getByTestId('wish-empty')).toContainText('還沒有人按');
  await expect(page.getByTestId('wish-section-unscheduled')).toHaveCount(0);
  await page.getByTestId('wish-empty-ask').click();
  await expect(page.locator('[data-testid="chat-starter"][data-first="true"]')).toContainText('推薦幾個適合全家去的地方');
  await page.getByTestId('wish-empty-explore').click();
  await expect(page.getByTestId('side-tab-explore')).toHaveAttribute('aria-selected', 'true');
});

test('空的一天：虛線框；問 AI 不帶晶片，第一張是這天去哪；從想去挑', async ({ page }) => {
  await flightsOnly(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-03'));
  await expect(page.getByTestId('day-empty')).toContainText('這天還沒排');
  await page.getByTestId('day-empty-ask').click();
  await expect(page.getByTestId('chat-context')).toHaveCount(0);
  await expect(page.locator('[data-testid="chat-starter"][data-first="true"]')).toContainText('2/3 去哪？');
  await page.getByTestId('day-go-wish').click();
  await expect(page.getByTestId('side-tab-wish')).toHaveAttribute('aria-selected', 'true');
});

test('第一次按 ♡：提示一次、去看到想去；第二次不提示，重新整理也不再提示', async ({ page }) => {
  await flightsOnly(page);
  await page.getByTestId('side-tab-explore').click();
  const hearts = page.getByTestId('card-like');
  await hearts.first().click();
  const toast = page.getByTestId('hint');
  await expect(toast).toContainText('已加到想去，家人也看得到');
  await page.getByTestId('hint-close').click();
  await expect(toast).toHaveCount(0);
  await hearts.nth(1).click();
  await page.waitForTimeout(200);
  await expect(toast).toHaveCount(0);
  await expect(page.getByTestId('side-tab-wish')).toContainText('想去 2');
  await page.evaluate(() => localStorage.removeItem('th.hint.firstLike'));
  await hearts.nth(2).click();
  await page.getByTestId('hint-action').click();
  await expect(page.getByTestId('side-tab-wish')).toHaveAttribute('aria-selected', 'true');
});

test('怎麼用：頭像選單第一列，四點', async ({ page }) => {
  await ready(page);
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('account-popover').locator('button').first()).toHaveAttribute('data-testid', 'account-howto');
  await page.getByTestId('account-howto').click();
  const dialog = page.getByTestId('howto-dialog');
  await expect(dialog.locator('.howto li')).toHaveCount(4);
  await expect(dialog).toContainText('第一張藍色的卡');
});
