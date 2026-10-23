// T15m：給 👤 檢視用的截圖（手機、電腦各一組），放在 data/cache/work/t15m/（不進 git）。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5191/';

const SIZES = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
];

const browser = await chromium.launch();
const errors = [];
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.hasTouch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${size.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${size.name} console: ${m.text()}`));
  await page.goto(base);
  await page.waitForFunction(() => {
    const th = window.__th;
    return th && th.dataStore.getState().status === 'ready' && th.map.isStyleLoaded();
  });
  const mobile = size.name === 'mobile';
  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${size.name}-${name}.png`) });
  };
  const th = (fn, arg) => page.evaluate(fn, arg);
  const openDay = async () => {
    if (mobile) await th(() => window.__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
  };

  // 1. 整趟的總覽
  await openDay();
  await shot('01-overview');
  // 2. 一天的時間軸（有備案）
  await th(() => window.__th.commands.selectDay('2027-02-05'));
  await openDay();
  await shot('02-day-0205');
  // 3. 分組的那天
  await th(() => window.__th.commands.selectDay('2027-02-10'));
  await openDay();
  await shot('03-day-0210-split');
  if (mobile) {
    await th(() => window.__th.appStore.getState().setSheet({ tab: 'day', snap: 'half' }));
    await shot('03b-day-0210-half');
  }
  // 4. 規劃模式
  await page.getByTestId('planning-toggle').click();
  await shot('04-planning-confirm');
  await page.getByTestId('planning-confirm').click();
  await th(() => window.__th.commands.selectDay('2027-02-05'));
  await openDay();
  await page.getByTestId('item-menu').first().click();
  await shot('05-planning-menu');
  await page.keyboard.press('Escape');
  await page.getByTestId('item-menu').first().click();
  // 5. 詳情：投票、建議、修改紀錄
  await th(() => window.__th.appStore.getState().openDetail('toba-kazuei'));
  if (mobile) await th(() => window.__th.appStore.getState().setSheet({ snap: 'full' }));
  await shot('06-detail-votes-edits');
  await page.getByTestId('edited-mark').first().click();
  await shot('07-edit-history');
  await page.keyboard.press('Escape');
  await page.getByTestId('detail-suggest').click();
  await shot('08-suggest-dialog');
  await page.keyboard.press('Escape');
  await th(() => window.__th.appStore.getState().closeDetail());
  // 6. 待處理的建議、快照、需要預約
  await page.getByTestId('pending-button').click();
  await shot('09-pending');
  await page.keyboard.press('Escape');
  await page.getByTestId('snapshots-button').click();
  await shot('10-snapshots');
  await page.keyboard.press('Escape');
  await openDay();
  await page.getByTestId('reservations-button').click();
  await shot('11-reservations');
  await page.keyboard.press('Escape');
  // 7. 探索模式的 ❤️
  await th(() => window.__th.appStore.getState().setPlanning(false));
  await th(() => window.__th.commands.focus('toba-aquarium'));
  await th(() => window.__th.appStore.getState().setMode('explore'));
  if (mobile) await th(() => window.__th.appStore.getState().setSheet({ snap: 'peek' }));
  await shot('12-explore-votes');
  // 8. 別人改過了
  await th(() => window.__th.appStore.getState().setMode('map'));
  await page.getByTestId('me-button').click();
  await shot('13-dev-menu');
  await page.getByTestId('dev-other-edit').click();
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await openDay();
  await page.getByTestId('item-menu').first().click();
  await page.getByRole('menuitem', { name: /下移/ }).click();
  await shot('14-conflict');
  await ctx.close();
}
await browser.close();
console.log(`截圖在 ${out}`);
if (errors.length) {
  console.log('錯誤：');
  for (const e of errors) console.log(' ', e);
  process.exitCode = 1;
}
