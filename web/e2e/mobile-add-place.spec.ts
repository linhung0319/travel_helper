// 自己加地點（T31）手機：探索搜尋框貼連結 → 整頁確認畫面（小地圖、中央圖釘）→ 存 → 探索清單有 .is-user；
// 詳情只有加的人看得到刪除；修改名稱；長按地圖加點。假後端存在 localStorage，每個測試是全新的環境。
import { test, type Page } from '@playwright/test';
import { expect, goTab, ready } from './mobileHelpers.ts';

const MAP_LINK = 'https://www.google.com/maps/place/%E7%8F%88%E7%90%B2+%E7%81%AF%E5%8F%B0%E8%88%8E/@34.48,136.84,17z/data=!3d34.4815!4d136.8431';

/** 探索貼連結 → 加這個地點 → 選類型 → 儲存；回到探索清單，清掉搜尋 */
async function addFromLink(page: Page) {
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-search').fill(MAP_LINK);
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  await page.getByTestId('add-type-restaurant').click();
  await page.getByTestId('add-save').click();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await findInList(page, '珈琲');
}

/** 清單很長、推薦排序把自己加的排在最後：用搜尋框縮小範圍 */
const findInList = (page: Page, text: string) => page.getByTestId('m-feed-search').fill(text);
const userCard = (page: Page) => page.locator('.is-user').first();

test('貼連結 → 整頁確認（小地圖、圖釘、提示）→ 儲存 → 回探索、清單有自己加的卡', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-search').fill(MAP_LINK);
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  await expect(page.getByTestId('m-add-map')).toBeVisible();
  await expect(page.getByTestId('m-add-pin')).toBeVisible();
  await expect(page.getByText('拖地圖，讓圖釘對準店門口')).toBeVisible();
  await expect(page.getByTestId('add-name')).toHaveValue('珈琲 灯台舎');
  // 主地圖的網頁圖釘不會出現在手機
  await expect(page.getByTestId('map-add-pin')).toHaveCount(0);
  await expect(page.getByTestId('add-save')).toBeDisabled();
  await page.getByTestId('add-type-restaurant').click();
  // 儲存鈕在畫面內（表單區可捲動）
  await page.getByTestId('add-save').scrollIntoViewIfNeeded();
  await page.getByTestId('add-save').click();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  // 還在探索分頁
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  await findInList(page, '珈琲');
  await expect(userCard(page)).toBeVisible();
});

test('拖地圖 → 位置跟著小地圖的中心；返回 ‹ 不存', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-search').fill(MAP_LINK);
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('m-add-map')).toBeVisible();
  await page.waitForFunction(() => (window as any).__thAddMap?.isStyleLoaded());
  await page.evaluate(() => (window as any).__thAddMap.jumpTo({ center: [136.9, 34.5] }));
  await page.waitForFunction(() => {
    const c = (window as any).__th.addPlaceStore?.getState().draft?.coords;
    return c && Math.abs(c[0] - 136.9) < 1e-6 && Math.abs(c[1] - 34.5) < 1e-6;
  });
  await page.getByTestId('m-add-back').click();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await page.getByTestId('m-feed-search').fill('');
  await expect(page.locator('.is-user')).toHaveCount(0);
});

test('詳情：加的人有刪除，換成別人沒有；換回來刪除 → 清單沒有那張卡', async ({ page }) => {
  await ready(page);
  await addFromLink(page);
  await userCard(page).click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await expect(page.getByTestId('detail-user-delete')).toBeVisible();
  await page.getByTestId('m-detail-back').click();

  // 換成別人（我分頁的開發用切換）
  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  const mine = await page.locator('[data-member].on').getAttribute('data-member');
  await page.locator('[data-member]:not(.on)').first().click();
  await goTab(page, 'explore');
  await findInList(page, '珈琲');
  await userCard(page).click();
  await expect(page.getByTestId('detail-user-edit')).toBeVisible();
  await expect(page.getByTestId('detail-user-delete')).toHaveCount(0);
  await page.getByTestId('m-detail-back').click();

  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  await page.locator(`[data-member="${mine}"]`).click();
  await goTab(page, 'explore');
  await findInList(page, '珈琲');
  await userCard(page).click();
  await page.getByTestId('detail-user-delete').click();
  await page.getByTestId('delete-user-place-confirm').click();
  // 刪除成功後詳情自己關掉（DeleteUserPlaceDialog）
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await findInList(page, '珈琲');
  await expect(page.locator('.is-user')).toHaveCount(0);
});

test('詳情 ✎ 修改 → 整頁蓋在詳情上 → 改名稱 → 存 → 回到詳情顯示新名稱', async ({ page }) => {
  await ready(page);
  await addFromLink(page);
  await userCard(page).click();
  await page.getByTestId('detail-user-edit').click();
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  await expect(page.getByTestId('add-name')).toHaveValue('珈琲 灯台舎');
  await expect(page.getByTestId('add-save')).toHaveText('儲存修改');
  await page.getByTestId('add-name').fill('改過的名稱');
  await page.getByTestId('add-save').click();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await expect(page.getByTestId('m-detail')).toContainText('改過的名稱');
});

