# 標籤、動作選單、手機版重新設計：實作計畫（T15m 第六輪）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 這份計畫做三件事。
- 卡片的「用餐」「吃法」合成可以多選的標籤。
- 「⋯」動作選單統一成一份清單，網頁版和手機版都用它。
- 手機版從頭做一個獨立的殼：底部 5 個分頁、圖片牆探索、整頁詳情、上面地圖下面時間軸的行程、AI 聊天的分頁和半屏聊天。網頁版只改設計 §2 列的地方。

**Architecture:**
- 引擎（`packages/engine`）：visit 的 `meal`／`dining` 改成 `tags`。
- `web/src/shared/`：放兩邊共用的規則，都是純函式，有單元測試。內容是標籤分組、卡片動作清單、問 AI 的建議問題。
- 網頁版元件在 `web/src/components/`，手機版元件全部放在新的 `web/src/mobile/`，用自己的 `mobile.css`（class 用 `m-` 開頭）。`App.tsx` 只在最外層用 `useIsDesktop()` 分一次。
- 地圖（`MapView`）在手機版一直掛著，不在行程分頁時用 CSS 藏起來。T12 的地圖指令和 e2e 的 `ready()` 都要用到它。

**Tech Stack:** TypeScript、React 19、Zustand vanilla、MapLibre、node:test（`npm test`）、Playwright（`npm run e2e`，在 `web/` 底下）。

**Spec:** `docs/superpowers/specs/2026-10-25-itinerary-round6-mobile-design.md`（接在第五輪 `2026-10-25-itinerary-round5-design.md` 後面）。草圖在主 repo 的 `.superpowers/brainstorm/38070-1792929968/content/t15m-mobile-v1.html`（不進 git，可以用瀏覽器打開看）。**草圖和設計文件不一樣的地方，以設計文件為準。**

## Global Constraints

- 所有路徑都在 worktree `D:\workspace\travel_helper-t15m`（分支 `t15m`）裡，指令在這個目錄的根跑。
- 文件、註解、commit 訊息用繁體中文。commit 結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。
- 每個任務結束前，`npm test`、`npm run typecheck`、`npm run validate` 都要過，過了就 commit。動到畫面的任務，再跑一次 `cd web && npx playwright test`：只跑那個任務改到的 spec，要過（👤 說不用停下來問）。
- 不改 `worker/`；AI 的對話內容留給 T16m。
- 程式風格照現有檔案：檔頭一段中文註解說明用途，函式上方一行 `/** */`。改到的檔頭註解要跟著更新。
- 類型色用 `web/src/lib/typeStyle.ts` 的 `TYPE_COLORS`，不要另外寫一份。
- 手機版、網頁版的分界：`DESKTOP_QUERY`（`web/src/hooks.ts`，`(min-width: 900px)`）。
- 手機版所有可以點的東西，點的範圍至少 44px 高。390×844、360×800 兩種尺寸都不能有橫向捲動。
- 標籤 id（固定，照設計 §2.1）：`breakfast`、`lunch`、`dinner`、`snack`、`all`、`groups`、`must`、`skippable`、`rainplan`、`rest`。畫面上的字：早餐、午餐、晚餐、點心、全員、分組、必去、可跳過、雨天備案、休息。
- 標籤分組的顏色：用餐 `#fff1e0`／字 `#a14a00`、誰去 `#e3efff`／`#174ea6`、安排 `#eceff1`／`#37474f`、這晚的方案 `#efe7fb`／`#5b3a9c`。
- 紅字日期：週六、週日、`JP_HOLIDAYS`。顏色用 `#d32f2f`。任何地方都不寫「假日」兩個字。時刻表、營業時間的分類照舊，不算在內。
- 「⋯」只用圖示，只在編輯中出現。時間軸上有地點的卡沒有「刪除」。
- 第五輪以前的畫面規則，這份沒提到的照舊。

## Review Focus

1. **很長的名稱**（例如「La Mer（志摩觀光飯店 The Bay Suites 法式）」）出現在 360px 寬的手機卡片、圖片牆、詳情標題：一行省略，不能撐出橫向捲動 → Task 7 e2e `每個分頁都沒有橫向捲動（360px）`。
2. **「⋯」選單或標籤彈窗開在畫面右下角的卡片上**（網頁版右欄最後一張）：自己往上或往左翻，整個看得到，不被地圖或下一張卡蓋住 → Task 3 單元測試 `placePopover：靠右下角時往上、往左翻`。
3. **撤下一張卡，但這天已經有同一個地點的候選**（別人加的）：不重複加。按復原時，只把卡放回行程，不刪掉原本就有的那筆候選 → Task 4 e2e `撤下：已經有候選時復原不刪別人的候選`。
4. **沒有照片的資料點**出現在手機行程卡、圖片牆：縮圖改成類型色塊加一個字（景、餐、宿、站、點），不能是破圖或空白 → Task 10 e2e `沒有照片的點顯示類型色塊`。
5. **標籤互斥**：已經有「分組」時點「全員」，「分組」要消失；再點一次「全員」，兩個都沒有 → Task 2 單元測試 `toggleTag：全員、分組互斥`。

---

### Task 1: 引擎：visit 的 tags 取代 meal、dining

**Files:**
- Modify: `packages/engine/src/types.ts`：`TagId`、`TAG_IDS`；`VisitItem.tags`；拿掉 `meal`、`dining`、`DiningStyle`；`TimelineEntry.mealTags` 取代 `mealTag`
- Modify: `packages/engine/src/ops.ts`：拿掉 `setMeal`、`setDining`，新增 `setTags`、`upgradeItinerary`；`validateItinerary` 檢查 tags
- Modify: `packages/engine/src/timeline.ts`：`runVisit` 的 meal 改用 `pickMeal`；休息判斷加 `rest`；`groupChecks` 跳過標了 `groups` 的卡
- Modify: `packages/engine/src/index.ts`：匯出上面這些
- Modify: `web/src/dev-fixtures/seed.ts`：`meal: 'lunch'` 改成 `tags: ['lunch']`
- Modify: `web/src/backend/mock.ts`：從 localStorage 讀出行程時，先過 `upgradeItinerary`
- Modify: `web/src/components/ItemTags.tsx`、`web/src/components/Timeline.tsx`、`web/src/lib/planView.ts`：只做到能編譯就好。讀 `mealTags`，原本呼叫 `setMeal`、`setDining` 的地方改成 `setTags`。整個重做是 Task 3。
- Modify: `docs/CONVENTIONS.md` §3：拿掉 visit 的 `meal`、`dining` 兩行（約 343～344 行），換成 `tags`。時間軸那段（約 383 行）的 `mealTag` 改成 `mealTags`。
- Test: `packages/engine/test/ops.test.ts`、`packages/engine/test/timeline.test.ts`、`web/test/lib.test.ts`（改舊的 meal 測試）

