// 手機版（第六輪 §3）：底部 5 個分頁、我、地圖一直掛著、探索、想去、詳情、行程。mobile（390×844）、mobile-small（360×800）兩個 project 都跑。
import { test } from '@playwright/test';
import { expect, goTab, mobileState, ready, scrollsSideways, TABS } from './mobileHelpers.ts';
import { centerOn, likeMany } from './helpers.ts';

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

test('討論整頁：標題只有一個，沒有留言時有說明', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  await page.getByTestId('m-me-comments').click();
  const comments = page.getByTestId('m-page-comments');
  await expect(comments).toBeVisible();
  // 標題只有頁首的「整趟的討論」一個，沒有再畫一個可收合的標題
  await expect(comments.getByText('整趟的討論')).toHaveCount(1);
  await expect(comments.getByTestId('wish-comments')).toHaveCount(0);
  const n = await comments.getByTestId('wish-comment').count();
  if (n === 0) await expect(comments).toContainText('還沒有人留言，寫下第一則吧');
  await expect(comments.getByTestId('comment-input')).toBeVisible();
});

test('整趟清單每天有縮圖就畫得出來', async ({ page }) => {
  await ready(page);
  await page.getByTestId('m-day-all').click();
  const rows = page.getByTestId('m-overview-day');
  await expect(rows).toHaveCount(12);
  // 有點的天（第 2～12 天裡排了景點或餐廳的）：縮圖是 img（載得到）或類型色塊，不是空白
  for (const date of ['2027-02-04', '2027-02-06']) {
    const row = page.locator(`[data-testid="m-overview-day"][data-date="${date}"]`);
    await row.scrollIntoViewIfNeeded();
    const thumbs = row.locator('.m-thumb');
    expect(await thumbs.count(), date).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < (await thumbs.count()); i++) {
      const box = (await thumbs.nth(i).boundingBox())!;
      expect(box.width, date).toBeGreaterThan(20);
      expect(box.height, date).toBeGreaterThan(20);
    }
    await expect.poll(() => row.locator('img').evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).naturalWidth > 0).length), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  }
});

test('編輯後地圖還框著這天：縮放、中心不變，路線還在', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-05');
  await page.waitForTimeout(2000);
  const view = () =>
    page.evaluate(() => {
      const m = (window as any).__th.map;
      const c = m.getCenter();
      return { zoom: m.getZoom(), lng: c.lng, lat: c.lat, lines: m.queryRenderedFeatures({ layers: ['itinerary-line'] }).length };
    });
  const before = await view();
  expect(before.lines).toBeGreaterThan(0);
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  await page.waitForTimeout(2000);
  const after = await view();
  expect(after.zoom).toBeCloseTo(before.zoom, 1);
  expect(after.lng).toBeCloseTo(before.lng, 2);
  expect(after.lat).toBeCloseTo(before.lat, 2);
  expect(after.lines).toBeGreaterThan(0);
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

test('討論、預約整頁：打開推一筆 history，瀏覽器上一頁（手機的返回鍵）關掉、還在網站裡', async ({ page }) => {
  await ready(page);
  await goTab(page, 'me');
  const url = page.url();
  await page.getByTestId('m-me-comments').click();
  await expect(page.getByTestId('m-page-comments')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('m-page-comments')).toHaveCount(0);
  expect(page.url()).toBe(url);
  const s = await mobileState(page);
  expect(s.page).toBeNull();
  expect(s.tab).toBe('me');
  // 「‹」關掉時把那筆退回去：再按一次上一頁不會留在一筆空的 history 上
  await page.getByTestId('m-me-reservations').click();
  await page.getByTestId('m-page-reservations').getByTestId('m-page-back').click();
  await expect(page.getByTestId('m-page-reservations')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!(window.history.state as any)?.thMobileDetail)).toBe(false);
});

test('探索：兩欄圖片牆、沒有地圖、可以按想去不開詳情', async ({ page }) => {
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
  // 找一張自己還沒按想去的，按了票數 +1，不開詳情
  const item = page.locator('[data-testid="m-feed-item"]:has([data-testid="card-like"][aria-pressed="false"])').first();
  const id = await item.getAttribute('data-id');
  const tile = page.locator(`[data-testid="m-feed-item"][data-id="${id}"]`);
  const count = async () => ((await tile.locator('.ui-heart-count').count()) ? Number(await tile.locator('.ui-heart-count').textContent()) : 0);
  const before = await count();
  await tile.getByTestId('card-like').click();
  await expect(tile.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'true');
  expect(await count()).toBe(before + 1);
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  // 按鈕點的範圍至少 44px
  expect((await tile.getByTestId('card-like').boundingBox())!.height).toBeGreaterThanOrEqual(44);
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
  // 篩選面板選「可容納 15 人」：只剩可容納 15 人的
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-group-yes').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-count')).toHaveText('1');
  const n = Number(await page.getByTestId('m-feed-wall').getAttribute('data-count'));
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(all);
  // 套用的晶片點 ✕ 取消
  await page.getByTestId('filter-applied').first().locator('.ui-chip-x').click();
  await expect(page.getByTestId('filter-applied')).toHaveCount(0);
  expect(Number(await page.getByTestId('m-feed-wall').getAttribute('data-count'))).toBe(all);
});

