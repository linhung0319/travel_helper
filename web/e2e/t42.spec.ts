// T42：探索的概覽、地區列、選區後的畫面（網頁版）。
// T63：概覽沒有四格書架，子地區在卡片裡換內容、網頁地圖跟著框（§28）。
// T80：T75～T81 起選了一區是「主題 × 區段」（§35、§36）：書架、「全部 ›」、照片牆、兩級退、「看鳥羽 ›」、代表地點都拿掉了，
// 改測區段 0 個的虛線框和下一步、面板只畫目前主題的組、在一區裡搜尋。主題、區段的核心流程在 t78.spec.ts。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};
const sec = (page: Page, id: string) => page.locator(`[data-testid="area-home"] [data-testid="section"][data-section="${id}"]`);

test('進網站是探索的概覽：一區一張卡，點區名進那一區（主題從玩開始、子地區列在篩選列裡）', async ({ page }) => {
  await ready(page, { tab: 'default' });
  const overview = page.getByTestId('explore-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('ex-area-all')).toHaveAttribute('aria-pressed', 'true');
  // 照行程順序：志摩在最前面
  const cards = overview.getByTestId('overview-card');
  await expect(cards.first()).toHaveAttribute('data-area', 'shima');
  await expect(cards.first().getByTestId('overview-feb')).toContainText('2 月');
  // 代表地點拿掉了（T81）
  await expect(overview.getByTestId('overview-rep')).toHaveCount(0);
  await expect(page.getByTestId('chat-panel')).toContainText('正在看：概覽');
  await shot(page, 'web-overview');

  // 點鳥羽的區名：地區列跟著選；不放特色，子地區列在篩選列裡（地區列下面）；主題從「玩」開始
  await overview.locator('[data-area="toba"]').getByTestId('overview-name').click();
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  const home = page.getByTestId('area-home');
  await expect(home).toHaveAttribute('data-area', 'toba');
  await expect(home).toHaveAttribute('data-theme', 'spot');
  await expect(home.getByTestId('area-summary')).toHaveCount(0);
  const bar = page.getByTestId('filter-bar');
  await expect(bar.getByTestId('region-all')).toHaveAttribute('aria-pressed', 'true');
  const y = async (id: string) => (await bar.getByTestId(id).boundingBox())!.y;
  expect(await y('region-chips')).toBeGreaterThan(await y('ex-area-chips'));
  // 玩的三個區段，照順序、預設收著
  expect(await home.getByTestId('section').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')))).toEqual(['must', 'other', 'rain']);
  await expect(home.locator('[data-testid="section"][data-open]')).toHaveCount(0);
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
  await expect(page.getByTestId('map-all-areas')).toHaveCount(0);
  const themeN = (t: string) => shima.getByTestId('overview-themes').getByTestId(`theme-${t}`).getByTestId('theme-count').innerText();
  const allSpots = await themeN('spot');
  await shot(page, 'web-overview-t63');

  // 點賢島：卡片換成賢島的簡介、主題列的數字；人還在概覽，地圖框到賢島、畫它的框和名字
  const intro = await page.evaluate(() => (window as any).__th.dataStore.getState().areas.find((a: any) => a.id === 'shima').regions.find((r: any) => r.id === 'shima-kashikojima').intro);
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await expect(shima).toHaveAttribute('data-region', 'shima-kashikojima');
  await expect(shima.getByTestId('overview-summary')).toHaveText(intro.summary);
  expect(Number(await themeN('spot'))).toBeLessThan(Number(allSpots));
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
  await expect(shima).toHaveAttribute('data-region', '');
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

  // 卡片選了賢島再點區名：進志摩、選好賢島
  await shima.getByTestId('overview-region-shima-kashikojima').click();
  await shima.getByTestId('overview-name').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'shima');
  await expect(page.getByTestId('region-shima-kashikojima')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-all-areas')).toHaveCount(0);
});

test('選了一區：篩選面板只畫目前主題的組；在一區裡搜尋是那個主題的平清單；換到想去地區跟著走', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-toba').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-theme', 'spot');
  // 面板（T67、T75）：標題寫地區和主題；玩的組是適合、怎麼去，最後地圖；沒有類型、等級、天氣、想去
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId('filter-title')).toHaveText('篩選 · 鳥羽的景點');
  expect(await page.locator('.fs-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).toEqual(['suits', 'spot-reach', 'map']);
  await expect(page.locator('[data-group="suits"] .ui-chip')).toHaveText(['長輩', '小孩', '2 月']);
  await expect(page.getByTestId('filter-opt-type-spot')).toHaveCount(0);
  await expect(page.locator('[data-group="wish"]')).toHaveCount(0);
  await shot(page, 'web-filter-sheet');
  await page.getByTestId('filter-close').click();
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0);

  // 子地區當範圍；在一區裡搜尋：平的清單、只搜目前主題，主題列還在；清掉搜尋回到區段（子地區留著）
  await page.getByTestId('search').fill('水族');
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  await expect(page.getByTestId('explore-panel')).toHaveAttribute('data-stage', 'list');
  await expect(page.getByTestId('theme-spot')).toHaveAttribute('aria-selected', 'true');
  const ids = await page.getByTestId('explore-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  expect(ids.length).toBeGreaterThan(0);
  const types = await page.evaluate((ids) => ids.map((id) => (window as any).__th.dataStore.getState().byId.get(id).type), ids);
  expect(new Set(types)).toEqual(new Set(['spot']));
  await page.getByTestId('search').fill('');
  await expect(page.getByTestId('area-home')).toBeVisible();

  // 換到想去：地區跟著走，第一顆叫「全部」
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('wish'));
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ex-area-all')).toHaveText('全部');
  await expect(page.getByTestId('wish-list').getByTestId('wish-section')).toHaveCount(3);
  // 回到概覽
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('explore'));
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
});