**Interfaces:**
- Produces：
  - `export const TAG_IDS = ['breakfast','lunch','dinner','snack','all','groups','must','skippable','rainplan','rest'] as const; export type TagId = (typeof TAG_IDS)[number];`
  - `VisitItem.tags?: TagId[]`（省略或 `[]`＝沒標）
  - `setTags(it: Itinerary, itemId: string, tags: TagId[]): Itinerary`：去掉重複，照 `TAG_IDS` 的順序存。不是 visit 時丟 `ItineraryError`。這裡不檢查互斥，互斥是畫面規則（Task 2）。
  - `pickMeal(tags: readonly TagId[] | undefined, guessed: MealKind | null): MealKind | null`：只有一個用餐標籤就用它；有好幾個時，其中有 `guessed` 就用 `guessed`，沒有就用最早的那一餐（早餐 < 午餐 < 晚餐 < 點心）；沒有用餐標籤就回傳 `guessed`。
  - `upgradeItinerary(raw: Itinerary): Itinerary`：把舊的 `meal`／`dining` 轉成 tags。`meal: x` → 加 `x`；`dining: 'together'` → 加 `all`；`dining: 'separate'` → 加 `groups`。轉完刪掉舊的兩個欄位。沒有舊欄位的就原樣回傳（同一個物件）。
  - `TimelineEntry.mealTags?: MealKind[]`：visit 標的那幾餐，照 `TAG_IDS` 的順序；沒標是 `[]`。
- 引擎的規則：
  - `runVisit`：先照現在的方式猜一餐（餐廳照午餐、晚餐時段猜，其他是 null），再用 `meal = pickMeal(item.tags, guessed)`。
  - 休息的判斷（`timeline.ts` 約 398 行）：`rest` 的條件多加一條「這個 visit 有 `rest` 標籤」。要在 entry 上加 `rest?: boolean`，或用 itemId 回頭查都可以；用哪一種由實作的人決定。
  - `groupChecks`：`ctx.whole` 而且這個 visit 有 `groups` 標籤時，不發 `group-seats`、`no-reservation`。`kids-not-allowed` 照發。
  - `validateItinerary`：`tags` 要是陣列，每個值都在 `TAG_IDS` 裡。出現 `meal` 或 `dining` 欄位就報錯，訊息寫「舊格式，請先 upgradeItinerary」。

- [ ] **Step 1: 寫失敗的測試**（`packages/engine/test/ops.test.ts`、`timeline.test.ts`，用現有的 fixture）

```ts
test('setTags：去重、照 TAG_IDS 排序', () => {
  const next = setTags(it, visitId, ['rest', 'lunch', 'lunch', 'breakfast']);
  assert.deepEqual(visit(next).tags, ['breakfast', 'lunch', 'rest']);
});
test('upgradeItinerary：meal、dining 轉成 tags', () => {
  const old = withVisit({ meal: 'lunch', dining: 'separate' });
  const v = visit(upgradeItinerary(old));
  assert.deepEqual(v.tags, ['lunch', 'groups']);
  assert.equal('meal' in v, false);
  assert.equal('dining' in v, false);
});
test('validateItinerary：舊欄位、未知的 tag 報錯', () => {
  assert.ok(validateItinerary(withVisit({ meal: 'lunch' })).some((e) => e.includes('upgradeItinerary')));
  assert.ok(validateItinerary(withVisit({ tags: ['brunch'] })).length > 0);
});
test('pickMeal', () => {
  assert.equal(pickMeal(['lunch'], 'dinner'), 'lunch');
  assert.equal(pickMeal(['breakfast', 'lunch'], 'lunch'), 'lunch');
  assert.equal(pickMeal(['dinner', 'breakfast'], null), 'breakfast');
  assert.equal(pickMeal([], 'snack'), 'snack');
  assert.equal(pickMeal(['rest'], null), null);
});
test('timeline：景點標 rest 算休息，不發 no-rest', () => { /* 長輩日、連續三個景點，中間那個標 rest → 沒有 no-rest */ });
test('timeline：餐廳標 groups 不發 group-seats、no-reservation', () => { /* fit15 不是 yes 的餐廳，全員日：沒標有警告，標 groups 沒有 */ });
test('timeline：mealTags 照標籤', () => { /* tags ['lunch','snack'] → entry.mealTags 是 ['lunch','snack'] */ });
```

- [ ] **Step 2: 跑測試，確認會失敗**：`npm test`。預期：`setTags`、`pickMeal`、`upgradeItinerary` 沒有定義。
- [ ] **Step 3: 照 Interfaces 實作引擎。** 改 seed、mock 的讀取、web 的三個檔讓它能編譯，再改 CONVENTIONS。
- [ ] **Step 4: 跑測試，確認會過**：`npm test && npm run typecheck && npm run validate`，全部 PASS。
- [ ] **Step 5: Commit**：`引擎：visit 的 tags 取代 meal、dining（T15m 第六輪）`

---

### Task 2: shared 規則：標籤分組、卡片動作、問 AI 的建議問題、紅字日期

**Files:**
- Create: `web/src/shared/tagOptions.ts`
- Create: `web/src/shared/cardActions.ts`
- Create: `web/src/shared/askAiPrompts.ts`
- Modify: `web/src/lib/trip.ts`：新增 `isRedDay`；`dayLabel` 拿掉 `・假日`
- Test: `web/test/shared.test.ts`（新檔），和 `web/test/lib.test.ts`（`dayLabel`）

**Interfaces:**
- Produces（`tagOptions.ts`）：
  - `type TagCardKind = 'spot' | 'restaurant' | 'station' | 'custom'`：visit 的地點類型。住宿、航班、自由時間不用這個檔。
  - `interface TagGroup { id: 'meal' | 'who' | 'plan'; title: string; icon: string; tags: TagId[]; exclusive: boolean; bg: string; fg: string }`
  - `TAG_GROUPS: TagGroup[]`：
    - `meal`：🍴 用餐，早午晚點心。
    - `who`：👥 誰去，`all`、`groups`，exclusive。
    - `plan`：📌 安排，必去、可跳過、雨天備案、休息。
    - 顏色照 Global Constraints。
  - `TAG_LABELS: Record<TagId, string>`
  - `tagGroupsFor(kind: TagCardKind): TagGroup[]`：spot、restaurant 三組都有；station、custom 只有 meal、plan。
  - `toggleTag(tags: readonly TagId[], id: TagId): TagId[]`：已經有就拿掉。沒有就加進去，如果它的組是 exclusive，同組其他的拿掉。
  - `LODGING_PLANS: { value: 'dinner+breakfast' | 'breakfast' | 'none'; label: '一泊二食' | '只含早餐' | '素泊' }[]`
  - `toggleLodgingPlan(cur: LodgingMeals | null, v: LodgingMeals): LodgingMeals | null`：同一個再點一下回傳 `null`。
