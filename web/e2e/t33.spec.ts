// T33（設計：docs/superpowers/specs/2026-11-01-discussion-add-place-design.md）網頁版：討論按鈕和彈窗、上一步、過去的版本、加地點彈窗、類型列。
import { test, expect } from '@playwright/test';
import { pickType, ready } from './helpers.ts';

const DAY = '2027-02-05';

/** 這天第一個排進去的點 */
const firstPlaceOn = (page: import('@playwright/test').Page, date: string) =>
  page.evaluate((date) => {
    const d = (window as any).__th.dataStore.getState().itinerary.days.find((x: any) => x.date === date);
    return d.items.find((i: any) => i.type === 'visit').options[0].place as string;
  }, date);

/** 換成別人留一則（假後端的 dev 掛勾沒有換人時，直接換 me） */
const asOther = async (page: import('@playwright/test').Page, target: string, text: string) => {
  await page.evaluate(
    async ([target, text]) => {
      const th = (window as any).__th;
      const s = th.shared.store;
      const { me, members } = s.getState();
      const other = members.find((m: any) => m.id !== me.id);
      const r = await th.shared.comment(target, text);
      s.setState({ comments: s.getState().comments.map((c: any) => (c.id === r.value.id ? { ...c, author: other.id } : c)) });
    },
    [target, text] as const,
  );
};

test('討論按鈕：行程這一排只有圖示和數字，樣式跟著問 AI；編輯中在編輯條上', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  const nav = page.getByTestId('day-nav');
  const btn = nav.getByTestId('discuss-button');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('');
  await expect(btn).toHaveClass(/ask-ai-quiet/);
  await expect(page.getByTestId('day-title-sub')).not.toContainText('第');

  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  const bar = page.getByTestId('planning-bar');
  await expect(bar.getByTestId('discuss-button')).toBeVisible();
  await expect(bar.getByTestId('undo-button')).toBeVisible();
  await expect(bar.getByTestId('planning-done')).toBeVisible();
  await expect(bar.getByTestId('day-ask-ai')).toBeVisible();
  await expect(page.getByTestId('snapshots-button')).toHaveCount(0);
  await expect(nav).toHaveCount(0);
});

test('討論按鈕：整趟也有；頭像選單不再有討論', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.getByTestId('m-day-all').click();
  await expect(page.getByTestId('discuss-button')).toBeVisible();
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('account-comments')).toHaveCount(0);
  await expect(page.getByTestId('account-versions')).toBeVisible();
});

test('彈窗：某一天置頂、留言存對對象；輸入框跟著展開的對象換；Esc 關掉', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  const placeId = await firstPlaceOn(page, DAY);
  await page.getByTestId('discuss-button').click();
  const box = page.getByTestId('discussion');
  await expect(box).toHaveAttribute('data-chip', DAY);

  // 這天的討論置頂，沒留言也列
  const threads = box.getByTestId('discuss-thread');
  await expect(threads.first()).toHaveAttribute('data-target', `day:${DAY}`);
  await expect(box.getByTestId('discuss-to')).toContainText('這天');

  // 留給這天
  await box.getByTestId('discuss-input').fill('這天想輕鬆一點（e2e）');
  await box.getByTestId('discuss-send').click();
  await expect(threads.first().getByTestId('wish-comment')).toContainText('這天想輕鬆一點（e2e）');

  // 展開一個點：留給那個點
  const row = box.locator(`[data-testid="discuss-thread"][data-target="${placeId}"]`);
  await row.getByTestId('discuss-thread-toggle').click();
  await expect(row).toHaveAttribute('data-open', 'true');
  await expect(box.getByTestId('discuss-to')).not.toContainText('這天');
  await box.getByTestId('discuss-input').fill('這個點的留言（e2e）');
  await box.getByTestId('discuss-input').press('Enter');
  await expect(row.getByTestId('wish-comment')).toContainText('這個點的留言（e2e）');

  const targets = await page.evaluate(() => (window as any).__th.shared.store.getState().comments.filter((c: any) => c.text.includes('（e2e）')).map((c: any) => c.target));
  expect(targets.sort()).toEqual([`day:${DAY}`, placeId].sort());

  // 一次只展開一個
  await threads.first().getByTestId('discuss-thread-toggle').click();
  await expect(box.locator('[data-testid="discuss-thread"][data-open]')).toHaveCount(1);

  // 焦點在輸入框時 Esc 不關，草稿不會不見
  await box.getByTestId('discuss-input').fill('打到一半');
  await box.getByTestId('discuss-input').press('Escape');
  await expect(box).toBeVisible();
  await box.getByTestId('discuss-close').click();
  await expect(box).toHaveCount(0);
  await page.getByTestId('discuss-button').click();
  await box.locator(`[data-testid="discuss-thread"][data-target="day:${DAY}"]`).getByTestId('discuss-thread-toggle').click();
  await expect(box.getByTestId('discuss-input')).toHaveValue('打到一半');
  await box.getByTestId('discuss-to').click();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
});

