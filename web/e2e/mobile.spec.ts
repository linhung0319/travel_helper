// 手機版（第六輪 §3）：底部 5 個分頁、我、地圖一直掛著。mobile（390×844）、mobile-small（360×800）兩個 project 都跑。
import { test } from '@playwright/test';
import { expect, goTab, mobileState, ready, scrollsSideways, TABS } from './mobileHelpers.ts';

test('底部 5 個分頁，切換', async ({ page }) => {
  await ready(page);
  // 打開網站先看行程
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  for (const t of ['explore', 'wish', 'trip', 'ai', 'me']) {
    await page.getByTestId(`m-tab-${t}`).click();
    await expect(page.getByTestId(`m-tab-${t}`)).toHaveAttribute('aria-current', 'page');
    // 一次只選一個
    await expect(page.locator('[data-testid^="m-tab-"][aria-current="page"]')).toHaveCount(1);
  }
});

test('每個分頁都沒有橫向捲動（390px、360px）', async ({ page }, testInfo) => {
  // 每個 project 用自己的尺寸：mobile 390×844、mobile-small 360×800
  expect(page.viewportSize()!.width).toBe(testInfo.project.name === 'mobile-small' ? 360 : 390);
  await ready(page);
  for (const t of TABS) {
    await goTab(page, t);
    expect(await scrollsSideways(page), t).toBe(false);
  }
});

test('分頁的點擊範圍至少 44px', async ({ page }) => {
  await ready(page);
  for (const t of TABS) {
    const box = (await page.getByTestId(`m-tab-${t}`).boundingBox())!;
    expect(box.height, t).toBeGreaterThanOrEqual(44);
  }
});

test('舊的手機版面拿掉了：沒有上方列、拉起面板', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.locator('.top-bar')).toHaveCount(0);
  await expect(page.getByTestId('toolbar-comments')).toHaveCount(0);
});

test('地圖一直掛著：行程看得到，其他分頁藏起來（visibility），切回來還在', async ({ page }) => {
  await ready(page);
  const map = page.getByTestId('map');
  await expect(map).toBeVisible();
  await goTab(page, 'explore');
  await expect(map).toBeHidden();
  // 地圖上的控制項（版權列、縮放）也一起藏
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeHidden();
  await expect(page.locator('.maplibregl-ctrl-zoom-in')).toBeHidden();
  // 沒有卸載：還是同一張地圖、有大小
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.m-map')!).visibility)).toBe('hidden');
  expect(await page.evaluate(() => (window as any).__th.map.getCanvas().clientWidth)).toBeGreaterThan(0);
  await goTab(page, 'trip');
  await expect(map).toBeVisible();
  expect(await page.evaluate(() => !!(window as any).__th.map.getLayer('places-circle'))).toBe(true);
});

test('編輯中底部分頁藏起來', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(false));
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
});

test('想去的分頁顯示數字', async ({ page }) => {
  await ready(page);
  const n = await page.evaluate(() => {
    const votes = (window as any).__th.shared.store.getState().votes as { placeId: string; value: string; deletedAt: string | null }[];
    return new Set(votes.filter((v) => !v.deletedAt && v.value === 'like').map((v) => v.placeId)).size;
  });
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId('m-tab-wish').getByTestId('m-tab-count')).toHaveText(String(n));
});

test('我：討論、預約整頁打開', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  await expect(page.getByTestId('me-button')).toBeVisible();
  await expect(page.getByTestId('m-me-export')).toBeVisible();

  await page.getByTestId('m-me-comments').click();
  const comments = page.getByTestId('m-page-comments');
  await expect(comments).toBeVisible();
  // 整趟的留言，一打開就展開、可以留言
  await expect(comments.locator('.wish-comments')).toBeVisible();
  await expect(comments.getByTestId('comment-input')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await comments.getByTestId('m-page-back').click();
  await expect(comments).toHaveCount(0);

  await page.getByTestId('m-me-reservations').click();
  const res = page.getByTestId('m-page-reservations');
  await expect(res).toBeVisible();
  await expect(res.getByTestId('note-row').first()).toBeVisible();
  await res.getByTestId('m-page-back').click();
  await expect(res).toHaveCount(0);
  expect((await mobileState(page)).page).toBeNull();
});

