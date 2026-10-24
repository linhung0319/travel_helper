// T15m 完成條件（PLAN）：手機和電腦尺寸各跑一次，用假後端。
// 按 ❤️ → 想去分頁出現、留言 → 換人看得到、改不了別人的留言 → 加到某天 → 這天的候選
// → 進入規劃模式按 ↑ 排進 → 時間軸出現、有交通卡 → 停留時間 ＋15 → 復原快照後回到原狀。
// 第四輪：沒有緩衝、沒有「換住宿」「併到…」，交通卡不收合（規劃模式原地改），討論、預約、下載在右上角，探索沒有加到某天；
// 拖曳放在同類型卡片中間＝合併（可以復原）、放在卡片之間＝排進。
import { test, type Locator, type Page } from '@playwright/test';
import { centerOn, expect, isMobile, ready, tapOrClick } from './helpers.ts';

const DAY = '2027-02-07';
const PLACE = 'toba-seahorse';
const TEXT = '想吃一次飯店的西餐（e2e）';

const th = (page: Page, fn: string) => page.evaluate(fn);

async function showDay(page: Page, day: string) {
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), day);
  if (await isMobile(page)) await page.evaluate(() => (window as any).__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
  else await page.getByTestId('side-tab-day').click();
}

async function openDetail(page: Page, id: string) {
  await page.evaluate((x) => (window as any).__th.appStore.getState().openDetail(x), id);
  if (await isMobile(page)) await page.evaluate(() => (window as any).__th.appStore.getState().setSheet({ snap: 'full' }));
}

const closeDetail = (page: Page) => th(page, '__th.appStore.getState().closeDetail()');

/** 想去：電腦版右欄的「❤️ 想去」分頁，手機是下方面板的「❤️ 想去」分頁。切到那個點的類型，才看得到它的卡片 */
async function openWish(page: Page, id = PLACE): Promise<Locator> {
  await closeDetail(page);
  if (await isMobile(page)) {
    await page.getByTestId('sheet-tab-wish').click();
    await page.evaluate(() => (window as any).__th.appStore.getState().setSheet({ snap: 'full' }));
  } else await page.getByTestId('side-tab-wish').click();
  await page.evaluate((x) => {
    const s = (window as any).__th;
    s.appStore.getState().setFilter({ types: [s.dataStore.getState().byId.get(x).type] });
  }, id);
  return page.getByTestId('wish-panel');
}

const wish = (scope: Locator, id = PLACE) => scope.locator(`[data-testid="wish-item"][data-id="${id}"]`);
const cand = (page: Page, id = PLACE) => page.getByTestId('day-candidates').locator(`[data-testid="cand-item"][data-id="${id}"]`);

async function enterPlanning(page: Page) {
  await page.getByTestId('planning-toggle').click();
  await expect(page.getByTestId('planning-dialog')).toBeVisible();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
}