test('探索：篩選的底部面板蓋過底部分頁，最下面的晶片點得到', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('filter-open').click();
  const sheet = page.getByTestId('filter-sheet');
  await expect(sheet).toBeVisible();
  // 分級的最後一個晶片：畫面上那一點最上面的元素就是它（沒有被底部分頁蓋住）
  const chip = sheet.locator('.fs-group').last().locator('.ui-chip').last();
  await chip.scrollIntoViewIfNeeded();
  const b = (await chip.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return !!el?.closest('[data-testid="filter-sheet"] .fs-group:last-child .ui-chip:last-child');
  }, [b.x + b.width / 2, b.y + b.height / 2] as const);
  expect(hit).toBe(true);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // 背景蓋住底部分頁：點底部分頁的位置是關掉面板，不會換分頁
  const tab = (await page.getByTestId('m-tab-me').boundingBox())!;
  const onTab = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="m-tabbar"]'), [tab.x + tab.width / 2, tab.y + tab.height / 2] as const);
  expect(onTab).toBe(false);
  await page.getByTestId('filter-done').click();
  await expect(sheet).toHaveCount(0);
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
  // 清單檢視：每列都能左滑加到某天（滑的測試在「想去：左滑加到某天」）
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('m-wish-item').first().getByTestId('wish-swipe-add')).toHaveCount(1);
  // 點列開詳情
  const id = await page.getByTestId('m-wish-item').first().getAttribute('data-id');
  await page.getByTestId('m-wish-item').first().getByTestId('m-wish-open').click();
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
  // 圖片牆的高度照原圖比例：照片一張張載入時版面會動，瀏覽器的 scroll anchoring 會把捲動位置調個幾 px（甚至讓 Playwright 的 click 再捲一次）。
  // 所以先等畫面上已經在載的照片載完，再捲、再量。
  const settle = () => page.waitForFunction(() => [...document.querySelectorAll('[data-testid="m-feed-item"] img')].every((i) => (i as HTMLImageElement).complete), null, { timeout: 8000 }).catch(() => {});
  await settle();
  await page.locator('.m-page').evaluate((el, y) => el.scrollTo(0, y), y);
  await settle();
  await expect.poll(() => page.locator('.m-page').evaluate((el, y) => Math.abs(el.scrollTop - y) <= 2, y)).toBe(true);
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
  // 照片在最上面，下面是名稱、大按鈕想去／不想去；從探索打開沒有「加到某天」
  await expect(detail.getByTestId('m-detail-photos')).toBeVisible();
  await expect(detail.getByTestId('m-detail-name')).toBeVisible();
  expect((await detail.getByTestId('detail-like').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await detail.getByTestId('detail-dislike').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(detail.getByTestId('detail-add').getByTestId('add-to-day')).toBeVisible(); // 動作列的主要按鈕，從哪打開都有
  // 分頁：簡介、交通、評論、留言
  for (const t of ['intro', 'transport', 'reviews', 'comments']) await expect(detail.getByTestId(`detail-tab-${t}`)).toBeVisible();
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

  await detail.getByTestId('detail-tab-transport').click();
  const mini = detail.getByTestId('m-detail-minimap');
  await expect(mini).toBeVisible();
  await mini.click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('map')).toBeVisible();
  // 選中這個點，地圖上看得到它（第七輪 §8.3）
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().selectedId)).toBe(id);
  await expect.poll(() => visibleOnMap(page, id!), { timeout: 10_000 }).toBe(true);
});

test('詳情：從想去打開多一個「加到某天」，可以投票、留言', async ({ page }) => {
  await ready(page);
  await goTab(page, 'wish');
  const first = page.getByTestId('m-wish-item').first();
  const id = await first.getAttribute('data-id');
  await first.getByTestId('m-wish-open').click();
  const detail = page.getByTestId('m-detail');
  await expect(detail).toHaveAttribute('data-id', id!);
  await expect(detail.getByTestId('detail-add').getByTestId('add-to-day')).toBeVisible();
  const like = detail.getByTestId('detail-like');
  const was = await like.getAttribute('aria-pressed');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', was === 'true' ? 'false' : 'true');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', was!);
  await detail.getByTestId('detail-tab-comments').click();
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

/** 這個點在地圖看得到的範圍裡（扣掉行程面板，第七輪 §8.2） */
const visibleOnMap = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((id) => {
    const th = (window as any).__th;
    const pt = th.map.project(th.dataStore.getState().byId.get(id).coords);
    const v = th.visibleRect();
    return pt.x >= v.left && pt.x <= v.right && pt.y >= v.top && pt.y <= v.bottom;
  }, id);

test('行程：天數列一整行、每格寬、紅字', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('m-day-strip')).toBeVisible();
  await expect(page.getByTestId('m-day-all')).toBeVisible();
  const box = (await page.getByTestId('m-day-2027-02-03').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(52);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('m-day-2027-02-03')).toContainText('2/3');
  await expect(page.getByTestId('m-day-2027-02-03')).toContainText('三');
  await expect(page.getByTestId('m-day-all')).toHaveText('整趟');
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
  await expect(page.getByTestId('m-trip-title')).toContainText('2/12週五 · 第 11 天');
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
    expect(await c.locator('.tc-thumb img, .tc-thumb [data-testid="item-type"]').count(), `card ${i}`).toBeGreaterThan(0);
    await expect(c.getByTestId('trip-card-no')).toBeVisible();
  }
  // 出發是 0
  await expect(cards.first().getByTestId('trip-card-no')).toHaveText('0');
  // 卡片之間的交通一行，右邊是「地圖 ↗」
  const leg = page.getByTestId('m-leg').first();
  await expect(leg).toBeVisible();
  await expect(leg.getByTestId('leg-maps')).toHaveText('地圖 ↗');
  // 標題、✨、✏️ 編輯、摘要、時間條
  await expect(page.getByTestId('m-trip-title')).toContainText('2/3週三 · 第 2 天');
  await expect(page.getByTestId('m-trip-ai')).toBeVisible();
  await expect(page.getByTestId('m-trip-edit')).toBeVisible();
  await expect(page.getByTestId('day-summary')).toBeVisible();
  await expect(page.getByTestId('day-bar')).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  // 這天的候選（2/5 有別人加的）：虛線框、加的人，沒有編號
  await pickDay(page, '2027-02-05');
  const cand = page.getByTestId('m-cand').first();
  await expect(cand).toContainText('加的');
  await expect(cand.getByTestId('trip-card-no')).toHaveCount(0);
  expect(await cand.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');
});

