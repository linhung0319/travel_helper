// 2026-11-01 👤 試用回饋（手機）：詳情的問 AI 不貼 tag、留言打字時輸入框看得到、編輯中和提議時不畫日期那排、提議捲到卡。
import { test, expect, type Page } from '@playwright/test';
import { ready, openWishSection } from './helpers.ts';

const fake = (page: Page, s: Record<string, unknown>) => page.evaluate((x) => Object.assign((window as any).__th.aiFake, x), s);
const idle = (page: Page) => expect.poll(() => page.evaluate(() => (window as any).__th.ai.store.getState().status)).toBe('idle');

async function aiReady(page: Page) {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake);
  await fake(page, { delayMs: 0 });
}

test('詳情：問 AI 和上面那一塊有間距', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-osakaya', 'explore'));
  // T44b：標籤收進「更多」，問 AI 上面是一行時間、費用、小提醒（或已排）
  const tags = (await page.getByTestId('detail-ask-ai').locator('xpath=preceding-sibling::*[1]').boundingBox())!;
  const ask = (await page.getByTestId('detail-ask-ai').boundingBox())!;
  expect(ask.y - (tags.y + tags.height)).toBeGreaterThanOrEqual(8);
});

test('留言：鍵盤一段一段升上來，輸入框一直在鍵盤上面，不會停在最上面', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.visualViewport!;
    const listeners: Record<string, Set<() => void>> = { resize: new Set(), scroll: new Set() };
    let cut = 0;
    Object.defineProperty(window, 'visualViewport', {
      value: {
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
      },
    });
    (window as any).__setKeyboard = (h: number) => {
      cut = h;
      listeners.resize.forEach((f) => f());
    };
  });
  await ready(page);
  await page.evaluate(() => (window as any).__thMobile.getState().openPlace('toba-osakaya', 'explore', 'comments'));
  const input = page.getByTestId('comment-input');
  await input.focus();
  // 第一段只有 130 px（剛好算鍵盤），之後才升到 330
  for (const h of [130, 220, 330]) {
    await page.evaluate((x) => (window as any).__setKeyboard(x), h);
    await page.waitForTimeout(60);
  }
  const top = page.viewportSize()!.height - 330;
  await expect.poll(async () => {
    const b = (await input.boundingBox())!;
    return b.y >= 0 && b.y + b.height <= top;
  }, { message: '輸入框在鍵盤上面' }).toBe(true);
  // 瀏覽器自己把捲動位置改掉（iOS 聚焦時會），鍵盤動畫結束後再確認一次會捲回來
  await page.evaluate(() => {
    document.querySelector('.m-detail-scroll')!.scrollTop = 0;
    (window as any).__setKeyboard(331);
  });
  await expect.poll(async () => {
    const b = (await input.boundingBox())!;
    return b.y + b.height <= top;
  }).toBe(true);
});

test('編輯中：日期、問 AI 那排不畫，問 AI 在編輯條上', async ({ page }) => {
  await ready(page);
  await page.getByTestId('m-day-2027-02-05').click();
  await expect(page.locator('.m-dayhead')).toBeVisible();
  await page.getByTestId('m-trip-edit').click();
  await page.getByTestId('planning-confirm').click();
  await expect(page.locator('.m-dayhead')).toHaveCount(0);
  const ask = page.locator('.m-edit-bar').getByTestId('m-trip-ai');
  await expect(ask).toBeVisible();
  // 編輯條不換行、不超出畫面
  const bar = (await page.locator('.m-edit-bar').boundingBox())!;
  expect(bar.height).toBeLessThanOrEqual(64);
  expect(bar.x + bar.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByTestId('planning-done').click();
  await expect(page.locator('.m-dayhead')).toBeVisible();
});

test('提議：在行程上看時不畫日期那排、捲到提議的卡；看原本才回來', async ({ page }) => {
  await aiReady(page);
  await page.getByTestId('m-tab-ai').click();
  await page.getByTestId('chat-input').fill('2/5 午餐換成大阪屋');
  await page.getByTestId('chat-input').press('Enter');
  await idle(page);
  await page.getByTestId('chat-see-trip').first().click();
  await expect(page.getByTestId('proposal-bar')).toBeVisible();
  await expect(page.locator('.m-dayhead')).toHaveCount(0);
  const pill = page.getByTestId('proposal-pill').first();
  await expect.poll(async () => {
    const b = (await pill.boundingBox())!;
    const s = (await page.locator('.m-trip-body').boundingBox())!;
    return b.y >= s.y && b.y + b.height <= s.y + s.height;
  }).toBe(true);
  await page.getByTestId('proposal-toggle').click();
  await expect(page.locator('.m-dayhead')).toBeVisible();
  await expect(page.getByTestId('m-trip-edit')).toBeVisible();
});

// 2026-11-02 👤：探索、想去是整頁，高度夠，類型列和「幾個地點」那列也黏在上面；螢幕太矮時只留搜尋列
test('探索、想去：往下捲時三列都黏在上面，想去的段落標題接在下面；螢幕太矮只留搜尋列', async ({ page }) => {
  await ready(page);
  const scroll = (y: number) => page.evaluate((v) => {
    document.querySelector('.m-page')!.scrollTop = v;
  }, y);
  await page.getByTestId('m-tab-explore').click();
  const feed = page.getByTestId('m-feed');
  await scroll(1500);
  await expect(feed.getByTestId('m-feed-filters')).toBeInViewport();
  // 概覽沒有照片牆／清單切換（T50）
  const stick = (await feed.getByTestId('fb-stick').boundingBox())!;
  const top = (await page.locator('.m-page').boundingBox())!.y;
  expect(Math.round(stick.y)).toBe(Math.round(top));
  expect(stick.height).toBeLessThan(170);

  await page.getByTestId('m-tab-wish').click();
  const wish = page.getByTestId('m-wish');
  // T76：想去是三個區段；展開一段捲下去，篩選列（含主題列）照樣黏住
  await openWishSection(page, 'scheduled');
  await scroll(600);
  await expect(wish.getByTestId('fb-stick')).toBeInViewport();
  await expect(wish.getByTestId('fb-stick').locator('[data-testid^="theme-"]').first()).toBeInViewport();

  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 800, height: 360 });
  await page.getByTestId('m-tab-explore').click();
  await scroll(1500);
  await expect(page.getByTestId('m-feed-search')).toBeInViewport();
  await expect(feed.getByTestId('m-feed-filters')).not.toBeInViewport();
  await page.setViewportSize(size);
});
