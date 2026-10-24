# 資料卡、交通卡、拖曳合併、整趟工具列：實作計畫（T15m 第四輪）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 時間軸的資料卡和交通卡直接寫清楚（開始–結束、轉乘、等車），合併和換順序都用拖曳，拿掉緩衝、計程車改用 OSRM 的時間，討論／預約／下載搬到右上角變彈窗，探索和想去的流程收斂成「❤️ → 加到某天 → 候選 → 排進」。

**Architecture:** 引擎（`packages/engine`）拿掉緩衝、加 `transit` 方式和選定班次（`TravelSpec.trip`、`Leg.trip`／`prevTrip`／`nextTrip`／`transitAvailable`），加合併、拆開的操作；畫面的判斷邏輯（拖曳意圖、卡片時間、色盤檢查）放在 `web/src/lib/` 的純函式並寫單元測試，元件只負責呈現。復原用 `changeItinerary` 前的那份行程。

**Tech Stack:** TypeScript、React 19、Zustand vanilla、MapLibre、node:test（`npm test`）、Playwright（`npm run e2e`）。

**Spec:** `docs/superpowers/specs/2026-10-25-itinerary-round4-design.md`（接在第三輪 `2026-10-24-itinerary-tab-round3-design.md` 後面，衝突以第四輪為準）

## Global Constraints

- 所有路徑在 worktree `D:\workspace\travel_helper-t15m`（分支 `t15m`），指令在這個目錄的根跑。
- 文件、註解、commit 訊息用繁體中文；commit 結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。
- 每個任務結束前 `npm test`、`npm run typecheck`、`npm run validate` 都要過，過了就 commit（👤 2026-10-25 說不用停下來問）。
- 不改 `worker/`（留給 T15）；AI 的部分留給 T16m。
- 程式風格照現有檔案：檔頭一段中文註解說明用途、函式上方一行 `/** */`；改到的檔頭註解跟著更新（例如拿掉「緩衝」「換住宿」「併到…」的描述）。
- 交通方式選單只有：`自動`／`🚶 步行`／`🚕 計程車`／`🚃 大眾運輸`。
- 舊的行程 JSON 不用遷移：`bufferMinutes` 留著也不報錯（忽略）；舊的 `train`、`bus`、`ferry`、`charter`、`car`、`other` 照樣合法、照樣算。
- 「留言」在畫面上改叫「討論」（資料、API 名稱不改）。
- 只有同類型的點能合併（餐廳和餐廳、景點和景點）；住宿不能合併、也不能當合併目標。
- 等車寫在交通卡「等 N 分」，前一站的時間不變（👤 決定）。
- 電腦版判斷用 `DESKTOP_QUERY`（`web/src/hooks.ts`，900px）。

## Review Focus

1. **舊行程有 `bufferMinutes: 10`、`mode: 'charter'`**：`validateItinerary` 沒有錯誤，時間軸沒有加緩衝，包車照車程算 → Task 1 測試 `舊的 bufferMinutes 忽略、舊的方式照樣算`。
2. **選定班次後換了順序**（`trip.from`／`trip.to` 和這段的起訖點不同）：當作沒選，照自動挑，不報錯、不出現「趕不上」→ Task 1 測試 `起訖點變了的 trip 不用`。
3. **選定的班次趕不上**（前一站停留加長了）：不改班，交通卡用那班，警告 `missed-trip`「趕不上 10:32 這班」→ Task 1 測試 `趕不上選定的班次：照樣用、警告`。
4. **拖到自己身上、拖到航班、拖整張有備卡的卡片到別張卡的中間**：前兩種不動；第三種只當插入，不合併 → Task 4 測試 `dropIntent`。
5. **舊的 OSRM 快取（localStorage 裡只有 `meters`、沒有 `seconds`）**：當作沒查過，計程車退回估算，不能出現 NaN 分 → Task 2 測試 `舊快取沒有 seconds 當作沒查過`。

---

### Task 1: 引擎：拿掉緩衝、計程車用路線時間、大眾運輸和選定班次

**Files:**
- Modify: `packages/engine/src/types.ts`（`TRAVEL_MODES`、`TravelSpec`、`Leg`）
- Modify: `packages/engine/src/config.ts`（拿掉 `buffer`；`taxi.overheadMinutes` 預設改 0）
- Modify: `packages/engine/src/data.ts`（`EngineData.driveMinutes`）
- Modify: `packages/engine/src/travel.ts`（`taxiEstimate`、`planLeg`、`specifiedLeg`、候選搜尋）
- Modify: `packages/engine/src/timeline.ts`（`travelTo` 不加緩衝）、`packages/engine/src/insert.ts`（不加 `bufferMinutes`）
- Modify: `packages/engine/src/ops.ts`（`isEmptySpec`、`validateItinerary`）、`packages/engine/src/index.ts`
- Modify: `docs/CONVENTIONS.md`（行程格式的 `travel` 說明，約 345 行；§5 規則數字那段，約 379 行，拿掉「計程車 30 km/h」改成「計程車用 OSRM 的開車時間，查不到時 30 km/h 估算」，拿掉緩衝）、`docs/architecture.md`（約 158 行「引擎的緩衝」那段改寫）
- Test: `packages/engine/test/travel.test.ts`、`packages/engine/test/timeline.test.ts`、`packages/engine/test/ops.test.ts`；`toba-day.test.ts` 的期望時間跟著改（少了緩衝）

