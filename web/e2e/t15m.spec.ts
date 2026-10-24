// T15m 完成條件（PLAN）：手機和電腦尺寸各跑一次，用假後端。
// 按 ❤️ → 想去分頁出現、留言 → 換人看得到、改不了別人的留言 → 加到某天 → 這天的候選
// → 進入規劃模式按 ↑ 排進 → 時間軸出現、有交通（含緩衝）→ 停留時間 ＋15 → 復原快照後回到原狀。
import { test, type Locator, type Page } from '@playwright/test';
import { expect, isMobile, ready } from './helpers.ts';

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
  await wish(list).getByTestId('wish-add-day').click();
  await wish(list).locator(`[data-add-day="${DAY}"]`).click();
  await expect(wish(list)).toContainText('候選 2/7');

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
  await expect(row).toContainText('提的');
  await expect(page.getByTestId('timeline').getByTestId('tl-leg').first()).toContainText('緩衝');

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

test('T15m：自己加的候選可以撤回；這天的留言', async ({ page }) => {
  await ready(page);
  // 爸爸加的：燒貝いろは（2/6）
  await showDay(page, '2027-02-06');
  const iroha = cand(page, 'toba-yakigai-iroha');
  await iroha.getByTestId('cand-withdraw').click();
  await expect(iroha).toHaveCount(0);

  await showDay(page, '2027-02-07');
  const box = page.getByTestId('day-comments');
  await expect(box.getByTestId('wish-comments')).toContainText('2 則這天的留言');
  await box.getByTestId('wish-comments').click();
  await expect(box.getByTestId('wish-comment').first()).toContainText('泡湯');
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
