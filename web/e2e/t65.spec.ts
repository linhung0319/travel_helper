// T65：網頁探索中間的縮放（11～13）畫所有子地區的範圍和名字，點名字選那個子地區（interaction-design §31）。
// SHOT_DIR 有設時把縮放 10、12、14 的畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready, waitIdle } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

/** 畫面上畫出來的子地區名：子地區 ID、名字的錨點（範圍上緣）在畫面的位置 */
const regionLabels = (page: Page) =>
  page.evaluate(() => {
    const map = (window as any).__th.map;
    const seen = new Map<string, { region: string; area: string; x: number; y: number }>();
    for (const f of map.queryRenderedFeatures({ layers: ['region-label'] })) {
      const pt = map.project(f.geometry.coordinates);
      seen.set(f.properties.region, { region: f.properties.region, area: f.properties.area, x: pt.x, y: pt.y });
    }
    return [...seen.values()];
  });

const jump = async (page: Page, zoom: number) => {
  await page.evaluate((z) => (window as any).__th.map.jumpTo({ center: [136.86, 34.46], zoom: z }), zoom);
  await waitIdle(page);
};

test('縮放 12 看得到子地區的名字，點了選那個子地區；縮遠、放大都不畫', async ({ page }) => {
  await ready(page, { tab: 'default' });

  await jump(page, 10);
  expect(await regionLabels(page)).toEqual([]);
  await expect(page.getByTestId('area-name-label').first()).toBeVisible();
  await shot(page, 't65-zoom10');

  await jump(page, 14);
  expect(await regionLabels(page)).toEqual([]);
  await shot(page, 't65-zoom14');

  await jump(page, 12);
  const labels = await regionLabels(page);
  expect(labels.length).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('area-name-label')).toHaveCount(0);
  await shot(page, 't65-zoom12');

  // 點鳥羽的一個子地區名（名字在錨點上方）：進鳥羽、子地區列選好那一個
  const target = labels.find((l) => l.area === 'toba')!;
  expect(target).toBeTruthy();
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  await page.mouse.click(box.x + target.x, box.y + target.y - 12);
  await waitIdle(page);
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`region-${target.region}`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().filter.regions)).toEqual([target.region]);
  // 選了的子地區由 T56 畫框和名字，中間縮放的名字不再畫一次
  await expect(page.getByTestId('region-name-label')).toHaveAttribute('data-region', target.region);
  await jump(page, 12);
  expect((await regionLabels(page)).map((l) => l.region)).not.toContain(target.region);
  await shot(page, 't65-picked');
});
