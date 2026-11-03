// T39（手機）：進網站看探索、地圖還是掛著。
import { expect, test } from '@playwright/test';
import { ready, goTab } from './mobileHelpers.ts';

test('進網站先看探索', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  await goTab(page, 'trip');
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
});
