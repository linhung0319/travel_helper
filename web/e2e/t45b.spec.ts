// T45b、T54（網頁）：整趟的直的骨架（每晚「住哪區」「住宿」兩格、未選區／未選住宿、鎖定說明、列不再點了跳天）、
// 日期晶片的地區色線、單天頂端「鳥羽・第 2 晚／3」、地圖的「鳥羽 3 晚」。
// 假後端的種子：志摩 3 晚 → 鳥羽 2 晚 → 二見 2 晚 → 伊勢 3 晚 → 關西機場 1 晚，每晚都選了住宿；2/5 鳥羽國際飯店已訂。
// 有 T45B_SHOTS（資料夾）時順便拍截圖給 👤 看。
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

const SHOTS = process.env.T45B_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const showTrip = async (page: Page) => {
  await page.getByTestId('side-tab-day').click();
  await page.evaluate(() => (window as any).__th.commands.selectDay('all'));
};

/** 把幾晚改掉存進假後端：null＝區、住宿都清掉；字串＝只留區（未選住宿） */
const setNights = (page: Page, nights: Record<string, string | null>) =>
  page.evaluate(async (nights) => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => {
      const next = { ...it.nights };
      for (const [d, a] of Object.entries(nights)) {
        if (a) next[d] = { area: a };
        else delete next[d];
      }
      return { ...it, nights: next };
    }, 'test');
  }, nights);

const rowOf = (page: Page, date: string) => page.locator(`[data-testid="sk-row"][data-date="${date}"]`);
const day = (page: Page) => page.evaluate(() => (window as any).__th.appStore.getState().day);

test('整趟：一天一列、細色帶、兩格（住哪區加鎖、住宿＋待訂／已訂）、數字那行；列和航班點了不跳天', async ({ page }) => {
  await ready(page);
  await showTrip(page);
  const rows = page.getByTestId('sk-row');
  await expect(rows).toHaveCount(12);
  await expect(page.getByTestId('sk-flight-arrive')).toContainText('到關西');
  await expect(page.getByTestId('sk-flight-depart')).toContainText('起飛');
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 區 11／11 · 住宿 11／11 · 已訂 1');
  await expect(page.locator('.ui-sk-cols')).toHaveText('住哪區住宿');
  // 色帶：志摩三晚是一段（top、mid、bot），整段一樣粗
  const rail = (i: number) => rows.nth(i).locator('.ui-sk-rail');
  await expect(rail(0)).toHaveClass(/top/);
  await expect(rail(1)).toHaveClass(/mid/);
  await expect(rail(2)).toHaveClass(/bot/);
  await expect(rail(11)).toHaveClass(/none/);
  expect((await rail(1).boundingBox())!.width).toBeLessThanOrEqual(4);
  // 這天在哪一區：第一天照這晚、移動日、最後一天照前一晚
  await expect(rows.nth(0).getByTestId('sk-where')).toHaveText('志摩');
  await expect(rows.nth(3).getByTestId('sk-where')).toHaveText('志摩 → 鳥羽');
  await expect(rows.nth(11).getByTestId('sk-where')).toHaveText('關西機場周邊');
  await expect(rows.nth(1).getByTestId('sk-regions')).toBeVisible();
  // 兩格：區名加 🔒、住宿名稱加待訂；2/5 已訂；連住同一間每晚都寫名字
  await expect(rows.nth(0).getByTestId('sk-area')).toHaveAttribute('data-state', 'locked');
  await expect(rows.nth(0).getByTestId('sk-area')).toContainText('志摩');
  await expect(rows.nth(0).getByTestId('sk-stay')).toHaveAttribute('data-stay', 'lodging');
  await expect(rows.nth(0).getByTestId('sk-booking')).toHaveText('待訂');
  await expect(rowOf(page, '2027-02-05').getByTestId('sk-booking')).toHaveText('✓ 已訂');
  const futami = await rowOf(page, '2027-02-07').getByTestId('sk-stay').locator('.ui-sk-cell-text').textContent();
  await expect(rowOf(page, '2027-02-08').getByTestId('sk-stay').locator('.ui-sk-cell-text')).toHaveText(futami!);
  // 最後一天沒有晚上，兩格空著
  await expect(rows.nth(11).getByTestId('sk-stay')).toHaveCount(0);
  await expect(rows.nth(11).getByTestId('sk-area')).toHaveCount(0);
  await expect(page.locator('[data-testid="area-nights-label"][data-area="shima"]')).toHaveText('志摩 3 晚');
  await shot(page, 'web-trip');
  // 列的其他地方、航班點了都不跳天（進某一天用日期晶片）
  await rows.nth(4).getByTestId('sk-day').click();
  await rows.nth(4).getByTestId('sk-where').click();
  await page.getByTestId('sk-flight-arrive').click();
  expect(await day(page)).toBe('all');
  await page.getByTestId('m-day-2027-02-06').click();
  await expect(page.getByTestId('m-day-2027-02-06')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-testid="area-nights-label"]')).toHaveCount(0);
});

