// T15m 完成條件（PLAN）：電腦版，用假後端（第六輪起手機版在 mobile*.spec.ts）。
// 按 ❤️ → 想去分頁出現、留言 → 換人看得到、改不了別人的留言 → 加到某天 → 候選
// → 按「編輯」按 ↑ 排進 → 時間軸出現、有交通卡 → 停留時間 ＋15 → 復原快照後回到原狀。
// 第四輪：沒有緩衝、沒有「換住宿」「併到…」，討論、預約、下載在右上角，探索沒有加到某天；
// 拖曳放在同類型卡片中間＝合併（可以復原）、放在卡片之間＝排進。
// 第五輪：「規劃模式」改成「編輯」（藍條、完成）；交通卡平常收起，大眾運輸點了展開步驟、班次表；
// 等待合成交通卡下面的一條（沒有「空檔」）；資料卡右上角的編號從 0 起；地圖彈窗在日期列上面。
import { test, type Locator, type Page } from '@playwright/test';
import { centerOn, expect, openAccountItem, switchUser, findPlaceId, ready, waitIdle, likeMany } from './helpers.ts';

const DAY = '2027-02-07';
const PLACE = 'toba-seahorse';
const TEXT = '想吃一次飯店的西餐（e2e）';

const th = (page: Page, fn: string) => page.evaluate(fn);

async function showDay(page: Page, day: string) {
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), day);
  await page.getByTestId('side-tab-day').click();
}

async function openDetail(page: Page, id: string) {
  await page.evaluate((x) => (window as any).__th.appStore.getState().openDetail(x), id);
}

const closeDetail = (page: Page) => th(page, '__th.appStore.getState().closeDetail()');

/** 想去：電腦版右欄的「想去」分頁。切到那個點的類型，才看得到它的卡片 */
async function openWish(page: Page, id = PLACE): Promise<Locator> {
  await closeDetail(page);
  await page.getByTestId('side-tab-wish').click();
  await page.evaluate((x) => {
    const s = (window as any).__th;
    s.appStore.getState().setFilter({ types: [s.dataStore.getState().byId.get(x).type] });
    // 已排的段落預設收合、每段先 8 個：把這個點露出來
    s.appStore.getState().revealInExplore(x);
  }, id);
  return page.getByTestId('wish-panel');
}

const wish = (scope: Locator, id = PLACE) => scope.locator(`[data-testid="wish-item"][data-id="${id}"]`);
const cand = (page: Page, id = PLACE) => page.getByTestId('day-candidates').locator(`[data-testid="cand-item"][data-id="${id}"]`);

/** 等存檔結束（假後端存一次 150ms；存檔中再改會被擋下來） */
const waitSaved = (page: Page) => expect.poll(() => th(page, '__th.shared.store.getState().saving')).toBe(false);

async function enterPlanning(page: Page) {
  await page.getByTestId('planning-toggle').click();
  await expect(page.getByTestId('planning-dialog')).toBeVisible();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
}

test('T15m：想去 → 留言 → 加到某天 → 編輯中按 ↑ 排進 → 停留時間 → 復原快照', async ({ page }) => {
  await ready(page);

  // 1. 按 ❤️（只表示喜歡，不問哪天）
  await openDetail(page, PLACE);
  await page.getByTestId('detail-like').click();
  await expect(page.getByTestId('detail-like')).toHaveAttribute('aria-pressed', 'true');

  // 2. 在詳情留一則留言；想去分頁有這一列，最新留言那一行寫著它
  const detail = page.getByTestId('detail-panel');
  await detail.getByTestId('detail-tab-comments').click();
  await detail.getByTestId('comment-input').fill(TEXT);
  await detail.getByTestId('comment-input').press('Enter');
  await expect(detail.getByTestId('wish-comment')).toContainText(TEXT);
  let list = await openWish(page);
  await expect(wish(list)).toBeVisible();
  await expect(wish(list).getByTestId('wish-last-comment')).toContainText(TEXT);

  // 3. 換成阿公：看得到、改不了別人的留言；把它加到 2/7
  await switchUser(page, 'dev-agong');
  list = await openWish(page);
  await expect(wish(list).getByTestId('wish-last-comment')).toContainText(TEXT);
  await wish(list).getByTestId('wish-last-comment').click();
  await expect(detail.getByTestId('detail-tab-comments')).toHaveAttribute('aria-selected', 'true'); // 最新留言直接開留言分頁
  await expect(detail.getByTestId('wish-comment')).toContainText(TEXT);
  await expect(detail.getByTestId('wish-comment').getByRole('button', { name: '改' })).toHaveCount(0);
  await page.getByTestId('detail-back').click();
  list = page.getByTestId('wish-panel');
  await wish(list).getByTestId('wish-add').click();
  await page.getByTestId(`day-picker-${DAY}`).click();
  await page.getByTestId('day-picker-done').click();
  await expect(wish(list).getByTestId('place-caps')).toContainText('候選 2/7');

  // 4. 行程分頁：候選有它；一般模式沒有 ↑
  await showDay(page, DAY);
  await expect(cand(page)).toBeVisible();
  await expect(cand(page).getByTestId('cand-up')).toHaveCount(0);

  // 5. 編輯中按 ↑：插在這天最順路的位置，候選少一筆
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
  await page.getByTestId('account-menu').click();
  await page.getByTestId('dev-other-edit').click();
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  await page.getByTestId('timeline').getByTestId('stay-plus').first().click();
  await expect(page.getByTestId('conflict-bar')).toBeVisible();
  await page.getByTestId('conflict-bar').getByRole('button', { name: '重新載入' }).click();
  await expect(page.getByTestId('conflict-bar')).toHaveCount(0);
});

test('T15m：想去和「大家想去的」篩選', async ({ page }) => {
  await ready(page);
  await openDetail(page, 'toba-kokusai-hotel');
  const like = page.getByTestId('detail-like');
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
  // 日期格裡別人加的候選，一般模式點不了（不會開拿掉的對話框）
  const wishList = await openWish(page, 'toba-bay-cruise-irukajima');
  await wish(wishList, 'toba-bay-cruise-irukajima').getByTestId('wish-add').click();
  await expect(page.getByTestId('day-picker-2027-02-05')).toBeDisabled();
  await expect(page.getByTestId('reject-dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wish-add-pop')).toHaveCount(0);
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  await cruise.getByTestId('cand-reject').click();
  await expect(page.getByTestId('reject-submit')).toBeDisabled();
  await page.getByTestId('reject-text').fill('這天排不下，改 2/6 好嗎');
  await page.getByTestId('reject-submit').click();
  await expect(cruise).toHaveCount(0);

  const list = await openWish(page, 'toba-bay-cruise-irukajima');
  const card = wish(list, 'toba-bay-cruise-irukajima');
  await expect(card.getByTestId('wish-last-comment')).toContainText('這天排不下');
  await card.getByTestId('wish-last-comment').click();
  const detail = page.getByTestId('detail-panel');
  await expect(detail.getByTestId('wish-comment').last()).toContainText('這天排不下');
  await expect(detail.getByTestId('wish-comment').last()).toContainText('不採用');
  await page.getByTestId('detail-back').click();

  // 類型是篩選的一個條件（打開想去時帶著那個點的類型）：先拿掉，搜尋才找得到別類的店
  await page.getByTestId('filter-applied').first().locator('.ui-chip-x').click();
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
  await openAccountItem(page, 'comments');
  const box = page.getByTestId('map-panel');
  await expect(box.getByTestId('wish-comments')).toContainText('2 則這天的討論');
  await expect(box.getByTestId('wish-comment').first()).toContainText('泡湯');
});

test('第七輪：討論、預約、下載在右欄的頭像選單；彈窗開著時選單還按得到', async ({ page }) => {
  await ready(page);
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('account-export')).toBeVisible();
  await expect(page.getByTestId('account-export')).toBeEnabled();
  await expect(page.getByTestId('account-comments')).toContainText('討論');
  await page.getByTestId('account-comments').click();
  await expect(page.getByTestId('map-panel')).toHaveAttribute('data-kind', 'comments');
  // 頭像選單在右欄，彈窗沒蓋住：直接換成預約
  await openAccountItem(page, 'reservations');
  await expect(page.getByTestId('map-panel')).toHaveAttribute('data-kind', 'reservations');
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

test('第四輪：點討論 → 彈窗；點彈窗外面的地圖 → 彈窗關掉', async ({ page }) => {
  await ready(page);
  await openAccountItem(page, 'comments');
  await expect(page.getByTestId('map-panel')).toBeVisible();
  await expect(page.getByTestId('map-panel').locator('h2')).toContainText('討論');
  const { x, y } = await openMapPoint(page);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('map-panel')).toHaveCount(0);
});

test('T15m：想去的卡片點了看詳情，返回想去（電腦版）', async ({ page }) => {
  await ready(page);
  const list = await openWish(page, 'toba-aquarium');
  await wish(list, 'toba-aquarium').getByTestId('wish-open').click();
  await expect(page.getByTestId('detail-back')).toHaveText('← 返回想去');
  await page.getByTestId('detail-back').click();
  await expect(page.getByTestId('wish-panel')).toBeVisible();
  await expect(page.getByTestId('side-tab-wish')).toHaveAttribute('aria-selected', 'true');
});

test('T15m：編輯中拖曳換順序（電腦版）', async ({ page }) => {
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
  await openAccountItem(page, 'reservations');
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
  await switchUser(page, 'dev-agong');
  await openAccountItem(page, 'reservations');
  const again = page.getByTestId('map-panel').locator(`[data-testid="note-row"][data-place="${placeId}"][data-status="booked"]`).first();
  await expect(again).toBeVisible();
  await expect(again.getByTestId('note-text')).toHaveValue(BOOK_NOTE);
});

