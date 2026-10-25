// 手機版（第六輪 §3）：底部 5 個分頁、我、地圖一直掛著、探索、想去、詳情、行程。mobile（390×844）、mobile-small（360×800）兩個 project 都跑。
import { test } from '@playwright/test';
import { expect, goTab, mobileState, ready, scrollsSideways, TABS } from './mobileHelpers.ts';
import { centerOn } from './helpers.ts';

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
  // 從探索打開的詳情：問了就跳到 AI 分頁（§3.6），再打開一次看小地圖
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await expect(detail).toHaveCount(0);
  await page.evaluate((id) => (window as any).__thMobile.getState().openPlace(id, 'ai'), id);

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

// --- 行程（§3.5）：地圖＋面板、天數列、資料卡、點卡片找地圖、整趟 ---

/** 選某一天（點天數列那格） */
async function pickDay(page: import('@playwright/test').Page, date: string) {
  await page.getByTestId(`m-day-${date}`).click();
  await expect(page.getByTestId(`m-day-${date}`)).toHaveAttribute('aria-current', 'true');
}

/** 地圖中心到某個點的距離（公尺） */
const centerMeters = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((id) => {
    const th = (window as any).__th;
    const [lon, lat] = th.dataStore.getState().byId.get(id).coords;
    const c = th.map.getCenter();
    const r = Math.PI / 180;
    const x = (c.lng - lon) * r * Math.cos(((c.lat + lat) / 2) * r);
    const y = (c.lat - lat) * r;
    return Math.hypot(x, y) * 6371000;
  }, id);

test('行程：天數列一整行、每格寬、紅字', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('m-day-strip')).toBeVisible();
  await expect(page.getByTestId('m-day-all')).toBeVisible();
  const box = (await page.getByTestId('m-day-2027-02-03').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(52);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('m-day-2027-02-03')).toContainText('2/3');
  await expect(page.getByTestId('m-day-2027-02-03')).toContainText('三・2');
  await expect(page.getByTestId('m-day-2027-02-07')).toHaveClass(/red-day/);
  await expect(page.getByTestId('m-day-2027-02-11')).toHaveClass(/red-day/);
  await expect(page.getByTestId('m-day-2027-02-03')).not.toHaveClass(/red-day/);
  // 一整行：每格同一個高度位置，左右滑
  const tops = await page.locator('[data-testid^="m-day-20"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops.length).toBe(12);
  expect(new Set(tops).size).toBe(1);
  // 選到的那格自己捲進畫面
  await pickDay(page, '2027-02-12');
  await expect(page.getByTestId('m-day-2027-02-12')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('m-trip-title')).toHaveText('2/12（五）第 11 天');
});

test('行程：卡片有縮圖和編號', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  const cards = page.getByTestId('m-card');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    expect(await c.locator('img, [data-testid="m-thumb-fallback"]').count(), `card ${i}`).toBeGreaterThan(0);
    await expect(c.getByTestId('m-card-no')).toBeVisible();
  }
  // 出發是 0
  await expect(cards.first().getByTestId('m-card-no')).toHaveText('0');
  // 卡片之間的交通一行，右邊是 Google Map
  const leg = page.getByTestId('m-leg').first();
  await expect(leg).toBeVisible();
  await expect(leg.getByTestId('leg-maps')).toHaveText('Google Map');
  // 標題、✨、✏️ 編輯、摘要、時間條
  await expect(page.getByTestId('m-trip-title')).toHaveText('2/3（三）第 2 天');
  await expect(page.getByTestId('m-trip-ai')).toBeVisible();
  await expect(page.getByTestId('m-trip-edit')).toBeVisible();
  await expect(page.getByTestId('day-summary')).toBeVisible();
  await expect(page.getByTestId('day-bar')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  // 這天的候選（2/5 有別人加的）：虛線框、加的人，沒有編號
  await pickDay(page, '2027-02-05');
  const cand = page.getByTestId('m-cand').first();
  await expect(cand).toContainText('加的');
  await expect(cand.getByTestId('m-card-no')).toHaveCount(0);
  expect(await cand.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');
});

