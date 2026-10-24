# 行程分頁精簡、預約筆記、多點卡片、交通設定：實作計畫（T15m 第三輪）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 行程分頁只留「這一天」；留言、預約、匯出搬到地圖的日期列；預約變成共用筆記；一張卡片可以放好幾個點和用餐／吃法的 tag；交通可以點開來看轉乘、在規劃模式改；地圖上的行程沿道路畫。

**Architecture:** 引擎（`packages/engine`）只加可以省略的欄位和幾個操作（`setLegTravel`、`setMeal`、`setDining`），不再產生用餐空檔；假後端加 `Reservation` 和整趟留言；畫面上的整理邏輯放在 `web/src/lib/` 的純函式（有單元測試），元件只負責呈現。地圖上的單段高亮重用 T12 的 `drawRoute`、`highlight` 指令。

**Tech Stack:** TypeScript、React 19、Zustand vanilla、MapLibre、node:test（`npm test`）、Playwright（`npm run e2e`）。

**Spec:** `docs/superpowers/specs/2026-10-24-itinerary-tab-round3-design.md`（接在 `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md` 後面，衝突以第三輪為準）

## Global Constraints

- 所有路徑在 worktree `D:\workspace\travel_helper-t15m`（分支 `t15m`），指令在這個目錄的根跑。
- 文件、註解、commit 訊息用繁體中文；commit 結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。
- 每個任務結束前 `npm test`、`npm run typecheck`、`npm run validate` 都要過，過了就 commit（👤 2026-10-24 說不用停下來問）。
- 不改 `worker/`（留給 T15）；AI 的部分留給 T16m。
- 行程格式只加**可以省略**的欄位，舊的行程 JSON 不用遷移。
- 右側分頁順序：探索 → 想去 → 行程。
- 預約狀態三種：`未訂位`（預設）／`已訂位`／`不訂位`；時間軸上 `未訂位` 橘色、`已訂位 ✓` 綠色、`不訂位` 不顯示。
- 用餐 tag：`早餐`／`午餐`／`晚餐`／`點心`；吃法 tag：`全員一起`／`分開吃`。
- 頭像疊最多 4 個，其他寫「+N」。
- 緩衝預設照引擎設定（全員 10 分、分組 5 分），每次 ±5 分。
- 多點卡片展開的標題叫「這個時段也可以去」；不用「備案」「主／備」這些字。
- 電腦版判斷用 `DESKTOP_QUERY`（`web/src/hooks.ts`，900px）。
- 程式風格照現有檔案：檔頭一段中文註解說明用途、函式上方一行 `/** */`。

## Review Focus

1. **舊行程沒有新欄位**（`travel` 只有 `mode`、沒有 `returnTravel`、`dining`）：時間軸算出來要和改之前一樣（除了不再有用餐空檔）→ Task 1 測試。
2. **交通方式選「自動」但填了緩衝 0**：存成 `{ bufferMinutes: 0 }`（沒有 `mode`），引擎照規則選方式、緩衝是 0；之後再把緩衝改回預設，`travel` 要變回 `null`，不留空殼 → Task 1 測試。
3. **連住的住宿中間換了一晚**（2/5、2/6 住 A，2/7 住 B，2/8 又住 A）：預約筆記是兩列 A（2/5～2/7 2 晚、2/8 1 晚）和一列 B，不能合成一列 A → Task 2 測試。
4. **多點卡片的主要那個被拿掉**（`removeOption` 拿掉 `selected`）：`selected` 要指到還在的點，時間軸不能壞 → Task 5 測試。
5. **預約筆記的列對應的項目移到別天**：那一筆狀態變回未訂位（舊的那筆不再顯示），不能跟著搬過去顯示已訂位 → Task 2 測試。

---

### Task 1: 引擎：交通設定、用餐和吃法、不產生用餐空檔

**Files:**
- Modify: `packages/engine/src/types.ts`（`TravelSpec`、`VisitItem`、`FlightItem`、`ItineraryDay`、`TimelineEntry`、`GapKind`）
- Modify: `packages/engine/src/travel.ts`（`planLeg`、`specifiedLeg`：`mode` 可以省略）
- Modify: `packages/engine/src/timeline.ts`（`travelTo` 的緩衝、航班和回住宿那段傳設定、`findGaps`、`mealTag`）
- Modify: `packages/engine/src/ops.ts`（新操作、`validateItinerary`）、`packages/engine/src/index.ts`（export）
- Modify: `docs/CONVENTIONS.md`（`itinerary-v1` 那節，約 306 行起）
- Test: `packages/engine/test/timeline.test.ts`、`packages/engine/test/ops.test.ts`