test('詳情整頁：打開推一筆 history，瀏覽器上一頁關掉', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-aquarium', 'explore'));
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  const s = await mobileState(page);
  expect(s.detail).toBeNull();
  expect(s.tab).toBe('explore');
  // 「‹」也能關
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-aquarium', 'explore'));
  await page.getByTestId('m-detail-back').click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
});

test('探索：兩欄圖片牆、沒有地圖、可以按 ❤️ 不開詳情', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  const items = page.getByTestId('m-feed-item');
  await expect(items.nth(3)).toBeVisible();
  // 兩欄、每排照排名：排名第 1、2 的並排在最上面（第 1 張在左），第 3 張在左欄、第 1 張的下面
  const box = async (rank: number) => (await page.locator(`[data-testid="m-feed-item"][data-rank="${rank}"]`).boundingBox())!;
  const [b1, b2, b3, b4] = [await box(1), await box(2), await box(3), await box(4)];
  expect(Math.round(b1.y)).toBe(Math.round(b2.y));
  expect(b1.x).toBeLessThan(b2.x);
  expect(Math.round(b3.x)).toBe(Math.round(b1.x));
  expect(b3.y).toBeGreaterThan(b1.y);
  expect(Math.round(b4.x)).toBe(Math.round(b2.x));
  // 一批一批畫：一開始最多 60 張，滑到底再多畫
  const total = Number(await page.getByTestId('m-feed-wall').getAttribute('data-count'));
  expect(total).toBeGreaterThan(60);
  await expect(items).toHaveCount(60);
  await page.locator('.m-page').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect.poll(() => items.count()).toBeGreaterThan(60);
  await page.locator('.m-page').evaluate((el) => el.scrollTo(0, 0));

  await expect(page.getByTestId('map')).toBeHidden();
  // 找一張自己還沒按 ❤️ 的，按了票數 +1，不開詳情
  const item = page.locator('[data-testid="m-feed-item"]:has([data-testid="m-feed-like"][aria-pressed="false"])').first();
  const id = await item.getAttribute('data-id');
  const tile = page.locator(`[data-testid="m-feed-item"][data-id="${id}"]`);
  const count = async () => Number((await tile.getByTestId('m-feed-like-count').textContent()) || 0);
  const before = await count();
  await tile.getByTestId('m-feed-like').click();
  await expect(tile.getByTestId('m-feed-like')).toHaveAttribute('aria-pressed', 'true');
  expect(await count()).toBe(before + 1);
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  // 按鈕點的範圍至少 44px
  expect((await tile.getByTestId('m-feed-like').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // 點圖片本身才開詳情
  await tile.click({ position: { x: 20, y: 60 } });
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', id!);
  expect((await mobileState(page)).detail?.from).toBe('explore');
});

test('探索：類型篩選', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-type-restaurant').click();
  await expect(page.getByTestId('m-feed-type-restaurant')).toHaveAttribute('aria-pressed', 'true');
  const types = await page.getByTestId('m-feed-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
  expect(types.length).toBeGreaterThan(0);
  expect(new Set(types)).toEqual(new Set(['restaurant']));
  const all = Number(await page.getByTestId('m-feed-wall').getAttribute('data-count'));
  // 15 人的快速篩選：只剩可容納 15 人的
  await page.getByTestId('m-feed-quick-fit15:yes').click();
  const n = Number(await page.getByTestId('m-feed-wall').getAttribute('data-count'));
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(all);
  // ⚙ 篩選從底部面板打開
  await page.getByTestId('m-feed-more').click();
  await expect(page.getByTestId('m-feed-sheet')).toBeVisible();
  await page.getByTestId('m-feed-sheet-done').click();
  await expect(page.getByTestId('m-feed-sheet')).toHaveCount(0);
});

test('探索：⚙ 篩選的底部面板蓋過底部分頁，最下面的晶片點得到', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-more').click();
  const sheet = page.getByTestId('m-feed-sheet');
  await expect(sheet).toBeVisible();
  // 分級的最後一個晶片：畫面上那一點最上面的元素就是它（沒有被底部分頁蓋住）
  const chip = sheet.locator('.m-sheet-group').last().locator('.m-chip').last();
  await chip.scrollIntoViewIfNeeded();
  const b = (await chip.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return !!el?.closest('[data-testid="m-feed-sheet"] .m-sheet-group:last-child .m-chip:last-child');
  }, [b.x + b.width / 2, b.y + b.height / 2] as const);
  expect(hit).toBe(true);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // 背景蓋住底部分頁：點底部分頁的位置是關掉面板，不會換分頁
  const tab = (await page.getByTestId('m-tab-me').boundingBox())!;
  const onTab = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="m-tabbar"]'), [tab.x + tab.width / 2, tab.y + tab.height / 2] as const);
  expect(onTab).toBe(false);
  await page.getByTestId('m-feed-sheet-done').click();
  await expect(sheet).toHaveCount(0);
});

