// PLAN T12 的完成條件：用指令能重現 T11 的手動操作（切天數、篩選、聚焦），畫面一樣；
// 另外看標示、路線（OSRM 用假的回應）、比較、AI 的提議畫得出來。
// 設 TH_SHOTS=<目錄> 時順便拍截圖（手機 390px、電腦）。
import { test, type Page } from '@playwright/test';
import { expect, isMobile, ready, waitIdle } from './helpers.ts';

const DAY = '2027-02-05';

/** 畫面狀態：store 的狀態、地圖實際的範圍、地圖上方的篩選標籤 */
async function snapshot(page: Page) {
  await waitIdle(page);
  const state = await page.evaluate(() => {
    const th = (window as any).__th;
    const s = th.appStore.getState();
    const c = th.map.getCenter();
    const r = (n: number) => Math.round(n * 1e4) / 1e4;
    return {
      day: s.day,
      filter: s.filter,
      camera: s.camera && { bbox: s.camera.bbox ?? null, center: s.camera.center ?? null, zoom: s.camera.zoom ?? null },
      map: { center: [r(c.lng), r(c.lat)], zoom: Math.round(th.map.getZoom() * 100) / 100 },
      dims: ['toba-aquarium', 'ise-naiku', 'toba-sazanami'].map((id) => th.visual(id)),
    };
  });
  const chips = await page.getByTestId('filter-chips').count() ? await page.getByTestId('filter-chips').innerText() : '';
  return { ...state, chips };
}

async function shot(page: Page, name: string) {
  const dir = process.env.TH_SHOTS;
  if (!dir) return;
  await waitIdle(page);
  await page.screenshot({ path: `${dir}/${name}-${(await isMobile(page)) ? 'mobile' : 'desktop'}.png` });
}

/** MapView 放進圖層來源的資料（querySourceFeatures 會因為圖磚重複或缺），和畫出來的不重複的點 */
async function overlay(page: Page, source: string, layer: string) {
  await waitIdle(page);
  return page.evaluate(
    ([source, layer]) => {
      const th = (window as any).__th;
      const data = th.map.getSource(source).serialize().data;
      const rendered = new Set(th.map.queryRenderedFeatures({ layers: [layer] }).map((f: any) => f.properties.id ?? f.properties.date));
      return { features: data.features.map((f: any) => f.properties), rendered: rendered.size };
    },
    [source, layer] as const,
  );
}

const run = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).__th.commands[fn as string](...(args as unknown[])), [fn, args] as const);

test('用指令重現 T11 的手動操作：切天數、篩選、聚焦，畫面一樣', async ({ page }) => {
  // 手動：點天數分頁、在篩選面板選餐廳和 S 級、跳到鳥羽
  await ready(page);
  await page.locator(`[data-day="${DAY}"]`).click();
  await page.getByTestId('filter-button').click();
  const panel = page.getByTestId('filter-panel');
  await panel.getByRole('button', { name: /^餐廳/ }).click();
  await panel.getByRole('button', { name: /^S 級/ }).click();
  const area = await page.evaluate(() => (window as any).__th.dataStore.getState().areas.find((a: any) => a.id === 'toba'));
  await panel.getByRole('button', { name: area.name.zh ?? area.name.ja, exact: true }).last().click();
  const manual = await snapshot(page);

  // 指令：重新整理後用同樣的指令做一次
  await ready(page);
  expect((await run(page, 'selectDay', DAY)).ok).toBe(true);
  expect((await run(page, 'setFilter', { types: ['restaurant'], tiers: ['S'] })).ok).toBe(true);
  expect((await run(page, 'focus', { area: 'toba' })).ok).toBe(true);
  const byCommand = await snapshot(page);

  expect(byCommand).toEqual(manual);
  expect(manual.chips).toContain('餐廳');
  await expect(page.locator(`[data-day="${DAY}"]`)).toHaveAttribute('aria-selected', 'true');
});

test('聚焦一個點：地圖移過去、點會閃；篩選標籤可以取消（和 AI 套的是同一份）', async ({ page }) => {
  await ready(page);
  await run(page, 'focus', 'toba-aquarium');
  await waitIdle(page);
  const st = await page.evaluate(() => {
    const th = (window as any).__th;
    const p = th.dataStore.getState().byId.get('toba-aquarium');
    const c = th.map.getCenter();
    return { hovered: th.appStore.getState().hoveredId, d: Math.hypot(c.lng - p.coords[0], c.lat - p.coords[1]), zoom: th.map.getZoom() };
  });
  expect(st.hovered).toBe('toba-aquarium');
  expect(st.d).toBeLessThan(0.001);
  expect(Math.round(st.zoom)).toBe(15);

  await run(page, 'setFilter', { types: ['restaurant'], fit15: ['yes'] });
  const chips = page.getByTestId('filter-chips');
  await expect(chips.getByRole('button', { name: '取消篩選 可容納 15 人' })).toBeVisible();
  await chips.getByRole('button', { name: '取消篩選 可容納 15 人' }).click();
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().filter.fit15)).toEqual([]);
  await expect(chips.getByRole('button', { name: '取消篩選 餐廳' })).toBeVisible();
});