**Interfaces:**
- Produces（型別）：
  - `TravelSpec = { mode?: TravelMode | null; minutes?: number | null; bufferMinutes?: number | null; note?: string | null }`（`mode` 沒寫＝自動）
  - `VisitItem.dining?: 'together' | 'separate' | null`；`export type DiningStyle = 'together' | 'separate'`
  - `FlightItem.travel?: TravelSpec | null`（去機場那段）；`ItineraryDay.returnTravel?: TravelSpec | null`（回住宿那段）
  - `TimelineEntry.mealTag?: MealKind | null`：只有 `item.meal` 有填才有值（畫面用這個）；原本的 `meal` 照舊是引擎猜的，內部用
  - `GapKind = 'lodging' | 'idle'`（拿掉 `lunch`、`dinner`）
- Produces（操作，都回傳新的 `Itinerary`，不改原本的）：
  - `type LegTarget = { itemId: string } | { lodging: DateString }`
  - `setLegTravel(it: Itinerary, to: LegTarget, spec: TravelSpec | null): Itinerary`：存到那個項目的 `travel`（visit、free、flight）或那天的 `returnTravel`；`spec` 的每個欄位都是 null／undefined 時存 `null`。分組裡的項目照樣可以；split 項目本身、會合那段丟 `ItineraryError`（會合那段這次不做，Claude 決定）。
  - `getLegTravel(it: Itinerary, to: LegTarget): TravelSpec | null`
  - `setMeal(it: Itinerary, itemId: string, meal: MealKind | null): Itinerary`
  - `setDining(it: Itinerary, itemId: string, dining: DiningStyle | null): Itinerary`

- [ ] **Step 1: 寫失敗的測試**（`timeline.test.ts`）：
  - `test('沒排餐不產生午餐、晚餐空檔')`：排一天兩個景點跨過 12:00 和 18:00、住宿不含晚餐，斷言 `gaps.every(g => g.kind !== 'lunch' && g.kind !== 'dinner')`，也沒有 code 含 `meal` 的警告。
  - `test('mealTag 只反映使用者標的')`：餐廳沒填 `meal` → `mealTag == null`；填 `meal: 'lunch'` → `mealTag === 'lunch'`。
  - `test('只填緩衝、方式自動')`：第二項 `travel: { bufferMinutes: 0 }`，斷言 `travel.mode` 和沒填 `travel` 時一樣、`bufferMinutes === 0`；`bufferMinutes: 25` 時是 25。
  - `test('回住宿那段可以指定')`：`returnTravel: { mode: 'taxi', minutes: 30 }`，斷言 lodging entry 的 `travel.mode === 'taxi'`、`minutes === 30`、`specified === true`。
  - `test('去機場那段可以指定')`：出發航班 `travel: { minutes: 90 }`，斷言 flight entry 的 `travel.minutes === 90`。
  - `test('舊格式的行程結果不變')`：用 `toba-day.ts` 的行程，斷言每個 entry 的 `start`、`travel?.minutes` 和改之前存下來的期望值一樣（先在改程式前跑一次記下來）。
- [ ] **Step 2: 寫失敗的測試**（`ops.test.ts`）：
  - `setLegTravel(it, { itemId }, { bufferMinutes: 0 })` 後 `getLegTravel` 回 `{ bufferMinutes: 0 }`；再 `setLegTravel(it, { itemId }, { bufferMinutes: null })` 後項目的 `travel === null`。
  - `setLegTravel(it, { lodging: '2027-02-05' }, { mode: 'walk' })` 寫到 `days[i].returnTravel`。
  - 對 split 項目的 id 丟 `ItineraryError`。
  - `setMeal`、`setDining` 改到對的項目；`validateItinerary` 接受新欄位，`dining: 'x'`、`bufferMinutes: -1` 回錯誤訊息。