test('未選區：整列淡灰底、住宿是「—」；點了展開地區鈕，連著好幾晚可以一次套用；只看還沒決定的', async ({ page }) => {
  await ready(page);
  await setNights(page, { '2027-02-07': null, '2027-02-08': null, '2027-02-09': null, '2027-02-10': null });
  await showTrip(page);
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 區 7／11 · 住宿 7／11 · 已訂 1');
  const r7 = rowOf(page, '2027-02-07');
  await expect(r7).toHaveClass(/blank/);
  await expect(r7.locator('.ui-sk-rail')).toHaveClass(/undecided/);
  await expect(r7.getByTestId('sk-area')).toHaveText('未選區');
  await expect(r7.getByTestId('sk-stay')).toHaveText('—');
  await expect(page.getByTestId('m-day-2027-02-07').getByTestId('day-area-line')).toHaveClass(/undecided/);
  // 只看還沒決定的：只留 4 晚，航班照留
  await page.getByTestId('sk-only-open').click();
  await expect(page.getByTestId('sk-row')).toHaveCount(4);
  await expect(page.getByTestId('sk-flight-arrive')).toBeVisible();
  await shot(page, 'web-trip-only-open');
  await page.getByTestId('sk-only-open').click();
  await expect(page.getByTestId('sk-row')).toHaveCount(12);
  // 2/7：只改這一晚（T59 拿掉「都套用」）；選區框和上一列空開、有淡底
  await r7.getByTestId('sk-area').click();
  await expect(r7.getByTestId('sk-apply-all')).toHaveCount(0);
  const pick = r7.getByTestId('sk-panel');
  const cell = (await r7.getByTestId('sk-area').boundingBox())!;
  expect((await pick.boundingBox())!.y).toBeGreaterThanOrEqual(cell.y + cell.height + 10);
  expect(await pick.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await shot(page, 'web-trip-picker');
  await r7.locator('[data-testid="area-pick"][data-area="futami"]').click();
  await expect(r7.getByTestId('sk-area')).toHaveText('二見');
  await expect(r7.getByTestId('sk-stay')).toHaveText('未選住宿');
  await expect(r7.getByTestId('sk-panel')).toHaveCount(0);
  await expect(rowOf(page, '2027-02-08').getByTestId('sk-area')).toHaveText('未選區');
  await expect(page.getByTestId('toast')).toContainText('復原');
  await expect(page.getByTestId('m-day-2027-02-07').getByTestId('day-area-line')).toHaveAttribute('data-area', 'futami');
  // 2/8～2/10 一晚一晚選伊勢
  for (const d of ['2027-02-08', '2027-02-09', '2027-02-10']) {
    const r = rowOf(page, d);
    await r.getByTestId('sk-area').click();
    await r.locator('[data-testid="area-pick"][data-area="ise"]').click();
    await expect(r.getByTestId('sk-area')).toHaveText('伊勢');
  }
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 區 11／11 · 住宿 7／11 · 已訂 1');
  // 已經有區（沒住宿）的晚上點區名：地區鈕加「清掉」
  await r7.getByTestId('sk-area').click();
  await expect(r7.getByTestId('area-clear')).toBeVisible();
});

test('有鎖的區名：展開說明和「拿掉住宿」，拿掉後接著選區', async ({ page }) => {
  await ready(page);
  await showTrip(page);
  const r3 = rowOf(page, '2027-02-03');
  await r3.getByTestId('sk-area').click();
  await expect(r3.getByTestId('sk-lock-note')).toContainText('已選了住宿，要換區先拿掉住宿');
  await expect(r3.getByTestId('area-picker')).toHaveCount(0);
  await shot(page, 'web-trip-lock');
  await r3.getByTestId('sk-unlock').click();
  await expect(r3.getByTestId('sk-stay')).toHaveText('未選住宿');
  await expect(r3.getByTestId('sk-area')).toHaveAttribute('data-state', 'set');
  await expect(r3.getByTestId('area-picker')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('復原');
  await expect(page.getByTestId('sk-count')).toContainText('住宿 10／11');
});

test('未選住宿：展開說明加兩個捷徑（看那區的住宿、問 AI 推薦）', async ({ page }) => {
  await ready(page);
  await setNights(page, { '2027-02-07': 'futami', '2027-02-08': 'futami' });
  await showTrip(page);
  const r7 = rowOf(page, '2027-02-07');
  await r7.getByTestId('sk-stay').click();
  await expect(r7.getByTestId('sk-stay-note')).toContainText('住宿從地點的詳情按「排進行程」選');
  await expect(r7.getByTestId('sk-stay-shelf')).toHaveText('看二見的住宿 ›');
  await shot(page, 'web-trip-stay');
  // 問 AI 推薦：帶這晚起同一區還沒選住宿的晚上
  await r7.getByTestId('sk-stay-ask').click();
  await expect(page.locator('[data-testid="chat-starter"][data-first="true"]')).toContainText('幫我決定 2/7～2/8 在二見住哪');
  // 看二見的住宿：右欄到探索、選二見、捲到住宿那排
  await r7.getByTestId('sk-stay-shelf').click();
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().mode)).toBe('explore');
  await expect.poll(() => page.evaluate(() => (window as any).__th.appStore.getState().filter.areas)).toEqual(['futami']);
  await expect(page.locator('[data-testid="shelf"][data-shelf="stay"]')).toBeInViewport();
  await shot(page, 'web-trip-stay-shelf');
});

test('單天頂端：區・第幾晚／幾晚、住宿名；還沒決定先問；最後一天沒有', async ({ page }) => {
  await ready(page);
  await setNights(page, { '2027-02-08': null });
  await page.getByTestId('side-tab-day').click();
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-03'));
  await expect(page.getByTestId('night-line')).toHaveText(/^志摩・第 2 晚／3/);
  await expect(page.getByTestId('day-title-sub')).toHaveText('週三 · 志摩');
  await shot(page, 'web-day');
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-08'));
  await expect(page.getByTestId('night-ask')).toBeVisible();
  await expect(page.getByTestId('day-title-sub')).toHaveText('週一 · 二見 → ？');
  await page.getByTestId('night-ask').locator('[data-area="futami"]').click();
  await expect(page.getByTestId('night-line')).toHaveText(/二見・第 2 晚／2/);
  await expect(page.getByTestId('night-line')).toContainText('還沒選住宿');
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-13'));
  await expect(page.getByTestId('day-title-sub')).toBeVisible();
  await expect(page.getByTestId('night-line')).toHaveCount(0);
  await expect(page.getByTestId('night-ask')).toHaveCount(0);
});
