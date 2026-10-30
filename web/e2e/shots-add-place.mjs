// T31 自己加地點的截圖，放在 data/cache/work/t31/（不進 git）：
// 手機 390×844：探索貼連結的提示、確認頁、自己加的點的詳情、探索清單的虛線卡。
// 網頁 1440×900：右欄表單＋主地圖的圖釘、地圖右鍵選單、自己加的點的詳情彈窗。
// 用法：先 `npm run dev -- --port 5193`，再 `node web/e2e/shots-add-place.mjs [網址]`。
// 假後端展不開短網址，所以用完整的 Google Maps 網址。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t31');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.unlinkSync(path.join(out, f));
const base = process.argv[2] ?? 'http://localhost:5193/';
const MAP_LINK = 'https://www.google.com/maps/place/%E7%8F%88%E7%90%B2+%E7%81%AF%E5%8F%B0%E8%88%8E/@34.48,136.84,17z/data=!3d34.4815!4d136.8431';
const browser = await chromium.launch();
const errors = [];
const problems = [];
const ready = (p) => p.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
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
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push(`${name}: 橫向捲動`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${String(e.message).split('\n')[0]}`);
  }
};

async function mobile() {
  const page = await open({ width: 390, height: 844 }, true);
  await step('m-01', async () => {
    await page.getByTestId('m-tab-explore').click();
    await page.getByTestId('m-feed-search').fill(MAP_LINK);
    await page.getByTestId('add-suggest-add').waitFor();
    await shot(page, 'mobile-01-explore-link');
  });
  await step('m-02', async () => {
    await page.getByTestId('add-suggest-add').click();
    await page.getByTestId('m-add-page').waitFor();
    await page.getByTestId('add-type-restaurant').click();
    await page.getByTestId('add-note').fill('朋友推薦，週三休');
    await page.waitForFunction(() => window.__thAddMap?.isStyleLoaded());
    await shot(page, 'mobile-02-add-page');
  });
  await step('m-03', async () => {
    await page.getByTestId('add-save').scrollIntoViewIfNeeded();
    await page.getByTestId('add-save').click();
    await page.getByTestId('m-add-page').waitFor({ state: 'detached' });
    await page.getByTestId('m-feed-search').fill('珈琲');
    await page.locator('.is-user').first().waitFor();
    await shot(page, 'mobile-04-explore-list');
    await page.locator('.is-user').first().click();
    await page.getByTestId('m-detail').waitFor();
    await shot(page, 'mobile-03-detail');
  });
  await page.context().close();
}

async function web() {
  const page = await open({ width: 1440, height: 900 }, false);
  await step('w-01', async () => {
    await page.getByTestId('side-tab-explore').click();
    await page.getByTestId('search').fill(MAP_LINK);
    await page.getByTestId('add-suggest-add').click();
    await page.getByTestId('add-form').waitFor();
    await page.getByTestId('add-type-restaurant').click();
    await page.getByTestId('add-note').fill('朋友推薦，週三休');
    await page.waitForFunction(() => window.__th.map.isStyleLoaded());
    await shot(page, 'web-01-form-pin');
  });
  await step('w-03', async () => {
    await page.getByTestId('add-save').click();
    await page.getByTestId('add-form').waitFor({ state: 'detached' });
    await page.getByTestId('search').fill('珈琲');
    await page.locator('.is-user').first().click();
    await page.getByTestId('place-open-detail').click();
    await page.getByTestId('detail-user-warning').waitFor();
    await shot(page, 'web-03-detail');
    await page.keyboard.press('Escape');
  });
  await step('w-02', async () => {
    await page.reload();
    await ready(page);
    const box = await page.getByTestId('map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.getByTestId('map-context-add').waitFor();
    await shot(page, 'web-02-context-menu');
  });
  await page.context().close();
}

await mobile();
await web();
await browser.close();
console.log(`截圖在 ${out}`);
if (errors.length) console.log('pageerror:', [...new Set(errors)]);
if (problems.length) console.log('問題:', problems);