- [ ] **Step 3: 跑 `npm test` 確認失敗。**
- [ ] **Step 4: 實作。** `planLeg` 在 `spec.mode` 沒寫時走自動的分支，再套 `spec.minutes`（有填時用填的分鐘，`basis` 寫「指定」）；`travelTo` 的緩衝改成 `spec?.bufferMinutes ?? 預設`（仍只在有移動時加）；`timeline.ts` 約 256 行（航班）傳 `item.travel`、約 358 行（回住宿）傳 `day.returnTravel`；`findGaps` 拿掉午餐、晚餐兩段；畫面用的 `Gap['label']` 不變。
- [ ] **Step 5: 更新 `docs/CONVENTIONS.md` 的 itinerary-v1**：加 `dining`、`returnTravel`、航班的 `travel`、`bufferMinutes`，說明 `mode` 可以省略、`meal` 不填就不顯示。
- [ ] **Step 6: 跑 `npm test`、`npm run typecheck`、`npm run validate`，全部通過**（web 裡用到 `GapKind` 的 `lunch`／`dinner` 的地方一起刪掉）。
- [ ] **Step 7: Commit**：`引擎：交通可以只改時間或緩衝、回住宿和去機場那段可以指定、用餐和吃法的 tag、不產生用餐空檔（T15m）`

### Task 2: 假後端：預約筆記、整趟留言

**Files:**
- Modify: `web/src/backend/types.ts`、`web/src/backend/mock.ts`、`web/src/sharedStore.ts`、`web/src/dev-fixtures/seed.ts`
- Create: `web/src/lib/reservations.ts`
- Modify: `web/src/lib/planView.ts`（`reservationRows` 搬到 `lib/reservations.ts`，planView 不再 export）
- Test: `web/test/mockBackend.test.ts`、`web/test/sharedStore.test.ts`、`web/test/reservations.test.ts`（新）

**Interfaces:**
- Consumes: Task 1 的型別。
- Produces:
  - `type ReservationStatus = 'pending' | 'booked' | 'skip'`
  - `interface Reservation { date: string; placeId: string; status: ReservationStatus; note: string | null; nights: number | null; updatedBy: string; updatedAt: string }`（`nights`：住宿存下訂時的晚數，用來標「晚數變了」）
  - `Backend.listReservations(): Promise<Reservation[]>`；`Backend.putReservation(input: { date: string; placeId: string; status: ReservationStatus; note?: string | null; nights?: number | null }): Promise<Reservation>`（同一個 `(date, placeId)` 覆蓋）
  - `SyncState.reservations: string | null`
  - `export const TRIP_TARGET = 'trip'`（`types.ts`，和 `dayTarget` 並列）
  - `SharedState.reservations: Reservation[]`；`shared.setReservation(input): Promise<Result<Reservation>>`（樂觀更新，不存快照）
  - `lib/reservations.ts`：
    - `interface NoteRow { key: { date: string; placeId: string }; date: string; endDate: string | null; nights: number | null; placeId: string; itemId: string | null; role: 'main' | 'other' | 'lodging'; time: string | null; people: number; method/accepted/phone/url…（照原本 ReservationRow 的聯絡欄位）; status: ReservationStatus; note: string | null; updatedBy: string | null; updatedAt: string | null; nightsChanged: boolean }`
    - `noteRows(it, plan, byId, reservations: Reservation[]): NoteRow[]`：照原本 `reservationRows` 列出需要預約的，住宿**連續同一間**合成一列（key 是入住那晚），再套上 `reservations` 裡同 key 的狀態；沒有的是 `pending`
    - `reservationFor(rows: NoteRow[], date: string, placeId: string): NoteRow | null`（時間軸的 tag 用；住宿用那晚所在的那一列）
    - `linkLabel(url: string, place: Place): string`：等於 `place` 的官網網址 → `官網`；`tabelog.com` → `食べログ`；`jalan.net` → `じゃらん`；`travel.rakuten.co.jp` → `楽天`；其他 → 網域名稱（去掉 `www.`）

- [ ] **Step 1: 寫失敗的測試**（`reservations.test.ts`）：
  - `test('連住同一間合成一列')`：2/5、2/6、2/7 都住 A → 一列，`date === '2027-02-05'`、`endDate === '2027-02-08'`、`nights === 3`。
  - `test('中間換一晚就分開')`：A、A、B、A → A（2 晚）、B（1 晚）、A（1 晚）三列。
  - `test('狀態用 (入住日, 點) 對應')`：`reservations` 有 `{ date: '2027-02-05', placeId: A, status: 'booked', nights: 3 }` → 那列 `status === 'booked'`、`nightsChanged === false`；行程改成住 2 晚 → `nightsChanged === true`；改成 2/6 才入住 → `status === 'pending'`。
  - `test('項目移到別天變回未訂位')`：餐廳 R 在 2/5、有 booked 的紀錄，把項目移到 2/6 → 2/6 那列 `pending`，結果裡沒有 2/5 的 R。
  - `test('多點卡片每個點一列，主要的在前')`：`role` 依序 `main`、`other`。
  - `test('linkLabel')`：上面五種網址各一個斷言。
