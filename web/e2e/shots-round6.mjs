// T15m 第六輪的截圖，放在 data/cache/work/t15m-round6/（不進 git）：
// 網頁版 1280×800：標籤彈窗、⋯ 選單、重疊卡選單、移到第幾天、詳情的問 AI。
// 手機版 390×844：探索、詳情、想去、行程（中間高度）、點卡片、編輯的動作面板、AI 分頁、半屏聊天、整趟。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-round6.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-round6');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.unlinkSync(path.join(out, f));
const base = process.argv[2] ?? 'http://localhost:5191/';
const browser = await chromium.launch();
const errors = [];
const problems = [];
const ready = (p) => p.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // 不連公開的 OSRM：距離是直線、結果固定（和 e2e 一樣）
  await page.route('**/routing.openstreetmap.de/**', (r) => r.abort());
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(1200);
  // 有橫向捲動就記下來
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push(`${name}: 橫向捲動`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};

async function web() {
  const page = await open({ width: 1280, height: 800 }, false);
  const showDay = async (d) => {
    await page.evaluate((x) => window.__th.commands.selectDay(x), d);
    await page.getByTestId('side-tab-day').click();
  };
  const row = (item) => page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-item="${item}"]`);
  await showDay('2027-02-03');
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await page.getByTestId('planning-bar').waitFor();
  // 標籤彈窗
  await row('i-3').getByTestId('tag-edit').click();
  await page.getByTestId('tag-popover').waitFor();
  await shot(page, 'web-01-tag-popover');
  await page.keyboard.press('Escape');
  await page.mouse.click(40, 400);
  // ⋯ 選單
  await row('i-3').getByTestId('item-menu').click();
  await page.getByTestId('action-menu').waitFor();
  await shot(page, 'web-02-action-menu');
  // 移到第幾天
  await page.getByTestId('action-move').click();
  await page.getByTestId('move-dialog').waitFor();
  await shot(page, 'web-04-move-day');
  await page.keyboard.press('Escape');
  await page.getByTestId('move-dialog').waitFor({ state: 'detached' }).catch(() => {});
  // 重疊卡的 ⋯（2/5 午餐有兩個選項，看第二個）
  await showDay('2027-02-05');
  const lunch = row('i-7');
  await lunch.scrollIntoViewIfNeeded();
  await lunch.getByTestId('option-stack').getByTestId('option-next').click();
  await lunch.getByTestId('item-menu').click();
  await page.getByTestId('action-menu').waitFor();
  await shot(page, 'web-03-stack-menu');
  await page.keyboard.press('Escape');
  // 詳情的問 AI
  await page.evaluate(() => window.__th.appStore.getState().setMode('explore'));
  await page.evaluate(() => window.__th.appStore.getState().openDetail('shima-yokoyama'));
  await page.getByTestId('ask-ai-box').waitFor();
  await page.getByTestId('ask-ai-box').scrollIntoViewIfNeeded();
  await shot(page, 'web-05-detail-ask-ai');
  await page.context().close();
}

async function mobile() {
  const page = await open({ width: 390, height: 844 }, true);
  const tab = (t) => page.getByTestId(`m-tab-${t}`).click();
  const pick = async (d) => page.getByTestId(`m-day-${d}`).click();
  // 探索
  await tab('explore');
  await page.getByTestId('m-feed-item').nth(3).waitFor();
  await shot(page, 'mobile-01-explore');
  // 詳情
  await page.getByTestId('m-feed-item').first().click();
  await page.getByTestId('m-detail').waitFor();
  await shot(page, 'mobile-02-detail');
  await page.getByTestId('m-detail').getByTestId('ask-ai-box').scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, 'mobile-02b-detail-ask-ai');
  await page.getByTestId('m-detail-back').click();
  // 想去
  await tab('wish');
  await page.getByTestId('m-wish-item').first().waitFor().catch(() => {});
  await shot(page, 'mobile-03-wish');
  // 行程（中間高度）
  await tab('trip');
  await pick('2027-02-03');
  await page.evaluate(() => window.__thMobile.getState().setSnap('mid'));
  await shot(page, 'mobile-04-trip-mid');
  // 點卡片
  await page.locator('[data-testid="m-card"][data-item="i-2"]').getByTestId('m-card-name').click();
  await shot(page, 'mobile-05-card-selected');
  // 編輯的動作面板
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await page.getByTestId('planning-bar').waitFor();
  await shot(page, 'mobile-06a-editing');
  await page.locator('[data-testid="m-card"][data-item="i-2"]').getByTestId('m-card-menu').click();
  await page.getByTestId('m-action-sheet').waitFor();
  await shot(page, 'mobile-06b-action-sheet');
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  await page.getByTestId('planning-done').click();
  // 半屏聊天
  await page.getByTestId('m-trip-ai').click();
  await page.getByTestId('m-chat-sheet').waitFor();
  await shot(page, 'mobile-08-chat-sheet');
  await page.getByTestId('m-chat-sheet-close').click();
  // AI 分頁
  await tab('ai');
  await page.getByTestId('m-chat-page').waitFor();
  await shot(page, 'mobile-07-ai-tab');
  // 整趟
  await tab('trip');
  await page.getByTestId('m-day-all').click();
  await page.getByTestId('m-overview').waitFor();
  await shot(page, 'mobile-09-overview');
  // 我
  await tab('me');
  await shot(page, 'mobile-10-me');
  await page.context().close();
}

await web();
await mobile();
await browser.close();
console.log(`截圖在 ${out}`);
if (problems.length) console.log('版面問題：', problems);
if (errors.length) {
  console.log('錯誤：', errors);
  process.exitCode = 1;
}
