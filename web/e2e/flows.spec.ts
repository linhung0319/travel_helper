// PLAN T11 的完成條件：找到一個點 → 看小卡片 → 開詳情 → 關掉；切換天數；套用、取消篩選；
// 切到探索模式，移動地圖時圖片牆跟著換。另外看車站面板和照片打不開時的替代圖。
import { test } from '@playwright/test';
import { centerOn, expect, findPlaceId, isMobile, ready } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('找到一個點 → 小卡片 → 詳情 → 關掉', async ({ page }) => {
  const id = await findPlaceId(page, 'restaurant', 'B');
  const name = await page.evaluate((id) => {
    const p = (window as any).__th.dataStore.getState().byId.get(id);
    return p.name.zh || p.name.ja;
  }, id);
  const { x, y } = await centerOn(page, id);
  const card = page.getByTestId('preview-card');
  if (await isMobile(page)) {
    // 手機：點一下出小卡片，再點小卡片開詳情
    await page.touchscreen.tap(x, y);
    await expect(card).toContainText(name);
    await card.locator('.preview-body').tap();
  } else {
    // 電腦：滑鼠移上去出小卡片，點下去開詳情
    await page.mouse.move(x, y);
    await expect(card).toContainText(name);
    await page.mouse.click(x, y);
  }
  const detail = page.getByTestId('detail-panel');
  await expect(detail).toBeVisible();
  await expect(detail.locator('h2')).toContainText(name);
  await expect(card).toHaveCount(0);
  await detail.getByTestId('detail-close').click();
  await expect(detail).toHaveCount(0);
});

test('切換天數：選的那天的點正常，其他天變淡；回到全部', async ({ page }) => {
  const visual = (id: string) => page.evaluate((id) => (window as any).__th.visual(id), id);
  await page.locator('[data-day="2027-02-05"]').click();
  await expect(page.locator('[data-day="2027-02-05"]')).toHaveAttribute('aria-selected', 'true');
  // 假行程：2/5 是鳥羽水族館、伊勢神宮內宮是 2/10
  expect(await visual('toba-aquarium')).toMatchObject({ dim: false, order: 2 });
  expect(await visual('ise-naiku')).toMatchObject({ dim: true });
  if (await isMobile(page)) {
    await page.getByRole('tab', { name: '📅 這一天' }).click();
  }
  await expect(page.getByTestId('day-panel')).toContainText('鳥羽水族館');
  await page.getByRole('tab', { name: '全部' }).click();
  expect(await visual('ise-naiku')).toMatchObject({ dim: false });
});

test('套用、取消篩選', async ({ page }) => {
  await page.getByTestId('filter-button').click();
  const panel = page.getByTestId('filter-panel');
  await panel.getByRole('button', { name: /^餐廳/ }).click();
  await panel.getByRole('button', { name: /^S 級/ }).click();
  await panel.getByRole('button', { name: '關閉篩選' }).click();
  const chips = page.getByTestId('filter-chips');
  await expect(chips.getByRole('button', { name: '取消篩選 餐廳' })).toBeVisible();
  await expect(chips.getByRole('button', { name: '取消篩選 S 級' })).toBeVisible();
  const dimSpot = await page.evaluate(() => {
    const th = (window as any).__th;
    const spot = th.dataStore.getState().places.find((p: any) => p.type === 'spot');
    return th.visual(spot.id).dim;
  });
  expect(dimSpot).toBe(true);
  await chips.getByRole('button', { name: '取消篩選 S 級' }).click();
  await expect(chips.getByRole('button', { name: '取消篩選 S 級' })).toHaveCount(0);
  await chips.getByRole('button', { name: '取消篩選 餐廳' }).click();
  await expect(chips).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().filter.types)).toEqual([]);
});

test('探索模式：圖片牆只放畫面裡的點，移動地圖跟著換', async ({ page }) => {
  await page.getByRole('button', { name: '探索' }).click();
  const wall = page.getByTestId('explore-wall');
  await expect(wall).toBeVisible();
  const ids = () => page.getByTestId('wall-item').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id!));
  const inView = () =>
    page.evaluate(() => {
      const th = (window as any).__th;
      const [w, s, e, n] = th.appStore.getState().view.bounds;
      return [...document.querySelectorAll<HTMLElement>('[data-testid="wall-item"]')].every((el) => {
        const [lon, lat] = th.dataStore.getState().byId.get(el.dataset.id).coords;
        return lon >= w && lon <= e && lat >= s && lat <= n;
      });
    });

  await centerOn(page, 'toba-aquarium', 14);
  await expect.poll(async () => (await ids()).includes('toba-aquarium')).toBe(true);
  expect(await inView()).toBe(true);
  const before = await ids();

  await centerOn(page, 'ise-naiku', 14);
  await expect.poll(async () => (await ids()).includes('ise-naiku')).toBe(true);
  const after = await ids();
  expect(after).not.toContain('toba-aquarium');
  expect(after).not.toEqual(before);
  expect(await inView()).toBe(true);

  // 點了照片：地圖上的點閃（觸控再點一下才開詳情）
  const item = page.locator('[data-testid="wall-item"][data-id="ise-naiku"]');
  await item.click();
  if (await isMobile(page)) {
    expect(await page.evaluate(() => (window as any).__th.appStore.getState().hoveredId)).toBe('ise-naiku');
    await item.click();
  }
  await expect(page.getByTestId('detail-panel')).toBeVisible();
});

test('車站面板：指定時間前後的班次', async ({ page }) => {
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba'));
  const panel = page.getByTestId('station-panel');
  await expect(panel.locator('.direction').first()).toBeVisible();
  await expect(panel.locator('.direction')).toHaveCount(2);
  await panel.getByTestId('station-time').fill('14:00');
  await expect(panel.locator('.now-line').first()).toContainText('14:00');
  const firstAfter = await panel.locator('.direction').first().locator('tr:not(.past):not(.now-line) .dep').first().textContent();
  expect(firstAfter! >= '14:00').toBe(true);
  await expect(panel.getByRole('link', { name: 'Google Maps 路線' })).toHaveAttribute('href', /travelmode=transit/);
});

test('照片打不開時顯示替代圖', async ({ page }) => {
  // 只放行本機和地圖圖磚，其他照片一律擋掉
  await page.route(
    (url) => !['localhost', 'tiles.openfreemap.org'].includes(url.hostname),
    (route) => route.abort(),
  );
  const id = await page.evaluate(() => (window as any).__th.dataStore.getState().places.find((p: any) => p.photos.length > 0 && p.type === 'spot').id);
  await page.evaluate((id) => (window as any).__th.appStore.getState().openDetail(id), id);
  const detail = page.getByTestId('detail-panel');
  await expect(detail.getByTestId('photo-fallback').first()).toBeVisible();
  await expect(detail.locator('img.photo')).toHaveCount(0);
});

test('區域來自 areas.json：篩選的區域選項和 areas.json 一樣', async ({ page }) => {
  const names = await page.evaluate(() => (window as any).__th.dataStore.getState().areas.map((a: any) => a.name.zh || a.name.ja));
  await page.getByTestId('filter-button').click();
  const panel = page.getByTestId('filter-panel');
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) await expect(panel.getByRole('button', { name: new RegExp(`^${n}\\d`) }).first()).toBeVisible();
});
