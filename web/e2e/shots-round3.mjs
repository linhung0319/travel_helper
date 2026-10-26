// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），第六輪重寫手機版後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// T15m 第三輪的截圖，放在 data/cache/work/t15m-round3/（不進 git）：
// 這一天（一般模式／規劃模式、多點卡片展開、交通細列展開）、留言視窗、預約筆記、想去的卡片和月曆。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-round3.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-round3');
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
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
const row = (page, id) => page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-item="${id}"]`);

async function run(name, viewport, mobile) {
  const page = await open(viewport, mobile);
  const showDay = async () => {
    await page.evaluate(() => window.__th.commands.selectDay('2027-02-05'));
    if (mobile) await page.evaluate(() => window.__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
    else await page.getByTestId('side-tab-day').click();
  };
  await showDay();
  await shot(page, `${name}-1-day-normal`);

  // 規劃模式：多點卡片展開、交通細列展開
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  const lunch = row(page, 'i-7');
  // 第四輪起沒有「＋N」展開（改成 ‹ › 換著看），第五輪起規劃模式叫「編輯」：只換成現在的按鈕，讓舊腳本跑得完
  await lunch.getByTestId('option-next').click();
  await lunch.scrollIntoViewIfNeeded();
  await shot(page, `${name}-2-day-planning-options`);
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  await leg.getByRole('button').first().click();
  await leg.scrollIntoViewIfNeeded();
  await shot(page, `${name}-3-day-planning-leg`);
  await page.getByTestId('planning-done').click();

  // 留言視窗、預約筆記（日期列的 💬 📋，窄螢幕在 ⋯ 裡）
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-comments').click();
  await shot(page, `${name}-4-comments`);
  await page.getByTestId('map-panel-close').click();
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-reservations').click();
  await shot(page, `${name}-5-reservations`);
  await page.getByTestId('map-panel-close').click();

  // 想去的卡片和月曆
  if (mobile) {
    await page.getByTestId('sheet-tab-wish').click();
    await page.evaluate(() => window.__th.appStore.getState().setSheet({ snap: 'full' }));
  } else await page.getByTestId('side-tab-wish').click();
  await page.evaluate(() => window.__th.appStore.getState().setFilter({ types: ['spot'] }));
  const card = page.locator('[data-testid="wish-item"][data-id="toba-bay-cruise-irukajima"]');
  await card.scrollIntoViewIfNeeded();
  await shot(page, `${name}-6-wish-card`);
  await card.getByTestId('add-to-day').click();
  await page.getByTestId('day-picker').scrollIntoViewIfNeeded();
  await shot(page, `${name}-7-wish-calendar`);
  await page.context().close();
}

await run('wide', { width: 1600, height: 900 }, false);
await run('laptop', { width: 1280, height: 800 }, false);
await run('mobile', { width: 390, height: 844 }, true);
await browser.close();
console.log(`截圖在 ${out}`);
if (errors.length) {
  console.log('錯誤：', errors);
  process.exitCode = 1;
}
