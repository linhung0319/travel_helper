// T16m-b：AI 網頁版的畫面（規格 §8 的腳本）。假 AI、假後端；截圖放 data/cache/work/t16m/。
import { test, expect, type Page } from '@playwright/test';
import { ready, switchUser, exploreAll } from './helpers.ts';

const SHOTS = '../data/cache/work/t16m';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

async function aiReady(page: Page, delayMs = 0) {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake);
  await fake(page, { delayMs });
}

const fake = (page: Page, s: Record<string, unknown>) => page.evaluate((x) => Object.assign((window as any).__th.aiFake, x), s);
const idle = (page: Page) => expect.poll(() => page.evaluate(() => (window as any).__th.ai.store.getState().status)).toBe('idle');

async function say(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-input').press('Enter');
  await idle(page);
}

const app = <T,>(page: Page, fn: string) => page.evaluate((f) => new Function('th', `return ${f}`)((window as any).__th), fn) as Promise<T>;
const items = (page: Page) => page.getByTestId('explore-item');
const chip = (page: Page) => page.getByTestId('ai-result-chip');
const bar = (page: Page) => page.getByTestId('proposal-bar');
const itemCount = (page: Page, date: string) => app<number>(page, `th.dataStore.getState().itinerary.days.find((d) => d.date === '${date}').items.length`);
const S1 = '鳥羽能坐 15 人的海鮮餐廳';
const S11 = '幫我排第 3 天，加午餐';

test('S1 找地點：右欄只列 AI 挑的、每張有理由；手動按想去、再篩選取交集；✕ 回到原本的清單', async ({ page }) => {
  await aiReady(page);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('search').fill('海');
  await say(page, S1);
  await expect(chip(page)).toContainText('AI 挑的 · 3 家');
  await expect(page.getByTestId('ai-result-title')).toHaveText('鳥羽能坐 15 人的海鮮');
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByTestId('ai-note')).toHaveCount(3);
  await expect(page.getByTestId('search')).toHaveValue('');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('符合的有 7 家');
  await expect(page.getByTestId('chat-place-tag')).toHaveCount(3);
  await expect(page.getByTestId('chat-quick')).toHaveCount(2);
  await shot(page, 's1');

  // 照 AI 的順序
  const ids = await app<string[]>(page, 'th.appStore.getState().aiResult.ids');
  expect(await items(page).evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-rank')), e.getAttribute('data-id')]).sort((a: any, b: any) => a[0] - b[0]).map((x) => x[1]))).toEqual(ids);

  // 手動：按想去
  // T82 起愛心按一下是切換；種子資料裡「我」本來就按過第一家（seed.ts），所以看按完和按之前相反
  const liked0 = await app<number>(page, `th.shared.store.getState().votes.filter((v) => v.placeId === '${ids[0]}' && v.memberId === th.shared.store.getState().me.id).length`);
  await items(page).first().getByTestId('card-like').click();
  await expect.poll(() => app<number>(page, `th.shared.store.getState().votes.filter((v) => v.placeId === '${ids[0]}' && v.memberId === th.shared.store.getState().me.id).length`)).toBe(1 - liked0);
  // 再搜尋：取交集
  await page.getByTestId('search').fill('いろは');
  await expect(chip(page)).toContainText('AI 挑的 3 家中的 1 家');
  await expect(items(page)).toHaveCount(1);
  await shot(page, 's1-intersect');
  await page.getByTestId('search').fill('沒有這個名字');
  await expect(page.getByTestId('ai-result-empty')).toBeVisible();
  await page.getByTestId('ai-result-unfilter').click();
  await expect(items(page)).toHaveCount(3);

  // 工具狀態可以展開
  await page.getByTestId('chat-tools').click();
  await expect(page.getByTestId('chat-tools-list').locator('li')).toHaveCount(2);

  // ✕：還原收起來的搜尋
  await chip(page).click();
  await expect(chip(page)).toHaveCount(0);
  await expect(page.getByTestId('search')).toHaveValue('海');
});

