// 自己加地點（T31、T33）網頁：搜尋比不到時「＋ 自己加」帶進彈窗（連結自動查，地址按「找位置」）→ 第二步 → 存；地圖右鍵；彈窗開著時點地圖上的點不開詳情。常駐按鈕的入口在 t33.spec.ts。
// 假後端把資料存在 localStorage，Playwright 每個測試是全新的瀏覽器環境，不用另外清。
import { test, type Page } from '@playwright/test';
import { centerOn, expect, findPlaceId, ready, waitIdle } from './helpers.ts';

const MAP_LINK = 'https://www.google.com/maps/place/%E7%8F%88%E7%90%B2+%E7%81%AF%E5%8F%B0%E8%88%8E/@34.48,136.84,17z/data=!3d34.4815!4d136.8431';

async function search(page: Page, text: string) {
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('search').fill(text);
}

/** 存完之後到探索那區、那類的清單裡找自己加的卡（T42 起沒有條件時是概覽、書架，不是清單） */
async function expectUserCard(page: Page) {
  await expect(page.getByTestId('add-form')).toHaveCount(0);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('search').fill('');
  // 自己加的點排在清單後面，分批畫（T32）還沒畫到：先帶到那張卡
  await page.evaluate(() => {
    const th = (window as any).__th;
    const mine = th.dataStore.getState().places.find((p: any) => p.origin === 'user');
    th.appStore.getState().setFilter({ areas: mine.area ? [mine.area] : [], regions: [], types: [mine.type] });
    th.appStore.getState().revealInExplore(mine.id);
  });
  await expect(page.locator('.is-user').first()).toBeVisible();
}

test('貼 Google Maps 連結 → 名稱預填 → 選餐廳 → 儲存 → 清單有虛線卡、詳情有提示框', async ({ page }) => {
  await ready(page);
  await search(page, MAP_LINK);
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('add-form')).toBeVisible();
  await expect(page.getByTestId('add-name')).toHaveValue('珈琲 灯台舎');
  await expect(page.getByTestId('add-via')).toHaveText('從 Google Maps 連結');
  await expect(page.getByTestId('add-map')).toBeVisible();
  await expect(page.getByTestId('add-pin')).toBeVisible();
  await expect(page.getByTestId('add-save')).toBeDisabled();
  await page.getByTestId('add-type-restaurant').click();
  await expect(page.getByTestId('add-save')).toBeEnabled();
  await page.getByTestId('add-save').click();
  await expectUserCard(page);
  await expect(page.getByTestId('add-dialog')).toHaveCount(0);
  await page.locator('.is-user').first().click();
  await page.getByTestId('place-open-detail').click();
  await expect(page.getByTestId('detail-user-warning')).toBeVisible();
});

test('打地址 → 假的地址查詢回座標 → 加進來', async ({ page }) => {
  await page.route('https://msearch.gsi.go.jp/**', (route) =>
    route.fulfill({ json: [{ geometry: { type: 'Point', coordinates: [136.8431, 34.4815] }, properties: { title: '三重県鳥羽市鳥羽１丁目' } }] }),
  );
  await ready(page);
  await search(page, '三重県鳥羽市鳥羽1丁目');
  await page.getByTestId('add-suggest-add').click();
  // 打的字帶進第一步；地址要按「找位置」
  await expect(page.getByTestId('add-entry-input')).toHaveValue('三重県鳥羽市鳥羽1丁目');
  await page.getByTestId('add-entry-find').click();
  await expect(page.getByTestId('add-via')).toHaveText('從地址');
  await page.getByTestId('add-name').fill('朋友的民宿');
  await page.getByTestId('add-type-lodging').click();
  await page.getByTestId('add-save').click();
  await expectUserCard(page);
});

test('地圖右鍵 → 在這裡加地點 → 名稱空白、不能存 → 填名稱、選景點 → 存', async ({ page }) => {
  await ready(page);
  const box = (await page.getByTestId('map').boundingBox())!;
  // 左上角是日期晶片，點下面一點
  await page.mouse.click(box.x + 40, box.y + 160, { button: 'right' });
  await page.getByTestId('map-context-add').click();
  await expect(page.getByTestId('add-form')).toBeVisible();
  await expect(page.getByTestId('add-name')).toHaveValue('');
  await expect(page.getByTestId('add-save')).toBeDisabled();
  await page.getByTestId('add-name').fill('路邊的小神社');
  await page.getByTestId('add-type-spot').click();
  await page.getByTestId('add-save').click();
  await expectUserCard(page);
});

test('彈窗開著：主地圖右鍵不出選單（圖釘在彈窗的小地圖上）', async ({ page }) => {
  await ready(page);
  const box = (await page.getByTestId('map').boundingBox())!;
  await page.mouse.click(box.x + 60, box.y + 160, { button: 'right' });
  await page.getByTestId('map-context-add').click();
  await expect(page.getByTestId('add-form')).toBeVisible();
  await waitIdle(page);
  // 彈窗在地圖中間，左邊留白的地方還點得到主地圖
  await page.mouse.click(box.x + 60, box.y + 200, { button: 'right' });
  await page.waitForTimeout(200);
  await expect(page.getByTestId('map-context')).toHaveCount(0);
  await expect(page.getByTestId('add-form')).toBeVisible();
});

test('彈窗開著：點地圖上的資料點不開詳情、不選中、不出小卡片', async ({ page }) => {
  await ready(page);
  const id = await findPlaceId(page, 'spot', 'B');
  const pt = await centerOn(page, id, 15);
  await page.mouse.click(pt.x + 150, pt.y + 150, { button: 'right' });
  await page.getByTestId('map-context-add').click();
  await expect(page.getByTestId('add-form')).toBeVisible();
  await waitIdle(page);
  // 彈窗蓋住地圖中間：把資料點移到彈窗左邊留白的地方再點
  const pt1 = await centerOn(page, id, 15);
  const left = (await page.getByTestId('map').boundingBox())!.x;
  const dialogLeft = (await page.getByTestId('add-dialog').boundingBox())!.x;
  const dx = pt1.x - (left + dialogLeft) / 2;
  await page.evaluate((dx) => (window as any).__th.map.panBy([dx, 0], { animate: false }), dx);
  await waitIdle(page);
  const pt2 = { x: pt1.x - dx, y: pt1.y };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'), pt2)).toBe(true);
  const snap = () =>
    page.evaluate(() => {
      const a = (window as any).__th.appStore.getState();
      return { detailId: a.detailId, selectedId: a.selectedId, previewId: a.previewId };
    });
  const before = await snap();
  await page.mouse.click(pt2.x, pt2.y);
  await expect(page.getByTestId('detail-float')).toHaveCount(0);
  expect(await snap()).toEqual(before);
  await expect(page.getByTestId('add-form')).toBeVisible();
});
