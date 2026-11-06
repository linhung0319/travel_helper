// 2026-11-01 👤 試用回饋（網頁）：想去、探索展開不跳；地圖上 AI 的點是水滴、只畫最新的一組；提議時不畫日期那排、捲到提議的卡。
import { test, expect, type Page } from '@playwright/test';
import { ready, openWishSection } from './helpers.ts';

const fake = (page: Page, s: Record<string, unknown>) => page.evaluate((x) => Object.assign((window as any).__th.aiFake, x), s);
const idle = (page: Page) => expect.poll(() => page.evaluate(() => (window as any).__th.ai.store.getState().status)).toBe('idle');

async function aiReady(page: Page) {
  await ready(page);
  await page.waitForFunction(() => !!(window as any).__th?.ai && !!(window as any).__th?.aiFake);
  await fake(page, { delayMs: 0 });
}

async function say(page: Page, text: string) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-input').press('Enter');
  await idle(page);
}

const dropIds = (page: Page) => page.getByTestId('map-ai-drop').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id!).sort());
const app = <T,>(page: Page, fn: string) => page.evaluate((f) => new Function('th', `return ${f}`)((window as any).__th), fn) as Promise<T>;

/** 點一張卡，每一格畫面記下它的上緣；回傳看到的所有位置 */
async function topsWhileClicking(page: Page, opener: ReturnType<Page['getByTestId']>) {
  const id = (await opener.getAttribute('data-id'))!;
  await opener.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const box = (await opener.boundingBox())!;
  await page.evaluate((id) => {
    const seen: number[] = [];
    (window as any).__tops = seen;
    (window as any).__topsStop = false;
    const f = () => {
      if ((window as any).__topsStop) return;
      const el = document.querySelector(`.side-body [data-id="${id}"]`);
      if (el) seen.push(Math.round(el.getBoundingClientRect().top));
      requestAnimationFrame(f);
    };
    f();
  }, id);
  await page.mouse.click(box.x + 40, box.y + 20);
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    (window as any).__topsStop = true;
    return (window as any).__tops as number[];
  });
}

// T83 起點列直接開詳情彈窗（照片牆、原地展開拿掉了）：列不重建、彈窗開著點別列原地換，被點的列不跑掉
test('想去的列：點了開詳情，列不重建（縮圖不閃）；彈窗開著點別列，被點的列不跑掉', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-wish').click();
  await openWishSection(page, 'scheduled');
  const first = page.getByTestId('wish-open').first();
  await first.evaluate((el) => ((window as any).__row = el));
  await first.click();
  await expect(page.getByTestId('detail-float')).toBeVisible();
  expect(await first.evaluate((el) => (window as any).__row === el)).toBe(true);
  const tops = await topsWhileClicking(page, page.getByTestId('wish-open').nth(2));
  expect(Math.max(...tops.map((t) => Math.abs(t - tops[0]))), `跳走：${tops.join(',')}`).toBeLessThanOrEqual(1);
  expect(await first.evaluate((el) => (window as any).__row === el)).toBe(true);
  await expect(page.getByTestId('detail-float')).toHaveCount(1);
});

test('AI 找地點：地圖上是水滴不是圈；換一組時舊的水滴和舊的選取都不留；新出現的才跳', async ({ page }) => {
  await aiReady(page);
  await say(page, '鳥羽能坐 15 人的海鮮餐廳');
  const first = await app<string[]>(page, 'th.appStore.getState().aiResult.ids');
  await expect.poll(() => dropIds(page)).toEqual([...first].sort());
  await expect(page.locator('[data-testid="map-ai-drop"] .ms-drop.bounce')).toHaveCount(3);
  // 舊的圈的圖層都不在了
  expect(await app<string[]>(page, "['highlight-ring', 'compare-ring', 'proposal-added', 'proposal-circle'].filter((id) => th.map.getLayer(id))")).toEqual([]);
  // 選了一個不在結果裡的點，再問別的
  await page.evaluate(() => (window as any).__th.appStore.getState().select('toba-aquarium'));
  await say(page, '那伊勢有什麼海鮮');
  const second = await app<string[]>(page, 'th.appStore.getState().aiResult.ids');
  expect(second.some((id) => first.includes(id))).toBe(false);
  await expect.poll(() => dropIds(page)).toEqual([...second].sort());
  expect(await app<string | null>(page, 'th.appStore.getState().selectedId')).toBeNull();
});