test('S2 問單點：按詳情的問 AI 只帶晶片和建議問題，不送出；點了才送；畫面不動', async ({ page }) => {
  await aiReady(page);
  await page.evaluate(() => (window as any).__th.appStore.getState().openDetail('toba-osakaya', 'explore', undefined, 'map'));
  await page.getByTestId('detail-ask-ai').click();
  await expect(page.getByTestId('chat-context')).toContainText('大阪屋');
  await expect(page.getByTestId('chat-suggestion')).toHaveCount(3);
  await expect(page.getByTestId('chat-input')).toBeFocused();
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await shot(page, 's2-ask');

  await page.getByTestId('chat-suggestion').filter({ hasText: '15 人坐得下嗎？' }).click();
  await idle(page);
  await expect(page.getByTestId('chat-msg-me')).toContainText('15 人坐得下嗎？');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('要分桌');
  // 晶片跟著訊息存，輸入框上面的也留著；詳情還開著
  await expect(page.getByTestId('chat-msg-me').getByTestId('chat-context')).toContainText('大阪屋');
  await expect(page.getByTestId('chat-context').last()).toBeVisible();
  await expect(page.getByTestId('detail-float')).toBeVisible();
  await shot(page, 's2-answer');
});

test('問 AI 入口：清單、詳情、行程的卡、一天、整趟；都不送出；拖到聊天欄也一樣', async ({ page }) => {
  await aiReady(page);
  const chips = page.locator('.ac-chips [data-testid="chat-context"]');
  const none = () => expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await page.getByTestId('side-tab-explore').click();

  // T75 起清單的問 AI 圓鈕只在概覽的工具列（§35.8；選了一區在區頁的底下）
  await page.getByTestId('list-ask-ai').click();
  await expect(chips.last()).toHaveAttribute('data-kind', 'list');
  await expect(page.getByTestId('chat-suggestion').first()).toContainText('挑 3 家');
  await chips.last().getByRole('button').click();
  await exploreAll(page);

  // T83：點列開詳情，「問 AI」在詳情裡
  await items(page).first().click();
  await page.getByTestId('detail-ask-ai').click();
  await expect(chips.last()).toHaveAttribute('data-kind', 'place');
  await chips.last().getByRole('button').click();

  // （T76 起想去的工具列只有搜尋、篩選，沒有問 AI 圓鈕（§35.8），那段拿掉）

  await page.getByTestId('side-tab-day').click();
  await page.locator('[data-day="2027-02-05"]').first().click();
  await page.getByTestId('day-ask-ai').click();
  await expect(chips.last()).toHaveAttribute('data-kind', 'day');
  await expect(page.getByTestId('chat-suggestion').first()).toHaveText('幫我檢查這天');
  await chips.last().getByRole('button').click();

  const card = page.getByTestId('tl-row').first();
  await card.getByTestId('trip-card').click();
  await card.getByTestId('trip-card-ask').click();
  await expect(page.getByTestId('chat-suggestion').first()).toHaveText('這天排它會不會太趕？');
  await chips.last().getByRole('button').click();

  await page.getByTestId('m-day-all').click();
  await page.getByTestId('trip-ask-ai').click();
  await expect(chips.last()).toHaveAttribute('data-kind', 'trip');
  await chips.last().getByRole('button').click();

  // 沒有晶片：灰色的正在看，可以 ✕
  await expect(page.getByTestId('chat-screen-hint')).toContainText('正在看：整趟');
  await page.getByTestId('chat-screen-hint').getByRole('button').click();
  await expect(page.getByTestId('chat-screen-hint')).toHaveCount(0);

  // 拖到聊天欄：累加地點晶片
  await page.getByTestId('side-tab-explore').click();
  await items(page).nth(0).dragTo(page.locator('.chat-column'));
  await items(page).nth(1).dragTo(page.locator('.chat-column'));
  await expect(chips).toHaveCount(2);
  await none();
  await shot(page, 'entries-chips');
});

