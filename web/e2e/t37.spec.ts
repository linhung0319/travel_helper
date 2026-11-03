// T37 新手起步（interaction-design §17.1～§17.5）網頁版：引導彈窗（T46 取代開始卡）、整趟骨架、訊息區的卡片、空白狀態、第一次按 ♡、怎麼用。
import { test, type Page } from '@playwright/test';
import { expect, ready, exploreAll } from './helpers.ts';

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

test('只有航班的行程：引導 0/4、整趟骨架一天一列、第一列最後一列是航班；第 ③ 步問 AI 不帶晶片，第一張是住宿，按了才送出', async ({ page }) => {
  await flightsOnly(page);
  await showOverview(page);
  await expect(page.getByTestId('guide-button')).toHaveText('排行程 0/4');
  // T45b 起整趟是骨架：一天一列、不併列；航班在第一列、最後一列
  await expect(page.getByTestId('sk-row')).toHaveCount(12);
  await expect(page.getByTestId('sk-flight-arrive')).toContainText('到關西');
  await expect(page.getByTestId('sk-flight-depart')).toContainText('起飛');
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 已決定 0 晚');

  await page.getByTestId('guide-button').click();
  await expect(page.getByTestId('guide-count')).toHaveText('0 / 4');
  await page.getByTestId('guide-ask-lodging').click();
  await expect(page.getByTestId('guide-dialog')).toHaveCount(0);
  await expect(page.getByTestId('chat-context')).toHaveCount(0);
  const first = page.locator('[data-testid="chat-starter"][data-first="true"]');
  await expect(first).toContainText('幫我決定前幾晚住哪');
  await expect(first).toContainText('15 人的住宿最難訂');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await first.click();
  await expect(page.getByTestId('chat-msg-me')).toContainText('幫我決定前幾晚住哪');
  await expect(page.getByTestId('chat-cards')).toHaveCount(0);
});

test('排了一半的行程：引導的區、住宿完成，第 ④ 步還沒；新對話第一張是空的那天', async ({ page }) => {
  await ready(page);
  await showOverview(page);
  await page.getByTestId('guide-button').click();
  await expect(page.getByTestId('guide-step-2')).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('guide-step-3')).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('guide-step-4')).toHaveAttribute('data-done', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('guide-dialog')).toHaveCount(0);
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
  await exploreAll(page);
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
