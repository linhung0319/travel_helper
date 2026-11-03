// T37 新手起步的截圖，放在 data/cache/work/t37/（不進 git）：只有航班的行程，手機 390×664（LINE 內建瀏覽器的可視高度）、網頁 1440×900。
// 用法：先 `npm run dev -- --port 5194`，再 `node web/e2e/shots-t37.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t37');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.unlinkSync(path.join(out, f));
const base = process.argv[2] ?? 'http://localhost:5194/';
const browser = await chromium.launch();
const errors = [];

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });
  return page;
}

const settle = (page) => page.waitForTimeout(400);
const shot = async (page, name) => {
  await settle(page);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
const selectDay = (page, d) => page.evaluate((x) => window.__th.commands.selectDay(x), d);

// ---------- 手機 ----------
{
  const page = await open({ width: 390, height: 664 }, true);
  const tab = (t) => page.getByTestId(`m-tab-${t}`).click();
  await tab('me');
  await shot(page, 'm-me');
  await page.getByTestId('m-me-howto').click();
  await shot(page, 'm-howto');
  await page.keyboard.press('Escape');
  await page.getByTestId('me-button').click();
  await page.getByRole('button', { name: '重設成只有航班的行程' }).click();
  await tab('trip');
  await page.getByTestId('m-day-all').click();
  await page.evaluate(() => window.__thMobile.getState().setSnap('high'));
  await page.getByTestId('m-guide-button').click();
  await shot(page, 'm-guide');
  await page.getByTestId('guide-ask-lodging').click();
  await shot(page, 'm-sheet-cards');
  await page.getByTestId('chat-context').getByRole('button').click();
  await tab('ai');
  await shot(page, 'm-ai-cards');
  await tab('wish');
  await shot(page, 'm-wish-empty');
  await tab('trip');
  await selectDay(page, '2027-02-03');
  await shot(page, 'm-day-empty');
  await tab('explore');
  await page.getByTestId('card-like').first().click();
  await shot(page, 'm-first-like');
  await page.context().close();
}

// ---------- 網頁 ----------
{
  const page = await open({ width: 1440, height: 900 }, false);
  await page.getByTestId('side-tab-day').click();
  await selectDay(page, 'all');
  await shot(page, 'w-half-trip');
  await page.getByTestId('account-menu').click();
  await shot(page, 'w-account-menu');
  await page.getByTestId('account-howto').click();
  await shot(page, 'w-howto');
  await page.keyboard.press('Escape');
  await page.getByTestId('account-menu').click();
  await page.getByRole('button', { name: '重設成只有航班的行程' }).click();
  await selectDay(page, 'all');
  await page.getByTestId('guide-button').click();
  await shot(page, 'w-guide');
  await page.getByTestId('guide-ask-lodging').click();
  await shot(page, 'w-chat-trip-chip');
  await page.getByTestId('side-tab-wish').click();
  await shot(page, 'w-wish-empty');
  await page.getByTestId('side-tab-day').click();
  await selectDay(page, '2027-02-03');
  await shot(page, 'w-day-empty');
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('card-like').first().click();
  await shot(page, 'w-first-like');
  await page.context().close();
}

await browser.close();
console.log(errors.length ? `頁面錯誤：\n${errors.join('\n')}` : '沒有頁面錯誤');
console.log(`截圖在 ${out}`);