test('點卡片：面板高度不變、選中（數字水滴）、被面板蓋住才移地圖、不跳彈窗', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
  const card = page.locator('[data-testid="m-card"][data-item="i-2"]');
  await card.getByTestId('trip-card-name').click();
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
  await expect(card).toHaveAttribute('aria-current', 'true');
  // 面板拉高、點被蓋住：地圖移到看得到的地方
  await expect.poll(() => visibleOnMap(page, 'shima-yokoyama-observatory'), { timeout: 10_000 }).toBe(true);
  // 選中：數字水滴寫那張卡的編號；路線不變淡
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', 'shima-yokoyama-observatory');
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-label', await card.getByTestId('trip-card-no').innerText());
  expect(await page.evaluate(() => (window as any).__th.map.getPaintProperty('itinerary-line', 'line-opacity'))).not.toBe(0.1);
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  // 只有展開的那張有「詳細資料」
  await expect(page.getByTestId('trip-card-detail')).toHaveCount(1);
  await card.getByTestId('trip-card-detail').click();
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
  await expect(card.getByTestId('trip-card-expand')).toBeVisible();
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', 'shima-la-mer');
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  // 點地圖空白處取消
  const empty = await page.evaluate(() => {
    // 找一個附近沒有點的地方（避開左下的比例尺、右上的按鈕）
    const map = (window as any).__th.map;
    const r = map.getCanvas().getBoundingClientRect();
    const layers = ['places-circle', 'places-icon', 'places-mark'].filter((l) => map.getLayer(l));
    const drop = document.querySelector('[data-testid="map-selected"]')?.getBoundingClientRect();
    for (let y = 70; y < r.height - 40; y += 20)
      for (let x = 20; x < r.width - 20; x += 20) {
        const px = r.left + x;
        const py = r.top + y;
        const onDrop = drop && px > drop.left - 16 && px < drop.right + 120 && py > drop.top - 16 && py < drop.bottom + 16;
        if (!onDrop && !map.queryRenderedFeatures([[x - 16, y - 16], [x + 16, y + 16]], { layers }).length) return { x: px, y: py };
      }
    return null;
  });
  expect(empty).not.toBeNull();
  await page.touchscreen.tap(empty!.x, empty!.y);
  await expect(page.locator('[data-testid="m-card"][aria-current="true"]')).toHaveCount(0);
  await expect(page.getByTestId('map-selected')).toHaveCount(0);
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
  await expect(page.getByTestId('m-trip-title')).toContainText('2/7週日 · 第 6 天');
  await pickDay(page, '2027-02-13');
  await expect(page.getByTestId('m-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('行程：地圖右下 ⛶ 把面板放低；拖把手換高度', async ({ page }) => {
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
});

test('行程卡：沒有照片的點顯示類型色塊', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const ds = (window as any).__th.dataStore;
    const places = ds.getState().places.map((p: any) => (p.id === 'shima-yokoyama-observatory' ? { ...p, photos: [] } : p));
    ds.setState({ places, byId: new Map(places.map((p: any) => [p.id, p])) });
  });
  await pickDay(page, '2027-02-03');
  const fb = page.locator('[data-testid="m-card"][data-item="i-2"]').getByTestId('item-type');
  await expect(fb).toBeVisible();
  await expect(fb).toHaveText('景');
});

test('交通開著時點卡片：交通收起、路線恢復，選中那張卡', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.getByTestId('m-leg').first().getByTestId('leg-line-text').click();
  await expect.poll(() => page.evaluate(() => (window as any).__th.uiStore.getState().legOpen)).not.toBeNull();
  const card = page.locator('[data-testid="m-card"][data-item="i-3"]');
  await card.getByTestId('trip-card-name').click();
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => page.evaluate(() => (window as any).__th.uiStore.getState().legOpen)).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().selectedId)).toBe('shima-la-mer');
  // 再等一下：交通卡收起來的清理跑完之後，選中還在、交通的路線清掉、路線不再變淡（選中不讓路線變淡）
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().selectedId)).toBe('shima-la-mer');
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().legRoute)).toBeNull();
  expect(await page.evaluate(() => (window as any).__th.map.getPaintProperty('itinerary-line', 'line-opacity'))).not.toBe(0.1);
});

// --- 行程：編輯中（§3.5）：藍條、把手、⋯ 底部動作面板、標籤、移到第幾天、長按拖曳 ---

type P = import('@playwright/test').Page;

/** 選某天、進編輯（編輯 → 開始編輯） */
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
  // 藍條：「編輯 2/3（三）」加「完成」；面板高度不變（中）；底部分頁藏起來
  const bar = page.getByTestId('planning-bar');
  await expect(bar).toContainText('編輯 2/3（三）');
  await expect(bar.getByTestId('planning-done')).toBeVisible();
  expect((await bar.getByTestId('planning-done').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
  await expect(page.getByTestId('m-tab-trip')).toHaveCount(0);
  // 把手（grip 圖示；出發的宿沒有）
  await expect(mCard(page, 'i-2').getByTestId('m-card-handle').locator('svg')).toHaveCount(1);
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
  await expect(items).toHaveText(['標籤', /改停留時間/, '釘選時間', '調整順序', '移到第幾天…', '撤下（回候選）']);
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
  await expect(sheet.getByTestId('m-tag-sheet')).toContainText('用餐');
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

test('編輯：交通那一行按「改」，底部面板裡改方式', async ({ page }) => {
  await editDay(page);
  const leg = page.getByTestId('m-leg').first();
  await leg.getByTestId('leg-edit').click();
  const sheet = page.getByTestId('m-leg-sheet');
  await expect(sheet.getByTestId('leg-editor')).toBeVisible();
  for (const el of await sheet.getByTestId('leg-mode').all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await scrollsSideways(page)).toBe(false);
  await sheet.getByTestId('leg-done').click();
  await expect(page.getByTestId('m-leg-sheet')).toHaveCount(0);
});

/** CDP 送觸控事件（真的手指：會捲動、會照 touch-action） */
async function fingers(page: P) {
  const cdp = await page.context().newCDPSession(page);
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x == null ? [] : [{ x, y: y!, id: 1 }] });
}