test('T15m：❤️ 想去 → 留言 → 加到某天 → 規劃模式按 ↑ 排進 → 停留時間 → 復原快照', async ({ page }) => {
  await ready(page);

  // 1. 按 ❤️（只表示喜歡，不問哪天）
  await openDetail(page, PLACE);
  await page.getByTestId('vote-like').click();
  await expect(page.getByTestId('vote-like')).toHaveAttribute('aria-pressed', 'true');

  // 2. 想去分頁有這張卡片；留一則留言，收起來後顯示「1 則留言」
  let list = await openWish(page);
  await expect(wish(list)).toBeVisible();
  await wish(list).getByTestId('wish-comments').click();
  await wish(list).getByTestId('comment-input').fill(TEXT);
  await wish(list).getByTestId('comment-input').press('Enter');
  await expect(wish(list).getByTestId('wish-comment')).toContainText(TEXT);
  await wish(list).getByTestId('wish-comments').click();
  await expect(wish(list).getByTestId('wish-comments')).toContainText('1 則留言');

  // 3. 換成阿公：看得到、改不了別人的留言；把它加到 2/7
  await page.getByTestId('me-button').click();
  await page.locator('[data-member="dev-agong"]').click();
  list = await openWish(page);
  await wish(list).getByTestId('wish-comments').click();
  await expect(wish(list).getByTestId('wish-comment')).toContainText(TEXT);
  await expect(wish(list).getByTestId('wish-comment').getByRole('button', { name: '改' })).toHaveCount(0);
  await wish(list).getByTestId('add-to-day').click();
  await wish(list).getByTestId(`day-picker-${DAY}`).click();
  await expect(wish(list).getByTestId('card-status-tag')).toContainText('候選 2/7');

  // 4. 行程分頁：這天的候選有它；一般模式沒有 ↑
  await showDay(page, DAY);
  await expect(cand(page)).toBeVisible();
  await expect(cand(page).getByTestId('cand-up')).toHaveCount(0);

  // 5. 規劃模式按 ↑：插在這天最順路的位置，候選少一筆
  await enterPlanning(page);
  const before = (await th(page, '__th.dataStore.getState().itinerary')) as { days: unknown };
  await cand(page).getByTestId('cand-up').click();
  await expect(cand(page)).toHaveCount(0);
  const row = page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${PLACE}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId('avatar-stack')).toBeVisible(); // 按 ❤️ 的人（爸爸）的頭像
  await expect(page.getByTestId('timeline').getByTestId('tl-leg').first()).toBeVisible();

  // 6. 停留時間 ＋15：標籤跟著變
  const chip = row.getByTestId('stay-chip');
  const stayBefore = await chip.innerText();
  await row.getByTestId('stay-plus').click();
  await expect(chip).not.toHaveText(stayBefore);

  // 7. 復原快照：回到排進去之前（最舊的那份）
  await page.getByTestId('snapshots-button').click();
  const snap = page.getByTestId('snapshot').last();
  await snap.getByTestId('snapshot-restore').click();
  await snap.getByTestId('snapshot-restore-confirm').click();
  await expect(page.getByTestId('snapshots-dialog')).toHaveCount(0);
  await expect(page.getByTestId('timeline').locator(`[data-place="${PLACE}"]`)).toHaveCount(0);
  const after = (await th(page, '__th.dataStore.getState().itinerary')) as { days: unknown };
  expect(after.days).toEqual(before.days);
});

test('T15m：別人改過了 → 存不了、提示重新載入', async ({ page }) => {
  await ready(page);
  await page.getByTestId('me-button').click();
  await page.getByTestId('dev-other-edit').click();
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  await page.getByTestId('timeline').getByTestId('stay-plus').first().click();
  await expect(page.getByTestId('conflict-bar')).toBeVisible();
  await page.getByTestId('conflict-bar').getByRole('button', { name: '重新載入' }).click();
  await expect(page.getByTestId('conflict-bar')).toHaveCount(0);
});

test('T15m：❤️ 和「大家喜歡的」篩選', async ({ page }) => {
  await ready(page);
  await openDetail(page, 'toba-kokusai-hotel');
  const like = page.getByTestId('vote-like');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  // 水族館有 4 個 ❤️：「大家喜歡的」留著它，沒人按的變淡
  const r = await page.evaluate(() => (window as any).__th.commands.setFilter({ votes: ['popular'] }));
  expect(r.ok).toBe(true);
  const v = await page.evaluate(() => [(window as any).__th.visual('toba-aquarium'), (window as any).__th.visual('toba-kokusai-hotel')]);
  expect(v[0].match).toBe(true);
  expect(v[1].match).toBe(false);
});

test('T15m：拿掉別人加的候選要寫理由，理由變成那個點的留言；想去的搜尋只留名字對得上的', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  // 我是爸爸；遊覽船是媽媽加的：一般模式沒有「拿掉」
  const cruise = cand(page, 'toba-bay-cruise-irukajima');
  await expect(cruise).toBeVisible();
  await expect(cruise.getByTestId('cand-reject')).toHaveCount(0);
  // 月曆裡別人加的候選，一般模式點不了（不會開拿掉的對話框）
  const wishList = await openWish(page, 'toba-bay-cruise-irukajima');
  await wish(wishList, 'toba-bay-cruise-irukajima').getByTestId('add-to-day').click();
  await expect(page.getByTestId('day-picker-2027-02-05')).toBeDisabled();
  await expect(page.getByTestId('reject-dialog')).toHaveCount(0);
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  await cruise.getByTestId('cand-reject').click();
  await expect(page.getByTestId('reject-submit')).toBeDisabled();
  await page.getByTestId('reject-text').fill('這天排不下，改 2/6 好嗎');
  await page.getByTestId('reject-submit').click();
  await expect(cruise).toHaveCount(0);

  const list = await openWish(page, 'toba-bay-cruise-irukajima');
  const card = wish(list, 'toba-bay-cruise-irukajima');
  await card.getByTestId('wish-comments').click();
  await expect(card.getByTestId('wish-comment').last()).toContainText('這天排不下');
  await expect(card.getByTestId('wish-comment').last()).toContainText('不採用');

  await list.getByTestId('search').fill('いろは');
  await expect(list.getByTestId('wish-item')).toHaveCount(1);
  await expect(wish(list, 'toba-yakigai-iroha')).toBeVisible();
});

