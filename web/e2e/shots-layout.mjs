// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），第六輪重寫手機版後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// T15m 版面調整：電腦版三欄、類別圖標、每天的編號、探索清單的截圖，放在 data/cache/work/t15m-layout/（不進 git）。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-layout.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-layout');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5191/';

const SIZES = [
  { name: 'wide', viewport: { width: 1600, height: 900 } },
  { name: 'laptop', viewport: { width: 1280, height: 800 } },
];

const browser = await chromium.launch();
const errors = [];
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${size.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${size.name} console: ${m.text()}`));
  await page.goto(base);
  await page.evaluate(() => localStorage.removeItem('travel-helper:exploreView'));
  await page.waitForFunction(() => {
    const th = window.__th;
    return th && th.dataStore.getState().status === 'ready' && th.map.isStyleLoaded();
  });
  const shot = async (name) => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${size.name}-${name}.png`) });
  };
  const th = (fn, arg) => page.evaluate(fn, arg);

  await shot('01-overview');
  await page.locator('.side-column [data-day="2027-02-05"]').click();
  await shot('02-day-0205');
  await page.locator('.side-column [data-day="2027-02-10"]').click();
  await shot('03-day-0210-split');
  // 放大看類別圖標
  await page.locator('.day-float [role="tab"]').first().click();
  await th(() => window.__th.commands.focus({ center: [136.8436, 34.4862], zoom: 15 }));
  await shot('04-icons-toba-z15');
  await th(() => window.__th.commands.focus({ center: [136.84, 34.48], zoom: 13 }));
  await shot('05-icons-toba-z13');
  // 探索：照片、文字
  await page.getByTestId('side-tab-explore').click();
  await page.locator('.ex-areas [data-area="toba"]').click();
  await shot('06-explore-photo');
  await page.getByRole('button', { name: '☰' }).click();
  await shot('07-explore-list');
  await page.locator('[data-testid="explore-item"]').nth(2).hover();
  await shot('08-explore-hover');
  await page.locator('[data-testid="explore-item"]').nth(2).click();
  await shot('09-detail-overview');
  for (const [tab, name] of [['detail', '09b-detail-detail'], ['more', '09c-detail-more'], ['photos', '09d-detail-photos']]) {
    const btn = page.locator(`.detail-tabs [data-tab="${tab}"]`);
    if (!(await btn.count())) continue;
    await btn.click();
    await shot(name);
  }
  await page.locator('.detail-tabs [data-tab="overview"]').click();
  await page.locator('.ratings-box > summary').click();
  await shot('09e-detail-ratings-open');
  await page.getByTestId('detail-back').click();
  // 點地圖上的點：右側捲到探索的卡片
  const pt = await th(() => {
    const t = window.__th;
    const p = t.dataStore.getState().byId.get('futami-wan-honten');
    t.map.jumpTo({ center: p.coords, zoom: 16 });
    return new Promise((resolve) =>
      t.map.once('idle', () => {
        const q = t.map.project(p.coords);
        const r = t.map.getCanvas().getBoundingClientRect();
        resolve({ x: r.left + q.x, y: r.top + q.y });
      }),
    );
  });
  await page.mouse.click(pt.x, pt.y);
  await shot('12-map-click-card');
  await page.locator('.ex-types [data-type="lodging"]').click();
  await page.getByRole('button', { name: '🖼' }).click();
  await shot('10-explore-lodging');
  // 規劃模式的浮動列
  await page.getByTestId('side-tab-day').click();
  await page.locator('.side-column [data-day="2027-02-05"]').click();
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await shot('11-planning');
  await ctx.close();
}
await browser.close();
console.log(`截圖在 ${out}`);
if (errors.length) {
  console.log('錯誤：');
  for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
}
