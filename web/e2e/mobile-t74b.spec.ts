// T74b 提醒精簡：畫面（手機，interaction-design §34.3）：日期列的提醒鈕點開列整天的（原本手機看不到字）、
// 卡片的「⚠ N」點了展開那張卡、提醒的字在展開內容最上面；每條一行不超出畫面。截圖存到 SHOTS_DIR（沒設就不存）。
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';
import { scrollsSideways } from './mobileHelpers.ts';

const shot = (name: string, w: number) => (process.env.SHOTS_DIR ? { path: `${process.env.SHOTS_DIR}/${name}-${w}.png` } : {});
const selectDay = (page: Page, d: string) => page.evaluate((d) => (window as any).__th.commands.selectDay(d), d);
const card = (page: Page, itemId: string) => page.locator(`[data-testid="m-card"][data-item="${itemId}"]`);

test('手機日期列：「⚠ N」只數要處理，點開列整天的（卡片的帶名字），字看得到、不超出畫面', async ({ page }) => {
  await ready(page);
  const w = page.viewportSize()!.width;
  await selectDay(page, '2027-02-05');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  const toggle = page.getByTestId('day-warn-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('data-level', 'act');
  await expect(toggle).toContainText('3');
  await toggle.click();
  const list = page.getByTestId('day-warnings');
  await expect(list).toBeVisible();
  await expect(list.locator('li')).toHaveCount(6);
  await expect(list.locator('li').first()).toContainText('喫茶 Mori：不接受預約');
  const box = (await list.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(w);
  expect(await scrollsSideways(page)).toBe(false);
  await page.screenshot(shot('t74b-m-day', w));
  // 2/4 只有留意：淡的「· 4」
  await selectDay(page, '2027-02-04');
  await expect(page.getByTestId('day-warn-toggle')).toHaveAttribute('data-level', 'note');
  await expect(page.getByTestId('day-warn-toggle')).toContainText('4');
});

test('手機卡片：「⚠ N」點了展開那張卡，提醒的字在最上面；名稱沒有括號', async ({ page }) => {
  await ready(page);
  const w = page.viewportSize()!.width;
  await selectDay(page, '2027-02-05');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  const mori = card(page, 'i-20');
  await mori.scrollIntoViewIfNeeded();
  await expect(mori.getByTestId('trip-card-name')).toHaveText('喫茶 Mori');
  const warn = mori.getByTestId('m-card-warn');
  await expect(warn).toHaveAttribute('data-level', 'act');
  await expect(warn).toHaveText(/1$/);
  await warn.click();
  // 展開了，提醒在展開內容最上面
  await expect(mori.getByTestId('trip-card-expand')).toBeVisible();
  const list = mori.getByTestId('card-reminders');
  await expect(list).toContainText('不接受預約');
  const first = await mori.getByTestId('trip-card-expand').evaluate((el) => el.firstElementChild?.getAttribute('data-testid'));
  expect(first).toBe('card-reminders');
  const box = (await list.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(w);
  await page.screenshot(shot('t74b-m-card', w));
  // 只有留意的卡（御木本珍珠島）：淡的「· 1」
  const pearl = card(page, 'i-8');
  await pearl.scrollIntoViewIfNeeded();
  await expect(pearl.getByTestId('m-card-warn')).toHaveAttribute('data-level', 'note');
});
