// 歷史紀錄：這支截圖腳本對應第六輪以前的手機版面（上方列、拉起面板），手機的部分第六輪後不一定跑得完；現在的畫面以 shots-round6.mjs 為準。
// T15m 第五輪的截圖，放在 data/cache/work/t15m-round5/（不進 git）：
// 2/3 時間軸（虛線、類型色塊、編號、等待那一條）、時間條、2/4 交通卡收起／展開／編輯（班次下拉）、班次表、
// 編輯中的藍條、候選（一般／編輯中）、地圖彈窗、整趟的 4 色路線（和點某天的路線）。
// 寬 1600、1280（電腦）、390（手機）各一套。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-round5.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t15m-round5');
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
  // 不連公開的 OSRM：距離是直線、結果固定（和 e2e 一樣）
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
const tl = (page) => page.getByTestId('timeline');

async function run(name, viewport, mobile) {
  const page = await open(viewport, mobile);
  const sheet = (snap) => mobile && page.evaluate((snap) => window.__th.appStore.getState().setSheet({ snap }), snap);
  const showDay = async (date) => {
    await page.evaluate((d) => window.__th.commands.selectDay(d), date);
    if (mobile) await page.evaluate(() => window.__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
    else await page.getByTestId('side-tab-day').click();
  };
  const startEditing = async () => {
    await page.getByTestId('planning-toggle').click();
    await page.getByTestId('planning-confirm').click();
    await page.getByTestId('planning-bar').waitFor();
  };
  const finishEditing = () => page.getByTestId('planning-done').click();

  // 1. 2/3：時間條、虛線、類型色塊、右上角編號 0..3、交通卡下面的等待那一條
  await showDay('2027-02-03');
  await tl(page).getByTestId('tl-wait').waitFor();
  await shot(page, `${name}-01-day-0203`);
  // 時間條：點 La Mer 那段 → 時間軸捲到那張卡並閃一下
  await page.getByTestId('day-bar').scrollIntoViewIfNeeded();
  await page.getByTestId('day-bar-seg').nth(1).click().catch(() => {});
  await page.getByTestId('day-bar').scrollIntoViewIfNeeded();
  await shot(page, `${name}-02-day-bar`);

  // 2. 2/4 伊雜宮 → 大王埼燈塔：種子資料自動挑計程車，先在編輯中改成大眾運輸
  await showDay('2027-02-04');
  const leg = tl(page).locator('[data-testid="tl-leg"][data-leg="2027-02-04:visit:i-5"]');
  await startEditing();
  await shot(page, `${name}-03-editing-bar`);
  await leg.getByRole('button').first().click();
  await leg.locator('[data-testid="leg-mode"][data-mode="transit"]').click();
  await leg.getByTestId('leg-steps').first().waitFor();
  await leg.scrollIntoViewIfNeeded();
  await shot(page, `${name}-04-leg-editing`);
  await leg.getByTestId('leg-done').click();
  await finishEditing();
  // 收起
  await leg.scrollIntoViewIfNeeded();
  await shot(page, `${name}-06-leg-collapsed`);
  // 展開：步驟
  await leg.getByRole('button').first().click();
  await leg.getByTestId('leg-steps').waitFor();
  await leg.scrollIntoViewIfNeeded();
  await shot(page, `${name}-07-leg-expanded`);
  // 班次表（地圖那側；手機是下方面板）
  await leg.getByTestId('leg-ride').first().click();
  await page.getByTestId('timetable').waitFor();
  await shot(page, `${name}-08-timetable`);
  await page.getByTestId('timetable-close').click();
  await leg.getByRole('button').first().click();

  // 3. 候選：2/5 一般、編輯中（⠿、↑ 排進）
  await showDay('2027-02-05');
  const cands = page.getByTestId('day-candidates');
  await cands.scrollIntoViewIfNeeded();
  await shot(page, `${name}-09-candidates`);
  await startEditing();
  await cands.scrollIntoViewIfNeeded();
  await shot(page, `${name}-10-candidates-editing`);
  await finishEditing();

  // 4. 地圖彈窗：2/3 的 La Mer（電腦版貼在點上方，在日期列上面；手機固定在地圖下方）
  await showDay('2027-02-03');
  await sheet('peek');
  await page.evaluate(() => {
    const t = window.__th;
    t.map.jumpTo({ center: t.dataStore.getState().byId.get('shima-la-mer').coords, zoom: 14 });
  });
  await page.waitForTimeout(800);
  if (!mobile) {
    // 點放在日期列下面一點，彈窗會蓋到日期列
    await page.evaluate(() => {
      const t = window.__th;
      const pt = t.map.project(t.dataStore.getState().byId.get('shima-la-mer').coords);
      t.map.panBy([0, pt.y - 380], { duration: 0 });
    });
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.__th.appStore.getState().openPreview('shima-la-mer'));
  await page.getByTestId('preview-card').waitFor();
  await shot(page, `${name}-11-map-popup`);
  await page.evaluate(() => window.__th.appStore.getState().openPreview(null));

  // 5. 整趟：每天的路線 4 色輪流；點某天的路線，其他天變淡
  await page.evaluate(() => window.__th.commands.selectDay('all'));
  await sheet('peek');
  await page.evaluate(() => window.__th.map.fitBounds([[136.65, 34.25], [136.95, 34.56]], { duration: 0, padding: 40 }));
  await shot(page, `${name}-12-trip-map`);
  await page.evaluate(() => window.__th.appStore.getState().setTripFocusDay('2027-02-05'));
  await shot(page, `${name}-13-trip-focus-day`);
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