test('留言：改、刪在名字那一行右邊；刪要再確認，取消在刪原本的位置；輸入框跟著字長高', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  await page.getByTestId('discuss-button').click();
  const box = page.getByTestId('discussion');
  const input = box.getByTestId('discuss-input');

  // 一行 → 長留言長高，有上限；Shift＋Enter 換行、Enter 送出
  const h1 = (await input.boundingBox())!.height;
  const long = '長輩走這段比較舒服，小孩也有得看。'.repeat(8);
  await input.fill(long);
  const h2 = (await input.boundingBox())!.height;
  expect(h2).toBeGreaterThan(h1);
  expect(h2).toBeLessThanOrEqual(136);
  await input.fill('第一行（e2e）');
  await input.press('Shift+Enter');
  await input.pressSequentially('第二行');
  await expect(input).toHaveValue('第一行（e2e）\n第二行');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  expect((await input.boundingBox())!.height).toBe(h1);
  const row = box.getByTestId('wish-comment').filter({ hasText: '第一行（e2e）' });
  await expect(row).toBeVisible();

  // 改、刪和名字同一行，內文用滿寬度
  const head = (await row.locator('.wish-comment-head').boundingBox())!;
  const del = row.getByTestId('comment-delete');
  const delBox = (await del.boundingBox())!;
  expect(delBox.y).toBeLessThan(head.y + head.height);
  expect(delBox.x + delBox.width).toBeGreaterThan(head.x + head.width - 2);

  // 改：多行輸入框，游標在最後，Esc 取消、Enter 存
  await row.getByRole('button', { name: '改', exact: true }).click();
  const edit = row.getByTestId('comment-edit-input');
  await expect(edit).toBeFocused();
  await edit.press('Escape');
  await expect(edit).toHaveCount(0);
  await row.getByRole('button', { name: '改', exact: true }).click();
  await edit.pressSequentially('改過');
  await edit.press('Enter');
  await expect(row.locator('.wish-comment-text')).toHaveText('第一行（e2e）\n第二行改過');

  // 刪：先問；取消在刪原本的位置，連按兩下不會刪掉
  const before = (await del.boundingBox())!;
  await del.click();
  const cancel = row.getByTestId('comment-delete-cancel');
  const after = (await cancel.boundingBox())!;
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);
  await page.mouse.click(after.x + after.width / 2, after.y + after.height / 2);
  await expect(row).toBeVisible();
  await expect(del).toBeVisible();
  await del.click();
  await row.getByTestId('comment-delete-confirm').click();
  await expect(row).toHaveCount(0);
});

test('篩選：全部照最新留言排、整趟只有整趟；點地圖關掉', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.getByTestId('m-day-all').click();
  const placeId = await firstPlaceOn(page, DAY);
  await page.evaluate(async (placeId) => {
    const s = (window as any).__th.shared;
    await s.comment('trip', '整趟的留言（e2e）');
    await s.comment(placeId, '最新的留言（e2e）');
  }, placeId);
  await page.getByTestId('discuss-button').click();
  const box = page.getByTestId('discussion');
  await expect(box).toHaveAttribute('data-chip', 'all');
  await expect(box.getByTestId('discuss-thread').first()).toHaveAttribute('data-target', placeId);
  await box.getByTestId('discuss-chip-trip').click();
  await expect(box.getByTestId('discuss-thread')).toHaveCount(1);
  await expect(box.getByTestId('discuss-thread').first()).toHaveAttribute('data-open', 'true');
  await expect(box.getByTestId('wish-comment').last()).toContainText('整趟的留言（e2e）');
  await box.getByTestId('discuss-chip-2027-02-06').click();
  await expect(box.getByTestId('discuss-thread').first()).toHaveAttribute('data-target', 'day:2027-02-06');
  await page.getByTestId('map').click({ position: { x: 10, y: 400 } });
  await expect(box).toHaveCount(0);
});