**Interfaces:**
- Produces（型別）：
  - `TRAVEL_MODES = ['walk', 'train', 'bus', 'ferry', 'taxi', 'charter', 'car', 'other', 'transit']`
  - `interface TripRef { id: string; depart: TimeString; arrive: TimeString; from: string | null; to: string | null }`：`id` 是第一程的 `tripId`，`depart` 是第一程發車，`arrive` 是最後一程到達，`from`／`to` 是這段起訖的地點 ID（用來判斷起訖點變了沒）
  - `TravelSpec = { mode?: TravelMode | null; minutes?: number | null; trip?: TripRef | null; note?: string | null }`（拿掉 `bufferMinutes`）
  - `Leg` 拿掉 `bufferMinutes`，加 `trip?: TripRef | null`（這段實際用的班次；不是電車、巴士、船時是 null）、`prevTrip?: TripRef | null`、`nextTrip?: TripRef | null`（同一對上下車點的前一班、後一班，規劃模式的 ‹ › 用）、`transitAvailable?: boolean`（這兩點之間時刻表裡有沒有任何班次，不管等多久）
  - `EngineData.driveMinutes?: (from: LonLat, to: LonLat) => number | null`
  - `taxiEstimate(a, b, party, cfg, roadMeters?: number | null, roadMinutes?: number | null)`：`roadMinutes` 有值就用它當分鐘（再加 `overheadMinutes`，預設 0）；沒有時照舊用距離 ÷ `kmPerHour`
- 新警告 code：`missed-trip`（level `warning`，訊息「趕不上 HH:MM 這班」）

- [ ] **Step 1: 寫失敗的測試**

`travel.test.ts`：
```ts
test('計程車有路線時間就用它，不加叫車時間', () => {
  const r = taxiEstimate(A, B, party15, DEFAULT_CONFIG, 4200, 9.6);
  assert.equal(r.minutes, 9.6);
});
test('計程車沒有路線時間時照距離估算', () => {
  const r = taxiEstimate(A, B, party15, DEFAULT_CONFIG, 6000, null);
  assert.equal(r.minutes, 12); // 6 km ÷ 30 km/h，overheadMinutes 0
});
test('transit：一定搭大眾運輸，不套等車上限', () => { /* 用 synthetic 資料：下一班要等 50 分（超過 busMaxWait 20） */
  // planLeg(..., { mode: 'transit' }) → leg.mode 是 'bus'、leg.waitMinutes === 50、leg.trip.id 是那班的 tripId
});
test('transit：時刻表裡沒有班次時是 unknown', () => { /* leg.mode === 'unknown'、warning code travel-unknown */ });
test('選定班次：用那班，等車寫在 waitMinutes', () => { /* spec.trip 指到比最早那班晚一班的 → leg.trip.id === 指定的 id、leg.waitMinutes === 指定班發車 − (出發 + 走到車站) */ });
test('趕不上選定的班次：照樣用、警告', () => { /* 出發時間晚於指定班發車 − 走路 → leg.trip.id 不變、warnings 有 code 'missed-trip'、message 含「趕不上 10:32 這班」 */ });
test('起訖點變了的 trip 不用', () => { /* spec.trip.from 和這段的起點 ID 不同 → 和沒有 trip 的結果一樣、沒有 missed-trip */ });
test('前一班、後一班', () => { /* leg.prevTrip.depart < leg.trip.depart < leg.nextTrip.depart，三個都是同一對上下車點；第一班時 prevTrip 是 null */ });
test('transitAvailable：有班次就是 true，不管等多久；步行就到的段落也要算', () => { /* 走 10 分就到、但有巴士直達的兩點 → leg.mode 'walk'、leg.transitAvailable true；離島外的兩點沒有任何路線 → false */ });
```
`timeline.test.ts`：
```ts
test('交通不加緩衝：到達＝出發＋交通分鐘', () => { /* 每個 entry 的 travel：toMinutes(arrive) − toMinutes(depart) === minutes */ });
```
`ops.test.ts`：
```ts
test('舊的 bufferMinutes 忽略、舊的方式照樣算', () => {
  const it = withTravel({ mode: 'charter', minutes: 20, bufferMinutes: 10 } as TravelSpec);
  assert.deepEqual(validateItinerary(it), []);
  // planItinerary 後那段 leg.minutes === 20、到達＝出發＋20
});
test('validateItinerary：mode transit 合法、trip 要有 id 和 HH:MM 的 depart', () => { /* { mode: 'transit', trip: { id: '', depart: '9:5' } } → 兩條錯誤 */ });
test('setLegTravel：只有 trip 也算有設定；全空存 null', () => { /* 沿用現有測試，拿掉 bufferMinutes 的部分 */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 上面的新測試 FAIL（`taxiEstimate` 參數、`transit`、`trip` 不存在）

- [ ] **Step 3: 實作**

- `travel.ts`：
  - 把 `trainCandidates`＋`routeCandidates` 包成 `transitCandidates(a, b, ctx, factor, departMinutes)`（`departMinutes` 取代 `ctx.depart`），回傳所有候選（不套等車、班距規則）。`Candidate` 轉 `TripRef`：`{ id: rides[0].tripId, depart: rides[0].depart, arrive: rides.at(-1).arrive, from: a.id, to: b.id }`。
  - `planLeg` 在「同一點／缺座標」之後、步行判斷之前，就算 `transitAvailable = transitCandidates(...).length > 0`（離島照現有 `crossesSea` 規則只看船）；所有回傳的 leg 都帶這個值。
  - 選中的候選帶 `trip`；再算 `prevTrip`／`nextTrip`：後一班＝用 `departMinutes = 這班發車 − 走到車站的分鐘 + 1` 再搜一次，取第一程上車點相同、發車最早的；前一班＝用 `departMinutes = 這班發車 − 走路 − Δ`，Δ 依序試 15、30、60、120、180，取第一程上車點相同、發車早於這班的最晚一班，找到就停。
  - `specifiedLeg`：`mode === 'transit'` 時用 `best(transitCandidates(...))`；有 `spec.trip` 且 `trip.from === a.id && trip.to === b.id` 時，改成找第一程 `tripId === trip.id` 的候選（`departMinutes` 用 `trip.depart` 減走路，找不到就當沒有 trip）；`wait = 發車 − (ctx.depart + 走路)`，小於 0 時 `wait = 0` 並加 `missed-trip` 警告。`trip` 也適用於沒寫 mode（自動）的 spec。
  - 計程車呼叫 `taxiEstimate(..., road, ctx.data.driveMinutes?.(a.coords, b.coords) ?? null)`；`basis` 寫「計程車（osrm 時間）」或「計程車估算（直線，30 km/h）」。
- `timeline.ts` 的 `travelTo` 直接回傳 `leg`（拿掉緩衝那三行）；`insert.ts` 只加 `e.travel.minutes`。
- `ops.ts`：`isEmptySpec` 看 `mode`、`minutes`、`trip`、`note`；`checkTravel` 拿掉 `bufferMinutes`、加 `trip` 檢查（`id` 非空字串、`depart`／`arrive` 是 HH:MM）。
- `index.ts` export `TripRef`。
- 改 CONVENTIONS、architecture 的對應段落。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: 全部 PASS（web 會因 `bufferMinutes` 消失而 typecheck 失敗：只在 `web/src/lib/planView.ts`、`web/src/components/LegRow.tsx` 把讀 `bufferMinutes` 的地方先改成不顯示，讓 typecheck 過；畫面在 Task 5 重做）

- [ ] **Step 5: Commit**

```bash
git add packages/engine docs/CONVENTIONS.md docs/architecture.md web/src/lib/planView.ts web/src/components/LegRow.tsx web/test
git commit -m "引擎：拿掉緩衝、計程車用 OSRM 時間、大眾運輸方式和選定班次（T15m 第四輪）"
```

---

### Task 2: OSRM 存開車時間，接到引擎和地圖路線

**Files:**
- Modify: `web/src/lib/routing.ts`（`RoadRoute`、`parseOsrm`、`createRoadRouter`、`minutesFromMeters`、`routeProfile`、`MODE_ICONS`）
- Modify: `web/src/planStore.ts`（`RoadCache`、`buildEngineData`）
- Modify: `web/src/routeResolver.ts`（地圖路線的計程車分鐘用路線時間，如果它呼叫 `minutesFromMeters`）
- Test: `web/test/routing.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `EngineData.driveMinutes`、`taxiEstimate(..., roadMinutes)`
- Produces:
  - `RoadRoute = { geometry: LonLat[]; meters: number; seconds: number }`（`seconds` 是 OSRM `routes[0].duration`）
  - router 多一個 `cachedMinutes(profile: 'foot' | 'car', from: LonLat, to: LonLat): number | null`
  - `RoadCache` 多 `cachedMinutes`；`buildEngineData` 設 `driveMinutes: (a, b) => roads.cachedMinutes('car', a, b)`
  - `MODE_ICONS.transit = '🚃'`；`routeProfile('transit') = 'straight'`（實際路徑照 rides 畫）

