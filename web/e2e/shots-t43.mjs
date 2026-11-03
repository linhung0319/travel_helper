// T43 探索地圖分層的截圖，放在 data/cache/work/t43/（不進 git）：網頁 1440×900 的概覽（縮遠）、選鳥羽、放大、選鳥羽後縮遠。
// 用法：先 `npm run dev -- --port 5196`，再 `node web/e2e/shots-t43.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t43');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5196/';
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });
const idle = () => page.waitForFunction(() => !window.__th.map.isMoving(), null, { timeout: 10000 }).then(() => page.waitForTimeout(600));
const shot = async (name) => {
  await idle();
  const z = await page.evaluate(() => window.__th.map.getZoom().toFixed(2));
  const labels = await page.getByTestId('area-name-label').count();
  console.log(name, 'zoom', z, 'labels', labels);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
await shot('1-overview');
await page.getByTestId('area-name-label').filter({ hasText: '鳥羽' }).click();
await shot('2-toba');
await page.evaluate(() => window.__th.map.zoomTo(10, { duration: 0 }));
await shot('3-toba-far');
await page.evaluate(() => window.__th.map.flyTo({ center: [136.84, 34.48], zoom: 12.5, duration: 0 }));
await shot('4-toba-near');
console.log('errors', errors);
await browser.close();
