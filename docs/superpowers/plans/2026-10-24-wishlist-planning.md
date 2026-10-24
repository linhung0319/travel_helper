# 想去清單、規劃模式、時間軸改版：實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「寫建議」和「❤️ 喜歡」合成「❤️ 想去」，加上想去清單（地點＋留言）、搜尋、規劃模式的上下分割版面、卡片式時間軸和自動緩衝。

**Architecture:** 引擎（`packages/engine`）加緩衝和「最順路的插入位置」；假後端把建議換成「投票加希望日期＋留言＋心願」；`web/src/lib/wishlist.ts` 用投票、留言、行程算出想去清單（純函式），畫面只負責呈現。搜尋放在 appStore 的 `query`，不放進 `Filter`（T12 的 `setFilter` 指令維持陣列格式）。

**Tech Stack:** TypeScript、React 19、Zustand vanilla、MapLibre、node:test（`npm test`）、Playwright（`npm run e2e -w web`）。

**Spec:** `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md`

## Global Constraints

- 所有路徑在 worktree `D:\workspace\travel_helper-t15m`（分支 `t15m`）。
- 文件、註解、commit 訊息用繁體中文；commit 結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。
- **commit 前要問 👤**（CLAUDE.md）：每個任務的 commit 步驟先累積，等 👤 說 commit 再做；`npm run validate`、`npm run typecheck`、`npm test` 要過。
- 不改 `worker/`（留給 T15）；AI 的改動留給 T16m。
- 緩衝預設值：全員每段交通 +10 分、分組每段 +5 分。
- 想去清單一次先顯示 20 筆；停留時間每次 ±15 分。
- 電腦版判斷用 `DESKTOP_QUERY`（`web/src/hooks.ts`，900px）。
- 程式風格照現有檔案：檔頭一段中文註解說明用途、函式上方一行 `/** */`。

## Review Focus

1. **同一個人對同一點先 👎 再 ❤️**：要變成 ❤️（一人一點只有一個狀態），清單人數不能重複算 → Task 3 測試。
2. **取消 ❤️ 後希望日期要一起清掉**，再按 ❤️ 不能帶回舊日期 → Task 3 測試。
3. **點已經排進行程又從行程刪掉**：只要還有人 ❤️ 就回到清單 → Task 4 測試。
4. **分組的日子按「＋ 排進」**：不能插進分組裡，也不能插在抵達航班之前、出發航班之後 → Task 2 測試。
5. **晚餐空檔和回住宿的順序**：時間不能倒流（17:30 晚餐不能排在 16:02 回住宿前面）→ Task 9 測試。

---

### Task 1: 引擎的緩衝時間

**Files:**
- Modify: `packages/engine/src/config.ts`（`EngineConfig` 加 `buffer`，`DEFAULT_CONFIG` 加值）
- Modify: `packages/engine/src/types.ts:197`（`Leg` 加 `bufferMinutes`）
- Modify: `packages/engine/src/timeline.ts:79`（`travelTo`）
- Test: `packages/engine/test/timeline.test.ts`

**Interfaces:**
- Produces: `EngineConfig['buffer'] = { whole: number; group: number }`，預設 `{ whole: 10, group: 5 }`；`Leg.bufferMinutes: number`（`leg.minutes` 仍是純交通，`leg.arrive` 已含緩衝）。