- Produces（`cardActions.ts`）：
  - `type CardKind = 'visit' | 'lodging-start' | 'lodging-end' | 'free' | 'flight' | 'split' | 'candidate'`
  - `type ActionId = 'main' | 'detach' | 'tags' | 'stay' | 'pin' | 'unpin' | 'move' | 'group-in' | 'group-out' | 'withdraw' | 'lodging-plan' | 'lodging-clear' | 'free-length' | 'delete' | 'schedule' | 'split-actions'`
  - `interface CardActionContext { kind: CardKind; overlap?: boolean; pinned?: boolean; groupTargets?: { splitId: string; groupId: string; name: string }[]; inGroup?: boolean; mine?: boolean; surface: 'desktop' | 'mobile' }`
  - `cardActions(ctx: CardActionContext): ActionId[][]`：分組好的動作，每一組之間畫分隔線。照設計 §2.3 的表：
    - visit：`[main, detach]`（只有重疊卡才有這組）、`[tags, stay, pin|unpin, move, (每個 group-in), group-out?]`、`[withdraw]`。
    - lodging-start：`[]`（沒有「⋯」）。
    - lodging-end：`[lodging-plan]`、`[lodging-clear]`。
    - free：`[free-length, move]`、`[delete]`。
    - flight：`[]`。
    - split：`[split-actions]`。
    - candidate：`[schedule, move（只有 mine 才有）]`、`[delete]`。
    - `stay` 只出現在 `surface: 'mobile'`。網頁版卡片上本來就有 −／＋（計畫的決定）。
    - `cardActions(...)` 回傳空陣列＝不畫「⋯」。
  - `ACTION_LABELS: Record<ActionId, string>`：照設計的字，例如 `main: '👑 主要'`、`detach: '⤴ 拿出'`、`withdraw: '↩ 撤下（回候選）'`、`move: '📅 移到第幾天…'`、`lodging-plan: '🏷 這晚的方案'`、`lodging-clear: '🗑 清掉這晚的住宿'`、`schedule: '📅 排進這天'`、`delete: '🗑 刪除'`。group-in 的字由畫面組成「👥 移到{組名}」。
- Produces（`askAiPrompts.ts`）：`askAiPrompts(type: Place['type'], fromTrip: boolean): string[]`。照設計 §2.6 的字；從行程打開的，最前面加「這天排它會不會太趕？」。景點以外、沒列到的類型回傳景點那一組。
- Produces（`trip.ts`）：`isRedDay(date: string): boolean`

- [ ] **Step 1: 寫失敗的測試**（`web/test/shared.test.ts`）

```ts
test('toggleTag：全員、分組互斥', () => {
  assert.deepEqual(toggleTag(['groups', 'lunch'], 'all'), ['lunch', 'all']);
  assert.deepEqual(toggleTag(['lunch', 'all'], 'all'), ['lunch']);
});
test('toggleTag：用餐可以多選', () => assert.deepEqual(toggleTag(['breakfast'], 'lunch'), ['breakfast', 'lunch']));
test('tagGroupsFor：車站沒有誰去', () => assert.deepEqual(tagGroupsFor('station').map((g) => g.id), ['meal', 'plan']));
test('toggleLodgingPlan：再點一次回到 null', () => assert.equal(toggleLodgingPlan('breakfast', 'breakfast'), null));
test('cardActions：一般卡沒有 delete、有 withdraw', () => {
  const flat = cardActions({ kind: 'visit', surface: 'desktop' }).flat();
  assert.ok(flat.includes('withdraw'));
  assert.ok(!flat.includes('delete'));
  assert.ok(!flat.includes('stay'));
});
test('cardActions：重疊卡最上面是 main、detach', () => assert.deepEqual(cardActions({ kind: 'visit', overlap: true, surface: 'mobile' })[0], ['main', 'detach']));
test('cardActions：出發住宿、航班沒有選單', () => {
  assert.equal(cardActions({ kind: 'lodging-start', surface: 'desktop' }).length, 0);
  assert.equal(cardActions({ kind: 'flight', surface: 'mobile' }).length, 0);
});
test('cardActions：別人的候選不能移天', () => assert.ok(!cardActions({ kind: 'candidate', mine: false, surface: 'desktop' }).flat().includes('move')));
test('isRedDay', () => {
  assert.equal(isRedDay('2027-02-06'), true);  // 六
  assert.equal(isRedDay('2027-02-07'), true);  // 日
  assert.equal(isRedDay('2027-02-11'), true);  // 建国記念の日
  assert.equal(isRedDay('2027-02-10'), false);
});
test('dayLabel 不寫假日', () => assert.equal(dayLabel('2027-02-11'), '2/11（四）'));
```

- [ ] **Step 2: 跑測試，確認會失敗**：`npm test`。預期：模組找不到。
- [ ] **Step 3: 照 Interfaces 實作這三個檔和 `isRedDay`，再改 `dayLabel`。**
- [ ] **Step 4: 跑測試，確認會過**：`npm test && npm run typecheck`，PASS。
- [ ] **Step 5: Commit**：`web：shared 規則（標籤分組、卡片動作、問 AI 建議問題）、紅字日期（T15m 第六輪）`

---

### Task 3: 網頁版：標籤彈窗、資料卡欄位對齊、浮動層

**Files:**
- Create: `web/src/components/Popover.tsx`：用 portal 掛到 `document.body` 的浮動層，點外面或按 Esc 就關
- Create: `web/src/lib/popover.ts`：`placePopover` 純函式
- Modify: `web/src/components/ItemTags.tsx`：整個重做，改成多選的 `TagPopover`；回住宿那張卡用「這晚的方案」
- Modify: `web/src/components/Timeline.tsx`：資料卡四欄（把手欄、類型色塊、內容、動作欄）；宿的卡也留把手欄；把 `lodgingMealTags` 改成用 `LODGING_PLANS` 的字，照資料的時候用淡色
- Modify: `web/src/styles.css`
- Test: `web/test/shared.test.ts`（`placePopover`）、`web/e2e/t15m.spec.ts`

**Interfaces:**
- Consumes：Task 2 的 `tagGroupsFor`、`toggleTag`、`TAG_LABELS`、`LODGING_PLANS`、`toggleLodgingPlan`；Task 1 的 `setTags`；現有的 `setLodging(it, date, lodging, meals)`（lodging 傳原本那間）。
- Produces：
  - `placePopover(anchor: DOMRectLike, size: { w: number; h: number }, viewport: { w: number; h: number }, gap = 6): { left: number; top: number }`：預設放在 anchor 下面、左緣對齊。下面放不下就放上面；右邊超出就靠右對齊 anchor；最後再夾在視窗裡面（離邊緣至少 8px）。
  - `<Popover anchor={HTMLElement | null} open onClose={() => void} testId?: string>{children}</Popover>`：`position: fixed`，z-index 要比地圖、日期列、浮動列、編輯藍條都高（在 styles.css 用變數 `--z-popover`）。點外面（pointerdown 不在 popover 或 anchor 裡）就 `onClose`，按 Esc 也關。捲動、resize 時重新算位置。
  - `<TagPopover visit kind anchor onClose />`：每組一列膠囊按鈕，`role="menuitemcheckbox"`、`aria-checked`，testid 是 `tag-opt-{id}`。點了立刻 `shared.changeItinerary(it => setTags(it, id, toggleTag(cur, tag)), …)`，彈窗不關。
  - `<LodgingPlanPopover date anchor onClose />`：testid 是 `lodging-plan-{value}`。

- [ ] **Step 1: 寫失敗的測試**