test('點卡片：面板到中間、地圖飛到那個點、不跳彈窗', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
  const card = page.locator('[data-testid="m-card"][data-item="i-2"]');
  await card.getByTestId('m-card-name').click();
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => centerMeters(page, 'shima-yokoyama-observatory'), { timeout: 10_000 }).toBeLessThan(300);
  // 那個點加黑框（focus），這天其他路線變淡
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().highlights.focus)).toEqual(['shima-yokoyama-observatory']);
  expect(await page.evaluate(() => (window as any).__th.map.getPaintProperty('itinerary-line', 'line-opacity'))).toBe(0.1);
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  // 只有被選的那張有「詳細資料 ›」
  await expect(page.getByTestId('m-card-detail')).toHaveCount(1);
  await card.getByTestId('m-card-detail').click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await expect(page.getByTestId('m-detail-name')).toContainText('橫山展望台');
  expect((await mobileState(page)).detail?.from).toBe('trip');
});

test('點地圖上的圖釘：清單捲到那張卡', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  const card = page.locator('[data-testid="m-card"][data-item="i-3"]');
  await expect(card).toBeVisible();
  const pt = await centerOn(page, 'shima-la-mer', 15);
  await page.touchscreen.tap(pt.x, pt.y);
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(card).toBeInViewport();
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  // 點地圖空白處取消
  const empty = await page.evaluate(() => {
    // 找一個附近沒有點的地方（避開左下的比例尺、右上的按鈕）
    const map = (window as any).__th.map;
    const r = map.getCanvas().getBoundingClientRect();
    const layers = ['places-circle', 'places-icon', 'places-mark', 'places-pin'].filter((l) => map.getLayer(l));
    for (let y = 70; y < r.height - 40; y += 20)
      for (let x = 20; x < r.width - 20; x += 20) {
        if (!map.queryRenderedFeatures([[x - 16, y - 16], [x + 16, y + 16]], { layers }).length) return { x: r.left + x, y: r.top + y };
      }
    return null;
  });
  expect(empty).not.toBeNull();
  await page.touchscreen.tap(empty!.x, empty!.y);
  await expect(page.locator('[data-testid="m-card"][aria-current="true"]')).toHaveCount(0);
});

test('全部：一天一列，點了跳到那天', async ({ page }) => {
  await ready(page);
  await page.getByTestId('m-day-all').click();
  await expect(page.getByTestId('m-day-all')).toHaveAttribute('aria-current', 'true');
  const rows = page.getByTestId('m-overview-day');
  await expect(rows).toHaveCount(12);
  await expect(rows.nth(5).locator('.red-day')).toHaveCount(1);
  await expect(rows.nth(1)).toContainText('2 個點');
  await rows.nth(2).click();
  await expect(page.getByTestId('m-day-2027-02-04')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('m-card').first()).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});

test('航班的日子（2/2）、空的日子能正常顯示', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await pickDay(page, '2027-02-02');
  await expect(page.getByTestId('m-card').first()).toBeVisible();
  await pickDay(page, '2027-02-07');
  await expect(page.getByTestId('m-trip-title')).toHaveText('2/7（日）第 6 天');
  await pickDay(page, '2027-02-13');
  await expect(page.getByTestId('m-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('行程：地圖右上 💬、📋，右下 ⛶ 把面板放低；拖把手換高度', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  const sheet = page.getByTestId('m-sheet');
  await expect(sheet).toHaveAttribute('data-snap', 'mid');
  await page.getByTestId('m-trip-full').click();
  await expect(sheet).toHaveAttribute('data-snap', 'low');
  // 低：只露出天數列
  await expect(page.getByTestId('m-day-strip')).toBeInViewport();
  // 往上拖把手 → 變高；把手點的範圍至少 44px 高
  const g = (await page.getByTestId('m-sheet-grab').boundingBox())!;
  expect(g.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y - 300, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).not.toHaveAttribute('data-snap', 'low');
  for (const [id, p] of [
    ['m-trip-comments', 'm-page-comments'],
    ['m-trip-reservations', 'm-page-reservations'],
  ] as const) {
    expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId(id).click();
    await expect(page.getByTestId(p)).toBeVisible();
    await page.getByTestId(p).getByTestId('m-page-back').click();
    await expect(page.getByTestId(p)).toHaveCount(0);
  }
});

test('行程卡：沒有照片的點顯示類型色塊', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const ds = (window as any).__th.dataStore;
    const places = ds.getState().places.map((p: any) => (p.id === 'shima-yokoyama-observatory' ? { ...p, photos: [] } : p));
    ds.setState({ places, byId: new Map(places.map((p: any) => [p.id, p])) });
  });
  await pickDay(page, '2027-02-03');
  const fb = page.locator('[data-testid="m-card"][data-item="i-2"]').getByTestId('m-thumb-fallback');
  await expect(fb).toBeVisible();
  await expect(fb).toHaveText('景');
});

