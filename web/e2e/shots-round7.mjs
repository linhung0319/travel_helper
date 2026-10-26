// T15m 第七輪的截圖，放在 data/cache/work/t15m-round7/（不進 git），可以和第六輪之前的圖（t15m-audit/shots-before/）對照：
// 網頁版 1280×800：探索照片牆、清單、篩選面板、想去、行程（一天、編輯、整趟）、浮在地圖上的詳情、選中水滴。
// 手機版 390×844：探索、篩選面板、詳情、想去、行程（中間高度）、點卡片、編輯、整趟、我、討論整頁。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-round7.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-round7');
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
  await page.waitForTimeout(1500);
  // 有橫向捲動就記下來
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push(`${name}: 橫向捲動`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
/** 一個畫面失敗不要讓後面的都沒圖：記下來繼續 */
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${String(e.message).split('\n')[0]}`);
  }
};

async function web() {
  const page = await open({ width: 1280, height: 800 }, false);
  const side = (t) => page.getByTestId(`side-tab-${t}`).click();
  const showDay = async (d) => {
    await page.evaluate((x) => window.__th.commands.selectDay(x), d);
    await side('day');
  };
  await step('web-01', async () => {
    await side('explore');
    await page.getByTestId('filter-bar').waitFor();
    await shot(page, 'web-01-explore-wall');
  });
  await step('web-02', async () => {
    await page.getByTestId('view-list').click();
    await shot(page, 'web-02-explore-list');
    await page.getByTestId('view-photo').click();
  });
  await step('web-03', async () => {
    await page.getByTestId('filter-open').click();
    await page.getByTestId('filter-sheet').waitFor();
    await shot(page, 'web-03-filter-panel');
    await page.getByTestId('filter-done').click();
  });
  await step('web-04', async () => {
    await side('wish');
    await shot(page, 'web-04-wish');
  });
  await step('web-05', async () => {
    await showDay('2027-02-03');
    await shot(page, 'web-05-day');
  });
  await step('web-06', async () => {
    await page.evaluate(() => window.__th.appStore.getState().select('shima-yokoyama'));
    await shot(page, 'web-06-selected-drop');
  });
  await step('web-07', async () => {
    await page.evaluate(() => window.__th.appStore.getState().openDetail('shima-yokoyama', 'day'));
    await page.getByTestId('place-detail').first().waitFor();
    await shot(page, 'web-07-detail-over-map');
    await page.evaluate(() => window.__th.appStore.getState().closeDetail());
  });
  await step('web-08', async () => {
    await page.getByTestId('planning-toggle').click();
    await page.getByTestId('planning-confirm').click();
    await page.getByTestId('planning-bar').waitFor();
    await shot(page, 'web-08-editing');
    await page.getByTestId('planning-done').click();
  });
  await step('web-09', async () => {
    await page.locator('.side-column').getByTestId('m-day-all').click();
    await shot(page, 'web-09-all-routes');
  });
  await page.context().close();
}

async function mobile() {
  const page = await open({ width: 390, height: 844 }, true);
  const tab = (t) => page.getByTestId(`m-tab-${t}`).click();
  const pick = async (d) => page.getByTestId(`m-day-${d}`).click();
  await step('m-01', async () => {
    await tab('explore');
    await page.getByTestId('m-feed-item').nth(3).waitFor();
    await shot(page, 'mobile-01-explore');
  });
  await step('m-02', async () => {
    await page.getByTestId('filter-open').click();
    await page.getByTestId('filter-sheet').waitFor();
    await shot(page, 'mobile-02-filter-panel');
    await page.getByTestId('filter-done').click();
  });
  await step('m-03', async () => {
    await page.getByTestId('m-feed-item').first().click();
    await page.getByTestId('m-detail').waitFor();
    await shot(page, 'mobile-03-detail');
    await page.getByTestId('m-detail-back').click();
  });
  await step('m-04', async () => {
    await tab('wish');
    await shot(page, 'mobile-04-wish');
  });
  await step('m-05', async () => {
    await tab('trip');
    await pick('2027-02-03');
    await page.evaluate(() => window.__thMobile.getState().setSnap('mid'));
    await shot(page, 'mobile-05-trip-mid');
  });
  await step('m-06', async () => {
    await page.getByTestId('m-card').nth(1).click({ position: { x: 100, y: 20 } });
    await shot(page, 'mobile-06-card-selected');
  });
  await step('m-07', async () => {
    await page.getByTestId('m-trip-edit').click();
    await page.getByTestId('planning-confirm').click();
    await page.getByTestId('planning-bar').waitFor();
    await shot(page, 'mobile-07-editing');
    await page.getByTestId('planning-done').click();
  });
  await step('m-08', async () => {
    await page.getByTestId('m-day-all').click();
    await page.getByTestId('m-overview').waitFor();
    await shot(page, 'mobile-08-overview');
  });
  await step('m-09', async () => {
    await tab('me');
    await shot(page, 'mobile-09-me');
    await page.getByTestId('m-me-comments').click();
    await page.getByTestId('m-page-comments').waitFor();
    await shot(page, 'mobile-10-comments-page');
  });
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
