// T32 載入和效率（手機）：探索的照片快進畫面才載，卡片用小尺寸的網址。
import { test } from '@playwright/test';
import { expect, goTab, ready } from './mobileHelpers.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

test('探索：照片快進畫面才載，不會把楽天、Google 的原圖載下來', async ({ page }) => {
  const requested: string[] = [];
  await page.route(/^https:\/\/(?!tiles\.|fonts\.|routing\.).*\.(jpe?g|png|webp|gif)|googleusercontent\.com/i, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await ready(page);
  await goTab(page, 'explore');
  await expect(page.getByTestId('m-feed-item').first()).toBeVisible();
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const withSrc = await page.locator('[data-testid="m-feed-item"] img[src]').count();
  const without = await page.locator('[data-testid="m-feed-item"] img:not([src])').count();
  expect(without).toBeGreaterThan(withSrc);
  expect(requested.filter((u) => /img\.travel\.rakuten\.co\.jp\/share\/HOTEL\/(\d+)\/\1\.jpg$/.test(u))).toEqual([]);
  // 卡片 =w500、行程的小圖 =w200 左右，都不會超過 500
  expect(requested.filter((u) => /googleusercontent/.test(u) && !(Number(/=w(\d+)$/.exec(u)?.[1]) <= 500))).toEqual([]);
});
