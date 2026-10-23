// T15m 完成條件（PLAN）：手機和電腦尺寸各跑一次，用假後端。
// 寫建議 → 切換成別人看得到、刪不掉 → 進入規劃模式 → 用手動選單排進行程、標成已採用
// → 時間軸出現、有交通時間 → 復原快照後回到原狀。
import { test, type Page } from '@playwright/test';
import { expect, isMobile, ready } from './helpers.ts';

const DAY = '2027-02-07';
const PLACE = 'toba-yakigai-iroha';
const TEXT = '想吃燒貝，小孩應該會喜歡（e2e）';

async function showDay(page: Page, day: string) {
  await page.evaluate((d) => (window as any).__th.commands.selectDay(d), day);
  if (await isMobile(page)) await page.evaluate(() => (window as any).__th.appStore.getState().setSheet({ tab: 'day', snap: 'full' }));
}

async function openDetail(page: Page, id: string) {
  await page.evaluate((x) => (window as any).__th.appStore.getState().openDetail(x), id);
  if (await isMobile(page)) await page.evaluate(() => (window as any).__th.appStore.getState().setSheet({ snap: 'full' }));
}

const card = (page: Page) => page.getByTestId('day-panel').getByTestId('suggestion').filter({ hasText: TEXT });

test('T15m：建議 → 規劃模式排進行程 → 時間軸 → 復原快照', async ({ page }) => {
  await ready(page);

  // 1. 寫建議（小明爸）
  await openDetail(page, PLACE);
  await page.getByTestId('detail-suggest').click();
  await page.getByTestId('suggest-day').selectOption(DAY);
  await page.getByTestId('suggest-text').fill(TEXT);
  await page.getByTestId('suggest-submit').click();
  await expect(page.getByTestId('suggest-dialog')).toHaveCount(0);
  await page.evaluate(() => (window as any).__th.appStore.getState().closeDetail());

  // 寫的人自己看得到刪除
  await showDay(page, DAY);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: /刪除/ })).toBeVisible();

  // 2. 換成阿公：看得到、刪不掉
  await page.getByTestId('me-button').click();
  await page.locator('[data-member="dev-agong"]').click();
  await showDay(page, DAY);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: /刪除/ })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: /改/ })).toHaveCount(0);

  // 3. 進入規劃模式（先確認）
  await page.getByTestId('planning-toggle').click();
  await expect(page.getByTestId('planning-dialog')).toBeVisible();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  const before = await page.evaluate(() => (window as any).__th.dataStore.getState().itinerary);

  // 4. 排進行程：詳情的「📅 排進行程」，選那天；提到這個點的建議順便標成已採用
  await openDetail(page, PLACE);
  await page.getByTestId('detail-add').click();
  await page.getByTestId('add-dialog').locator(`[data-pick-day="${DAY}"]`).click();
  await expect(page.getByTestId('add-dialog').getByRole('checkbox')).toBeChecked();
  await page.getByTestId('add-submit').click();
  await expect(page.getByTestId('add-dialog')).toHaveCount(0);
  await page.evaluate(() => (window as any).__th.appStore.getState().closeDetail());

  // 5. 時間軸出現、有交通時間；建議變成已採用
  await showDay(page, DAY);
  const row = page.getByTestId('timeline').locator(`[data-testid="tl-row"][data-place="${PLACE}"]`);
  await expect(row).toBeVisible();
  await expect(page.getByTestId('timeline').getByTestId('tl-leg').first()).toContainText('分');
  await expect(card(page)).toContainText('已採用');
  await expect(row).toContainText('提的');

  // 手動選單也能用：刪除要再按一次確認
  await row.getByTestId('item-menu').click();
  await expect(row.getByTestId('item-delete')).toBeVisible();
  await page.keyboard.press('Escape');

  // 6. 復原快照：回到排進去之前
  await page.getByTestId('snapshots-button').click();
  const snap = page.getByTestId('snapshot').first();
  await snap.getByTestId('snapshot-restore').click();
  await snap.getByTestId('snapshot-restore-confirm').click();
  await expect(page.getByTestId('snapshots-dialog')).toHaveCount(0);
  await expect(page.getByTestId('timeline').locator(`[data-place="${PLACE}"]`)).toHaveCount(0);
  const after = await page.evaluate(() => (window as any).__th.dataStore.getState().itinerary);
  expect(after.days).toEqual(before.days);
});

test('T15m：別人改過了 → 存不了、提示重新載入', async ({ page }) => {
  await ready(page);
  await page.getByTestId('me-button').click();
  await page.getByTestId('dev-other-edit').click();
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await showDay(page, '2027-02-05');
  await page.getByTestId('timeline').getByTestId('item-menu').nth(1).click();
  await page.getByRole('menuitem', { name: /上移/ }).click();
  await expect(page.getByTestId('conflict-bar')).toBeVisible();
  await page.getByTestId('conflict-bar').getByRole('button', { name: '重新載入' }).click();
  await expect(page.getByTestId('conflict-bar')).toHaveCount(0);
});

test('T15m：投票 ❤️ 和「大家喜歡的」篩選', async ({ page }) => {
  await ready(page);
  await openDetail(page, 'toba-osakaya');
  const like = page.getByTestId('vote-like');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toContainText('1');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  // 水族館有 4 個 ❤️：「大家喜歡的」留著它，沒人投的變淡
  const r = await page.evaluate(() => (window as any).__th.commands.setFilter({ votes: ['popular'] }));
  expect(r.ok).toBe(true);
  const v = await page.evaluate(() => [(window as any).__th.visual('toba-aquarium'), (window as any).__th.visual('toba-osakaya')]);
  expect(v[0].match).toBe(true);
  expect(v[1].match).toBe(false);
});
