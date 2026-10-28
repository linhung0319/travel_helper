// T29c 交通卡／班次表／編輯器的截圖（spec §8.12），放在 data/cache/work/t29c/final/（不進 git）。
// 手機 390、網頁 1280 各一套：伊勢市一帶的大眾運輸（收合、展開、班次表）、第一天南下（展開）、
// 一段 ticket-tight（真實行程沒有，就在瀏覽器裡把 2/5 喫茶店的停留時間改短，不存）、計程車段（點開）、編輯器（分段按鈕、兩條走法）、新今宮車站面板。
// 用法：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots-t29c.mjs [網址]`。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'data/cache/work/t29c/final');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.unlinkSync(path.join(out, f));
const base = process.argv[2] ?? 'http://localhost:5191/';
const browser = await chromium.launch();
const problems = [];
const ready = (p) => p.waitForFunction(() => window.__th?.dataStore.getState().status === 'ready' && window.__th.map.isStyleLoaded(), null, { timeout: 60000 });

async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
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
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push(`${name}: 橫向捲動`);
  const over = await page.evaluate(() => [...document.querySelectorAll('.ll-card')].filter((c) => c.scrollWidth > c.clientWidth + 1).length);
  if (over) problems.push(`${name}: ${over} 張交通卡內容溢出`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${String(e.message).split('\n')[0]}`);
  }
};

/** 兩種版面共用的操作 */
function ui(page, mobile) {
  return {
    async showDay(d) {
      if (mobile) {
        await page.getByTestId('m-tab-trip').click();
        await page.getByTestId(`m-day-${d}`).click();
        await page.evaluate(() => window.__thMobile.getState().setSnap('high'));
      } else {
        await page.evaluate((x) => window.__th.commands.selectDay(x), d);
        await page.getByTestId('side-tab-day').click();
      }
    },
    leg: (d, item) => page.locator(`[data-testid="${mobile ? 'm-leg' : 'tl-leg'}"][data-leg="${d}:visit:${item}"]`),
    legByText: (text) => (mobile ? page.getByTestId('m-leg') : page.getByTestId('timeline').getByTestId('tl-leg')).filter({ hasText: text }).first(),
    toggle: (leg) => (mobile ? leg.getByTestId('leg-line-text') : leg.getByRole('button').first()).click(),
  };
}

async function run(prefix, viewport, mobile) {
  const page = await open(viewport, mobile);
  const u = ui(page, mobile);
  const sc = async (leg) => leg.scrollIntoViewIfNeeded();

  // 1. 伊勢市一帶的大眾運輸（2/5 第二段）：收合、展開、班次表
  await step(`${prefix}-ise`, async () => {
    await u.showDay('2027-02-05');
    const leg = u.leg('2027-02-05', 'i-21');
    await leg.waitFor();
    await sc(leg);
    await shot(page, `${prefix}-01-ise-collapsed`);
    await u.toggle(leg);
    await sc(leg);
    await shot(page, `${prefix}-02-ise-open`);
    await leg.getByTestId('leg-step-board').first().click();
    await page.getByTestId('timetable-popup').waitFor();
    await shot(page, `${prefix}-03-ise-timetable`);
    await page.getByTestId('timetable-close').click();
    await u.toggle(leg);
  });

  // 2. 第一天南下
  await step(`${prefix}-day1`, async () => {
    await u.showDay('2027-02-02');
    const leg = u.leg('2027-02-02', 'i-1');
    await leg.waitFor();
    await u.toggle(leg);
    await sc(leg);
    await shot(page, `${prefix}-04-day1-open`);
    await u.toggle(leg);
  });

  // 3. ticket-tight：把 2/5 喫茶店的停留時間一格一格試，直到那段展開後出現「買票可能來不及」
  await step(`${prefix}-tight`, async () => {
    await u.showDay('2027-02-05');
    const leg = u.leg('2027-02-05', 'i-21');
    let found = null;
    for (let stay = 5; stay <= 90 && found === null; stay += 1) {
      await page.evaluate((s) => {
        const ds = window.__th.dataStore;
        const it = structuredClone(ds.getState().itinerary);
        it.days.find((d) => d.date === '2027-02-05').items.find((i) => i.id === 'i-20').options[0].stayMinutes = s;
        ds.setState({ itinerary: it });
      }, stay);
      await page.waitForTimeout(250);
      await leg.waitFor();
      if (!(await leg.getByTestId('leg-steps').count())) await u.toggle(leg);
      if (await leg.getByTestId('leg-ticket-tight').count()) found = stay;
    }
    if (found === null) throw new Error('試了 5～90 分都沒有 ticket-tight');
    console.log(`${prefix} ticket-tight：i-20 停留 ${found} 分`);
    await sc(leg);
    await shot(page, `${prefix}-05-ticket-tight`);
    await u.toggle(leg);
  });

  // 4. 計程車段（2/4）：點開
  await step(`${prefix}-taxi`, async () => {
    await u.showDay('2027-02-04');
    const leg = u.legByText('計程車');
    await leg.waitFor();
    await u.toggle(leg);
    await sc(leg);
    await shot(page, `${prefix}-06-taxi-open`);
    await u.toggle(leg);
  });

  // 5. 編輯器：分段按鈕、兩條走法（2/5 第二段）；前面改過的停留時間先還原
  await step(`${prefix}-editor`, async () => {
    await page.evaluate(() => {
      const ds = window.__th.dataStore;
      const it = structuredClone(ds.getState().itinerary);
      it.days.find((d) => d.date === '2027-02-05').items.find((i) => i.id === 'i-20').options[0].stayMinutes = 20;
      ds.setState({ itinerary: it });
    });
    await u.showDay('2027-02-05');
    const leg = u.leg('2027-02-05', 'i-21');
    await leg.waitFor();
    // 編輯中手機底部分頁會收起來，所以選好那天才開始編輯
    await page.evaluate(() => window.__th.appStore.getState().setPlanning(true));
    // 手機：先點開那一行，編輯器在底部面板（m-leg-sheet）；網頁：直接在卡片裡
    if (mobile) await u.toggle(leg);
    await leg.getByTestId('leg-edit').click();
    const ed = mobile ? page.getByTestId('m-leg-sheet') : leg;
    await ed.getByTestId('leg-paths').waitFor();
    await page.waitForTimeout(800);
    if (!mobile) await sc(leg);
    await shot(page, `${prefix}-07-editor-paths`);
    await ed.getByTestId('leg-done').click();
    await page.evaluate(() => window.__th.appStore.getState().setPlanning(false));
  });

  // 6. 新今宮車站面板
  await step(`${prefix}-station`, async () => {
    await page.evaluate(() => window.__th.appStore.getState().openDetail('jr-shin-imamiya'));
    await page.getByTestId('station-panel').waitFor();
    await shot(page, `${prefix}-08-station-shin-imamiya`);
  });
  await page.context().close();
}

await run('web', { width: 1280, height: 800 }, false);
await run('mobile', { width: 390, height: 844 }, true);
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no problems');