- [ ] **Step 2: 寫失敗的測試**（`mockBackend.test.ts`、`sharedStore.test.ts`）：`putReservation` 兩次同 key 只有一筆、`updatedBy` 是目前的人；`sync().reservations` 改了會變；`createComment({ target: TRIP_TARGET, … })` 可以；`shared.setReservation` 先改畫面、後端丟錯時退回。
- [ ] **Step 3: 跑 `npm test` 確認失敗。**
- [ ] **Step 4: 實作**（mock 存 localStorage 的方式照候選；`seed.ts` 放 2～3 筆不同人改的預約紀錄，其中一筆有備註）。原本用到 `reservationRows` 的地方（`Reservations.tsx`）先改成用 `noteRows`，畫面 Task 4 再改。
- [ ] **Step 5: 跑 `npm test`、`npm run typecheck`，全部通過。**
- [ ] **Step 6: Commit**：`web：假後端的預約筆記、整趟留言（T15m）`

### Task 3: 版面：分頁順序、行程分頁兩層、日期列的工具和地圖區的視窗

**Files:**
- Modify: `web/src/components/SidePanel.tsx`、`web/src/components/BottomSheet.tsx`（分頁順序）
- Modify: `web/src/components/DayPanel.tsx`（拿掉 `PanelActions`、`DayComments`、「看整趟」；新的標題列、摘要、空白狀態）
- Modify: `web/src/components/TopBar.tsx`（`DayTabs` 右端加工具按鈕；手機和電腦都用）
- Create: `web/src/components/MapPanel.tsx`（地圖區的視窗：留言、預約筆記；Task 4 填預約的內容）
- Modify: `web/src/uiStore.ts`、`web/src/App.tsx`（放 `<MapPanel />`）、`web/src/styles.css`
- Modify: `web/src/components/Wishlist.tsx`（`DayComments` 改成 `Comments({ target })`，day 和 trip 共用）
- Modify: `web/src/components/askAi.ts`（加 `askAiAboutDay(date)`，照現有把點加進選取的做法，把這天的點加進選取）
- Test: `web/e2e/t15m.spec.ts`（這任務先改壞掉的定位；新流程在 Task 8）

**Interfaces:**
- Produces:
  - `UiState.mapPanel: { kind: 'comments' | 'reservations'; scope: 'day' | 'trip' } | null`；`openMapPanel(kind)`（`scope` 照目前選的天：選「全部」是 `trip`）、`closeMapPanel()`
  - `DialogState` 拿掉 `{ kind: 'reservations' }`
  - `<Comments target={string} />`（`Wishlist.tsx`）
  - `data-testid`：`toolbar-comments`、`toolbar-reservations`、`toolbar-more`、`export-json`、`map-panel`、`map-panel-scope`、`day-back`、`day-prev`、`day-next`、`day-ask-ai`、`day-warn-toggle`

- [ ] **Step 1: 分頁順序**：電腦版右欄 `探索｜想去｜行程`；手機下方面板 `聊天｜想去｜行程`（探索在上方的「地圖／探索」切換，Claude 決定不動）。
- [ ] **Step 2: 日期列工具**：`💬 N`（N＝`scope` 範圍的留言數）、`📋 N`（N＝`scope` 範圍 `noteRows` 裡 `status === 'pending'` 的數量）、`⋯`（選單裡「⬇ 匯出 JSON」，照原本 `PanelActions` 的下載程式）。手機日期列橫向捲動時按鈕固定在右端。
- [ ] **Step 3: `MapPanel`**：電腦版是蓋住地圖那一欄的面板（`position: absolute` 在地圖容器裡，不蓋左右欄）；手機是全螢幕、從上面蓋下來。標題「2/5（五）的留言」／「整趟的留言」，下面一排 `這天｜整趟` 切換（選「全部」時只有整趟）、✕ 關掉。留言的內容用 `<Comments target={dayTarget(date) 或 TRIP_TARGET} />`。
- [ ] **Step 4: 行程分頁兩層**：「全部」照原本的 `Overview`（拿掉 `PanelActions`）；某一天最上面一列 `← 整趟`、日期、`‹ ›`（第一天、最後一天停用）、`🤖 問 AI`（`askAiAboutDay`）、`PlanningToggle`。下面是摘要列（`DaySummaryLine` 的 `⚠ N` 變成按鈕，點了展開提醒清單，取代原本的 `<details>`）、細一點的 `DayBar`、時間軸、`DayCandidates`。
- [ ] **Step 5: 空白狀態**：沒排東西→「這天還沒排。到 ❤️ 想去把想去的點加到這天」＋〔去想去〕（`showList('wish')`）；沒有候選→「在想去的卡片按『加到某天』，就會出現在這裡」；一般模式有候選→「進入規劃模式，就可以按 ↑ 排進行程」。
- [ ] **Step 6: 跑 `npm run typecheck`、`npm test`、`npm run e2e`；e2e 只修因為按鈕搬家而失敗的定位，全部通過。**
- [ ] **Step 7: Commit**：`web：分頁順序改成探索、想去、行程；留言、預約、匯出搬到日期列；行程分頁兩層（T15m）`

