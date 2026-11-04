// T49 小修（網頁）：地區列一排橫滑，滾輪橫捲、按住拖、‹ › 箭頭、選到的鈕自動捲進畫面；點地區列任何一顆都回到那一層的第一頁（條件、搜尋清掉）。
// SHOT_DIR 有設時存截圖。

import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const scrollLeft = (page: Page) => page.getByTestId('ex-area-chips').evaluate((el) => el.scrollLeft);
/** 最後一顆（照行程順序）整顆在這排看得到的範圍裡 */
async function lastChipShown(page: Page) {
  const row = (await page.getByTestId('ex-area-chips').boundingBox())!;
  const last = (await page.getByTestId('ex-area-chips').locator('button').last().boundingBox())!;
  return last.x >= row.x - 1 && last.x + last.width <= row.x + row.width + 1;
}
const appState = (page: Page) => page.evaluate(() => {
  const s = (window as any).__th.appStore.getState();
  return { filter: s.filter, query: s.query };
});

test('地區列：滾輪捲到最後一顆、箭頭只在還有東西的那邊、按住拖不算點、選到的自動捲進畫面', async ({ page }) => {
  // T69 的地區分頁在 1280 寬剛好全部放得下：縮窄一點才會超出（網頁版面從 1100 起）
  await page.setViewportSize({ width: 1140, height: 800 });
  await ready(page, { tab: 'default' });
  const row = page.getByTestId('ex-area-chips');
  const lastName = await page.evaluate(() => {
    const a = (window as any).__th.dataStore.getState().areas.at(-1);
    return a.name.zh || a.name.ja;
  });
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.getByTestId('ex-area-chips-next')).toBeVisible();
  await expect(page.getByTestId('ex-area-chips-prev')).toHaveCount(0);
  expect(await lastChipShown(page)).toBe(false);
  await shot(page, 'web-area-row-start');

  // 滾輪（直的）在這排上直接橫捲
  await row.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => lastChipShown(page)).toBe(true);
  await expect(row.locator('button').last()).toHaveText(lastName);
  await expect(page.getByTestId('ex-area-chips-next')).toHaveCount(0);
  await expect(page.getByTestId('ex-area-chips-prev')).toBeVisible();
  await shot(page, 'web-area-row-end');

  // ‹ 捲回最前面
  await page.getByTestId('ex-area-chips-prev').click();
  await expect.poll(() => scrollLeft(page)).toBe(0);
  // › 往後捲
  await page.getByTestId('ex-area-chips-next').click();
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
  await page.getByTestId('ex-area-chips-prev').click();
  await expect.poll(() => scrollLeft(page)).toBe(0);

  // 按住拖：捲過去，放開時不算點到鈕
  const toba = (await page.getByTestId('ex-area-toba').boundingBox())!;
  await page.mouse.move(toba.x + toba.width / 2, toba.y + toba.height / 2);
  await page.mouse.down();
  await page.mouse.move(toba.x - 60, toba.y + toba.height / 2, { steps: 6 });
  await page.mouse.move(toba.x - 150, toba.y + toba.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(40);
  await expect(page.getByTestId('ex-area-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('explore-overview')).toBeVisible();

  // 別的地方換區（地圖的地區標籤、AI）：選到的鈕捲進畫面
  await row.evaluate((el) => (el.scrollLeft = 0));
  await page.evaluate(() => {
    const th = (window as any).__th;
    th.appStore.getState().setFilter({ areas: [th.dataStore.getState().areas.at(-1).id], regions: [] });
  });
  await expect.poll(() => lastChipShown(page)).toBe(true);
});

test('點地區鈕：書架「全部 ›」後點概覽回概覽（可以復原）、點別區和目前這顆篩選留著（T69）、「‹ 書架」才回書架；想去一樣', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-toba').click();
  await page.locator('[data-shelf="must"]').getByTestId('shelf-all').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);

  // 概覽：離開篩選，留一份復原
  await page.getByTestId('ex-area-all').click();
  await expect(page.getByTestId('explore-overview')).toBeVisible();
  expect((await appState(page)).filter).toMatchObject({ areas: [], regions: [], types: [], tiers: [] });
  await expect(page.getByTestId('lens-undo')).toContainText('一定要去 · 鳥羽');

  // 別區：只換範圍，還是「一定要去」（T69）
  await page.getByTestId('ex-area-toba').click();
  await page.locator('[data-shelf="must"]').getByTestId('shelf-all').click();
  await page.getByTestId('ex-area-ise').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  await expect(page.getByTestId('lens-title')).toHaveText('一定要去');
  expect((await appState(page)).filter).toMatchObject({ areas: ['ise'], types: ['spot'], tiers: ['S', 'A'] });

  // 目前這顆、搜尋：也留著；「‹ 書架」才回到伊勢的書架（條件、搜尋清掉）
  await page.evaluate(() => (window as any).__th.appStore.getState().setQuery('神'));
  await page.getByTestId('ex-area-ise').click();
  await expect(page.getByTestId('area-home')).toHaveCount(0);
  expect(await appState(page)).toMatchObject({ query: '神', filter: { areas: ['ise'], types: ['spot'] } });
  await page.getByTestId('back-to-area').click();
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-area', 'ise');
  expect(await appState(page)).toMatchObject({ query: '', filter: { areas: ['ise'], types: [], tiers: [] } });

  // 想去：換地區、「全部」都只換範圍，條件、搜尋留著
  await page.getByTestId('side-tab-wish').click();
  await page.evaluate(() => {
    const s = (window as any).__th.appStore.getState();
    s.setFilter({ types: ['spot'] });
    s.setQuery('神');
  });
  await page.getByTestId('ex-area-toba').click();
  expect(await appState(page)).toMatchObject({ query: '神', filter: { areas: ['toba'], types: ['spot'] } });
  await page.getByTestId('ex-area-all').click();
  expect(await appState(page)).toMatchObject({ query: '神', filter: { areas: [], types: ['spot'] } });
});