test('S11 不在編輯中：提議只在畫面上；時間軸差異、日期虛線；看原本；採用 → 開始編輯？→ 寫入、復原、留在編輯中', async ({ page }) => {
  await aiReady(page);
  const before = await itemCount(page, '2027-02-04');
  await say(page, S11);
  await expect(bar(page)).toContainText('川梅');
  // 右欄切到行程、選到那天；行程沒變
  await expect(page.getByTestId('day-panel')).toBeVisible();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await expect(page.locator('[data-day="2027-02-04"]').first()).toHaveClass(/proposed/);
  await expect(page.getByTestId('chat-proposal')).toContainText('顯示中');
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  expect(await app<boolean>(page, 'th.appStore.getState().planning')).toBe(false);
  await shot(page, 's11-proposal');

  // 差異畫面唯讀：沒有把手
  await expect(page.getByTestId('tl-handle')).toHaveCount(0);

  // 看原本：真的時間軸、地圖的虛線收起來
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(0);
  await expect(page.getByTestId('proposal-toggle')).toHaveText('看提議');
  await expect.poll(() => app<number>(page, "th.map.getSource('overlay-proposal-lines').serialize().data.features.length")).toBe(0);
  await shot(page, 's11-original');
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);

  // 切到探索：提議列還在，「在行程上看」回來
  await page.getByTestId('side-tab-explore').click();
  await expect(bar(page)).toBeVisible();
  await page.getByTestId('proposal-see').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);

  // 採用
  await page.getByTestId('proposal-adopt').click();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByTestId('planning-dialog')).toHaveCount(0);
  expect(await itemCount(page, '2027-02-04')).toBe(before + 1);
  expect(await app<boolean>(page, 'th.appStore.getState().planning')).toBe(false);
  await expect(page.getByTestId('toast')).toContainText('已採用提議');
  await expect(page.getByTestId('chat-proposal')).toContainText('已採用');
  await shot(page, 's11-adopted');

  // 復原
  await page.getByTestId('toast').getByRole('button', { name: '復原' }).click();
  await expect.poll(() => itemCount(page, '2027-02-04')).toBe(before);
  await expect(page.getByTestId('chat-proposal')).toHaveAttribute('data-status', 'undone');
});

test('S11 不要：行程沒變；不要了還能再打開', async ({ page }) => {
  await aiReady(page);
  const before = await itemCount(page, '2027-02-04');
  await say(page, S11);
  await expect(bar(page)).toBeVisible();
  expect(await itemCount(page, '2027-02-04')).toBe(before);

  await page.getByTestId('proposal-reject').click();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByTestId('chat-proposal')).toContainText('不要了');
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  await page.getByTestId('chat-see-version').click();
  await expect(bar(page)).toBeVisible();
});

test('看提議時沒有「編輯」；看原本才能編輯，提議重算；看提議又是唯讀', async ({ page }) => {
  await aiReady(page);
  await say(page, S11);
  await expect(page.getByTestId('planning-toggle')).toHaveCount(0);
  await page.getByTestId('proposal-toggle').click();
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(0);
  await expect(page.getByTestId('tl-handle').first()).toBeVisible();
  await expect(page.getByTestId('proposal-toggle')).toHaveText('看提議');
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await expect(page.getByTestId('tl-handle')).toHaveCount(0);
});

test('S12 提議過期：別人刪掉要換的那項 → 卡片過期，只留不要、請 AI 重新提議；只改別項 → 差異重算', async ({ page }) => {
  await aiReady(page);
  await say(page, '2/5 午餐換成大阪屋');
  await expect(bar(page)).toContainText('→ 大阪屋');
  await expect(bar(page)).not.toContainText('options');
  // 被換掉的變淡、劃掉
  await expect(page.getByTestId('tl-ghost')).toHaveCount(1);
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await shot(page, 's12-diff');

  // 別人改了同一天的別項：照樣套得上
  await page.evaluate(async () => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => ({ ...it, days: it.days.map((d: any) => ({ ...d, items: d.items.map((i: any) => (i.id === 'i-8' ? { ...i, note: '別人改的' } : i)) })) }), '別人改');
  });
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId('chat-proposal')).toHaveAttribute('data-status', 'pending');

  // 別人刪掉 i-7：過期
  await page.evaluate(async () => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => ({ ...it, days: it.days.map((d: any) => ({ ...d, items: d.items.filter((i: any) => i.id !== 'i-7') })) }), '別人刪');
  });
  await expect(bar(page)).toHaveCount(0);
  const card = page.getByTestId('chat-proposal');
  await expect(card).toHaveAttribute('data-status', 'stale');
  await expect(card).toContainText('過期了');
  await expect(page.getByTestId('chat-repropose')).toBeVisible();
  await shot(page, 's12-stale');
  await page.getByTestId('chat-stale-reject').click();
  await expect(card).toHaveAttribute('data-status', 'rejected');
});

