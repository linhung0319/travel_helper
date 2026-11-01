// T16m-a：AI 的核心接到真的網站（假 AI、假後端）。還沒有聊天畫面，從 window.__th.ai 操作；畫面的流程在 T16m-b、T16m-c 測。
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

/** 等 AI 啟動；假 AI 不用假裝延遲 */
async function aiReady(page: Page) {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th?.ai);
  await page.evaluate(() => {
    (window as any).__th.aiFake.delayMs = 0;
  });
}

const send = (page: Page, text: string) => page.evaluate((t) => (window as any).__th.ai.send(t), text);

test('找地點：地圖標出結果集，探索的篩選收起來', async ({ page }) => {
  await aiReady(page);
  expect(await send(page, '鳥羽能坐 15 人的海鮮餐廳')).toEqual({ ok: true });
  const ids = await page.evaluate(() => (window as any).__th.appStore.getState().aiResult?.ids);
  expect(ids).toHaveLength(3);
  await expect(page.getByTestId('map-ai-drop')).toHaveCount(3);
});

test('提議：不在編輯中也能提議；地圖有提議列；採用 → 開始編輯？→ 行程更新', async ({ page }) => {
  await aiReady(page);
  await send(page, '幫我排第 3 天，加午餐');
  await expect(page.getByTestId('proposal-bar')).toBeVisible();
  const before = await page.evaluate(() => (window as any).__th.dataStore.getState().itinerary.days.find((d: any) => d.date === '2027-02-04').items.length);

  // 按採用：跳出現有的「開始編輯？」對話框，按了才寫進行程
  await page.evaluate(() => {
    const ai = (window as any).__th.ai;
    const id = ai.store.getState().messages.flatMap((m: any) => m.content).filter((b: any) => b.type === 'tool_use' && b.name === 'propose_changes').at(-1).id;
    (window as any).__adopt = ai.confirmCard(id);
  });
  await page.getByTestId('planning-confirm').click();
  expect(await page.evaluate(() => (window as any).__adopt)).toEqual({ ok: true });
  await expect(page.getByTestId('proposal-bar')).toHaveCount(0);
  const after = await page.evaluate(() => {
    const th = (window as any).__th;
    return { items: th.dataStore.getState().itinerary.days.find((d: any) => d.date === '2027-02-04').items.length, planning: th.appStore.getState().planning };
  });
  expect(after).toEqual({ items: before + 1, planning: true });
});

test('重新整理：對話還在，提議不自動恢復', async ({ page }) => {
  await aiReady(page);
  await send(page, '幫我排第 3 天，加午餐');
  await expect(page.getByTestId('proposal-bar')).toBeVisible();
  await page.reload();
  await aiReady(page);
  const n = await page.evaluate(() => (window as any).__th.ai.store.getState().messages.length);
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId('proposal-bar')).toHaveCount(0);
});