test('比較：水滴頭裡是 A、B、C；點水滴和點地圖上的點一樣；選中的水滴不會疊兩個', async ({ page }) => {
  await aiReady(page);
  await page.evaluate(() => (window as any).__th.commands.showResult(['toba-aquarium', 'toba-mikimoto-pearl-island'], { title: '比較', lettered: true }));
  await expect.poll(() => page.getByTestId('map-ai-drop').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.label).sort())).toEqual(['A', 'B']);
  await page.locator('[data-testid="map-ai-drop"][data-id="toba-aquarium"]').click({ force: true });
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-id', 'toba-aquarium');
  await expect(page.getByTestId('map-selected')).toHaveAttribute('data-label', 'A');
  await expect(page.getByTestId('map-ai-drop')).toHaveCount(1);
});

test('提議：最新的是提議時只畫提議新增的點；不畫日期那排、捲到提議的卡；看原本才回來', async ({ page }) => {
  await aiReady(page);
  await say(page, '鳥羽能坐 15 人的海鮮餐廳');
  await say(page, '2/5 午餐換成大阪屋');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('proposal-bar')).toBeVisible();
  // 結果集的水滴收起來；大阪屋在結果裡也只因為提議
  const ids = await dropIds(page);
  expect(ids).toEqual(['toba-osakaya']);
  await expect(page.getByTestId('day-nav')).toHaveCount(0);
  await expect(page.getByTestId('planning-toggle')).toHaveCount(0);
  // 提議的卡捲進看得到的範圍
  const pill = page.getByTestId('proposal-pill').first();
  await expect.poll(async () => {
    const b = (await pill.boundingBox())!;
    const s = (await page.locator('.side-body').boundingBox())!;
    return b.y >= s.y && b.y + b.height <= s.y + s.height;
  }).toBe(true);
  // 自己捲走，再按一次「看提議」：又捲回來
  await page.locator('.side-body').evaluate((el) => (el.scrollTop = 0));
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('day-nav')).toBeVisible();
  await expect(page.getByTestId('planning-toggle')).toBeVisible();
  await page.getByTestId('proposal-toggle').click();
  await expect(page.getByTestId('day-nav')).toHaveCount(0);
  await expect.poll(() => page.locator('.side-body').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('班次表的 ✕：至少 44px；關掉時底下的點不選中、不馬上跳小卡片，游標移開後才恢復', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-05'));
  await expect.poll(() => page.locator('[data-leg]').filter({ hasText: '大眾運輸' }).count()).toBeGreaterThan(0);
  const leg = await page.locator('[data-leg]').filter({ hasText: '大眾運輸' }).first().getAttribute('data-leg');
  await page.evaluate((k) => (window as any).__th.uiStore.setState({ legOpen: k, timetable: { date: '2027-02-05', legKey: k, rideIndex: 0 } }), leg);
  const close = page.getByTestId('timetable-close');
  await expect(close).toBeVisible();
  await page.waitForTimeout(1000);
  const box = (await close.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // 把一個點移到 ✕ 正下方
  await page.evaluate(([cx, cy]) => {
    const m = (window as any).__th.map;
    const place = (window as any).__th.dataStore.getState().byId.get('toba-aquarium');
    m.jumpTo({ center: place.coords, zoom: 15 });
    const r = m.getCanvas().getBoundingClientRect();
    const c = m.project(place.coords);
    m.jumpTo({ center: m.unproject([2 * c.x - (cx - r.left), 2 * c.y - (cy - r.top)]) });
  }, [cx, cy]);
  await page.waitForTimeout(800);
  await page.mouse.move(cx, cy);
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('timetable-popup')).toHaveCount(0);
  await page.mouse.move(cx + 1, cy);
  await page.waitForTimeout(300);
  const state = () => page.evaluate(() => { const s = (window as any).__th.appStore.getState(); return { sel: s.selectedId, det: s.detailId, prev: s.previewId }; });
  expect(await state()).toEqual({ sel: null, det: null, prev: null });
  // 移開再回來：小卡片恢復
  await page.mouse.move(cx + 60, cy + 60, { steps: 3 });
  await page.mouse.move(cx, cy, { steps: 3 });
  await expect.poll(async () => (await state()).prev).toBe('toba-aquarium');
});

