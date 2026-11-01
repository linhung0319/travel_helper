// 用真的 Claude API 在瀏覽器走一次（T16 完成條件），會花一點錢，不是自動測試：
// 先開 server（E2E_WORKER_PORT=8805 E2E_REAL_CLAUDE=1 AI_MODEL=claude-sonnet-5-5 node --experimental-strip-types e2e-worker/serve.mjs），再跑這支（在 web/ 底下）。
// 手機、電腦各問一句，存截圖到 data/cache/work/t16/real/，印出回答和快速選項。

import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const PORT = process.env.E2E_WORKER_PORT ?? '8805';
const OUT = path.resolve('../data/cache/work/t16/real');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [name, use, member] of [
  ['mobile', { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, 'dev-real-m'],
  ['desktop', { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, 'dev-real-d'],
]) {
  const context = await browser.newContext({ ...use, baseURL: `http://localhost:${PORT}/`, extraHTTPHeaders: { 'x-dev-member': member } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId(name === 'desktop' ? 'side-tab-explore' : 'm-tab-explore').waitFor();
  if (name === 'mobile') await page.getByTestId('m-tab-ai').click();
  await page.getByTestId('chat-starter').first().waitFor({ timeout: 30_000 });
  console.log(name, '推薦問題', await page.getByTestId('chat-starter').allInnerTexts());
  await page.screenshot({ path: path.join(OUT, `${name}-empty.png`) });
  await page.getByTestId('chat-input').fill('鳥羽能坐 15 人的海鮮餐廳');
  await page.getByTestId('chat-send').click();
  await page.getByTestId('chat-stop').waitFor();
  await page.getByTestId('chat-stop').waitFor({ state: 'detached', timeout: 180_000 });
  console.log(name, '回答', (await page.getByTestId('chat-msg-ai').last().innerText()).slice(0, 600));
  console.log(name, '快速選項', await page.getByTestId('chat-quick').allInnerTexts());
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}-answer.png`) });
  await context.close();
}
await browser.close();