test('T15m：自己加的候選可以撤回；這天的討論', async ({ page }) => {
  await ready(page);
  // 爸爸加的：燒貝いろは（2/6）
  await showDay(page, '2027-02-06');
  const iroha = cand(page, 'toba-yakigai-iroha');
  await iroha.getByTestId('cand-withdraw').click();
  await expect(iroha).toHaveCount(0);

  await showDay(page, '2027-02-07');
  await page.getByTestId('toolbar-comments').click();
  const box = page.getByTestId('map-panel');
  await expect(box.getByTestId('wish-comments')).toContainText('2 則這天的討論');
  await expect(box.getByTestId('wish-comment').first()).toContainText('泡湯');
});

test('第四輪：討論、預約、下載在右上角；彈窗開著時這幾個按鈕還按得到', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('export-json')).toBeVisible();
  await expect(page.getByTestId('export-json')).toBeEnabled();
  await expect(page.getByTestId('toolbar-comments')).toContainText('討論');
  if (!(await isMobile(page))) {
    await page.getByTestId('toolbar-comments').click();
    await expect(page.getByTestId('map-panel')).toHaveAttribute('data-kind', 'comments');
    // 工具列在彈窗上面，沒被蓋住：直接換成預約
    await page.getByTestId('toolbar-reservations').click();
    await expect(page.getByTestId('map-panel')).toHaveAttribute('data-kind', 'reservations');
  }
});

/** 地圖畫面上一個沒被彈窗、面板蓋住的點（點下去就是點到地圖） */
async function openMapPoint(page: Page): Promise<{ x: number; y: number }> {
  const pt = await page.evaluate(() => {
    const r = (window as any).__th.map.getCanvas().getBoundingClientRect();
    for (let y = r.top + 10; y < r.bottom - 10; y += 15)
      for (let x = r.left + 10; x < r.right - 10; x += 15) {
        const el = document.elementFromPoint(x, y);
        if (el?.classList.contains('maplibregl-canvas')) return { x, y };
      }
    return null;
  });
  expect(pt).not.toBeNull();
  return pt!;
}

test('第四輪：點 💬 討論 → 彈窗；點彈窗外面的地圖 → 彈窗關掉', async ({ page }) => {
  await ready(page);
  await page.getByTestId('toolbar-comments').click();
  await expect(page.getByTestId('map-panel')).toBeVisible();
  await expect(page.getByTestId('map-panel').locator('h2')).toContainText('討論');
  const { x, y } = await openMapPoint(page);
  await tapOrClick(page, x, y);
  await expect(page.getByTestId('map-panel')).toHaveCount(0);
});

test('T15m：想去的卡片點了看詳情，返回想去（電腦版）', async ({ page }) => {
  test.skip(await isMobile(page), '手機的詳情在下方面板，沒有返回鈕');
  await ready(page);
  const list = await openWish(page, 'toba-aquarium');
  await wish(list, 'toba-aquarium').getByTestId('wish-open').click();
  await expect(page.getByTestId('detail-back')).toHaveText('← 返回想去');
  await page.getByTestId('detail-back').click();
  await expect(page.getByTestId('wish-panel')).toBeVisible();
  await expect(page.getByTestId('side-tab-wish')).toHaveAttribute('aria-selected', 'true');
});

test('T15m：規劃模式拖曳換順序（電腦版）', async ({ page }) => {
  test.skip(await isMobile(page), '手機用長按，Playwright 不好模擬');
  await page.setViewportSize({ width: 1600, height: 1200 });
  await ready(page);
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  const rows = page.getByTestId('timeline').getByTestId('tl-row');
  const order = () => rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.place));
  const second = (await order())[1];
  const s = (await rows.nth(3).boundingBox())!;
  const t = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(s.x + 300, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + 300, t.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await order())[2]).toBe(second);
});

