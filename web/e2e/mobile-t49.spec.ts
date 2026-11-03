// T49 小修（手機）：日期列可以橫捲到 2/13、「排行程」固定在地圖右上（面板拉到最高時被蓋住、不搬家）、整趟的標題列、
// 點地區鈕回到那一層的第一頁、子地區列只橫滑。SHOT_DIR 有設時存截圖。

import { test, type Page } from '@playwright/test';
import { expect, goTab, ready, scrollsSideways } from './mobileHelpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}-${page.viewportSize()!.width}.png` });
};
const setSnap = (page: Page, snap: 'low' | 'mid' | 'high') => page.evaluate((s) => (window as any).__thMobile.getState().setSnap(s), snap);

test('日期列可以橫捲到 2/13；點了換天', async ({ page }) => {
  await ready(page);
  await goTab(page, 'trip');
  const strip = page.locator('.ui-days.sheet');
  const vw = page.viewportSize()!.width;
  const size = await strip.evaluate((el) => ({ cw: el.clientWidth, sw: el.scrollWidth }));
  expect(size.cw).toBeLessThanOrEqual(vw);
  expect(size.sw).toBeGreaterThan(size.cw);
  await strip.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const last = page.getByTestId('m-day-2027-02-13');
  const box = (await last.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
  await last.click();
  await expect(last).toHaveAttribute('aria-current', 'true');
  expect(await scrollsSideways(page)).toBe(false);
});

test('排行程：一直在地圖右上，面板低、中、最高都不搬家；面板拉到最高時在面板底下；日期列那一列沒有它', async ({ page }) => {
  await ready(page);
  await goTab(page, 'trip');
  const btn = page.getByTestId('m-guide-button');
  const vw = page.viewportSize()!.width;
  await setSnap(page, 'mid');
  await expect(btn).toHaveCount(1);
  const mid = (await btn.boundingBox())!;
  expect(mid.y).toBeLessThan(20);
  expect(vw - (mid.x + mid.width)).toBeLessThan(16);
  expect(mid.height).toBeGreaterThanOrEqual(44);
  // 「放大地圖」照舊在右下
  const full = (await page.getByTestId('m-trip-full').boundingBox())!;
  expect(full.y).toBeGreaterThan(mid.y + 100);
  await shot(page, 'mobile-t49-guide-mid');

  for (const snap of ['low', 'high'] as const) {
    await setSnap(page, snap);
    await expect(btn).toHaveCount(1);
    const b = (await btn.boundingBox())!;
    expect(Math.abs(b.x - mid.x) + Math.abs(b.y - mid.y)).toBeLessThan(1);
  }
  // 最高：面板在它上面（同一個位置點下去是面板，不是入口）
  await expect.poll(async () => (await page.getByTestId('m-sheet').boundingBox())!.y).toBeLessThan(mid.y + mid.height);
  const covered = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="m-guide-button"]')!.getBoundingClientRect();
    const sheet = document.querySelector('[data-testid="m-sheet"]')!;
    const hit = document.elementFromPoint(b.left + b.width / 2, b.bottom - 1);
    return !!hit && sheet.contains(hit);
  });
  expect(covered).toBe(true);
  await expect(page.getByTestId('m-sheet').getByTestId('m-guide-button')).toHaveCount(0);
  await shot(page, 'mobile-t49-guide-high');
});

test('整趟的標題列：大字「整趟」、右邊問 AI 和討論同一列，上面離日期列 12px；晚數在下面一行（T54）', async ({ page }) => {
  await ready(page);
  await goTab(page, 'trip');
  await setSnap(page, 'mid');
  await page.getByTestId('m-day-all').click();
  const title = page.getByTestId('m-overview-title');
  await expect(title).toContainText('整趟');
  await expect(title.getByTestId('sk-count')).toHaveCount(0);
  await expect(page.getByTestId('sk-count')).toContainText('晚');
  await expect(page.getByTestId('trip-skeleton').locator('.ui-sk-head')).toHaveCount(0);
  const t = (await title.boundingBox())!;
  const ask = (await page.getByTestId('trip-ask-ai').boundingBox())!;
  expect(ask.x).toBeGreaterThan(t.x + 60);
  expect(Math.abs(ask.y + ask.height / 2 - (t.y + t.height / 2))).toBeLessThan(8);
  const gap = await page.evaluate(() => {
    const strip = document.querySelector('.ui-days.sheet')!.getBoundingClientRect();
    const head = document.querySelector('.m-overview-head')!.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.m-overview-head')!).paddingTop);
    return { top: head.top - strip.bottom, pad };
  });
  expect(gap.top).toBeGreaterThanOrEqual(0);
  expect(gap.pad).toBe(12);
  expect(await scrollsSideways(page)).toBe(false);
  await shot(page, 'mobile-t49-overview');
});

test('探索、想去：書架「全部 ›」後點概覽回概覽、點別區到那區的書架；子地區列只橫滑', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const feed = () => page.evaluate(() => {
    const f = (window as any).__thMobile.getState().feed;
    return { area: f.area, type: f.type, quick: f.quick, query: f.query };
  });
  await page.getByTestId('m-feed-area-toba').click();
  await page.locator('[data-shelf="fit15"]').getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  await page.getByTestId('m-feed-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  expect(await feed()).toEqual({ area: null, type: 'all', quick: [], query: '' });

  await page.getByTestId('m-feed-area-toba').click();
  await page.locator('[data-shelf="fit15"]').getByTestId('shelf-all').click();
  await page.getByTestId('m-feed-area-ise').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'ise');
  expect(await feed()).toEqual({ area: 'ise', type: 'all', quick: [], query: '' });

  // 子地區列：手指只橫滑
  const regions = page.getByTestId('region-chips');
  expect(await regions.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.overflowY, cs.touchAction, cs.overscrollBehaviorX];
  })).toEqual(['hidden', 'pan-x', 'contain']);
  // 手機不畫 ‹ › 箭頭
  await expect(page.getByTestId('m-feed-filters-next')).toBeHidden();

  // 想去：條件、搜尋清掉
  await goTab(page, 'wish');
  await page.evaluate(() => (window as any).__thMobile.getState().setWish({ type: 'spot', quick: ['tiers:S'], query: '神' }));
  await page.getByTestId('m-wish-area-toba').click();
  const wish = await page.evaluate(() => {
    const w = (window as any).__thMobile.getState().wish;
    return { area: w.area, type: w.type, quick: w.quick, query: w.query };
  });
  expect(wish).toEqual({ area: 'toba', type: 'all', quick: [], query: '' });
});