- [ ] **Step 1: 寫失敗的測試**：`test('每段交通加緩衝：全員 10 分、分組 5 分')`，用現有 fixtures 排一天兩個點（全員），斷言第二個點的 `travel.bufferMinutes === 10`、`toMinutes(entry.arrive) === toMinutes(travel.depart) + travel.minutes + 10`；同一天改成分組裡的兩個點，斷言 `bufferMinutes === 5`；`planItinerary(it, data, { buffer: { whole: 0 } })` 時是 0。另一個測試：同一個點連續兩項（`mode: 'none'` 或 `minutes === 0`）不加緩衝。
- [ ] **Step 2: 跑 `npm test` 確認失敗**（`bufferMinutes` 是 undefined）。
- [ ] **Step 3: 實作**：`travelTo` 在 `planLeg` 之後，`leg.mode !== 'none' && leg.minutes > 0` 時 `bufferMinutes = ctx.whole ? cfg.buffer.whole : cfg.buffer.group`，把 `leg.arrive` 往後推；其他情況 `bufferMinutes = 0`。`travel.ts` 的 `leg()` 產生時先給 `bufferMinutes: 0`。
- [ ] **Step 4: 跑 `npm test`，全部通過**（其他既有測試的時間會變，逐一確認是緩衝造成的再更新期望值）。
- [ ] **Step 5: 累積 commit**：`引擎：每段交通自動加緩衝（全員 10 分、分組 5 分）`

### Task 2: 引擎的「最順路的插入位置」

**Files:**
- Create: `packages/engine/src/insert.ts`；`packages/engine/src/index.ts` 加 export
- Test: `packages/engine/test/insert.test.ts`

**Interfaces:**
- Produces: `bestInsertIndex(it: Itinerary, date: DateString, item: NewItem, data: EngineData, override?: ConfigOverride | EngineConfig): number` — 回傳 `addItem(it, date, item, { index })` 要用的 index。

- [ ] **Step 1: 寫失敗的測試**（`insert.test.ts`）：
  - `test('插在交通增加最少的位置')`：一天排 A（西）、C（東），新點 B 在兩者中間，期望 index 1。
  - `test('不插進分組、不插在抵達航班之前、出發航班之後')`：一天有抵達航班、split、出發航班，期望 index 介於抵達航班之後、出發航班之前，且 `day.items[index-1]`、`day.items[index]` 不是在 split 的 groups 裡（只回傳頂層 index）。
  - `test('空的一天回傳 0')`。
- [ ] **Step 2: 跑 `npm test` 確認失敗**（找不到模組）。
- [ ] **Step 3: 實作**：候選位置＝頂層 items 的每個縫隙，排除抵達航班之前和出發航班之後；每個候選用 `addItem` 插入後 `planDay`，算整天所有 `travel.minutes + bufferMinutes` 的總和（含分組裡的），取最小；平手取較後面的位置。
- [ ] **Step 4: 跑 `npm test`，通過。**
- [ ] **Step 5: 累積 commit**：`引擎：bestInsertIndex（插在最順路的位置）`

### Task 3: 假後端：投票加希望日期、留言、心願，拿掉建議

**Files:**
- Modify: `web/src/backend/types.ts`、`web/src/backend/mock.ts`、`web/src/backend/index.ts`（offline 版本）
- Modify: `web/src/dev-fixtures/seed.ts`（舊建議轉成 ❤️＋留言＋心願）
- Test: `web/test/mockBackend.test.ts`

**Interfaces:**
- Produces（`types.ts`）：
  ```ts
  export interface Vote { placeId: string; memberId: string; value: VoteValue; /** 希望哪天（只有 ❤️ 有） */ day: string | null; updatedAt: string; deletedAt: string | null }
  export type CommentKind = 'normal' | 'planner' | 'decline';
  /** target：地點 ID，或心願 `wish:<id>` */
  export interface Comment { id: number; target: string; text: string; kind: CommentKind; author: string; createdAt: string; updatedAt: string; deletedAt: string | null }
  export interface Wish { id: number; text: string; author: string; createdAt: string; updatedAt: string; deletedAt: string | null }
  export const wishTarget = (id: number) => `wish:${id}`;
  ```
  `Backend`：`putVote(placeId, value, day?: string | null)`、`deleteVote(placeId)`；`listComments()`、`createComment({ target, text, kind })`、`updateComment(id, text)`（只有作者，403）、`deleteComment(id)`（只有作者，403）；`listWishes()`、`createWish(text)`、`updateWish(id, text)`、`deleteWish(id)`（只有作者）。心願的 ❤️ 用 `putVote(wishTarget(id), 'like')`。`SyncState` 的 `suggestions` 換成 `comments`、`wishes`。拿掉 `Suggestion`、`SuggestionStatus` 和建議的 API。
