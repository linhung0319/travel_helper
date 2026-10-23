// PLAN T11 的完成條件：找到一個點 → 看小卡片 → 開詳情 → 關掉；切換天數；套用、取消篩選；
// 切到探索模式，移動地圖時圖片牆跟著換。另外看車站面板和照片打不開時的替代圖。
import { test } from '@playwright/test';
import { centerOn, expect, findPlaceId, isMobile, ready } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('找到一個點 → 小卡片 → 詳情 → 關掉', async ({ page }) => {
  const mobile = await isMobile(page);
  const id = await findPlaceId(page, 'restaurant', 'B');
  const name = await page.evaluate((id) => {
    const p = (window as any).__th.dataStore.getState().byId.get(id);
    return p.name.zh || p.name.ja;
  }, id);
  const { x, y } = await centerOn(page, id);
  const card = page.getByTestId('preview-card');
  if (mobile) {
    // 手機：點一下出小卡片，再點小卡片開詳情
    await page.touchscreen.tap(x, y);
    await expect(card).toContainText(name);
    await card.locator('.preview-body').tap();
  } else {
    // 電腦：滑鼠移上去出小卡片；點下去右側切到探索、捲到那張卡片，再點卡片開詳情
    await page.mouse.move(x, y);
    await expect(card).toContainText(name);
    await page.mouse.click(x, y);
    const item = page.locator(`[data-testid="explore-item"][data-id="${id}"]`);
    await expect(item).toBeInViewport();
    await expect(page.getByTestId('detail-panel')).toHaveCount(0);
    await item.click();
  }
  const detail = page.getByTestId('detail-panel');
  await expect(detail).toBeVisible();
  await expect(detail.locator('h2')).toContainText(name);
  await expect(card).toHaveCount(0);
  await detail.getByTestId(mobile ? 'detail-close' : 'detail-back').click();
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
  const filter = () => page.evaluate(() => (window as any).__th.appStore.getState().filter);
  const dimSpotNow = () =>
    page.evaluate(() => {
      const th = (window as any).__th;
      const spot = th.dataStore.getState().places.find((p: any) => p.type === 'spot');
      return th.visual(spot.id).dim;
    });
  if (!(await isMobile(page))) {
    // 電腦版：探索分頁的類型、常用篩選；回到「行程」時拿掉探索的類型
    await page.getByTestId('side-tab-explore').click();
    await page.locator('.ex-types [data-type="restaurant"]').click();
    const s = page.locator('.ex-quick').getByRole('button', { name: 'S 級' });
    await s.click();
    await expect(s).toHaveAttribute('aria-pressed', 'true');
    expect(await dimSpotNow()).toBe(true);
    await s.click();
    expect((await filter()).tiers).toEqual([]);
    await page.getByTestId('side-tab-day').click();
    expect((await filter()).types).toEqual([]);
    await expect(page.getByTestId('filter-chips')).toHaveCount(0);
    return;
  }
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
  const mobile = await isMobile(page);
  // 電腦版是右側「探索」分頁的清單：看景點、按「只列地圖畫面裡的」
  const itemId = mobile ? 'wall-item' : 'explore-item';
  if (mobile) {
    await page.getByRole('button', { name: '探索' }).click();
    await expect(page.getByTestId('explore-wall')).toBeVisible();
  } else {
    await page.getByTestId('side-tab-explore').click();
    await page.locator('.ex-types [data-type="spot"]').click();
    await page.getByTestId('ex-inview').click();
  }
  const ids = () => page.getByTestId(itemId).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id!));
  const inView = () =>
    page.evaluate((itemId) => {
      const th = (window as any).__th;
      const [w, s, e, n] = th.appStore.getState().view.bounds;
      return [...document.querySelectorAll<HTMLElement>(`[data-testid="${itemId}"]`)].every((el) => {
        const [lon, lat] = th.dataStore.getState().byId.get(el.dataset.id).coords;
        return lon >= w && lon <= e && lat >= s && lat <= n;
      });
    }, itemId);

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
  const item = page.locator(`[data-testid="${itemId}"][data-id="ise-naiku"]`);
  await item.click();
  if (mobile) {
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
  if (!(await isMobile(page))) {
    await page.getByTestId('side-tab-explore').click();
    const areas = page.locator('.ex-areas');
    for (const n of names) await expect(areas.getByRole('button', { name: n, exact: true })).toBeVisible();
    return;
  }
  await page.getByTestId('filter-button').click();
  const panel = page.getByTestId('filter-panel');
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) await expect(panel.getByRole('button', { name: new RegExp(`^${n}\\d`) }).first()).toBeVisible();
});

test('問 AI：電腦版把探索卡片、詳情標題拖到聊天室；手機按「＋ AI」，聊天分頁顯示幾個點', async ({ page }) => {
  const selection = () => page.evaluate(() => (window as any).__th.appStore.getState().selection as string[]);
  if (await isMobile(page)) {
    await page.getByRole('button', { name: '探索' }).click();
    await centerOn(page, 'toba-aquarium', 14);
    const item = page.locator('[data-testid="wall-item"][data-id="toba-aquarium"]');
    await item.getByTestId('wall-ask').click();
    expect(await selection()).toEqual(['toba-aquarium']);
    // 按「＋ AI」不開詳情
    await expect(page.getByTestId('detail-panel')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('已帶進聊天');
    await expect(page.getByTestId('sheet-tab-chat')).toContainText('1');
    await item.getByTestId('wall-ask').click();
    expect(await selection()).toEqual([]);
    return;
  }
  await page.getByTestId('side-tab-explore').click();
  const first = page.getByTestId('explore-item').first();
  const id = (await first.getAttribute('data-id'))!;
  await first.dragTo(page.locator('.chat-column'));
  await expect.poll(selection).toEqual([id]);
  await expect(page.getByTestId('toast')).toContainText('1 個點');
  await expect(page.getByTestId('chat-panel').locator('.chips.selection button')).toHaveCount(1);
  // 拖曳不算點了一下：沒有開詳情
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);

  // 詳情的標題也可以拖
  const second = page.getByTestId('explore-item').nth(1);
  const id2 = (await second.getAttribute('data-id'))!;
  await second.click();
  await page.getByTestId('detail-panel').locator('.detail-head').dragTo(page.locator('.chat-column'));
  await expect.poll(selection).toEqual([id, id2]);
  await expect(page.getByTestId('detail-ask')).toContainText('已帶進聊天');
});
