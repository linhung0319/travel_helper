// T46 引導彈窗（interaction-design §17.1）手機版：入口在地圖「放大地圖」左邊；面板拉到最高時改在日期列「整趟」旁邊；去探索換分頁。
import { test } from '@playwright/test';
import { expect, goTab, ready, scrollsSideways } from './mobileHelpers.ts';

test('入口：面板中間時在「放大地圖」左邊；低時留著；最高時改在日期列「整趟」左邊', async ({ page }) => {
  await ready(page);
  await goTab(page, 'trip');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('mid'));
  const btn = page.getByTestId('m-guide-button');
  await expect(btn).toHaveCount(1);
  const full = (await page.getByTestId('m-trip-full').boundingBox())!;
  const b = (await btn.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(full.x);
  expect(Math.abs(b.y + b.height / 2 - (full.y + full.height / 2))).toBeLessThan(4);
  expect(b.height).toBeGreaterThanOrEqual(44);

  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('low'));
  await expect(page.getByTestId('m-trip-full')).toHaveCount(0);
  await expect(btn).toBeVisible();
  const sheet = (await page.getByTestId('m-sheet').boundingBox())!;
  expect((await btn.boundingBox())!.y + 30).toBeLessThan(sheet.y);

  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  await expect(btn).toHaveCount(1);
  // 面板有拉高的動畫：等日期列和入口停在同一列
  await expect
    .poll(async () => {
      const g = (await btn.boundingBox())!;
      const a = (await page.getByTestId('m-day-all').boundingBox())!;
      return Math.abs(g.y + g.height / 2 - (a.y + a.height / 2));
    })
    .toBeLessThan(4);
  const c = (await btn.boundingBox())!;
  const all = (await page.getByTestId('m-day-all').boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(all.x + 1);
  const high = (await page.getByTestId('m-sheet').boundingBox())!;
  expect(c.y).toBeGreaterThan(high.y - 1);
  expect(await scrollsSideways(page)).toBe(false);
});

test('彈窗（只有航班）：0/4；去整趟回到整趟、面板拉到中間；去探索換到探索分頁', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  await page.getByRole('button', { name: '重設成只有航班的行程' }).click();
  await goTab(page, 'trip');
  await page.getByTestId('m-day-2027-02-05').click();
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('low'));
  await page.getByTestId('m-guide-button').click();
  await expect(page.getByTestId('guide-count')).toHaveText('0 / 4');
  await page.getByTestId('guide-trip').click();
  await expect(page.getByTestId('guide-dialog')).toHaveCount(0);
  await expect(page.getByTestId('m-day-all')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
  await expect(page.getByTestId('sk-row')).toHaveCount(12);

  await page.getByTestId('m-guide-button').click();
  await page.getByTestId('guide-explore').click();
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', /page|true/);
  expect(await scrollsSideways(page)).toBe(false);
});