test('預約筆記：打了備註不按 Enter 直接按狀態，兩個都存得下來', async ({ page }) => {
  const TEXT2 = '先打字再按狀態（e2e）';
  await ready(page);
  await showDay(page, '2027-02-05');
  await openAccountItem(page, 'reservations');
  const row = page.getByTestId('map-panel').getByTestId('note-row').first();
  const placeId = (await row.getAttribute('data-place'))!;
  await row.getByTestId('note-text').fill(TEXT2);
  await row.getByTestId('note-status-booked').click();
  await page.getByTestId('map-panel-close').click();
  await switchUser(page, 'dev-agong');
  await openAccountItem(page, 'reservations');
  const again = page.getByTestId('map-panel').locator(`[data-testid="note-row"][data-place="${placeId}"]`).first();
  await expect(again).toHaveAttribute('data-status', 'booked');
  await expect(again.getByTestId('note-text')).toHaveValue(TEXT2);
});

const tlRow = (page: Page, item: string) => page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-item="${item}"]`);

test('第四輪：一般模式只看；合併卡片換著看、⋯ 的主要、標「分組」、備卡拖回候選', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  // 一般模式：午餐 tag、＋1、頭像；沒有 −／＋、⋯
  const lunch = tlRow(page, 'i-7');
  await expect(lunch.getByTestId('item-tag')).toHaveText(['午餐']);
  await expect(lunch.getByTestId('stay-minus')).toHaveCount(0);
  await expect(lunch.getByTestId('item-menu')).toHaveCount(0);
  await expect(lunch.getByTestId('tag-edit')).toHaveCount(0);
  await expect(lunch).toContainText('漣不能訂位'); // 備註一般模式也看得到（只是不能改）
  const aquarium = tlRow(page, 'i-6');
  await aquarium.getByTestId('avatar-stack').click();
  await expect(aquarium.getByTestId('avatar-list')).toContainText('媽媽');

  // 合併卡片：疊層、看的是主卡；‹ › 換著看備卡，一般模式不能改，地圖上那個點亮起來（第六輪：卡片上沒有 👑）
  // 備卡的 data-shown／data-main 寫在卡片的 li 上
  const stack = lunch;
  await expect(stack).toHaveAttribute('data-shown', '0');
  await expect(stack).toHaveAttribute('data-main', 'true');
  await expect(lunch.getByTestId('option-crown')).toHaveCount(0);
  await stack.getByTestId('option-next').click();
  await expect(stack).toHaveAttribute('data-shown', '1');
  await expect(stack).toHaveAttribute('data-main', 'false');
  await expect.poll(() => th(page, '__th.appStore.getState().highlights.primary')).toEqual(['toba-kazuei']);
  await stack.getByTestId('option-prev').click();
  await expect(stack).toHaveAttribute('data-shown', '0');

  // 編輯中：看一榮 → ⋯ → 主要 → 卡片換成一榮（看主卡時「主要」不能點）
  await enterPlanning(page);
  await lunch.getByTestId('item-menu').click();
  await expect(page.getByTestId('action-menu').getByTestId('action-main')).toBeDisabled();
  await page.keyboard.press('Escape');
  await stack.getByTestId('option-next').click();
  await lunch.getByTestId('item-menu').click();
  await page.getByTestId('action-menu').getByTestId('action-main').click();
  await expect(lunch).toHaveAttribute('data-place', 'toba-kazuei');

  // 標籤：點 tag 那一排 → 分組（Esc 關彈窗）
  await lunch.getByTestId('tag-edit').click();
  await page.getByTestId('tag-popover').getByTestId('tag-opt-groups').click();
  await expect(lunch.getByTestId('item-tag')).toHaveText(['午餐', '分組']);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tag-popover')).toHaveCount(0);

  // 看漣 → 拖到候選區：回到這天的候選，卡片不再疊；提示可以復原
  await page.setViewportSize({ width: 1600, height: 1200 });
  await expect(stack).toHaveAttribute('data-main', 'true');
  await stack.getByTestId('option-next').click();
  await dragOnto(lunch, page.getByTestId('day-candidates'), 0.5);
  await expect(lunch.getByTestId('option-switch')).toHaveCount(0);
  await expect(cand(page, 'toba-sazanami')).toBeVisible();
  await expect(page.getByTestId('toast-undo')).toBeVisible();
});

test('第四輪：住宿卡片的方案 tag（照資料是一泊二食）；沒有「換住宿」，想去的住宿沒有「設為住宿」', async ({ page }) => {
  await ready(page);
  // 先 ❤️ 一間住宿，想去才有它
  await openDetail(page, 'toba-kokusai-hotel');
  await page.getByTestId('detail-like').click();
  await closeDetail(page);
  await showDay(page, DAY);
  const lodging = page.getByTestId('timeline').locator('.tl-lodging');
  await expect(lodging.getByTestId('lodging-plan-tag')).toHaveText('一泊二食');
  await enterPlanning(page);
  await expect(page.getByTestId('timeline').getByTestId('lodging-change')).toHaveCount(0);
  const list = await openWish(page, 'toba-kokusai-hotel');
  await expect(wish(list, 'toba-kokusai-hotel')).toBeVisible();
  await expect(wish(list, 'toba-kokusai-hotel').getByTestId('wish-set-lodging')).toHaveCount(0);
});

test('第五輪：交通卡平常收起，計程車點了只畫那一段、不展開；編輯中原地改方式、備註', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  const legs = page.getByTestId('timeline').getByTestId('tl-leg');
  await expect(legs.nth(1)).toBeVisible();
  const first = legs.first();
  // 一般模式：標題（SVG 圖示、方式＋分鐘）、Google Maps 小圖示，沒有緩衝、沒有編輯；點了地圖畫一條路線，計程車沒有步驟可以展開
  await expect(first.getByTestId('leg-maps')).toHaveAttribute('href', /google\.com\/maps\/dir\/.*travelmode=/);
  await expect(first.getByTestId('leg-line').getByRole('img', { name: '計程車' })).toBeVisible();
  await expect(first.locator('.ll-title')).toHaveText(/^計程車 \d+ 分/);
  await expect(first).not.toContainText('緩衝');
  await first.getByRole('button').first().click();
  await expect(first.getByTestId('leg-editor')).toHaveCount(0);
  await expect(first.getByTestId('leg-steps')).toHaveCount(0);
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(1);
  // 一次只選一段：點第二段
  await legs.nth(1).getByRole('button').first().click();
  await expect(legs.nth(1).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(first.getByRole('button').first()).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(1);
  // 再點一次 → 路線清掉
  await legs.nth(1).getByRole('button').first().click();
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(0);

  // 編輯中：收起時右邊寫「改 ›」，點了原地變成編輯狀態；方式只有四種，「自動」寫出它選了什麼；選計程車
  await enterPlanning(page);
  await expect(first.getByTestId('leg-edit')).toHaveText('改');
  // 點那一行不會自己開編輯器，按「改」才開
  await first.getByRole('button').first().click();
  await expect(first.getByTestId('leg-editor')).toHaveCount(0);
  await first.getByTestId('leg-edit').click();
  const editor = first.getByTestId('leg-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('leg-mode')).toHaveCount(4);
  await expect(editor.locator('[data-testid="leg-mode"][data-mode="auto"]')).toHaveText('自動（計程車）');
  await expect(editor.getByTestId('leg-buffer-plus')).toHaveCount(0);
  await editor.locator('[data-testid="leg-mode"][data-mode="taxi"]').click();
  await expect(first.locator('[data-testid="leg-mode"][data-mode="taxi"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(first.locator('.ll-title')).toContainText('計程車');
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
  await leg.getByTestId('leg-edit').click();
  const minutes = leg.getByTestId('leg-minutes');
  await expect(minutes).toHaveValue('165');
  // 改成 170：存下來、卡片跟著變，欄位還在
  await minutes.fill('170');
  await minutes.blur();
  await expect.poll(travel).toContain('"minutes":170');
  await expect(leg.getByTestId('leg-line-text')).toContainText('170 分');
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
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-06'));
  await expect.poll(() => th(page, '__th.uiStore.getState().legOpen')).toBe(null);
  await expect.poll(opacity).toBe(normal);
  expect(normal).not.toBe('0.1');
});

test('最後檢查：預約筆記點名稱打開詳情', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await openAccountItem(page, 'reservations');
  const panel = page.getByTestId('map-panel');
  await expect(panel).toBeVisible();
  const row = panel.getByTestId('note-row').first();
  const placeId = (await row.getAttribute('data-place'))!;
  await row.locator('.link-button').first().click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  expect(await th(page, '__th.appStore.getState().detailId')).toBe(placeId);
  // 電腦版視窗還在
  await expect(page.getByTestId('map-panel')).toBeVisible();
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

/** 探索分頁裡那個點的卡片 */
async function exploreCard(page: Page, id: string): Promise<Locator> {
  const type = (await th(page, `__th.dataStore.getState().byId.get('${id}').type`)) as string;
  await page.getByTestId('side-tab-explore').click();
  await page.evaluate((t) => (window as any).__th.appStore.getState().setFilter({ types: [t] }), type);
  const card = page.locator(`[data-testid="explore-item"][data-id="${id}"]`);
  await card.scrollIntoViewIfNeeded();
  return card;
}

test('第四輪：探索的卡片沒有加到某天；按想去就到想去', async ({ page }) => {
  await ready(page);
  const card = await exploreCard(page, PLACE);
  await expect(card.getByTestId('add-to-day')).toHaveCount(0);
  // 還沒人按想去：照片上是空心的愛心
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'false');
  await card.getByTestId('card-like').click();
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByTestId('card-like')).toContainText('1');
  // 想去有它，加到某天在想去的卡片上
  const list = await openWish(page);
  await expect(wish(list).getByTestId('wish-add')).toBeVisible();
});

test('探索：愛心一直都在，按了再按就收回；卡片上沒有不想去', async ({ page }) => {
  await ready(page);
  const card = await exploreCard(page, PLACE);
  await expect(card.getByTestId('card-like')).toBeVisible();
  await expect(card.getByTestId('card-dislike')).toHaveCount(0);
  await card.getByTestId('card-like').click();
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'true');
  await card.getByTestId('card-like').click();
  await expect(card.getByTestId('card-like')).toHaveAttribute('aria-pressed', 'false');
});

/** 電腦版的 HTML5 拖曳：放在目標的第 frac 高度（0.5＝中間＝合併；靠上下邊緣＝插入） */
async function dragOnto(source: Locator, target: Locator, frac: number) {
  const box = (await target.boundingBox())!;
  await source.dragTo(target, { targetPosition: { x: Math.min(200, box.width / 2), y: box.height * frac } });
}

test('第四輪：編輯中把餐廳拖到另一間餐廳的中間 → 合併；按復原回到兩張卡片（電腦版）', async ({ page }) => {
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
  await expect(target.getByTestId('option-switch')).toBeVisible();
  // 合併後看的是主卡（原本那間）
  await expect(target).toHaveAttribute('data-main', 'true');
  await expect(src).toHaveCount(0);
  await expect(rows).toHaveCount(n - 1);
  await expect(page.getByTestId('toast')).toContainText('已合併到');

  // 復原：回到兩張卡片
  await page.getByTestId('toast-undo').click();
  await expect(src).toBeVisible();
  await expect(target.getByTestId('option-switch')).toHaveCount(0);
  await expect(rows).toHaveCount(n);
});

test('第四輪：編輯中把候選拖到兩張卡片之間 → 時間軸多一站、候選少一筆（電腦版）', async ({ page }) => {
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
  // 馬上按復原：時間軸少回一站，候選加回來（候選拿掉之後才跳復原提示）
  await page.getByTestId('toast-undo').click();
  await expect(rows).toHaveCount(n);
  await expect(cand(page, C)).toBeVisible();
});

/** 第四輪完成條件：加到 2/5 → 編輯中 ↑ 排進 → 標午餐和分開吃 → 交通改計程車 → 復原快照 */
test('第四輪完成條件：排進、標午餐和分組、交通改計程車、復原快照', async ({ page }) => {
  const D = '2027-02-05';
  await ready(page);
  const before = (await th(page, '__th.dataStore.getState().itinerary')) as { days: unknown };

  // 1. 把點加到 2/5（想去的卡片「加到某天」；先按 ❤️）→ 開始編輯
  await openDetail(page, PLACE);
  await page.getByTestId('detail-like').click();
  const list = await openWish(page);
  await wish(list).getByTestId('wish-add').click();
  await page.getByTestId(`day-picker-${D}`).click();
  await page.getByTestId('day-picker-done').click();
  await showDay(page, D);
  await enterPlanning(page);
  await expect(cand(page)).toBeVisible();

  // 2. 候選 ↑ 排進
  await cand(page).getByTestId('cand-up').click();
  const row = page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${PLACE}"]`);
  await expect(row).toBeVisible();

  // 3. 水族館標「午餐」；漣那張標「分組」
  const aquarium = tlRow(page, 'i-6');
  // 沒有標籤的卡沒有「＋ 標籤」：從 ⋯ 打開標籤彈窗
  await aquarium.getByTestId('item-menu').click();
  await page.getByTestId('action-menu').getByTestId('action-tags').click();
  await page.getByTestId('tag-popover').getByTestId('tag-opt-lunch').click();
  await expect(aquarium.getByTestId('item-tag')).toHaveText(['午餐']);
  await page.keyboard.press('Escape');
  const lunch = tlRow(page, 'i-7');
  await lunch.getByTestId('tag-edit').click();
  await page.getByTestId('tag-popover').getByTestId('tag-opt-groups').click();
  await expect(lunch.getByTestId('item-tag')).toHaveText(['午餐', '分組']);
  await page.keyboard.press('Escape');

  // 4. 第一段交通改計程車
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  await leg.getByTestId('leg-edit').click();
  await leg.locator('[data-testid="leg-mode"][data-mode="taxi"]').click();
  await expect(leg.locator('.ll-title')).toContainText('計程車');
  await expect(leg.getByTestId('leg-line').getByRole('img', { name: '計程車' })).toBeVisible();

  // 5. 復原快照 → 回到原狀
  await page.getByTestId('snapshots-button').click();
  const snap = page.getByTestId('snapshot').last();
  await snap.getByTestId('snapshot-restore').click();
  await snap.getByTestId('snapshot-restore-confirm').click();
  await expect(page.getByTestId('snapshots-dialog')).toHaveCount(0);
  const after = (await th(page, '__th.dataStore.getState().itinerary')) as { days: unknown };
  expect(after.days).toEqual(before.days);
});

