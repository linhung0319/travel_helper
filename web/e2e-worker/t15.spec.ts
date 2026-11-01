// T15 完成條件（PLAN）：流程同 T15m，但是真的 Worker、D1；「別人」是另一個登入的帳號；重新整理後資料還在。
// 正式 build 沒有 window.__th，全部走畫面。手機（390×844）、電腦（1280×800）各跑一次。

import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createItinerary } from '@travel-helper/engine';
import { resetUserData } from './serve.mjs';

const DAY = '2027-02-07';
const PLACE = 'toba-aquarium';
const NAME = '鳥羽水族館';
const TEXT = '想早上去（e2e）';

type Ctx = { desktop: boolean; a: Page; b: Page };

async function login(browser: Browser, baseURL: string, member: string, use: Record<string, unknown>): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...use, baseURL, extraHTTPHeaders: { 'x-dev-member': member } });
  const page = await context.newPage();
  // 不連公開的 OSRM：行程線維持直線，結果固定
  await page.route('**/routing.openstreetmap.de/**', (r) => r.abort());
  return { context, page };
}

const test = base.extend<Ctx>({
  desktop: async ({ viewport }, use) => use((viewport?.width ?? 0) >= 1100),
  a: async ({ browser, baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }, use) => {
    const { context, page } = await login(browser, baseURL!, 'dev-a', { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
    await use(page);
    await context.close();
  },
  b: async ({ browser, baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }, use) => {
    const { context, page } = await login(browser, baseURL!, 'dev-b', { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
    await use(page);
    await context.close();
  },
});

test.beforeEach(() => resetUserData());

/** 打開網站，等第一個畫面好（電腦版右欄的分頁、手機版底部的分頁） */
async function open(page: Page, desktop: boolean) {
  await page.goto('/');
  await expect(page.getByTestId(desktop ? 'side-tab-explore' : 'm-tab-explore')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);
}

/** 探索搜尋名字，打開詳情 */
async function openDetail(page: Page, desktop: boolean, name = NAME) {
  if (desktop) {
    await page.getByTestId('side-tab-explore').click();
    await page.getByTestId('search').fill(name);
    await page.getByTestId('explore-item').first().click();
    await page.getByTestId('place-open-detail').click();
    await expect(page.getByTestId('detail-name')).toContainText(name);
  } else {
    await page.getByTestId('m-tab-explore').click();
    await page.getByTestId('m-feed-search').fill(name);
    await page.locator('[data-testid="m-feed-item"], [data-testid="place-row"]').first().click();
    await expect(page.getByTestId('m-detail-name')).toContainText(name);
  }
  return page.getByTestId('place-detail');
}

async function closeDetail(page: Page, desktop: boolean) {
  await page.getByTestId(desktop ? 'detail-close' : 'm-detail-back').click();
  await expect(page.getByTestId('place-detail')).toHaveCount(0);
}

/** 行程分頁的某一天 */
async function showDay(page: Page, desktop: boolean, day = DAY) {
  await page.getByTestId(desktop ? 'side-tab-day' : 'm-tab-trip').click();
  await page.getByTestId(`m-day-${day}`).click();
}

async function enterPlanning(page: Page, desktop: boolean) {
  await page.getByTestId(desktop ? 'planning-toggle' : 'm-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
}

/** 切回分頁：馬上打一次 /api/sync（不等 30 秒） */
const syncNow = async (page: Page) => {
  const done = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.ok());
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await done;
};

/** 這天排進去的那張卡 */
const scheduled = (page: Page, desktop: boolean) =>
  desktop ? page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${PLACE}"]`) : page.locator('[data-testid="m-card"]', { hasText: NAME });

/** 這天的候選 */
const candidate = (page: Page, desktop: boolean) =>
  desktop ? page.getByTestId('day-candidates').locator(`[data-testid="cand-item"][data-id="${PLACE}"]`) : page.locator('[data-testid="m-cand"]', { hasText: NAME });

async function schedule(page: Page, desktop: boolean) {
  const c = candidate(page, desktop);
  if (desktop) await c.getByTestId('cand-up').click();
  else {
    await c.getByTestId('m-card-menu').click();
    await page.getByTestId('m-action-sheet').getByRole('menuitem', { name: '排進這天' }).click();
  }
  await expect(candidate(page, desktop)).toHaveCount(0);
  await expect(scheduled(page, desktop)).toBeVisible();
}

/** 停留時間 ＋15 */
async function addStay(page: Page, desktop: boolean) {
  const row = scheduled(page, desktop);
  if (desktop) {
    const chip = row.getByTestId('stay-chip');
    const was = await chip.innerText();
    await row.getByTestId('stay-plus').click();
    await expect(chip).not.toHaveText(was);
    return;
  }
  await row.getByTestId('m-card-menu').click();
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-stay').click();
  const now = sheet.getByTestId('m-stay-now');
  const was = await now.innerText();
  await sheet.getByTestId('m-stay-plus').click();
  await expect(now).not.toHaveText(was);
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } }).catch(() => page.keyboard.press('Escape'));
  await expect(sheet).toHaveCount(0);
}

/** 先放一份行程：這天有一張別的卡（同區域），之後排進去的點才有交通 */
async function seedItinerary(page: Page) {
  const list = await (await page.request.get('/api/places')).json();
  const other = list.places.find((p: { type: string; area: string; id: string }) => p.type === 'spot' && p.area === 'toba' && p.id !== PLACE);
  const it = createItinerary();
  it.days
    .find((d) => d.date === DAY)!
    .items.push({ id: 'i-90', type: 'visit', options: [{ place: other.id, stayMinutes: null, note: null }], selected: 0, start: null, travel: null, note: null } as never);
  it.seq = 90;
  expect((await page.request.put('/api/itinerary', { data: { version: 0, data: it } })).status()).toBe(200);
}

test('第一次打開：資料庫沒有行程時建好第一份（有航班）；重新整理後同一份', async ({ a, desktop }) => {
  await open(a, desktop);
  await expect.poll(async () => (await (await a.request.get('/api/itinerary')).json()).version).toBe(1);
  const doc = await (await a.request.get('/api/itinerary')).json();
  expect(doc.data.days).toHaveLength(12);
  expect(doc.data.days[0].items.filter((i: { type: string }) => i.type === 'flight')).toHaveLength(2);
  await open(a, desktop);
  expect((await (await a.request.get('/api/itinerary')).json()).version).toBe(1);
});

test('T15：想去 → 留言 → 別人看得到、改不了 → 加到某天 → 編輯中排進 → 停留時間 → 復原快照；重新整理後都還在', async ({ a, b, desktop }) => {
  await seedItinerary(a);
  await open(a, desktop);

  // 1. 甲按 ❤️、留言
  let detail = await openDetail(a, desktop);
  await detail.getByTestId('detail-like').click();
  await expect(detail.getByTestId('detail-like')).toHaveAttribute('aria-pressed', 'true');
  await detail.getByTestId('detail-tab-comments').click();
  await detail.getByTestId('comment-input').fill(TEXT);
  await detail.getByTestId('comment-input').press('Enter');
  await expect(detail.getByTestId('wish-comment')).toContainText(TEXT);

  // 重新整理：❤️、留言還在
  await open(a, desktop);
  detail = await openDetail(a, desktop);
  await expect(detail.getByTestId('detail-like')).toHaveAttribute('aria-pressed', 'true');
  await detail.getByTestId('detail-tab-comments').click();
  await expect(detail.getByTestId('wish-comment')).toContainText(TEXT);
  await expect(detail.getByTestId('wish-comment').getByRole('button', { name: '改' })).toHaveCount(1);
  await closeDetail(a, desktop);

  // 2. 乙看得到留言、改不了；❤️ 數是 1；加到 2/7
  await open(b, desktop);
  detail = await openDetail(b, desktop);
  await expect(detail.getByTestId('detail-who')).toHaveText('1');
  await detail.getByTestId('detail-tab-comments').click();
  await expect(detail.getByTestId('wish-comment')).toContainText(TEXT);
  await expect(detail.getByTestId('wish-comment').getByRole('button', { name: '改' })).toHaveCount(0);
  await detail.getByTestId('detail-add').getByRole('button').click();
  await b.getByTestId(`day-picker-${DAY}`).click();
  await b.getByTestId('day-picker-done').click();
  await closeDetail(b, desktop);

  // 3. 甲同步之後看到候選，編輯中排進：時間軸出現，有交通
  await syncNow(a);
  await showDay(a, desktop);
  await expect(candidate(a, desktop)).toBeVisible();
  await enterPlanning(a, desktop);
  await schedule(a, desktop);
  await expect(desktop ? a.getByTestId('timeline').getByTestId('tl-leg').first() : a.getByTestId('m-sheet').locator('[data-testid^="m-leg"]').first()).toBeVisible();

  // 4. 停留時間 ＋15
  await addStay(a, desktop);

  // 5. 乙同步看到（別人改的），重新整理也還在
  await syncNow(b);
  await showDay(b, desktop);
  await expect(scheduled(b, desktop)).toBeVisible();
  await open(b, desktop);
  await showDay(b, desktop);
  await expect(scheduled(b, desktop)).toBeVisible();

  // 6. 復原快照：回到排進去之前（最舊的那份之後的第一份）
  await a.getByTestId('snapshots-button').click();
  const snap = a.getByTestId('snapshot').last();
  await snap.getByTestId('snapshot-restore').click();
  await snap.getByTestId('snapshot-restore-confirm').click();
  await expect(a.getByTestId('snapshots-dialog')).toHaveCount(0);
  await expect(scheduled(a, desktop)).toHaveCount(0);
  await open(a, desktop);
  await showDay(a, desktop);
  await expect(scheduled(a, desktop)).toHaveCount(0);
});

test('T15：同時編輯：別人先存了，存不了、提示重新載入，重新載入後再改得到', async ({ a, b, desktop }) => {
  // 這天先有一張卡
  const it = createItinerary();
  it.days.find((d) => d.date === DAY)!.items.push({ id: 'i-90', type: 'visit', options: [{ place: PLACE, stayMinutes: null, note: null }], selected: 0, start: null, travel: null, note: null } as never);
  it.seq = 90;
  expect((await a.request.put('/api/itinerary', { data: { version: 0, data: it } })).status()).toBe(200);

  await open(a, desktop);
  await open(b, desktop);
  await showDay(a, desktop);
  await showDay(b, desktop);
  await enterPlanning(a, desktop);
  await enterPlanning(b, desktop);

  // 甲先存；乙手上還是舊版本（還沒同步）：存不了
  await addStay(a, desktop);
  await addStayExpectConflict(b, desktop);
  await expect(b.getByTestId('conflict-bar')).toBeVisible();

  await b.getByTestId('conflict-bar').getByRole('button').click();
  await expect(b.getByTestId('conflict-bar')).toHaveCount(0);
  await addStay(b, desktop);
  expect((await (await b.request.get('/api/itinerary')).json()).version).toBe(3);
});

async function addStayExpectConflict(page: Page, desktop: boolean) {
  const row = scheduled(page, desktop);
  if (desktop) {
    await row.getByTestId('stay-plus').click();
    return;
  }
  await row.getByTestId('m-card-menu').click();
  const sheet = page.getByTestId('m-action-sheet');
  await sheet.getByTestId('m-action-stay').click();
  await sheet.getByTestId('m-stay-plus').click();
  await expect(page.getByTestId('conflict-bar').or(sheet)).toBeVisible();
  await page.getByTestId('m-sheet-dim').click({ position: { x: 20, y: 20 } }).catch(() => page.keyboard.press('Escape'));
  await expect(sheet).toHaveCount(0);
}

test('T15：預約筆記、整趟留言、自己加的點都存進 D1，重新整理後還在', async ({ a, desktop }) => {
  await open(a, desktop);
  // 這些畫面的流程 T15m、T31 測過；這裡確定走得到 Worker：API 寫入，畫面重新整理後讀得到
  await a.request.post('/api/comments', { data: { target: 'trip', text: '整趟留言（e2e）' } });
  const up = await a.request.post('/api/user-places', { data: { type: 'spot', data: { name: { zh: '自己加的點（e2e）' }, coords: [136.84, 34.48], addedVia: 'map' } } });
  expect(up.status()).toBe(201);
  await a.request.put('/api/reservations', { data: { date: DAY, placeId: PLACE, status: 'booked', note: '已訂（e2e）' } });
  await open(a, desktop);
  const d = await openDetail(a, desktop, '自己加的點（e2e）');
  await expect(d.getByTestId('detail-user-badge')).toBeVisible();
  const boot = await (await a.request.get('/api/bootstrap')).json();
  expect(boot.comments.map((c: { text: string }) => c.text)).toContain('整趟留言（e2e）');
  expect(boot.reservations[0].note).toBe('已訂（e2e）');
});

test('T15：載入：一支啟動 API，引擎一個檔；詳情層閒置時讀；輪詢只打 /api/sync', async ({ a, desktop }) => {
  const urls: string[] = [];
  a.on('request', (r) => urls.push(new URL(r.url()).pathname));
  await open(a, desktop);
  await expect.poll(() => urls.includes('/api/places/details')).toBe(true);
  await expect.poll(() => urls.includes('/static/timetables/engine.json')).toBe(true);
  const count = (u: string) => urls.filter((x) => x === u).length;
  expect(count('/api/bootstrap')).toBe(1);
  expect(count('/api/places')).toBe(1);
  expect(count('/static/timetables/engine.json')).toBe(1);
  for (const old of ['/api/me', '/api/members', '/api/votes', '/api/comments', '/api/candidates', '/api/reservations', '/api/edits', '/api/user-places', '/api/itinerary/snapshots']) expect(count(old), old).toBe(0);
  expect(urls.filter((u) => /\/static\/timetables\/(bus|ferry|jr|urban|kintetsu)\//.test(u))).toEqual([]);
  // 資料點、時刻表不在 /assets/
  expect(urls.filter((u) => /\/assets\/(places|timetables)/.test(u))).toEqual([]);

  urls.length = 0;
  await syncNow(a);
  expect(urls).toEqual(['/api/sync']);
});

test('T15：詳情層還沒到顯示骨架，到了顯示內容（含其他資訊）；讀不到可以重試', async ({ a, desktop }) => {
  let hold = true;
  let fail = true;
  await a.route('**/api/places/details', async (route) => {
    while (hold) await new Promise((r) => setTimeout(r, 100));
    if (fail) await route.abort();
    else await route.continue();
  });
  await open(a, desktop);
  const body = await (await a.request.get('/api/places/details')).json();
  const lodging = body.details.find((d: { extra?: { onsen?: string } }) => d.extra?.onsen);
  const list = await (await a.request.get('/api/places')).json();
  const name = list.places.find((p: { id: string }) => p.id === lodging.id).name;
  const d = await openDetail(a, desktop, name.zh || name.ja);
  await expect(d.getByTestId('detail-skeleton')).toBeVisible();
  hold = false;
  await expect(d.getByTestId('detail-error')).toBeVisible();
  fail = false;
  await d.getByTestId('detail-retry').click();
  await expect(d.getByTestId('detail-skeleton')).toHaveCount(0);
  const extra = d.getByTestId('detail-extra');
  await expect(extra).toContainText('溫泉');
  await expect(extra).toContainText(lodging.extra.onsen.slice(0, 8));
  await expect(extra).not.toContainText('scripts/');
});

test('T15：401 登入過期：回到登入頁', async ({ a, desktop }) => {
  await open(a, desktop);
  await a.route('**/api/sync', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized', message: '請先登入' }) }));
  const reloaded = a.waitForEvent('load');
  await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await reloaded;
});