```ts
// web/test/shared.test.ts
test('placePopover：靠右下角時往上、往左翻', () => {
  const p = placePopover({ left: 1180, top: 760, right: 1260, bottom: 790, width: 80, height: 30 }, { w: 300, h: 200 }, { w: 1280, h: 800 });
  assert.ok(p.left + 300 <= 1280 - 8);
  assert.ok(p.top + 200 <= 760);
});
```

```ts
// web/e2e/t15m.spec.ts（desktop）
test('標籤：多選、再點取消、點外面關', async ({ page }) => {
  // 進 2/3 編輯 → 點 La Mer 的標籤那排 → 彈窗 tag-popover 在 body 底下
  // 點 tag-opt-breakfast：卡片上多一個「早餐」，「午餐」還在
  // 再點 tag-opt-lunch：「午餐」消失
  // 點 tag-opt-groups 再點 tag-opt-all：只剩「全員」
  // 點地圖空白處：tag-popover 不見了
});
test('資料卡：宿、景、餐的類型色塊左緣對齊，⋯ 都在右邊', async ({ page }) => {
  // 編輯 2/3：每張 [data-testid=item-type] 的 boundingBox().x 一樣；每個 item-menu 的 x 也一樣
});
test('回住宿的卡：這晚的方案三選一，再點取消', async ({ page }) => { /* lodging-plan-breakfast → 卡上「只含早餐」；再點 → 回到照資料（淡色） */ });
```

- [ ] **Step 2: 跑測試，確認會失敗**：`npm test`；`cd web && npx playwright test t15m.spec.ts --project=desktop -g "標籤|資料卡|回住宿"`。預期：FAIL。
- [ ] **Step 3: 實作。** 先寫 `placePopover`、`Popover`，再寫 `TagPopover`、`LodgingPlanPopover`，最後做卡片的四欄版面。現在 e2e 裡用到 `tag-meal-*`、`tag-dining-*`、`menu-tag-meal`、`menu-tag-dining` 的測試，改成新的 testid。
- [ ] **Step 4: 跑測試，確認會過**：`npm test && npm run typecheck`；剛才那三個 e2e 要 PASS，`t15m.spec.ts --project=desktop` 全部 PASS。
- [ ] **Step 5: Commit**：`web：標籤彈窗（多選、點外面關）、資料卡欄位對齊、浮動層在最上層（T15m 第六輪）`

---

### Task 4: 網頁版：「⋯」動作選單、撤下、拿出、候選選單

**Files:**
- Create: `web/src/components/ActionMenu.tsx`：照 `cardActions` 的結果畫選單，用 Task 3 的 `Popover`
- Create: `web/src/components/cardActionRun.ts`：每個 `ActionId` 要做的事。這個檔沒有版面，手機版也用它
- Modify: `web/src/components/Timeline.tsx`：拿掉 `ItemMenu`、`LodgingMenu`，改用 `ActionMenu`；拿掉看備卡時卡片上的 👑、「設為主要」「拿出來」按鈕（‹ 1/2 › 留著）；不在編輯中不畫「⋯」
- Modify: `web/src/components/planDrag.ts`：新增 `withdrawItem`；`putBackOption` 只留給拖到候選區用
- Modify: 候選卡所在的元件（`DayPanel.tsx` 或 `Timeline.tsx` 裡畫候選的地方）：加候選的「⋯」
- Test: `web/e2e/t15m.spec.ts`

**Interfaces:**
- Consumes：Task 2 的 `cardActions`、`ACTION_LABELS`；引擎的 `selectOption`、`detachOption(it, itemId, optionIndex, date, index, split?)`（ops.ts:325）、`setStart`、`moveItemTo`、`removeItem`、`setLodging`。
- Produces：
  - `runCardAction(id: ActionId, target: ActionTarget, ui: { openTags: () => void; openMove: () => void; openLodgingPlan: () => void; openStay?: () => void }): Promise<void>`
    - `ActionTarget` 是 `{ date: string; itemId?: string; optionIndex?: number; candidateId?: number; placeId?: string; split?: {...} }`。
    - `main` → `selectOption`。
    - `detach` → `detachOption`，放在主卡的下一個位置，在分組裡就留在同一組。
    - `pin` → 用時間軸上現在的開始時間呼叫 `setStart`；`unpin` → `setStart(null)`。
    - `withdraw` → `withdrawItem`。
    - `delete`：自由時間是 `removeItem`，候選走現有的刪除流程（別人加的會開 `RejectDialog`）。
    - `schedule` → 候選排進這天，用現有的「排進」做法。
  - `withdrawItem(itemId: string, date: string): Promise<void>`：
    1. 先把卡上所有選項的地點都加成這天的候選（以我的名字）。已經有的跳過，記下哪些是原本就有的。
    2. 再 `removeItem`。
    3. toast「已撤下・{名稱}」，可以復原。復原時把卡放回原位，只刪掉這次新加的候選。
    4. 如果 `removeItem` 失敗，把剛加的候選刪掉。

- [ ] **Step 1: 寫失敗的 e2e**（desktop）

```ts
test('⋯：不在編輯中沒有，編輯中有；一般卡沒有刪除', async ({ page }) => {
  // 2/3 一般模式：item-menu 數量 0；進編輯：La Mer 的 item-menu → 選單在 body 底下（portal）
  // 有「↩ 撤下（回候選）」，沒有「🗑 刪除」；出發住宿那張沒有 item-menu
});
test('撤下：卡片變成這天的候選，可以復原', async ({ page }) => { /* 撤下橫山展望台 → 時間軸少一張、候選多一張；toast-undo → 回到原位、候選少一張 */ });
test('撤下：已經有候選時復原不刪別人的候選', async ({ page }) => { /* 先用 __th.shared 以別人的名義加同地點候選 → 撤下 → 復原 → 那筆候選還在 */ });
test('重疊卡：主要、拿出', async ({ page }) => {
  // 2/5 漣／一榮那張，看第 2 張 → ⋯ → 👑 主要：主卡換成一榮
  // ⋯ → ⤴ 拿出：時間軸多一張單獨的卡，候選數量不變
});
test('候選的 ⋯：排進這天、刪除', async ({ page }) => { /* 候選卡 ⋯ 有 schedule、delete；別人加的沒有 move */ });
```

- [ ] **Step 2: 跑測試，確認會失敗**：`cd web && npx playwright test t15m.spec.ts --project=desktop -g "⋯|撤下|重疊卡|候選的"`。預期：FAIL。
- [ ] **Step 3: 實作。** 照 Interfaces 寫 `cardActionRun.ts`、`ActionMenu`，再接進時間軸和候選。舊的 testid `item-delete`、`option-crown`，和「拿出來」相關的 e2e 改成新的流程。
- [ ] **Step 4: 跑測試，確認會過**：`npm test && npm run typecheck`；`t15m.spec.ts --project=desktop` 全部 PASS。
- [ ] **Step 5: Commit**：`web：⋯ 動作選單照 cardActions、撤下回候選、重疊卡的主要和拿出（T15m 第六輪）`

---

### Task 5: 網頁版：Google Map 文字、等待卡、移到第幾天的格子、紅字日期

