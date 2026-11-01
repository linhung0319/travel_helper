// T32 載入和效率（網頁）：開機骨架、探索分批、照片照畫面給尺寸、快進畫面才載、打不開退回原圖。
// 外站照片全部換成一張小圖（不連外站，結果固定）。
import { test, type Page } from '@playwright/test';
import { expect, ready } from './helpers.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

async function stubPhotos(page: Page) {
  const requested: string[] = [];
  await page.route(/^https:\/\/(?!tiles\.|fonts\.|routing\.).*\.(jpe?g|png|webp|gif)|googleusercontent\.com/i, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  return requested;
}

/** 第一張照片符合 pattern、照片張數至少 minPhotos 的點 */
const findPlace = (page: Page, source: string, minPhotos = 1) =>
  page.evaluate(
    ([src, min]) => {
      const re = new RegExp(src as string);
      const p = (window as any).__th.dataStore.getState().places.find((x: any) => x.type !== 'station' && x.photos.length >= (min as number) && re.test(x.photos[0].url));
      return { id: p.id as string, url: p.photos[0].url as string, name: (p.name.zh || p.name.ja) as string };
    },
    [source, minPhotos],
  );

const RAKUTEN = '^https://img\\.travel\\.rakuten\\.co\\.jp/share/HOTEL/(\\d+)/\\1\\.jpg$';
const GOOGLE = '^https://lh\\d+\\.googleusercontent\\.com/.+=w\\d+$';

/** 開探索、只列這一個點（用 AI 結果集，不靠名稱搜尋） */
async function showOnly(page: Page, id: string) {
  await page.getByTestId('side-tab-explore').click();
  await page.evaluate((x) => (window as any).__th.commands.showResult([x], { title: '測試' }), id);
  return page.locator(`[data-testid="explore-item"][data-id="${id}"]`);
}

test('開機骨架：資料還沒好時看得到，好了就拿掉', async ({ page }) => {
  await page.route('**/src/App.tsx*', async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#boot')).toBeVisible();
  await page.waitForFunction(() => (window as any).__th?.dataStore.getState().status === 'ready');
  await expect(page.locator('#boot')).toHaveCount(0);
});

test('探索分批畫：一開始 60 張，捲到底多畫；要捲到還沒畫的卡片也找得到', async ({ page }) => {
  await stubPhotos(page);
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const items = page.getByTestId('explore-item');
  await expect(items).toHaveCount(60);
  const total = await page.evaluate(() => {
    const places = (window as any).__th.dataStore.getState().places;
    return places.filter((p: any) => p.type !== 'station').length;
  });
  expect(total).toBeGreaterThan(60);
  await page.locator('.side-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect.poll(() => items.count()).toBeGreaterThan(60);

  // 排在很後面的點：revealInExplore 要先畫到它再捲過去
  const lastId = await page.evaluate(() => {
    const s = (window as any).__th;
    return s.dataStore.getState().places.filter((p: any) => p.type !== 'station').at(-1).id as string;
  });
  await page.evaluate((id) => (window as any).__th.appStore.getState().revealInExplore(id), lastId);
  await expect(page.locator(`[data-testid="explore-item"][data-id="${lastId}"]`)).toBeInViewport();
});

test('快進畫面才載照片：開探索只載前面幾張', async ({ page }) => {
  const requested = await stubPhotos(page);
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await expect(page.getByTestId('explore-item')).toHaveCount(60);
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const withSrc = await page.locator('[data-testid="explore-item"] img[src]').count();
  const without = await page.locator('[data-testid="explore-item"] img:not([src])').count();
  expect(without).toBeGreaterThan(withSrc);
});

test('楽天主照片：卡片用 HIMG/300，展開換原圖', async ({ page }) => {
  await stubPhotos(page);
  await ready(page);
  const place = await findPlace(page, RAKUTEN);
  const hotel = /HOTEL\/(\d+)\//.exec(place.url)![1];
  const card = await showOnly(page, place.id);
  const img = card.locator('img.photo').first();
  await expect(img).toHaveAttribute('src', `https://img.travel.rakuten.co.jp/HIMG/300/${hotel}.jpg`);
  await card.click();
  await expect(card.locator('img.photo').first()).toHaveAttribute('src', place.url);
});

test('Google 照片：卡片 =w500，展開 =w1000', async ({ page }) => {
  await stubPhotos(page);
  await ready(page);
  const place = await findPlace(page, GOOGLE);
  const base = place.url.replace(/=[^=]*$/, '');
  const card = await showOnly(page, place.id);
  await expect(card.locator('img.photo').first()).toHaveAttribute('src', `${base}=w500`);
  await card.click();
  await expect(card.locator('img.photo').first()).toHaveAttribute('src', `${base}=w1000`);
});

test('小尺寸的網址打不開：退回原圖', async ({ page }) => {
  await stubPhotos(page);
  await page.route('**/HIMG/**', (route) => route.abort());
  await ready(page);
  const place = await findPlace(page, RAKUTEN);
  const card = await showOnly(page, place.id);
  await expect(card.locator('img.photo').first()).toHaveAttribute('src', place.url);
});

test('詳情的輪播：只載目前這張和下一張', async ({ page }) => {
  await stubPhotos(page);
  await ready(page);
  const place = await findPlace(page, '^https://', 3);
  await page.evaluate((id) => (window as any).__th.appStore.getState().openDetail(id, 'explore', undefined, 'map'), place.id);
  const slides = page.getByTestId('detail-photo');
  await expect(slides.first().locator('img[src]')).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(await slides.count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator('[data-testid="detail-photo"] img[src]').count()).toBeLessThanOrEqual(2);
});