test('預約筆記：改成已訂位、時間軸 tag 跟著變', async ({ page }) => {
  const BOOK_NOTE = '用電話訂了 18:00（e2e）';
  await ready(page);
  await showDay(page, '2027-02-05');
  await page.getByTestId('toolbar-reservations').click();
  const panel = page.getByTestId('map-panel');
  await expect(panel).toBeVisible();
  const row = panel.getByTestId('note-row').first();
  await expect(row).toBeVisible();
  const placeId = (await row.getAttribute('data-place'))!;
  await row.getByTestId('note-status-booked').click();
  await expect(row).toHaveAttribute('data-status', 'booked');
  await row.getByTestId('note-text').fill(BOOK_NOTE);
  await row.getByTestId('note-text').press('Enter');

  // 只看未訂位：這列不見了
  await panel.getByTestId('only-pending').check();
  await expect(panel.locator(`[data-testid="note-row"][data-place="${placeId}"][data-status="booked"]`)).toHaveCount(0);
  await panel.getByTestId('only-pending').uncheck();

  // 關掉：那張卡片的 tag 寫已訂位
  await page.getByTestId('map-panel-close').click();
  await showDay(page, '2027-02-05');
  const tag = page.locator(`[data-testid="tl-row"] [data-testid="reservation-tag"][data-status="booked"]`).first();
  await expect(tag).toHaveText('已訂位 ✓');

  // 點 tag 回到預約筆記
  await tag.click();
  await expect(page.getByTestId('map-panel')).toBeVisible();
  await page.getByTestId('map-panel-close').click();

  // 換人：同一個狀態和備註
  await page.getByTestId('me-button').click();
  await page.locator('[data-member="dev-agong"]').click();
  await page.getByTestId('toolbar-reservations').click();
  const again = page.getByTestId('map-panel').locator(`[data-testid="note-row"][data-place="${placeId}"][data-status="booked"]`).first();
  await expect(again).toBeVisible();
  await expect(again.getByTestId('note-text')).toHaveValue(BOOK_NOTE);
});

test('預約筆記：打了備註不按 Enter 直接按狀態，兩個都存得下來', async ({ page }) => {
  const TEXT2 = '先打字再按狀態（e2e）';
  await ready(page);
  await showDay(page, '2027-02-05');
  await page.getByTestId('toolbar-reservations').click();
  const row = page.getByTestId('map-panel').getByTestId('note-row').first();
  const placeId = (await row.getAttribute('data-place'))!;
  await row.getByTestId('note-text').fill(TEXT2);
  await row.getByTestId('note-status-booked').click();
  await page.getByTestId('map-panel-close').click();
  await page.getByTestId('me-button').click();
  await page.locator('[data-member="dev-agong"]').click();
  await page.getByTestId('toolbar-reservations').click();
  const again = page.getByTestId('map-panel').locator(`[data-testid="note-row"][data-place="${placeId}"]`).first();
  await expect(again).toHaveAttribute('data-status', 'booked');
  await expect(again.getByTestId('note-text')).toHaveValue(TEXT2);
});

/** 👑 亮著（class 有 on；不能只寫 /on/，option-crown 本身就含 on） */
const CROWN_ON = /(^| )on( |$)/;

