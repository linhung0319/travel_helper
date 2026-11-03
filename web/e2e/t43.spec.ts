// T43：探索的地圖分層、選區範圍（網頁版，interaction-design §21）。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready, waitIdle } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

/** 畫出來的點（縮遠時小點、放大是圖標）：類型、等級、在哪一區 */
const rendered = (page: Page) =>
  page.evaluate(() => {
    const th = (window as any).__th;
    const ids = new Set<string>(th.map.queryRenderedFeatures({ layers: ['places-circle', 'places-icon'] }).map((f: any) => f.properties.id));
    return [...ids].map((id) => {
      const p = th.dataStore.getState().byId.get(id);
      return { id, type: p.type, tier: p.tier, area: p.area };
    });
  });

const focusShape = (page: Page) => page.evaluate(() => (window as any).__th.map.getSource('area-focus').serialize().data.features.map((f: any) => f.properties.area));

test('縮遠的概覽：只畫 S、A 級景點和區名；點區名選那一區、畫範圍；放大全部出現', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await waitIdle(page);
  expect(await page.evaluate(() => (window as any).__th.map.getZoom())).toBeLessThan(11);
  const labels = page.getByTestId('area-name-label');
  await expect(labels.first()).toBeVisible();
  const far = await rendered(page);
  expect(far.length).toBeGreaterThan(0);
  expect(far.every((p) => p.type === 'spot' && (p.tier === 'S' || p.tier === 'A'))).toBe(true);
  expect(await focusShape(page)).toEqual([]);
  await shot(page, 't43-overview');

  // 點地圖上的「鳥羽」：地區列跟著選、範圍畫出來
  await labels.filter({ hasText: '鳥羽' }).click();
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await waitIdle(page);
  expect(await focusShape(page)).toEqual(['toba']);
  // 縮遠：鳥羽的餐廳、住宿照樣畫，其他區只剩 S、A 級景點
  await page.evaluate(() => (window as any).__th.map.jumpTo({ zoom: 10 }));
  await waitIdle(page);
  await expect(labels.filter({ hasText: '鳥羽' })).toHaveClass(/\bon\b/);
  const toba = await rendered(page);
  expect(toba.some((p) => p.area === 'toba' && p.type !== 'spot')).toBe(true);
  expect(toba.filter((p) => p.area !== 'toba').every((p) => p.type === 'spot' && (p.tier === 'S' || p.tier === 'A'))).toBe(true);
  await shot(page, 't43-toba-far');

  // 放大到一區：區名拿掉，別區的餐廳也出現
  await page.evaluate(() => (window as any).__th.map.jumpTo({ center: [136.72, 34.48], zoom: 12.5 }));
  await waitIdle(page);
  await expect(labels).toHaveCount(0);
  expect((await rendered(page)).some((p) => p.area === 'ise' && p.type === 'restaurant')).toBe(true);

  // 回概覽：範圍拿掉
  await page.getByTestId('ex-area-all').click();
  await waitIdle(page);
  expect(await focusShape(page)).toEqual([]);
});

test('行程分頁不分層、不畫區名和範圍', async ({ page }) => {
  await ready(page);
  await waitIdle(page);
  await expect(page.getByTestId('area-name-label')).toHaveCount(0);
  expect(await focusShape(page)).toEqual([]);
  expect((await rendered(page)).some((p) => p.type !== 'spot')).toBe(true);
});