test('S15 不搶畫面：回覆中切到行程 → 右欄不切，訊息顯示看結果，按了才切', async ({ page }) => {
  await aiReady(page, 200);
  await page.getByTestId('side-tab-explore').click();
  await page.getByTestId('chat-input').fill(S1);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toBeVisible();
  await page.getByTestId('side-tab-day').click();
  await idle(page);
  await expect(page.getByTestId('day-panel')).toBeVisible();
  const see = page.getByTestId('chat-see-result');
  await expect(see).toBeVisible();
  await shot(page, 's15-deferred');
  await see.click();
  await expect(chip(page)).toBeVisible();
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByTestId('chat-again')).toBeVisible();
});

test('S16 手動接手：打開詳情、切到行程再切回探索，結果集還在；新的回覆才取代', async ({ page }) => {
  await aiReady(page);
  await say(page, S1);
  await items(page).first().click();
  await expect(page.getByTestId('detail-float')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('side-tab-day').click();
  await page.getByTestId('side-tab-explore').click();
  await expect(chip(page)).toContainText('3 家');
  await say(page, '那伊勢有什麼海鮮');
  await expect(page.getByTestId('ai-result-title')).toHaveText('伊勢的餐廳');
});

test('S17 再看一次：結果集回來，路線照舊', async ({ page }) => {
  await aiReady(page);
  await say(page, S1);
  await say(page, '從水族館走到珍珠島多久？');
  await chip(page).click();
  await expect(chip(page)).toHaveCount(0);
  await page.locator('[data-testid="chat-present"][data-tool="show_places"]').getByTestId('chat-again').click();
  await expect(chip(page)).toContainText('3 家');
  expect(await app<number>(page, 'th.appStore.getState().routes.length')).toBe(1);
  await expect(page.getByTestId('marks-bar')).toContainText('路線 1 條');
  await shot(page, 's17');
  // 連結不是原文網址
  await expect(page.locator('.ac-text a').last()).toHaveText('Google Maps');
});

test('S18 狀態：思考中、逐字、停止鈕；出錯可以重試；超過每天上限輸入框停用（從 dev 選單切）', async ({ page }) => {
  await aiReady(page, 400);
  await fake(page, { streamMs: 400 });
  await page.getByTestId('chat-input').fill('從水族館走到珍珠島多久？');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toHaveAttribute('data-status', /thinking|tools/);
  await expect(page.getByTestId('chat-stop')).toBeVisible();
  await shot(page, 's18-thinking');
  await expect(page.getByTestId('chat-busy')).toHaveAttribute('data-status', 'streaming', { timeout: 20_000 });
  await idle(page);
  await fake(page, { delayMs: 0 });

  // dev 選單：下一次出錯
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('dev-ai')).toBeVisible();
  await shot(page, 's18-dev-menu');
  await page.getByTestId('dev-ai-next-error').click();
  await page.keyboard.press('Escape');
  await say(page, S1);
  await expect(page.getByTestId('chat-error')).toContainText('連不上 AI');
  await shot(page, 's18-error');
  await page.getByTestId('chat-retry').click();
  await idle(page);
  await expect(page.getByTestId('chat-error')).toHaveCount(0);
  await expect(chip(page)).toBeVisible();

  await page.getByTestId('account-menu').click();
  await page.getByTestId('dev-ai-next-quota').click();
  await page.keyboard.press('Escape');
  await say(page, S11);
  await expect(page.getByTestId('chat-quota')).toContainText('上限');
  await expect(page.getByTestId('chat-input')).toBeDisabled();
  await shot(page, 's18-quota');
});

test('S34 停止：已進來的字留著、標沒有回完、不呈現；重試回得完', async ({ page }) => {
  await aiReady(page, 60);
  await fake(page, { streamMs: 400 });
  await page.getByTestId('chat-input').fill(S1);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toHaveAttribute('data-status', 'streaming', { timeout: 20_000 });
  await page.getByTestId('chat-stop').click();
  await expect(page.getByTestId('chat-incomplete')).toBeVisible();
  await expect(chip(page)).toHaveCount(0);
  await shot(page, 's34-stopped');
  await fake(page, { delayMs: 0 });
  await page.getByTestId('chat-retry').click();
  await idle(page);
  await expect(page.getByTestId('chat-incomplete')).toHaveCount(0);
  await expect(chip(page)).toBeVisible();
});

