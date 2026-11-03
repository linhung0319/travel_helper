// T48（網頁）：提議出現時右欄、地圖跳到對的地方。在 2/5 時收到 2/10～2/11 改住大阪的提議 → 右欄到整趟、骨架畫提議之後的樣子、
// 有變的格子劃掉舊值、地圖的晚數照提議算（有變的區芥子黃框）；切到「原本」畫確定的行程。
// 假後端的種子：志摩 3 晚 → 鳥羽 2 晚 → 二見 2 晚 → 伊勢 3 晚 → 關西機場 1 晚，每晚都選了住宿。
import { test, expect } from '@playwright/test';
import { ready } from './helpers.ts';

// 有 T48_SHOTS（資料夾）時順便拍截圖
const SHOTS = process.env.T48_SHOTS;

test('在 2/5 收到 2/10～2/11 改區的提議 → 右欄到整趟、骨架和地圖照提議之後畫', async ({ page }) => {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th.ai);
  await page.evaluate(() => {
    const s = (window as any).__th.appStore.getState();
    s.selectDay('2027-02-05');
    s.setMode('explore');
  });
  const err = await page.evaluate(() =>
    (window as any).__th.ai.proposals.show(
      't48-card',
      ['2027-02-10', '2027-02-11'].map((date) => ({ op: 'setNightArea', date, area: 'osaka' })),
      '2/10～2/11 住大阪',
    ),
  );
  expect(err).toBeNull();
  // 右欄切到行程、整趟
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().mode)).toBe('map');
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().day)).toBe('all');
  const sk = page.getByTestId('trip-skeleton');
  await expect(sk).toHaveAttribute('data-view', 'proposal');
  // 2/10：這天在哪一區、住宿都是新的，旁邊劃掉舊值
  const row = page.locator('[data-testid="sk-row"][data-date="2027-02-10"]');
  await expect(row.getByTestId('sk-where')).toHaveText('伊勢 → 大阪');
  await expect(row.getByTestId('sk-where')).toHaveClass(/changed/);
  await expect(row.getByTestId('sk-old').first()).toHaveText('伊勢');
  await expect(row.getByTestId('sk-stay')).toHaveText('大阪・還沒選住宿');
  await expect(row.getByTestId('sk-stay-changed').getByTestId('sk-old')).not.toHaveText('');
  // 色帶是新的區；沒變的列沒有舊值
  await expect(row).toHaveAttribute('data-area', 'osaka');
  await expect(page.locator('[data-testid="sk-row"][data-date="2027-02-05"]').getByTestId('sk-old')).toHaveCount(0);
  // 地圖的晚數：照提議算，有變的區芥子黃框
  const label = (a: string) => page.locator(`[data-testid="area-nights-label"][data-area="${a}"]`);
  await expect(label('osaka')).toHaveText('大阪 2 晚');
  await expect(label('osaka')).toHaveClass(/changed/);
  await expect(label('ise')).toHaveText('伊勢 1 晚');
  await expect(label('ise')).toHaveClass(/changed/);
  await expect(label('shima')).not.toHaveClass(/changed/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/t48-web-${page.viewportSize()!.width}.png` });
  // 切到「原本」：畫確定的行程
  await page.evaluate(() => (window as any).__th.uiStore.setState({ proposalView: 'original' }));
  await expect(sk).toHaveAttribute('data-view', 'trip');
  await expect(row.getByTestId('sk-where')).toHaveText('伊勢');
  await expect(row.getByTestId('sk-old')).toHaveCount(0);
  await expect(label('ise')).toHaveText('伊勢 3 晚');
  await expect(label('osaka')).toHaveCount(0);
});

test('只動 1 天的點 → 跳到那天', async ({ page }) => {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th.ai);
  await page.evaluate(() => (window as any).__th.appStore.getState().selectDay('2027-02-05'));
  const err = await page.evaluate(() => {
    const th = (window as any).__th;
    const it = th.dataStore.getState().itinerary;
    // 2/5 以外第一個有排點的天
    const day = it.days.find((d: any) => d.date !== '2027-02-05' && d.items.some((x: any) => x.type === 'visit'));
    const item = day.items.find((x: any) => x.type === 'visit');
    return { date: day.date, err: th.ai.proposals.show('t48-one', [{ op: 'remove', itemId: item.id }], '拿掉一個') };
  });
  expect(err.err).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().day)).toBe(err.date);
});