- [ ] **Step 1: 寫失敗的測試**

```ts
test('OSRM 的 duration 存成 seconds，cachedMinutes 換成分鐘', async () => { /* 假 fetch 回 { code:'Ok', routes:[{ distance: 4200, duration: 576, geometry }] } → route() 後 cachedMinutes('car',a,b) === 9.6 */ });
test('舊快取沒有 seconds 當作沒查過', () => { /* storage 預先放 { geometry, meters: 4200 } → cachedMinutes、cachedMeters 都是 null；route() 會再查一次（假 fetch 被呼叫 1 次） */ });
test('minutesFromMeters：計程車有路線時間時用它', () => { /* minutesFromMeters('taxi', 4200, party, cfg, 9.6) === 10（無條件進位前 9.6；照現有 routeLabel 進位規則檢查） */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 新測試 FAIL

- [ ] **Step 3: 實作**

`parseOsrm` 讀 `duration`（不是數字就丟錯，當查不到）；`cached()` 讀到沒有 `seconds` 的舊資料回傳 null（不放進 memory）；`minutesFromMeters(mode, meters, party, cfg, roadMinutes?: number | null)` 的計程車、包車、自駕傳 `roadMinutes` 給 `taxiEstimate`。呼叫 `minutesFromMeters` 的地方（`routeResolver.ts` 等）把查到的 `seconds / 60` 傳進去。順手刪掉 `route()` 裡重複的 `memory.set(key, r)`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/routing.ts web/src/planStore.ts web/src/routeResolver.ts web/test/routing.test.ts
git commit -m "web：OSRM 存開車時間，計程車時間接到引擎（T15m 第四輪）"
```

---

### Task 3: 引擎：合併、拆開、搬移備卡；復原提示

**Files:**
- Modify: `packages/engine/src/ops.ts`、`packages/engine/src/index.ts`
- Modify: `web/src/sharedStore.ts`（`Toast`、`changeItinerary`）、`web/src/components/Dialogs.tsx`（提示的「復原」按鈕）
- Test: `packages/engine/test/ops.test.ts`、`web/test/sharedStore.test.ts`