test('S20 新對話和清單：新的在上面、標題取第一句；舊對話可以接著問', async ({ page }) => {
  await aiReady(page);
  await say(page, S1);
  await page.getByTestId('chat-new').click();
  await expect(page.getByTestId('chat-empty')).toBeVisible();
  await say(page, '從水族館走到珍珠島多久？');
  await page.getByTestId('chat-list-toggle').click();
  const rows = page.getByTestId('chat-conversation');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('從水族館');
  await expect(rows.nth(1)).toContainText('鳥羽能坐');
  await shot(page, 's20-list');
  await rows.nth(1).click();
  await expect(page.getByTestId('chat-conversations')).toHaveCount(0);
  await expect(page.getByTestId('chat-msg-me')).toContainText(S1);
  await say(page, '再多找幾家');
  await expect(chip(page)).toContainText('5 家');
});

test('S21 多個使用者：看到自己的對話，切回來原本的還在', async ({ page }) => {
  await aiReady(page);
  await say(page, S1);
  const me = await app<string>(page, 'th.shared.store.getState().me.id');
  const other = await app<string>(page, `th.shared.store.getState().members.find((m) => m.id !== '${me}').id`);
  await switchUser(page, other);
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await switchUser(page, me);
  await expect(page.getByTestId('chat-msg-me')).toContainText(S1);
});

test('S22 對話滿了：快滿有提示還能問；滿了只留開新對話；舊訊息和再看一次照常；按問 AI 自動開新對話', async ({ page }) => {
  await aiReady(page);
  await fake(page, { usage: 'near' });
  await say(page, S1);
  await expect(page.getByTestId('chat-near-full')).toContainText('快滿了');
  await shot(page, 's22-near');
  await fake(page, { usage: 'full' });
  await say(page, '再多找幾家');
  await expect(page.getByTestId('chat-full')).toBeVisible();
  await expect(page.getByTestId('chat-input')).toHaveCount(0);
  await expect(page.getByTestId('chat-full-new')).toBeVisible();
  await shot(page, 's22-full');
  await chip(page).click();
  await page.locator('[data-testid="chat-present"][data-tool="show_places"]').first().getByTestId('chat-again').click();
  await expect(chip(page)).toBeVisible();

  await fake(page, { usage: 'ok' });
  await items(page).first().click();
  await page.getByTestId('detail-ask-ai').click();
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(0);
  await expect(page.getByTestId('chat-context')).toHaveCount(1);
});

test('S23 重新整理：對話還在；沒有結果集、提議；看這版用最新的行程重新檢查', async ({ page }) => {
  await aiReady(page);
  await say(page, S1);
  await say(page, S11);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake && (window as any).__th.dataStore.getState().status === 'ready');
  await expect(page.getByTestId('chat-msg-me')).toHaveCount(2);
  await expect(bar(page)).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  await expect(page.getByTestId('chat-see-version')).toBeVisible();
  await shot(page, 's23-reloaded');
  await page.getByTestId('chat-see-version').click();
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId('chat-proposal')).toContainText('顯示中');
});

