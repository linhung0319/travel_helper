// T46 引導彈窗（interaction-design §17.1）網頁版：入口在地圖右上、三個分頁都看得到；縮放鈕在右下；四步的按鈕帶到那一層。
import { test, type Page } from '@playwright/test';
import { expect, ready } from './helpers.ts';

async function flightsOnly(page: Page) {
  await ready(page);
  await page.getByTestId('account-menu').click();
  await page.getByRole('button', { name: '重設成只有航班的行程' }).click();
  await expect(page.getByTestId('account-popover')).toHaveCount(0);
}

test('入口：地圖右上、三個分頁都在；縮放鈕在右下；和日期晶片不重疊', async ({ page }) => {
  await ready(page);
  const btn = page.getByTestId('guide-button');
  const map = (await page.locator('.map-column').boundingBox())!;
  for (const tab of ['side-tab-explore', 'side-tab-wish', 'side-tab-day']) {
    await page.getByTestId(tab).click();
    await expect(btn).toBeVisible();
    const b = (await btn.boundingBox())!;
    expect(map.x + map.width - (b.x + b.width)).toBeLessThan(24);
    expect(b.y - map.y).toBeLessThan(24);
  }
  const zoom = (await page.locator('.maplibregl-ctrl-zoom-in').boundingBox())!;
  expect(zoom.y).toBeGreaterThan(map.y + map.height / 2);
  // 行程分頁有日期晶片：不能蓋到
  const days = (await page.locator('.map-days').boundingBox())!;
  const b = (await btn.boundingBox())!;
  expect(days.x + days.width <= b.x || days.y + days.height <= b.y).toBe(true);
});

test('只有航班：0/4，第 ① 步是實心按鈕；去探索、去整趟帶到那一層', async ({ page }) => {
  await flightsOnly(page);
  await page.getByTestId('side-tab-wish').click();
  await page.getByTestId('guide-button').click();
  const dialog = page.getByTestId('guide-dialog');
  await expect(dialog).toBeVisible();
  for (const n of [1, 2, 3, 4]) await expect(page.getByTestId(`guide-step-${n}`)).toHaveAttribute('data-done', 'false');
  await expect(page.getByTestId('guide-explore')).toHaveClass(/ui-btn-primary/);
  await expect(page.getByTestId('guide-trip')).toHaveClass(/ui-btn-secondary/);
  await page.getByTestId('guide-explore').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('side-tab-explore')).toHaveAttribute('aria-selected', 'true');

  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-05'));
  await page.getByTestId('guide-button').click();
  await page.getByTestId('guide-trip').click();
  await expect(page.getByTestId('side-tab-day')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('m-day-all')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('sk-row')).toHaveCount(12);
});

test('第 ④ 步問 AI：不帶晶片，第一張是第一個還沒排的天', async ({ page }) => {
  await ready(page);
  await page.getByTestId('guide-button').click();
  await page.getByTestId('guide-ask-day').click();
  await expect(page.getByTestId('chat-context')).toHaveCount(0);
  await expect(page.locator('[data-testid="chat-starter"][data-first="true"]')).toContainText('2/7 去哪？');
});