### Task 4: 預約筆記的畫面、時間軸的預約 tag

**Files:**
- Modify: `web/src/components/Reservations.tsx`（改成 `ReservationNotes`，放在 `MapPanel` 裡）
- Modify: `web/src/components/MapPanel.tsx`、`web/src/components/Timeline.tsx`（tag）
- Test: `web/e2e/t15m.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `noteRows`、`reservationFor`、`linkLabel`、`shared.setReservation`；Task 3 的 `mapPanel`。
- Produces: `<ReservationNotes scope date />`；`<ReservationTag date placeId />`（時間軸用）；`openMapPanel('reservations', { focus: { date, placeId } })` 打開後捲到那一列（`openMapPanel` 加第二個參數）。`data-testid`：`note-row`、`note-status-pending`／`booked`／`skip`、`note-text`、`only-pending`、`reservation-tag`。

- [ ] **Step 1: 每一列**：名稱（點了開詳情，`commands.focus` 加打開詳情，照現有 `PlaceChip` 的做法）、日期（住宿寫「2/5～2/8 3 晚」）、時間、人數、角色（`other` 寫「這個時段也可以去」）；電話用 `tel:` 連結；網址用 `linkLabel` 當文字；三個狀態按鈕；備註一行輸入框（離開輸入框或按 Enter 存）；最後改的人的頭像（Task 5 的 `AvatarStack`，先用 `MemberName`，Task 5 再換）和時間；`nightsChanged` 時標「晚數變了，請確認」。
- [ ] **Step 2: 上方「只看未訂位」切換；預設依日期、時間排。**
- [ ] **Step 3: 時間軸 tag**：visit 卡片和住宿卡片用 `reservationFor` 找狀態，`pending` 橘、`booked` 綠「已訂位 ✓」、`skip` 不顯示；點 tag 打開預約筆記並捲到那一列。
- [ ] **Step 4: e2e**：`test('預約筆記：改成已訂位、時間軸 tag 跟著變')`：選 2/5 → 按 `toolbar-reservations` → 某一列按 `note-status-booked`、填備註 → 關掉 → 那張卡片的 `reservation-tag` 寫「已訂位 ✓」；切換成別的使用者，看到同一個狀態和備註（手機、電腦各跑）。
- [ ] **Step 5: 跑 `npm run typecheck`、`npm test`、`npm run e2e`，全部通過。**
- [ ] **Step 6: Commit**：`web：預約筆記（未訂位／已訂位／不訂位、備註），時間軸顯示預約 tag（T15m）`

### Task 5: 時間軸的卡片：一般／規劃模式、頭像、tag、多點卡片、住宿卡片；候選的「併到…」

**Files:**
- Modify: `web/src/components/Timeline.tsx`、`web/src/components/Wishlist.tsx`（`DayCandidates`）、`web/src/components/common.tsx`、`web/src/styles.css`
- Create: `web/src/components/ItemTags.tsx`（tag 那一排和規劃模式的選單）
- Modify: `web/src/lib/planView.ts`（`optionRows`）、`web/src/sharedStore.ts`（`addProposer` 不再用就刪掉，連同 `VisitItem.proposedBy` 的畫面）
- Test: `web/test/lib.test.ts`、`packages/engine/test/ops.test.ts`（`removeOption` 的邊界）

**Interfaces:**
- Consumes: Task 1 的 `setMeal`、`setDining`、`mealTag`；engine 現有的 `selectOption`、`addOption`、`removeOption`、`setLodging`；Task 4 的 `ReservationTag`。
- Produces:
  - `<AvatarStack ids={string[]} max={4} />`（`common.tsx`；圓形頭像＝名字第一個字，和 MeMenu 一樣；超過寫「+N」；點了跳出名單）
  - `optionRows(item: VisitItem, byId): { place: Place; index: number; main: boolean; walkMinutesFromMain: number | null }[]`（`planView.ts`，主要的排第一）
  - `data-testid`：`avatar-stack`、`item-tags`、`tag-meal`、`tag-dining`、`options-toggle`、`option-row`、`option-make-main`、`option-remove`、`lodging-change`、`candidate-merge`

- [ ] **Step 1: 寫失敗的測試**：`lib.test.ts` 的 `optionRows` 主要的排第一、`walkMinutesFromMain` 主要的是 null；`ops.test.ts` 的 `test('拿掉主要的那個，selected 指到還在的點')`（三個點、`selected: 1`，`removeOption(it, id, 1)` 後 `selected === 0`；拿掉 `selected` 之前的點時 `selected` 減 1）。不符合的話修 `removeOption`。
- [ ] **Step 2: 跑 `npm test` 確認失敗，實作 `optionRows`（和必要時的 `removeOption`），跑到通過。**
- [ ] **Step 3: 一般模式的卡片**：只顯示開始時間、編號、類型圖示、名稱、停留時間標籤、`ItemTags`（`mealTag`、`dining`、`ReservationTag`）、按了 ❤️ 的人的 `AvatarStack`（取代「○○ 提的」）、⚠ 數；停留時間的 −／＋、⋯、拖曳只在規劃模式。
- [ ] **Step 4: tag 的編輯（規劃模式）**：點 tag 那一排（沒有 tag 時顯示「＋ 標籤」）跳出兩組選項：用餐（早餐、午餐、晚餐、點心、不標）、吃法（全員一起、分開吃、不標；只有 options 裡有餐廳時出現）；選了用 `shared.changeItinerary(setMeal / setDining)`。⋯ 選單也加「標用餐」「標吃法」打開同一個選單。
- [ ] **Step 5: 多點卡片**：`options.length > 1` 時名稱後面 `＋N`；展開「這個時段也可以去」列 `optionRows`（★ 主要、名稱、類型、❤️ 頭像、「走 N 分」）；展開時用 `commands.highlight` 把這幾個點亮起來；點一列 `commands.focus` 加小卡片。規劃模式每列多「設為主要」（`selectOption`）、「從這張卡片拿掉」（`removeOption`，再 `shared.createCandidate` 放回這天的候選）。⋯ 選單原本的「改用備案」拿掉。
- [ ] **Step 6: 住宿卡片**：顯示 `含晚餐`／`含早餐`（`lodgingMeals`，沒填照住宿資料的 `meals`；`varies` 不顯示）；規劃模式下「換住宿」按鈕：切到想去分頁、類型設成住宿（`showList('wish')` 加 `setFilter({ types: ['lodging'] })`），想去的住宿卡片在規劃模式有「設為 2/5 的住宿」（先確認，照現有候選 ↑ 住宿的對話框）；「清掉」搬進住宿卡片的 ⋯ 選單。
- [ ] **Step 7: 候選**：拿掉「○○ 加的」，改成 ❤️ 的 `AvatarStack`；加的人放在 `title`（滑鼠移上去）和長按時的提示；規劃模式多一個「併到…」：列這天的 visit 卡片（名稱＋時間），選了 `addOption` 再 `deleteCandidate`；住宿的候選沒有。
- [ ] **Step 8: 跑 `npm run typecheck`、`npm test`、`npm run e2e`，全部通過。**
- [ ] **Step 9: Commit**：`web：時間軸卡片一般／規劃模式分開、頭像、用餐和吃法 tag、多點卡片、換住宿、候選併到卡片（T15m）`

### Task 6: 交通細列：展開看轉乘、在規劃模式改；地圖單段高亮

**Files:**
- Create: `web/src/components/LegRow.tsx`（取代 `Timeline.tsx` 裡的 `Leg`）
- Modify: `web/src/components/Timeline.tsx`、`web/src/lib/planView.ts`（`rideLines`、`legTargetOf`、`legMapsUrl`）、`web/src/styles.css`
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `setLegTravel`、`getLegTravel`、`LegTarget`；T12 的 `commands.drawRoute`、`commands.highlight`、`commands.clearHighlights`。
- Produces:
  - `rideLines(leg: Leg, nameOf: (id: string) => string): string[]`：每程一行 `10:12 近鐵 鳥羽 → 宇治山田 10:30`，兩程之間 `轉乘 N 分`（下一程出發減這一程抵達）
  - `legTargetOf(entry: TimelineEntry, date: string): LegTarget | null`（lodging entry → `{ lodging: date }`；visit／free／flight → `{ itemId }`；meet、start → null，不能改）
  - `legMapsUrl(from: Place, to: Place, mode: TravelMode): string`：`https://www.google.com/maps/dir/?api=1&origin=lat,lon&destination=lat,lon&travelmode=`（walk→walking、train/bus/ferry→transit、其他→driving）
  - `data-testid`：`tl-leg`（保留）、`leg-detail`、`leg-ride`、`leg-maps`、`leg-mode`、`leg-minutes`、`leg-buffer-minus`、`leg-buffer-plus`、`leg-note`

