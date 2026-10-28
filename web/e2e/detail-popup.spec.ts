// 詳情一律是彈窗（interaction-design 第八輪 §13.3，網頁）：開在你剛剛看的那一塊旁邊，不蓋住它。
// 從右欄的卡開＝蓋在地圖右側、貼著右欄；從地圖上的點開＝蓋住整個右欄；同時只有一個，開著時原地換內容、「‹」一路退回；
// ✕、Esc、點地圖空白處關掉，右欄原樣回來；位置分頁的「附近」點一列＝地圖上那個點跳，彈窗不動。
import { test, type Page } from '@playwright/test';
import { centerOn, expect, findPlaceId, ready, waitIdle } from './helpers.ts';

const th = (page: Page, expr: string) => page.evaluate((e) => new Function(`return ${e}`)(), expr);
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const popup = (page: Page) => page.getByTestId('detail-float');

/** 點地圖上的一個點（先移過去）；leftOfPopup：彈窗蓋在地圖右側時，把點移到地圖左邊沒被蓋住的地方 */
async function clickOnMap(page: Page, id: string, zoom = 15, leftOfPopup = false) {
  let pt = await centerOn(page, id, zoom);
  if (leftOfPopup) {
    await page.evaluate(() => (window as any).__th.map.panBy([200, 0], { animate: false }));
    await waitIdle(page);
    pt = { x: pt.x - 200, y: pt.y };
  }
  await page.mouse.click(pt.x, pt.y);
}

/** 點地圖上沒有東西的地方（左上角附近） */
async function clickBlankMap(page: Page) {
  const m = await box(page, '.map-column');
  await page.mouse.click(m.x + 30, m.y + 30);
}

test('從右欄的卡開：彈窗蓋在地圖右側、貼著右欄（380 寬），右欄不動、展開的卡還在', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const id = (await page.locator('[data-testid="explore-item"][data-rank="1"]').getAttribute('data-id'))!;
  const card = page.locator(`[data-testid="explore-item"][data-id="${id}"]`);
  await card.click();
  await card.getByTestId('place-open-detail').click();
  await expect(popup(page)).toHaveAttribute('data-at', 'map');
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', id);
  const p = (await popup(page).boundingBox())!;
  const map = await box(page, '.map-column');
  expect(Math.round(p.width)).toBe(380);
  // 貼著右欄：右邊留 12px，上下各 12px
  expect(Math.round(map.x + map.width - (p.x + p.width))).toBe(12);
  expect(Math.round(p.y - map.y)).toBe(12);
  // 右欄照舊：探索清單、展開的卡都還在，沒有變淡
  await expect(card.getByTestId('place-open')).toBeVisible();
  await expect(page.locator('.side-panel')).not.toHaveClass(/covered/);
});

test('從地圖上的點開：彈窗蓋住整個右欄（四周留 8px），不捲到卡片；✕ 關掉後右欄原樣回來', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const spot = await findPlaceId(page, 'spot', 'S');
  await clickOnMap(page, spot);
  await expect(popup(page)).toHaveAttribute('data-at', 'side');
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', spot);
  const p = (await popup(page).boundingBox())!;
  const side = await box(page, '.side-column');
  // 右欄左邊有 1px 的線
  expect(Math.abs(p.x - side.x - 8)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(side.x + side.width - (p.x + p.width) - 8)).toBeLessThanOrEqual(1.5);
  // 地圖完全不被擋：選中的水滴在地圖上
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', spot);
  await expect(page.locator('.side-panel')).toHaveClass(/covered/);
  // 底下的探索清單一直掛著；關掉後回來
  await expect(page.getByTestId('explore-panel')).toHaveCount(1);
  await page.getByTestId('detail-close').click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator('.side-panel')).not.toHaveClass(/covered/);
  await expect(page.getByTestId('explore-panel')).toBeVisible();
});