// ───────── 第五輪 ─────────

test('第五輪：編輯入口——日期列的「編輯」，確認後出現藍條，「完成」回到平常；切到全部就結束編輯', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  const toggle = page.getByTestId('planning-toggle');
  await expect(toggle).toHaveText('編輯');
  await expect(page.getByTestId('day-nav').getByTestId('planning-toggle')).toBeVisible();
  await expect(page.getByTestId('planning-bar')).toHaveCount(0);

  // 進入前確認：「開始編輯？」／「開始編輯」，畫面上沒有「規劃模式」
  await toggle.click();
  const dialog = page.getByTestId('planning-dialog');
  await expect(dialog).toContainText('開始編輯？');
  await expect(page.getByTestId('planning-confirm')).toHaveText('開始編輯');
  await expect(page.locator('body')).not.toContainText('規劃模式');
  await page.getByTestId('planning-confirm').click();

  // 編輯中：面板最上面的藍條、藍框；日期列不放「編輯」
  const bar = page.getByTestId('planning-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('編輯 2/5（五）');
  await expect(page.getByTestId('day-panel')).toHaveClass(/editing/);
  await expect(toggle).toHaveCount(0);
  await expect(page.getByTestId('planning-done')).toHaveText('完成');

  // 完成：回到平常
  await page.getByTestId('planning-done').click();
  await expect(bar).toHaveCount(0);
  await expect(toggle).toBeVisible();
  expect(await th(page, '__th.appStore.getState().planning')).toBe(false);

  // 換到別天照樣在編輯；選「整趟」就結束編輯（整趟沒有這天的時間軸，也沒有「編輯」）
  await enterPlanning(page);
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-06'));
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  await page.evaluate(() => (window as any).__th.commands.selectDay('all'));
  await expect.poll(() => th(page, '__th.appStore.getState().planning')).toBe(false);
  await expect(page.getByTestId('planning-bar')).toHaveCount(0);
  await expect(page.getByTestId('planning-strip')).toHaveCount(0);
  await expect(page.getByTestId('planning-toggle')).toHaveCount(0);
});

test('第五輪：編輯中藍條捲出畫面時，地圖上方出現精簡的「編輯中・完成」', async ({ page }) => {
  await ready(page);
  // 2/3 的時間軸夠長，面板捲得動
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  const strip = page.getByTestId('planning-strip');
  await expect(strip).toHaveCount(0);
  // 捲時間軸面板，藍條捲出去 → 精簡條出現；捲回來 → 消失
  const scrollBar = (top: number) =>
    page.getByTestId('planning-bar').evaluate((el, y) => {
      let p = el.parentElement;
      while (p && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
      if (p) p.scrollTop = y;
      return !!p;
    }, top);
  expect(await scrollBar(5000)).toBe(true);
  await expect(strip).toBeVisible();
  await scrollBar(0);
  await expect(strip).toHaveCount(0);
});

test('第五輪：2/3 的等待只出現一次——交通卡下面一條「… 到，等 N 分（午餐 12:00 才開始）」，沒有「空檔」', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const tl = page.getByTestId('timeline');
  await expect(tl.getByTestId('tl-row').first()).toBeVisible();
  // 等多久看路線（OSRM、計程車速度），這裡只看結構
  const wait = tl.getByTestId('tl-wait');
  await expect(wait).toHaveCount(1);
  await expect(wait).toHaveText(/^\d\d:\d\d 到，等 \d+ 分（午餐 12:00 才開始）$/);
  await expect(tl).not.toContainText('空檔');
  await expect(tl.getByTestId('tl-gap')).toHaveCount(0);
  // 位置：交通卡下面、La Mer 上面；La Mer 卡上不再寫「等 N 分」
  const order = await tl.evaluate((el) => [...el.children].map((c) => (c as HTMLElement).dataset.testid + (c.getAttribute('data-item') ? `:${c.getAttribute('data-item')}` : '')));
  const at = order.indexOf('tl-wait');
  expect(order[at - 1]).toBe('tl-leg');
  expect(order[at + 1]).toBe('tl-row:i-3');
  await expect(tlRow(page, 'i-3')).not.toContainText(/等 \d+ 分/);
});

test('第五輪：資料卡右上角的編號——2/3 依序 0（出發的住宿）、1、2、3（回住宿）', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const tl = page.getByTestId('timeline');
  await expect(tl.getByTestId('trip-card-no')).toHaveText(['0', '1', '2', '3']);
  // 縮圖：每張卡都有（有照片是照片，沒有照片是類型色底加一個字）
  await expect(tl.locator('.tc-thumb')).toHaveCount(4);
});