test('交通開著時點卡片：黑框和路線變淡還在', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.getByTestId('m-leg').first().locator('.m-leg-text').click();
  await expect.poll(() => page.evaluate(() => (window as any).__th.uiStore.getState().legOpen)).not.toBeNull();
  const card = page.locator('[data-testid="m-card"][data-item="i-3"]');
  await card.getByTestId('m-card-name').click();
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => page.evaluate(() => (window as any).__th.uiStore.getState().legOpen)).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().highlights.focus)).toEqual(['shima-la-mer']);
  // 再等一下：交通卡收起來的清理跑完之後，黑框、變淡都還在
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().highlights.focus)).toEqual(['shima-la-mer']);
  expect(await page.evaluate(() => (window as any).__th.map.getPaintProperty('itinerary-line', 'line-opacity'))).toBe(0.1);
});

// --- 行程：編輯中（§3.5）：藍條、把手、⋯ 底部動作面板、標籤、移到第幾天、長按拖曳 ---

type P = import('@playwright/test').Page;

/** 選某天、進編輯（✏️ 編輯 → 開始編輯） */
async function editDay(page: P, date = '2027-02-03') {
  await ready(page);
  await pickDay(page, date);
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
}

const mCard = (page: P, item: string) => page.locator(`[data-testid="m-card"][data-item="${item}"]`);

/** 打開某張卡的 ⋯ 動作面板 */
async function openActions(page: P, item: string) {
  await mCard(page, item).getByTestId('m-card-menu').click();
  await expect(page.getByTestId('m-action-sheet')).toBeVisible();
}