test('T64、T75：區段 0 個是虛線框和下一步（看全區、問 AI）；有篩選時多「清除篩選」', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-toba').click();
  await page.getByTestId('region-toshijima').click();
  // 答志島只有 B 級：「一定要去」那段不藏，數字 0；展開是虛線框、看鳥羽全區、問 AI
  const must = sec(page, 'must');
  await expect(must.getByTestId('section-count')).toHaveText('0');
  await must.getByTestId('section-head').click();
  await expect(must.getByTestId('empty-message')).toHaveText('答志島沒有「一定要去」的景點');
  const steps = must.getByTestId('empty-step');
  await expect(steps).toHaveCount(2);
  await expect(steps.first()).toHaveText(/^看鳥羽全區（\d+）›$/);
  await expect(steps.last()).toHaveText('✦ 問 AI：答志島有什麼值得去的景點？');
  await shot(page, 'web-section-empty');
  // 問 AI：放進輸入框，不送出、不帶晶片
  await steps.last().click();
  const input = page.getByTestId('chat-input');
  await expect(input).toHaveValue('答志島有什麼值得去的景點？');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await expect(page.locator('.ac-chips [data-testid="chat-context"]')).toHaveCount(0);
  // 放大範圍：鳥羽全區
  await steps.first().click();
  await expect(page.getByTestId('region-all')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().filter.regions)).toEqual([]);

  // 有篩選：志摩・賢島的吃，勾午餐，條件列寫出來；最下面的「問 AI 幫我挑」帶現在的條件
  await page.getByTestId('ex-area-shima').click();
  await page.getByTestId('region-shima-kashikojima').click();
  await page.getByTestId('theme-restaurant').click();
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-context-lunch').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('cond-chip')).toHaveText(['午餐']);
  await page.getByTestId('area-ask-ai').click();
  await expect(input).toHaveValue(/^在志摩・賢島找.*午餐.*的餐廳$/);
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await shot(page, 'web-cond-row');
});