**Files:**
- Modify: `web/src/components/LegRow.tsx`：`leg-maps` 的 🗺️ 改成文字按鈕「Google Map」
- Modify: `web/src/components/Timeline.tsx`：等待卡（約 608、645 行）改成純文字，沒有按鈕、不能展開；拿掉 `idle` 的「看附近」那一段和用到的 import
- Modify: `web/src/components/Planning.tsx`：`MoveDialog` 改成 4 欄 × 3 列的格子，現在那天灰掉、寫「現在」
- Modify: `web/src/components/TopBar.tsx`（日期列）、`web/src/components/DayPicker.tsx`（小月曆），還有整趟清單、其他畫日期的地方：用 `isRedDay` 加 class `red-day`；拿掉 `holiday` class
- Modify: `web/src/styles.css`
- Test: `web/e2e/t15m.spec.ts`

- [ ] **Step 1: 寫失敗的 e2e**（desktop）

```ts
test('交通卡是「Google Map」文字', async ({ page }) => { await expect(page.getByTestId('leg-maps').first()).toHaveText('Google Map'); });
test('等待卡不能點、沒有看附近', async ({ page }) => {
  // 2/3：wait-note 存在、裡面沒有 button；點它以後畫面上沒有「看附近」
  await expect(page.getByText('看附近')).toHaveCount(0);
});
test('移到第幾天：4×3 格子、紅字、沒有「假日」', async ({ page }) => {
  // 編輯 → ⋯ → 移到第幾天…：move-day 有 12 格；grid-template-columns 是 4 欄
  // 2/6、2/7、2/11、2/13 有 red-day；現在那天 disabled
  await expect(page.getByText('假日')).toHaveCount(0);
});
test('日期列：週六、週日、假日紅字', async ({ page }) => { /* day-tab 2/6、2/7、2/11、2/13 有 red-day，2/10 沒有 */ });
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 跑測試，確認會過**：`t15m.spec.ts --project=desktop` 全部 PASS，`npm run typecheck` 也要過。
- [ ] **Step 5: Commit**：`web：交通卡 Google Map 文字、等待卡不展開、移到第幾天 4×3、週末假日紅字（T15m 第六輪）`

---

### Task 6: 詳細資料裡的「問 AI」、聊天的草稿交接

**Files:**
- Create: `web/src/components/AskAiBox.tsx`：詳情裡那塊淡藍色的「✨ 問 AI 關於「名稱」」，網頁版和手機版都用它
- Modify: `web/src/uiStore.ts`：加 `chatDraft`、`askAboutPlace`
- Modify: `web/src/components/DetailPanel.tsx`：簡介下面放 `AskAiBox`。要知道詳情是不是從行程打開的，有現成的狀態就用，沒有就在打開詳情時記下來源
- Modify: `web/src/components/Panels.tsx`：`ChatPanel` 顯示 `chatDraft`，先畫成「我」的一則訊息，加一則佔位回覆「（T16 接上後回答）」
- Test: `web/test/store.test.ts`（或新的 `ui.test.ts`）、`web/e2e/t15m.spec.ts`

**Interfaces:**
- Consumes：Task 2 的 `askAiPrompts`。
- Produces：
  - `interface ChatDraft { seq: number; text: string; placeId: string | null; date: string | null; from: 'trip' | 'other' }`
  - `UiState.chatDraft: ChatDraft | null`
  - `askAboutPlace(placeId: string, text: string, from: 'trip' | 'other'): void`：
    - 寫入 `chatDraft`（seq 加 1，`date` 是 `appStore` 的 day，選「全部」時是 null）。
    - 同時呼叫現有的 `askAi(placeId)`，把地點放進選取。
    - 手機版要切到哪個畫面，由 Task 12 的手機 store 監聽 `chatDraft.seq` 決定。這裡不管畫面。
  - `<AskAiBox place fromTrip />`：testid 是 `ask-ai-box`；建議問題的 testid 是 `ask-ai-prompt`；輸入框 `ask-ai-input`，按 Enter 或 ➤ 送出，空白不送。

- [ ] **Step 1: 寫失敗的測試**

```ts
// 單元
test('askAboutPlace 寫 chatDraft、加進選取', () => {
  askAboutPlace('shima-yokoyama', '長輩走得上去嗎？', 'other');
  assert.equal(uiStore.getState().chatDraft?.text, '長輩走得上去嗎？');
  assert.ok(appStore.getState().selection.includes('shima-yokoyama'));
});
```

```ts
// e2e desktop
test('詳情的問 AI：點建議問題，聊天欄出現那句', async ({ page }) => {
  // 打開橫山展望台詳情 → ask-ai-box 有 4 個以上 ask-ai-prompt
  // 點第一個 → chat-panel 裡看得到同一句
});
test('從行程打開的詳情多「這天排它會不會太趕？」', async ({ page }) => { /* ... */ });
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 跑測試，確認會過**：`npm test`；`t15m.spec.ts --project=desktop` PASS。
- [ ] **Step 5: Commit**：`web：詳情的問 AI（建議問題、帶地點到聊天）（T15m 第六輪）`

---

### Task 7: 手機版的殼：底部分頁、我、地圖一直掛著、e2e 分開

**Files:**
- Create: `web/src/mobile/MobileApp.tsx`、`web/src/mobile/TabBar.tsx`、`web/src/mobile/MePage.tsx`、`web/src/mobile/mobileStore.ts`、`web/src/mobile/mobile.css`
- Modify: `web/src/App.tsx`：拿掉 `MobileLayout`，手機版改成 `<MobileApp />`
- Delete：`web/src/components/BottomSheet.tsx`，還有手機才用的 `TopBar`（網頁版的 `MapTopBar` 留著）；`styles.css` 裡 `.layout.mobile`、手機寬度 `@media` 的規則也刪掉。刪之前先 grep，確定沒有網頁版在用
- Modify: `web/src/store.ts`：網頁版用不到的話，拿掉 `sheet`、`setSheet`、`mode` 裡只有手機在用的值（真的拿不掉就留著，在註解寫明）
- Modify: `web/playwright.config.ts`：
  - mobile project 只跑 `mobile*.spec.ts`。
  - desktop project 跑其他的，不跑 `mobile*.spec.ts`。
  - 加一個 `mobile-small` project（360×800），一樣只跑 `mobile*.spec.ts`。
- Create: `web/e2e/mobile.spec.ts`、`web/e2e/mobileHelpers.ts`
- Modify: 現有 spec 裡給手機的分支（`isMobile`）：刪掉，那幾個 spec 從此只跑網頁版

**Interfaces:**
- Produces（`mobileStore.ts`，zustand vanilla，加上 hook `useMobile`）：
  - `type MobileTab = 'explore' | 'wish' | 'trip' | 'ai' | 'me'`
  - `type TripSnap = 'low' | 'mid' | 'high'`
  - `interface MobileState { tab: MobileTab; tripSnap: TripSnap; detail: { placeId: string; from: 'explore' | 'wish' | 'trip' | 'ai' } | null; chatSheet: boolean; focusItem: string | null; page: 'comments' | 'reservations' | null }`
  - `setTab(tab)`；`openPlace(placeId, from)` 會 push 一筆 history；`closePlace()`；`popstate` 時關掉詳情。
  - 預設 `tab: 'trip'`（打開網站先看行程；計畫的決定）。
