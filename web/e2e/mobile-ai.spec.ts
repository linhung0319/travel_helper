// T16m-c：AI 手機版的畫面（規格 §8 的腳本、interaction-design §16.2、§16.3）。假 AI、假後端；截圖放 data/cache/work/t16m/，檔名 m-* 和網頁版區分開。
import { test, expect, type Page } from '@playwright/test';
import { expectFilterOpt, ready } from './helpers.ts';
import { goTab, scrollsSideways } from './mobileHelpers.ts';

const SHOTS = '../data/cache/work/t16m';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/m-${name}.png` });

const fake = (page: Page, s: Record<string, unknown>) => page.evaluate((x) => Object.assign((window as any).__th.aiFake, x), s);
const idle = (page: Page) => expect.poll(() => page.evaluate(() => (window as any).__th.ai.store.getState().status)).toBe('idle');

async function aiReady(page: Page, delayMs = 0) {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake);
  await fake(page, { delayMs });
}

async function say(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-input').press('Enter');
  await idle(page);
}

const app = <T,>(page: Page, fn: string) => page.evaluate((f) => new Function('th', 'm', `return ${f}`)((window as any).__th, (window as any).__thMobile), fn) as Promise<T>;
const itemCount = (page: Page, date: string) => app<number>(page, `th.dataStore.getState().itinerary.days.find((d) => d.date === '${date}').items.length`);
const sheet = (page: Page) => page.getByTestId('m-chat-sheet');
const bar = (page: Page) => page.getByTestId('proposal-bar');
const chip = (page: Page) => page.getByTestId('ai-result-chip');
const cards = (page: Page) => page.getByTestId('m-result-card');
const proposalCard = (page: Page, status = 'pending') => page.locator(`[data-testid="chat-proposal"][data-status="${status}"]`);
const S1 = '鳥羽能坐 15 人的海鮮餐廳';
const S11 = '幫我排第 3 天，加午餐';

/** 這個元素的高度至少 44px */
const tap = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).first().boundingBox();
  expect(box!.height, testId).toBeGreaterThanOrEqual(44);
};

test('AI 分頁：沒有對話時給問題；S1 輪播有理由、想去、詳情；點的範圍至少 44px；沒有橫向捲動', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await expect(page.getByTestId('chat-starter')).toHaveCount(3);
  await expect(page.getByTestId('chat-empty')).toContainText('麥克風');
  await expect(page.getByTestId('chat-screen-hint')).toContainText('正在看：');
  await shot(page, 'ai-empty');

  await say(page, S1);
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByTestId('ai-note')).toHaveCount(3);
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('符合的有 7 家');
  await expect(page.getByTestId('chat-quick')).toHaveCount(2);
  for (const id of ['m-see-map', 'm-see-explore', 'm-result-like', 'm-result-detail', 'chat-quick', 'chat-list-toggle', 'chat-new', 'chat-send', 'chat-add-place']) await tap(page, id);
  // 地圖、探索不切，內容在訊息裡
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  expect(await scrollsSideways(page)).toBe(false);
  await shot(page, 's1');

  // 按想去：直接做
  const ids = await app<string[]>(page, 'th.appStore.getState().aiResult.ids');
  await cards(page).first().getByTestId('m-result-like').click();
  await expect.poll(() => app<number>(page, `th.shared.store.getState().votes.filter((v) => v.placeId === '${ids[0]}' && v.memberId === th.shared.store.getState().me.id).length`)).toBe(1);

  // AI 分頁看不到地圖：點卡片、點地點都直接開詳情，返回回聊天
  await cards(page).first().click();
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', ids[0]);
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('chat-place-tag').first().click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await page.getByTestId('m-detail').getByRole('button', { name: '返回' }).first().click();
});

test('在地圖上看：到行程、開半屏、晶片在地圖上；半屏點卡片指給你看，第二下開詳情；✕ 只清結果集；點晶片、回 AI 都回聊天', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  const ids = await app<string[]>(page, 'th.appStore.getState().aiResult.ids');
  await page.getByTestId('m-see-map').click();
  await expect(page.getByTestId('m-tab-ai')).toHaveCount(1);
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId('ai-result-pill')).toContainText('AI 挑的 · 3 家');
  await expect(page.getByTestId('ai-back')).toHaveCount(0); // 半屏開著不用回 AI
  await expect(cards(page).first()).toBeInViewport();
  await shot(page, 'map-sheet');

  // 第一下：地圖的水滴；第二下：詳情
  await cards(page).first().click();
  await expect.poll(() => app<string | null>(page, 'th.appStore.getState().selectedId')).toBe(ids[0]);
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await cards(page).first().click();
  await expect(page.getByTestId('m-detail')).toHaveAttribute('data-id', ids[0]);
  await page.goBack();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();

  // 關半屏：結果集留著，出現回 AI
  await page.getByTestId('m-chat-sheet-close').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('ai-result-pill')).toBeVisible();
  await expect(page.getByTestId('ai-back')).toBeVisible();
  await tap(page, 'ai-back');
  await shot(page, 'map-closed');
  await page.getByTestId('ai-back').click();
  await expect(sheet(page)).toBeVisible();
  await page.getByTestId('m-chat-sheet-close').click();
  await page.getByTestId('ai-result-open').click();
  await expect(sheet(page)).toBeVisible();
  await page.getByTestId('m-chat-sheet-close').click();

  // ✕ 清掉，回 AI 也不見
  await chip(page).click();
  await expect(page.getByTestId('ai-result-pill')).toHaveCount(0);
  await expect(page.getByTestId('ai-back')).toHaveCount(0);
});

test('在探索看（S1、S16）：取交集、✕ 還原原本的篩選和搜尋；切分頁結果集還在；回 AI', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-search').fill('海');
  await goTab(page, 'ai');
  await say(page, S1);
  await page.getByTestId('m-see-explore').click();
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('ai-result-pill')).toContainText('AI 挑的 · 3 家');
  await expect(page.getByTestId('ai-result-title')).toHaveText('鳥羽能坐 15 人的海鮮');
  await expect(page.getByTestId('m-feed-item')).toHaveCount(3);
  await expect(page.getByTestId('ai-note')).toHaveCount(3);
  await expect(page.getByTestId('m-feed-search')).toHaveValue('');
  await shot(page, 's1-explore');

  // 再搜尋：取交集；沒有就明說
  await page.getByTestId('m-feed-search').fill('いろは');
  await expect(page.getByTestId('ai-result-pill')).toContainText('AI 挑的 3 家中的 1 家');
  await page.getByTestId('m-feed-search').fill('沒有這個名字');
  await expect(page.getByTestId('ai-result-empty')).toBeVisible();
  await page.getByTestId('ai-result-unfilter').click();
  await expect(page.getByTestId('m-feed-item')).toHaveCount(3);

  // S16：開詳情、切到行程再回來，結果集還在
  await page.getByTestId('m-feed-item').first().click();
  await page.goBack();
  await goTab(page, 'trip');
  await goTab(page, 'explore');
  await expect(page.getByTestId('ai-result-pill')).toContainText('3 家');

  // 回 AI（使用者切過分頁，有結果集就還是有）
  await page.getByTestId('ai-back').click();
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await goTab(page, 'explore');

  // ✕：還原
  await chip(page).click();
  await expect(page.getByTestId('ai-result-pill')).toHaveCount(0);
  await expect(page.getByTestId('m-feed-search')).toHaveValue('海');
});

test('跳來跳去按底部的「AI」：同一段對話、捲動位置、打到一半的字和晶片都在，提議和結果集沒被清掉', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  await say(page, S11);
  const conv = () => app<string>(page, 'th.ai.store.getState().currentId');
  const id = await conv();
  await page.evaluate(() => (window as any).__th.ai.ask([{ kind: 'place', id: 'toba-osakaya' }]));
  await page.getByTestId('chat-input').fill('打到一半');

  // 在探索看 → 按 AI
  await page.getByTestId('m-see-explore').click();
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  await goTab(page, 'ai');
  expect(await conv()).toBe(id);
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(2);
  await expect(page.getByTestId('chat-input')).toHaveValue('打到一半');
  await expect(page.getByTestId('chat-context')).toHaveCount(1);
  // 捲動位置：停在剛剛按的那張卡（輪播看得到）
  await expect(page.getByTestId('m-see-explore')).toBeInViewport();

  // 在行程上看 → 按 AI（行程頁有分頁列）
  await page.getByTestId('chat-see-trip').click();
  await expect(bar(page)).toBeVisible();
  await goTab(page, 'ai');
  expect(await conv()).toBe(id);
  await expect(proposalCard(page)).toBeVisible();
  await expect(proposalCard(page).getByTestId('chat-adopt')).toBeInViewport();

  // 在地圖上看 → 關半屏 → 按 AI
  await page.getByTestId('m-see-map').click();
  await expect(sheet(page)).toBeVisible();
  await page.getByTestId('m-chat-sheet-close').click();
  await goTab(page, 'ai');
  expect(await conv()).toBe(id);
  await expect(page.getByTestId('chat-input')).toHaveValue('打到一半');
  expect(await app<boolean>(page, '!!th.appStore.getState().proposal && !!th.appStore.getState().aiResult')).toBe(true);
});

test('問 AI 入口：詳情、探索、想去、行程的一天、一張卡、整趟；只帶晶片和建議問題，不叫鍵盤、不送出', async ({ page }) => {
  await aiReady(page);
  const none = () => expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  const noKeyboard = () => expect(page.getByTestId('chat-input')).not.toBeFocused();
  const clear = async () => {
    const chips = page.locator('.ac-chips [data-testid="chat-context"]');
    while (await chips.count()) await chips.first().getByRole('button').click();
  };

  // 詳情（探索打開的）→ AI 分頁
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-item').first().click();
  await tap(page, 'detail-ask-ai');
  await page.getByTestId('detail-ask-ai').click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('chat-context')).toHaveAttribute('data-kind', 'place');
  await expect(page.getByTestId('chat-suggestion').first()).toBeVisible();
  for (const id of ['chat-suggestion', 'chat-add-place']) await tap(page, id);
  await noKeyboard();
  await none();
  await shot(page, 'ask-detail');
  await clear();

  // 探索的清單
  await goTab(page, 'explore');
  await tap(page, 'list-ask-ai');
  await page.getByTestId('list-ask-ai').click();
  await expect(page.getByTestId('chat-context')).toHaveAttribute('data-kind', 'list');
  await expect(page.getByTestId('chat-suggestion').first()).toContainText('挑 3 家');
  await clear();

  // 想去的清單
  await goTab(page, 'wish');
  await page.getByTestId('list-ask-ai').click();
  await expect(page.getByTestId('chat-suggestion').first()).toContainText('把還沒排的');
  await clear();

  // 行程的一天 → 半屏
  await goTab(page, 'trip');
  await page.getByTestId('m-day-2027-02-05').click();
  await tap(page, 'm-trip-ai');
  await page.getByTestId('m-trip-ai').click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('chat-context')).toHaveAttribute('data-kind', 'day');
  await expect(sheet(page).getByTestId('chat-suggestion').first()).toHaveText('幫我檢查這天');
  await noKeyboard();
  await shot(page, 'ask-day');
  await clear();
  await page.getByTestId('m-chat-sheet-close').click();

  // 行程的一張卡 → 半屏
  const card = page.getByTestId('m-card').nth(1);
  await card.getByTestId('trip-card-name').click();
  await card.getByTestId('trip-card-ask').click();
  await expect(sheet(page).getByTestId('chat-suggestion').first()).toHaveText('這天排它會不會太趕？');
  await clear();

  // 從行程打開的詳情 → 半屏
  await page.getByTestId('m-chat-sheet-close').click();
  const again = page.getByTestId('m-card').nth(1);
  await expect(again.getByTestId('trip-card-detail')).toBeVisible();
  await again.getByTestId('trip-card-detail').click();
  await page.getByTestId('detail-ask-ai').click();
  await expect(page.getByTestId('m-detail')).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await clear();
  await page.getByTestId('m-chat-sheet-close').click();

  // 整趟
  await page.getByTestId('m-day-all').click();
  await page.getByTestId('trip-ask-ai').click();
  await expect(sheet(page).getByTestId('chat-context')).toHaveAttribute('data-kind', 'trip');
  await none();
});

test('S2：點建議問題才送，畫面不動；晶片跟著訊息存', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await page.evaluate(() => (window as any).__th.ai.ask([{ kind: 'place', id: 'toba-osakaya' }]));
  await expect(page.getByTestId('chat-suggestion')).toHaveCount(3);
  await page.getByTestId('chat-suggestion').filter({ hasText: '15 人坐得下嗎？' }).click();
  await idle(page);
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('要分桌');
  await expect(page.getByTestId('chat-msg-me').getByTestId('chat-context')).toContainText('大阪屋');
  await expect(page.getByTestId('chat-suggestion')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await shot(page, 's2-answer');
});

test('帶多個點：加地點面板勾選、搜尋；建議問題換成比較；取消勾選就拿掉；返回鍵關面板', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await page.evaluate(() => (window as any).__th.ai.ask([{ kind: 'place', id: 'toba-osakaya' }]));
  await page.getByTestId('chat-add-place').click();
  const picker = page.getByTestId('m-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId('m-picker-row').first()).toBeVisible();
  await tap(page, 'm-picker-row');
  await tap(page, 'm-picker-done');
  await shot(page, 'picker');
  // 返回鍵關面板
  await page.goBack();
  await expect(picker).toHaveCount(0);

  await page.getByTestId('chat-add-place').click();
  await picker.getByTestId('m-picker-search').fill('いろは');
  await picker.getByTestId('m-picker-row').first().click();
  await picker.getByTestId('m-picker-search').fill(await app<string>(page, "th.dataStore.getState().byId.get('toba-hakkai').name.zh || th.dataStore.getState().byId.get('toba-hakkai').name.ja"));
  await picker.locator('[data-testid="m-picker-row"][data-id="toba-hakkai"]').click();
  await expect(page.getByTestId('m-picker-done')).toHaveText('帶 3 個地點');
  await page.getByTestId('m-picker-done').click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.ac-chips [data-testid="chat-context"]')).toHaveCount(3);
  await expect(page.getByTestId('chat-suggestion').first()).toHaveText('比較這 3 家');
  await shot(page, 'multi-chips');

  // S4：比較，標 A、B、C
  await page.getByTestId('chat-suggestion').first().click();
  await idle(page);
  await expect(page.getByTestId('ai-letter')).toHaveCount(3);
  await shot(page, 's4-letters');

  // 取消勾選：晶片拿掉
  await page.getByTestId('chat-add-place').click();
  await picker.getByTestId('m-picker-search').fill('いろは');
  await picker.getByTestId('m-picker-row').first().click();
  await page.getByTestId('m-picker-done').click();
  await expect(page.locator('.ac-chips [data-testid="chat-context"]')).toHaveCount(2);
});

test('S11 不在編輯中：提議卡不切分頁、資訊類不算警告；在行程上看：差異、虛線、日期虛線框、唯讀；看原本；採用 → 到行程頁、編輯中、復原', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  const before = await itemCount(page, '2027-02-04');
  await say(page, S11);
  // 不切分頁；黃點在行程上
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-tab-dot-proposal')).toBeVisible();
  const card = proposalCard(page);
  await expect(card).toContainText('川梅');
  await expect(card.getByTestId('chat-proposal-warn')).toHaveCount(0);
  for (const id of ['chat-adopt', 'chat-reject', 'chat-see-trip']) await tap(page, id);
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  await shot(page, 's11-card');

  // 在行程上看
  await page.getByTestId('chat-see-trip').click();
  await expect(page.getByTestId('m-tab-trip')).toHaveAttribute('aria-current', 'page');
  await expect(sheet(page)).toHaveCount(0);
  await expect(bar(page)).toContainText('川梅');
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await expect(page.getByTestId('m-card-handle')).toHaveCount(0);
  await expect(page.locator('[data-day="2027-02-04"]')).toHaveClass(/proposed/);
  await expect(page.getByTestId('ai-back')).toBeVisible();
  await expect.poll(() => app<number>(page, "th.map.getSource('overlay-proposal-lines').serialize().data.features.length")).toBeGreaterThan(0);
  for (const id of ['proposal-adopt', 'proposal-reject', 'proposal-toggle']) await tap(page, id);
  await shot(page, 's11-diff');

  // 面板拉到最低也露出提議列
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('low'));
  await expect(page.getByTestId('proposal-adopt')).toBeInViewport();
  const adoptBox = (await page.getByTestId('proposal-adopt').boundingBox())!;
  const tabBox = (await page.getByTestId('m-tabbar').boundingBox())!;
  expect(adoptBox.y + adoptBox.height).toBeLessThanOrEqual(tabBox.y);
  await shot(page, 's11-low');
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('mid'));

  // 看原本：真的時間軸、虛線收起來；看提議回來
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(0);
  await expect(page.getByTestId('proposal-toggle')).toHaveText('看提議');
  await expect.poll(() => app<number>(page, "th.map.getSource('overlay-proposal-lines').serialize().data.features.length")).toBe(0);
  await shot(page, 's11-original');
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);

  // 回 AI：半屏，上面的地圖還在；卡片上也有採用
  await page.getByTestId('ai-back').click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('chat-adopt')).toBeVisible();
  await shot(page, 's11-sheet');
  await page.getByTestId('m-chat-sheet-close').click();

  // 採用
  await goTab(page, 'ai');
  await page.getByTestId('chat-adopt').click();
  await expect(page.getByTestId('planning-note')).toContainText('川梅');
  await shot(page, 's11-confirm');
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('toast')).toContainText('已採用提議');
  await expect(page.getByTestId('m-trip')).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  expect(await itemCount(page, '2027-02-04')).toBe(before + 1);
  expect(await app<string>(page, 'th.appStore.getState().day')).toBe('2027-02-04');
  await shot(page, 's11-adopted');

  // 復原
  await page.getByTestId('toast').getByRole('button', { name: '復原' }).click();
  await expect.poll(() => itemCount(page, '2027-02-04')).toBe(before);
  await page.getByTestId('ai-back').click();
  await expect(page.locator('[data-testid="chat-proposal"][data-status="undone"]')).toBeVisible();
});

test('S11 不要、取消：行程沒變；取消後提議還在；不要了可以再打開；關半屏、換分頁不清提議', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  const before = await itemCount(page, '2027-02-04');
  await say(page, S11);
  // 換分頁：提議還在
  await goTab(page, 'explore');
  await goTab(page, 'trip');
  await expect(bar(page)).toBeVisible();
  await goTab(page, 'ai');

  await page.getByTestId('chat-adopt').click();
  await page.getByTestId('planning-dialog').getByRole('button', { name: '取消' }).click();
  await expect(proposalCard(page)).toBeVisible();
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  expect(await app<boolean>(page, 'th.appStore.getState().planning')).toBe(false);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');

  await page.getByTestId('chat-reject').click();
  await expect(page.locator('[data-testid="chat-proposal"][data-status="rejected"]')).toContainText('不要了');
  expect(await app<unknown>(page, 'th.appStore.getState().proposal')).toBeNull();
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  await page.getByTestId('chat-see-version').click();
  await expect(proposalCard(page).getByTestId('chat-adopt')).toBeVisible();

  // 提議列的「不要」
  await page.getByTestId('chat-see-trip').click();
  await page.getByTestId('proposal-reject').click();
  await expect(bar(page)).toHaveCount(0);
});

test('看提議時沒有「編輯」；看原本才能編輯，真的時間軸可以改；看提議又是唯讀', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S11);
  await page.getByTestId('chat-see-trip').click();
  await expect(page.getByTestId('m-trip-edit')).toHaveCount(0);
  await page.getByTestId('proposal-toggle').click();
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(0);
  await expect(page.getByTestId('m-card-handle').first()).toBeVisible();
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await expect(page.getByTestId('m-card-handle')).toHaveCount(0);
});

test('S12 提議過期：別人刪掉要換的那項 → 卡片過期，提議列不見、有提示；只改別項 → 差異重算', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, '2/5 午餐換成大阪屋');
  // 這份提議真的有新警告（坐不下、打烊）
  await expect(proposalCard(page).getByTestId('chat-proposal-warn')).toHaveCount(2);
  await expect(proposalCard(page)).toContainText('要分桌或分批');
  await page.getByTestId('chat-see-trip').click();
  await expect(bar(page)).toContainText('→ 大阪屋');
  await expect(page.getByTestId('tl-ghost')).toHaveCount(1);
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await shot(page, 's12-diff');

  await page.evaluate(async () => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => ({ ...it, days: it.days.map((d: any) => ({ ...d, items: d.items.map((i: any) => (i.id === 'i-8' ? { ...i, note: '別人改的' } : i)) })) }), '別人改');
  });
  await expect(bar(page)).toBeVisible();

  // 同步進來別人的版本（不是自己存檔，不會跳別的提示）
  await page.evaluate(() => {
    const th = (window as any).__th;
    const it = th.dataStore.getState().itinerary;
    th.dataStore.setState({ itinerary: { ...it, days: it.days.map((d: any) => ({ ...d, items: d.items.filter((i: any) => i.id !== 'i-7') })) } });
  });
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('過期');
  await goTab(page, 'ai');
  const card = page.getByTestId('chat-proposal');
  await expect(card).toHaveAttribute('data-status', 'stale');
  await expect(card).toContainText('過期了');
  await expect(page.getByTestId('chat-repropose')).toBeVisible();
  await shot(page, 's12-stale');
  await page.getByTestId('chat-stale-reject').click();
  await expect(card).toHaveAttribute('data-status', 'rejected');
});

test('S15 不搶畫面：回覆中切走 → 不呈現，AI 上有紅點；輪播照樣有內容，在地圖上看才呈現', async ({ page }) => {
  await aiReady(page, 200);
  await goTab(page, 'ai');
  await page.getByTestId('chat-input').fill(S1);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toBeVisible();
  await goTab(page, 'explore');
  await idle(page);
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  expect(await app<unknown>(page, 'th.appStore.getState().aiResult')).toBeNull();
  await expect(page.getByTestId('m-tab-dot-unread')).toBeVisible();
  await shot(page, 's15-dot');
  await goTab(page, 'ai');
  await expect(page.getByTestId('m-tab-dot-unread')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);
  await page.getByTestId('m-see-map').click();
  await expect(page.getByTestId('ai-result-pill')).toBeVisible();
});

test('S17 再看一次：在地圖上看把結果集叫回來，路線照舊', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  await say(page, '從水族館走到珍珠島多久？');
  await page.locator('[data-testid="chat-present"][data-tool="show_route"]').getByTestId('m-see-map').click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId('marks-bar')).toContainText('路線 1 條');
  await chip(page).click();
  await expect(chip(page)).toHaveCount(0);
  await page.locator('[data-testid="chat-present"][data-tool="show_places"]').getByTestId('m-see-map').click();
  await expect(chip(page)).toBeVisible();
  expect(await app<number>(page, 'th.appStore.getState().routes.length')).toBe(1);
  await shot(page, 's17');
});

test('S18 狀態：思考中、停止鈕；出錯可以重試；超過每天上限輸入框停用', async ({ page }) => {
  await aiReady(page, 400);
  await fake(page, { streamMs: 400 });
  await goTab(page, 'ai');
  await page.getByTestId('chat-input').fill('從水族館走到珍珠島多久？');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toHaveAttribute('data-status', /thinking|tools/);
  await tap(page, 'chat-stop');
  await shot(page, 's18-thinking');
  await expect(page.getByTestId('chat-busy')).toHaveAttribute('data-status', 'streaming', { timeout: 20_000 });
  await idle(page);
  await fake(page, { delayMs: 0, next: 'error' });
  await say(page, S1);
  await expect(page.getByTestId('chat-error')).toContainText('連不上 AI');
  await shot(page, 's18-error');
  await page.getByTestId('chat-retry').click();
  await idle(page);
  await expect(page.getByTestId('chat-error')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);
  await fake(page, { next: 'quota' });
  await say(page, S11);
  await expect(page.getByTestId('chat-quota')).toContainText('上限');
  await expect(page.getByTestId('chat-input')).toBeDisabled();
  await shot(page, 's18-quota');
});

test('dev 選單切假 AI：手機的「我」分頁也有', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  await expect(page.getByTestId('dev-ai')).toBeVisible();
  await page.getByTestId('dev-ai-next-error').click();
  expect(await app<string>(page, 'th.aiFake.next')).toBe('error');
});

test('S34 停止：已進來的字留著、標沒有回完、不呈現；重試回得完', async ({ page }) => {
  await aiReady(page, 60);
  await fake(page, { streamMs: 400 });
  await goTab(page, 'ai');
  await page.getByTestId('chat-input').fill(S1);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toHaveAttribute('data-status', 'streaming', { timeout: 20_000 });
  await page.getByTestId('chat-stop').click();
  await expect(page.getByTestId('chat-incomplete')).toBeVisible();
  expect(await app<unknown>(page, 'th.appStore.getState().aiResult')).toBeNull();
  await shot(page, 's34-stopped');
  await fake(page, { delayMs: 0 });
  await page.getByTestId('chat-retry').click();
  await idle(page);
  await expect(page.getByTestId('chat-incomplete')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);
});

test('S20 新對話和清單：新的在上面；清單裡可以開新對話；舊對話可以接著問；返回鍵關清單', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  await page.getByTestId('chat-new').click();
  await expect(page.getByTestId('chat-empty')).toBeVisible();
  await say(page, '從水族館走到珍珠島多久？');
  await page.getByTestId('chat-list-toggle').click();
  const rows = page.getByTestId('chat-conversation');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('從水族館');
  await expect(rows.nth(1)).toContainText('鳥羽能坐');
  await expect(page.getByTestId('chat-input')).toBeHidden();
  await expect(page.getByTestId('chat-list-new')).toBeVisible();
  await tap(page, 'chat-conversation');
  await shot(page, 's20-list');
  await page.goBack();
  await expect(page.getByTestId('chat-conversations')).toHaveCount(0);
  await page.getByTestId('chat-list-toggle').click();
  await rows.nth(1).click();
  await expect(page.getByTestId('chat-conversations')).toHaveCount(0);
  await expect(page.getByTestId('chat-msg-me')).toContainText(S1);
  await say(page, '再多找幾家');
  await expect(cards(page)).toHaveCount(8);
  await page.getByTestId('chat-list-toggle').click();
  await page.getByTestId('chat-list-new').click();
  await expect(page.getByTestId('chat-empty')).toBeVisible();
});

test('S21 多個使用者：看到自己的對話，切回來原本的還在', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  const me = await app<string>(page, 'th.shared.store.getState().me.id');
  const other = await app<string>(page, `th.shared.store.getState().members.find((m) => m.id !== '${me}').id`);
  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  await page.locator(`[data-member="${other}"]`).click();
  await goTab(page, 'ai');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await goTab(page, 'me');
  await page.getByTestId('me-button').click();
  await page.locator(`[data-member="${me}"]`).click();
  await goTab(page, 'ai');
  await expect(page.getByTestId('chat-msg-me')).toContainText(S1);
});

test('S22 對話滿了：快滿有提示；滿了只留開新對話；舊訊息和在地圖上看照常；按問 AI 自動開新對話', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await fake(page, { usage: 'near' });
  await say(page, S1);
  await expect(page.getByTestId('chat-near-full')).toContainText('快滿了');
  await tap(page, 'chat-near-new');
  await shot(page, 's22-near');
  await fake(page, { usage: 'full' });
  await say(page, '再多找幾家');
  await expect(page.getByTestId('chat-full')).toBeVisible();
  await expect(page.getByTestId('chat-input')).toHaveCount(0);
  await tap(page, 'chat-full-new');
  await shot(page, 's22-full');
  await page.getByTestId('m-see-map').first().click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId('ai-result-pill')).toBeVisible();
  await page.getByTestId('m-chat-sheet-close').click();

  await fake(page, { usage: 'ok' });
  await goTab(page, 'explore');
  await page.getByTestId('m-feed-item').first().click();
  await page.getByTestId('detail-ask-ai').click();
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await expect(page.getByTestId('chat-context')).toHaveCount(1);
});

test('S23 重新整理：對話還在；沒有結果集、提議；在行程上看用最新的行程重新檢查，才有採用', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  await say(page, S11);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake && (window as any).__th.dataStore.getState().status === 'ready');
  await goTab(page, 'ai');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(2);
  expect(await app<unknown>(page, 'th.appStore.getState().proposal')).toBeNull();
  expect(await app<unknown>(page, 'th.appStore.getState().aiResult')).toBeNull();
  await expect(proposalCard(page).getByTestId('chat-adopt')).toHaveCount(0);
  await expect(proposalCard(page).getByTestId('chat-see-trip')).toBeVisible();
  await shot(page, 's23-reloaded');
  await proposalCard(page).getByTestId('chat-see-trip').click();
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId('proposal-adopt')).toBeVisible();
});

test('S24 回覆中關閉：標沒有回完，有重試；重試後紀錄裡沒有留下沒結果的工具呼叫', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await fake(page, { next: 'hang' });
  await page.getByTestId('chat-input').fill(S11);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake && (window as any).__th.dataStore.getState().status === 'ready');
  await goTab(page, 'ai');
  await expect(page.getByTestId('chat-incomplete')).toBeVisible();
  await shot(page, 's24-incomplete');
  await fake(page, { delayMs: 0 });
  await page.getByTestId('chat-retry').click();
  await idle(page);
  await expect(page.getByTestId('chat-incomplete')).toHaveCount(0);
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(1);
  const ok = await page.evaluate(() => {
    const msgs = (window as any).__th.ai.store.getState().messages.flatMap((m: any) => m.content);
    const uses = msgs.filter((b: any) => b.type === 'tool_use').map((b: any) => b.id);
    const results = msgs.filter((b: any) => b.type === 'tool_result').map((b: any) => b.tool_use_id);
    return JSON.stringify(uses) === JSON.stringify(results);
  });
  expect(ok).toBe(true);
});

test('S25～S27 邊聊邊改、回到上一版、用說的採用（半屏）：舊版一行可以回去；開始編輯？按了才寫；寫完到行程頁', async ({ page }) => {
  await aiReady(page);
  const before = await itemCount(page, '2027-02-04');
  await page.getByTestId('m-day-2027-02-04').click();
  await page.getByTestId('m-trip-ai').click();
  await say(page, S11);
  // 地圖馬上畫虛線，半屏還開著
  await expect(sheet(page)).toBeVisible();
  await expect.poll(() => app<number>(page, "th.map.getSource('overlay-proposal-lines').serialize().data.features.length")).toBeGreaterThan(0);
  await say(page, '再加珍珠島，排在午餐後面');
  await say(page, '把珍珠島移到午餐前面');
  await expect(page.locator('[data-testid="chat-proposal"][data-status="superseded"]')).toHaveCount(2);
  await expect(proposalCard(page)).toContainText('第 3 版');
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  await shot(page, 's25-versions');

  await page.locator('[data-testid="chat-proposal"][data-status="superseded"]').first().getByTestId('chat-see-version').click();
  await expect(proposalCard(page)).toContainText('第 1 版');
  await say(page, '剛剛那版比較好');
  await say(page, '把珍珠島移到午餐前面然後採用');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('還沒看過');
  expect(await itemCount(page, '2027-02-04')).toBe(before);

  await page.getByTestId('chat-input').fill('採用');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('planning-dialog')).toBeVisible();
  await page.getByTestId('planning-dialog').getByRole('button', { name: '取消' }).click();
  await idle(page);
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('先不改');
  expect(await itemCount(page, '2027-02-04')).toBe(before);

  await page.getByTestId('chat-input').fill('採用');
  await page.getByTestId('chat-input').press('Enter');
  await page.getByTestId('planning-confirm').click();
  await expect.poll(() => itemCount(page, '2027-02-04')).toBe(before + 2);
  await idle(page);
  // 收起聊天看結果；回 AI 看得到 AI 的回覆和沒用上的版本
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('planning-bar')).toBeVisible();
  await shot(page, 's27-adopted');
  await page.getByTestId('ai-back').click();
  await expect(page.locator('[data-testid="chat-proposal"][data-status="closed"]').first()).toContainText('沒有用上');
});

test('S28～S33 累加、一次多個、預約、切畫面、留言草稿；show_screen 的討論開彈窗，返回鍵回聊天', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  await say(page, '再多找幾家');
  await expect(cards(page).last()).toBeVisible();
  await say(page, '拿掉第二家');
  expect(await app<number>(page, 'th.appStore.getState().aiResult.ids.length')).toBe(4);
  await say(page, '這幾家都按想去');
  await expect(page.getByTestId('chat-vote')).toContainText('4 家');
  await page.getByTestId('chat-vote-undo').click();
  await expect(page.getByTestId('chat-vote')).toContainText('已復原');
  await say(page, '都加到 2/5 候選');
  await expect(page.getByTestId('chat-candidate')).toContainText('2/5');
  await tap(page, 'chat-candidate-confirm');
  await shot(page, 's29-candidate');
  await page.getByTestId('chat-candidate-confirm').click();
  await expect(page.getByTestId('chat-card-done').last()).toBeVisible();

  await say(page, '哪幾家還沒訂？');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('沒訂');
  await say(page, '給我看討論');
  await expect(page.getByTestId('discussion')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('discussion')).toHaveCount(0);
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');

  await say(page, '幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯');
  await expect(page.getByTestId('chat-draft')).toBeVisible();
  await tap(page, 'chat-draft-confirm');
  await shot(page, 's6-draft');
  await say(page, '送出吧');
  await expect(page.getByTestId('chat-draft')).toHaveCount(0);
  await expect(page.getByTestId('chat-card-done').last()).toContainText('已送出');

  // show_screen：切到想去；這時回不回 AI 都有分頁列
  await say(page, '打開想去');
  await expect(page.getByTestId('m-tab-wish')).toHaveAttribute('aria-current', 'page');
});

test('S30 指稱：半屏開著時點開的卡；S33 編輯中切分頁還有分頁列回得來', async ({ page }) => {
  await aiReady(page);
  await page.getByTestId('m-day-2027-02-05').click();
  const card = page.locator('[data-testid="m-card"][data-place="toba-aquarium"]').first();
  await card.getByTestId('trip-card-name').click();
  await page.getByTestId('m-trip-ai').click();
  await expect(sheet(page).getByTestId('chat-screen-hint')).toHaveCount(0);
  // 按 ✕ 拿掉這天的晶片：回到正在看，是點開的卡
  await sheet(page).locator('.ac-chips [data-testid="chat-context"]').getByRole('button').click();
  await expect(sheet(page).getByTestId('chat-screen-hint')).toContainText('水族館');
  await say(page, '這家 15 人坐得下嗎？');
  await expect(page.getByTestId('chat-msg-ai').last()).not.toContainText('哪一家');

  // ✕ 正在看，拿得回來
  await sheet(page).getByTestId('chat-screen-hint').getByRole('button').click();
  await expect(sheet(page).getByTestId('chat-screen-hint')).toHaveCount(0);
  await sheet(page).getByTestId('chat-screen-restore').click();
  await expect(sheet(page).getByTestId('chat-screen-hint')).toBeVisible();
  await page.getByTestId('m-chat-sheet-close').click();

  // 編輯中
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
  await page.getByTestId('m-trip-ai').click();
  await expect(sheet(page)).toBeVisible();
  await shot(page, 'edit-sheet');
  await say(page, '打開想去');
  await expect(page.getByTestId('m-tab-wish')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('m-tabbar')).toBeVisible();
  await page.getByTestId('m-tab-trip').click();
  await expect(page.getByTestId('m-tabbar')).toHaveCount(0);
  await expect(page.getByTestId('planning-bar')).toBeVisible();
});

test('半屏：高度、上面看得到地圖；⤢ 拉滿不切分頁，把手往下收回；編輯中詳情也有問 AI', async ({ page }) => {
  await aiReady(page);
  await page.getByTestId('m-day-2027-02-05').click();
  await page.getByTestId('m-trip-ai').click();
  const vh = page.viewportSize()!.height;
  const box = (await sheet(page).boundingBox())!;
  expect(Math.abs(box.height / vh - 0.55)).toBeLessThan(0.03);
  expect(Math.round(box.y + box.height)).toBe(vh);
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.m-map'), [20, box.y / 2])).toBe(true);
  for (const id of ['m-chat-sheet-expand', 'm-chat-sheet-close', 'chat-list-toggle']) await tap(page, id);

  await page.getByTestId('m-chat-sheet-expand').click();
  await expect(page.getByTestId('m-tab-trip')).toHaveCount(1);
  expect(await app<string>(page, 'm.getState().tab')).toBe('trip');
  await expect.poll(async () => Math.round((await sheet(page).boundingBox())!.height)).toBe(vh);
  // 把手往下：收回半屏
  const g = (await page.getByTestId('m-chat-sheet-grab').boundingBox())!;
  await page.mouse.move(g.x + 30, g.y + 6);
  await page.mouse.down();
  await page.mouse.move(g.x + 30, g.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await sheet(page).boundingBox())!.height / vh - 0.55)).toBeLessThan(0.03);
  await page.getByTestId('m-chat-sheet-close').click();

  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  const card = page.getByTestId('m-card').nth(1);
  await card.getByTestId('trip-card-name').click();
  await card.getByTestId('trip-card-detail').click();
  await page.getByTestId('detail-ask-ai').click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('chat-context').first()).toBeVisible();
});

test('返回鍵：半屏 → 關掉；從 AI 分頁跳到探索、行程 → 回聊天', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'ai');
  await say(page, S1);
  await page.getByTestId('m-see-explore').click();
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.getByTestId('m-tab-ai')).toHaveAttribute('aria-current', 'page');
  await say(page, S11);
  await page.getByTestId('chat-see-trip').click();
  await expect(bar(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  // 網站還在
  await expect(page.getByTestId('m-trip')).toBeVisible();
});

test('set_filter 接到探索的 feed：看探索就是那些條件；探索、想去問完回來捲動位置還在', async ({ page }) => {
  await aiReady(page);
  await goTab(page, 'explore');
  const main = page.locator('.m-page');
  await main.evaluate((el) => (el.scrollTop = 1500));
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000);
  const top = await main.evaluate((el) => el.scrollTop);
  await goTab(page, 'ai');
  await goTab(page, 'explore');
  // 上面的照片載好時瀏覽器會微調捲動位置（內容不跳，T32），所以差一點沒關係；重點是沒有回到最上面
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(top - 200);
  expect(await main.evaluate((el) => el.scrollTop)).toBeLessThan(top + 200);

  await goTab(page, 'ai');
  await say(page, '只看鳥羽的餐廳');
  const feed = await app<{ type: string; area: string | null }>(page, 'm.getState().feed');
  expect(feed.type).toBe('restaurant');
  expect(feed.area).toBe('toba');
  await page.locator('[data-testid="chat-present"][data-tool="set_filter"]').getByTestId('m-see-map').click();
  await expect(page.getByTestId('m-tab-explore')).toHaveAttribute('aria-current', 'page');
  // 條件看篩選按鈕的數字，點開面板看（T33 取代晶片）；類型在類型列
  await expect(page.getByTestId('filter-count')).toHaveText('1');
  await expect(page.getByTestId('m-feed-type-restaurant')).toHaveAttribute('aria-pressed', 'true');
  await expectFilterOpt(page, 'area-toba', true);
  await expect(page.getByTestId('ai-back')).toBeVisible();
});

/** 模擬 iOS 的鍵盤：版面不變，visualViewport 變矮；要在網頁載入前換掉 */
async function fakeIosKeyboard(page: Page) {
  await page.addInitScript(() => {
    const real = window.visualViewport!;
    const listeners: Record<string, Set<() => void>> = { resize: new Set(), scroll: new Set() };
    let cut = 0;
    const fake = {
      get height() {
        return real.height - cut;
      },
      get width() {
        return real.width;
      },
      get offsetTop() {
        return 0;
      },
      addEventListener: (t: string, f: () => void) => listeners[t]?.add(f),
      removeEventListener: (t: string, f: () => void) => listeners[t]?.delete(f),
    };
    Object.defineProperty(window, 'visualViewport', { value: fake });
    (window as any).__setKeyboard = (h: number) => {
      cut = h;
      listeners.resize.forEach((f) => f());
    };
  });
}

const keyboardTop = async (page: Page, h: number) => page.viewportSize()!.height - h;
const setKeyboard = (page: Page, h: number) => page.evaluate((x) => (window as any).__setKeyboard(x), h);

test.describe('鍵盤（§16.3）', () => {
  const KB = 300;

  /** 聚焦 → 鍵盤出來 → 輸入框和按鈕都在鍵盤上面 */
  async function check(page: Page, input: string, buttons: string[], name: string) {
    await page.getByTestId(input).first().focus();
    await setKeyboard(page, KB);
    await expect(page.locator('html')).toHaveAttribute('data-keyboard', '');
    const top = await keyboardTop(page, KB);
    await expect.poll(async () => {
      const b = (await page.getByTestId(input).first().boundingBox())!;
      return b.y >= 0 && b.y + b.height <= top;
    }, { message: `${name}：輸入框在鍵盤上面` }).toBe(true);
    for (const id of buttons) {
      const b = (await page.getByTestId(id).first().boundingBox())!;
      expect(b.y + b.height, `${name}：${id} 在鍵盤上面`).toBeLessThanOrEqual(top);
    }
    await expect(page.getByTestId('m-tabbar')).toBeHidden();
    await shot(page, `kb-${name}`);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await setKeyboard(page, 0);
    await expect(page.locator('html')).not.toHaveAttribute('data-keyboard', '');
  }

  test.beforeEach(async ({ page }) => {
    await fakeIosKeyboard(page);
    await aiReady(page);
  });

  test('AI 分頁、半屏：輸入框貼在鍵盤上面；建議問題收起來', async ({ page }) => {
    await goTab(page, 'ai');
    await say(page, S1);
    await page.evaluate(() => (window as any).__th.ai.ask([{ kind: 'place', id: 'toba-osakaya' }]));
    await expect(page.getByTestId('chat-suggestion').first()).toBeVisible();
    await page.getByTestId('chat-input').focus();
    await setKeyboard(page, KB);
    await expect(page.getByTestId('chat-suggestion').first()).toBeHidden();
    await expect(page.getByTestId('chat-messages')).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await setKeyboard(page, 0);
    await check(page, 'chat-input', ['chat-send'], 'ai-tab');

    await goTab(page, 'trip');
    await page.getByTestId('m-day-2027-02-05').click();
    await page.getByTestId('m-trip-ai').click();
    await expect(sheet(page)).toBeVisible();
    await check(page, 'chat-input', ['chat-send'], 'sheet');
    const m = (await page.getByTestId('chat-messages').boundingBox())!;
    expect(m.height).toBeGreaterThan(100);
  });

  test('留言、討論、預約：輸入框看得到', async ({ page }) => {
    await goTab(page, 'explore');
    await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-osakaya', 'explore', 'comments'));
    await check(page, 'comment-input', [], 'detail-comment');
    await page.goBack();
    await goTab(page, 'trip');
    await page.getByTestId('discuss-button').click();
    await check(page, 'discuss-input', ['discuss-send'], 'talk');
    await page.getByTestId('discuss-close').click();
    await goTab(page, 'me');
    await page.getByTestId('m-me-reservations').click();
    await page.getByTestId('note-text').last().scrollIntoViewIfNeeded();
    await check(page, 'note-text', [], 'reserve');
    expect(await page.getByTestId('note-text').first().evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px');
  });

  test('加地點：名稱、備註和按鈕都按得到', async ({ page }) => {
    await page.evaluate(() => import('/src/addPlaceStore.ts' as string).then((m) => m.addPlaceStore.getState().start({ via: 'ai', name: '', coords: [136.84, 34.48] })));
    await check(page, 'add-note', [], 'add-place');
  });

  test('編輯中的交通備註、拿掉候選的理由：完成、確認都在鍵盤上面；字 16px', async ({ page }) => {
    await page.getByTestId('m-day-2027-02-05').click();
    await page.getByTestId('m-trip-edit').click();
    await page.getByTestId('planning-confirm').click();
    const key = await page.getByTestId('m-leg').first().getAttribute('data-leg');
    await page.evaluate((k) => import('/src/uiStore.ts' as string).then((m) => m.uiStore.setState({ legOpen: k, legEdit: k })), key);
    await page.getByTestId('leg-note').focus();
    await setKeyboard(page, KB);
    const top = await keyboardTop(page, KB);
    await expect.poll(async () => (await page.getByTestId('leg-done').boundingBox())!.y + 44 <= top).toBe(true);
    expect(await page.getByTestId('leg-note').evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px');
    await shot(page, 'kb-leg');
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await setKeyboard(page, 0);
    await page.getByTestId('leg-done').click();

    await page.evaluate(() => Promise.all([import('/src/uiStore.ts' as string), import('/src/appShared.ts' as string)]).then(([u, s]) => u.openDialog({ kind: 'reject', candidateId: s.sharedStore.getState().candidates[0].id })));
    await page.getByTestId('reject-text').focus();
    await setKeyboard(page, KB);
    const confirm = page.getByTestId('reject-dialog').getByRole('button').last();
    await expect.poll(async () => (await confirm.boundingBox())!.y + 30 <= top).toBe(true);
    const w = (await page.getByTestId('reject-text').boundingBox())!.width;
    expect(w).toBeGreaterThan(250);
    await shot(page, 'kb-reject');
  });

  test('版面自己變矮的瀏覽器（部分 Android）：輸入框捲得到，分頁列藏起來', async ({ page }) => {
    const size = page.viewportSize()!;
    await goTab(page, 'explore');
    await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-osakaya', 'explore', 'comments'));
    await page.getByTestId('comment-input').focus();
    await page.setViewportSize({ width: size.width, height: size.height - KB });
    await expect.poll(async () => {
      const b = (await page.getByTestId('comment-input').boundingBox())!;
      return b.y + b.height <= size.height - KB;
    }).toBe(true);
    await page.setViewportSize(size);
  });
});