**Interfaces:**
- Produces（ops，都不改傳進來的行程；不合法丟 `ItineraryError`）：
  - `mergeItems(it: Itinerary, sourceId: string, targetId: string, typeOf?: (placeId: string) => string | undefined): { itinerary: Itinerary; droppedStart: TimeString | null }`：把 source（visit、只有一個選項）的那個選項加到 target 的 `options` 最後，刪掉 source；target 的 `selected`、`start`、`meal`、`dining`、`travel` 不變；回傳 source 原本的 `start`。錯誤：source 有兩個以上選項「有備卡的卡片不能合併，只能換順序」；不是 visit；同一個項目；`typeOf` 有給且兩邊主卡類型不同「只有同類型的點能合併」；任一邊類型是 `lodging`「住宿不能合併」。
  - `detachOption(it: Itinerary, itemId: string, optionIndex: number, date: DateString, index: number, split?: { id: string; group: string }): { itinerary: Itinerary; itemId: string }`：把那個選項拿出來變成新的 visit（只有 `options: [那個選項]`），插在 `date` 的第 `index` 個（index 是「先拿出來再插進去」之後的位置，同 `moveItemTo`）。錯誤：`optionIndex === selected`「主卡要先把皇冠給別張」。
  - `moveOption(it: Itinerary, fromItemId: string, optionIndex: number, toItemId: string, typeOf?): Itinerary`：備卡搬到別張同類型卡的最後；同樣不能搬主卡；類型規則同 `mergeItems`。
- Produces（web）：
  - `Toast` 多 `action?: { label: string; run: () => void }`
  - `changeItinerary(fn, reason, opts?: { undo?: { text: string; after?: () => Promise<unknown> } })`：成功後提示顯示 `opts.undo.text`＋「復原」；按「復原」＝`changeItinerary(() => before, \`復原：${reason}\`)`，成功後再跑 `after`（例如把拿掉的候選加回去）。有 `undo` 的提示顯示 6 秒。

- [ ] **Step 1: 寫失敗的測試**

`ops.test.ts`：
```ts
test('mergeItems：source 的點變成 target 的最後一個選項，target 的欄位不變', () => {
  // target { options:[{place:'r1'}], selected:0, start:'12:00', meal:'lunch' }，source { options:[{place:'r2', stayMinutes:45}], start:'11:30' }
  // → target.options 是 [r1, r2(45)]、selected 0、start '12:00'、meal 'lunch'；source 不見了；droppedStart === '11:30'
});
test('mergeItems：有備卡的 source、不同類型、住宿都丟錯', () => { /* 三個 assert.throws，訊息照 Interfaces */ });
test('detachOption：備卡變成獨立一站；主卡不能拆', () => { /* 拆 index 1 到第 0 個 → 新項目在最前面、原卡剩一個選項；拆 selected → throws「主卡要先把皇冠給別張」 */ });
test('detachOption：拆掉前面的選項時 selected 跟著指原本那個', () => { /* options [a,b,c] selected 2，拆 0 → selected 1、主卡還是 c */ });
test('moveOption：備卡搬到別張同類型卡', () => { /* from 剩主卡、to 多一個選項 */ });
```
`sharedStore.test.ts`：
```ts
test('changeItinerary 的復原：回到改之前的行程、跑 after', async () => {
  // changeItinerary(fn, '合併', { undo: { text: '已合併到 A', after } }) → toast.text === '已合併到 A'、toast.action.label === '復原'
  // toast.action.run() 後 itinerary 和改之前 deepEqual、after 被呼叫一次
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 新測試 FAIL

- [ ] **Step 3: 實作**

照 Interfaces；`detachOption` 用 `removeOption` 的 selected 調整規則，再用和 `moveItemTo` 一樣的航班邊界檢查插入；新項目 ID 用 `nextItemId`、更新 `seq`。`Dialogs.tsx` 的提示加一個按鈕（`data-testid="toast-undo"`），點按鈕不要觸發外層的「點提示就關掉」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine web/src/sharedStore.ts web/src/components/Dialogs.tsx web/test/sharedStore.test.ts
git commit -m "引擎：合併、拆開、搬移備卡；web：可以復原的提示（T15m 第四輪）"
```

---

### Task 4: 時間軸的資料卡和合併卡片

**Files:**
- Modify: `web/src/components/Timeline.tsx`（`EntryRow`、拿掉 `OptionsList`、`changeLodging`；新增 `OptionStack`）
- Modify: `web/src/lib/planView.ts`（`cardTime`）
- Modify: `web/src/components/DayPanel.tsx`（檔頭註解）
- Modify: `web/src/styles.css`
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `detachOption`／`selectOption`、`changeItinerary` 的 `undo`
- Produces:
  - `cardTime(entry: TimelineEntry): { text: string; stay: number | null }`：`start` 是 `「09:30 出發」`、`stay: null`；`lodging` 是 `「15:10 到住宿」`、`stay: null`；其他 `「09:42–11:12」`、`stay` 是分鐘（0 分時只寫開始時間、`stay: null`）；航班照現在（抵達／起飛時間）。
  - 資料卡的 CSS class：`tl-card type-<placeType>`（`type-spot`、`type-restaurant`、`type-lodging`、`type-station`；沒有資料點的 `type-other`），淡底色用 CSS 變數（例如 `--type-lodging-bg`），色相照 `TYPE_COLORS`。
  - `OptionStack`：`visit.options.length > 1` 時包住卡片內容；本地 state `shown`（看的是第幾個，預設 `selected`）；`data-testid="option-stack"`、`data-shown`。

- [ ] **Step 1: 寫失敗的測試**