- `MobileApp` 的結構：
  - `<div className="m-app">` 裡面依序是：分頁內容、一直掛著的 `<div className="m-map" hidden={tab !== 'trip'}><MapView /></div>`、`<TabBar />`（編輯中藏起來）、整頁的 `detail`、`<Dialogs />`、`<Toast />`。
  - 地圖藏起來時用 `visibility: hidden`，不要用 `display: none`；切回行程時呼叫 `map.resize()`。
- `TabBar`：testid 是 `m-tab-{tab}`，`aria-current` 表示選到的那個；想去的分頁顯示數字。
- `MePage`：
  - 帳號：用現有的 `MeMenu` 的內容。
  - 💬 討論、📋 預約：點了 `page` 設成那一個，整頁打開現有的留言、預約內容。可以重用 `MapPanel` 裡的內容元件；如果它們綁著地圖那側的版面，就先把內容抽出來。
  - ⬇ 下載。

- [ ] **Step 1: 寫失敗的 e2e**（`mobile.spec.ts`，mobile 和 mobile-small 兩個 project 都跑）

```ts
test('底部 5 個分頁，切換', async ({ page }) => {
  await ready(page);
  for (const t of ['explore', 'wish', 'trip', 'ai', 'me']) {
    await page.getByTestId(`m-tab-${t}`).click();
    await expect(page.getByTestId(`m-tab-${t}`)).toHaveAttribute('aria-current', 'page');
  }
});
test('每個分頁都沒有橫向捲動（360px）', async ({ page }) => {
  // 每個分頁都檢查 document.documentElement.scrollWidth <= innerWidth
});
test('分頁的點擊範圍至少 44px', async ({ page }) => { /* 每個 m-tab 的 boundingBox().height >= 44 */ });
test('我：討論、預約整頁打開', async ({ page }) => { /* m-me-comments → 看得到留言區 */ });
```

- [ ] **Step 2: 跑測試，確認會失敗**：`cd web && npx playwright test mobile.spec.ts`。預期：FAIL。
- [ ] **Step 3: 實作殼和 store，改 playwright 的設定，刪掉舊的手機版面。** 探索、想去、行程、AI 這四個分頁這時先放一個空的佔位元件，後面的任務再補。
- [ ] **Step 4: 跑測試，確認會過**：`mobile.spec.ts` PASS；`npx playwright test --project=desktop` 全部 PASS（網頁版沒壞）；`npm run typecheck`、`npm run build` 也要過。
- [ ] **Step 5: Commit**：`web：手機版的殼（底部分頁、我、地圖一直掛著）、e2e 分手機和電腦（T15m 第六輪）`

---

### Task 8: 手機版：探索圖片牆、想去

**Files:**
- Create: `web/src/mobile/ExploreFeed.tsx`、`web/src/mobile/FeedFilters.tsx`、`web/src/mobile/WishlistPage.tsx`、`web/src/mobile/Thumb.tsx`
- Modify: `web/src/components/Explore.tsx`、`Wishlist.tsx`：把清單的計算（排序、篩選、票數、候選 tag）抽成 hook，例如 `useExploreList(filter, query)`、`useWishList(type, area, sort)`。網頁版改成用這兩個 hook，畫出來的結果不能變
- Modify: `web/src/lib/explore.ts` 或 `filter.ts`：如果現在篩選一定要有地圖範圍，加一個不看範圍的版本
- Modify: `web/src/mobile/mobile.css`
- Test: `web/test/`（hook 背後的純函式）、`web/e2e/mobile.spec.ts`

**Interfaces:**
- Produces：
  - `<Thumb place size />`：有照片就用 `Photo`；沒有就是類型色塊加一個字，testid 是 `m-thumb-fallback`。行程卡（Task 10）也用它。
  - 探索的篩選放在 `mobileStore`：`feed: { type: 'all' | Place['type']; area: string | null; quick: string[]; sort: string; query: string }`。快速篩選晶片要用哪些欄位，對照 `FilterPanel` 現有的條件；找不到對應欄位的晶片就不做，在 commit 訊息寫明。
  - 圖片牆用 CSS columns 兩欄。每張是 testid `m-feed-item`；上面的 🤍／❤️、👎 用現有 `castVote`，點的時候不能開詳情（stopPropagation）。
  - 往下滑時，篩選列收成一行，黏在最上面（`position: sticky`）。
  - 想去：最上面是餐廳／住宿／景點的分段、地區、排序、大圖和清單兩種檢視，卡片的內容照網頁版。testid 是 `m-wish-item`。

- [ ] **Step 1: 寫失敗的 e2e**

```ts
test('探索：兩欄圖片牆、沒有地圖、可以按 ❤️ 不開詳情', async ({ page }) => {
  // m-tab-explore → m-feed-item 有 4 個以上；同一列兩張的 x 不同；地圖不可見
  // 點第一張的 ❤️ → 票數 +1，m-detail 沒有開
});
test('探索：類型篩選', async ({ page }) => { /* 點「餐廳」→ 每張都是餐 */ });
test('想去：分段切換、加到某天', async ({ page }) => { /* m-wish-item 有「加到某天」，點了開小月曆 */ });
test('沒有照片的點顯示類型色塊', async ({ page }) => { /* 先用 __th 把一個點的 photos 清空 → m-thumb-fallback 看得到 */ });
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。** 先把邏輯抽成 hook，跑 `--project=desktop` 確認網頁版沒變，再寫手機的畫面。
- [ ] **Step 4: 跑測試，確認會過**：`mobile.spec.ts` 和 `--project=desktop` 都 PASS。
- [ ] **Step 5: Commit**：`web：手機版探索圖片牆、想去（T15m 第六輪）`

---

### Task 9: 手機版：整頁詳情

**Files:**
- Create: `web/src/mobile/PlaceDetailPage.tsx`
- Modify: `web/src/components/DetailPanel.tsx`：分頁的內容（簡介、交通、評論、留言）抽成可以單獨 import 的元件，網頁版照樣用
- Test: `web/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes：Task 7 的 `openPlace`、`closePlace`；Task 6 的 `AskAiBox`；Task 8 的投票。
- 版面：
  - 最上面是大照片，可以左右滑（CSS scroll-snap），下面有小圓點。左上角「‹」的 testid 是 `m-detail-back`。
  - 照片下面依序是：名稱、日文名、★、地區；然後是大按鈕 ❤️、👎，從想去打開時多一個「📅 加到某天」；最後是分頁。
  - 交通分頁裡有一張靜態小地圖：用 MapLibre 另開一個小的、不能互動的地圖，或是畫一張圖，由實作的人決定。點小地圖：設 `tab: 'trip'`，`commands` 把地圖框住這個點，關掉詳情。
  - 返回：按「‹」或瀏覽器的上一頁，都回到原本的分頁，捲動位置不變。原本的分頁不要被卸載，用藏起來的方式保留。
  - 整頁的 testid 是 `m-detail`。

- [ ] **Step 1: 寫失敗的 e2e**