test('標示、路線（沿道路）、比較：畫在地圖上，可以清掉', async ({ page }) => {
  // OSRM 用假的回應：不打公開的 API，結果固定
  await page.route('**/routing.openstreetmap.de/**', (route) => {
    const m = /driving\/([\d.]+),([\d.]+);([\d.]+),([\d.]+)/.exec(route.request().url())!;
    const [a, b] = [
      [Number(m[1]), Number(m[2])],
      [Number(m[3]), Number(m[4])],
    ];
    const mid = [(a[0] + b[0]) / 2 + 0.001, (a[1] + b[1]) / 2];
    return route.fulfill({ json: { code: 'Ok', routes: [{ distance: 640, duration: 500, geometry: { coordinates: [a, mid, b] } }], waypoints: [{ distance: 0 }, { distance: 0 }] } });
  });
  await ready(page);
  await run(page, 'highlight', ['toba-aquarium', 'toba-mikimoto-pearl-island']);
  await run(page, 'drawRoute', 'toba', 'toba-aquarium', 'walk');
  await run(page, 'focus', ['toba', 'toba-aquarium', 'toba-mikimoto-pearl-island']);
  const label = page.locator('.route-label');
  await expect(label).toHaveText('🚶 12 分'); // 640 m ÷ 80 × 1.4 = 11.2 → 12
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().routes[0].source)).toBe('osrm');
  const lines = await overlay(page, 'overlay-routes', 'routes-dot');
  expect(lines.features.map((f: any) => f.dash)).toEqual(['dot']);
  expect(lines.rendered).toBe(1);
  const rings = await overlay(page, 'overlay-highlights', 'highlight-ring');
  expect(rings.features).toHaveLength(2);
  expect(rings.rendered).toBe(2);
  await expect(page.getByTestId('marks-bar')).toContainText('標示 2 個點');
  await shot(page, 'route-highlight');

  const cmp = await run(page, 'compare', ['toba-aquarium', 'toba-mikimoto-pearl-island']);
  expect(cmp.ok).toBe(true);
  const bar = page.getByTestId('compare-bar');
  await expect(bar.locator('.compare-card')).toHaveCount(2);
  await shot(page, 'compare');
  await bar.locator('.compare-card').first().click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  await page.getByTestId('detail-close').click();

  await page.getByTestId('marks-bar').getByRole('button', { name: '清掉 ✕' }).click();
  await expect(label).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().highlights)).toEqual({});
});

test('AI 的提議：切到那天、虛線和摘要；不看提議就清掉；確定的行程沒變', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate((day) => {
    const th = (window as any).__th;
    const it = structuredClone(th.dataStore.getState().itinerary);
    const d = it.days.find((x: any) => x.date === day);
    // 拿掉第 3 個（toba-sazanami），加一家餐廳
    d.items = d.items.filter((i: any) => i.options?.[0]?.place !== 'toba-sazanami');
    const restaurant = th.dataStore.getState().places.find((p: any) => p.type === 'restaurant' && p.area === 'toba' && p.id !== 'toba-sazanami');
    d.items.splice(2, 0, { id: 'i-new', type: 'visit', options: [{ place: restaurant.id }], selected: 0 });
    return th.commands.showProposal(it, { summary: '午餐換一家' });
  }, DAY);
  expect(result.ok).toBe(true);
  expect(result.dates).toEqual([DAY]);
  await expect(page.locator(`[data-day="${DAY}"]`)).toHaveAttribute('aria-selected', 'true');
  const bar = page.getByTestId('proposal-bar');
  await expect(bar).toContainText('午餐換一家');
  await expect(bar).toContainText('－');
  await expect(bar).toContainText('＋');
  const pts = await overlay(page, 'overlay-proposal-points', 'proposal-circle');
  expect([...new Set(pts.features.map((f: any) => f.status))].sort()).toEqual(['added', 'kept', 'removed']);
  expect(pts.rendered).toBeGreaterThan(0);
  expect((await overlay(page, 'overlay-proposal-lines', 'proposal-line')).rendered).toBe(1);
  await shot(page, 'proposal');

  await bar.getByRole('button', { name: '不看提議 ✕' }).click();
  await expect(bar).toHaveCount(0);
  const stillThere = await page.evaluate(
    (day) => JSON.stringify((window as any).__th.dataStore.getState().itinerary.days.find((x: any) => x.date === day)).includes('toba-sazanami'),
    DAY,
  );
  expect(stillThere).toBe(true);
});

test('畫面狀態讀得出來（給 AI 的脈絡）', async ({ page }) => {
  await ready(page);
  await run(page, 'selectDay', DAY);
  await run(page, 'select', ['toba-aquarium']);
  await waitIdle(page);
  const v = await run(page, 'getViewState');
  expect(v.day).toBe(DAY);
  expect(v.view.bounds).toHaveLength(4);
  expect(v.visibleCount).toBeGreaterThan(0);
  expect(v.dayStops.map((s: any) => s.place)).toContain('toba-aquarium');
  expect(v.selection[0]).toMatchObject({ id: 'toba-aquarium', type: 'spot' });
  if (await isMobile(page)) await page.getByRole('tab', { name: '💬 聊天' }).click();
  await expect(page.getByTestId('chat-panel').getByRole('button', { name: /取消選取/ })).toBeVisible();
});
