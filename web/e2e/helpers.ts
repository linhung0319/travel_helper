import { expect, type Page } from '@playwright/test';

/** 等資料和地圖都好了（地圖上有畫出資料點） */
export async function ready(page: Page) {
  // 不連公開的 OSRM：行程線維持直線，結果固定（要測沿道路的測試在 ready 之後自己 page.route，後註冊的優先）
  await page.route('**/routing.openstreetmap.de/**', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => {
    const th = (window as any).__th;
    return th && th.dataStore.getState().status === 'ready' && th.map.isStyleLoaded() && th.map.getLayer('places-circle');
  });
}

/** 找一個 B 級（地圖上只是小點、沒有照片標記）的資料點 */
export async function findPlaceId(page: Page, type: string, tier: string | null): Promise<string> {
  return page.evaluate(
    ([type, tier]) => {
      const ps = (window as any).__th.dataStore.getState().places as any[];
      return ps.find((p) => p.type === type && p.tier === tier && p.area)!.id;
    },
    [type, tier] as const,
  );
}

/** 地圖移到這個點，回傳點在頁面上的座標 */
export async function centerOn(page: Page, id: string, zoom = 16): Promise<{ x: number; y: number }> {
  await page.evaluate(
    ([id, zoom]) => {
      const th = (window as any).__th;
      const p = th.dataStore.getState().byId.get(id);
      th.map.jumpTo({ center: p.coords, zoom });
    },
    [id, zoom] as const,
  );
  await waitIdle(page);
  return page.evaluate((id) => {
    const th = (window as any).__th;
    const p = th.dataStore.getState().byId.get(id);
    const pt = th.map.project(p.coords);
    const r = th.map.getCanvas().getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }, id);
}

export async function waitIdle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const map = (window as any).__th.map;
        if (map.loaded() && !map.isMoving()) {
          // moveend 之後 store 的 view 才會更新
          setTimeout(resolve, 100);
          return;
        }
        map.once('idle', () => setTimeout(resolve, 100));
      }),
  );
}

export { expect };

/** 電腦版：打開右欄右上的頭像選單，點其中一項（討論、預約、下載行程）；選單點完會收起來 */
export async function openAccountItem(page: Page, item: 'comments' | 'reservations' | 'export') {
  await page.getByTestId('account-menu').click();
  await page.getByTestId(`account-${item}`).click();
}

/** 電腦版（開發用）：從頭像選單切換使用者 */
export async function switchUser(page: Page, memberId: string) {
  await page.getByTestId('account-menu').click();
  await page.locator(`[data-member="${memberId}"]`).click();
}