test('探索：往下滑時篩選收成一行，黏在最上面', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await expect(page.getByTestId('m-feed-compact')).toHaveCount(0);
  await page.locator('.m-page').evaluate((el) => el.scrollTo(0, 1200));
  const compact = page.getByTestId('m-feed-compact');
  await expect(compact).toBeVisible();
  expect((await compact.boundingBox())!.y).toBeLessThan(4);
  // 點了回到上面、篩選整個展開
  await compact.click();
  await expect(page.getByTestId('m-feed-compact')).toHaveCount(0);
});

test('想去：分段切換、加到某天', async ({ page }) => {
  await ready(page);
  await goTab(page, 'wish');
  await expect(page.getByTestId('m-wish-item').first()).toBeVisible();
  await page.getByTestId('m-wish-type-spot').click();
  await expect(page.getByTestId('m-wish-type-spot')).toHaveAttribute('aria-pressed', 'true');
  const types = await page.getByTestId('m-wish-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-type')));
  expect(types.length).toBeGreaterThan(0);
  expect(new Set(types)).toEqual(new Set(['spot']));
  const first = page.getByTestId('m-wish-item').first();
  await first.getByTestId('add-to-day').click();
  await expect(first.getByTestId('day-picker')).toBeVisible();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  // 清單檢視：卡片還是有加到某天
  await page.getByTestId('m-wish-view-list').click();
  await expect(page.getByTestId('m-wish-item').first().getByTestId('add-to-day')).toBeVisible();
  // 點卡片開詳情
  const id = await page.getByTestId('m-wish-item').first().getAttribute('data-id');
  await page.getByTestId('m-wish-item').first().locator('.m-wish-name').click();
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', id!);
  expect((await mobileState(page)).detail?.from).toBe('wish');
});

test('沒有照片的點顯示類型色塊', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  const id = (await page.getByTestId('m-feed-item').first().getAttribute('data-id'))!;
  await page.evaluate((id) => {
    const ds = (window as any).__th.dataStore;
    const s = ds.getState();
    const places = s.places.map((p: any) => (p.id === id ? { ...p, photos: [] } : p));
    ds.setState({ places, byId: new Map(places.map((p: any) => [p.id, p])) });
  }, id);
  const fb = page.locator(`[data-testid="m-feed-item"][data-id="${id}"]`).getByTestId('m-thumb-fallback');
  await expect(fb).toBeVisible();
  await expect(fb).toHaveText(/^[景餐宿站點]$/);
});

/** 探索往下捲到 y，點一張整張在畫面裡的（點左上角，避開右下角的票），回傳那張的 id */
async function openFromFeed(page: import('@playwright/test').Page, y: number) {
  await goTab(page, 'explore');
  await expect(page.getByTestId('m-feed-item').nth(3)).toBeVisible();
  await page.locator('.m-page').evaluate((el, y) => el.scrollTo(0, y), y);
  await expect.poll(() => page.locator('.m-page').evaluate((el) => Math.round(el.scrollTop))).toBe(y);
  // 第一張整張都在畫面裡的（篩選、黏在上面的摘要、底部分頁都不擋）
  const id = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="m-feed-item"]')].find((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= 80 && r.bottom <= window.innerHeight - 80;
    });
    return el?.getAttribute('data-id') ?? null;
  });
  expect(id).not.toBeNull();
  const tile = page.locator(`[data-testid="m-feed-item"][data-id="${id}"]`);
  await tile.click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', id!);
  return id!;
}

