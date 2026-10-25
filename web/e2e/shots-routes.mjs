// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），第六輪重寫手機版後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// 2/5 的行程線沿道路畫的截圖，放在 data/cache/work/t15m-round3/（不進 git）。會連公開的 OSRM。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-routes.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-round3');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5191/';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto(base);
await page.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });
await page.evaluate(() => window.__th.commands.selectDay('2027-02-05'));
await page.waitForTimeout(25000);
const info = await page.evaluate(() => {
  const th = window.__th;
  const d = th.map.getSource('overlay-itinerary-lines').serialize().data;
  return { version: th.appStore.getState().routesVersion, lines: d.features.filter((f) => f.properties.date === '2027-02-05').map((f) => f.geometry.coordinates.length) };
});
console.log(JSON.stringify(info));
await page.evaluate(() => {
  const th = window.__th;
  const d = th.map.getSource('overlay-itinerary-lines').serialize().data;
  const pts = d.features.filter((f) => f.properties.date === '2027-02-05').flatMap((f) => f.geometry.coordinates);
  const [w, e] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [s, n] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  th.map.fitBounds([[w, s], [e, n]], { padding: 80, duration: 0 });
});
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(out, 'day-0205-roads.png') });
console.log('errors:', JSON.stringify(errors));
await browser.close();