- [ ] **Step 1: 寫失敗的測試**：`rideLines` 兩程、轉乘 8 分的輸出（完整字串斷言）；`legTargetOf` 四種 entry；`legMapsUrl` 三種 mode 的 `travelmode`。
- [ ] **Step 2: 跑 `npm test` 確認失敗，實作，跑到通過。**
- [ ] **Step 3: 點細列展開**（一次只展開一段，再點收起）：方式、交通分鐘、緩衝分鐘、計程車台數（`leg.taxi`）、`rideLines`、Google Maps 連結。展開時 `commands.drawRoute`（這段的起訖、`leg.mode`、`leg.minutes`）和 `commands.highlight` 轉乘的車站（`rides` 中間的 `from`），其他天的線照舊；收起時清掉。
- [ ] **Step 4: 規劃模式的設定**（`legTargetOf` 不是 null 才有）：方式一排按鈕（自動＋八種，選了存 `mode`，自動是沒有 `mode`）、時間（自動／輸入分鐘）、緩衝 −5／＋5（最小 0，顯示「預設」或「已調整」，有「恢復預設」）、備註一行；每次改用 `shared.changeItinerary(it => setLegTravel(it, target, next))`，`next` 由 `getLegTravel` 合併。
- [ ] **Step 5: 跑 `npm run typecheck`、`npm test`、`npm run e2e`，全部通過。**
- [ ] **Step 6: Commit**：`web：交通細列可以展開看轉乘、在規劃模式改方式、時間、緩衝；地圖只亮那一段（T15m）`