test('同時只有一個彈窗：開著時點地圖上別的點＝原地換內容（位置不變），「‹ 上一個的名字」一路退回', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const a = 'toba-aquarium';
  const b = 'ise-naiku';
  const c = 'ise-geku';
  await clickOnMap(page, a);
  await expect(popup(page)).toHaveAttribute('data-at', 'side');
  await expect(page.getByTestId('detail-back')).toHaveCount(0);
  await clickOnMap(page, b);
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', b);
  await expect(popup(page)).toHaveAttribute('data-at', 'side');
  await clickOnMap(page, c);
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', c);
  await expect(popup(page)).toHaveCount(1);
  // 「‹ 內宮」、再「‹ 鳥羽水族館」
  const name = (id: string) => th(page, `(() => { const p = __th.dataStore.getState().byId.get('${id}'); return p.name.zh || p.name.ja; })()`);
  await expect(page.getByTestId('detail-back')).toContainText((await name(b)) as string);
  await page.getByTestId('detail-back').click();
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', b);
  await expect(page.getByTestId('detail-back')).toContainText((await name(a)) as string);
  await page.getByTestId('detail-back').click();
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', a);
  await expect(page.getByTestId('detail-back')).toHaveCount(0);
  // 從右欄的卡開的彈窗也一樣：點地圖上的點只換內容，不會跳到右欄
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  const id = (await page.locator('[data-testid="explore-item"][data-rank="1"]').getAttribute('data-id'))!;
  const card = page.locator(`[data-testid="explore-item"][data-id="${id}"]`);
  await card.click();
  await card.getByTestId('place-open-detail').click();
  await expect(popup(page)).toHaveAttribute('data-at', 'map');
  await clickOnMap(page, a, 15, true);
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', a);
  await expect(popup(page)).toHaveAttribute('data-at', 'map');
});

test('關掉：Esc、點地圖空白處；展開的卡、選中都不動', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const id = (await page.locator('[data-testid="explore-item"][data-rank="1"]').getAttribute('data-id'))!;
  const card = page.locator(`[data-testid="explore-item"][data-id="${id}"]`);
  await card.click();
  await card.getByTestId('place-open-detail').click();
  await expect(popup(page)).toBeVisible();
  await waitIdle(page);
  await clickBlankMap(page);
  await expect(popup(page)).toHaveCount(0);
  await expect(card.getByTestId('place-open')).toBeVisible();
  expect(await th(page, '__th.appStore.getState().selectedId')).toBe(id);
  await card.getByTestId('place-open-detail').click();
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(card.getByTestId('place-open')).toBeVisible();
});

test('位置分頁的附近：點一列＝地圖上那個點變成水滴，原本的點保持水滴、彈窗不動；「詳情 ›」換成它', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const a = 'ise-naiku';
  await clickOnMap(page, a);
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', a);
  await page.getByTestId('detail-tab-location').click();
  const row = page.getByTestId('nearby-item').first();
  await row.click();
  const near = (await th(page, '__th.appStore.getState().selectedId')) as string;
  expect(near).not.toBe(a);
  // 彈窗不動、內容不換；地圖：附近那個點是選中的水滴，原本的點是不跳的水滴
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', a);
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', near);
  await expect(page.getByTestId('map-detail-drop')).toHaveAttribute('data-id', a);
  // 列尾「詳情 ›」：原地換成它，「‹」回到原本的
  await page.getByTestId('nearby-detail').first().click();
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', near);
  await expect(popup(page)).toHaveAttribute('data-at', 'side');
  await expect(page.getByTestId('map-detail-drop')).toHaveCount(0);
  await page.getByTestId('detail-back').click();
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-id', a);
});

test('行程分頁：點這天行程裡的點照舊展開時間軸的卡（不開彈窗）；不在這天的點開彈窗蓋右欄；編輯中也能蓋，關掉後還在編輯', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-03'));
  await page.getByTestId('side-tab-day').click();
  await waitIdle(page);
  const inDay = (await page.getByTestId('timeline').locator('[data-testid="tl-row"]').nth(1).getAttribute('data-place'))!;
  await clickOnMap(page, inDay, 14);
  await expect(page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${inDay}"] [data-testid="trip-card"]`).first()).toHaveAttribute('aria-expanded', 'true');
  await expect(popup(page)).toHaveCount(0);
  // 編輯中、不在這天的點
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  await clickOnMap(page, 'toba-aquarium');
  await expect(popup(page)).toHaveAttribute('data-at', 'side');
  await page.getByTestId('detail-close').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  expect(await th(page, '__th.appStore.getState().planning')).toBe(true);
});
