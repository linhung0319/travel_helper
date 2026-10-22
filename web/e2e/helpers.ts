import { expect, type Page } from '@playwright/test';

/** 等資料和地圖都好了（地圖上有畫出資料點） */
export async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const th = (window as any).__th;
    return th && th.dataStore.getState().status === 'ready' && th.map.isStyleLoaded() && th.map.getLayer('places-circle');
  });
}

export async function isMobile(page: Page): Promise<boolean> {
  return (page.viewportSize()?.width ?? 1000) < 900;
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

export async function tapOrClick(page: Page, x: number, y: number) {
  if (await isMobile(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

export { expect };
