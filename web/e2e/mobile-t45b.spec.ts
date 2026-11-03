// T45b（手機）：整趟的直的骨架、選這晚住哪一區、日期列的地區色線、單天頂端；沒有橫向捲動。
// 有 T45B_SHOTS（資料夾）時順便拍截圖給 👤 看。
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';
import { scrollsSideways } from './mobileHelpers.ts';

const SHOTS = process.env.T45B_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}.png` });
};

test('手機整趟：骨架一天一列、點了進那天；選區、單天頂端；日期列有色線', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => {
      const nights = { ...it.nights };
      delete nights['2027-02-07'];
      delete nights['2027-02-08'];
      return { ...it, nights };
    }, 'test');
  });
  await page.getByTestId('m-day-all').click();
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  const rows = page.getByTestId('sk-row');
  await expect(rows).toHaveCount(12);
  await expect(page.getByTestId('m-day-2027-02-02').getByTestId('day-area-line')).toHaveAttribute('data-area', 'shima');
  await expect(page.getByTestId('m-day-2027-02-07').getByTestId('day-area-line')).toHaveClass(/undecided/);
  await shot(page, 't45b-m-trip');
  expect(await scrollsSideways(page)).toBe(false);
  // 選區
  const row = page.locator('[data-testid="sk-row"][data-date="2027-02-07"]');
  await row.getByTestId('sk-stay').click();
  await row.locator('[data-testid="area-pick"][data-area="futami"]').scrollIntoViewIfNeeded();
  await shot(page, 't45b-m-picker');
  expect(await scrollsSideways(page)).toBe(false);
  await row.locator('[data-testid="area-pick"][data-area="futami"]').click();
  await expect(row.getByTestId('sk-stay')).toHaveText('二見・還沒選住宿');
  // 點一列進那天：頂端寫區・第幾晚
  await page.locator('[data-testid="sk-row"][data-date="2027-02-03"]').getByTestId('sk-day').click();
  await expect(page.getByTestId('m-day-2027-02-03')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('m-trip-title')).toContainText('2/3週三 · 志摩');
  await expect(page.getByTestId('night-line')).toHaveText(/^志摩・第 2 晚／3/);
  await shot(page, 't45b-m-day');
  // 還沒決定的晚上：先問
  await page.getByTestId('m-day-2027-02-08').click();
  await expect(page.getByTestId('night-ask')).toBeVisible();
  await shot(page, 't45b-m-day-ask');
  expect(await scrollsSideways(page)).toBe(false);
});
