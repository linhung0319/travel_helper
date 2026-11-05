// T74b 提醒精簡：畫面（網頁，interaction-design §34.3）。假行程（dev-fixtures/seed.ts）：
// 2/5 喫茶 Mori、漣 有要處理的（不接受預約、最後入場），御木本珍珠島只有留意（停留到打烊）；2/4 只有留意；2/3、2/4、2/6、2/10 引擎算起來累。
// 截圖存到 SHOTS_DIR（沒設就不存）。
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = (name: string) => (process.env.SHOTS_DIR ? { path: `${process.env.SHOTS_DIR}/${name}.png` } : {});
const selectDay = (page: Page, d: string) => page.evaluate((d) => (window as any).__th.commands.selectDay(d), d);
const row = (page: Page, itemId: string) => page.locator(`[data-testid="tl-row"][data-item="${itemId}"]`);

test('資料卡：有要處理的紅框「⚠ N」只數要處理，只有留意的淡框「· N」；點開每條一行；名稱沒有括號、停留寫「20分」', async ({ page }) => {
  await ready(page);
  await selectDay(page, '2027-02-05');
  // 喫茶 Mori（拿坡里義大利麵）：名稱去掉括號、停留 20 分寫「20分」、一條要處理的
  const mori = row(page, 'i-20');
  await expect(mori.getByTestId('trip-card-name')).toHaveText('喫茶 Mori');
  await expect(mori.getByTestId('stay-chip')).toHaveText('20分');
  const moriWarn = mori.getByTestId('warn-toggle');
  await expect(moriWarn).toHaveAttribute('data-level', 'act');
  await expect(moriWarn).toHaveText(/1$/);
  // 御木本珍珠島：只有留意（停留到打烊）→ 淡框「· 1」；點開是墨色小字一行
  const pearl = row(page, 'i-8');
  const pearlWarn = pearl.getByTestId('warn-toggle');
  await expect(pearlWarn).toHaveAttribute('data-level', 'note');
  await expect(pearlWarn).toHaveText(/·\s*1$/);
  await pearlWarn.click();
  const list = pearl.getByTestId('card-reminders');
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list.locator('li').first()).toHaveAttribute('data-level', 'note');
  await expect(list).toContainText('17:00 打烊，停留到 17:42');
  // 漣：兩條要處理的（最後入場、不接受預約）
  const sazanami = row(page, 'i-7');
  await expect(sazanami.getByTestId('warn-toggle')).toHaveText(/2$/);
  await sazanami.getByTestId('warn-toggle').click();
  const items = sazanami.getByTestId('card-reminders').locator('li');
  await expect(items).toHaveCount(2);
  for (const li of await items.all()) await expect(li).toHaveAttribute('data-level', 'act');
  await page.screenshot(shot('t74b-web-2-5'));
});