test('第五輪：點交通卡距離不變（步行、計程車平常就用道路路線的距離；OSRM 用假的回應）', async ({ page }) => {
  await ready(page);
  // ready 先擋掉 OSRM；這裡後註冊，優先。距離一律回 18.2 公里，查到後卡片從「（直線）」換成路線距離
  await page.route('**/routing.openstreetmap.de/**', (route) => {
    const m = /\/([\d.]+),([\d.]+);([\d.]+),([\d.]+)/.exec(route.request().url())!;
    const a = [Number(m[1]), Number(m[2])];
    const b = [Number(m[3]), Number(m[4])];
    const mid = [(a[0] + b[0]) / 2 + 0.00123, (a[1] + b[1]) / 2];
    return route.fulfill({ json: { code: 'Ok', routes: [{ distance: 18200, duration: 1500, geometry: { coordinates: [a, mid, b] } }], waypoints: [{ distance: 0 }, { distance: 0 }] } });
  });
  await showDay(page, '2027-02-04');
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').nth(1);
  const sub = leg.locator('.ll-title');
  await expect(sub).toContainText('18.2 公里', { timeout: 20000 });
  await expect(sub).not.toContainText('直線');
  const before = await sub.innerText();
  // 點開（地圖只畫這一段）、收起：距離都一樣
  await leg.getByRole('button').first().click();
  await expect(leg.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => th(page, '__th.appStore.getState().routes.length')).toBe(1);
  await page.waitForTimeout(500);
  await expect(sub).toHaveText(before);
  await leg.getByRole('button').first().click();
  await expect(leg.getByRole('button').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(sub).toHaveText(before);
});

/** 2/4 伊雜宮 → 大王埼燈塔改成大眾運輸（種子資料「自動」挑的是計程車）；回傳那張交通卡，還在編輯中、編輯狀態開著 */
async function transitLeg(page: Page): Promise<Locator> {
  await showDay(page, '2027-02-04');
  await enterPlanning(page);
  const leg = page.getByTestId('timeline').locator('[data-testid="tl-leg"][data-leg="2027-02-04:visit:i-5"]');
  await leg.getByTestId('leg-edit').click();
  await leg.locator('[data-testid="leg-mode"][data-mode="transit"]').click();
  await expect(leg.locator('[data-testid="leg-mode"][data-mode="transit"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(leg.getByTestId('leg-ride-select').first()).toBeVisible();
  return leg;
}

test('第五輪：大眾運輸的交通卡點了展開步驟（等車、御座線），點搭車那一行開班次表（搭不到、選定）', async ({ page }) => {
  await ready(page);
  const leg = await transitLeg(page);
  await leg.getByTestId('leg-done').click();
  await page.getByTestId('planning-done').click();

  // 收起：一行「大眾運輸 N 分・…含等車」，右邊小箭頭；沒有步驟
  await expect(leg.locator('.ll-title')).toHaveText(/^大眾運輸 \d+ 分/);
  await expect(leg.locator('.ll-title')).toContainText(/含等車 \d+ 分/);
  await expect(leg.locator('.ll-chev')).toBeVisible();
  await expect(leg.getByTestId('leg-steps')).toHaveCount(0);
  const sub = await leg.locator('.ll-title').innerText();

  // 點了展開：節點、步行、等車、搭車那一行（巴士圖示＋路線名＋「HH:MM 發」＋「› 班次」）；距離不變
  await leg.getByRole('button').first().click();
  const steps = leg.getByTestId('leg-steps');
  await expect(steps).toBeVisible();
  await expect(steps.getByTestId('leg-step-wait')).toHaveText(/^等 \d+ 分$/);
  const ride = steps.getByTestId('leg-ride');
  await expect(ride).toContainText('御座線');
  await expect(ride).toContainText(/\d\d:\d\d 發/);
  await expect(ride.getByRole('img', { name: '巴士' })).toBeVisible();
  await expect(steps).toContainText('步行');
  await expect(leg.locator('.ll-title')).toHaveText(sub);

  // 點搭車那一行：地圖那側的班次表；一般模式只能看（沒有可以點的班次）
  await ride.click();
  const tt = page.getByTestId('timetable');
  await expect(tt).toBeVisible();
  await expect(tt).toContainText('御座線');
  await expect(tt.getByTestId('timetable-ready')).toContainText('走到');
  await expect(tt.locator('[data-testid="timetable-row"][data-state="missed"]').first()).toContainText('搭不到');
  await expect(tt.locator('[data-testid="timetable-row"][data-state="selected"]')).toContainText('選定');
  await expect(tt.locator('.timetable-row.pickable')).toHaveCount(0);
  await expect(tt.getByTestId('timetable-source')).toContainText('時刻表來源');

  // 再點交通卡收起：步驟、班次表都關掉
  await leg.getByRole('button').first().click();
  await expect(leg.getByTestId('leg-steps')).toHaveCount(0);
  await expect(tt).toHaveCount(0);
});

test('第五輪：編輯中的班次下拉沒有搭不到的班；換了班次時間軸跟著變', async ({ page }) => {
  await ready(page);
  const leg = await transitLeg(page);
  const select = leg.getByTestId('leg-ride-select').first();
  // 走到上車站的時間＝有「⏳ 等」的那個節點的時間
  const readyAt = await leg.getByTestId('leg-step').filter({ has: page.getByTestId('leg-step-wait') }).first().locator('.leg-step-tm').innerText();
  expect(readyAt).toMatch(/^\d\d:\d\d$/);
  const options = () => select.evaluate((s: HTMLSelectElement) => [...s.options].map((o) => ({ value: o.value, text: o.text, disabled: o.disabled })));
  let opts = await options();
  const pickable = opts.filter((o) => !o.disabled);
  expect(pickable.length).toBeGreaterThan(1);
  for (const o of pickable) {
    expect(o.text).toMatch(/^\d\d:\d\d 發 → \d\d:\d\d 到・等 \d+ 分$/);
    expect(o.text.slice(0, 5) >= readyAt).toBe(true);
  }
  // 搭不到的收成一行灰字、不能選
  const missed = opts.filter((o) => o.disabled);
  expect(missed).toHaveLength(1);
  expect(missed[0].text).toMatch(new RegExp(`^${readyAt} 以前的 \\d+ 班搭不到$`));

  // 換成下一班：存下來、等車跟著變長、清單照樣只有搭得到的
  const chosen = pickable[1];
  const waitBefore = await leg.getByTestId('leg-step-wait').first().innerText();
  await select.selectOption(chosen.value);
  await expect(select).toHaveValue(chosen.value);
  await expect(leg.getByTestId('leg-step-wait').first()).not.toHaveText(waitBefore);
  opts = await options();
  for (const o of opts.filter((x) => !x.disabled)) expect(o.text.slice(0, 5) >= readyAt).toBe(true);
});

test('第五輪：地圖彈窗在日期列上面（靠近上緣的點，彈窗蓋住日期列）', async ({ page }) => {
  await ready(page);
  const id = await findPlaceId(page, 'restaurant', 'B');
  const card = page.getByTestId('preview-card');
  // 先 hover 一次量彈窗的高度
  let p = await centerOn(page, id);
  await page.mouse.move(p.x, p.y);
  await expect(card).toBeVisible();
  const h = (await card.boundingBox())!.height;
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);
  // 把點移到日期列正下方：彈窗放在點上方時，上緣落在日期列裡
  // （日期列已搬到右欄，改用地圖上緣）
  const bar = (await page.locator('.map-column').boundingBox())!;
  const target = { x: bar.x + Math.min(bar.width / 2, 200), y: bar.y + 10 + h };
  await page.evaluate(([dx, dy]) => (window as any).__th.map.panBy([dx, dy], { duration: 0 }), [p.x - target.x, p.y - target.y]);
  await waitIdle(page);
  p = await page.evaluate((id) => {
    const t = (window as any).__th;
    const pt = t.map.project(t.dataStore.getState().byId.get(id).coords);
    const r = t.map.getCanvas().getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }, id);
  await page.mouse.move(p.x, p.y);
  await expect(card).toBeVisible();
  const c = (await card.boundingBox())!;
  // 彈窗和日期列重疊的地方，最上面的是彈窗
  const x = Math.max(c.x, bar.x) + 10;
  const y = Math.max(c.y, bar.y) + 5;
  expect(x).toBeLessThan(Math.min(c.x + c.width, bar.x + bar.width));
  expect(y).toBeLessThan(Math.min(c.y + c.height, bar.y + bar.height));
  const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="preview-card"]'), [x, y]);
  expect(onTop).toBe(true);
});

// 第六輪 §2.1、§2.2：標籤彈窗（多選、立刻存、點外面關）、資料卡四欄對齊、這晚的方案
test('標籤：多選、再點取消、點外面關', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const lamer = tlRow(page, 'i-3');
  const tags = lamer.getByTestId('item-tag');
  await expect(tags).toHaveText(['午餐']);
  await expect(lamer.getByTestId('tag-edit')).toHaveCount(0);
  await enterPlanning(page);
  await lamer.getByTestId('tag-edit').click();
  const pop = page.getByTestId('tag-popover');
  await expect(pop).toBeVisible();
  expect(await pop.evaluate((el) => el.parentElement === document.body)).toBe(true);
  // La Mer 是餐廳：三組都有
  await expect(pop.getByRole('menuitemcheckbox')).toHaveCount(10);
  await pop.getByTestId('tag-opt-breakfast').click();
  await expect(tags).toHaveText(['早餐', '午餐']);
  await expect(pop.getByTestId('tag-opt-breakfast')).toHaveAttribute('aria-checked', 'true');
  // 存檔中按鈕不能點（同手機版）；存好再點下一個
  await waitSaved(page);
  await pop.getByTestId('tag-opt-lunch').click();
  await expect(tags).toHaveText(['早餐']);
  await expect(pop.getByTestId('tag-opt-lunch')).toHaveAttribute('aria-checked', 'false');
  await waitSaved(page);
  await pop.getByTestId('tag-opt-groups').click();
  await expect(tags).toHaveText(['早餐', '分組']);
  await waitSaved(page);
  await pop.getByTestId('tag-opt-all').click();
  await expect(tags).toHaveText(['早餐', '全員']);
  await waitSaved(page);
  await expect.poll(() => th(page, `__th.dataStore.getState().itinerary.days.find((d) => d.date === '2027-02-03').items.find((x) => x.id === 'i-3').tags`)).toEqual(['breakfast', 'all']);
  // 點地圖空白處：彈窗關掉
  const map = (await page.locator('.maplibregl-canvas').boundingBox())!;
  await page.mouse.click(map.x + 40, map.y + map.height / 2);
  await expect(pop).toHaveCount(0);
  // 沒有標籤的卡沒有「＋ 標籤」（要從 ⋯ 加）
  const spot = tlRow(page, 'i-2');
  await expect(spot.getByTestId('tag-edit')).toHaveCount(0);
  await expect(spot).not.toContainText('＋ 標籤');
});

test('資料卡：縮圖左緣對齊，⋯ 都在右邊', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const tl = page.getByTestId('timeline');
  const xs = (l: Locator) => l.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
  await expect(tl.locator('.tc-thumb')).toHaveCount(4);
  expect(new Set(await xs(tl.locator('.tc-thumb'))).size).toBe(1);
  await enterPlanning(page);
  await expect(tl.locator('.tc-thumb')).toHaveCount(4);
  expect(new Set(await xs(tl.locator('.tc-thumb'))).size).toBe(1);
  // 出發的住宿沒有 ⋯；景、餐、回住宿的 ⋯ 在同一條直線上，也在縮圖右邊
  const menus = tl.getByTestId('item-menu');
  await expect(menus).toHaveCount(3);
  expect(new Set(await xs(menus)).size).toBe(1);
  const lodging = tl.locator('.tl-lodging');
  const thumb = (await lodging.locator('.tc-thumb').boundingBox())!;
  const menu = (await lodging.getByTestId('item-menu').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(thumb.x + thumb.width);
});