const tlRow = (page: Page, item: string) => page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-item="${item}"]`);

test('第四輪：一般模式只看；合併卡片換著看、設為主要、標吃法、拿出來放回候選', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  // 一般模式：午餐 tag、＋1、頭像；沒有 −／＋、⋯
  const lunch = tlRow(page, 'i-7');
  await expect(lunch.getByTestId('tag-meal')).toHaveText('午餐');
  await expect(lunch.getByTestId('stay-minus')).toHaveCount(0);
  await expect(lunch.getByTestId('item-menu')).toHaveCount(0);
  await expect(lunch.getByTestId('tag-edit')).toHaveCount(0);
  await expect(lunch).toContainText('漣不能訂位'); // 備註一般模式也看得到（只是不能改）
  const aquarium = tlRow(page, 'i-6');
  await aquarium.getByTestId('avatar-stack').click();
  await expect(aquarium.getByTestId('avatar-list')).toContainText('媽媽');

  // 合併卡片：疊層、👑 亮著（看的是主卡）；‹ › 換著看備卡，一般模式不能改，地圖上那個點亮起來
  const stack = lunch.getByTestId('option-stack');
  await expect(stack).toHaveAttribute('data-shown', '0');
  await expect(stack.getByTestId('option-crown')).toHaveClass(CROWN_ON);
  await stack.getByTestId('option-next').click();
  await expect(stack).toHaveAttribute('data-shown', '1');
  await expect(stack.getByTestId('option-crown')).not.toHaveClass(CROWN_ON);
  await expect(lunch.getByTestId('option-make-main')).toHaveCount(0);
  await expect.poll(() => th(page, '__th.appStore.getState().highlights.primary')).toEqual(['toba-kazuei']);
  await stack.getByTestId('option-prev').click();
  await expect(stack).toHaveAttribute('data-shown', '0');

  // 規劃模式：看一榮 → 設為主要 → 卡片換成一榮
  await enterPlanning(page);
  await stack.getByTestId('option-next').click();
  await lunch.getByTestId('option-make-main').click();
  await expect(lunch).toHaveAttribute('data-place', 'toba-kazuei');

  // 標吃法：點 tag 那一排 → 分開吃
  await lunch.getByTestId('tag-edit').click();
  await lunch.getByTestId('tag-dining-separate').click();
  await expect(lunch.getByTestId('tag-dining')).toHaveText('分開吃');

  // 看漣 → 拿出來：回到這天的候選，卡片不再疊；提示可以復原
  await expect(stack).toHaveAttribute('data-main', 'true');
  await stack.getByTestId('option-next').click();
  await lunch.getByTestId('option-takeout').click();
  await expect(lunch.getByTestId('option-stack')).toHaveCount(0);
  await expect(cand(page, 'toba-sazanami')).toBeVisible();
  await expect(page.getByTestId('toast-undo')).toBeVisible();
});

test('第四輪：住宿卡片的含餐 tag；沒有「換住宿」，想去的住宿沒有「設為住宿」', async ({ page }) => {
  await ready(page);
  // 先 ❤️ 一間住宿，想去才有它
  await openDetail(page, 'toba-kokusai-hotel');
  await page.getByTestId('vote-like').click();
  await closeDetail(page);
  await showDay(page, DAY);
  const lodging = page.getByTestId('timeline').locator('.tl-lodging');
  await expect(lodging.getByTestId('lodging-meal')).toHaveText(['含晚餐', '含早餐']);
  await enterPlanning(page);
  await expect(page.getByTestId('timeline').getByTestId('lodging-change')).toHaveCount(0);
  const list = await openWish(page, 'toba-kokusai-hotel');
  await expect(wish(list, 'toba-kokusai-hotel')).toBeVisible();
  await expect(wish(list, 'toba-kokusai-hotel').getByTestId('wish-set-lodging')).toHaveCount(0);
});

test('第四輪：交通卡不收合、點了地圖畫那一段；規劃模式原地改方式、備註', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  const legs = page.getByTestId('timeline').getByTestId('tl-leg');
  await expect(legs.nth(1)).toBeVisible();
  const first = legs.first();
  // 一般模式：內容一直顯示（Google Maps 小圖示），沒有緩衝、沒有編輯；點了地圖畫一條路線
  await expect(first.getByTestId('leg-maps')).toHaveAttribute('href', /google\.com\/maps\/dir\/.*travelmode=/);
  await expect(first).not.toContainText('緩衝');
  await first.getByRole('button').first().click();
  await expect(first.getByTestId('leg-editor')).toHaveCount(0);
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(1);
  // 一次只選一段：點第二段
  await legs.nth(1).getByRole('button').first().click();
  await expect(legs.nth(1).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(first.getByRole('button').first()).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(1);
  // 再點一次 → 路線清掉
  await legs.nth(1).getByRole('button').first().click();
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(0);

  // 規劃模式：點了原地變成編輯狀態；方式只有四種；選計程車
  await enterPlanning(page);
  await first.getByRole('button').first().click();
  const editor = first.getByTestId('leg-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('leg-mode')).toHaveCount(4);
  await expect(editor.getByTestId('leg-buffer-plus')).toHaveCount(0);
  await editor.locator('[data-testid="leg-mode"][data-mode="taxi"]').click();
  await expect(first.locator('[data-testid="leg-mode"][data-mode="taxi"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toContainText('🚕');
  // 算得出時間、沒自己填過分鐘：沒有分鐘欄
  await expect(first.getByTestId('leg-minutes')).toHaveCount(0);
  await first.getByTestId('leg-note').fill('在飯店大廳集合');
  await first.getByTestId('leg-note').blur();
  await expect(first.getByTestId('leg-note')).toHaveValue('在飯店大廳集合');
  await first.locator('[data-testid="leg-mode"][data-mode="auto"]').click();
  await expect(first.locator('[data-testid="leg-mode"][data-mode="auto"]')).toHaveAttribute('aria-pressed', 'true');
  // 完成：收起來，備註寫在卡片上
  await first.getByTestId('leg-done').click();
  await expect(first.getByTestId('leg-editor')).toHaveCount(0);
  await expect(first.getByTestId('leg-note-text')).toContainText('在飯店大廳集合');
});

test('第四輪：交通卡自己填的分鐘改得動、清得掉；算得出時間就沒有分鐘欄', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-02');
  await enterPlanning(page);
  // 關西機場 → 賢島：假行程手動指定電車 165 分（時刻表裡找不到）
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  const travel = () => th(page, "JSON.stringify(__th.dataStore.getState().itinerary.days.find((d) => d.date === '2027-02-02').items.find((i) => i.id === 'i-1').travel)");
  await leg.getByRole('button').first().click();
  const minutes = leg.getByTestId('leg-minutes');
  await expect(minutes).toHaveValue('165');
  // 改成 170：存下來、卡片跟著變，欄位還在
  await minutes.fill('170');
  await minutes.blur();
  await expect.poll(travel).toContain('"minutes":170');
  await expect(leg.getByRole('button').first()).toContainText('170 分');
  await expect(minutes).toHaveValue('170');
  // 清空：回到照規則算（minutes 是 null）；電車還是找不到班次，欄位留著可以再填
  await minutes.fill('');
  await minutes.blur();
  await expect.poll(travel).toContain('"minutes":null');
  await expect(minutes).toBeVisible();
  await expect(minutes).toHaveValue('');
  // 改計程車：算得出時間，分鐘欄不見
  await leg.locator('[data-testid="leg-mode"][data-mode="taxi"]').click();
  await expect(leg.locator('[data-testid="leg-mode"][data-mode="taxi"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(leg.getByTestId('leg-minutes')).toHaveCount(0);
});

test('最後檢查：選了交通卡後換到下一天，地圖的行程線恢復（不再是淡的）', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  const opacity = () => page.evaluate(() => JSON.stringify((window as any).__th.map.getPaintProperty('itinerary-line', 'line-opacity')));
  const normal = await opacity();
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  await leg.getByRole('button').first().click();
  await expect(leg.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(opacity).toBe('0.1');
  await page.getByTestId('day-next').click();
  await expect.poll(() => th(page, '__th.uiStore.getState().legOpen')).toBe(null);
  await expect.poll(opacity).toBe(normal);
  expect(normal).not.toBe('0.1');
});

test('最後檢查：預約筆記點名稱打開詳情（手機先關掉視窗）', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await page.getByTestId('toolbar-reservations').click();
  const panel = page.getByTestId('map-panel');
  await expect(panel).toBeVisible();
  const row = panel.getByTestId('note-row').first();
  const placeId = (await row.getAttribute('data-place'))!;
  await row.locator('.link-button').first().click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  expect(await th(page, '__th.appStore.getState().detailId')).toBe(placeId);
  // 手機：視窗蓋住整個畫面，要關掉才看得到詳情；電腦版視窗還在
  if (await isMobile(page)) await expect(page.getByTestId('map-panel')).toHaveCount(0);
  else await expect(page.getByTestId('map-panel')).toBeVisible();
});

test('第三輪：選了某一天，地圖上那天的行程線改沿道路畫（OSRM 用假的回應）', async ({ page }) => {
  await ready(page);
  // ready 先擋掉 OSRM；這裡後註冊，優先
  await page.route('**/routing.openstreetmap.de/**', (route) => {
    const m = /driving\/([\d.]+),([\d.]+);([\d.]+),([\d.]+)/.exec(route.request().url())!;
    const [a, b] = [
      [Number(m[1]), Number(m[2])],
      [Number(m[3]), Number(m[4])],
    ];
    const mid = [(a[0] + b[0]) / 2 + 0.00123, (a[1] + b[1]) / 2];
    return route.fulfill({ json: { code: 'Ok', routes: [{ distance: 640, duration: 500, geometry: { coordinates: [a, mid, b] } }], waypoints: [{ distance: 0 }, { distance: 0 }] } });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showDay(page, '2027-02-05');
  // 線上出現不是任何資料點的座標＝道路上的中間點
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const t = (window as any).__th;
          const known = new Set([...t.dataStore.getState().byId.values()].map((p: any) => p.coords.join(',')));
          const data = t.map.getSource('overlay-itinerary-lines').serialize().data;
          return data.features.some((f: any) => f.properties.date === '2027-02-05' && f.geometry.coordinates.some((c: number[]) => !known.has(c.join(','))));
        }),
      { timeout: 20000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

/** 探索分頁（手機是圖片牆）裡那個點的卡片 */
async function exploreCard(page: Page, id: string): Promise<Locator> {
  const type = (await th(page, `__th.dataStore.getState().byId.get('${id}').type`)) as string;
  let card: Locator;
  if (await isMobile(page)) {
    await page.getByRole('button', { name: '探索' }).click();
    await expect(page.getByTestId('explore-wall')).toBeVisible();
    await centerOn(page, id, 14);
    card = page.locator(`[data-testid="wall-item"][data-id="${id}"]`);
  } else {
    await page.getByTestId('side-tab-explore').click();
    await page.evaluate((t) => (window as any).__th.appStore.getState().setFilter({ types: [t] }), type);
    card = page.locator(`li:has([data-testid="explore-item"][data-id="${id}"])`);
  }
  await card.scrollIntoViewIfNeeded();
  return card;
}

test('第四輪：探索的卡片沒有加到某天；按 ❤️ 就到想去', async ({ page }) => {
  await ready(page);
  const card = await exploreCard(page, PLACE);
  await expect(card.getByTestId('add-to-day')).toHaveCount(0);
  // 還沒人 ❤️：照片上是空心的 ♡
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'false');
  await card.getByTestId('card-like').click();
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByTestId('card-votes')).toContainText('1');
  // 點 ▾ 看是誰按的
  await card.getByTestId('card-votes-more').click();
  await expect(card.getByTestId('avatar-list')).toContainText('❤️');
  // 想去有它，加到某天在想去的卡片上
  const list = await openWish(page);
  await expect(wish(list).getByTestId('add-to-day')).toBeVisible();
});

test('探索：原本是 👎，按 ❤️ 會換掉 👎；兩個按鈕一直都在', async ({ page }) => {
  await ready(page);
  const card = await exploreCard(page, PLACE);
  await expect(card.getByTestId('card-like')).toBeVisible();
  await card.getByTestId('card-dislike').click();
  await expect(card.getByTestId('card-dislike')).toHaveAttribute('aria-pressed', 'true');
  // 只有 👎 時，❤️ 的按鈕還在、按得動
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'false');
  await card.getByTestId('card-like').click();
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByTestId('card-dislike')).toHaveAttribute('aria-pressed', 'false');
});

/** 電腦版的 HTML5 拖曳：放在目標的第 frac 高度（0.5＝中間＝合併；靠上下邊緣＝插入） */
async function dragOnto(source: Locator, target: Locator, frac: number) {
  const box = (await target.boundingBox())!;
  await source.dragTo(target, { targetPosition: { x: Math.min(200, box.width / 2), y: box.height * frac } });
}

test('第四輪：規劃模式把餐廳拖到另一間餐廳的中間 → 合併、👑；按復原回到兩張卡片（電腦版）', async ({ page }) => {
  test.skip(await isMobile(page), '手機用長按，Playwright 不好模擬');
  await page.setViewportSize({ width: 1600, height: 1200 });
  await ready(page);
  const D = '2027-02-10';
  const SRC = 'ise-tofuya';
  await showDay(page, D);
  await enterPlanning(page);
  // 先把豆腐屋（阿公加的餐廳候選）排進這天
  await cand(page, SRC).getByTestId('cand-up').click();
  const src = page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${SRC}"]`);
  await expect(src).toBeVisible();
  const target = tlRow(page, 'i-19'); // 向井酒の店（晚餐，餐廳）
  await expect(target).toHaveAttribute('data-drop-type', 'restaurant');
  await expect(src).toHaveAttribute('data-drop-type', 'restaurant');
  const rows = page.getByTestId('timeline').getByTestId('tl-row');
  const n = await rows.count();

  await dragOnto(src, target, 0.5);
  await expect(target.getByTestId('option-stack')).toBeVisible();
  await expect(target.getByTestId('option-crown')).toContainText('👑');
  // 合併後看的是主卡（原本那間）：👑 亮著
  await expect(target.getByTestId('option-crown')).toHaveClass(CROWN_ON);
  await expect(target.getByTestId('option-stack')).toHaveAttribute('data-main', 'true');
  await expect(src).toHaveCount(0);
  await expect(rows).toHaveCount(n - 1);
  await expect(page.getByTestId('toast')).toContainText('已合併到');

  // 復原：回到兩張卡片
  await page.getByTestId('toast-undo').click();
  await expect(src).toBeVisible();
  await expect(target.getByTestId('option-stack')).toHaveCount(0);
  await expect(rows).toHaveCount(n);
});

