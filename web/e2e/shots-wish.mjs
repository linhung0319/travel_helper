// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），第六輪重寫手機版後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// 想去分頁、這天的候選和留言、新的時間軸的截圖，放在 data/cache/work/t15m-wish/（不進 git）。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-wish.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-wish');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.unlinkSync(path.join(out, f));
const base = process.argv[2] ?? 'http://localhost:5191/';
const browser = await chromium.launch();
const errors = [];
const ready = (p) => p.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });

async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await ready(page);
  // 每次從種子資料開始
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
const spots = (page) => page.evaluate(() => window.__th.appStore.getState().setFilter({ types: ['spot'] }));

for (const [name, viewport] of [
  ['wide', { width: 1600, height: 900 }],
  ['laptop', { width: 1280, height: 800 }],
]) {
  const page = await open(viewport);
  await page.evaluate(() => window.__th.commands.selectDay('2027-02-05'));
  await shot(page, `${name}-20-day`);
  await page.getByTestId('day-candidates').scrollIntoViewIfNeeded();
  await shot(page, `${name}-21-candidates`);
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await page.getByTestId('day-candidates').scrollIntoViewIfNeeded();
  await shot(page, `${name}-22-planning`);
  await page.getByTestId('side-tab-wish').click();
  await spots(page);
  await shot(page, `${name}-23-wish-photo`);
  const card = page.locator('[data-testid="wish-item"][data-id="toba-bay-cruise-irukajima"]');
  await card.scrollIntoViewIfNeeded();
  await card.getByTestId('wish-comments').click();
  await card.getByTestId('add-to-day').click();
  await shot(page, `${name}-24-wish-card`);
  await page.locator('.side-body').first().evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(300);
  await page.locator('.ex-view button[title="只有文字"]').first().click();
  await shot(page, `${name}-25-wish-list`);
  await page.locator('.ex-view button[title="大照片"]').first().click();
  await page.getByTestId('wish-open').first().click();
  await shot(page, `${name}-26-wish-detail`);
  await page.context().close();
}

const m = await open({ width: 390, height: 844 }, true);
await m.evaluate(() => window.__th.commands.selectDay('2027-02-05'));
await m.evaluate(() => window.__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
await m.getByTestId('day-candidates').scrollIntoViewIfNeeded();
await shot(m, 'mobile-27-day-candidates');
await m.getByTestId('sheet-tab-wish').tap();
await spots(m);
await shot(m, 'mobile-28-wish');
await m.evaluate(() => window.__th.appStore.getState().setSheet({ snap: 'half' }));
await shot(m, 'mobile-29-wish-half');

await browser.close();
console.log(`截圖在 ${out}`);
if (errors.length) {
  console.log('錯誤：', errors);
  process.exitCode = 1;
}