test('回住宿的卡：這晚的方案三選一，再點取消', async ({ page }) => {
  await ready(page);
  await showDay(page, DAY);
  const lodging = page.getByTestId('timeline').locator('.tl-lodging');
  const tag = lodging.getByTestId('lodging-plan-tag');
  // 這晚沒選：照住宿資料（一泊二食），淡色
  await expect(tag).toHaveText('一泊二食');
  await expect(tag).toHaveAttribute('data-from', 'data');
  await enterPlanning(page);
  await lodging.getByTestId('tag-edit').click();
  const pop = page.getByTestId('lodging-plan-popover');
  await expect(pop.getByRole('menuitemradio')).toHaveText(['一泊二食', '只含早餐', '素泊']);
  await pop.getByTestId('lodging-plan-breakfast').click();
  await expect(tag).toHaveText('只含早餐');
  await expect(tag).toHaveAttribute('data-from', 'day');
  await expect(pop.getByTestId('lodging-plan-breakfast')).toHaveAttribute('aria-checked', 'true');
  await waitSaved(page);
  await pop.getByTestId('lodging-plan-none').click();
  await expect(tag).toHaveText('素泊');
  // 畫面先改、後端還在存（假後端 150ms）時再點會被擋（「還在儲存上一個修改」）：等存好再點
  await waitSaved(page);
  await pop.getByTestId('lodging-plan-none').click();
  await expect(tag).toHaveText('一泊二食');
  await expect(tag).toHaveAttribute('data-from', 'data');
  const day = (await th(page, `__th.dataStore.getState().itinerary.days.find((d) => d.date === '${DAY}')`)) as { lodging: string; lodgingMeals: unknown };
  expect(day.lodging).toBe('futami-oishiya');
  expect(day.lodgingMeals ?? null).toBeNull();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
});

// 第六輪 §2.3：「⋯」動作選單（只在編輯中、portal 到 body）、撤下回候選、重疊卡的主要和拿出、候選的 ⋯
const menuOf = (row: Locator) => row.getByTestId('item-menu');
const actionMenu = (page: Page) => page.getByTestId('action-menu');
const candCount = (page: Page) => page.getByTestId('day-candidates').getByTestId('cand-item').count();
/** 共用 store 裡這天這個點的候選 */
const storeCands = (page: Page, placeId: string, day: string) =>
  page.evaluate(
    ([p, d]) =>
      (window as any).__th.shared.store
        .getState()
        .candidates.filter((c: any) => c.placeId === p && c.day === d)
        .map((c: any) => ({ id: c.id, addedBy: c.addedBy })),
    [placeId, day],
  );
const itemStart = (page: Page, day: string, id: string) =>
  page.evaluate(([d, i]) => (window as any).__th.dataStore.getState().itinerary.days.find((x: any) => x.date === d).items.find((x: any) => x.id === i).start ?? null, [day, id]);

test('⋯：不在編輯中沒有，編輯中有；一般卡沒有刪除', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const tl = page.getByTestId('timeline');
  await expect(tl.getByTestId('item-menu')).toHaveCount(0);
  await enterPlanning(page);
  const lamer = tlRow(page, 'i-3');
  await menuOf(lamer).click();
  const menu = actionMenu(page);
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((el) => el.parentElement === document.body)).toBe(true);
  await expect(menu.getByTestId('action-withdraw')).toHaveText('撤下（回候選）');
  await expect(menu.getByText('刪除', { exact: true })).toHaveCount(0);
  await expect(menu.getByTestId('action-delete')).toHaveCount(0);
  // 照 cardActions 的順序：標籤、釘選（La Mer 有 📌 12:00）、移到第幾天｜撤下；網頁版沒有「改停留時間」
  await expect(menu.getByRole('menuitem')).toHaveText(['標籤', '解除釘選', '移到第幾天…', '撤下（回候選）']);
  await expect(menu.getByRole('separator')).toHaveCount(1);
  // 出發住宿那張沒有 ⋯
  await expect(tl.getByTestId('tl-start').getByTestId('item-menu')).toHaveCount(0);
  // Esc 只關選單，地圖的小卡片不會跟著關
  await page.evaluate(() => (window as any).__th.appStore.getState().openPreview('shima-la-mer'));
  await expect(actionMenu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(actionMenu(page)).toHaveCount(0);
  expect(await th(page, '__th.appStore.getState().previewId')).toBe('shima-la-mer');
  await page.evaluate(() => (window as any).__th.appStore.getState().openPreview(null));
  // 🏷 標籤：打開標籤彈窗
  await menuOf(lamer).click();
  await actionMenu(page).getByTestId('action-tags').click();
  await expect(actionMenu(page)).toHaveCount(0);
  await expect(page.getByTestId('tag-popover')).toBeVisible();
  // 開著標籤彈窗結束編輯（閒置自動結束也一樣，不經過點外面），再進來：標籤彈窗不會自己打開
  await page.evaluate(() => (window as any).__th.appStore.getState().setPlanning(false));
  await expect(page.getByTestId('tag-popover')).toHaveCount(0);
  await enterPlanning(page);
  // 卡片重畫一次（hover），彈窗的 anchor 才接得上
  await page.evaluate(() => (window as any).__th.appStore.getState().hover('shima-la-mer'));
  await expect(lamer).toHaveClass(/flash/);
  await expect(page.getByTestId('tag-popover')).toHaveCount(0);
});

test('⋯：釘選、解除釘選', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  const spot = tlRow(page, 'i-2');
  const start = (await spot.getByTestId('fix-start').innerText()).slice(0, 5);
  await menuOf(spot).click();
  await actionMenu(page).getByTestId('action-pin').click();
  await expect.poll(() => itemStart(page, '2027-02-03', 'i-2')).toBe(start);
  await menuOf(spot).click();
  await actionMenu(page).getByTestId('action-unpin').click();
  await expect.poll(() => itemStart(page, '2027-02-03', 'i-2')).toBeNull();
});

test('撤下：卡片變成這天的候選，可以復原', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  const rows = page.getByTestId('timeline').getByTestId('tl-row');
  const n = await rows.count();
  const c = await candCount(page);
  await menuOf(tlRow(page, 'i-2')).click();
  await actionMenu(page).getByTestId('action-withdraw').click();
  await expect(rows).toHaveCount(n - 1);
  await expect(cand(page, 'shima-yokoyama-observatory')).toBeVisible();
  expect(await candCount(page)).toBe(c + 1);
  await expect(page.getByTestId('toast')).toContainText('已撤下・');
  await page.getByTestId('toast-undo').click();
  await expect(rows).toHaveCount(n);
  await expect(rows.first()).toHaveAttribute('data-item', 'i-2');
  await expect(cand(page, 'shima-yokoyama-observatory')).toHaveCount(0);
  expect(await candCount(page)).toBe(c);

  // 這天原本沒有候選的點（La Mer）：撤下時用我的名字加一筆，復原時刪掉
  await menuOf(tlRow(page, 'i-3')).click();
  await actionMenu(page).getByTestId('action-withdraw').click();
  await expect(cand(page, 'shima-la-mer')).toBeVisible();
  expect(await storeCands(page, 'shima-la-mer', '2027-02-03')).toEqual([expect.objectContaining({ addedBy: 'dev-baba' })]);
  await page.getByTestId('toast-undo').click();
  await expect(tlRow(page, 'i-3')).toBeVisible();
  await expect.poll(() => storeCands(page, 'shima-la-mer', '2027-02-03')).toEqual([]);
});

test('撤下：已經有候選時復原不刪別人的候選', async ({ page }) => {
  await ready(page);
  // 阿公先把 La Mer 加成 2/3 的候選
  await switchUser(page, 'dev-agong');
  await page.evaluate(() => (window as any).__th.shared.addCandidate('shima-la-mer', '2027-02-03'));
  await switchUser(page, 'dev-baba');
  const theirs = await storeCands(page, 'shima-la-mer', '2027-02-03');
  expect(theirs).toEqual([expect.objectContaining({ addedBy: 'dev-agong' })]);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  await menuOf(tlRow(page, 'i-3')).click();
  await actionMenu(page).getByTestId('action-withdraw').click();
  await expect(cand(page, 'shima-la-mer')).toBeVisible();
  expect(await storeCands(page, 'shima-la-mer', '2027-02-03')).toEqual(theirs);
  await page.getByTestId('toast-undo').click();
  await expect(tlRow(page, 'i-3')).toBeVisible();
  await expect(cand(page, 'shima-la-mer')).toHaveCount(0);
  expect(await storeCands(page, 'shima-la-mer', '2027-02-03')).toEqual(theirs);
});

test('重疊卡：主要、拿出', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  const lunch = tlRow(page, 'i-7');
  // 備卡的 data-shown／data-main 寫在卡片的 li 上
  const stack = lunch;
  // 卡片上沒有 👑、設為主要、拿出來的按鈕；‹ 1/2 › 還在
  await expect(lunch.getByTestId('option-crown')).toHaveCount(0);
  await expect(lunch.getByTestId('option-make-main')).toHaveCount(0);
  await expect(lunch.getByTestId('option-takeout')).toHaveCount(0);
  await stack.getByTestId('option-next').click();
  await expect(stack).toHaveAttribute('data-shown', '1');
  // 看備卡時也有 ⋯；最上面一組是主要、拿出
  await menuOf(lunch).click();
  await expect(actionMenu(page).getByRole('menuitem').first()).toHaveText('主要');
  await actionMenu(page).getByTestId('action-main').click();
  await expect(lunch).toHaveAttribute('data-place', 'toba-kazuei');

  // 看漣（現在是備卡）→ 拿出：時間軸多一張單獨的卡（排在一榮後面），候選數量不變
  const rows = page.getByTestId('timeline').getByTestId('tl-row');
  const n = await rows.count();
  const c = await candCount(page);
  await stack.getByTestId('option-next').click();
  await menuOf(lunch).click();
  await actionMenu(page).getByTestId('action-detach').click();
  await expect(rows).toHaveCount(n + 1);
  await expect(lunch.getByTestId('option-switch')).toHaveCount(0);
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-place')));
  expect(ids[ids.indexOf('toba-kazuei') + 1]).toBe('toba-sazanami');
  expect(await candCount(page)).toBe(c);
});

