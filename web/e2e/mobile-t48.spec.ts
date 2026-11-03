// T48（手機）：在 2/5 時收到 2/10～2/11 改住大阪的提議 → 到整趟、骨架畫提議之後的樣子（有變的格子劃掉舊值）。
import { test, expect } from '@playwright/test';
import { ready } from './helpers.ts';

// 有 T48_SHOTS（資料夾）時順便拍截圖
const SHOTS = process.env.T48_SHOTS;
import { scrollsSideways } from './mobileHelpers.ts';

test('手機：在 2/5 收到改區的提議 → 整趟、骨架照提議之後畫', async ({ page }) => {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th.ai);
  await page.getByTestId('m-day-2027-02-05').click();
  const err = await page.evaluate(() =>
    (window as any).__th.ai.proposals.show(
      't48-card',
      ['2027-02-10', '2027-02-11'].map((date) => ({ op: 'setNightArea', date, area: 'osaka' })),
      '2/10～2/11 住大阪',
    ),
  );
  expect(err).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().day)).toBe('all');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  await expect(page.getByTestId('trip-skeleton')).toHaveAttribute('data-view', 'proposal');
  const row = page.locator('[data-testid="sk-row"][data-date="2027-02-10"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByTestId('sk-where')).toHaveText('伊勢 → 大阪');
  await expect(row.getByTestId('sk-old').first()).toHaveText('伊勢');
  await expect(row.getByTestId('sk-stay')).toHaveText('大阪・還沒選住宿');
  await expect(row.getByTestId('sk-stay-changed')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/t48-m-${page.viewportSize()!.width}.png` });
  expect(await scrollsSideways(page)).toBe(false);
});