test('S24 回覆中關閉：標沒有回完，有重試；重試後紀錄裡沒有留下沒結果的工具呼叫', async ({ page }) => {
  await aiReady(page);
  await fake(page, { next: 'hang' });
  await page.getByTestId('chat-input').fill(S11);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-busy')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake && (window as any).__th.dataStore.getState().status === 'ready');
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

test('S25～S27 邊聊邊改、回到上一版、用說的採用：版本切換，用說的才寫', async ({ page }) => {
  await aiReady(page);
  const before = await itemCount(page, '2027-02-04');
  await say(page, S11);
  await say(page, '再加珍珠島，排在午餐後面');
  await expect(page.getByTestId('proposal-pill')).toHaveCount(2);
  await say(page, '把珍珠島移到午餐前面');
  await expect(page.locator('[data-testid="chat-proposal"][data-status="superseded"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="chat-proposal"][data-status="pending"]')).toContainText('第 3 版');
  expect(await itemCount(page, '2027-02-04')).toBe(before);
  await shot(page, 's25-versions');

  // 按「看這版」回到第 1 版，再用說的回到被取代的
  await page.locator('[data-testid="chat-proposal"][data-status="superseded"]').first().getByTestId('chat-see-version').click();
  await expect(page.getByTestId('proposal-pill')).toHaveCount(1);
  await say(page, '剛剛那版比較好');
  await expect(page.getByTestId('proposal-pill')).toHaveCount(2);

  // 同一句又改又採用：只改好
  await say(page, '把珍珠島移到午餐前面然後採用');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('還沒看過');
  expect(await itemCount(page, '2027-02-04')).toBe(before);

  // 用說的採用：不跳確認，直接寫入
  await page.getByTestId('chat-input').fill('採用');
  await page.getByTestId('chat-input').press('Enter');
  await idle(page);
  await expect(page.getByTestId('planning-dialog')).toHaveCount(0);
  await expect.poll(() => itemCount(page, '2027-02-04')).toBe(before + 2);
  await expect(page.locator('[data-testid="chat-proposal"][data-status="closed"]').first()).toContainText('沒有用上');
  await shot(page, 's27-adopted');
});

test('S28～S33 累加、一次多個、預約、切畫面的卡片', async ({ page }) => {
  await aiReady(page);
  await say(page, S1);
  await say(page, '再多找幾家');
  await expect(chip(page)).toContainText('5 家');
  await expect(page.getByTestId('ai-note')).toHaveCount(5);
  await say(page, '拿掉第二家');
  await expect(chip(page)).toContainText('4 家');
  await say(page, '這幾家都按想去');
  await expect(page.getByTestId('chat-vote')).toContainText('4 家');
  await page.getByTestId('chat-vote-undo').click();
  await expect(page.getByTestId('chat-vote')).toContainText('已復原');
  await say(page, '都加到 2/5 候選');
  await expect(page.getByTestId('chat-candidate')).toContainText('2/5');
  await shot(page, 's29-candidate');
  await page.getByTestId('chat-candidate-confirm').click();
  await expect(page.getByTestId('chat-card-done').last()).toBeVisible();

  await say(page, '哪幾家還沒訂？');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('沒訂');
  await say(page, '打開想去');
  await expect(page.getByTestId('wish-panel')).toBeVisible();
  await say(page, '給我看討論');
  await expect(page.getByTestId('chat-msg-ai').last()).toContainText('打開了');
  await say(page, '幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯');
  await expect(page.getByTestId('chat-draft')).toBeVisible();
  await shot(page, 's6-draft');
  await say(page, '送出吧');
  await expect(page.getByTestId('chat-draft')).toHaveCount(0);
  await expect(page.getByTestId('chat-card-done').last()).toContainText('已送出');
});

test('比較：照片標 A、B、C，地點標籤移過去地圖閃、點了開詳情；往上捲不強制捲到底', async ({ page }) => {
  await aiReady(page);
  await page.evaluate(() => (window as any).__th.ai.ask([{ kind: 'place', id: 'toba-yakigai-iroha' }, { kind: 'place', id: 'toba-hakkai' }, { kind: 'place', id: 'toba-osakaya' }]));
  await say(page, '比較這 3 家');
  await expect(page.getByTestId('ai-letter')).toHaveCount(3);
  await shot(page, 's4-letters');
  await page.getByTestId('chat-place-tag').first().hover();
  await expect.poll(() => app<string | null>(page, 'th.appStore.getState().hoveredId')).toBe('toba-yakigai-iroha');
  await page.getByTestId('chat-place-tag').first().click();
  await expect(page.getByTestId('detail-float')).toBeVisible();
  await page.keyboard.press('Escape');

  for (let i = 0; i < 5; i++) await say(page, '從水族館走到珍珠島多久？');
  const msgs = page.getByTestId('chat-messages');
  const fromEnd = () => msgs.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight);
  expect(await fromEnd()).toBeLessThan(40);
  await msgs.evaluate((e) => {
    e.scrollTop = 0;
  });
  await expect(page.getByTestId('chat-to-bottom')).toBeVisible();
  // 別的地方送出的新回覆：不把人拉回底部
  await page.evaluate(() => (window as any).__th.ai.send('從水族館走到珍珠島多久？'));
  await idle(page);
  expect(await msgs.evaluate((e) => e.scrollTop)).toBe(0);
  await page.getByTestId('chat-to-bottom').click();
  expect(await fromEnd()).toBeLessThan(40);
});