- `day` 只接受 trip 日期（`2027-02-02`～`2027-02-13`）或 null；👎 時一律存 null；`text` 上限 500 字。

- [ ] **Step 1: 寫失敗的測試**：
  - `test('一人一點只有一個狀態：先 👎 再 ❤️ 變成 ❤️')`：`listVotes()` 這個人這個點只有一筆、`value === 'like'`。
  - `test('取消 ❤️ 後希望日期清掉')`：`putVote('x','like','2027-02-05')` → `deleteVote('x')` → `putVote('x','like')`，`day === null`。
  - `test('👎 不記希望日期')`：`putVote('x','dislike','2027-02-05')` 存成 `day === null`。
  - `test('留言只有作者能改、能刪')`：換人後 `updateComment`、`deleteComment` 丟 403。
  - `test('心願只有作者能刪；心願可以按 ❤️')`。
  - `test('不合法的日期 400')`：`putVote('x','like','2027-03-01')`。
- [ ] **Step 2: 跑 `npm test` 確認失敗。**
- [ ] **Step 3: 實作 types、mock、offline、seed**（seed 裡原本「整趟」的純文字建議變心願；有地點的建議變成作者的 ❤️（day 用原本的日期）＋一則留言（原本的文字）；已不採用的加一則 `kind: 'decline'` 留言）。
- [ ] **Step 4: 跑 `npm test`，`mockBackend.test.ts` 通過**（`sharedStore.test.ts` 會壞，Task 4 修）。
- [ ] **Step 5: 累積 commit**：`web：假後端改成 ❤️ 加希望日期、留言、心願（拿掉建議）`

### Task 4: 共用資料和想去清單的計算