test('候選的 ⋯：排進這天、刪除', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  const cruise = cand(page, 'toba-bay-cruise-irukajima');
  await expect(cruise.getByTestId('item-menu')).toHaveCount(0);
  await enterPlanning(page);
  // 媽媽加的：有排進這天、刪除，沒有移到第幾天
  await cruise.getByTestId('item-menu').click();
  const menu = actionMenu(page);
  await expect(menu.getByRole('menuitem')).toHaveText(['排進這天', '刪除']);
  await expect(menu.getByTestId('action-move')).toHaveCount(0);
  // 刪別人加的：開拿掉的對話框（要寫理由）
  await menu.getByTestId('action-delete').click();
  await expect(page.getByTestId('reject-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reject-dialog')).toHaveCount(0);
  // 排進這天：時間軸多一張、候選少一筆
  await cruise.getByTestId('item-menu').click();
  await actionMenu(page).getByTestId('action-schedule').click();
  await expect(cruise).toHaveCount(0);
  await expect(page.getByTestId('timeline').locator('[data-testid="tl-row"][data-place="toba-bay-cruise-irukajima"]')).toBeVisible();
  await waitSaved(page);

  // 自己加的候選（2/6 燒貝いろは是爸爸加的）：有移到第幾天，移過去之後在那天的候選
  await showDay(page, '2027-02-06');
  const iroha = cand(page, 'toba-yakigai-iroha');
  await iroha.getByTestId('item-menu').click();
  await expect(actionMenu(page).getByRole('menuitem')).toHaveText(['排進這天', '移到第幾天…', '刪除']);
  await actionMenu(page).getByTestId('action-move').click();
  await page.getByTestId('move-dialog').locator('[data-pick-day="2027-02-08"]').click();
  await expect(page.getByTestId('move-dialog')).toHaveCount(0);
  await expect.poll(() => storeCands(page, 'toba-yakigai-iroha', '2027-02-08')).toEqual([expect.objectContaining({ addedBy: 'dev-baba' })]);
  expect(await storeCands(page, 'toba-yakigai-iroha', '2027-02-06')).toEqual([]);
  // 自己加的直接刪
  await showDay(page, '2027-02-08');
  const moved = cand(page, 'toba-yakigai-iroha');
  await moved.getByTestId('item-menu').click();
  await actionMenu(page).getByTestId('action-delete').click();
  await expect(moved).toHaveCount(0);
});

test('排進這天：存檔中換到別天，存好後不會被拉回去', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  const cruise = cand(page, 'toba-bay-cruise-irukajima');
  await cruise.getByTestId('item-menu').click();
  await actionMenu(page).getByTestId('action-schedule').click();
  // 假後端存一次 150ms：還在存的時候換天
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-06'));
  await waitSaved(page);
  await page.waitForTimeout(200);
  expect(await th(page, '__th.appStore.getState().day')).toBe('2027-02-06');
  expect(await storeCands(page, 'toba-bay-cruise-irukajima', '2027-02-05')).toEqual([]);
});

test('移到第幾天：留在原本那天、可以復原（同手機版）', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  await menuOf(tlRow(page, 'i-3')).click();
  await actionMenu(page).getByTestId('action-move').click();
  await page.getByTestId('move-dialog').locator('[data-pick-day="2027-02-04"]').click();
  await expect(page.getByTestId('move-dialog')).toHaveCount(0);
  await expect(tlRow(page, 'i-3')).toHaveCount(0);
  expect(await th(page, '__th.appStore.getState().day')).toBe('2027-02-03');
  await expect(page.getByTestId('toast')).toContainText('已移到 2/4');
  await page.getByTestId('toast-undo').click();
  await expect(tlRow(page, 'i-3')).toBeVisible();
});

// ---------- 第六輪 Task 5：Google Map 文字、等待卡、移到第幾天 4×3、紅字日期 ----------

test('交通那一行右邊是「地圖 ↗」文字', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await expect(page.getByTestId('leg-maps').first()).toHaveText('地圖 ↗');
});

test('等待卡不能點、沒有看附近', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const wait = page.getByTestId('timeline').getByTestId('tl-wait');
  await expect(wait).toHaveCount(1);
  await expect(wait.locator('button')).toHaveCount(0);
  await wait.click();
  await expect(page.getByText('看附近')).toHaveCount(0);
  await expect(page.getByTestId('timeline').locator('.tl-gap-actions')).toHaveCount(0);
});

test('移到第幾天：4×3 格子、紅字、沒有「假日」', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  await menuOf(tlRow(page, 'i-3')).click();
  await actionMenu(page).getByTestId('action-move').click();
  const dlg = page.getByTestId('move-dialog');
  const cells = dlg.getByTestId('move-day');
  await expect(cells).toHaveCount(12);
  const cols = await dlg.getByTestId('day-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(4);
  for (const d of ['02-06', '02-07', '02-11', '02-13']) await expect(dlg.locator(`[data-pick-day="2027-${d}"]`)).toHaveClass(/red-day/);
  await expect(dlg.locator('[data-pick-day="2027-02-10"]')).not.toHaveClass(/red-day/);
  await expect(dlg.locator('[data-pick-day="2027-02-06"]')).toContainText('六');
  await expect(dlg.locator('[data-pick-day="2027-02-10"]')).toContainText('三');
  await expect(dlg.locator('[data-pick-day="2027-02-06"] .ui-dg-wd')).toHaveCSS('color', 'rgb(192, 57, 43)');
  await expect(dlg.locator('[data-pick-day="2027-02-10"] .ui-dg-wd')).not.toHaveCSS('color', 'rgb(192, 57, 43)');
  const cur = dlg.locator('[data-pick-day="2027-02-03"]');
  await expect(cur).toBeDisabled();
  await expect(cur).toContainText('現在');
  await expect(page.getByText('假日')).toHaveCount(0);
});

test('日期列：週六、週日、假日紅字', async ({ page }) => {
  await ready(page);
  for (const d of ['02-06', '02-07', '02-11', '02-13']) await expect(page.locator(`.side-column [data-day="2027-${d}"]`)).toHaveClass(/red-day/);
  await expect(page.locator('.side-column [data-day="2027-02-10"]')).not.toHaveClass(/red-day/);
});

test('詳情的問 AI：點建議問題，聊天欄出現那句', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__th.appStore.getState().setMode('explore'));
  await openDetail(page, 'shima-yokoyama');
  const box = page.getByTestId('ask-ai-box');
  await expect(box).toBeVisible();
  expect(await box.getByTestId('ask-ai-prompt').count()).toBeGreaterThanOrEqual(4);
  await expect(box.getByTestId('ask-ai-prompt').filter({ hasText: '這天排它會不會太趕？' })).toHaveCount(0);
  const first = box.getByTestId('ask-ai-prompt').first();
  const q = (await first.textContent())!;
  await first.click();
  await expect(page.getByTestId('chat-panel')).toContainText(q);
  await box.getByTestId('ask-ai-input').fill('自己問的');
  await box.getByTestId('ask-ai-input').press('Enter');
  await expect(page.getByTestId('chat-panel')).toContainText('自己問的');
});

test('從行程打開的詳情多「這天排它會不會太趕？」', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await openDetail(page, 'shima-yokoyama');
  await expect(page.getByTestId('ask-ai-box').getByTestId('ask-ai-prompt').first()).toHaveText('這天排它會不會太趕？');
});

test('加到某天（DayGrid12 多選）：已排寫「已排」不能點、已選 N 天會變、取消自己的候選按「好」就拿掉', async ({ page }) => {
  await ready(page);
  const AQ = 'toba-aquarium';
  const list = await openWish(page, AQ);
  await wish(list, AQ).getByTestId('wish-add').click();
  const dlg = page.getByTestId('wish-add-pop');
  const sched = page.getByTestId('day-picker-2027-02-05');
  await expect(sched).toContainText('已排');
  await expect(sched).toBeDisabled();
  const n0 = Number(((await page.getByTestId('day-picker-count').textContent()) ?? '').replace(/\D/g, ''));
  const c8 = page.getByTestId('day-picker-2027-02-08');
  await expect(c8).toHaveAttribute('aria-pressed', 'false');
  await c8.click();
  await expect(c8).toHaveAttribute('aria-pressed', 'true');
  await expect(c8.locator('svg')).toBeVisible(); // 選中的角落有勾
  await expect(page.getByTestId('day-picker-count')).toHaveText(`已選 ${n0 + 1} 天`);
  await page.getByTestId('day-picker-2027-02-09').click();
  await expect(page.getByTestId('day-picker-count')).toHaveText(`已選 ${n0 + 2} 天`);
  await page.getByTestId('day-picker-done').click();
  await expect(dlg).toHaveCount(0);
  await expect(wish(list, AQ).getByTestId('place-caps')).toContainText('2/8');
  // 再開一次：取消自己加的 2/8，按「好」就拿掉
  await wish(list, AQ).getByTestId('wish-add').click();
  await expect(page.getByTestId('day-picker-2027-02-08')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('day-picker-2027-02-08').click();
  await expect(page.getByTestId('day-picker-count')).toHaveText(`已選 ${n0 + 1} 天`);
  await page.getByTestId('day-picker-done').click();
  await expect(wish(list, AQ).getByTestId('place-caps')).not.toContainText('2/8');
  await expect(wish(list, AQ).getByTestId('place-caps')).toContainText('2/9');
});

// ---------- 第七輪 Task 3：拿掉重複的入口 ----------

test('第七輪：地圖上沒有浮動列，日期列在右欄、放得下 12 天', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.map-column [data-testid="m-day-strip"]')).toHaveCount(0);
  await expect(page.locator('.map-column [data-testid="account-menu"]')).toHaveCount(0);
  await expect(page.locator('.map-top')).toHaveCount(0);
  await expect(page.locator('.side-column').getByTestId('m-day-all')).toBeInViewport({ ratio: 1 });
  for (const d of ['2027-02-02', '2027-02-13']) await expect(page.locator('.side-column').getByTestId(`m-day-${d}`)).toBeInViewport({ ratio: 1 });
});