const dayOrder = (page: P, date = '2027-02-03') =>
  page.evaluate((d) => (window as any).__th.dataStore.getState().itinerary.days.find((x: any) => x.date === d).items.map((x: any) => x.id) as string[], date);

test('手機：在卡片上捲動不會開始拖', async ({ page }) => {
  await editDay(page);
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
  const body = page.locator('.m-trip-body');
  const before = await body.evaluate((el) => el.scrollTop);
  // 第一張有把手的卡（在面板裡看得到的地方），按在名稱上
  const name = (await page.getByTestId('m-card').filter({ has: page.getByTestId('m-card-handle') }).first().getByTestId('trip-card-name').boundingBox())!;
  const touch = await fingers(page);
  const x = name.x + 20;
  const y = name.y + name.height / 2;
  await touch('touchStart', x, y);
  let dragging = false;
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', x, y - 20 * i);
    dragging ||= await page.evaluate(() => document.body.classList.contains('dragging-plan'));
  }
  await touch('touchEnd');
  expect(dragging).toBe(false);
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  await expect(page.locator('.drag-float')).toHaveCount(0);
});

test('手機：按把手拖到下面，順序變了；拖的時候面板拉滿，放開回到原本高度', async ({ page }) => {
  const D = '2027-02-05';
  // 2/5：出發的宿、i-20、i-6、i-7（重疊卡）、i-8
  await editDay(page, '2027-02-05');
  const sheet = page.getByTestId('m-sheet');
  await expect(sheet).toHaveAttribute('data-snap', 'mid');
  const before = await dayOrder(page, D);
  const first = page.getByTestId('m-card').filter({ has: page.getByTestId('m-card-handle') }).first();
  const id = (await first.getAttribute('data-item'))!;
  const h = (await first.getByTestId('m-card-handle').boundingBox())!;
  // 把手欄 44px 寬
  expect(h.width).toBeGreaterThanOrEqual(44);
  const touch = await fingers(page);
  const x0 = h.x + h.width / 2;
  const y0 = h.y + h.height / 2;
  // 一按就拖（不用長按）
  await touch('touchStart', x0, y0);
  await touch('touchMove', x0, y0 + 10);
  await expect(page.locator('body')).toHaveClass(/dragging-plan/);
  await expect(page.locator('.drag-float')).toHaveCount(1);
  await expect(sheet).toHaveAttribute('data-snap', 'high');
  // 面板拉滿之後再量下面第二張（i-6；再下面的重疊卡已經在畫面底的自動捲範圍）的位置，移到它的下緣
  const fourth = mCard(page, 'i-6');
  const target = (await fourth.getAttribute('data-item'))!;
  // 面板拉高有動畫：等位置停下來
  let t = (await fourth.boundingBox())!;
  await expect.poll(async () => {
    const prev = t.y;
    t = (await fourth.boundingBox())!;
    return Math.abs(t.y - prev) < 0.5;
  }).toBe(true);
  const x1 = t.x + t.width / 2;
  const y1 = t.y + t.height - 6;
  for (let i = 1; i <= 8; i++) await touch('touchMove', x0 + ((x1 - x0) * i) / 8, y0 + 10 + ((y1 - y0 - 10) * i) / 8);
  await touch('touchEnd');
  await expect.poll(() => dayOrder(page, D)).not.toEqual(before);
  const after = await dayOrder(page, D);
  expect(after.indexOf(id)).toBeGreaterThan(after.indexOf(target));
  await expect(sheet).toHaveAttribute('data-snap', 'mid');
  await expect(page.locator('body')).not.toHaveClass(/dragging-plan/);
});

test('手機：拖到面板下緣會自動捲', async ({ page }) => {
  await editDay(page, '2027-02-05');
  const body = page.locator('.m-trip-body');
  const h = (await mCard(page, 'i-20').getByTestId('m-card-handle').boundingBox())!;
  const touch = await fingers(page);
  await touch('touchStart', h.x + h.width / 2, h.y + h.height / 2);
  await touch('touchMove', h.x + h.width / 2, h.y + h.height / 2 + 10);
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
  const before = await body.evaluate((el) => el.scrollTop);
  const vh = page.viewportSize()!.height;
  await touch('touchMove', h.x + h.width / 2, vh - 6);
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 20);
  await touch('touchEnd');
  await expect(page.locator('body')).not.toHaveClass(/dragging-plan/);
});