**Files:**
- Modify: `web/src/sharedStore.ts`（拿掉建議相關；加留言、心願）
- Create: `web/src/lib/wishlist.ts`
- Test: `web/test/sharedStore.test.ts`、新增 `web/test/wishlist.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `Vote`、`Comment`、`Wish`、`wishTarget`。
- Produces（`sharedStore`）：`SharedState` 加 `comments: Comment[]`、`wishes: Wish[]`，拿掉 `suggestions`；動作 `vote(placeId, value: VoteValue | null, day?: string | null)`、`setHopeDay(placeId, day: string | null)`（自己的 ❤️ 改日期）、`comment(target, text, kind?)`、`editComment(id, text)`、`deleteComment(id)`、`decline(placeId, reason)`（建一則 `kind: 'decline'` 留言）、`createWish(text)`、`deleteWish(id)`。拿掉 `createSuggestion`…`adoptSuggestion`、`suggestionCounts`、`pendingCount`。
- Produces（`lib/wishlist.ts`）：
  ```ts
  export interface WishEntry { placeId: string; likes: string[]; dislikes: string[]; hopeDays: { day: string; count: number }[]; comments: Comment[]; declined: boolean; firstLikedAt: string }
  export function wishEntries(votes: Vote[], comments: Comment[], scheduled: Set<string>): WishEntry[]
  export function scheduledPlaces(it: Itinerary | null): Map<string, { date: string; backup: boolean }>  // 主選、備選、分組、住宿
  export function sortWishes(list: WishEntry[], day: string | null, tierOf: (id: string) => Tier | null): WishEntry[]
  ```
  `declined`＝有 `decline` 留言，而且最後一則 decline 留言之後沒有新的 ❤️（比 `updatedAt`）。排序：`hopeDays` 含 `day` 的 → 沒被不採用的 → `likes - dislikes` 多的 → S、A、B → `firstLikedAt` 早的。

- [ ] **Step 1: 寫失敗的測試**（`wishlist.test.ts`）：
  - `test('只有 ❤️ 的點進清單，只有 👎 的不進')`。
  - `test('排進行程的點不在清單；刪掉後還有 ❤️ 就回來')`：`scheduled` 有 x 時沒有 x，拿掉後有。
  - `test('scheduledPlaces 算主選、備選、分組、住宿')`。
  - `test('不採用：變灰排最後；之後有人再按 ❤️ 就取消')`。
  - `test('排序：希望這天的優先，再看 ❤️ 減 👎、等級')`。
  - `sharedStore.test.ts` 把建議相關的測試換成：`test('decline 建一則不採用留言')`、`test('vote 帶希望日期')`。
- [ ] **Step 2: 跑 `npm test` 確認失敗。**
- [ ] **Step 3: 實作 `lib/wishlist.ts` 和 sharedStore 的改動**（`syncOnce` 依 `comments`、`wishes` 重抓）。
- [ ] **Step 4: 跑 `npm test`，通過；`npm run typecheck` 會因為畫面還在用建議而失敗，Task 6 修。**
- [ ] **Step 5: 累積 commit**：`web：想去清單的計算（wishlist.ts）、共用資料加留言和心願`

### Task 5: 搜尋

**Files:**
- Modify: `web/src/store.ts`（`AppState.query: string`、`setQuery(q)`）
- Modify: `web/src/lib/filter.ts`（`matchesQuery`）
- Modify: `web/src/lib/visual.ts`、`web/src/lib/explore.ts`、`web/src/components/TopBar.tsx`（地圖、探索的數字跟著搜尋）
- Modify: `web/src/components/Explore.tsx`（搜尋欄）
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Produces: `matchesQuery(p: Place, q: string): boolean` — 空字串永遠 true；比對 `name.zh`、`name.ja`、`name.kana`、`name.en`，不分大小寫、去掉空白，全形半形英數視為相同（`normalize('NFKC')`）。`appStore.getState().query`、`setQuery(q: string)`。`Filter` 和 `commands.setFilter` 不變。
- 搜尋欄元件：`<SearchBox />`（`web/src/components/SearchBox.tsx`，`data-testid="search"`，`type="search"`，有 ✕ 清除），探索和想去清單共用。

- [ ] **Step 1: 寫失敗的測試**：`test('matchesQuery：中文、日文、假名、英文，全形半形相同')`。
- [ ] **Step 2: 跑 `npm test` 確認失敗。**
- [ ] **Step 3: 實作**；`Explore.tsx` 的 `controls` 最前面放 `<SearchBox />`（收合列 `.ex-compact` 也有），列表、地圖、數字用 `matchesFilter && matchesQuery`。
- [ ] **Step 4: `npm test` 通過；手動在 dev server 打「水族」，探索和地圖只剩水族館。**
- [ ] **Step 5: 累積 commit**：`web：探索加搜尋欄`

### Task 6: ❤️ 就是想去；拿掉建議的畫面

**Files:**
- Modify: `web/src/components/Votes.tsx`（`VoteButtons` 按 ❤️ 後冒出希望日期）
- Delete: `web/src/components/Suggestions.tsx`
- Modify: `web/src/components/Dialogs.tsx`、`web/src/uiStore.ts`（拿掉 suggest、adopt、decline、pending 對話框）
- Modify: `web/src/components/DetailPanel.tsx`（拿掉「寫建議」；顯示「已排 2/7」／「備選 2/5」）
- Modify: `web/src/components/DayPanel.tsx`（拿掉「寫建議」和建議區，先留空位給 Task 7）
- Modify: `web/src/components/Planning.tsx`、`TopBar.tsx`（拿掉 `PendingBadge`）
- Modify: `web/src/lib/overlays.ts`、`MapView.tsx`（拿掉地圖上的 💬 建議數）
- Modify: `web/src/components/Timeline.tsx`（`GapRow` 的「寫建議」拿掉）

**Interfaces:**
- Consumes: Task 4 的 `vote`、`setHopeDay`、`scheduledPlaces`。
- Produces: `<HopeDayPicker placeId />`（`Votes.tsx` 內）：按 ❤️ 後在按鈕旁冒出一排日期小標籤（2/2～2/13 和「哪天都可以」），選了呼叫 `setHopeDay`，3 秒沒動作收起來；`data-testid="hope-day"`。

- [ ] **Step 1: 實作上面的改動**，`npm run typecheck` 通過。
- [ ] **Step 2: `npm test` 通過。**
- [ ] **Step 3: dev server 手動確認**：探索卡片按 ❤️ → 出現日期標籤 → 選 2/5 → 詳情的 ❤️ 是亮的；排進行程的點詳情有「已排」。
- [ ] **Step 4: 累積 commit**：`web：❤️ 就是想去（選希望日期），拿掉寫建議`

### Task 7: 想去清單的畫面

**Files:**
- Create: `web/src/components/Wishlist.tsx`
- Modify: `web/src/components/DayPanel.tsx`（一般模式：行程下面一個收起來的「想去的（N）」；`day === 'all'` 時也顯示）
- Modify: `web/src/components/Explore.tsx`（把地區、小區域、快速篩選、搜尋那一組抽成 `ExploreFilters`，給想去清單用）
- Modify: `web/src/components/BottomSheet.tsx`（手機：行程分頁裡分「行程｜想去 N」）
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `wishEntries`、`sortWishes`、`scheduledPlaces`（Task 4）；`matchesFilter`、`matchesQuery`（Task 5）；`bestInsertIndex`（Task 2）。
- Produces: `<Wishlist mode="normal" | "planning" />`；每筆 `data-testid="wish-item"`、`data-id`；`<WishRow entry />` 裡：名稱、等級、類型・地區、❤️ 頭像列、👎 數、希望日期標籤（和正在看的日子不同時灰）、`💬 N 則留言 ▾`（`data-testid="wish-comments"`）、留言輸入框、規劃模式下的「＋ 排進」（`data-testid="wish-add"`）和「⋯ → 不採用」（必填理由）。`export function addWishToDay(placeId: string, date: string): Promise<Result>`：住宿 → 先確認再 `setLodging`；其他 → `bestInsertIndex` + `addItem`（`proposedBy` 帶 ❤️ 的人）。
- 點一筆：`commands.focus(id)` + `openPreview(id)`（同時間軸）；電腦版滑鼠移上去 `hover(id)`。
- 規劃模式下留的留言 `kind: 'planner'`，顯示〔規劃〕；`decline` 留言顯示〔不採用〕，作者刪掉就取消不採用。
- 地圖上 ❤️ 數字的標記沿用現有的（一般模式也有），不另做。使用者自己加的點（interaction-design §8）還沒做，不處理。
- 清單：先 20 筆，「看全部（N）」展開；選「全部地區」時依大區分組（可收起），「心願」固定在最上面（純文字貼文，有 ❤️ 和留言，作者能刪，`data-testid="wish-text"`）。

- [ ] **Step 1: 實作 `Wishlist.tsx`、抽出 `ExploreFilters`、DayPanel 和 BottomSheet 的改動。**
- [ ] **Step 2: `npm run typecheck`、`npm test` 通過。**
- [ ] **Step 3: dev server 手動確認**：清單只出現有 ❤️ 的點；篩「鳥羽」只剩鳥羽；留言收合／展開；點一筆地圖跳過去並出現小卡片；規劃模式「＋ 排進」後那筆從清單消失、出現在時間軸。
- [ ] **Step 4: 累積 commit**：`web：想去清單（地點＋留言、篩選、排進行程）`

### Task 8: 規劃模式移到「行程」分頁；電腦版右欄上下分割

**Files:**
- Modify: `web/src/components/Planning.tsx`（`PlanningToggle` 改成放在行程分頁的標題列）、`TopBar.tsx`（地圖上方拿掉規劃模式按鈕；`PlanningBar` 保留在地圖上方顯示「規劃模式中」）
- Modify: `web/src/components/SidePanel.tsx`、`web/src/App.tsx`、`web/src/styles.css`

**Interfaces:**
- Consumes: Task 7 的 `<Wishlist mode="planning" />`。
- Produces: 規劃模式且在行程分頁時（電腦版），右欄是 `.side-split`：上 `<DayPanel />`（`data-testid="split-day"`），下 `<Wishlist mode="planning" />`（`data-testid="split-wishlist"`）；中間 `.split-handle`（`data-testid="split-handle"`，pointer 拖曳調整比例，限制 20%～80%，預設 60/40；比例記在 localStorage，讀寫包 try/catch）；想去清單標題列有收起／展開（收起時只剩標題列，行程佔滿）。聊天欄、地圖不變。

- [ ] **Step 1: 實作。**
- [ ] **Step 2: `npm run typecheck` 通過；dev server 在 1280×800 和 1600×900 各看一次**：聊天、地圖不變；右欄上面行程、下面想去清單，拖分隔線可以調高低，收起想去清單後行程佔滿。
- [ ] **Step 3: 累積 commit**：`web：規劃模式放進行程分頁，電腦版改成右欄上下分割（行程／想去清單）`

### Task 9: 時間軸改版

**Files:**
- Modify: `web/src/lib/planView.ts`（`timelineRows` 修晚餐順序；新增 `dayBar`、`daySummary`）
- Modify: `web/src/components/Timeline.tsx`、`web/src/components/DayPanel.tsx`、`web/src/styles.css`
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Leg.bufferMinutes`。
- Produces:
  - `dayBar(plan: DayPlan): { kind: 'visit' | 'travel' | 'idle' | 'meal'; from: string; to: string; itemId: string | null; lane: number }[]` — 從出發到回住宿，分組的時段每組一個 `lane`（0 是全員）。
  - `daySummary(plan: DayPlan): { start: string | null; back: string | null; travelMinutes: number; warnings: number }`（`travelMinutes` 含緩衝；`warnings` 不算 info）。
  - `formatStay(minutes: number): string` — `150 → '2.5 小時'`、`45 → '45 分'`、`60 → '1 小時'`。