### Task 7: 地圖上的行程沿道路畫

**Files:**
- Modify: `web/src/lib/overlays.ts`（`itineraryFeatures` 加 `pathOf` 參數）
- Create: `web/src/itineraryRoutes.ts`（選定那天的每一段向 `RoadRouter` 要路徑）
- Modify: `web/src/components/MapView.tsx`（約 469 行）、`web/src/main.tsx` 或 `App.tsx`（啟動）
- Test: `web/test/lib.test.ts`、`web/test/routing.test.ts`

**Interfaces:**
- Consumes: `lib/routing.ts` 的 `createRoadRouter`／`RoadRouter`（`cachedMeters` 旁邊應該有拿快取路徑的方法；沒有的話加 `cachedPath(profile, from, to): LonLat[] | null`）、`railPath`、`routeProfile`。
- Produces:
  - `itineraryFeatures(it, plan, byId, dates, day, pathOf?: (from: Place, to: Place, mode: Leg['mode']) => LonLat[] | null)`：有路徑就用路徑接起來，沒有就直線（`pathOf` 沒給＝現在的行為）
  - `startItineraryRoutes(app, data, plan, router): () => void`：選定的天變了或時間軸重算後，把那天每一段（步行、車用 OSRM；電車用 `railPath`）排進 router 的佇列；拿到路徑後讓地圖重畫（store 裡加一個 `routesVersion: number` 遞增即可）

- [ ] **Step 1: 寫失敗的測試**：`itineraryFeatures` 給 `pathOf` 回三個點的路徑時，那條線的座標包含中間那個點；不給 `pathOf` 時座標和現在一樣。
- [ ] **Step 2: 跑 `npm test` 確認失敗，實作，跑到通過。**
- [ ] **Step 3: 接到 MapView**；用 dev server 實際開 2/5 看路線沿道路（OSRM 查不到時是直線，console 不能有錯誤）。
- [ ] **Step 4: 跑 `npm run typecheck`、`npm test`、`npm run e2e`，全部通過**（e2e 不連 OSRM 的話維持直線，照 T12 的測試做法）。
- [ ] **Step 5: Commit**：`web：地圖上的行程沿道路和鐵路畫（T15m）`

### Task 8: 探索、想去的卡片