test('調整順序：下移', async ({ page }) => {
  await editDay(page);
  const before = await dayOrder(page);
  const i0 = before.indexOf('i-2');
  const no = await mCard(page, 'i-2').getByTestId('trip-card-no').textContent();
  await openActions(page, 'i-2');
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-reorder').click();
  await expect(sheet).toHaveAttribute('data-view', 'reorder');
  for (const b of ['reorder-up', 'reorder-down', 'reorder-merge']) expect((await sheet.getByTestId(b).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByTestId('reorder-down').click();
  await expect.poll(async () => (await dayOrder(page)).indexOf('i-2')).toBe(i0 + 1);
  // 面板還開著；那張卡變成下一個編號
  await expect(sheet).toBeVisible();
  await expect(mCard(page, 'i-2').getByTestId('trip-card-no')).not.toHaveText(no!);
  await expect(page.getByTestId('toast')).toContainText('下移');
});

test('編輯：回住宿的這晚的方案、候選的 ⋯', async ({ page }) => {
  await editDay(page);
  await openActions(page, 'lodging');
  const sheet = page.getByTestId('m-action-sheet');
  await expect(sheet.getByRole('menuitem')).toHaveText(['這晚的方案', '清掉這晚的住宿']);
  await sheet.getByTestId('m-action-lodging-plan').click();
  await sheet.getByTestId('lodging-plan-breakfast').click();
  await expect(sheet.getByTestId('lodging-plan-breakfast')).toHaveAttribute('aria-checked', 'true');
  await expect(mCard(page, 'lodging').getByTestId('lodging-plan-tag')).toHaveText('只含早餐');
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  // 別人加的候選（2/5）：排進這天、刪除
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-05'));
  await page.getByTestId('m-cand').first().getByTestId('m-card-menu').click();
  await expect(sheet.getByRole('menuitem')).toHaveText(['排進這天', '刪除']);
  for (const el of await sheet.getByRole('menuitem').all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('編輯：重疊卡 ‹ n/m › 換著看、⋯ 的主要、拿出作用在看的那張', async ({ page }) => {
  await editDay(page, '2027-02-05');
  const lunch = mCard(page, 'i-7');
  const sw = lunch.getByTestId('m-option-switch');
  await expect(sw).toContainText('1/2');
  for (const b of ['option-prev', 'option-next']) expect((await sw.getByTestId(b).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(lunch.getByTestId('trip-card-name')).toContainText('漣');
  // 看主卡：👑 主要不能點
  await openActions(page, 'i-7');
  const sheet = page.getByTestId('m-action-sheet');
  await expect(sheet.getByRole('menuitem').first()).toHaveText('主要');
  await expect(sheet.getByTestId('m-action-main')).toBeDisabled();
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  // 換到第 2 個：縮圖、名稱換成一榮，點了不會選卡片
  await sw.getByTestId('option-next').click();
  await expect(sw).toHaveAttribute('data-shown', '1');
  await expect(lunch).toHaveAttribute('data-place', 'toba-kazuei');
  await expect(lunch.getByTestId('trip-card-name')).not.toContainText('漣');
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

test('編輯：看重疊卡的備卡時，⋯ 的「改停留時間」不能點（只改得到主卡）', async ({ page }) => {
  await editDay(page, '2027-02-05');
  const lunch = mCard(page, 'i-7');
  const sheet = page.getByTestId('m-action-sheet');
  // 看主卡：可以改
  await openActions(page, 'i-7');
  await expect(sheet.getByTestId('m-action-stay')).toBeEnabled();
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } });
  // 看備卡：不能點
  await lunch.getByTestId('m-option-switch').getByTestId('option-next').click();
  await expect(lunch).toHaveAttribute('data-place', 'toba-kazuei');
  await openActions(page, 'i-7');
  await expect(sheet.getByTestId('m-action-stay')).toBeDisabled();
  await expect(sheet.getByTestId('m-action-main')).toBeEnabled();
});

test('編輯：移到第幾天可以復原，留在原本那天', async ({ page }) => {
  await editDay(page);
  await openActions(page, 'i-2');
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-move').click();
  await sheet.getByTestId('m-move-2027-02-04').click();
  await expect(mCard(page, 'i-2')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().day)).toBe('2027-02-03');
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('已移到 2/4');
  await page.getByTestId('toast-undo').click();
  await expect(mCard(page, 'i-2')).toBeVisible();
});

test('自由時間的子畫面標題是「改時間長度」', async ({ page }) => {
  await editDay(page);
  await page.evaluate(() => {
    const th = (window as any).__th;
    const it = structuredClone(th.dataStore.getState().itinerary);
    return th.shared.changeItinerary(() => {
      it.days.find((d: any) => d.date === '2027-02-03').items.push({ id: 'free-e2e', type: 'free', minutes: 60 });
      return it;
    }, '加自由時間（e2e）');
  });
  await openActions(page, 'free-e2e');
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-free-length').click();
  await expect(sheet.getByTestId('m-action-head')).toContainText('改時間長度');
});

test('編輯中從行程打開的詳情沒有問 AI（半屏聊天藏起來）', async ({ page }) => {
  await editDay(page);
  await mCard(page, 'i-2').getByTestId('trip-card-name').click();
  await mCard(page, 'i-2').getByTestId('trip-card-detail').click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await expect(page.getByTestId('m-detail').getByTestId('ask-ai-box')).toHaveCount(0);
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
  await mCard(page, 'i-2').getByTestId('trip-card-name').click();
  await mCard(page, 'i-2').getByTestId('trip-card-detail').click();
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
  // 照片卡上有想去和「詳情」，點的範圍至少 44px
  const card = chat.getByTestId('m-chat-place').first();
  expect((await card.getByTestId('m-chat-place-like').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await card.getByTestId('m-chat-place-detail').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // 上下文小標：沒有地點時是這天
  await expect(chat.getByTestId('m-chat-context')).toContainText('正在看：');
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

test('行程頁 AI：半屏聊天、上面看得到地圖', async ({ page }) => {
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
  await expect(sheet.getByTestId('m-chat-context')).toContainText('正在看：');
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
  await expect(chat.getByTestId('m-chat-context')).toContainText('關於：');
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
  await card.getByTestId('trip-card-name').click();
  await card.getByTestId('trip-card-detail').click();
  await page.getByTestId('m-detail').getByTestId('ask-ai-prompt').first().click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  const sheet = page.getByTestId('m-chat-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('m-chat-context')).toContainText('關於：橫山展望台');
});

test('手機地圖上的提議列：不被討論、預約蓋住、「不看提議」44px；關掉半屏、離開行程時清掉提議', async ({ page }) => {
  await ready(page);
  await goTab(page, 'ai');
  await page.getByTestId('m-chat-proposal-view').click();
  const bar = page.getByTestId('proposal-bar');
  await expect(bar).toBeVisible();
  const dismiss = bar.getByRole('button', { name: '不看提議', exact: true });
  const box = (await dismiss.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  // 點得到：中心點最上面的就是這個按鈕
  const hit = (sel: string, b: { x: number; y: number; width: number; height: number }) =>
    page.evaluate(([sel, x, y]) => !!document.elementFromPoint(x as number, y as number)?.closest(sel as string), [sel, b.x + b.width / 2, b.y + b.height / 2] as const);
  expect(await hit('.proposal-bar .link-button', box)).toBe(true);
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

test('第七輪：行程地圖上沒有討論、預約、縮放鈕', async ({ page }) => {
  await ready(page);
  await goTab(page, 'trip');
  await expect(page.getByTestId('m-trip-comments')).toHaveCount(0);
  await expect(page.getByTestId('m-trip-reservations')).toHaveCount(0);
  await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveCount(0);
});

test('第七輪：日期晶片第二行只有星期', async ({ page }) => {
  await ready(page);
  await goTab(page, 'trip');
  await expect(page.getByTestId('m-day-2027-02-05')).toHaveText(/^2\/5\s*五$/);
});

test('探索頂部兩列，往下捲剩一列', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  const bar = page.getByTestId('filter-bar');
  expect((await bar.boundingBox())!.height).toBeLessThan(120);
  const typeRow = page.getByTestId('m-feed-type-all');
  expect((await typeRow.boundingBox())!.y).toBeLessThan(160);
  await page.locator('.m-page').evaluate((el) => el.scrollTo(0, 1500));
  await expect(bar).toBeInViewport();
  expect((await bar.boundingBox())!.height).toBeLessThan(64);
  await expect(typeRow).not.toBeInViewport();
});

test('手機探索有清單：切過去出現 88px 的列，❤ 位置固定，重開還記得', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('view-list')).toHaveAttribute('aria-pressed', 'true');
  const rows = page.getByTestId('place-row');
  await expect(rows.first()).toBeVisible();
  await page.getByTestId('m-feed-search').fill('Bayside');
  await expect(rows.nth(1)).toBeVisible();
  const hearts = [await rows.nth(0).getByTestId('card-like').boundingBox(), await rows.nth(1).getByTestId('card-like').boundingBox()];
  expect(Math.round(hearts[0]!.x)).toBe(Math.round(hearts[1]!.x));
  expect(Math.round((await rows.nth(0).boundingBox())!.height)).toBe(88);
  expect(Math.round((await rows.nth(1).boundingBox())!.height)).toBe(88);
  expect(await scrollsSideways(page)).toBe(false);
  // 點列開詳情
  await rows.first().click({ position: { x: 30, y: 40 } });
  await expect(page.getByTestId('m-detail')).toBeVisible();
  // 顯示方式記在 localStorage
  expect(await page.evaluate(() => localStorage.getItem('travel-helper:feedView'))).toBe('list');
  // 切回照片牆
  await page.goBack();
  await page.getByTestId('view-photo').click();
  await expect(page.getByTestId('m-feed-item').first()).toBeVisible();
});

// ---------- 第七輪 Task 6：想去分三段 ----------

test('想去：三段、已排預設收合、跳轉', async ({ page }) => {
  await ready(page);
  await likeMany(page, 12);
  await goTab(page, 'wish');
  await expect(page.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('wish-section-candidate')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('wish-jump-candidate').click();
  await expect(page.getByTestId('wish-jump-candidate')).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(async () => {
      const jump = await page.getByTestId('wish-jump-candidate').boundingBox();
      const head = await page.getByTestId('wish-section-candidate').boundingBox();
      return head!.y - (jump!.y + jump!.height);
    })
    .toBeLessThan(24);
  expect(await scrollsSideways(page)).toBe(false);
});

test('想去：每段先 8 個，再顯示 15 個', async ({ page }) => {
  await ready(page);
  await likeMany(page, 12);
  await goTab(page, 'wish');
  // 類型是一次一類：用景點
  const rows = page.locator('[data-section="unscheduled"] [data-testid="m-wish-item"]');
  const total = Number(((await page.getByTestId('wish-jump-unscheduled').locator('.ui-chip-count').textContent()) ?? '').trim());
  expect(total).toBeGreaterThanOrEqual(12);
  await expect(rows).toHaveCount(8);
  await page.getByTestId('wish-more-unscheduled').click();
  await expect(rows).toHaveCount(Math.min(total, 23));
});

test('想去：點最新留言開詳情的留言分頁', async ({ page }) => {
  await ready(page);
  const [id] = await likeMany(page, 1);
  await page.evaluate((id) => (window as any).__th.shared.comment(id, '這裡晚上很漂亮。要早點去', 'normal'), id);
  await goTab(page, 'wish');
  const row = page.locator(`[data-testid="m-wish-item"][data-id="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByTestId('wish-last-comment')).toHaveText('這裡晚上很漂亮。');
  await row.getByTestId('wish-last-comment').click();
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', id);
  await expect(page.getByTestId('detail-tab-comments')).toHaveAttribute('aria-selected', 'true');
});

test('想去：左滑加到某天', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('th.wishSwipeHint', '1'));
  await ready(page);
  await goTab(page, 'wish');
  const row = page.getByTestId('m-wish-item').first();
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const y = box.y + 30;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 80, y, { steps: 4 });
  await page.mouse.move(box.x + box.width - 140, y, { steps: 4 });
  await page.mouse.up();
  const add = row.getByTestId('wish-swipe-add');
  await expect(add).toBeVisible();
  await expect(page.getByTestId('m-detail')).toHaveCount(0); // 滑完放手不算點
  await add.click();
  await expect(page.getByTestId('day-picker')).toBeVisible();
  await expect(page.getByTestId('day-grid')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await scrollsSideways(page)).toBe(false);
});

test('想去：第一次打開，第一列自己滑一下提示，只提示一次', async ({ page }) => {
  await ready(page);
  await goTab(page, 'wish');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('th.wishSwipeHint'))).toBe('1');
});

test('想去：打開時是「全部」，數字是各類加起來；記住選的類型', async ({ page }) => {
  await ready(page);
  await goTab(page, 'wish');
  await expect(page.getByTestId('m-wish-type-all')).toHaveAttribute('aria-pressed', 'true');
  const n = async (id: string) => Number(((await page.getByTestId(id).textContent()) ?? '').replace(/\D/g, ''));
  const sum = (await n('m-wish-type-restaurant')) + (await n('m-wish-type-lodging')) + (await n('m-wish-type-spot'));
  expect(await n('m-wish-type-all')).toBe(sum);
  await page.getByTestId('m-wish-type-spot').click();
  await goTab(page, 'trip');
  await goTab(page, 'wish');
  await expect(page.getByTestId('m-wish-type-spot')).toHaveAttribute('aria-pressed', 'true');
});

test('想去：照片牆的卡片有誰想去，沒有留言也沒有加到某天', async ({ page }) => {
  await ready(page);
  await goTab(page, 'wish');
  await page.getByTestId('view-photo').click();
  const card = page.getByTestId('m-wish-item').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByTestId('wish-who')).toBeVisible();
  await expect(card.getByTestId('wish-last-comment')).toHaveCount(0);
  await expect(card.getByTestId('wish-swipe-add')).toHaveCount(0);
});

// ---------- 第七輪 Task 7：詳情的頂端列、複製日文名、留言分頁 ----------

test('詳情分頁：簡介、交通、評論、留言（兩邊同一組 testid）', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('ise-naiku', 'explore'));
  const detail = page.getByTestId('m-detail');
  const tabs = detail.locator('[data-testid^="detail-tab-"]');
  await expect(tabs).toHaveText([/簡介/, /交通/, /評論/, /留言/]);
  await detail.getByTestId('detail-tab-transport').click();
  await expect(detail).toContainText('伊勢市宇治館町1');
});

test('詳情：留言分頁可以留言', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-seahorse', 'explore'));
  const detail = page.getByTestId('m-detail');
  await detail.getByTestId('detail-tab-comments').click();
  await detail.getByTestId('comment-input').fill('分頁留言（e2e）');
  await detail.getByTestId('comment-input').press('Enter');
  await expect(detail.getByTestId('wish-comment')).toContainText('分頁留言（e2e）');
});

test('詳情頂端列：捲過照片才出現，不蓋住分頁', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-seahorse', 'explore'));
  const detail = page.getByTestId('m-detail');
  const bar = detail.getByTestId('m-detail-bar');
  await expect(bar).toBeHidden(); // 還在照片上時沒有頂端列
  await detail.locator('.m-detail-scroll').evaluate((el) => el.scrollTo(0, 400));
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId('card-like')).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  const tab = (await detail.getByTestId('detail-tab-comments').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(tab.x).toBeGreaterThanOrEqual(0);
  expect(tab.x + tab.width).toBeLessThanOrEqual(vp.width);
  expect(tab.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 1); // 分頁列接在頂端列下面
  expect(tab.y + tab.height).toBeLessThanOrEqual(vp.height);
  expect(await scrollsSideways(page)).toBe(false);
  // ‹ 在頂端列裡，點了返回
  await bar.getByTestId('m-detail-bar-back').click();
  await expect(detail).toHaveCount(0);
});

test('詳情：複製日文名', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-seahorse', 'explore'));
  await expect(page.getByTestId('m-detail').getByTestId('copy-name')).toBeVisible();
});

test('詳情：想去 N 點了看是誰；編輯中從行程打開有「排進這天」', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-seahorse', 'explore'));
  const detail = page.getByTestId('m-detail');
  await detail.getByTestId('detail-like').click();
  await detail.getByTestId('detail-who').click();
  await expect(detail.getByTestId('avatar-list')).toContainText('我');
  await expect(detail.getByTestId('detail-schedule')).toHaveCount(0);
});


// ---------- 第七輪 Task 8：卡片原地展開、面板頭固定、編輯不拉高、交通面板、問 AI ----------

test('點時間軸的卡：原地展開，沒有地圖小卡片，再點收起', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  const card = page.locator('[data-testid="m-card"][data-item="i-2"]');
  await expect(card.getByTestId('trip-card-expand')).toHaveCount(0);
  await card.getByTestId('trip-card').click();
  const open = card.getByTestId('trip-card-expand');
  await expect(open).toBeVisible();
  await expect(open.locator('.tc-photo')).toHaveCount(3);
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  // 面板高度不變，選中那個點，地圖上看得到它（看得到就不動）
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', 'shima-yokoyama-observatory');
  await expect.poll(() => visibleOnMap(page, 'shima-yokoyama-observatory'), { timeout: 10_000 }).toBe(true);
  // 點別張：這張收起
  const next = page.locator('[data-testid="m-card"][data-item="i-3"]');
  await next.getByTestId('trip-card').click();
  await expect(open).toHaveCount(0);
  await expect(next.getByTestId('trip-card-expand')).toBeVisible();
  await next.locator('.tc-row').click();
  await expect(next.getByTestId('trip-card-expand')).toHaveCount(0);
});

test('編輯不改面板高度，沒有「＋標籤」', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('mid'));
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__thMobile.getState().tripSnap)).toBe('mid');
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
  await expect(page.getByText('＋ 標籤')).toHaveCount(0);
  // 沒有標籤的卡沒有可以點的標籤那一排（有標籤的才有 tag-edit）
  for (const el of await page.getByTestId('tag-edit').all()) await expect(el.getByTestId('item-tag').or(el.getByTestId('lodging-plan-tag')).first()).toBeVisible();
  // 結束編輯也不改
  await page.getByTestId('planning-done').click();
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'mid');
});

test('面板拉滿時日期列和標題還在', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
  await page.getByTestId('m-sheet').locator('.m-trip-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByTestId('m-day-strip')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('m-trip-title')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('m-sheet-grab')).toBeInViewport({ ratio: 1 });
  // 標題真的黏在上面：捲到底之後還是貼著日期列
  const strip = (await page.getByTestId('m-day-strip').boundingBox())!;
  const title = (await page.getByTestId('m-trip-title').boundingBox())!;
  expect(title.y).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
  expect(title.y).toBeLessThan(strip.y + strip.height + 24);
});

test('交通編輯器：點「改」才開，是底部面板，只有一個完成', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  await expect(page.getByTestId('m-leg-sheet')).toHaveCount(0);
  // 點那一行只是展開，不自己開編輯器
  await page.getByTestId('m-leg').first().getByTestId('leg-line-text').click();
  await expect(page.getByTestId('m-leg-sheet')).toHaveCount(0);
  await page.getByTestId('m-leg').first().getByTestId('leg-edit').click();
  const sheet = page.getByTestId('m-leg-sheet');
  await expect(sheet).toHaveCount(1);
  await expect(sheet.getByTestId('leg-editor')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '完成' })).toHaveCount(1);
  await expect(page.getByTestId('leg-done')).toHaveCount(1);
  expect(await scrollsSideways(page)).toBe(false);
  await sheet.getByTestId('leg-done').click();
  await expect(page.getByTestId('m-leg-sheet')).toHaveCount(0);
});

test('問 AI 換掉行程面板，關掉回來、高度不變', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
  await expect(page.getByTestId('m-sheet')).toBeVisible();
  await page.getByTestId('m-trip-ai').click();
  await expect(page.getByTestId('m-chat-sheet')).toBeVisible();
  await expect(page.getByTestId('m-sheet')).toBeHidden();
  await page.getByTestId('m-chat-sheet-close').click();
  await expect(page.getByTestId('m-chat-sheet')).toHaveCount(0);
  await expect(page.getByTestId('m-sheet')).toBeVisible();
  await expect(page.getByTestId('m-sheet')).toHaveAttribute('data-snap', 'high');
});

test('展開的卡：「問 AI」開半屏聊天、「詳細資料」開整頁詳情', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  const card = page.locator('[data-testid="m-card"][data-item="i-2"]');
  await card.getByTestId('trip-card').click();
  await card.getByTestId('trip-card-ask').click();
  await expect(page.getByTestId('m-chat-sheet')).toBeVisible();
  await page.getByTestId('m-chat-sheet-close').click();
  await card.getByTestId('trip-card-detail').click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await expect(page.getByTestId('m-detail-name')).toContainText('橫山展望台');
  expect((await mobileState(page)).detail?.from).toBe('trip');
});

test('編輯條是墨色、有快照；編輯中沒有日期列和 ✦；「改」點的範圍 44px', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  await expect(page.getByTestId('m-trip-ai')).toBeVisible();
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  const bar = page.getByTestId('planning-bar');
  const ink = await page.evaluate(() => { const d = document.createElement('i'); d.style.background = 'var(--ink)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
  expect(await bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(ink);
  await expect(bar).toContainText('編輯 2/3（三）');
  await expect(bar.getByTestId('snapshots-button')).toBeVisible();
  await expect(bar.getByTestId('planning-done')).toBeVisible();
  await expect(page.getByTestId('m-day-strip')).toHaveCount(0);
  await expect(page.getByTestId('m-trip-ai')).toHaveCount(0);
  const edit = page.getByTestId('m-leg').first().getByTestId('leg-edit');
  expect(await edit.evaluate((e) => parseFloat(getComputedStyle(e, '::after').height))).toBeGreaterThanOrEqual(44);
  expect(await edit.evaluate((e) => parseFloat(getComputedStyle(e, '::after').width))).toBeGreaterThanOrEqual(44);
  expect(await scrollsSideways(page)).toBe(false);
});

// ---------- 第七輪 Task 10：選中（數字水滴）、在地圖上看、換分頁取消 ----------

test('詳情的「在地圖上看」：排在某天的點 → 選那天、選中那張卡（展開）', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('shima-la-mer', 'trip'));
  const detail = page.getByTestId('m-detail');
  await detail.getByTestId('detail-tab-transport').click();
  await detail.getByTestId('m-detail-minimap').click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-day-2027-02-03')).toHaveAttribute('aria-current', 'true');
  const card = page.locator('[data-testid="m-card"][data-item="i-3"]');
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(card.getByTestId('trip-card-expand')).toBeVisible();
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', 'shima-la-mer');
});

test('詳情的「在地圖上看」：沒排的點 → 整趟、選中；換分頁取消選中', async ({ page }) => {
  await ready(page);
  const id = await page.evaluate(() => {
    const ds = (window as any).__th.dataStore.getState();
    return ds.places.find((p: any) => p.type === 'spot' && !ds.days.has(p.id)).id;
  });
  await page.evaluate((x) => (window as any).__thMobile.getState().openPlace(x, 'explore'), id);
  const detail = page.getByTestId('m-detail');
  await detail.getByTestId('detail-tab-transport').click();
  await detail.getByTestId('m-detail-minimap').click();
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-day-all')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', id);
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-label', '');
  await goTab(page, 'explore');
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().selectedId)).toBeNull();
  await expect(page.getByTestId('map-selected')).toHaveCount(0);
});

test('再點同一張卡：地圖被移開了也移回看得到的地方', async ({ page }) => {
  await ready(page);
  await pickDay(page, '2027-02-03');
  const card = page.locator('[data-testid="m-card"][data-item="i-2"]');
  await card.getByTestId('trip-card-name').click();
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', 'shima-yokoyama-observatory');
  await page.evaluate(() => (window as any).__th.map.jumpTo({ center: [135.5, 34.7], zoom: 13 }));
  expect(await visibleOnMap(page, 'shima-yokoyama-observatory')).toBe(false);
  await card.getByTestId('trip-card-name').click();
  await expect.poll(() => visibleOnMap(page, 'shima-yokoyama-observatory'), { timeout: 10_000 }).toBe(true);
});