- 卡片：開始時間大字（`.tl-start-time`）、名稱、停留標籤（`data-testid="stay-chip"`，規劃模式點了出現 −15／＋15，呼叫 `setStay`）、固定時間 📌（規劃模式點開始時間切換，呼叫 `setStart(itemId, entry.start)` 或 `setStart(itemId, null)`）、⚠ 數字（`data-testid="warn-toggle"`，點了展開警告）。交通列：`🚕 39 分＋緩衝 10 分・大型 2 台`。

- [ ] **Step 1: 寫失敗的測試**：
  - `test('timelineRows：晚餐空檔在回住宿之後')`：一天 16:02 回住宿、晚餐空檔 from 17:30，rows 裡 lodging 的 index < dinner gap 的 index。
  - `test('dayBar：分組時段分 lane')`、`test('daySummary 的交通含緩衝')`、`test('formatStay')`。
- [ ] **Step 2: 跑 `npm test` 確認失敗。**
- [ ] **Step 3: 實作 planView 的函式，再改 Timeline 的畫面**（`DayPanel` 標題改成 `daySummary` 的一行，比例橫條放在標題下，點一段捲到那張卡片）。
- [ ] **Step 4: `npm test`、`npm run typecheck` 通過；dev server 看 2/5：卡片、緩衝、橫條、晚餐在回住宿之後。**
- [ ] **Step 5: 累積 commit**：`web：時間軸改成卡片（停留時間、緩衝、比例橫條、警告收起來）`