test.describe('1440 寬', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('第七輪：日期列放得下 12 天', async ({ page }) => {
    await ready(page);
    for (const d of ['2027-02-02', '2027-02-13']) await expect(page.locator('.side-column').getByTestId(`m-day-${d}`)).toBeInViewport({ ratio: 1 });
  });
});

test.describe('1024 寬', () => {
  test.use({ viewport: { width: 1024, height: 800 } });
  test('第七輪：日期列在右欄、放得下 12 天', async ({ page }) => {
    await ready(page);
    for (const d of ['2027-02-02', '2027-02-13']) await expect(page.locator('.side-column').getByTestId(`m-day-${d}`)).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.map-column [data-testid="toolbar-comments"]')).toHaveCount(0);
  });
});

test('第七輪：日期列只在行程分頁，點日期切到那天', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await expect(page.locator('.side-column').getByTestId('m-day-2027-02-05')).toHaveCount(0);
  await page.getByTestId('side-tab-day').click();
  await page.locator('.side-column').getByTestId('m-day-2027-02-05').click();
  await expect(page.locator('.side-column').getByTestId('m-day-2027-02-05')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.side-column').getByTestId('m-day-2027-02-06')).toHaveClass(/red-day/);
  await expect(page.locator('.side-column').getByTestId('m-day-all')).toHaveText('整趟');
});

test('第七輪：頭像選單打開討論、預約；Esc 關掉', async ({ page }) => {
  await ready(page);
  await openAccountItem(page, 'comments');
  await expect(page.getByTestId('map-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('map-panel')).toHaveCount(0);
  await openAccountItem(page, 'reservations');
  await expect(page.getByTestId('map-panel')).toHaveAttribute('data-kind', 'reservations');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('map-panel')).toHaveCount(0);
});

test('第七輪：頭像選單有使用者、討論、預約、下載、切換使用者；Esc 收起', async ({ page }) => {
  await ready(page);
  await page.getByTestId('account-menu').click();
  const menu = page.getByTestId('account-popover');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('討論');
  await expect(menu).toContainText('預約');
  await expect(menu).toContainText('下載行程');
  await expect(menu).toContainText('切換使用者');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('第七輪：詳情沒有「＋問 AI」按鈕', async ({ page }) => {
  await ready(page);
  await openDetail(page, PLACE);
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  await expect(page.getByTestId('detail-ask')).toHaveCount(0);
});

test('篩選：往下捲也是同一列，打開的抽屜整個看得到', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await expect(page.getByTestId('explore-item').first()).toBeVisible();
  await page.locator('.side-body').evaluate((el) => el.scrollTo(0, 1500));
  await expect(page.getByTestId('filter-bar')).toBeInViewport();
  await page.getByTestId('filter-open').click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByTestId('filter-opt-tier-S').scrollIntoViewIfNeeded();
  await expect(sheet.getByTestId('filter-opt-tier-S')).toBeInViewport();
  await expect(page.getByTestId('filter-done')).toBeInViewport();
});

test('篩選：套用的條件變成晶片，點 ✕ 取消', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-opt-area-toba').click();
  await page.getByTestId('filter-opt-group-yes').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0);
  const applied = page.getByTestId('filter-applied');
  await expect(applied).toHaveCount(2);
  await expect(page.getByTestId('filter-count')).toHaveText('2');
  await applied.first().locator('.ui-chip-x').click();
  await expect(applied).toHaveCount(1);
});

test('清單列：長名稱不推動 ❤ 的位置', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('view-list').click();
  await page.getByTestId('search').fill('Bayside');
  const rows = page.getByTestId('explore-item');
  await expect(rows.nth(1)).toBeVisible();
  const hearts = [await rows.nth(0).getByTestId('card-like').boundingBox(), await rows.nth(1).getByTestId('card-like').boundingBox()];
  expect(Math.round(hearts[0]!.x)).toBe(Math.round(hearts[1]!.x));
  expect(Math.round((await rows.nth(0).boundingBox())!.height)).toBe(88);
  expect(Math.round((await rows.nth(1).boundingBox())!.height)).toBe(88);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('網頁探索是兩欄', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('view-photo').click();
  // DOM 順序是先左欄再右欄，所以用排名找第 1、2 張
  const item = (rank: number) => page.locator(`[data-testid="explore-item"][data-rank="${rank}"]`);
  await expect(item(2)).toBeVisible();
  const [a, b] = [(await item(1).boundingBox())!, (await item(2).boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(40);
  expect(Math.round(a.x)).not.toBe(Math.round(b.x));
});

// ---------- 第七輪 Task 6：想去分三段 ----------
test('想去：三段、已排預設收合、跳轉', async ({ page }) => {
  await ready(page);
  await likeMany(page, 12);
  await page.getByTestId('side-tab-wish').click();
  const panel = page.getByTestId('wish-panel');
  await expect(panel.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByTestId('wish-section-candidate')).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByTestId('wish-section-unscheduled')).toHaveAttribute('aria-expanded', 'true');
  // 收合的段落不畫列；點標題展開
  await expect(panel.locator('[data-section="scheduled"] [data-testid="wish-item"]')).toHaveCount(0);
  await panel.getByTestId('wish-section-scheduled').click();
  await expect(panel.locator('[data-section="scheduled"] [data-testid="wish-item"]').first()).toBeVisible();
  await panel.getByTestId('wish-section-scheduled').click();
  await expect(panel.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
  // 跳轉：點「已是候選」，那一段的標題黏在跳轉列下面，晶片變成現在這段
  await panel.getByTestId('wish-jump-candidate').click();
  await expect(panel.getByTestId('wish-jump-candidate')).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(async () => {
      const jump = await panel.getByTestId('wish-jump-candidate').boundingBox();
      const head = await panel.getByTestId('wish-section-candidate').boundingBox();
      return head!.y - (jump!.y + jump!.height);
    })
    .toBeLessThan(24);
  // 收合的狀態記住
  await page.reload();
  await page.waitForFunction(() => (window as any).__th?.dataStore.getState().status === 'ready');
  await page.getByTestId('side-tab-wish').click();
  await expect(page.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
});

test('想去：每段先 8 個，再顯示 15 個', async ({ page }) => {
  await ready(page);
  await likeMany(page, 12);
  await page.getByTestId('side-tab-wish').click();
  const panel = page.getByTestId('wish-panel');
  const rows = panel.locator('[data-section="unscheduled"] [data-testid="wish-item"]');
  const total = Number(((await panel.getByTestId('wish-jump-unscheduled').locator('.ui-chip-count').textContent()) ?? '').trim());
  expect(total).toBeGreaterThanOrEqual(12);
  await expect(rows).toHaveCount(8);
  await panel.getByTestId('wish-more-unscheduled').click();
  await expect(rows).toHaveCount(Math.min(total, 23));
});

test('想去：點最新留言開詳情', async ({ page }) => {
  await ready(page);
  const [id] = await likeMany(page, 1);
  await page.evaluate((id) => (window as any).__th.shared.comment(id, '這裡晚上很漂亮。要早點去', 'normal'), id);
  await page.getByTestId('side-tab-wish').click();
  const row = page.locator(`[data-testid="wish-item"][data-id="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByTestId('wish-last-comment')).toHaveText('這裡晚上很漂亮。');
  await row.getByTestId('wish-last-comment').click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  await expect(page.getByTestId('detail-panel').getByTestId('detail-tab-comments')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('detail-panel').getByTestId('wish-comment')).toContainText('這裡晚上很漂亮。要早點去');
});

test('網頁想去：日曆鈕加到某天', async ({ page }) => {
  await ready(page);
  const [id] = await likeMany(page, 1);
  await page.getByTestId('side-tab-wish').click();
  const row = page.locator(`[data-section="unscheduled"] [data-testid="wish-item"][data-id="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.getByTestId('wish-add').click();
  await expect(page.getByTestId('wish-add-pop')).toBeVisible();
  await page.getByTestId('day-picker-2027-02-06').click();
  await page.getByTestId('day-picker-done').click();
  await expect(page.getByTestId('wish-add-pop')).toHaveCount(0);
  const moved = page.locator(`[data-section="candidate"] [data-testid="wish-item"][data-id="${id}"]`);
  await expect(moved).toHaveCount(1);
  await expect(moved.getByTestId('place-caps')).toContainText('候選 2/6');
  await expect(page.locator(`[data-section="unscheduled"] [data-id="${id}"]`)).toHaveCount(0);
});

test('網頁想去：照片牆的卡片有誰想去，沒有留言', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-wish').click();
  await page.getByTestId('view-photo').click();
  const card = page.getByTestId('wish-item').first();
  await expect(card.getByTestId('wish-who')).toBeVisible();
  await expect(card.getByTestId('wish-last-comment')).toHaveCount(0);
});

test('網頁想去：收合的段落不會因為地圖點擊或投票被改掉記住的狀態', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-wish').click();
  await expect(page.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
  // 地圖點到已排的點：這次畫面展開，但不改記住的收合狀態
  await page.evaluate(() => (window as any).__th.appStore.getState().revealInExplore('toba-aquarium'));
  await expect(page.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('th.wishCollapsed') ?? '{"scheduled":true}').scheduled)).toBe(true);
  // 之後有人按想去（清單重算）不會再把使用者收起來的段落展開
  await page.getByTestId('wish-section-scheduled').click();
  await expect(page.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => (window as any).__th.shared.comment('toba-aquarium', '新留言', 'normal'));
  await expect(page.getByTestId('wish-section-scheduled')).toHaveAttribute('aria-expanded', 'false');
});

// ---------- 第七輪 Task 7：詳情的分頁、動作列、浮在地圖上、放大照片 ----------

test('詳情分頁：簡介、交通、評論、留言', async ({ page }) => {
  await ready(page);
  await openDetail(page, 'ise-naiku');
  const detail = page.getByTestId('detail-panel');
  const tabs = detail.locator('[data-testid^="detail-tab-"]');
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText([/簡介/, /交通/, /評論/, /留言/]);
  await detail.getByTestId('detail-tab-transport').click();
  await expect(detail).toContainText('伊勢市宇治館町1');
  await expect(detail.getByTestId('detail-find-on-map')).toBeVisible();
  await detail.getByTestId('detail-tab-reviews').click();
  await expect(detail.locator('.ratings-box')).toBeVisible();
  await detail.getByTestId('detail-tab-comments').click();
  await expect(detail.getByTestId('comment-input')).toBeVisible();
  // 簡介沒有暫時放的留言
  await detail.getByTestId('detail-tab-intro').click();
  await expect(detail.getByTestId('comment-input')).toHaveCount(0);
});

test('詳情：車站只有簡介和交通', async ({ page }) => {
  await ready(page);
  const id = await page.evaluate(() => [...(window as any).__th.dataStore.getState().byId.values()].find((p: any) => p.type === 'station').id);
  await openDetail(page, id);
  await expect(page.getByTestId('detail-panel').locator('[data-testid^="detail-tab-"]')).toHaveCount(2);
});

test('詳情：留言分頁可以留言', async ({ page }) => {
  await ready(page);
  await openDetail(page, PLACE);
  const detail = page.getByTestId('detail-panel');
  await detail.getByTestId('detail-tab-comments').click();
  await detail.getByTestId('comment-input').fill('分頁留言（e2e）');
  await detail.getByTestId('comment-input').press('Enter');
  await expect(detail.getByTestId('wish-comment')).toContainText('分頁留言（e2e）');
});

test('詳情動作列：想去 N 點了看是誰、不想去、加到某天；頂端只有愛心', async ({ page }) => {
  await ready(page);
  await openDetail(page, PLACE);
  const detail = page.getByTestId('detail-panel');
  await expect(detail.getByTestId('vote-like')).toHaveCount(0);
  await expect(detail.locator('.detail-head').getByTestId('card-like')).toHaveCount(1);
  await expect(detail.locator('.detail-head').getByTestId('detail-dislike')).toHaveCount(0);
  const like = detail.getByTestId('detail-like');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await detail.getByTestId('detail-who').click();
  await expect(detail.getByTestId('avatar-list')).toContainText('我');
  const dislike = detail.getByTestId('detail-dislike');
  await dislike.click();
  await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await detail.getByTestId('detail-add').getByTestId('add-to-day').click();
  await expect(page.getByTestId('day-picker')).toBeVisible();
});

test('詳情：編輯中從行程打開有「排進這天」，從探索打開沒有', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await enterPlanning(page);
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-seahorse', 'map'));
  await expect(page.getByTestId('detail-float').getByTestId('detail-schedule')).toContainText('排進這天');
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-kokusai-hotel', 'map'));
  await expect(page.getByTestId('detail-float').getByTestId('detail-schedule')).toContainText('設成這晚的住宿');
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-seahorse', 'explore'));
  await expect(page.getByTestId('detail-schedule')).toHaveCount(0);
});

test('從行程打開詳情：浮在地圖上，時間軸還在', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-05');
  await expect(page.getByTestId('timeline')).toBeVisible();
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-aquarium', 'map'));
  const float = page.getByTestId('detail-float');
  await expect(float).toBeVisible();
  await expect(page.getByTestId('timeline')).toBeVisible();
  // 浮在地圖那一欄裡，不在右欄
  expect(await float.evaluate((el) => !!el.closest('.map-column'))).toBe(true);
  await expect(page.getByTestId('side-tab-day')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(float).toHaveCount(0);
  // 從探索打開的詳情照舊在右欄
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-aquarium', 'explore'));
  await expect(page.getByTestId('detail-float')).toHaveCount(0);
  await expect(page.locator('.side-column').getByTestId('detail-panel')).toBeVisible();
});

test('點照片放大，左右切換，Esc 關', async ({ page }) => {
  await ready(page);
  const id = await page.evaluate(() => [...(window as any).__th.dataStore.getState().byId.values()].find((p: any) => p.type !== 'station' && p.photos.length >= 3).id);
  await openDetail(page, id);
  await page.getByTestId('detail-panel').getByTestId('detail-photo').first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText(/^2 \/ \d+$/);
  await page.keyboard.press('ArrowLeft');
  await expect(viewer.getByTestId('photo-viewer-count')).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(page.getByTestId('detail-panel')).toBeVisible(); // Esc 只關放大，詳情還在
});

// ---------- 第七輪 Task 8：時間軸的卡片、一行交通、原地展開 ----------

test('點時間軸的卡：原地展開三張照片，沒有地圖小卡片；「詳細資料」浮在地圖上；再點收起', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const row = tlRow(page, 'i-2');
  await expect(row.getByTestId('trip-card-expand')).toHaveCount(0);
  await row.getByTestId('trip-card').click();
  const open = row.getByTestId('trip-card-expand');
  await expect(open).toBeVisible();
  await expect(open.locator('.tc-photo')).toHaveCount(3);
  await expect(open.getByTestId('trip-card-intro')).not.toBeEmpty();
  await expect(page.getByTestId('preview-card')).toHaveCount(0);
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  // 一次只展開一張：點別張，這張收起來
  await tlRow(page, 'i-3').getByTestId('trip-card').click();
  await expect(open).toHaveCount(0);
  await expect(tlRow(page, 'i-3').getByTestId('trip-card-expand')).toBeVisible();
  // 「詳細資料」：詳情浮在地圖右邊，時間軸不動、卡片還是展開的
  await tlRow(page, 'i-3').getByTestId('trip-card-detail').click();
  await expect(page.getByTestId('detail-float')).toBeVisible();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(tlRow(page, 'i-3').getByTestId('trip-card-expand')).toBeVisible();
  await page.keyboard.press('Escape');
  // 再點同一張（點上面那一列，展開的區塊裡點空白處不收）收起
  await tlRow(page, 'i-3').locator('.tc-row').click();
  await expect(tlRow(page, 'i-3').getByTestId('trip-card-expand')).toHaveCount(0);
});

