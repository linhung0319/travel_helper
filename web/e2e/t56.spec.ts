// T56：網頁探索選了子地區，地圖只畫子地區的範圍、旁邊放子地區名、飛過去；按「全部」換回整區（interaction-design §21）。
// SHOT_DIR 有設時把畫面存下來（給 👤 看的截圖）。

import { test, expect, type Page } from '@playwright/test';
import { ready, waitIdle } from './helpers.ts';

const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
};

const focusShape = (page: Page) =>
  page.evaluate(() => (window as any).__th.map.getSource('area-focus').serialize().data.features.map((f: any) => ({ area: f.properties.area, region: f.properties.region ?? null })));

/** 地圖畫面的中心 */
const center = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__th.map.getCenter();
    return [c.lng, c.lat] as [number, number];
  });

test('選子地區：只畫子地區的範圍和名字、地圖飛過去；按「全部」換回整區', async ({ page }) => {
  await ready(page, { tab: 'default' });
  await page.getByTestId('ex-area-toba').click();
  await waitIdle(page);
  expect(await focusShape(page)).toEqual([{ area: 'toba', region: null }]);
  await expect(page.getByTestId('region-name-label')).toHaveCount(0);
  const before = await center(page);
  const zoomBefore = await page.evaluate(() => (window as any).__th.map.getZoom());

  // 答志島：離鳥羽站有一段，地圖要移過去、拉近
  await page.getByTestId('region-toshijima').click();
  await waitIdle(page);
  expect(await focusShape(page)).toEqual([{ area: 'toba', region: 'toshijima' }]);
  const label = page.getByTestId('region-name-label');
  await expect(label).toHaveCount(1);
  await expect(label).toHaveAttribute('data-region', 'toshijima');
  await expect(label).toHaveText('答志島');
  const after = await center(page);
  expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => (window as any).__th.map.getZoom())).toBeGreaterThan(zoomBefore);
  // 子地區的點都在畫面裡
  const allIn = await page.evaluate(() => {
    const th = (window as any).__th;
    const b = th.map.getBounds();
    return th.dataStore.getState().places.filter((p: any) => p.region === 'toshijima').every((p: any) => b.contains(p.coords));
  });
  expect(allIn).toBe(true);
  await shot(page, 't56-toshijima');

  // 「全部」：換回整區，名字拿掉，地圖退回
  await page.getByTestId('region-all').click();
  await waitIdle(page);
  expect(await focusShape(page)).toEqual([{ area: 'toba', region: null }]);
  await expect(label).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__th.map.getZoom())).toBeLessThan(zoomBefore + 0.3);
  await shot(page, 't56-toba-all');

  // 換區：子地區的名字跟著拿掉
  await page.getByTestId('region-osatsu').click();
  await waitIdle(page);
  await expect(label).toHaveCount(1);
  await page.getByTestId('ex-area-ise').click();
  await waitIdle(page);
  expect(await focusShape(page)).toEqual([{ area: 'ise', region: null }]);
  await expect(label).toHaveCount(0);
});
