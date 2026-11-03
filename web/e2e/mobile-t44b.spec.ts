// T44b：卡片標章、詳情重整（手機）。截圖存到 SHOTS_DIR（沒設就不存）。
import { test, expect } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = (name: string, w: number) => (process.env.SHOTS_DIR ? { path: `${process.env.SHOTS_DIR}/${name}-${w}.png` } : {});

test('手機詳情：四格放得下、更多收起來', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const w = page.viewportSize()!.width;
  await page.screenshot(shot('t44b-m-explore', w));
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-aquarium', 'explore'));
  const fit = page.getByTestId('detail-fit');
  await expect(fit).toBeVisible();
  // 四格在同一列、沒有超出畫面
  const box = (await fit.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(w);
  const cells = await page.locator('.pd-fit-cell').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(cells).size).toBe(1);
  await expect(page.getByTestId('detail-quick')).toContainText('這團約');
  await fit.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot(shot('t44b-m-detail', w));
  await page.getByTestId('detail-more-toggle').click();
  await expect(page.getByTestId('detail-more')).toContainText('優缺點');
});