test('日期列：數字＝這天所有要處理的（卡片的也算）；點開列整天的，卡片的帶名字、整天的沒有、要處理在前；只有留意的那天是淡的「· N」', async ({ page }) => {
  await ready(page);
  await selectDay(page, '2027-02-05');
  const toggle = page.getByTestId('day-warn-toggle');
  // 喫茶 Mori 1、漣 2 → 3 條要處理
  await expect(toggle).toHaveAttribute('data-level', 'act');
  await expect(toggle).toContainText('3');
  await toggle.click();
  const list = page.getByTestId('day-warnings');
  const items = list.locator('li');
  await expect(items).toHaveCount(6);
  // 要處理的在前，卡片的帶名字
  await expect(items.nth(0)).toHaveAttribute('data-level', 'act');
  await expect(items.nth(0)).toContainText('喫茶 Mori：不接受預約');
  await expect(items.nth(2)).toHaveAttribute('data-level', 'act');
  await expect(items.nth(3)).toHaveAttribute('data-level', 'note');
  // 整天的（天黑早）沒有名字
  const dark = items.filter({ hasText: '17:45 回住宿，2 月 17:00 天黑' });
  await expect(dark).toHaveCount(1);
  await expect(dark).not.toContainText('：');
  // 每條一行：清單不比面板寬
  const panel = (await page.getByTestId('day-panel').boundingBox())!;
  const box = (await list.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  await page.screenshot(shot('t74b-web-2-5-day'));
  // 整趟最上面沒有紅字長句（T74b 拿掉）
  await selectDay(page, 'all');
  await expect(page.getByTestId('trip-skeleton')).toBeVisible();
  await expect(page.locator('[data-testid="day-panel"] > p.warning-act, [data-testid="day-panel"] > p.warning-note')).toHaveCount(0);
  // 2/4 只有留意：淡的「· 4」
  await selectDay(page, '2027-02-04');
  await expect(page.getByTestId('day-warn-toggle')).toHaveAttribute('data-level', 'note');
  await expect(page.getByTestId('day-warn-toggle')).toContainText('4');
  // 2/2 一條要處理（遊覽船 18:42 到，15:00 打烊）
  await selectDay(page, '2027-02-02');
  await expect(page.getByTestId('day-warn-toggle')).toHaveAttribute('data-level', 'act');
  await expect(page.getByTestId('day-warn-toggle')).toContainText('1');
  await page.screenshot(shot('t74b-web-2-2'));
});

test('整趟：累的天在地區名後面有「累」標；住宿「待訂」後面接「· 晚餐未選」', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await selectDay(page, 'all');
  const rowOf = (date: string) => page.locator(`[data-testid="sk-row"][data-date="${date}"]`);
  // 2/3、2/4 連兩天累；2/5 不累
  await expect(rowOf('2027-02-03').getByTestId('sk-tired')).toHaveText('累');
  await expect(rowOf('2027-02-04').getByTestId('sk-tired')).toHaveText('累');
  await expect(rowOf('2027-02-05').getByTestId('sk-tired')).toHaveCount(0);
  // 2/3 志摩觀光飯店（有含不含晚餐兩種方案）→ 待訂 · 晚餐未選；2/2 賢島港（含早餐）只有待訂
  await expect(rowOf('2027-02-03').getByTestId('sk-booking')).toHaveText('待訂');
  await expect(rowOf('2027-02-03').getByTestId('sk-meals-unchosen')).toContainText('晚餐未選');
  await expect(rowOf('2027-02-02').getByTestId('sk-meals-unchosen')).toHaveCount(0);
  // 「待訂」是墨色外框，不是紅的
  const color = await rowOf('2027-02-03').getByTestId('sk-booking').evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(200, 55, 45)');
  await page.screenshot(shot('t74b-web-trip'));
});

test('交通卡：第二行沒有台數、只有留意的那段沒有「⚠ N」；詳情名稱列有「地圖 ↗」', async ({ page }) => {
  await ready(page);
  // 2/4 兩段交通都只有「改搭計程車」的留意
  await selectDay(page, '2027-02-04');
  const legs = page.getByTestId('tl-leg');
  await expect(legs.first()).toBeVisible();
  await expect(page.getByTestId('leg-warn-count')).toHaveCount(0);
  for (const t of await page.getByTestId('leg-line-text').allTextContents()) expect(t).not.toMatch(/台/);
  // 2/5 自動算的大眾運輸也沒有台數
  await selectDay(page, '2027-02-05');
  for (const t of await page.getByTestId('leg-line-text').allTextContents()) expect(t).not.toMatch(/台/);
  // 詳情：名稱列的「地圖 ↗」新分頁開 Google Maps
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-aquarium'));
  const maps = page.getByTestId('detail-panel').getByTestId('detail-maps');
  await expect(maps).toHaveText('地圖 ↗');
  await expect(maps).toHaveAttribute('href', /maps\.google\.com|google\.com\/maps/);
  await expect(maps).toHaveAttribute('target', '_blank');
  await page.screenshot(shot('t74b-web-detail'));
});
