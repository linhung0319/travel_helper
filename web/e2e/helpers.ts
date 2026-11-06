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

/**
 * 選類型（T80 改）：T75 起類型就是篩選列的主題列（玩／吃／住），不在面板裡、也不算條件晶片。
 * 主題列只在選了一區（或想去）時有：還在概覽就先進鳥羽。網頁、手機都能用
 */
export async function pickType(page: Page, type: 'spot' | 'restaurant' | 'lodging') {
  const bar = page.locator('[data-testid="filter-bar"]:visible').first();
  const theme = bar.getByTestId(`theme-${type}`);
  if (!(await theme.count())) await page.locator('[data-testid="ex-area-toba"]:visible, [data-testid="m-feed-area-toba"]:visible').first().click();
  await theme.click();
  await expect(theme).toHaveAttribute('aria-selected', 'true');
}

/** 套用的條件不再列成晶片（T33）：打開篩選面板看這個選項有沒有選，看完關掉（手機、網頁都能用） */
export async function expectFilterOpt(page: Page, opt: string, pressed: boolean) {
  await page.getByTestId('filter-open').click();
  await expect(page.getByTestId(`filter-opt-${opt}`)).toHaveAttribute('aria-pressed', String(pressed));
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0);
}

/**
 * 電腦版：打開右欄的篩選抽屜，點幾個選項（已經選的再點是取消），按「看 N 個」關掉。
 * 選項是「組 ID-值」：主題面板例如 'context-lunch'、'restaurant-tier-S'、'suits-elderly'、'map-inView'；沒有主題的面板才有 'type-restaurant'
 */
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
 * 探索的平清單（T80 改）：T75 起選了一區是主題的區段、沒選地區沒條件是概覽。測清單列本身的測試先呼叫這個：
 * 沒選地區、等級 S、A、B 都勾（B 收得到沒評的，T75）＝全部的地點，exploreLayer 是 list（和搜尋、AI 結果集同一層）。手機的 feed 也一樣。
 */
export async function exploreAll(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__th.appStore.getState().setFilter({ areas: [], regions: [], types: [], tiers: ['S', 'A', 'B'] });
    w.__thMobile?.getState().setFeed({ type: 'all', area: null, quick: ['tiers:S', 'tiers:A', 'tiers:B'] });
  });
}

export type WishSectionId = 'unscheduled' | 'candidate' | 'scheduled';

/** 想去的面板（網頁右欄、手機的想去分頁） */
const wishRoot = (page: Page) => page.locator('[data-testid="wish-panel"], [data-testid="m-wish"]');
const wishSection = (page: Page, section: WishSectionId) => page.locator(`[data-testid="wish-list"] [data-testid="wish-section"][data-section="${section}"]`);

/** T76 起想去是三個收合的區段：展開這一段（已經展開就不動）（網頁、手機一樣） */
export async function openWishSection(page: Page, section: WishSectionId) {
  const sec = wishSection(page, section);
  if ((await sec.getAttribute('data-open')) !== 'true') await sec.getByTestId('section-head').click();
  await expect(sec).toHaveAttribute('data-open', 'true');
}

/** 等這個點出現在想去：切到它那一類的主題、有東西的段都展開，回傳它在哪一段 */
export async function revealWishRow(page: Page, id: string): Promise<WishSectionId> {
  const type = await page.evaluate((id) => (window as any).__th.dataStore.getState().byId.get(id)?.type, id);
  const theme = wishRoot(page).getByTestId(`theme-${type}`);
  if ((await theme.count()) && (await theme.getAttribute('aria-selected')) !== 'true') await theme.click();
  await expect(page.getByTestId('wish-list').getByTestId('wish-section')).toHaveCount(3);
  await expect(page.locator(`[data-testid="wish-list"] [data-testid="wish-section"]:has([data-testid="section-count"]:not(:text-is("0")))`).first()).toBeVisible();
  for (const s of ['unscheduled', 'candidate', 'scheduled'] as const) {
    if ((await wishSection(page, s).getByTestId('section-count').innerText()) !== '0') await openWishSection(page, s);
  }
  const sec = page.locator(`[data-testid="wish-list"] [data-testid="wish-section"]:has([data-id="${id}"])`);
  await expect(sec).toBeVisible();
  return (await sec.getAttribute('data-section')) as WishSectionId;
}