### Task 10: 拖曳換順序、從想去清單拖進時間軸

**Files:**
- Create: `web/src/components/planDrag.ts`
- Modify: `web/src/components/Timeline.tsx`（把手、放開的位置線）、`Wishlist.tsx`（電腦版可拖）、`Timeline.tsx` 的 `ItemMenu`（拿掉上移、下移；分組日子加「移到某一組」）
- Modify: `packages/engine/src/ops.ts`（`moveItemTo(it, itemId, date, index, split?: { id: string; group: string })`，可以移進或移出分組）
- Test: `packages/engine/test/ops.test.ts`

**Interfaces:**
- Produces: `moveItemTo(it: Itinerary, itemId: string, date: DateString, index: number, split?: { id: string; group: string }): Itinerary`；`planDrag.ts` 的 `itemDragProps(itemId)`、`wishDragProps(placeId)`、`dropSlotProps(date, index, split?)`（MIME `application/x-travel-item`、`application/x-travel-wish`；放開時呼叫 `moveItemTo` 或 `addItem` 經過 `shared.changeItinerary`）。手機：時間軸項目長按 400ms 進入拖曳（pointer events），拖到哪個縫隙就放哪裡；想去清單在手機不能拖。
- 和 `askAi.ts` 的拖到聊天室並存：想去清單、時間軸的項目也能拖到聊天室（`setData` 同時放 `application/x-travel-place`）。