test('點換到另一天：留言跟著點走；到行程看會換到那天', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  const placeId = await firstPlaceOn(page, DAY);
  await page.evaluate(async (placeId) => (window as any).__th.shared.comment(placeId, '跟著點走（e2e）'), placeId);
  await page.getByTestId('discuss-button').click();
  const box = page.getByTestId('discussion');
  const row = box.locator(`[data-testid="discuss-thread"][data-target="${placeId}"]`);
  await row.getByTestId('discuss-thread-toggle').click();
  await row.getByTestId('discuss-goto').click();
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId('day-title-date')).toHaveText('2/5');
  expect(await page.evaluate(() => (window as any).__th.appStore.getState().selectedId)).toBe(placeId);
});

test('未讀：別人留言數字增加，打開歸零，自己的不算；不在行程時分頁帶紅點', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  const btn = page.getByTestId('discuss-button');
  await expect(btn.getByTestId('discuss-count')).toHaveCount(0);

  await page.evaluate(() => (window as any).__th.shared.comment('trip', '自己留的（e2e）'));
  await expect(btn.getByTestId('discuss-count')).toHaveCount(0);

  await asOther(page, 'trip', '別人留的（e2e）');
  await expect(btn.getByTestId('discuss-count')).toHaveText('1');
  await page.getByTestId('side-tab-explore').click();
  await expect(page.getByTestId('side-tab-dot-discuss')).toBeVisible();
  await page.getByTestId('side-tab-day').click();

  await btn.click();
  const box = page.getByTestId('discussion');
  await box.getByTestId('discuss-chip-all').click();
  await expect(box.locator('[data-testid="discuss-thread"][data-target="trip"]').getByTestId('discuss-new')).toBeVisible();
  await box.getByTestId('discuss-close').click();
  await expect(btn.getByTestId('discuss-count')).toHaveCount(0);

  // 重新整理後還記得看到哪裡（新裝置才算全部已讀）
  await page.reload();
  await page.waitForFunction(() => (window as any).__th?.dataStore.getState().status === 'ready');
  await page.getByTestId('side-tab-day').click();
  await expect(page.getByTestId('discuss-button').first().getByTestId('discuss-count')).toHaveCount(0);
});

test('上一步：沒有復原提示的修改也能退、連退、結束編輯後清空', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), DAY);
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  const undo = page.getByTestId('undo-button');
  await expect(undo).toBeDisabled();
  const json = () => page.evaluate(() => JSON.stringify((window as any).__th.dataStore.getState().itinerary));
  const start = await json();

  // 改停留時間（＋）：沒有復原提示的修改
  await page.getByTestId('timeline').getByTestId('stay-plus').first().click();
  await expect(undo).toBeEnabled();
  await page.waitForFunction(() => !(window as any).__th.shared.store.getState().saving);
  const once = await json();
  expect(once).not.toBe(start);
  await page.getByTestId('timeline').getByTestId('stay-plus').first().click();
  await expect.poll(json).not.toBe(once);

  await undo.click();
  await expect.poll(json).toBe(once);
  await undo.click();
  await expect.poll(json).toBe(start);
  await expect(undo).toBeDisabled();

  await page.getByTestId('timeline').getByTestId('stay-plus').first().click();
  await expect(undo).toBeEnabled();
  await page.waitForFunction(() => !(window as any).__th.shared.store.getState().saving);
  await page.getByTestId('planning-done').click();
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(true));
  await expect(page.getByTestId('undo-button')).toBeDisabled();
});

test('過去的版本：從頭像選單打開，不用進編輯就能復原', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  const placeId = await page.evaluate(async (d) => {
    const th = (window as any).__th;
    const before = th.dataStore.getState().itinerary;
    await th.shared.changeItinerary((it: any) => ({ ...it, days: it.days.map((x: any) => (x.date === d ? { ...x, note: '（e2e）' } : x)) }), '改一下（e2e）');
    return JSON.stringify(before);
  }, DAY);
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-versions').click();
  const dialog = page.getByTestId('snapshots-dialog');
  await expect(dialog).toContainText('過去的版本');
  await dialog.getByTestId('snapshot-restore').first().click();
  await dialog.getByTestId('snapshot-restore-confirm').first().click();
  await expect(dialog).toHaveCount(0);
  const now = await page.evaluate(() => JSON.stringify((window as any).__th.dataStore.getState().itinerary));
  expect(now).toBe(placeId);
});

