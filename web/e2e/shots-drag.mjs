// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），第六輪重寫手機版後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// 探索收合、把卡片拖到聊天室、手機「＋ AI」的截圖，放在 data/cache/work/t15m-layout/（不進 git）。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-drag.mjs [網址]`。
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-layout');
const base = process.argv[2] ?? 'http://localhost:5191/';
const browser = await chromium.launch();
const ready = (p) => p.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded());

const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(base);
await ready(page);
const shot = async (name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};

// 探索：最上面（展開）、往下捲（收合）、點摘要（在原地展開）
await page.getByTestId('side-tab-explore').click();
await page.locator('.ex-areas [data-area="toba"]').click();
await page.locator('.ex-quick button', { hasText: '午餐' }).click();
await shot('13-explore-top');
await page.evaluate(() => (document.querySelector('.side-body').scrollTop = 1500));
await shot('14-explore-collapsed');
await page.getByTestId('ex-summary').click();
await shot('15-explore-collapsed-open');

// 把探索卡片拖到聊天室（拖曳中的畫面截不到，截放開之後）
await page.evaluate(() => (document.querySelector('.side-body').scrollTop = 0));
await page.getByTestId('explore-item').first().dragTo(page.locator('.chat-column'));
await shot('17-dropped');

// 手機：照片上的「＋ AI」、聊天分頁的數字
const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
await mobile.goto(base);
await ready(mobile);
await mobile.getByRole('button', { name: '探索' }).click();
await mobile.evaluate(() => window.__th.map.jumpTo({ center: [136.8436, 34.4862], zoom: 14 }));
await mobile.waitForTimeout(1500);
await mobile.getByTestId('wall-ask').nth(0).tap();
await mobile.getByTestId('wall-ask').nth(2).tap();
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: path.join(out, '18-mobile-ask.png') });

await browser.close();
console.log(`截圖在 ${out}`);
