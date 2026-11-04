// T42：探索的概覽、地區列、選區後的書架（網頁版，interaction-design §18.1）。
// T63：概覽沒有四格書架，子地區在卡片裡換內容、網頁地圖跟著框（§28）。
// T50：選了一區不放特色、子地區列在篩選列裡、書架的順序和名字、小卡的類型圓章、返回鈕「‹ 一定要去」、切換鈕只在清單層。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready, openWishSection } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

test('進網站是探索的概覽：一區一張卡，代表的點開詳情，「看鳥羽 ›」進那一區', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('ex-area-all')).toHaveAttribute('aria-pressed', 'true');
  // 概覽沒有照片牆／清單切換（T50）
  await expect(page.getByTestId('view-photo')).toHaveCount(0);
  // 照行程順序：志摩在最前面
  const cards = overview.getByTestId('overview-card');
  await expect(cards.first()).toHaveAttribute('data-area', 'shima');
  await expect(cards.first().getByTestId('overview-feb')).toContainText('2 月');
  await expect(page.getByTestId('chat-panel')).toContainText('正在看：概覽');
  await shot(page, 'web-overview');

  // 代表的點：開詳情
  const rep = cards.first().getByTestId('overview-rep').first();
  const id = await rep.getAttribute('data-id');
  await rep.click();
  await expect(page.locator('[data-testid="detail-panel"], [data-testid="detail-popup"]').first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().detailId)).toBe(id);
  await page.keyboard.press('Escape');

  // 看鳥羽：地區列跟著選；不放特色，子地區列在篩選列裡（地區列下面、地點數上面），書架照景餐宿排（T50）
  await overview.locator('[data-area="toba"]').getByTestId('overview-go').click();
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  const home = page.getByTestId('area-home');
  await expect(home).toHaveAttribute('data-area', 'toba');
  await expect(home.getByTestId('area-summary')).toHaveCount(0);
  const bar = page.getByTestId('filter-bar');
  await expect(bar.getByTestId('region-all')).toHaveAttribute('aria-pressed', 'true');
  const y = async (id: string) => (await bar.getByTestId(id).boundingBox())!.y;
  expect(await y('region-chips')).toBeGreaterThan(await y('ex-area-chips'));
  expect(await y('region-chips')).toBeLessThan(await y('list-count'));
  await expect(page.getByTestId('view-photo')).toHaveCount(0);
  await expect(home.getByTestId('shelf')).toHaveCount(4);
  expect(await home.getByTestId('shelf').evaluateAll((els) => els.map((e) => e.getAttribute('data-shelf')))).toEqual(['must', 'fit15', 'stay', 'rain']);
  await expect(home.locator('[data-shelf="fit15"] .xs-title')).toContainText('可坐 15 人');
  await expect(home.locator('[data-shelf="stay"] .xs-title')).toContainText('住在這裡');
  await expect(home.locator('[data-shelf="stay"] [data-testid="shelf-note"]')).toHaveText('包棟、可住 15 人排前面');
  await expect(home.locator('[data-shelf="must"] [data-testid="shelf-card"]')).toHaveCount(3);
  // 小卡：右上角類型圓章，沒有愛心
  await expect(home.locator('[data-shelf="fit15"] [data-testid="shelf-seal"] .ui-seal').first()).toHaveAttribute('data-type', 'restaurant');
  await expect(home.getByTestId('shelf-card').locator('.ui-heart, [data-testid^="heart"]')).toHaveCount(0);
  await expect(page.getByTestId('chat-panel')).toContainText('正在看：鳥羽');
  await shot(page, 'web-area-toba');
});