test('點展開的「問 AI」：把這個點帶進聊天', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await tlRow(page, 'i-2').getByTestId('trip-card').click();
  await tlRow(page, 'i-2').getByTestId('trip-card-ask').click();
  const draft = await page.evaluate(() => (window as any).__th.uiStore.getState().chatDraft);
  expect(draft.placeId).toBe('shima-yokoyama-observatory');
  expect(draft.from).toBe('trip');
});

test('網頁時間軸有縮圖、交通是一行', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const row = tlRow(page, 'i-2');
  await expect(row.locator('.tc-thumb img, .tc-thumb [data-testid="item-type"]').first()).toBeVisible();
  await expect(row.getByTestId('trip-card-no')).toBeVisible();
  const lines = page.getByTestId('timeline').getByTestId('leg-line');
  expect(await lines.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await lines.count()); i++) expect((await lines.nth(i).boundingBox())!.height, `leg ${i}`).toBeLessThan(40);
  await expect(page.getByTestId('timeline').getByTestId('leg-maps').first()).toHaveText('地圖 ↗');
  // 平常沒有「改」
  await expect(page.getByTestId('leg-edit')).toHaveCount(0);
});

test('交通編輯器：編輯中點「改」才開', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  const leg = page.getByTestId('timeline').getByTestId('tl-leg').first();
  await expect(leg.getByTestId('leg-editor')).toHaveCount(0);
  // 點那一行只是展開，不開編輯器
  await leg.getByTestId('leg-line-text').click();
  await expect(leg.getByTestId('leg-editor')).toHaveCount(0);
  await leg.getByTestId('leg-edit').click();
  await expect(leg.getByTestId('leg-editor')).toBeVisible();
  await expect(leg.getByTestId('leg-done')).toHaveCount(1);
  await leg.getByTestId('leg-done').click();
  await expect(leg.getByTestId('leg-editor')).toHaveCount(0);
});

test('編輯中：卡片上沒有「＋ 標籤」，沒有標籤的從 ⋯ 加', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await enterPlanning(page);
  await expect(page.getByTestId('timeline').getByText('＋ 標籤')).toHaveCount(0);
  const row = tlRow(page, 'i-2');
  await expect(row.getByTestId('tag-edit')).toHaveCount(0);
  await row.getByTestId('item-menu').click();
  await page.getByTestId('action-menu').getByTestId('action-tags').click();
  await expect(page.getByTestId('tag-popover')).toBeVisible();
});

test('這天的標題：Bodoni 大日期和「週三 · 第 2 天 · 地區」，右邊問 AI 和編輯', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  await expect(page.getByTestId('day-title-date')).toHaveText('2/3');
  await expect(page.getByTestId('day-title-sub')).toHaveText(/^週三 · 第 2 天 · .+/);
  await expect(page.getByTestId('day-ask-ai')).toBeVisible();
  await expect(page.getByTestId('planning-toggle')).toHaveText('編輯');
  await expect(page.getByTestId('day-summary')).toContainText('出發');
});

test('編輯條：墨色底，「編輯 2/3（三）」、快照、完成；編輯中日期列換成編輯條、不能換天；編輯按鈕是墨色主要按鈕', async ({ page }) => {
  await ready(page);
  await showDay(page, '2027-02-03');
  const rgb = (el: Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);
  const ink = await page.evaluate(() => { const d = document.createElement('i'); d.style.background = 'var(--ink)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
  expect(await rgb(page.getByTestId('planning-toggle'))).toBe(ink);
  await expect(page.getByTestId('m-day-strip')).toBeVisible();
  await enterPlanning(page);
  const bar = page.getByTestId('planning-bar');
  expect(await rgb(bar)).toBe(ink);
  await expect(bar).toContainText('編輯 2/3（三）');
  await expect(bar.getByTestId('snapshots-button')).toBeVisible();
  await expect(bar.getByTestId('planning-done')).toBeVisible();
  await expect(page.getByTestId('m-day-strip')).toHaveCount(0);
  await page.getByTestId('planning-done').click();
  await expect(page.getByTestId('m-day-strip')).toBeVisible();
});