**Files:**
- Modify: `web/src/components/Explore.tsx`、`web/src/components/ExploreWall.tsx`、`web/src/components/Wishlist.tsx`（`WishExtras`）、`web/src/components/Votes.tsx`、`web/src/styles.css`
- Create: `web/src/components/DayPicker.tsx`
- Modify: `web/src/lib/wishlist.ts`（`placeDayStatus`）
- Test: `web/test/wishlist.test.ts`、`web/e2e/t15m.spec.ts`

**Interfaces:**
- Consumes: 現有的 `voteCounts`、`dayCandidates`、`itemsWithPlace`、`shared.createCandidate`／`deleteCandidate`、投票的方法。
- Produces:
  - `placeDayStatus(placeId, candidates, it): { candidate: string[]; scheduled: string[] }`（日期排序）
  - `<DayPicker placeId onClose />`：2/2～2/13 的月曆格子（星期一開頭，一列七天），候選的打勾、已排的標 ✓；點日期加入或取消候選
  - `data-testid`：`card-votes`、`card-status-tag`、`add-to-day`、`day-picker`、`day-picker-<日期>`

- [ ] **Step 1: 寫失敗的測試**：`placeDayStatus` 有兩天候選、一天已排時的輸出。
- [ ] **Step 2: 跑 `npm test` 確認失敗，實作，跑到通過。**
- [ ] **Step 3: 照片右上角** `❤️ 3　👎 1`（只有一種就只顯示那種；兩個都可以點，按的是自己的票）；點數字旁的 ▾ 跳出名單（`AvatarStack` 的名單）。照片下面的頭像排拿掉。只有文字的卡片放在名稱後面。
- [ ] **Step 4: 照片左上角**類型 tag 旁加 `📅 候選 2/5、2/8`、`✓ 已排 2/5`（`placeDayStatus`）。
- [ ] **Step 5: 「📅 加到某天」**：卡片底部的實心主色按鈕，點了開 `DayPicker`（取代一次展開 13 個日期的做法）；探索的卡片也有，在探索按的同時如果自己還沒按 ❤️ 就按 ❤️。
- [ ] **Step 6: e2e**：更新現有想去流程的定位；加 `test('在探索加到某天：自動 ❤️、出現在那天的候選')`（手機、電腦各跑）。
- [ ] **Step 7: 跑 `npm run typecheck`、`npm test`、`npm run e2e`，全部通過。**
- [ ] **Step 8: Commit**：`web：探索、想去的卡片顯示 ❤️／👎 數和候選、已排的 tag，加到某天改成月曆（T15m）`

### Task 9: 完成條件、截圖、文件

**Files:**
- Modify: `web/e2e/t15m.spec.ts`、`web/e2e/shots-wish.mjs`（或新增 `web/e2e/shots-round3.mjs`，截圖放 `data/cache/work/t15m-round3/`）
- Modify: `web/README.md`（「畫面」的這一天、想去、規劃模式、探索幾段）、`docs/architecture.md` §2（`mapPanel`、`routesVersion`、預約筆記的假後端）、`docs/PLAN.md`（T15 任務卡：預約筆記、整趟留言要接 worker 和 D1；`Reservation` 的 API 形狀）
- Modify: `docs/superpowers/specs/2026-10-24-itinerary-tab-round3-design.md` 開頭標「已實作（計畫：`docs/superpowers/plans/2026-10-24-itinerary-tab-round3.md`）」

- [ ] **Step 1: e2e 完成條件流程**（手機、電腦各跑）：把點加到 2/5 → 進入規劃模式 → 候選 ↑ 排進 → 另一個候選「併到…」那張卡片 → 展開「這個時段也可以去」有兩個點 → 標「午餐」「分開吃」→ 點交通細列、緩衝 −5 → 後面的時間提早 5 分 → 復原快照回到原狀。
- [ ] **Step 2: 截圖**：電腦（1600、1280 寬）和手機（390 寬）各截：這一天（一般模式）、這一天（規劃模式、多點卡片展開、交通細列展開）、留言視窗、預約筆記、想去的卡片和月曆。
- [ ] **Step 3: 看過每張截圖**，有跑版、文字被切掉、重疊的就修，修完重截。
- [ ] **Step 4: 更新文件**（上面列的四個檔案）。
- [ ] **Step 5: 跑 `npm test`、`npm run typecheck`、`npm run validate`、`npm run e2e`、`npm run build`，全部通過。**
- [ ] **Step 6: Commit**：`T15m 第三輪：e2e、截圖、文件`