```ts
test('cardTime：起點、終點只寫一個時間；其他寫開始–結束', () => {
  assert.deepEqual(cardTime(entry({ kind: 'start', start: '09:30', end: '09:30' })), { text: '09:30 出發', stay: null });
  assert.deepEqual(cardTime(entry({ kind: 'lodging', arrive: '15:10', start: '15:10', end: '15:10' })), { text: '15:10 到住宿', stay: null });
  assert.deepEqual(cardTime(entry({ kind: 'visit', start: '09:42', end: '11:12' })), { text: '09:42–11:12', stay: 90 });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL（`cardTime` 不存在）

- [ ] **Step 3: 實作**

- 起點（`kind: 'start'`）和終點（`kind: 'lodging'`）改用和造訪卡片一樣的卡片結構（編號、類型圖示、名稱、底色、`cardTime`）；起點沒有住宿時（第一天從機場）照樣是卡片。終點保留 `LodgingMenu`（清掉）、含餐 tag、預約 tag；**拿掉「🔁 換住宿」按鈕和 `changeLodging`**。
- 造訪卡片時間欄用 `cardTime`，停留時間的 `StayChip`（規劃模式 −／＋）照舊放在時間後面。
- 編號圓（`Mark`）改用那個點的類型色（`TYPE_COLORS`），不用那天的顏色（地圖的編號在 Task 8 一起改）。
- `OptionStack`：卡片後面疊一層（備卡 1 張）或兩層（2 張以上）淡色卡；`shown === selected` 的那張右上角 👑，其他時候皇冠是灰的；tag 那一排右邊放 `‹ n/m ›`（`data-testid="option-prev"`／`option-next"`），手機左右滑也能換（pointer 水平移動超過 40px 且大於垂直移動）。換卡時名稱、類型圖示、❤️ 頭像、停留時間換成那個選項；地圖用 `commands.highlight([那個點])` 亮起來，換回主卡或卸載時清掉自己亮的（沿用現在 `optionKey` 那段 effect 的做法）。
- 規劃模式、看的是備卡時：`👑 設為主要`（`data-testid="option-make-main"`，點灰皇冠也是）＝`selectOption`；`拿出來`（`data-testid="option-takeout"`）＝`removeOption` 後 `shared.addCandidate(place, date)`，帶 `undo: { text: '已放回候選・{名稱}', after: 撤回那筆候選 }`。
- 拿掉 `＋N` 展開按鈕和 `OptionsList`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Timeline.tsx web/src/lib/planView.ts web/src/components/DayPanel.tsx web/src/styles.css web/test/lib.test.ts
git commit -m "web：資料卡淡底色和開始–結束、起終點住宿同樣的卡片、合併卡片的疊層和皇冠（T15m 第四輪）"
```

---

### Task 5: 拖曳：放的位置決定合併或換順序；候選、備卡也能拖

**Files:**
- Create: `web/src/lib/dropIntent.ts`
- Modify: `web/src/components/planDrag.ts`、`web/src/components/Timeline.tsx`、`web/src/components/Wishlist.tsx`（`CandidateRow` 可以拖、拿掉 `MergeMenu`、候選區當放置區）
- Modify: `web/src/styles.css`
- Test: `web/test/wishlist.test.ts`（或新增 `web/test/dropIntent.test.ts`，並加進根目錄 `npm test` 會跑到的 `web/test/*.test.ts`）

**Interfaces:**
- Consumes: Task 3 的 `mergeItems`、`detachOption`、`moveOption`、`addOption`、`changeItinerary` 的 `undo`
- Produces:
  - `type DragSource = { kind: 'item'; itemId: string; placeType: string | null; options: number } | { kind: 'candidate'; candidateId: number; placeId: string; placeType: string | null } | { kind: 'option'; itemId: string; index: number; placeType: string | null }`
  - `type DropTargetInfo = { kind: 'card'; itemId: string; placeType: string | null; isFlight: boolean } | { kind: 'end' } | { kind: 'candidates' }`
  - `dropIntent(src: DragSource, target: DropTargetInfo, rect: { top: number; height: number }, clientY: number): 'merge' | 'before' | 'after' | 'none'`：卡片上下各 1/4 高是 `before`／`after`；中間是 `merge`，但下列情況中間改成依上下半判斷 `before`／`after`：類型不同、任一邊是 `lodging`、`src.kind === 'item' && src.options > 1`、目標是航班。拖到自己（同一個 itemId，或 option 拖回自己那張）是 `none`。`end` 永遠是 `after`；`candidates` 只接受 `option`（回 `after`），其他是 `none`。
  - MIME：`application/x-travel-item`（現有）、新增 `application/x-travel-candidate`（JSON `{ candidateId, placeId }`）、`application/x-travel-option`（JSON `{ itemId, index }`）；都同時放 `application/x-travel-place`（拖到聊天室問 AI 照舊）。

- [ ] **Step 1: 寫失敗的測試**

```ts
const rect = { top: 0, height: 100 };
test('dropIntent：中間合併、邊緣插入', () => {
  const src = { kind: 'item', itemId: 'a', placeType: 'restaurant', options: 1 } as const;
  const card = { kind: 'card', itemId: 'b', placeType: 'restaurant', isFlight: false } as const;
  assert.equal(dropIntent(src, card, rect, 10), 'before');
  assert.equal(dropIntent(src, card, rect, 50), 'merge');
  assert.equal(dropIntent(src, card, rect, 90), 'after');
});
test('dropIntent：不同類型、住宿、有備卡的卡片、航班不合併', () => {
  // 景點拖到餐廳中間 → 40 'before'、60 'after'；有備卡（options 2）→ 不是 merge；目標 isFlight → 不是 merge；placeType 'lodging' → 不是 merge
});
test('dropIntent：拖到自己是 none；候選區只收備卡', () => { /* item a → card a 'none'；option → candidates 'after'；item → candidates 'none' */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 實作**

- `planDrag.ts`：電腦版 HTML5 拖曳、手機長按後拖兩條路都改成「取得 `DragSource` → 每次移動算 `dropIntent` → 標記 → 放開時執行」。標記：`merge` 給目標卡 class `drop-merge`（亮藍框＋「放開＝合併到這張」）；`before`／`after` 照現在的插入線（加「放開＝排在這裡」）；拖曳開始時，不能合併的卡片加 class `drop-nomerge`（變淡）。`useLongPressDrag` 改成收 `DragSource | null`。
- 放開時的動作（都經過 `changeItinerary`，`reason` 照現在的寫法，加 `undo`）：

