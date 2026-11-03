// T45b（網頁）：整趟的直的骨架、選這晚住哪一區、日期晶片的地區色線、單天頂端「鳥羽・第 2 晚／3」、地圖的「鳥羽 3 晚」。
// 假後端的種子：志摩 3 晚 → 鳥羽 2 晚 → 二見 2 晚 → 伊勢 3 晚 → 關西機場 1 晚，每晚都選了住宿。
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

/** 把幾晚的住宿、區清掉（模擬還沒決定），存進假後端 */
const clearNights = (page: Page, dates: string[]) =>
  page.evaluate(async (dates) => {
    const th = (window as any).__th;
    await th.shared.changeItinerary((it: any) => {
      const nights = { ...it.nights };
      for (const d of dates) delete nights[d];
      return { ...it, nights };
    }, 'test');
  }, dates);

test('整趟：一天一列、色帶連住同一區連成一段、移動日、子地區、住宿；第一列最後一列是航班', async ({ page }) => {
  await ready(page);
  await showTrip(page);
  const rows = page.getByTestId('sk-row');
  await expect(rows).toHaveCount(12);
  await expect(page.getByTestId('sk-flight-arrive')).toContainText('到關西');
  await expect(page.getByTestId('sk-flight-depart')).toContainText('起飛');
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 已決定 11 晚');
  // 色帶：志摩三晚是一段（top、mid、bot）
  const rail = (i: number) => rows.nth(i).locator('.ui-sk-rail');
  await expect(rail(0)).toHaveClass(/top/);
  await expect(rail(1)).toHaveClass(/mid/);
  await expect(rail(2)).toHaveClass(/bot/);
  await expect(rail(11)).toHaveClass(/none/);
  // 這天在哪一區：第一天照這晚、移動日、最後一天照前一晚
  await expect(rows.nth(0).getByTestId('sk-where')).toHaveText('志摩');
  await expect(rows.nth(3).getByTestId('sk-where')).toHaveText('志摩 → 鳥羽');
  await expect(rows.nth(11).getByTestId('sk-where')).toHaveText('關西機場周邊');
  // 景點名稱不出現，子地區是第二行
  await expect(rows.nth(1).getByTestId('sk-regions')).toBeVisible();
  // 住宿
  await expect(rows.nth(0).getByTestId('sk-stay')).toHaveAttribute('data-stay', 'lodging');
  await expect(rows.nth(11).getByTestId('sk-stay')).toHaveCount(0);
  // 地圖：各區的晚數
  await expect(page.locator('[data-testid="area-nights-label"][data-area="shima"]')).toHaveText('志摩 3 晚');
  await shot(page, 'web-trip');
  // 點一列進那一天
  await rows.nth(4).getByTestId('sk-day').click();
  await expect(page.getByTestId('m-day-2027-02-06')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-testid="area-nights-label"]')).toHaveCount(0);
});

test('還沒決定的晚上：虛線，點了選區；單天頂端先問住哪一區；日期晶片的色線跟著變', async ({ page }) => {
  await ready(page);
  await clearNights(page, ['2027-02-07', '2027-02-08']);
  await showTrip(page);
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 已決定 9 晚');
  const row = page.locator('[data-testid="sk-row"][data-date="2027-02-07"]');
  await expect(row.locator('.ui-sk-rail')).toHaveClass(/undecided/);
  await expect(row.getByTestId('sk-where')).toHaveText('鳥羽 → ？');
  await expect(page.locator('[data-testid="sk-row"][data-date="2027-02-08"]').getByTestId('sk-where')).toHaveText('還沒決定');
  await expect(page.getByTestId('m-day-2027-02-07').getByTestId('day-area-line')).toHaveClass(/undecided/);
  await shot(page, 'web-trip-undecided');
  // 點虛線的「選住哪一區」→ 地區按鈕 → 選二見
  await row.getByTestId('sk-stay').click();
  await expect(row.getByTestId('area-picker')).toBeVisible();
  await shot(page, 'web-trip-picker');
  await row.locator('[data-testid="area-pick"][data-area="futami"]').click();
  await expect(row.getByTestId('sk-stay')).toHaveText('二見・還沒選住宿');
  await expect(row.getByTestId('area-picker')).toHaveCount(0);
  await expect(page.getByTestId('m-day-2027-02-07').getByTestId('day-area-line')).toHaveAttribute('data-area', 'futami');
  await expect(page.getByTestId('toast')).toContainText('復原');
  // 2/8 的單天頂端：還沒決定區，先問
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-08'));
  await expect(page.getByTestId('night-ask')).toBeVisible();
  await expect(page.getByTestId('day-title-sub')).toHaveText('週一 · 二見 → ？');
  await shot(page, 'web-day-ask');
  await page.getByTestId('night-ask').locator('[data-area="futami"]').click();
  await expect(page.getByTestId('night-line')).toHaveText(/二見・第 2 晚／2/);
  await expect(page.getByTestId('night-line')).toContainText('還沒選住宿');
  await expect(page.getByTestId('day-title-sub')).toHaveText('週一 · 二見');
});

test('單天頂端：區・第幾晚／幾晚、住宿名；最後一天沒有', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-03'));
  await expect(page.getByTestId('night-line')).toHaveText(/^志摩・第 2 晚／3/);
  await expect(page.getByTestId('day-title-sub')).toHaveText('週三 · 志摩');
  await shot(page, 'web-day');
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-13'));
  await expect(page.getByTestId('day-title-sub')).toBeVisible();
  await expect(page.getByTestId('night-line')).toHaveCount(0);
  await expect(page.getByTestId('night-ask')).toHaveCount(0);
});