test('第四輪：規劃模式把候選拖到兩張卡片之間 → 時間軸多一站、候選少一筆（電腦版）', async ({ page }) => {
  test.skip(await isMobile(page), '手機用長按，Playwright 不好模擬');
  await page.setViewportSize({ width: 1600, height: 1200 });
  await ready(page);
  const D = '2027-02-05';
  const C = 'toba-bay-cruise-irukajima';
  await showDay(page, D);
  await enterPlanning(page);
  const rows = page.getByTestId('timeline').getByTestId('tl-row');
  const cands = page.getByTestId('day-candidates').getByTestId('cand-item');
  const n = await rows.count();
  const c = await cands.count();
  // 放在水族館（i-6）卡片的上緣＝排在它前面
  await dragOnto(cand(page, C), tlRow(page, 'i-6'), 0.1);
  await expect(rows).toHaveCount(n + 1);
  await expect(cands).toHaveCount(c - 1);
  await expect(cand(page, C)).toHaveCount(0);
  const order = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.place));
  expect(order[order.indexOf('toba-aquarium') - 1]).toBe(C);
});

/** 第四輪完成條件：加到 2/5 → 規劃模式 ↑ 排進 → 標午餐和分開吃 → 交通改計程車 → 復原快照 */
test('第四輪完成條件：排進、標午餐和分開吃、交通改計程車、復原快照', async ({ page }) => {
  const D = '2027-02-05';
  await ready(page);
  const before = (await th(page, '__th.dataStore.getState().itinerary')) as { days: unknown };

  // 1. 把點加到 2/5（想去的卡片「加到某天」；先按 ❤️）→ 進入規劃模式
  await openDetail(page, PLACE);
  await page.getByTestId('vote-like').click();
  const list = await openWish(page);
  await wish(list).getByTestId('add-to-day').click();
  await wish(list).getByTestId(`day-picker-${D}`).click();
  await showDay(page, D);
  await enterPlanning(page);
  await expect(cand(page)).toBeVisible();

  // 2. 候選 ↑ 排進
  await cand(page).getByTestId('cand-up').click();
  const row = page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${PLACE}"]`);
  await expect(row).toBeVisible();

  // 3. 水族館標「午餐」；漣那張（餐廳）標「分開吃」（吃法只有餐廳有）
  const aquarium = tlRow(page, 'i-6');
  await aquarium.getByTestId('tag-edit').click();
  await aquarium.getByTestId('tag-meal-lunch').click();
  await expect(aquarium.getByTestId('tag-meal')).toHaveText('午餐');
  const lunch = tlRow(page, 'i-7');
  await lunch.getByTestId('tag-edit').click();
  await lunch.getByTestId('tag-dining-separate').click();
  await expect(lunch.getByTestId('tag-dining')).toHaveText('分開吃');

  // 4. 第一段交通改計程車
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  await leg.getByRole('button').first().click();
  await leg.locator('[data-testid="leg-mode"][data-mode="taxi"]').click();
  await expect(leg).toContainText('🚕');

  // 5. 復原快照 → 回到原狀
  await page.getByTestId('snapshots-button').click();
  const snap = page.getByTestId('snapshot').last();
  await snap.getByTestId('snapshot-restore').click();
  await snap.getByTestId('snapshot-restore-confirm').click();
  await expect(page.getByTestId('snapshots-dialog')).toHaveCount(0);
  const after = (await th(page, '__th.dataStore.getState().itinerary')) as { days: unknown };
  expect(after.days).toEqual(before.days);
});
