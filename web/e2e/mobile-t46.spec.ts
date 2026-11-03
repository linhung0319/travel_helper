// T46 引導彈窗（interaction-design §17.1）手機版：去整趟、去探索換分頁。
import { test } from '@playwright/test';
import { expect, goTab, ready, scrollsSideways } from './mobileHelpers.ts';

// 入口的位置（T49 起一直在地圖右上，面板最高時被蓋住）在 mobile-t49.spec.ts 測

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