test('詳情：整頁、返回後捲動位置不變', async ({ page }) => {
  await ready(page);
  await openFromFeed(page, 800);
  const detail = page.getByTestId('m-detail');
  // 照片在最上面，下面是名稱、大按鈕 ❤️／👎；從探索打開沒有「加到某天」
  await expect(detail.getByTestId('m-detail-photos')).toBeVisible();
  await expect(detail.getByTestId('m-detail-name')).toBeVisible();
  expect((await detail.getByTestId('m-detail-like').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await detail.getByTestId('m-detail-dislike').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(detail.getByTestId('m-detail-add')).toHaveCount(0);
  // 分頁：簡介、交通、評論、留言
  for (const t of ['intro', 'transport', 'reviews', 'comments']) await expect(detail.getByTestId(`m-detail-tab-${t}`)).toBeVisible();
  // 探索沒有被卸載，只是蓋住
  await expect(page.getByTestId('m-feed')).toHaveCount(1);
  expect(await scrollsSideways(page)).toBe(false);
  await detail.getByTestId('m-detail-back').click();
  await expect(detail).toHaveCount(0);
  const top = await page.locator('.m-page').evaluate((el) => el.scrollTop);
  expect(Math.abs(top - 800)).toBeLessThan(5);
});

test('詳情：瀏覽器上一頁也能關', async ({ page }) => {
  await ready(page);
  await openFromFeed(page, 600);
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  expect((await mobileState(page)).tab).toBe('explore');
  const top = await page.locator('.m-page').evaluate((el) => el.scrollTop);
  expect(Math.abs(top - 600)).toBeLessThan(5);
});

test('詳情：有問 AI、點小地圖跳到行程', async ({ page }) => {
  await ready(page);
  const id = await openFromFeed(page, 0);
  const detail = page.getByTestId('m-detail');
  const box = detail.getByTestId('ask-ai-box');
  await expect(box).toBeVisible();
  // 問 AI 的膠囊、輸入框、送出鍵：點的範圍至少 44px
  expect((await box.getByTestId('ask-ai-prompt').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await box.getByTestId('ask-ai-input').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await box.locator('.ask-ai-send').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // 點建議問題：這個點帶進聊天（選取）
  await box.getByTestId('ask-ai-prompt').first().click();
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().selection)).toContain(id);

  await detail.getByTestId('m-detail-tab-transport').click();
  const mini = detail.getByTestId('m-detail-minimap');
  await expect(mini).toBeVisible();
  await mini.click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('map')).toBeVisible();
  // 地圖框住這個點
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const th = (window as any).__th;
        const [lon, lat] = th.dataStore.getState().byId.get(id).coords;
        const c = th.map.getCenter();
        return Math.hypot(c.lng - lon, c.lat - lat);
      }, id),
    )
    .toBeLessThan(0.02);
});

test('詳情：從想去打開多一個「加到某天」，可以投票、留言', async ({ page }) => {
  await ready(page);
  await goTab(page, 'wish');
  const first = page.getByTestId('m-wish-item').first();
  const id = await first.getAttribute('data-id');
  await first.locator('.m-wish-name').click();
  const detail = page.getByTestId('m-detail');
  await expect(detail).toHaveAttribute('data-id', id!);
  await expect(detail.getByTestId('m-detail-add').getByTestId('add-to-day')).toBeVisible();
  const like = detail.getByTestId('m-detail-like');
  const was = await like.getAttribute('aria-pressed');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', was === 'true' ? 'false' : 'true');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', was!);
  await detail.getByTestId('m-detail-tab-comments').click();
  await expect(detail.getByTestId('comment-input')).toBeVisible();
});

test('詳情：很長的名稱一行省略，沒有橫向捲動', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('shima-la-mer', 'explore'));
  const name = page.getByTestId('m-detail-name');
  await expect(name).toBeVisible();
  const h = await name.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height }));
  expect(h.h).toBeLessThan(40);
  expect(await scrollsSideways(page)).toBe(false);
});

test('手機上預約列打開的詳情是整頁詳情', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  await page.getByTestId('m-me-reservations').click();
  const row = page.getByTestId('note-row').first();
  const id = await row.getAttribute('data-place');
  await row.locator('.link-button').first().click();
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', id!);
  const s = await mobileState(page);
  expect(s.page).toBeNull();
  expect(s.detail?.from).toBe('me');
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().detailId)).toBeNull();
});
