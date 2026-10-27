// 平板（interaction-design §1「平板」、§13.1）：iPad 直拿是手機版、橫拿是網頁版（DESKTOP_QUERY 1100px），
// 網頁版三欄固定寬度（右欄四種內容一樣寬、照片撐不開），轉向時開著的詳情、展開的行程卡、AI 對話不能不見。
// 跑在 desktop project（檔名不是 mobile*），尺寸、觸控在這裡自己設。
import { test, type Page } from '@playwright/test';
import { expect, ready } from './helpers.ts';

const PORTRAIT = { width: 820, height: 1180 }; // iPad Air 直拿
const LANDSCAPE = { width: 1180, height: 820 }; // iPad Air 橫拿
const DAY = '2027-02-03';

test.use({ viewport: LANDSCAPE, hasTouch: true });

/** 三欄的寬度（四捨五入到整數） */
const widths = (page: Page) =>
  page.evaluate(() => {
    const w = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().width);
    return { ai: w('.chat-column'), map: w('.map-column'), side: w('.side-column') };
  });

const store = (page: Page, expr: string) => page.evaluate((e) => new Function(`return ${e}`)(), expr);

test('iPad 直拿是手機版、橫拿是網頁版', async ({ page }) => {
  await page.setViewportSize(PORTRAIT);
  await ready(page);
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  await page.setViewportSize(LANDSCAPE);
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
});

test('三欄固定寬度：1100～1279 是 260／剩下／360，1280 以上是 300／剩下／400，切分頁不變', async ({ page }) => {
  await ready(page);
  for (const [size, ai, side] of [
    [LANDSCAPE, 260, 360],
    [{ width: 1366, height: 820 }, 300, 400],
  ] as const) {
    await page.setViewportSize(size);
    for (const tab of ['explore', 'wish', 'day'] as const) {
      await page.getByTestId(`side-tab-${tab}`).click();
      await page.waitForTimeout(300);
      const w = await widths(page);
      expect(w, `${size.width} 寬、${tab}`).toEqual({ ai, side, map: size.width - ai - side });
    }
  }
});

test('轉向：開著的詳情帶到另一個版面', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const id = (await store(page, `__th.dataStore.getState().places.find((p) => p.type === 'spot' && p.tier === 'S').id`)) as string;
  await page.evaluate((id) => (window as any).__th.appStore.getState().openDetail(id, 'explore'), id);
  await expect(page.getByTestId('detail-panel')).toBeVisible();

  await page.setViewportSize(PORTRAIT);
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', id);
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');

  await page.setViewportSize(LANDSCAPE);
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  expect(await store(page, '__th.appStore.getState().detailId')).toBe(id);
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
});

test('轉向：展開的行程卡照樣展開', async ({ page }) => {
  await ready(page);
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  await page.getByTestId('side-tab-day').click();
  const card = page.getByTestId('timeline').getByTestId('trip-card').nth(1);
  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  const key = await card.getAttribute('data-item');

  await page.setViewportSize(PORTRAIT);
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  expect(await store(page, '__thMobile.getState().expanded')).toBe(key);

  await page.setViewportSize(LANDSCAPE);
  await expect(page.getByTestId('timeline').locator(`[data-testid="trip-card"][data-item="${key}"]`)).toHaveAttribute('aria-expanded', 'true');
});

test('轉向：AI 對話不會不見', async ({ page }) => {
  await page.setViewportSize(PORTRAIT);
  await ready(page);
  await page.getByTestId('m-tab-ai').click();
  await page.getByTestId('m-chat-input').fill('鳥羽附近能坐 15 人的午餐？');
  await page.getByTestId('m-chat-send').click();
  const mine = page.getByTestId('m-chat-msg').filter({ hasText: '鳥羽附近能坐 15 人的午餐？' });
  await expect(mine).toHaveCount(1);

  await page.setViewportSize(LANDSCAPE);
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await page.setViewportSize(PORTRAIT);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await expect(mine).toHaveCount(1);
});
