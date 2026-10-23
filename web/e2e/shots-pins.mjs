// 地圖圖標的前後對照：S／A／B 的大小、選中的點（圓框 → 水滴圖釘）。截圖放在 data/cache/work/t15m-layout/（不進 git）。
// 「前」是在頁面上把圖層改回原本的大小、用圓框標選中的點。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-pins.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-layout');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5191/';

const SCENES = [
  { name: 'ise-station-z15', center: [136.7085, 34.4905], zoom: 15 },
  { name: 'ise-oharai-z15', center: [136.7258, 34.4632], zoom: 15.5 },
  { name: 'ise-z13', center: [136.715, 34.48], zoom: 13 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(base);
await page.waitForFunction(() => {
  const th = window.__th;
  return th && th.dataStore.getState().status === 'ready' && th.map.isStyleLoaded() && th.map.getLayer('places-pin');
});
const idle = () => page.evaluate(() => new Promise((r) => window.__th.map.once('idle', () => setTimeout(r, 300))));
const shot = async (name) => {
  await page.waitForTimeout(800);
  await page.locator('.map-column').screenshot({ path: path.join(out, `pins-${name}.png`) });
};

for (const s of SCENES) {
  await page.evaluate((s) => {
    const th = window.__th;
    th.appStore.getState().closeDetail();
    th.map.jumpTo({ center: s.center, zoom: s.zoom });
  }, s);
  await idle();
  // 選中畫面中間附近的一個 S 級點
  const pick = await page.evaluate((c) => {
    const ps = window.__th.dataStore.getState().places.filter((p) => p.tier === 'S');
    const d = (p) => Math.hypot(p.coords[0] - c[0], p.coords[1] - c[1]);
    return ps.sort((x, y) => d(x) - d(y))[0]?.id ?? null;
  }, s.center);
  // 前：原本的大小、選中的點用圓框
  await page.evaluate((id) => {
    const m = window.__th.map;
    m.setLayoutProperty('places-icon', 'icon-size', ['match', ['get', 'tier'], 'S', 1.05, 'A', 0.92, 0.8]);
    m.setPaintProperty('places-circle', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 8, ['match', ['get', 'tier'], 'S', 5, 'A', 4.5, 3.5], 12, ['match', ['get', 'tier'], 'S', 7, 'A', 6, 5]]);
    m.setFilter('places-focus', ['==', ['get', 'id'], id ?? '']);
  }, pick);
  await shot(`${s.name}-before`);
  // 後：重新載入圖層的設定（打開詳情，選中的點變成圖釘）
  await page.evaluate((id) => {
    const m = window.__th.map;
    m.setLayoutProperty('places-icon', 'icon-size', ['match', ['get', 'tier'], 'S', 1.2, 'A', 0.9, 0.72]);
    m.setPaintProperty('places-circle', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 8, ['match', ['get', 'tier'], 'S', 6, 'A', 4.5, 3], 12, ['match', ['get', 'tier'], 'S', 8.5, 'A', 6, 4.5]]);
    if (id) window.__th.appStore.getState().openDetail(id);
  }, pick);
  await shot(`${s.name}-after`);
}
await browser.close();
console.log(`截圖在 ${out}`);