test('概覽（T52、T63）：地區照片、住幾晚；沒有四格書架；子地區在卡片裡換內容、地圖框過去、看全部地區回來', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  const toba = overview.locator('[data-area="toba"]');
  // 照片右下：作者和授權，連到 Commons
  await expect(toba.getByTestId('overview-credit')).toHaveText('Michalkun · CC BY-SA 2.5');
  await expect(toba.getByTestId('overview-credit')).toHaveAttribute('href', /commons\.wikimedia\.org/);
  // 住幾晚：有住的區才寫
  await expect(overview.getByTestId('overview-nights').first()).toHaveText(/^住 \d+ 晚 · \d+\/\d+–\d+\/\d+/);
  // 「概覽」鈕是芥子黃，和地區鈕分開（T63）
  await expect(page.getByTestId('ex-area-all')).toHaveClass(/ui-chip-overview/);
  await expect(page.getByTestId('ex-area-toba')).not.toHaveClass(/ui-chip-overview/);
  // 四格書架的數字拿掉（T63）；區名旁邊日文名
  await expect(overview.getByTestId('overview-shelf')).toHaveCount(0);
  await expect(overview.locator('[data-area="kix"] .xo-name-ja')).toHaveText('関西空港周辺');

  // 子地區一行：「志摩全區」預設選著，後面全部的子地區，沒有「+N」
  const shima = overview.locator('[data-area="shima"]');
  const n = await page.evaluate(() => (window as any).__th.dataStore.getState().areas.find((a: any) => a.id === 'shima').regions.length);
  await expect(shima.getByTestId('overview-region-all')).toHaveText('志摩全區');
  await expect(shima.getByTestId('overview-region-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(shima.locator('[data-testid^="overview-region-"]:not([data-testid="overview-region-all"])')).toHaveCount(n);
  await expect(shima.getByTestId('overview-region-more')).toHaveCount(0);
  await expect(shima.getByTestId('overview-reps-title')).toHaveText('志摩的代表地點');
  await expect(shima.getByTestId('overview-go')).toHaveText('看志摩 ›');
  await expect(page.getByTestId('map-all-areas')).toHaveCount(0);
  await shot(page, 'web-overview-t63');

  // 點賢島：卡片換成賢島的簡介、代表點；人還在概覽，地圖框到賢島、畫它的框和名字
  const intro = await page.evaluate(() => (window as any).__th.dataStore.getState().areas.find((a: any) => a.id === 'shima').regions.find((r: any) => r.id === 'shima-kashikojima').intro);
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await expect(shima).toHaveAttribute('data-region', 'shima-kashikojima');
  await expect(shima.getByTestId('overview-summary')).toHaveText(intro.summary);
  await expect(shima.getByTestId('overview-reps-title')).toHaveText('賢島的代表地點');
  expect(await shima.getByTestId('overview-rep').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(intro.highlights);
  await expect(shima.getByTestId('overview-go')).toHaveText('看賢島 ›');
  await expect(overview).toBeVisible();
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().filter.areas)).toEqual([]);
  await expect(page.locator('[data-testid="region-name-label"][data-region="shima-kashikojima"]')).toBeVisible();
  await expect(page.getByTestId('map-all-areas')).toBeVisible();
  const focus = () => page.evaluate(() => (window as any).__th.map.getSource('area-focus').serialize().data.features.map((f: any) => f.properties));
  await expect.poll(focus).toMatchObject([{ area: 'shima', region: 'shima-kashikojima' }]);
  await expect.poll(() => page.evaluate(() => (window as any).__th.map.getZoom())).toBeGreaterThan(11);
  await shot(page, 'web-overview-t63-region');

  // 別張卡不動；往下捲再回來還在
  await expect(toba).toHaveAttribute('data-region', '');
  await overview.locator('[data-area="osaka"]').scrollIntoViewIfNeeded();
  await shima.scrollIntoViewIfNeeded();
  await expect(shima).toHaveAttribute('data-region', 'shima-kashikojima');

  // 志摩全區：換回整區，地圖框整個志摩（沒有子地區名）
  await shima.getByTestId('overview-region-all').click();
  await expect(shima.getByTestId('overview-reps-title')).toHaveText('志摩的代表地點');
  await expect.poll(focus).toMatchObject([{ area: 'shima', region: null }]);
  await expect(page.getByTestId('region-name-label')).toHaveCount(0);

  // 看全部地區：全部換回全區、框拿掉、這顆不見
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await page.getByTestId('map-all-areas').click();
  await expect(shima).toHaveAttribute('data-region', '');
  await expect(page.getByTestId('map-all-areas')).toHaveCount(0);
  await expect.poll(focus).toEqual([]);

  // 「概覽」鈕也是
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await page.getByTestId('ex-area-all').click();
  await expect(shima).toHaveAttribute('data-region', '');
  await expect(page.getByTestId('map-all-areas')).toHaveCount(0);

  // 看賢島 ›：進志摩、選好賢島
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await shima.getByTestId('overview-go').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'shima');
  await expect(page.getByTestId('region-shima-kashikojima')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-all-areas')).toHaveCount(0);
});