| 來源 | 結果 | 操作 | 復原提示 |
|---|---|---|---|
| item | merge | `mergeItems(it, src, target, typeOf)` | 「已合併到 {目標}」；`droppedStart` 有值時加「（原本的 {時間} 固定時間已拿掉）」 |
| item | before／after／end | `moveItemTo`（現在的 `dropItem`） | 「{名稱} 換位置」 |
| candidate | merge | `addOption` → 成功後 `removeCandidate(id, undefined, true)` | 「已合併到 {目標}」，`after` 把候選加回去 |
| candidate | before／after／end | `addItem`（visit，`options: [{ place, stayMinutes: null }]`）插在那個位置 → 成功後拿掉候選 | 「已排進 {名稱}」，`after` 把候選加回去 |
| option | merge | `moveOption` | 「已移到 {目標}」 |
| option | before／after／end | `detachOption` | 「{名稱} 拆出來了」 |
| option | candidates | `removeOption` → `addCandidate(place, date)` | 「已放回候選・{名稱}」 |

  `typeOf` 用 `dataStore.getState().byId.get(id)?.type`。住宿的候選不能拖（`CandidateRow` 只有非住宿才掛拖曳）。
- `Timeline.tsx`：卡片的拖曳來源帶 `options` 數；`OptionStack` 看的是備卡時，拖的是 `{ kind: 'option', index: shown }`（規劃模式才可以），看主卡時拖整張。
- `Wishlist.tsx`：`CandidateRow` 在規劃模式可以拖（電腦 `draggable`、手機長按）；`DayCandidates` 的 section 是 `candidates` 放置區（`data-drop-candidates`）；拿掉 `MergeMenu`；檔頭和 `DayCandidates` 的註解改掉「併到…」。
- 第三輪 §9 的「不從候選拖到時間軸」作廢：同步改 `planDrag.ts` 檔頭註解。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dropIntent.ts web/src/components/planDrag.ts web/src/components/Timeline.tsx web/src/components/Wishlist.tsx web/src/styles.css web/test
git commit -m "web：拖曳放在卡片中間是合併、邊緣是換順序；候選、備卡也能拖（T15m 第四輪）"
```

---

### Task 6: 交通卡：不收合、圓角、在右側原地改

**Files:**
- Modify: `web/src/components/LegRow.tsx`（`LegRow`、`LegEditor`）
- Modify: `web/src/lib/planView.ts`（`legText`、`legDetail`、`daySummary`、`MODE_LABELS` 如果在這裡）
- Modify: `web/src/components/Timeline.tsx`（`DaySummaryLine` 的註解「含緩衝」）
- Modify: `web/src/styles.css`
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Leg.trip`／`prevTrip`／`nextTrip`／`transitAvailable`／`waitMinutes`、`TravelSpec.trip`、`mode: 'transit'`；`setLegTravel`
- Produces:
  - `legText(leg: Leg): string`：圖示、方式、分鐘、距離以外的部分（例如 `🚕 12 分・大型 2 台`、`🚃 34 分・等 11 分`）；不再有緩衝。
  - `EDITOR_MODES = ['auto', 'walk', 'taxi', 'transit'] as const`（`auto`＝不寫 `mode`）
  - `editorModeOf(spec: TravelSpec | null): 'auto' | 'walk' | 'taxi' | 'transit' | 'legacy'`：舊的 `train`、`bus`、`ferry` 顯示成 `transit`；`charter`、`car`、`other` 是 `legacy`（選單上四個都不亮，卡片照原名顯示）。

- [ ] **Step 1: 寫失敗的測試**

```ts
test('legText：等車寫在交通卡，沒有緩衝', () => {
  assert.equal(legText(leg({ mode: 'train', minutes: 34, waitMinutes: 11 })), '🚃 34 分・等 11 分');
  assert.equal(legText(leg({ mode: 'taxi', minutes: 12, taxi: { cars: 4, jumboCars: 2 } })), '🚕 12 分・大型 2 台或 4 台');
});
test('editorModeOf：舊的方式對到新選單', () => {
  assert.equal(editorModeOf(null), 'auto');
  assert.equal(editorModeOf({ mode: 'bus' }), 'transit');
  assert.equal(editorModeOf({ mode: 'charter' }), 'legacy');
});
test('daySummary：交通總分鐘不含緩衝', () => { /* 改現有測試：期望值去掉緩衝 */ });
```
（`legText` 的台數寫法照現有 `LegRow` 的「大型 N 台或 M 台」；距離由元件接在後面。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 實作**

- `LegRow`：圓角卡片（和資料卡同樣的圓角、淺灰底），內容一直顯示：第一行 `legText`＋距離（現有的 `distance` 算法）＋ `📝 備註`＋小的 Google Maps 圖示連結（`data-testid="leg-maps"`，`aria-label="在 Google Maps 開路線"`）；電車、巴士、船下面每一程一行（`rideLines`）。拿掉 `▾`／`▴`、`aria-expanded`、`leg-detail` 的收合。
- 點卡片：`uiStore.legOpen` 照舊切換（地圖只亮這段的 effect 不變）；**規劃模式下**被選的那張就是編輯狀態（`data-testid="leg-editor"`），不跳視窗：
  - 一排四個方式按鈕（`data-mode="auto|walk|taxi|transit"`）；`leg.transitAvailable === false` 時 `transit` disabled，旁邊寫「這兩點之間沒有電車或巴士」。
  - `transit`（或目前 leg 是電車／巴士／船）時：列出目前這班（`leg.trip`，粗體 `HH:MM → HH:MM`、轉幾次、每程摘要），下面 `‹ 前一班`（`leg.prevTrip`，沒有就 disabled）、`後一班 ›`（`leg.nextTrip`）；按了 `setLegTravel(it, target, { ...spec, mode: spec?.mode ?? 'transit', trip })`。介面用清單的形狀（之後 RAPTOR 會有好幾條），這一輪只有一條。
  - 「自己填分鐘」輸入框只在 `leg.mode === 'unknown'` 時出現。
  - 備註照舊。拿掉緩衝的 ±、拿掉包車、自駕、其他、電車、巴士、船按鈕。
  - 「完成」按鈕（`data-testid="leg-done"`）＝`legOpen: null`。
