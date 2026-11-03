// T44b：卡片標章、詳情重整（網頁）。截圖存到 SHOTS_DIR（沒設就不存）。
import { test, expect } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = (name: string) => (process.env.SHOTS_DIR ? { path: `${process.env.SHOTS_DIR}/${name}.png` } : {});

test('探索的卡：這團的標章，沒有 ★', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const card = page.locator('[data-testid="explore-item"], .pt, .pr').filter({ hasText: '海遊館' }).first();
  await expect(card).toContainText('小孩 ◎');
  await expect(card).toContainText('室內');
  await expect(card).not.toContainText('★');
  await page.screenshot(shot('t44b-web-explore'));
});

test('詳情：評分在名稱下面、四格、一行時間費用、更多收起來', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-aquarium'));
  const d = page.getByTestId('detail-panel');
  await expect(d.getByTestId('detail-stars')).toHaveText('★ 4.4（1.7 萬）');
  await expect(d.getByTestId('detail-fit-elder')).toContainText('◎');
  await expect(d.getByTestId('detail-fit-group')).toContainText('15 人');
  const quick = d.getByTestId('detail-quick');
  await expect(quick).toContainText('每天 09:30–17:00（最後入場 16:00）');
  await expect(quick).toContainText('這團約 37,200 円');
  // 整週的表、團體、優缺點在「更多」裡
  await expect(d.locator('table.hours')).toHaveCount(0);
  await d.getByTestId('detail-fit').scrollIntoViewIfNeeded();
  await page.screenshot(shot('t44b-web-detail'));
  await d.getByTestId('detail-more-toggle').click();
  await expect(d.locator('table.hours')).toBeVisible();
  await expect(d.getByTestId('detail-more')).toContainText('優缺點');
  await expect(d.getByTestId('detail-more')).toContainText('團體');
});