- [ ] **Step 1: 寫失敗的測試**：`test('moveItemTo：同一天換位置、移到別天、移進分組、移出分組')`。
- [ ] **Step 2: 跑 `npm test` 確認失敗。**
- [ ] **Step 3: 實作 `moveItemTo`，再做 `planDrag.ts` 和畫面。**
- [ ] **Step 4: `npm test`、`npm run typecheck` 通過；dev server 電腦版拖一次換順序、從清單拖一個點進去。**
- [ ] **Step 5: 累積 commit**：`web：規劃模式拖曳換順序、從想去清單拖進時間軸`

### Task 11: e2e 和截圖

**Files:**
- Modify: `web/e2e/t15m.spec.ts`、`flows.spec.ts`、`commands.spec.ts`（建議相關的流程換成想去清單）
- Modify: `web/e2e/shots-layout.mjs`（加：一般模式的想去清單、規劃模式的上下分割、新時間軸、手機的「行程｜想去」）

- [ ] **Step 1: 改 e2e**：
  - 「想去」：探索卡片按 ❤️ → 選 2/5 → 行程分頁的想去清單出現那一筆、希望 2/5。
  - 「留言」：展開留言、留一則、收起來顯示「💬 1 則留言」。
  - 「排進行程」：進規劃模式 → 「＋ 排進」→ 時間軸多一張卡片、清單少一筆 → 快照可以復原。
  - 「不採用」：寫理由後那筆變灰。
  - 「搜尋」：打「水族」只剩一張卡片。
  - 「停留時間」：規劃模式 ＋15 後下一張卡片的開始時間晚 15 分。
  - 電腦版「拖曳」：時間軸第 2 張拖到第 1 張前面，順序換了。
- [ ] **Step 2: 跑 `npm run e2e -w web`，手機和電腦都通過。**
- [ ] **Step 3: 跑截圖腳本，給 👤 看。**
- [ ] **Step 4: 累積 commit**：`web：e2e 和截圖換成想去清單、新時間軸`

### Task 12: 文件

**Files:**
- Modify: `docs/interaction-design.md`（§3 這一天的面板、§4 詳情的按鈕、§6 改成想去清單和規劃模式、§9 ❤️ 就是想去；§10 對應任務）
- Modify: `docs/architecture.md`（§2 的 store、假後端介面；引擎的緩衝和 `bestInsertIndex`、`moveItemTo`）
- Modify: `web/README.md`
- Modify: `docs/PLAN.md`（T15 任務卡註明：worker 的建議 API 和 D1 要改成投票希望日期、留言、心願；T16m 註明 AI 改成按 ❤️、留言）
- Modify: `docs/CONVENTIONS.md`（若「行程」一節提到建議或引擎設定，同步緩衝）

- [ ] **Step 1: 改文件**；設計文件 `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md` 開頭註明「已寫進 interaction-design」。
- [ ] **Step 2: `npm run validate` 通過。**
- [ ] **Step 3: 累積 commit**：`文件：想去清單、規劃模式、時間軸改版（interaction-design、architecture、PLAN）`