test('編輯：藍條、分頁藏起來、⋯ 開底部面板', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  // 不在編輯中：沒有 ⋯、沒有把手
  await expect(page.getByTestId('m-card-menu')).toHaveCount(0);
  await expect(page.getByTestId('m-card-handle')).toHaveCount(0);
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  // 藍條：「✏️ 編輯 2/3（三）」加「完成」；面板拉到高；底部分頁藏起來
  const bar = page.getByTestId('planning-bar');
  await expect(bar).toContainText('✏️ 編輯 2/3（三）');
  await expect(bar.getByTestId('planning-done')).toBeVisible();
  expect((await bar.getByTestId('planning-done').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
  await expect(page.getByTestId('m-tab-trip')).toHaveCount(0);
  // 把手 ⋮⋮（出發的宿沒有）
  await expect(mCard(page, 'i-2').getByTestId('m-card-handle')).toHaveText('⋮⋮');
  await expect(mCard(page, 'start').getByTestId('m-card-handle')).toHaveCount(0);
  // ⋯ 只有圖示，點的範圍 44px
  const menu = mCard(page, 'i-2').getByTestId('m-card-menu');
  await expect(menu).toHaveText('⋯');
  expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await openActions(page, 'i-2');
  const sheet = page.getByTestId('m-action-sheet');
  // 最上面一列是縮圖加名稱
  await expect(sheet.getByTestId('m-action-head')).toContainText('橫山展望台');
  await expect(sheet.getByTestId('m-action-head').locator('img, [data-testid="m-thumb-fallback"]')).toHaveCount(1);
  await expect(sheet.getByTestId('m-action-withdraw')).toBeVisible();
  await expect(sheet.getByTestId('m-action-delete')).toHaveCount(0);
  const items = sheet.getByRole('menuitem');
  await expect(items).toHaveText(['🏷 標籤', /⏱ 改停留時間/, '📌 釘選時間', '📅 移到第幾天…', '↩ 撤下（回候選）']);
  for (const el of await items.all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await scrollsSideways(page)).toBe(false);
  // 點暗處就關
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  await expect(sheet).toHaveCount(0);
  // 往下拉也關
  await openActions(page, 'i-2');
  const g = (await sheet.getByTestId('m-action-grab').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
});

test('編輯：標籤子畫面多選', async ({ page }) => {
  await editDay(page);
  await openActions(page, 'i-2');
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-tags').click();
  // 同一個面板換內容：分組標題、膠囊
  await expect(sheet.getByTestId('m-action-tags')).toHaveCount(0);
  await expect(sheet.getByTestId('m-tag-sheet')).toContainText('🍴 用餐');
  for (const t of ['lunch', 'breakfast']) {
    await sheet.getByTestId(`tag-opt-${t}`).click();
    await expect(sheet.getByTestId(`tag-opt-${t}`)).toHaveAttribute('aria-checked', 'true');
  }
  for (const el of await sheet.locator('[data-testid^="tag-opt-"]').all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // 卡上兩個
  await expect(mCard(page, 'i-2').locator('[data-testid="item-tag"][data-tag="lunch"]')).toBeVisible();
  await expect(mCard(page, 'i-2').locator('[data-testid="item-tag"][data-tag="breakfast"]')).toBeVisible();
  // ‹ 回清單
  await sheet.getByTestId('m-sheet-back').click();
  await expect(sheet.getByTestId('m-action-tags')).toBeVisible();
});

test('編輯：改停留時間（−／＋ 15 分）', async ({ page }) => {
  await editDay(page);
  await openActions(page, 'i-2');
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-stay').click();
  const now = sheet.getByTestId('m-stay-now');
  await expect(now).toHaveText(/小時/);
  const before = await now.innerText();
  await sheet.getByTestId('m-stay-plus').click();
  await expect(now).not.toHaveText(before);
  await sheet.getByTestId('m-stay-minus').click();
  await expect(now).toHaveText(before);
});

test('編輯：移到第幾天', async ({ page }) => {
  await editDay(page);
  const n = await page.getByTestId('m-card').count();
  await openActions(page, 'i-2');
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-move').click();
  // 4×3，現在那天不能點，紅字
  const grid = sheet.getByTestId('day-grid');
  await expect(grid.locator('button')).toHaveCount(12);
  expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect(sheet.getByTestId('m-move-2027-02-03')).toBeDisabled();
  await expect(sheet.getByTestId('m-move-2027-02-06')).toHaveClass(/red-day/);
  for (const el of await grid.locator('button').all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByTestId('m-move-2027-02-04').click();
  await expect(sheet).toHaveCount(0);
  await expect(mCard(page, 'i-2')).toHaveCount(0);
  await expect(page.getByTestId('m-card')).toHaveCount(n - 1);
  await expect(page.getByTestId('toast')).toContainText('2/4');
});

test('編輯：交通那一行展開改方式', async ({ page }) => {
  await editDay(page);
  const leg = page.getByTestId('m-leg').first();
  await leg.locator('.m-leg-text').click();
  await expect(leg.getByTestId('leg-editor')).toBeVisible();
  for (const el of await leg.getByTestId('leg-mode').all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await scrollsSideways(page)).toBe(false);
  await leg.getByTestId('leg-done').click();
  await expect(leg.getByTestId('leg-editor')).toHaveCount(0);
});

test('編輯：長按把卡片拖到另一張的上緣＝換順序', async ({ page }) => {
  await editDay(page);
  const order = () =>
    page.evaluate(() => (window as any).__th.dataStore.getState().itinerary.days.find((d: any) => d.date === '2027-02-03').items.map((x: any) => x.id) as string[]);
  const before = await order();
  expect(before.indexOf('i-3')).toBeGreaterThan(before.indexOf('i-2'));
  const src = (await mCard(page, 'i-3').getByTestId('m-card-handle').boundingBox())!;
  const dst = (await mCard(page, 'i-2').boundingBox())!;
  // Playwright 沒有長按拖曳：用 CDP 送觸控事件（按住 0.6 秒再移動）
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: x == null ? [] : [{ x, y: y!, id: 1 }] });
  const x0 = src.x + src.width / 2;
  const y0 = src.y + src.height / 2;
  const x1 = dst.x + dst.width / 2;
  const y1 = dst.y + 4;
  await touch('touchStart', x0, y0);
  await page.waitForTimeout(600);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
  await touch('touchEnd');
  await expect.poll(async () => (await order()).indexOf('i-3') < (await order()).indexOf('i-2')).toBe(true);
});

test('編輯：回住宿的這晚的方案、候選的 ⋯', async ({ page }) => {
  await editDay(page);
  await openActions(page, 'lodging');
  const sheet = page.getByTestId('m-action-sheet');
  await expect(sheet.getByRole('menuitem')).toHaveText(['🏷 這晚的方案', '🗑 清掉這晚的住宿']);
  await sheet.getByTestId('m-action-lodging-plan').click();
  await sheet.getByTestId('lodging-plan-breakfast').click();
  await expect(sheet.getByTestId('lodging-plan-breakfast')).toHaveAttribute('aria-checked', 'true');
  await expect(mCard(page, 'lodging').getByTestId('lodging-plan-tag')).toHaveText('只含早餐');
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  // 別人加的候選（2/5）：排進這天、刪除
  await pickDay(page, '2027-02-05');
  await page.getByTestId('m-cand').first().getByTestId('m-card-menu').click();
  await expect(sheet.getByRole('menuitem')).toHaveText(['📅 排進這天', '🗑 刪除']);
  for (const el of await sheet.getByRole('menuitem').all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('編輯：重疊卡 ‹ n/m › 換著看、⋯ 的主要、拿出作用在看的那張', async ({ page }) => {
  await editDay(page, '2027-02-05');
  const lunch = mCard(page, 'i-7');
  const sw = lunch.getByTestId('m-option-switch');
  await expect(sw).toContainText('1/2');
  for (const b of ['option-prev', 'option-next']) expect((await sw.getByTestId(b).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(lunch.getByTestId('m-card-name')).toContainText('漣');
  // 看主卡：👑 主要不能點
  await openActions(page, 'i-7');
  const sheet = page.getByTestId('m-action-sheet');
  await expect(sheet.getByRole('menuitem').first()).toHaveText('👑 主要');
  await expect(sheet.getByTestId('m-action-main')).toBeDisabled();
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  // 換到第 2 個：縮圖、名稱換成一榮，點了不會選卡片
  await sw.getByTestId('option-next').click();
  await expect(sw).toHaveAttribute('data-shown', '1');
  await expect(lunch).toHaveAttribute('data-place', 'toba-kazuei');
  await expect(lunch.getByTestId('m-card-name')).not.toContainText('漣');
  await expect(lunch).not.toHaveAttribute('aria-current', 'true');
  // ⋯ → 👑 主要：一榮變成主卡
  await openActions(page, 'i-7');
  await expect(sheet.getByTestId('m-action-head')).not.toContainText('漣');
  await sheet.getByTestId('m-action-main').click();
  const selected = () => page.evaluate(() => (window as any).__th.dataStore.getState().itinerary.days.find((d: any) => d.date === '2027-02-05').items.find((x: any) => x.id === 'i-7').selected);
  await expect.poll(selected).toBe(1);
  await expect(sw).toContainText('2/2');
  // 換到漣（現在是備卡）→ ⋯ → ⤴ 拿出：多一張單獨的漣，排在一榮後面
  const n = await page.getByTestId('m-card').count();
  await sw.getByTestId('option-next').click();
  await expect(lunch).toHaveAttribute('data-place', 'toba-sazanami');
  await openActions(page, 'i-7');
  await sheet.getByTestId('m-action-detach').click();
  await expect(page.getByTestId('m-card')).toHaveCount(n + 1);
  await expect(lunch.getByTestId('m-option-switch')).toHaveCount(0);
  const places = await page.getByTestId('m-timeline').getByTestId('m-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-place')));
  expect(places[places.indexOf('toba-kazuei') + 1]).toBe('toba-sazanami');
});

test('編輯：完成以後分頁回來', async ({ page }) => {
  await editDay(page);
  await expect(page.getByTestId('m-tab-trip')).toHaveCount(0);
  await page.getByTestId('planning-done').click();
  await expect(page.getByTestId('m-tab-trip')).toBeVisible();
  await expect(page.getByTestId('m-card-menu')).toHaveCount(0);
  await expect(page.getByTestId('planning-bar')).toHaveCount(0);
});

test('編輯：別人改過了的提示在手機上也看得到', async ({ page }) => {
  await editDay(page);
  await page.evaluate(() => (window as any).__th.shared.store.setState({ conflict: { version: 99 } }));
  await expect(page.getByTestId('conflict-bar')).toBeInViewport();
});

test('編輯中打開詳情：底部沒有空白（分頁藏起來時不留位置）', async ({ page }) => {
  await editDay(page);
  await mCard(page, 'i-2').getByTestId('m-card-name').click();
  await mCard(page, 'i-2').getByTestId('m-card-detail').click();
  const d = page.getByTestId('m-detail');
  await expect(d).toBeVisible();
  const box = (await d.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(page.viewportSize()!.height);
});

// ---------- AI 聊天（§3.6）：AI 分頁、行程頁的半屏聊天（對話是佔位，T16m 接上） ----------

test('AI 分頁：假訊息有照片卡和提議卡', async ({ page }) => {
  await ready(page);
  await goTab(page, 'ai');
  const chat = page.getByTestId('m-chat-page');
  await expect(chat).toBeVisible();
  expect(await chat.getByTestId('m-chat-place').count()).toBeGreaterThanOrEqual(3);
  await expect(chat.getByTestId('m-chat-proposal')).toBeVisible();
  // 照片卡上有 ❤️ 和「詳情」，點的範圍至少 44px
  const card = chat.getByTestId('m-chat-place').first();
  expect((await card.getByTestId('m-chat-place-like').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await card.getByTestId('m-chat-place-detail').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // 上下文小標：沒有地點時是這天
  await expect(chat.getByTestId('m-chat-context')).toContainText('📍 正在看：');
  // 送出：「我」的訊息加進對話，再一則佔位回覆
  const before = await chat.getByTestId('m-chat-msg').count();
  await chat.getByTestId('m-chat-input').fill('有沒有雨天備案？');
  await chat.getByTestId('m-chat-send').click();
  await expect(chat.getByTestId('m-chat-msg')).toHaveCount(before + 2);
  await expect(chat.locator('[data-testid="m-chat-msg"][data-who="me"]').last()).toHaveText('有沒有雨天備案？');
  await expect(chat.getByTestId('m-chat-msg').last()).toHaveText('（T16 接上後回答）');
  await expect(chat.getByTestId('m-chat-input')).toHaveValue('');
  // 「套用」先只跳 toast
  await chat.getByTestId('m-chat-proposal-apply').click();
  await expect(page.getByTestId('toast')).toContainText('（T16 接上）');
  // 詳情：從 AI 分頁打開，返回回到 AI
  await card.getByTestId('m-chat-place-detail').click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await page.getByTestId('m-detail-back').click();
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  expect(await scrollsSideways(page)).toBe(false);
});

test('行程頁 ✨：半屏聊天、上面看得到地圖', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-05');
  await page.getByTestId('m-trip-ai').click();
  const sheet = page.getByTestId('m-chat-sheet');
  await expect(sheet).toBeVisible();
  const vh = page.viewportSize()!.height;
  const box = (await sheet.boundingBox())!;
  expect(Math.abs(box.height / vh - 0.55)).toBeLessThan(0.03);
  expect(Math.round(box.y + box.height)).toBe(vh);
  // 蓋在分頁列上面
  const tabAi = (await page.getByTestId('m-tab-ai').boundingBox())!;
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="m-chat-sheet"]'), [tabAi.x + 5, tabAi.y + 5])).toBe(true);
  // 上面看得到地圖
  await expect(page.getByTestId('map')).toBeVisible();
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.m-map'), [20, box.y / 2])).toBe(true);
  // 同一個聊天元件：輸入框、上下文小標
  await expect(sheet.getByTestId('m-chat-input')).toBeVisible();
  await expect(sheet.getByTestId('m-chat-context')).toContainText('📍 正在看：');
  expect((await page.getByTestId('m-chat-sheet-close').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId('m-chat-sheet-close').click();
  await expect(sheet).toHaveCount(0);
  // 往上拉（或 ⤢）：全螢幕，就是 AI 分頁
  await page.getByTestId('m-trip-ai').click();
  await page.getByTestId('m-chat-sheet-expand').click();
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-chat-page')).toBeVisible();
  await expect(page.getByTestId('m-chat-sheet')).toHaveCount(0);
  // 回到行程：半屏聊天收起來了；再打開，用手指把把手往上拉
  await goTab(page, 'trip');
  await expect(page.getByTestId('m-chat-sheet')).toHaveCount(0);
  await page.getByTestId('m-trip-ai').click();
  const g = (await page.getByTestId('m-chat-sheet-grab').boundingBox())!;
  await page.mouse.move(g.x + 30, g.y + 6);
  await page.mouse.down();
  await page.mouse.move(g.x + 30, g.y - 80, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
});

test('提議的「在行程上看」：切到行程、半屏、地圖有提議', async ({ page }) => {
  await ready(page);
  await goTab(page, 'ai');
  await page.getByTestId('m-chat-proposal-view').click();
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-chat-sheet')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().proposal)).not.toBeNull();
  const p = await page.evaluate(() => {
    const s = (window as any).__th.appStore.getState();
    return { dates: s.proposal.dates, kinds: s.proposal.changes.map((c: any) => `${c.kind}:${c.place}`).sort(), day: s.day };
  });
  expect(p.dates).toEqual(['2027-02-05']);
  expect(p.kinds).toEqual(['added:toba-osakaya', 'removed:toba-sazanami']);
  expect(p.day).toBe('2027-02-05');
});

test('探索詳情的問 AI → AI 分頁；行程詳情的問 AI → 半屏', async ({ page }) => {
  await ready(page);
  const id = await openFromFeed(page, 0);
  const name = (await page.getByTestId('m-detail-name').innerText()).trim();
  await page.getByTestId('m-detail').getByTestId('ask-ai-prompt').first().click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  const chat = page.getByTestId('m-chat-page');
  await expect(chat.getByTestId('m-chat-context')).toContainText('📍 關於：');
  await expect(chat.getByTestId('m-chat-context')).toContainText(name.slice(0, 2));
  // 問的問題變成「我」的訊息
  await expect(chat.locator('[data-testid="m-chat-msg"][data-who="me"]').last()).toBeVisible();
  // ✕ 清掉上下文
  await chat.getByTestId('m-chat-context-clear').click();
  await expect(chat.getByTestId('m-chat-context')).not.toContainText('關於');
  expect(await page.evaluate(() => (window as any).__th.uiStore?.getState?.().chatDraft?.placeId ?? null)).toBeNull();
  expect(id).toBeTruthy();

  await goTab(page, 'trip');
  await pickDay(page, '2027-02-03');
  const card = page.locator('[data-testid="m-card"][data-item="i-2"]');
  await card.getByTestId('m-card-name').click();
  await card.getByTestId('m-card-detail').click();
  await page.getByTestId('m-detail').getByTestId('ask-ai-prompt').first().click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  const sheet = page.getByTestId('m-chat-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('m-chat-context')).toContainText('📍 關於：橫山展望台');
});

test('手機地圖上的提議列：不被 💬／📋 蓋住、「不看提議」44px；關掉半屏、離開行程時清掉提議', async ({ page }) => {
  await ready(page);
  await goTab(page, 'ai');
  await page.getByTestId('m-chat-proposal-view').click();
  const bar = page.getByTestId('proposal-bar');
  await expect(bar).toBeVisible();
  const dismiss = bar.getByRole('button', { name: '不看提議 ✕' });
  const box = (await dismiss.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  // 點得到：中心點最上面的就是這個按鈕
  const hit = (sel: string, b: { x: number; y: number; width: number; height: number }) =>
    page.evaluate(([sel, x, y]) => !!document.elementFromPoint(x as number, y as number)?.closest(sel as string), [sel, b.x + b.width / 2, b.y + b.height / 2] as const);
  expect(await hit('.proposal-bar .link-button', box)).toBe(true);
  // 💬、📋 也還點得到
  for (const id of ['m-trip-comments', 'm-trip-reservations']) {
    expect(await hit(`[data-testid="${id}"]`, (await page.getByTestId(id).boundingBox())!), id).toBe(true);
  }
  expect(await scrollsSideways(page)).toBe(false);
  const proposal = () => page.evaluate(() => (window as any).__th.appStore.getState().proposal);
  // 關掉半屏：提議一起清掉
  await page.getByTestId('m-chat-sheet-close').click();
  await expect.poll(proposal).toBeNull();
  await expect(bar).toHaveCount(0);
  // 再看一次提議，然後離開行程分頁（半屏往上拉成 AI 分頁；半屏蓋住分頁列，要離開只能這樣）：也清掉
  await goTab(page, 'ai');
  await page.getByTestId('m-chat-proposal-view').click();
  await expect.poll(proposal).not.toBeNull();
  await page.getByTestId('m-chat-sheet-expand').click();
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await expect.poll(proposal).toBeNull();
});