```ts
test('詳情：整頁、返回後捲動位置不變', async ({ page }) => {
  // 探索往下捲 800px → 點一張 → m-detail 可見 → m-detail-back → scrollTop 還是約 800
});
test('詳情：瀏覽器上一頁也能關', async ({ page }) => { /* page.goBack() → m-detail 不見 */ });
test('詳情：有問 AI、點小地圖跳到行程', async ({ page }) => { /* ask-ai-box 可見；交通分頁的小地圖 → m-tab-trip 選到、地圖可見 */ });
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 跑測試，確認會過**：`mobile.spec.ts`、`--project=desktop` PASS。
- [ ] **Step 5: Commit**：`web：手機版整頁詳情（照片輪播、投票、分頁、問 AI、小地圖）（T15m 第六輪）`

---

### Task 10: 手機版：行程（地圖＋面板、天數列、資料卡、點卡片找地圖、整趟）

**Files:**
- Create: `web/src/mobile/TripPage.tsx`、`web/src/mobile/DaySheet.tsx`、`web/src/mobile/DayStrip.tsx`、`web/src/mobile/MobileCard.tsx`、`web/src/mobile/MobileLeg.tsx`、`web/src/mobile/TripOverview.tsx`
- Modify: `web/src/components/Timeline.tsx`：把手機版也要用的資料準備（項目、等待說明、編號、候選）抽成 hook，例如 `useDayTimeline(date)`。網頁版改用它，畫面不變。`planView.ts` 裡已經有的純函式直接用
- Modify: `web/src/components/MapView.tsx`：手機版不出現地圖彈窗（popup）。點圖釘時改成呼叫 `focusItem`
- Modify: `web/src/mobile/mobileStore.ts`
- Test: `web/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes：Task 7 的 `mobileStore`（`tripSnap`、`focusItem`）；Task 8 的 `Thumb`；現有的 `commands`，用來移地圖、加亮點（`highlights`）、把路線變淡（照第五輪「點某段」的做法）。
- Produces：
  - `focusItem(itemId: string | null)`：設 `tripSnap: 'mid'`，地圖飛到那個點，圖釘放大、加黑框，這天其他路線變淡。如果有現成的 highlight style 就用，沒有就在 MapView 加一個 `focus` style。清單捲到那張卡。傳 `null` 就全部恢復。
  - 面板：
    - 三個高度都放在 CSS 變數，`low` 只露出天數列，`mid` 讓地圖佔上面約 1/3，`high` 讓地圖剩 48px。
    - 拖把手可以改高度，快速往上或往下滑也算切換。實際的手感由實作的人決定。
    - testid：面板是 `m-sheet`，把手是 `m-sheet-grab`；面板上用 `data-snap` 表示現在的高度。
  - `DayStrip`：
    - 第一格是「全部」，後面每天一格，testid 是 `m-day-{date}`。每格兩行：日期，下面是 `星期・第幾天`。週末、假日加 `red-day`。
    - 每格寬度至少 52px；選到的那格自己捲進畫面。
  - 這天的標題：`2/3（三）第 2 天`，右邊是 ✨（Task 12 才接上）和 `✏️ 編輯`（呼叫現有的進入編輯）。下面是摘要和時間條，時間條用現有元件，加一個手機用的 class 讓它變矮。
  - `MobileCard`：
    - 四欄：把手欄、54px 的 `Thumb`（左上角是編號圓）、內容、⋯ 欄（Task 11 才接上）。
    - 內容：時間（📌 放最前面）、停留時間、名稱（一行省略）、標籤、⚠ 數。
    - testid 是 `m-card`，用 `data-item` 放 itemId；被 focus 時加 `aria-current="true"`，多一行 testid 為 `m-card-detail` 的「詳細資料 ›」，點了 `openPlace(placeId, 'trip')`。
    - 宿的卡也用同一個元件；出發、回住宿兩張照第五輪的編號。
  - `MobileLeg`：
    - 一行，寫 `{圖示} {方式} {分鐘}・{距離}`，右邊是「Google Map」。
    - 大眾運輸點了展開步驟，排成一欄，可以重用 `LegRow` 裡畫步驟的元件；如果它綁著網頁版的版面，就先把步驟的部分抽出來。
    - 等待那一行接在交通下面，是純文字。
  - 候選放在時間軸下面，用 `MobileCard` 的候選樣式（虛線框、寫「加的人」）。
  - `TripOverview`：選「全部」時顯示，一天一列，testid 是 `m-overview-day`，點了選那天。地圖畫整趟（照第五輪）。
  - 地圖右上角是 💬、📋 兩個小圖示，點了打開 Task 7 的整頁；右下角的「⛶」把面板設成 `low`。

- [ ] **Step 1: 寫失敗的 e2e**

```ts
test('行程：天數列一整行、每格寬、紅字', async ({ page }) => { /* m-day-2027-02-03 寬 >= 52；m-day-2027-02-07 有 red-day */ });
test('行程：卡片有縮圖和編號', async ({ page }) => { /* 2/3 的 m-card 每張都有 img 或 m-thumb-fallback */ });
test('點卡片：面板到中間、地圖飛到那個點、不跳彈窗', async ({ page }) => {
  // 點橫山展望台的 m-card → m-sheet data-snap=mid；地圖中心離那個點的座標 < 300m
  // .maplibregl-popup 數量 0；m-card-detail 出現；點它 → m-detail 開，標題是橫山展望台
});
test('點地圖上的圖釘：清單捲到那張卡', async ({ page }) => { /* 用 centerOn + tapOrClick 點 La Mer 的圖釘 → 那張 m-card 有 aria-current */ });
test('全部：一天一列，點了跳到那天', async ({ page }) => { /* ... */ });
test('航班的日子（2/2）、空的日子能正常顯示', async ({ page }) => { /* m-day-2027-02-02 → 有 m-card、沒有錯誤 */ });
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。** 先把資料準備抽成 hook，跑 `--project=desktop` 確認網頁版沒變，再寫手機的畫面。
- [ ] **Step 4: 跑測試，確認會過**：`mobile.spec.ts`、`--project=desktop` PASS。
- [ ] **Step 5: Commit**：`web：手機版行程（地圖＋面板、天數列、縮圖卡片、點卡片找地圖、整趟）（T15m 第六輪）`

---

### Task 11: 手機版：編輯中（藍條、拖曳、底部動作面板）

**Files:**
- Create: `web/src/mobile/ActionSheet.tsx`、`web/src/mobile/TagSheet.tsx`、`web/src/mobile/MoveDaySheet.tsx`
- Modify: `web/src/mobile/TripPage.tsx`、`DaySheet.tsx`、`MobileCard.tsx`、`MobileLeg.tsx`
- Test: `web/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes：Task 2 的 `cardActions`（`surface: 'mobile'`）、`tagGroupsFor`、`toggleTag`、`LODGING_PLANS`；Task 4 的 `runCardAction`、`withdrawItem`；現有的編輯狀態（`planning`）、`planDrag.ts` 的長按拖曳；`usePlanningIdle`。
- 規則：
  - 編輯中：`tripSnap: 'high'`，面板最上面一條藍色的編輯條（「✏️ 編輯 2/3（三）」加「完成」）。編輯條用網頁版第五輪的元件，加手機用的 class。`TabBar` 藏起來。
  - `MobileCard` 在編輯中顯示把手 ⋮⋮ 和 ⋯，testid 是 `m-card-menu`。點 ⋯ 打開 `ActionSheet`。
  - `ActionSheet`：
    - 上方是暗的，testid `m-sheet-dim`；點暗處或往下拉就關。
    - 最上面一列是縮圖加名稱，下面每個動作一列，至少 44px，testid 是 `m-action-{id}`。
    - 子畫面（`tags`、`move`、`lodging-plan`、`stay`）在同一個面板裡換內容，左上角「‹」回到動作清單。
    - `stay` 子畫面是 −／＋，一次 15 分（照網頁版的步距），旁邊寫現在的停留時間。
  - `MoveDaySheet`：4 欄 × 3 列，現在那天 disabled，週末、假日紅字，testid 是 `m-move-{date}`。網頁版的格子如果可以直接重用就重用，只換外框。
  - 交通那一行在編輯中點了，展開改方式、選班次。這部分重用第五輪的編輯元件，排成一欄。

