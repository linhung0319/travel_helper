// T33（設計：docs/superpowers/specs/2026-11-01-discussion-add-place-design.md）手機版：討論按鈕的位置、大彈窗、鍵盤、關閉、返回鍵、加地點彈窗。390、360 都跑。
import { test } from '@playwright/test';
import { expect, goTab, ready, scrollsSideways } from './mobileHelpers.ts';

const DAY = '2027-02-05';

const selectDay = (page: import('@playwright/test').Page, d: string) => page.evaluate((d) => (window as any).__th.commands.selectDay(d), d);

test('討論按鈕：和問 AI、編輯同一排，只有圖示，不換行、沒有橫向捲動；編輯中在編輯條上', async ({ page }) => {
  await ready(page);
  await selectDay(page, DAY);
  const btn = page.getByTestId('discuss-button');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('');
  const ask = (await page.getByTestId('m-trip-ai').boundingBox())!;
  const b = (await btn.boundingBox())!;
  const edit = (await page.getByTestId('m-trip-edit').boundingBox())!;
  // 同一排，順序是問 AI、討論、編輯
  expect(Math.abs(ask.y - b.y)).toBeLessThan(2);
  expect(Math.abs(edit.y - b.y)).toBeLessThan(2);
  expect(ask.x).toBeLessThan(b.x);
  expect(b.x).toBeLessThan(edit.x);
  expect(b.height).toBeGreaterThanOrEqual(44);
  // 星期完整看得到，不會被截斷
  const sub = page.locator('.m-dayhead-sub');
  await expect(sub).toHaveText('週五');
  expect(await sub.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await scrollsSideways(page)).toBe(false);

  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  const bar = page.getByTestId('planning-bar');
  await expect(bar.getByTestId('discuss-button')).toBeVisible();
  await expect(bar.getByTestId('undo-button')).toBeVisible();
  await expect(bar.getByTestId('planning-done')).toBeVisible();
  await expect(bar).toContainText('編輯 2/5');
  // 編輯條一排放得下
  const h = (await bar.boundingBox())!.height;
  expect(h).toBeLessThan(64);
  expect(await scrollsSideways(page)).toBe(false);
});

test('討論按鈕：整趟也有；「我」不再有討論，多了過去的版本', async ({ page }) => {
  await ready(page);
  await page.getByTestId('m-day-all').click();
  await expect(page.getByTestId('discuss-button')).toBeVisible();
  await goTab(page, 'me');
  await expect(page.getByTestId('m-me-comments')).toHaveCount(0);
  await page.getByTestId('m-me-versions').click();
  await expect(page.getByTestId('snapshots-dialog')).toContainText('過去的版本');
});

test('彈窗：✕、點上面露出的一條、往下拉把手、返回鍵都能關', async ({ page }) => {
  await ready(page);
  await selectDay(page, DAY);
  const open = page.getByTestId('discuss-button');
  const box = page.getByTestId('discussion');

  await open.click();
  await expect(box).toHaveAttribute('data-chip', DAY);
  // 大彈窗：蓋住大部分高度，上面露出一條
  const vh = page.viewportSize()!.height;
  const rect = (await box.boundingBox())!;
  expect(rect.height).toBeGreaterThan(vh * 0.85);
  expect(rect.y).toBeGreaterThan(0);
  const x = (await page.getByTestId('discuss-close').boundingBox())!;
  expect(x.height).toBeGreaterThanOrEqual(44);
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByTestId('discuss-close').click();
  await expect(box).toHaveCount(0);

  await open.click();
  await page.getByTestId('discuss-peek').click();
  await expect(box).toHaveCount(0);

  await open.click();
  const grab = (await page.getByTestId('discuss-grab').boundingBox())!;
  await page.getByTestId('discuss-grab').dispatchEvent('pointerdown', { pointerId: 1, clientY: grab.y, bubbles: true });
  await page.getByTestId('discuss-grab').dispatchEvent('pointerup', { pointerId: 1, clientY: grab.y + 100, bubbles: true });
  await expect(box).toHaveCount(0);

  await open.click();
  await expect(box).toBeVisible();
  await page.goBack();
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
});

test('鍵盤：彈窗縮到鍵盤上方，收起篩選，輸入框、送出看得到；留言送得出去；草稿關掉再開還在', async ({ page }) => {
  await ready(page);
  await selectDay(page, DAY);
  await page.getByTestId('discuss-button').click();
  const box = page.getByTestId('discussion');
  const chips = page.getByTestId('discuss-chips');
  await expect(chips).toBeVisible();

  // 模擬鍵盤升起：keyboard.ts 會設 --kb 和 data-keyboard，.m-app 跟著變矮
  const kb = 300;
  await page.evaluate((kb) => {
    document.documentElement.style.setProperty('--kb', `${kb}px`);
    document.documentElement.setAttribute('data-keyboard', '');
  }, kb);
  await expect(chips).toBeHidden();
  await expect(page.getByTestId('discuss-peek')).toBeHidden();
  const vh = page.viewportSize()!.height;
  const visibleBottom = vh - kb;
  const input = page.getByTestId('discuss-input');
  const send = page.getByTestId('discuss-send');
  for (const el of [input, send]) {
    const r = (await el.boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.height).toBeLessThanOrEqual(visibleBottom);
  }
  // 輸入框 16px，iPhone 才不會放大
  expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  await expect(box.getByTestId('discuss-close')).toBeVisible();

  await input.fill('鍵盤開著留言（e2e）');
  await send.click();
  await expect(input).toHaveValue('');
  await expect(box.getByTestId('wish-comment').filter({ hasText: '鍵盤開著留言（e2e）' })).toBeInViewport();

  await input.fill('打到一半');
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--kb');
    document.documentElement.removeAttribute('data-keyboard');
  });
  await page.getByTestId('discuss-close').click();
  await page.getByTestId('discuss-button').click();
  await box.locator(`[data-testid="discuss-thread"][data-target="day:${DAY}"]`).getByTestId('discuss-thread-toggle').click();
  await expect(input).toHaveValue('打到一半');
});

