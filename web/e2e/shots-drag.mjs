// 拖曳的截圖（第七輪 §6.4）：網頁滑鼠移上去、拖到一半（浮起來的卡、讓出的空位）、停 0.6 秒的合併提示、⋯ 的調整順序；
// 手機按把手拖到一半（面板拉滿）、動作面板的調整順序。拖到一半的畫面用滑鼠／CDP 觸控停在半路截。
// 截圖放在 data/cache/work/t15m-audit/shots/（不進 git）。
// 用法：先 `npm run dev -- --port 5198 --strictPort`，再 `node web/e2e/shots-drag.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-audit/shots');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5198/';
const browser = await chromium.launch();
const ready = (p) => p.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready', null, { timeout: 60000 });
const shot = async (p, name) => {
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(out, `${name}.png`) });
};
const selectDay = (p, d) => p.evaluate((x) => window.__th.commands.selectDay(x), d);

// --- 網頁 ---
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(base);
await ready(page);
await selectDay(page, '2027-02-05');
await page.getByTestId('planning-toggle').click();
await page.getByTestId('planning-confirm').click();
await page.getByTestId('planning-bar').waitFor();
const row = (id) => page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-item="${id}"]`);
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + Math.min(200, b.width / 2), y: b.y + b.height / 2, b };
};
// 滑鼠移上去：手掌、--wash、左邊灰線
const name20 = await center(row('i-20').getByTestId('trip-card-name'));
await page.mouse.move(name20.x, name20.y);
await shot(page, 'drag-01-desktop-hover');
// 拖到一半：浮起來的卡、i-7 前面讓出空位
await page.mouse.down();
const t7 = await center(row('i-7'));
await page.mouse.move(t7.x, t7.b.y + 6, { steps: 10 });
await shot(page, 'drag-02-desktop-gap');
await page.keyboard.press('Escape');
await page.mouse.up();
// 停 0.6 秒的合併提示：餐廳拖到另一間餐廳（2/10 豆腐屋排進去，拖到向井酒の店）
await selectDay(page, '2027-02-10');
await page.getByTestId('day-candidates').locator('[data-testid="cand-item"][data-id="ise-tofuya"]').getByTestId('cand-up').click();
const src = page.getByTestId('timeline').locator('[data-testid="tl-row"][data-place="ise-tofuya"]');
await src.waitFor();
const s = await center(src.getByTestId('trip-card-name'));
await page.mouse.move(s.x, s.y);
await page.mouse.down();
const t19 = await center(row('i-19'));
await page.mouse.move(t19.x, t19.y, { steps: 10 });
await page.waitForTimeout(800);
await shot(page, 'drag-03-desktop-merge');
await page.keyboard.press('Escape');
await page.mouse.up();
// ⋯ → 調整順序 → 和哪一張合併
await row('i-19').getByTestId('item-menu').click();
await page.getByTestId('action-menu').getByTestId('action-reorder').click();
await page.getByTestId('action-menu').getByTestId('reorder-merge').click();
await shot(page, 'drag-04-desktop-reorder');

// --- 手機 ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const m = await ctx.newPage();
await m.goto(base);
await ready(m);
await selectDay(m, '2027-02-05');
await m.getByTestId('m-trip-edit').click();
await m.getByTestId('planning-confirm').click();
await m.waitForTimeout(500);
await shot(m, 'drag-05-mobile-handle');
const cdp = await ctx.newCDPSession(m);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x == null ? [] : [{ x, y, id: 1 }] });
const h = await m.locator('[data-testid="m-card"][data-item="i-20"]').getByTestId('m-card-handle').boundingBox();
await touch('touchStart', h.x + h.width / 2, h.y + h.height / 2);
await touch('touchMove', h.x + h.width / 2, h.y + h.height / 2 + 10);
await m.waitForTimeout(600); // 面板拉滿的動畫
const t6 = await m.locator('[data-testid="m-card"][data-item="i-6"]').boundingBox();
for (let i = 1; i <= 6; i++) await touch('touchMove', h.x + h.width / 2 + 20, h.y + ((t6.y + t6.height - 8 - h.y) * i) / 6);
await shot(m, 'drag-06-mobile-dragging');
await touch('touchEnd');
await m.waitForTimeout(600);
// ⋯ → 調整順序
await m.locator('[data-testid="m-card"][data-item="i-8"]').getByTestId('m-card-menu').click();
await m.getByTestId('m-action-reorder').click();
await shot(m, 'drag-07-mobile-reorder');

await browser.close();
console.log(`截圖在 ${out}`);
