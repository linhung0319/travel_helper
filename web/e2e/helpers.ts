import { expect, type Page } from '@playwright/test';

/** 等資料和地圖都好了（地圖上有畫出資料點） */
export async function ready(page: Page, opts: { tab?: 'default' | 'trip' } = {}) {
  // 不連公開的 OSRM：行程線維持直線，結果固定（要測沿道路的測試在 ready 之後自己 page.route，後註冊的優先）
  await page.route('**/routing.openstreetmap.de/**', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => {
    const th = (window as any).__th;
    return th && th.dataStore.getState().status === 'ready' && th.map.isStyleLoaded() && th.map.getLayer('places-circle');
  });
  // T39 起進網站先看探索；既有的測試多半是從行程開始，測預設畫面的傳 tab: 'default'
  if (opts.tab !== 'default') {
    await page.evaluate(() => {
      (window as any).__th.appStore.getState().setMode('map');
      (window as any).__thMobile?.getState().setTab('trip');
    });
  }
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

/** 電腦版：打開右欄右上的頭像選單，點其中一項（預約、下載行程（PDF、MD、備份）、過去的版本）；選單點完會收起來 */
export async function openAccountItem(page: Page, item: 'reservations' | 'export' | 'versions') {
  await page.getByTestId('account-menu').click();
  await page.getByTestId(`account-${item}`).click();
}

/** 電腦版（開發用）：從頭像選單切換使用者 */
export async function switchUser(page: Page, memberId: string) {
  await page.getByTestId('account-menu').click();
  await page.locator(`[data-member="${memberId}"]`).click();
}

/** 電腦版：行程分頁的討論按鈕打開討論彈窗（T33） */
export async function openDiscussion(page: Page) {
  await page.getByTestId('side-tab-day').click();
  await page.getByTestId('discuss-button').click();
  await expect(page.getByTestId('discussion')).toBeVisible();
}

/** 電腦版：點類型列（全部、景點、餐廳、住宿）；類型不在篩選面板裡（T33） */
export async function pickType(page: Page, type: 'all' | 'spot' | 'restaurant' | 'lodging') {
  // T42：類型收進篩選面板；只留這一類（all＝都不選）
  await page.getByTestId('filter-open').click();
  for (const t of ['spot', 'restaurant', 'lodging']) {
    const opt = page.getByTestId(`filter-opt-type-${t}`);
    const want = String(t === type);
    if ((await opt.getAttribute('aria-pressed')) !== want) await opt.click();
    await expect(opt).toHaveAttribute('aria-pressed', want);
  }
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0);
}

/** 套用的條件不再列成晶片（T33）：打開篩選面板看這個選項有沒有選，看完關掉（手機、網頁都能用） */
export async function expectFilterOpt(page: Page, opt: string, pressed: boolean) {
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId(`filter-opt-${opt}`)).toHaveAttribute('aria-pressed', String(pressed));
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0);
}

/** 電腦版：打開右欄的篩選抽屜，點幾個選項（例如 'tier-S'、'type-restaurant'、'map-inView'；已經選的再點是取消），按「顯示 N 個」關掉 */
export async function pickFilter(page: Page, ...opts: string[]) {
  await page.getByTestId('filter-open').click();
  for (const o of opts) await page.getByTestId(`filter-opt-${o}`).click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0);
}

/** 以目前使用者對 n 個「還沒排、沒有候選、還沒人 ❤」的點按想去（預設景點），回傳它們的 id */
export async function likeMany(page: Page, n: number, type = 'spot'): Promise<string[]> {
  return page.evaluate(
    async ([n, type]) => {
      const th = (window as any).__th;
      const ds = th.dataStore.getState();
      const sh = th.shared.store.getState();
      const taken = new Set<string>([...sh.votes.map((v: any) => v.placeId), ...sh.candidates.map((c: any) => c.placeId)]);
      const ids = (ds.places as any[])
        .filter((p) => p.type === type && !taken.has(p.id) && !(ds.days.get(p.id)?.length ?? 0))
        .slice(0, n as number)
        .map((p) => p.id as string);
      for (const id of ids) await th.shared.vote(id, 'like');
      return ids;
    },
    [n, type] as const,
  );
}

/**
 * T42：探索沒選地區、沒有條件時是概覽（不是照片牆）。測照片牆、清單本身的測試先呼叫這個：
 * 面板裡三類都選（等於全部的地點，只是畫成照片牆或清單）；手機的 feed 也一樣。
 */
export async function exploreAll(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__th.appStore.getState().setFilter({ types: ['spot', 'restaurant', 'lodging'] });
    w.__thMobile?.getState().setFeed({ type: 'all', quick: ['types:spot', 'types:restaurant', 'types:lodging'] });
  });
}