/** 在行程地圖上按住（Playwright 的 touchscreen 沒有長按，直接送 TouchEvent） */
async function touchHold(page: Page, x: number, y: number, ms: number, moveTo?: { x: number; y: number }) {
  await page.evaluate(
    async ([x, y, ms, mv]) => {
      const el = document.querySelector('[data-testid="map"]')!;
      const mk = (type: string, px: number, py: number) => {
        const t = new Touch({ identifier: 1, target: el, clientX: px, clientY: py });
        const ended = type === 'touchend';
        return new TouchEvent(type, { bubbles: true, cancelable: true, touches: ended ? [] : [t], targetTouches: ended ? [] : [t], changedTouches: [t] });
      };
      el.dispatchEvent(mk('touchstart', x, y));
      if (mv) el.dispatchEvent(mk('touchmove', mv.x, mv.y));
      await new Promise((r) => setTimeout(r, ms));
      el.dispatchEvent(mk('touchend', mv ? mv.x : x, mv ? mv.y : y));
    },
    [x, y, ms, moveTo ?? null] as const,
  );
}

test('行程地圖按住約 0.5 秒 → 開加地點整頁；太短、手指移動超過 10px 不算', async ({ page }) => {
  await ready(page);
  const box = (await page.getByTestId('map').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 80;
  await touchHold(page, x, y, 200);
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await touchHold(page, x, y, 700, { x: x + 30, y });
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await touchHold(page, x, y, 700);
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  await expect(page.getByTestId('add-name')).toHaveValue('');
  await expect(page.getByTestId('add-save')).toBeDisabled();
  await page.getByTestId('add-name').fill('路邊的小神社');
  await page.getByTestId('add-type-spot').click();
  await page.getByTestId('add-save').click();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  // 存完還在行程分頁
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
});

test('返回鍵：從探索開的加地點頁，返回關掉它、留在探索', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-search').fill(MAP_LINK);
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-feed-search')).toBeVisible();
});

const histLen = (page: Page) => page.evaluate(() => history.length);
const onApp = (page: Page) => page.evaluate(() => location.origin !== 'null' && location.href.startsWith('http'));

test('返回鍵：詳情上開 ✎ 修改，返回只關加地點頁、詳情還在；再返回才關詳情，沒有多退', async ({ page }) => {
  await ready(page);
  await addFromLink(page);
  await userCard(page).click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  const origin = await page.evaluate(() => location.origin);
  const len = await histLen(page);
  await page.getByTestId('detail-user-edit').click();
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  expect(await histLen(page)).toBe(len + 1);
  await page.goBack();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await expect(page.getByTestId('m-detail')).toBeVisible();
  // 只退了加地點那一筆：詳情那筆還在（再退一次才關詳情）
  expect(await page.evaluate(() => !!history.state?.thMobileDetail)).toBe(true);
  expect(await page.evaluate(() => location.origin)).toBe(origin);
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  expect(await onApp(page)).toBe(true);
  expect(await page.evaluate(() => location.origin)).toBe(origin);
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
});

test('存好後不多退一步：從探索開的，存好 history 長度回到原樣、返回鍵還在網站上', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  const len = await histLen(page);
  await addFromLink(page); // 開、存好
  await expect.poll(() => page.evaluate(() => !!history.state?.thMobileDetail)).toBe(false);
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  // 存好時那一筆退回去了：再開一次（同一個連結會被當成已經有了，改打找不到的名稱），長度只多一筆
  await page.getByTestId('m-feed-search').fill('不存在的店名xyz');
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('m-add-page')).toBeVisible();
  expect(await histLen(page)).toBeLessThanOrEqual(len + 1);
  await page.goBack();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  expect(await onApp(page)).toBe(true);
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
});

test('存好後不多退一步：從詳情 ✎ 修改存好，返回鍵一次關詳情、還在網站上', async ({ page }) => {
  await ready(page);
  await addFromLink(page);
  await userCard(page).click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await page.getByTestId('detail-user-edit').click();
  await page.getByTestId('add-name').fill('存好後的名稱');
  await page.getByTestId('add-save').click();
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
  await expect(page.getByTestId('m-detail')).toContainText('存好後的名稱');
  // 存好退了加地點那一筆：詳情那筆還在
  expect(await page.evaluate(() => !!history.state?.thMobileDetail)).toBe(true);
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  expect(await onApp(page)).toBe(true);
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
});

test('第二根手指放上去 → 取消按住', async ({ page }) => {
  await ready(page);
  const box = (await page.getByTestId('map').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 80;
  await page.evaluate(
    async ([x, y]) => {
      const el = document.querySelector('[data-testid="map"]')!;
      const t1 = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const t2 = new Touch({ identifier: 2, target: el, clientX: x + 60, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t1], targetTouches: [t1], changedTouches: [t1] }));
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t1, t2], targetTouches: [t1, t2], changedTouches: [t2] }));
      await new Promise((r) => setTimeout(r, 700));
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t1, t2] }));
    },
    [x, y] as const,
  );
  await expect(page.getByTestId('m-add-page')).toHaveCount(0);
});