test('選了一區：書架的「全部 ›」套條件變照片牆，「‹ 一定要去」回到書架；類型在篩選面板裡', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-toba').click();
  const must = page.locator('[data-shelf="must"]');
  await must.getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  const filter = await page.evaluate(() => (window as any).__th.appStore.getState().filter);
  expect(filter).toMatchObject({ areas: ['toba'], types: ['spot'], tiers: ['S', 'A'] });
  await expect(page.getByTestId('explore-item').first()).toBeVisible();
  // 返回鈕和地點數同一列，寫書架名；切換鈕在這一列的右邊（T50）
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 一定要去');
  const head = page.locator('.fb-listhead');
  await expect(head.getByTestId('back-to-area')).toBeVisible();
  await expect(head.getByTestId('view-photo')).toBeVisible();
  await expect(page.locator('.fb-typerow').getByTestId('view-photo')).toHaveCount(0);
  await shot(page, 'web-shelf-all');
  // 篩選上的數字：類型一個、等級兩個（地區不算）
  await expect(page.getByTestId('filter-count')).toHaveText('3');
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-opt-type-spot')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-group="area"]')).toHaveCount(0);
  // T57：選了景點，餐廳、住宿的組變淡（點了照樣能選）；探索沒有「想去」；車站旁有小字
  await expect(page.locator('[data-group="group"]')).toHaveAttribute('data-dim', 'true');
  await expect(page.locator('[data-group="lodging"]')).toHaveAttribute('data-dim', 'true');
  await expect(page.locator('[data-group="suits"]')).not.toHaveAttribute('data-dim', /.*/);
  await expect(page.locator('[data-group="wish"]')).toHaveCount(0);
  await expect(page.getByTestId('filter-opt-context-transit')).toContainText('車站旁主要車站走路 5 分內');
  await expect(page.locator('[data-group="group"] .ui-chip')).toHaveCount(4);
  await shot(page, 'web-filter-sheet');
  // 在面板又改了條件：返回鈕改寫「‹ 回到鳥羽」
  await page.getByTestId('filter-opt-type-spot').click();
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 回到鳥羽');
  // 全部清除：地區留著，回到書架
  await page.getByTestId('filter-clear').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('area-home')).toBeVisible();

  // 子地區當篩選；搜尋時變清單，「‹ 鳥羽」回到書架（子地區留著）
  const region = page.getByTestId('region-chips').locator('button').nth(1);
  await region.click();
  await expect(region).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('search').fill('水族');
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  await expect(page.getByTestId('back-to-area')).toHaveText('‹ 回到鳥羽');
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('area-home')).toBeVisible();
  await expect(page.getByTestId('search')).toHaveValue('');
  await expect(region).toHaveAttribute('aria-pressed', 'true');

  // 換到想去：地區跟著走，第一顆叫「全部」
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('wish'));
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ex-area-all')).toHaveText('全部');
  // 想去（T53）：書架那層沒有切換鈕；「全部 ›」之後切換鈕在地點數那列
  await expect(page.getByTestId('view-photo')).toHaveCount(0);
  await openWishSection(page, 'scheduled');
  await expect(page.locator('.fb-listhead').getByTestId('view-photo')).toBeVisible();
  // 回到概覽
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('explore'));
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
});