test('日期的留言、地點的留言都走得通；到行程看會選中那張卡', async ({ page }) => {
  await ready(page);
  await selectDay(page, DAY);
  const placeId = await page.evaluate((date) => {
    const d = (window as any).__th.dataStore.getState().itinerary.days.find((x: any) => x.date === date);
    return d.items.find((i: any) => i.type === 'visit').options[0].place as string;
  }, DAY);
  await page.getByTestId('discuss-button').click();
  const box = page.getByTestId('discussion');
  const row = box.locator(`[data-testid="discuss-thread"][data-target="${placeId}"]`);
  await row.getByTestId('discuss-thread-toggle').click();
  await expect(box.getByTestId('discuss-to')).not.toContainText('這天');
  await page.getByTestId('discuss-input').fill('這個點（e2e）');
  await page.getByTestId('discuss-send').click();
  await expect(row.getByTestId('wish-comment')).toContainText('這個點（e2e）');
  await row.getByTestId('discuss-goto').click();
  await expect(box).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__thMobile.getState().focused)).not.toBeNull();
});

test('不在行程時，有新留言「行程」帶紅點', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await expect(page.getByTestId('m-tab-dot-discuss')).toHaveCount(0);
  await page.evaluate(async () => {
    const th = (window as any).__th;
    const s = th.shared.store;
    const { me, members } = s.getState();
    const other = members.find((m: any) => m.id !== me.id);
    const r = await th.shared.comment('trip', '別人留的（e2e）');
    s.setState({ comments: s.getState().comments.map((c: any) => (c.id === r.value.id ? { ...c, author: other.id } : c)) });
  });
  await expect(page.getByTestId('m-tab-dot-discuss')).toBeVisible();
  await goTab(page, 'trip');
  await expect(page.getByTestId('m-tab-dot-discuss')).toHaveCount(0);
  await expect(page.getByTestId('discuss-count').first()).toHaveText('1');
});

test('加地點：搜尋列不動，按鈕在清單標題列；彈窗走完才存；返回鍵關掉；鍵盤開著按鈕捲得到', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  // 篩選、排序的文字都還在
  await expect(page.getByTestId('filter-open')).toContainText('篩選');
  const open = page.getByTestId('add-place-open');
  await expect(open).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  await open.click();
  const dialog = page.getByTestId('add-dialog');
  await expect(dialog.getByTestId('add-entry-input')).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);

  await open.click();
  await dialog.getByTestId('add-entry-pin').click();
  await expect(dialog.getByTestId('add-map')).toBeVisible();
  await expect(dialog.getByTestId('add-pin')).toBeVisible();
  await expect(dialog.getByTestId('add-save')).toBeDisabled();
  await dialog.getByTestId('add-name').fill('E2E 手機的店');

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kb', '300px');
    document.documentElement.setAttribute('data-keyboard', '');
  });
  await expect(dialog.getByTestId('add-map')).toBeHidden();
  await dialog.getByTestId('add-type-restaurant').click();
  const save = dialog.getByTestId('add-save');
  await save.scrollIntoViewIfNeeded();
  const r = (await save.boundingBox())!;
  expect(r.y + r.height).toBeLessThanOrEqual(page.viewportSize()!.height - 300);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--kb');
    document.documentElement.removeAttribute('data-keyboard');
  });

  const count = () => page.evaluate(() => (window as any).__th.shared.store.getState().userPlaces.length);
  const before = await count();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(await count()).toBe(before + 1);
});

test('類型列：沒有套用的晶片；「現在看」那一列有一顆（T64 取代篩選按鈕的數字）', async ({ page }) => {
  await ready(page);
  await goTab(page, 'explore');
  await page.getByTestId('filter-open').click();
  await page.locator('[data-testid^="filter-opt-tier-"]').first().click();
  await page.getByTestId('filter-done').click();
  await expect(page.locator('[data-testid="cond-chip"]:not([data-key="query"])')).toHaveCount(1);
  await expect(page.getByTestId('filter-applied')).toHaveCount(0);
});

test('上一步：手機編輯條上按得到，沒有可退時是灰的', async ({ page }) => {
  await ready(page);
  await selectDay(page, DAY);
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  const undo = page.getByTestId('undo-button');
  await expect(undo).toBeDisabled();
  const before = await page.evaluate(() => JSON.stringify((window as any).__th.dataStore.getState().itinerary));
  await page.evaluate(async (d) => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => ({ ...it, days: it.days.map((x: any) => (x.date === d ? { ...x, note: '（e2e）' } : x)) }), '改一下（e2e）');
  }, DAY);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).__th.dataStore.getState().itinerary))).toBe(before);
  await expect(undo).toBeDisabled();
});