- 換方式時清掉 `trip`（換成步行、計程車、自動時存 `{ mode, note }`，不帶 `trip`）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/LegRow.tsx web/src/lib/planView.ts web/src/components/Timeline.tsx web/src/styles.css web/test/lib.test.ts
git commit -m "web：交通卡不收合、圓角、規劃模式原地改（四種方式、前一班後一班）（T15m 第四輪）"
```

---

### Task 7: 右上角的整趟工具列、討論和預約的彈窗

**Files:**
- Modify: `web/src/components/TopBar.tsx`（`DayTools` 搬家、改名）、`web/src/components/MeMenu.tsx`（如果要包在同一組）
- Modify: `web/src/components/MapPanel.tsx`（彈窗、點地圖關掉、標題「討論」）
- Modify: `web/src/components/MapView.tsx`（地圖點擊時 `closeMapPanel()`）
- Modify: `web/src/styles.css`
- Test: `web/e2e/t15m.spec.ts`（Task 10 一起跑）；純邏輯沒有新增

**Interfaces:**
- Consumes: 現有的 `openMapPanel`、`closeMapPanel`、`useUi((s) => s.mapPanel)`
- Produces: 工具列元件 `TripTools`（`data-testid` 沿用 `toolbar-comments`、`toolbar-reservations`、`toolbar-more`、`export-json`），放在 `MeMenu` 旁邊（電腦、手機兩處都是 `MeMenu` 現在的位置）；日期列只剩日期。

- [ ] **Step 1: 實作**

- `DayTools` 改名 `TripTools`、從日期列拿出來，和 `MeMenu` 放在一起（同一個容器 `.trip-tools`）；按鈕文字改成 `💬 討論 N`、`📋 預約 N`、`⬇`（下載直接是按鈕，不再藏在 ⋯ 選單裡：`toolbar-more` 這個 testid 給下載按鈕，`export-json` 也留在同一個按鈕上，e2e 兩個都找得到）。
- `MapPanel`：電腦版是浮在地圖上的大視窗，四周留地圖：左右各至少地圖寬度的 15%、上下各至少 48px（CSS 變數，方便調）；沒有遮罩，彈窗外的地圖照樣看得到、點得到。點地圖（`MapView` 的地圖 `click` 事件、或 `.map-col` 的 pointerdown 落在彈窗外）就 `closeMapPanel()`；✕ 照舊。手機：從下方拉起、高度 80vh 的面板，上方露出的地圖點了就關。
- 標題的「留言」改「討論」（`2/5（五）的討論`、`整趟的討論`）；`aria-label` 跟著改。

- [ ] **Step 2: 跑檢查**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TopBar.tsx web/src/components/MeMenu.tsx web/src/components/MapPanel.tsx web/src/components/MapView.tsx web/src/styles.css
git commit -m "web：討論、預約、下載搬到右上角和帳號一起，彈窗四周留地圖、點地圖就關（T15m 第四輪）"
```

---

### Task 8: 顏色和地圖：每天的色盤避開類型色、某天只畫那天、編號用類型色

**Files:**
- Modify: `web/src/lib/visual.ts`（`DAY_PALETTE`）
- Modify: `web/src/lib/overlays.ts`（`itineraryFeatures`）、`web/src/components/MapView.tsx`（編號圓的顏色、點卡片時標記跳一下）
- Modify: `web/src/components/Timeline.tsx`（`focusPlace` 觸發跳一下）
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Consumes: `TYPE_COLORS`（`web/src/lib/typeStyle.ts`）
- Produces:
  - `hueOf(hex: string): { h: number; s: number; l: number }`（放在 `visual.ts`，測試用）
  - `itineraryFeatures(...)` 在 `day !== 'all'` 時只回傳那天的線和備選點（其他天不畫）
  - 地圖的編號圓（`places-mark`）顏色＝那個點的類型色；feature 屬性多 `typeColor`

- [ ] **Step 1: 寫失敗的測試**

```ts
test('每天的色盤：12 色、不重複、避開類型色', () => {
  assert.equal(DAY_PALETTE.length, 12);
  assert.equal(new Set(DAY_PALETTE).size, 12);
  for (const c of DAY_PALETTE) {
    const a = hueOf(c);
    if (a.s < 0.15) continue; // 灰色不算撞色
    for (const t of Object.values(TYPE_COLORS)) {
      const b = hueOf(t);
      const d = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
      assert.ok(d >= 25, `${c} 和類型色 ${t} 太像（色相差 ${d.toFixed(0)}°）`);
    }
  }
});
test('itineraryFeatures：選了某天只畫那天', () => { /* 兩天的行程、day = 第一天 → lines 只有第一天的 date */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL（現在的色盤有橘、綠、紫；選某天時還會畫其他天）

- [ ] **Step 3: 實作**

- 換 `DAY_PALETTE` 成 12 個通過測試、彼此分得出來的顏色（`DAY_PALETTE` 要 export 給測試）。
- `itineraryFeatures`：`day !== 'all'` 時跳過其他天（`active` 屬性和相關的淡化圖層照舊可以留著給「全部」用）。
- `MapView`：`places-mark` 的 `circle-color` 改讀 `typeColor`；`Timeline` 的 `Mark` 已在 Task 4 改成類型色，這裡確認兩邊一致。
- 點卡片時（`focusPlace`）地圖上那個編號標記放大再縮回來約 0.8 秒（用 feature-state 或暫時的圖層，方法由實作的人決定；`prefers-reduced-motion` 時不做）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/visual.ts web/src/lib/overlays.ts web/src/components/MapView.tsx web/src/components/Timeline.tsx web/test/lib.test.ts
git commit -m "web：每天的色盤避開類型色、選某天只畫那天、編號用類型色（T15m 第四輪）"
```