test('日期晶片在地圖上：寬地圖一排、窄地圖兩排，全部看得到、至少 44px；編輯中不畫；換天照常', async ({ page }) => {
  await ready(page);
  await page.getByTestId('side-tab-day').click();
  const days = page.getByTestId('m-day-strip');
  const tops = () => page.locator('.map-day:not(.all)').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].length);
  const inMap = async () => {
    const m = (await page.locator('.map-column').boundingBox())!;
    const d = (await days.boundingBox())!;
    return d.x >= m.x && d.x + d.width <= m.x + m.width;
  };
  // 地圖寬過 790px 才一排（ui.css：一排 628px，加上右上讓給引導彈窗的入口，T46）：視窗 1680 的地圖只有 780，1800 才有 900
  await page.setViewportSize({ width: 1800, height: 800 });
  await expect.poll(tops).toBe(1);
  expect(await inMap()).toBe(true);
  await page.setViewportSize({ width: 1180, height: 800 });
  await expect.poll(tops).toBe(2);
  expect(await inMap()).toBe(true);
  for (const b of await page.locator('.map-day').all()) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.side-panel [data-testid="m-day-strip"]')).toHaveCount(0);
  await page.getByTestId('m-day-2027-02-05').click();
  await expect(page.getByTestId('m-day-2027-02-05')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('day-title-date')).toHaveText('2/5');
  await page.getByTestId('planning-toggle').click();
  await page.getByTestId('planning-confirm').click();
  await expect(days).toHaveCount(0);
  await page.getByTestId('planning-done').click();
  await expect(days).toBeVisible();
  await page.getByTestId('side-tab-explore').click();
  await expect(days).toHaveCount(0);
});

test('某一天的標題：副標是「週五 · 地區」，沒有第 N 天；右欄窄、寬都和按鈕同一排', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).__th.commands.selectDay('2027-02-05'));
  const sameRow = async () => {
    const date = (await page.getByTestId('day-title-date').boundingBox())!;
    const edit = (await page.getByTestId('planning-toggle').boundingBox())!;
    const nav = (await page.getByTestId('day-nav').boundingBox())!;
    expect(edit.x + edit.width).toBeLessThanOrEqual(nav.x + nav.width);
    return date.y < edit.y + edit.height && edit.y < date.y + date.height;
  };
  await page.setViewportSize({ width: 1180, height: 800 });
  await expect(page.getByTestId('day-title-sub')).toBeVisible();
  await expect(page.getByTestId('day-title-sub')).toHaveText(/^週五 · .+/);
  expect(await sameRow()).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('day-title-sub')).toBeVisible();
  await expect(page.getByTestId('day-title-sub')).toHaveText(/^週五 · .+/);
  await expect(page.getByTestId('day-title-sub')).not.toContainText('第');
  expect(await sameRow()).toBe(true);
});

// 2026-11-02 👤：日期晶片不論寬窄都包在藍色的卡裡
test('地圖上的日期晶片：寬窄都包在藍色的卡裡，不超出地圖', async ({ page }) => {
  // 一排要地圖寬過 790px（T46）：視窗 1800 的地圖 900
  for (const [width, rows] of [[1800, 1], [1100, 2]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await ready(page);
    await page.getByTestId('side-tab-day').click();
    const days = page.getByTestId('m-day-strip');
    await expect(days).toBeVisible();
    const css = await days.evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--band)';
      document.body.append(probe);
      const band = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, band, padding: s.paddingTop, n: s.gridTemplateColumns.split(' ').length };
    });
    expect(css.bg).toBe(css.band);
    expect(css.padding).toBe('6px');
    expect(css.n).toBe(rows === 1 ? 13 : 7);
    const box = (await days.boundingBox())!;
    const map = (await page.locator('.map-days-wrap').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width);
  }
});