- [ ] **Step 1: 寫失敗的 e2e**

```ts
test('編輯：藍條、分頁藏起來、⋯ 開底部面板', async ({ page }) => {
  // 2/3 → ✏️ 編輯 → m-tab-trip 看不到；m-card-menu 在橫山展望台 → m-action-withdraw 可見、m-action-delete 沒有
  // 每個 m-action-* 高度 >= 44；點 m-sheet-dim 關
});
test('編輯：標籤子畫面多選', async ({ page }) => { /* m-action-tags → tag-opt-lunch、tag-opt-breakfast → 卡上兩個 → ‹ 回清單 */ });
test('編輯：移到第幾天', async ({ page }) => { /* m-action-move → m-move-2027-02-04 → 2/3 少一張，toast */ });
test('編輯：完成以後分頁回來', async ({ page }) => { /* 完成 → m-tab-trip 可見 */ });
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 跑測試，確認會過**：`mobile.spec.ts`、`--project=desktop` PASS。
- [ ] **Step 5: Commit**：`web：手機版編輯（藍條、長按拖曳、底部動作面板、標籤、移天）（T15m 第六輪）`

---

### Task 12: 手機版：AI 分頁、行程頁的半屏聊天

**Files:**
- Create: `web/src/mobile/ChatView.tsx`、`web/src/mobile/ChatPage.tsx`、`web/src/mobile/ChatSheet.tsx`、`web/src/mobile/chatDemo.ts`
- Modify: `web/src/mobile/mobileStore.ts`、`TripPage.tsx`（✨ 按鈕）
- Test: `web/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes：Task 6 的 `chatDraft`、`askAboutPlace`；Task 7 的 `mobileStore`；現有的 `appStore.selection`、`commands`（T12 的提議 `proposal`、路線）。
- Produces：
  - `ChatView`：AI 分頁和半屏聊天共用。
    - 上面是訊息列表，下面是輸入框；輸入框上面是上下文小標，testid `m-chat-context`。小標的字：有 `chatDraft.placeId` 時寫「📍 關於：{名稱}」，否則寫「📍 正在看：{這天}」。✕ 會清掉 `chatDraft` 的上下文。
    - 送出時只把「我」的訊息加進一份放在記憶體的對話清單（`chatDemo.ts`），再加一則佔位回覆「（T16 接上後回答）」。
  - `chatDemo.ts`：
    - 預設有兩則假訊息，一則有照片卡輪播（3 個真的餐廳 id，照片卡上有 ❤️ 和「詳情」），一則是提議卡，對 2/5 的提議放一筆加、一筆減。
    - 提議卡上的按鈕：「🗺 在行程上看」→ 用 `commands` 把提議畫到地圖上（T12 的 `proposal`），並且 `tab: 'trip'`、`chatSheet: true`。「套用」、「不要」先只跳 toast「（T16 接上）」。
  - `ChatSheet`：
    - 在行程分頁裡，聊天從下面升到螢幕高度的 55%，上面還看得到地圖。
    - 往上拉就是 `tab: 'ai'`，同一份對話；✕ 關掉，testid `m-chat-sheet-close`。
    - 面板的 testid 是 `m-chat-sheet`。
  - 監聽 `chatDraft.seq`：`from === 'trip'` 就設 `tab: 'trip'`、`chatSheet: true`；不是的話設 `tab: 'ai'`。不管哪一種都要關掉詳情。

- [ ] **Step 1: 寫失敗的 e2e**

```ts
test('AI 分頁：假訊息有照片卡和提議卡', async ({ page }) => { /* m-tab-ai → m-chat-place 至少 3 張、m-chat-proposal 可見 */ });
test('行程頁 ✨：半屏聊天、上面看得到地圖', async ({ page }) => {
  // m-trip-ai → m-chat-sheet 可見、高度約為視窗的 55%；地圖可見；m-chat-sheet-close → 不見
});
test('提議的「在行程上看」：切到行程、半屏、地圖有提議', async ({ page }) => { /* appStore.proposal 不是 null */ });
test('探索詳情的問 AI → AI 分頁；行程詳情的問 AI → 半屏', async ({ page }) => {
  // 探索 → 詳情 → ask-ai-prompt → m-tab-ai 選到，m-chat-context 寫「關於：…」
  // 行程 → 點卡 → 詳細資料 → ask-ai-prompt → m-chat-sheet 可見
});
```

- [ ] **Step 2: 跑測試，確認會失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 跑測試，確認會過**：`mobile.spec.ts`、`--project=desktop` PASS。
- [ ] **Step 5: Commit**：`web：手機版 AI 分頁和行程頁的半屏聊天（佔位對話）（T15m 第六輪）`

---

### Task 13: 截圖、文件、全部驗證

**Files:**
- Create: `web/e2e/shots-round6.mjs`：照 `shots-round5.mjs` 的寫法。存到 `data/cache/work/t15m-round6/`，網頁版（1280×800）、手機版（390×844）各拍一組：
  - 網頁版：標籤彈窗、⋯ 選單、重疊卡選單、移到第幾天、詳情的問 AI。
  - 手機版：探索、詳情、想去、行程（中間高度）、點卡片、編輯的動作面板、AI 分頁、半屏聊天、整趟。
- Modify: `web/README.md`：手機版的結構、`mobile/`、`shared/`
- Modify: `docs/architecture.md` §2：手機版的殼、`mobileStore`、`uiStore.chatDraft`、`shared/` 的用途
- Modify: 設計文件最上面加一行「> **已實作**（計畫：`docs/superpowers/plans/2026-10-25-itinerary-round6-mobile.md`）。」

- [ ] **Step 1: 跑全部的驗證**：`npm test && npm run typecheck && npm run validate && npm run build && cd web && npx playwright test`。預期：全部 PASS（三個 project）。
- [ ] **Step 2: 拍截圖**：`node web/e2e/shots-round6.mjs`，再一張一張打開看：沒有被蓋住、沒有跑版、沒有橫向捲動。看到問題就回去修，修完再拍。
- [ ] **Step 3: 更新文件。**
- [ ] **Step 4: Commit**：`T15m 第六輪：截圖、文件`