---

### Task 9: 探索、想去、詳情：流程收斂、複製鍵、淡底色

**Files:**
- Modify: `web/src/components/Explore.tsx`（探索卡片拿掉 `AddToDay`、名稱旁的複製鍵、卡片底色 class）
- Modify: `web/src/components/ExploreWall.tsx`（底色，如果卡片在這裡畫）
- Modify: `web/src/components/Wishlist.tsx`（`WishExtras` 拿掉「設為 xx 的住宿」）
- Modify: `web/src/components/DetailPanel.tsx`（`<h2>` 旁的複製鍵）
- Create: `web/src/components/CopyName.tsx`
- Modify: `web/src/lib/` 放 `copyText(place)` 的純函式（例如 `web/src/lib/labels.ts`）
- Modify: `web/src/styles.css`
- Test: `web/test/lib.test.ts`

**Interfaces:**
- Produces:
  - `copyText(place: Place): string`：日文名稱（`name.ja`），沒有就中文（`name.zh`）
  - `CopyName({ place }: { place: Place })`：小按鈕 `data-testid="copy-name"`、`aria-label="複製名稱"`；按了 `navigator.clipboard.writeText(copyText(place))`，成功 `shared.notify('已複製：{文字}')`，失敗（沒有權限）提示錯誤；`onClick` 要 `stopPropagation`（卡片點了會開詳情）、按鈕 `draggable={false}`。

- [ ] **Step 1: 寫失敗的測試**

```ts
test('copyText：日文名稱優先，沒有用中文', () => {
  assert.equal(copyText(place({ name: { ja: '鳥羽水族館', zh: '鳥羽水族館（中）' } })), '鳥羽水族館');
  assert.equal(copyText(place({ name: { ja: '', zh: '海女小屋' } })), '海女小屋');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 實作**

- 探索卡片（非 wish 那支）拿掉 `.ex-add` 和 `AddToDay`；❤️ 是探索卡上最主要的按鈕（樣式加強由實作的人決定）。`Explore.tsx` 檔頭註解改成只有想去有「加到某天」。
- `WishExtras` 拿掉 `wish-set-lodging` 按鈕和它用到的 `planning`／`day`／`isLodging`（如果沒有別處用）。
- 探索、想去卡片的名稱旁加 `CopyName`（大照片、只有文字兩種檢視都要）；詳情的 `<h2>` 旁加 `CopyName`。
- 探索、想去卡片加 `type-<placeType>` class，淡底色和 Task 4 同一組 CSS 變數。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test`、`npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Explore.tsx web/src/components/ExploreWall.tsx web/src/components/Wishlist.tsx web/src/components/DetailPanel.tsx web/src/components/CopyName.tsx web/src/lib web/src/styles.css web/test/lib.test.ts
git commit -m "web：探索拿掉加到某天、想去拿掉設為住宿、名稱加複製鍵、卡片淡底色（T15m 第四輪）"
```

---

### Task 10: 完成條件、截圖、文件

**Files:**
- Modify: `web/e2e/t15m.spec.ts`、`web/e2e/flows.spec.ts`（照新的介面改：沒有「換住宿」、沒有「併到…」、沒有緩衝、交通卡不展開、工具列位置、探索沒有加到某天）
- Create: `web/e2e/shots-round4.mjs`（參考 `shots-round3.mjs`）
- Modify: `docs/superpowers/specs/2026-10-25-itinerary-round4-design.md`（最上面加「> **已實作**（計畫：`docs/superpowers/plans/2026-10-25-itinerary-round4.md`）。」）
- Modify: `docs/PLAN.md`（T15m 那列的說明如果有提到緩衝、換住宿就更新；T15 任務卡註明 `TravelSpec.trip`、`transit` 要接到 worker 的驗證）

- [ ] **Step 1: 改 e2e，加三條流程**

1. 規劃模式下把一間餐廳卡片拖到另一間餐廳卡片中間 → 那張卡出現 `option-stack`、👑；提示有 `toast-undo`，按了回到兩張卡片。
2. 規劃模式下把候選拖到兩張卡片之間 → 時間軸多一站、候選少一筆。
3. 點 💬 討論 → 彈窗出現；點彈窗外面的地圖 → 彈窗關掉。

- [ ] **Step 2: 跑 e2e**

Run: `npm run e2e`
Expected: 全部 PASS

- [ ] **Step 3: 截圖給 👤 看**

Run: `node web/e2e/shots-round4.mjs`（手機 390×844、電腦 1440×900：某一天的時間軸含合併卡片和交通卡、規劃模式改交通、拖曳合併的提示、討論彈窗、整趟的地圖顏色）
Expected: 截圖存在腳本印出的資料夾，沒有錯誤

- [ ] **Step 4: 全部檢查**

Run: `npm test`、`npm run typecheck`、`npm run validate`、`npm run build`
Expected: 全部通過

- [ ] **Step 5: Commit**

```bash
git add web/e2e docs
git commit -m "T15m 第四輪：e2e、截圖、文件"
```
