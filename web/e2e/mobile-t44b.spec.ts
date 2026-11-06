// T44b：卡片標章、詳情重整（手機）。截圖存到 SHOTS_DIR（沒設就不存）。
import { test, expect } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = (name: string, w: number) => (process.env.SHOTS_DIR ? { path: `${process.env.SHOTS_DIR}/${name}-${w}.png` } : {});

// T82 起四格改四列（主詞｜結論｜理由）
test('手機詳情：「適合我們嗎」四列放得下、更多收起來', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const w = page.viewportSize()!.width;
  await page.screenshot(shot('t44b-m-explore', w));
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-aquarium', 'explore'));
  const fit = page.getByTestId('detail-fit');
  await expect(fit).toBeVisible();
  // 四列由上往下、沒有超出畫面
  const box = (await fit.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(w);
  const rows = fit.locator('.pd-fit-row');
  await expect(rows).toHaveCount(4);
  const tops = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect(new Set(tops).size).toBe(4);
  for (const r of await rows.all()) {
    const b = (await r.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(w);
  }
  await expect(page.getByTestId('detail-quick')).toContainText('這團約');
  await fit.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot(shot('t44b-m-detail', w));
  await page.getByTestId('detail-more-toggle').click();
  await expect(page.getByTestId('detail-more')).toContainText('優缺點');
});