test('加地點：常駐按鈕 → 彈窗 → 在地圖上指 → 按確定才加', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await expect(page.getByTestId('search')).toHaveAttribute('placeholder', '搜尋名稱');
  await page.getByTestId('add-place-open').click();
  const dialog = page.getByTestId('add-dialog');
  await expect(dialog.getByTestId('add-entry-input')).toBeVisible();
  await dialog.getByTestId('add-entry-pin').click();
  await expect(dialog.getByTestId('add-map')).toBeVisible();
  await expect(dialog.getByTestId('add-pin')).toBeVisible();
  const save = dialog.getByTestId('add-save');
  await expect(save).toHaveText('確定加入');
  await expect(save).toBeDisabled();
  await dialog.getByTestId('add-name').fill('E2E 咖啡店');
  await expect(save).toBeDisabled();
  await dialog.getByTestId('add-type-restaurant').click();
  await expect(save).toBeEnabled();
  const count = () => page.evaluate(() => (window as any).__th.shared.store.getState().userPlaces.length);
  const before = await count();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(await count()).toBe(before + 1);
});

test('加地點：貼連結自動查，到第二步還沒存；已有的點不給加；不是地址有說明；Esc 關掉', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  const count = () => page.evaluate(() => (window as any).__th.shared.store.getState().userPlaces.length);
  const before = await count();
  await page.getByTestId('add-place-open').click();
  const dialog = page.getByTestId('add-dialog');

  await dialog.getByTestId('add-entry-input').fill('隨便打的字');
  await dialog.getByTestId('add-entry-find').click();
  await expect(dialog.getByTestId('add-entry-error')).toBeVisible();

  // 已有的點：用它的座標組一個連結
  const known = await page.evaluate(() => {
    const p = (window as any).__th.dataStore.getState().places.find((x: any) => x.name.ja);
    return { name: p.name.ja as string, lng: p.coords[0] as number, lat: p.coords[1] as number };
  });
  await dialog.getByTestId('add-entry-input').fill(`https://www.google.com/maps/place/${encodeURIComponent(known.name)}/@${known.lat},${known.lng},17z`);
  await expect(dialog.getByTestId('add-entry-existing')).toBeVisible();
  await expect(dialog.getByTestId('add-save')).toHaveCount(0);

  // 新的點：到第二步，名稱帶入，還沒存
  await dialog.getByTestId('add-entry-input').fill('https://www.google.com/maps/place/E2E%E3%82%AB%E3%83%95%E3%82%A7/@34.2,136.5,17z');
  await expect(dialog.getByTestId('add-save')).toBeVisible();
  await expect(dialog.getByTestId('add-name')).toHaveValue('E2Eカフェ');
  expect(await count()).toBe(before);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await count()).toBe(before);
});

test('加地點：搜尋比不到時「＋ 自己加」帶入文字；搜尋框不再自己解析連結', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('search').fill('完全比不到的店名xyz');
  await expect(page.getByTestId('add-suggest')).toBeVisible();
  await page.getByTestId('add-suggest-add').click();
  await expect(page.getByTestId('add-entry-input')).toHaveValue('完全比不到的店名xyz');
  await page.getByTestId('add-close').click();
  await expect(page.getByTestId('add-place-open')).toBeVisible();
  // 想去沒有加地點
  await page.getByTestId('side-tab-wish').click();
  await expect(page.getByTestId('add-place-open')).toHaveCount(0);
});

test('地區列取代類型列（T42）：類型在面板裡、算進篩選的數字；全部清除不清地區', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await expect(page.getByTestId('ex-area-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="ex-type-"]')).toHaveCount(0);
  await page.getByTestId('ex-area-toba').click();
  const count = async () => Number((await page.getByTestId('list-count').innerText()).replace(/\D/g, ''));
  const area = await count();
  await pickType(page, 'restaurant');
  await expect.poll(count).toBeLessThan(area);
  await expect(page.getByTestId('filter-count')).toHaveText('1');
  await expect(page.getByTestId('filter-applied')).toHaveCount(0);

  // 面板沒有地區；全部清除不清地區
  await page.getByTestId('filter-open').click();
  await expect(page.locator('[data-testid^="filter-opt-area-"]')).toHaveCount(0);
  await page.getByTestId('filter-clear').click();
  await expect(page.getByTestId('filter-count')).toHaveCount(0);
  await page.getByTestId('filter-close').click();
  await expect(page.getByTestId('ex-area-toba')).toHaveAttribute('aria-pressed', 'true');
  // 照片牆切換只在照片牆、清單那層（T50）：回到書架就沒有
  await expect(page.getByTestId('view-list')).toHaveCount(0);
});
