// 手機版（第六輪 §3）：底部 5 個分頁、我、地圖一直掛著。mobile（390×844）、mobile-small（360×800）兩個 project 都跑。
import { test } from '@playwright/test';
import { expect, goTab, mobileState, ready, scrollsSideways, TABS } from './mobileHelpers.ts';

test('底部 5 個分頁，切換', async ({ page }) => {
  await ready(page);
  // 打開網站先看行程
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  for (const t of ['explore', 'wish', 'trip', 'ai', 'me']) {
    await page.getByTestId(`m-tab-${t}`).click();
    await expect(page.getByTestId(`m-tab-${t}`)).toHaveAttribute('aria-current', 'page');
    // 一次只選一個
    await expect(page.locator('[data-testid^="m-tab-"][aria-current="page"]')).toHaveCount(1);
  }
});

test('每個分頁都沒有橫向捲動（360px）', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await ready(page);
  for (const t of TABS) {
    await goTab(page, t);
    expect(await scrollsSideways(page), t).toBe(false);
  }
});

test('分頁的點擊範圍至少 44px', async ({ page }) => {
  await ready(page);
  for (const t of TABS) {
    const box = (await page.getByTestId(`m-tab-${t}`).boundingBox())!;
    expect(box.height, t).toBeGreaterThanOrEqual(44);
  }
});

test('舊的手機版面拿掉了：沒有上方列、拉起面板', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.locator('.top-bar')).toHaveCount(0);
  await expect(page.getByTestId('toolbar-comments')).toHaveCount(0);
});

test('地圖一直掛著：行程看得到，其他分頁藏起來（visibility），切回來還在', async ({ page }) => {
  await ready(page);
  const map = page.getByTestId('map');
  await expect(map).toBeVisible();
  await goTab(page, 'explore');
  await expect(map).toBeHidden();
  // 地圖上的控制項（版權列、縮放）也一起藏
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeHidden();
  await expect(page.locator('.maplibregl-ctrl-zoom-in')).toBeHidden();
  // 沒有卸載：還是同一張地圖、有大小
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.m-map')!).visibility)).toBe('hidden');
  expect(await page.evaluate(() => (window as any).__th.map.getCanvas().clientWidth)).toBeGreaterThan(0);
  await goTab(page, 'trip');
  await expect(map).toBeVisible();
  expect(await page.evaluate(() => !!(window as any).__th.map.getLayer('places-circle'))).toBe(true);
});

test('編輯中底部分頁藏起來', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(false));
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
});

test('想去的分頁顯示數字', async ({ page }) => {
  await ready(page);
  const n = await page.evaluate(() => {
    const votes = (window as any).__th.shared.store.getState().votes as { placeId: string; value: string; deletedAt: string | null }[];
    return new Set(votes.filter((v) => !v.deletedAt && v.value === 'like').map((v) => v.placeId)).size;
  });
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId('m-tab-wish').getByTestId('m-tab-count')).toHaveText(String(n));
});

test('我：討論、預約整頁打開', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  await expect(page.getByTestId('me-button')).toBeVisible();
  await expect(page.getByTestId('m-me-export')).toBeVisible();

  await page.getByTestId('m-me-comments').click();
  const comments = page.getByTestId('m-page-comments');
  await expect(comments).toBeVisible();
  // 整趟的留言，一打開就展開、可以留言
  await expect(comments.locator('.wish-comments')).toBeVisible();
  await expect(comments.getByTestId('comment-input')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await comments.getByTestId('m-page-back').click();
  await expect(comments).toHaveCount(0);

  await page.getByTestId('m-me-reservations').click();
  const res = page.getByTestId('m-page-reservations');
  await expect(res).toBeVisible();
  await expect(res.getByTestId('note-row').first()).toBeVisible();
  await res.getByTestId('m-page-back').click();
  await expect(res).toHaveCount(0);
  expect((await mobileState(page)).page).toBeNull();
});

test('詳情整頁：打開推一筆 history，瀏覽器上一頁關掉', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-aquarium', 'explore'));
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  const s = await mobileState(page);
  expect(s.detail).toBeNull();
  expect(s.tab).toBe('explore');
  // 「‹」也能關
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-aquarium', 'explore'));
  await page.getByTestId('m-detail-back').click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
});
