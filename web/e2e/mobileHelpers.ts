// 手機版 e2e 共用（第六輪）：mobile、mobile-small 兩個 project 用。網頁版的 helpers.ts 只放兩邊都能用的（ready、等地圖）。
import { expect, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

export const TABS = ['explore', 'wish', 'trip', 'ai', 'me'] as const;
export type Tab = (typeof TABS)[number];

/** 點底部分頁，等它變成選到的那個 */
export async function goTab(page: Page, tab: Tab) {
  await page.getByTestId(`m-tab-${tab}`).click();
  await expect(page.getByTestId(`m-tab-${tab}`)).toHaveAttribute('aria-current', 'page');
}

/** 整頁有沒有橫向捲動 */
export const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

/** 手機版的 store（mobileStore.ts 在 dev 時掛在 window.__thMobile） */
export const mobileState = (page: Page) => page.evaluate(() => {
  const s = (window as any).__thMobile.getState();
  return { tab: s.tab, detail: s.detail, page: s.page };
});

export { expect, ready };
