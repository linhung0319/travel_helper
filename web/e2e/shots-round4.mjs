// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），第六輪重寫手機版後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// T15m 第四輪的截圖，放在 data/cache/work/t15m-round4/（不進 git）：
// 某一天的時間軸（合併卡片、交通卡）、規劃模式原地改交通、拖曳合併（放開前的亮框、放開後可以復原的提示）、討論彈窗、整趟的地圖顏色。
// 手機 390×844、電腦 1440×900 各一套。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-round4.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-round4');
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

/** 拖到一半：電腦版用滑鼠（HTML5 拖曳），手機用長按後移動（直接送 pointer 事件）；回傳放開的函式 */
async function startDrag(page, source, target, mobile) {
  await source.scrollIntoViewIfNeeded();
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  const from = { x: s.x + Math.min(80, s.width / 2), y: s.y + s.height / 2 };
  const to = { x: t.x + Math.min(200, t.width / 2), y: t.y + t.height / 2 };
  if (!mobile) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    return () => page.mouse.up();
  }
  // 真的觸控事件（CDP），setPointerCapture 才找得到這根手指
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await touch('touchStart', from);
  await page.waitForTimeout(600); // 長按 0.4 秒才開始拖
  for (let i = 1; i <= 8; i++) await touch('touchMove', { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 });
  return () => touch('touchEnd', null);
}

async function run(name, viewport, mobile) {
  const page = await open(viewport, mobile);
  const showDay = async (date) => {
    await page.evaluate((d) => window.__th.commands.selectDay(d), date);
    if (mobile) await page.evaluate(() => window.__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
    else await page.getByTestId('side-tab-day').click();
  };

  // 1. 某一天：合併卡片（漣／一榮，👑）、交通卡
  await showDay('2027-02-05');
  await row(page, 'i-7').scrollIntoViewIfNeeded();
  await shot(page, `${name}-1-day`);

  // 2. 規劃模式：點交通卡，原地變成編輯狀態
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  await leg.getByRole('button').first().click();
  await leg.getByTestId('leg-editor').scrollIntoViewIfNeeded();
  await shot(page, `${name}-2-leg-editor`);
  await leg.getByTestId('leg-done').click();

  // 3. 拖曳合併：大阪屋（餐廳候選）拖到午餐那張卡片中間 → 亮框「放開＝合併」；放開後有復原的提示
  const cand = page.getByTestId('day-candidates').locator('[data-testid="cand-item"][data-id="toba-osakaya"]');
  const release = await startDrag(page, cand, row(page, 'i-7'), mobile);
  await shot(page, `${name}-3-drag-merge`);
  await release();
  // 第五輪起候選卡變高，大阪屋可能在畫面外、拖不起來：沒有復原提示也照樣拍完（舊腳本，只求跑得完）
  await page.getByTestId('toast-undo').waitFor({ timeout: 10000 }).catch(() => console.log('（拖曳合併沒有成功，略過）'));
  await shot(page, `${name}-4-merge-toast`);
  await page.getByTestId('planning-done').click(); // 第五輪：「退出」改成「完成」

  // 4. 討論彈窗（四周還看得到地圖）
  if (mobile) await page.evaluate(() => window.__th.appStore.getState().setSheet({ snap: 'peek' }));
  await page.getByTestId('toolbar-comments').click();
  await page.getByTestId('map-panel').waitFor();
  await shot(page, `${name}-5-comments`);
  await page.getByTestId('map-panel-close').click();

  // 5. 整趟：每天一種顏色、編號用類型色
  await page.evaluate(() => window.__th.commands.selectDay('all'));
  if (mobile) await page.evaluate(() => window.__th.appStore.getState().setSheet({ snap: 'peek' }));
  // 看整個伊勢志摩（關西機場那兩天的線會出畫面）
  await page.evaluate(() => window.__th.map.fitBounds([[136.65, 34.25], [136.95, 34.56]], { duration: 0, padding: 40 }));
  await shot(page, `${name}-6-trip-map`);
  await page.context().close();
}

await run('desktop', { width: 1440, height: 900 }, false);
await run('mobile', { width: 390, height: 844 }, true);
await browser.close();
console.log(`截圖在 ${out}`);
if (errors.length) {
  console.log('錯誤：', errors);
  process.exitCode = 1;
}
