// T16 完成條件（PLAN）：真的 Worker、D1、真的 SDK，接本機假的 Claude API（serve.mjs，不花錢）。真的模型的品質用 npm run ai:eval 看。
// 推薦問題、回答和快速選項、聊天紀錄存 D1（換裝置接得上、別人看不到）、超過每天上限。手機、電腦各跑一次。

import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { resetUserData, setTodayCost } from './serve.mjs';

type Ctx = { desktop: boolean; a: Page };

const device = (o: { viewport: unknown; isMobile: unknown; hasTouch: unknown; userAgent: unknown; deviceScaleFactor: unknown }) => o;

async function login(browser: Browser, baseURL: string, member: string, use: Record<string, unknown>): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...use, baseURL, extraHTTPHeaders: { 'x-dev-member': member } });
  const page = await context.newPage();
  await page.route('**/routing.openstreetmap.de/**', (r) => r.abort());
  return { context, page };
}

const test = base.extend<Ctx>({
  desktop: async ({ viewport }, use) => use((viewport?.width ?? 0) >= 1100),
  a: async ({ browser, baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }, use) => {
    const { context, page } = await login(browser, baseURL!, 'dev-a', device({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }) as Record<string, unknown>);
    await use(page);
    await context.close();
  },
});

test.beforeEach(() => resetUserData());

/** 打開網站，到聊天 */
async function openChat(page: Page, desktop: boolean) {
  await page.goto('/');
  await expect(page.getByTestId(desktop ? 'side-tab-explore' : 'm-tab-explore')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);
  if (!desktop) await page.getByTestId('m-tab-ai').click();
  await expect(page.getByTestId('chat-input')).toBeVisible();
}

test('推薦問題 → 回答和快速選項 → 重新整理、換裝置都在，別人看不到', async ({ a, desktop, browser, baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }) => {
  await openChat(a, desktop);
  // 空白的新對話：照行程算的推薦問題，按了直接送出
  const starters = a.getByTestId('chat-starter');
  await expect(starters.first()).toBeVisible();
  // 卡片第一行是問題，第二行是小字（為什麼問這個）
  const question = (await starters.first().innerText()).trim().split(/\n/)[0];
  await starters.first().click();
  await expect(a.getByTestId('chat-msg-me')).toContainText(question);
  await expect(a.getByTestId('chat-starter')).toHaveCount(0);

  // 回答：地點標籤畫出來，標記不露出來，快速選項變按鈕
  const reply = a.getByTestId('chat-msg-ai').last();
  await expect(reply).toContainText('適合全員');
  await expect(reply).not.toContainText('[[');
  await expect(a.getByTestId('chat-quick')).toHaveText(['排進 2/5 下午', '換一家']);

  // 重新整理：從 D1 讀回來，「查了 1 項資料」和選項都在
  await a.reload();
  if (!desktop) await a.getByTestId('m-tab-ai').click();
  await expect(a.getByTestId('chat-msg-me')).toContainText(question);
  await expect(a.getByTestId('chat-tools')).toContainText('1');
  await expect(a.getByTestId('chat-quick')).toHaveCount(2);

  // 按快速選項：當成使用者的話送出，接著同一段對話
  await a.getByTestId('chat-quick').first().click();
  await expect(a.getByTestId('chat-msg-me')).toHaveCount(2);
  await expect(a.getByTestId('chat-msg-me').last()).toContainText('排進 2/5 下午');
  await expect(a.getByTestId('chat-quick')).toHaveCount(2);

  const use = device({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }) as Record<string, unknown>;
  // 同一個人換一台裝置：接得上
  const other = await login(browser, baseURL!, 'dev-a', use);
  await openChat(other.page, desktop);
  await expect(other.page.getByTestId('chat-msg-me')).toHaveCount(2);
  await other.context.close();

  // 別人：看不到，是空白的新對話
  const b = await login(browser, baseURL!, 'dev-b', use);
  await openChat(b.page, desktop);
  await expect(b.page.getByTestId('chat-msg-me')).toHaveCount(0);
  await expect(b.page.getByTestId('chat-starter').first()).toBeVisible();
  await b.context.close();
});

test('超過每天的上限：明確的提示，輸入框停用（Worker 的真實計數）', async ({ a, desktop }) => {
  setTodayCost('dev-a', 3);
  await openChat(a, desktop);
  await a.getByTestId('chat-input').fill('鳥羽有什麼好吃的');
  await a.getByTestId('chat-send').click();
  await expect(a.getByTestId('chat-quota')).toContainText('今天的 AI 用量到上限');
  await expect(a.getByTestId('chat-input')).toBeDisabled();
});
