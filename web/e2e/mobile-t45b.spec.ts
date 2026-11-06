// T45b、T54（手機）：整趟的直的骨架（兩格、未選區一次套好幾晚、鎖定說明、未選住宿的捷徑、列點了不跳天）、日期列的地區色線、單天頂端；沒有橫向捲動。
// 有 T45B_SHOTS（資料夾）時順便拍截圖給 👤 看。
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';
import { scrollsSideways } from './mobileHelpers.ts';

const SHOTS = process.env.T45B_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}.png` });
};

/** null＝區、住宿都清掉；字串＝只留區（未選住宿） */
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

const showAll = async (page: Page) => {
  await page.getByTestId('m-day-all').click();
  await page.evaluate(() => (window as any).__thMobile.getState().setSnap('high'));
};

test('手機整趟：數字那行在標題列下面；未選區只改那一晚；列點了不跳天；進某天用日期列', async ({ page }) => {
  await ready(page);
  await setNights(page, { '2027-02-07': null, '2027-02-08': null });
  await showAll(page);
  const rows = page.getByTestId('sk-row');
  await expect(rows).toHaveCount(12);
  // 數字那行在 T49 的標題列下面（不在標題列裡）
  const title = page.getByTestId('m-overview-title');
  await expect(title.getByTestId('sk-count')).toHaveCount(0);
  await expect(page.getByTestId('sk-count')).toHaveText('11 晚 · 區 9／11 · 住宿 9／11 · 已訂 1');
  expect((await page.getByTestId('sk-count').boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y + 10);
  await expect(page.getByTestId('m-day-2027-02-02').getByTestId('day-area-line')).toHaveAttribute('data-area', 'shima');
  await expect(page.getByTestId('m-day-2027-02-07').getByTestId('day-area-line')).toHaveClass(/undecided/);
  await shot(page, 't45b-m-trip');
  expect(await scrollsSideways(page)).toBe(false);
  // 手機地圖同一區只有一個標籤：「志摩 x 晚」，不另外畫探索用的區名（T59）
  await expect(page.locator('[data-testid="area-nights-label"][data-area="shima"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="area-nights-label"][data-area="shima"]')).toContainText('志摩');
  await expect(page.getByTestId('area-name-label')).toHaveCount(0);
  // 未選區 → 二見，只改 2/7（T59 拿掉「都套用」）
  const row = page.locator('[data-testid="sk-row"][data-date="2027-02-07"]');
  await row.getByTestId('sk-area').click();
  await expect(row.getByTestId('sk-apply-all')).toHaveCount(0);
  await row.locator('[data-testid="area-pick"][data-area="futami"]').scrollIntoViewIfNeeded();
  await shot(page, 't45b-m-picker');
  expect(await scrollsSideways(page)).toBe(false);
  await row.locator('[data-testid="area-pick"][data-area="futami"]').click();
  await expect(row.getByTestId('sk-area')).toHaveText('二見');
  await expect(page.locator('[data-testid="sk-row"][data-date="2027-02-08"]').getByTestId('sk-area')).toHaveText('未選區');
  await expect(row.getByTestId('sk-stay')).toHaveText('未選住宿');
  // 列點了不跳天
  await page.locator('[data-testid="sk-row"][data-date="2027-02-03"]').getByTestId('sk-where').click();
  await expect(page.getByTestId('m-day-all')).toHaveAttribute('aria-current', 'true');
  // 進某天用日期列：頂端寫區・第幾晚
  await page.getByTestId('m-day-2027-02-03').click();
  await expect(page.getByTestId('m-trip-title')).toContainText('2/3週三 · 志摩');
  await expect(page.getByTestId('night-line')).toHaveText(/^志摩・第 2 晚／3/);
  await shot(page, 't45b-m-day');
});

test('手機整趟：有鎖的區名的說明；未選住宿的「看那區的住宿」到探索那區的住宿書架', async ({ page }) => {
  await ready(page);
  await setNights(page, { '2027-02-09': 'ise' });
  await showAll(page);
  const r3 = page.locator('[data-testid="sk-row"][data-date="2027-02-03"]');
  await r3.getByTestId('sk-area').click();
  await expect(r3.getByTestId('sk-lock-note')).toContainText('要換區先拿掉住宿');
  await shot(page, 't45b-m-lock');
  expect(await scrollsSideways(page)).toBe(false);
  const r9 = page.locator('[data-testid="sk-row"][data-date="2027-02-09"]');
  await r9.scrollIntoViewIfNeeded();
  await r9.getByTestId('sk-stay').click();
  await expect(r9.getByTestId('sk-stay-note')).toBeVisible();
  await expect(r9.getByTestId('sk-stay-ask')).toBeVisible();
  await shot(page, 't45b-m-stay');
  expect(await scrollsSideways(page)).toBe(false);
  await r9.getByTestId('sk-stay-shelf').click();
  await expect.poll(() => page.evaluate(() => (window as any).__thMobile.getState().tab)).toBe('explore');
  await expect.poll(() => page.evaluate(() => (window as any).__thMobile.getState().feed.area)).toBe('ise');
  // T79：進那區的「住」（沒有住宿那排了）
  await expect(page.getByTestId('area-home')).toHaveAttribute('data-theme', 'lodging');
  await expect(page.getByTestId('area-home')).toBeInViewport();
  await shot(page, 't45b-m-stay-shelf');
});
