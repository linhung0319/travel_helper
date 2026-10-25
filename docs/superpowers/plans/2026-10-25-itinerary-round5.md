# 時間軸版面、交通卡步驟、班次表、編輯入口、時間條、顏色：實作計畫（T15m 第五輪）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 時間軸用一條虛線串起資料卡和窄的交通卡；大眾運輸的交通卡可以展開成由上到下的步驟、每一程都能從「搭得到的班次」裡選，地圖那側有班次表；「規劃模式」改成顯眼的「✏️ 編輯這天」；時間條、候選、地圖彈窗、交通圖示、每天的顏色照第五輪設計重做。

**Architecture:** 引擎（`packages/engine`）多給每段交通的步驟資料（前後步行、每一程走到上車站的時間）、列出一程的所有班次、記每一程的選定班次；畫面的判斷（編號、步驟、等待說明、時間條段落、班次分類、距離）放在 `web/src/lib/planView.ts` 等純函式並寫單元測試，元件只負責呈現。

**Tech Stack:** TypeScript、React 19、Zustand vanilla、MapLibre、node:test（`npm test`）、Playwright（`npm run e2e`）。

**Spec:** `docs/superpowers/specs/2026-10-25-itinerary-round5-design.md`（接在第四輪 `2026-10-25-itinerary-round4-design.md` 後面，衝突以第五輪為準）。草圖在 `.superpowers/brainstorm/34286-1792907602/content/`（不進 git，實作時可以打開看）。

## Global Constraints

- 所有路徑在 worktree `D:\workspace\travel_helper-t15m`（分支 `t15m`），指令在這個目錄的根跑。
- 文件、註解、commit 訊息用繁體中文；commit 結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。
- 每個任務結束前 `npm test`、`npm run typecheck`、`npm run validate` 都要過，過了就 commit（👤 2026-10-25 說不用停下來問）。
- 不改 `worker/`（留給 T15）；AI 的部分留給 T16m。
- 程式風格照現有檔案：檔頭一段中文註解說明用途、函式上方一行 `/** */`；改到的檔頭註解跟著更新（「規劃模式」→「編輯」、「空檔」、「這天的候選」、「‹ ›」等描述）。
- 類型色用 `web/src/lib/typeStyle.ts` 的 `TYPE_COLORS`（景點 `#1a7f37`、住宿 `#8250df`、餐廳 `#d1501a`、車站 `#1f6feb`），不要另寫一份。
- 每天的顏色：`DAY_PALETTE = ['#c2255c', '#0b7285', '#343a40', '#8b5a2b']`，照日期順序輪流。
- 交通圖示色塊：步行 `#5f6b7a`（白圖）、計程車 `#2b2b2b`（圖 `#ffd400`）、巴士 `#00838f`（白圖）、電車 `#c62828`（白圖）；船、包車、自駕、其他由實作的人定（避開類型色和上面四色）。
- 停留時間格式 `X小時MM分`（`1小時00分`、`0小時45分`），只用在資料卡停留和時間條摘要的交通總時間；交通卡的分鐘照舊寫 `115 分`、`等 43 分`。
- 畫面上「規劃模式」一律改成「編輯」；store 的 `planning` 欄位、`setPlanning`、testid 名稱可以不改（避免牽動太多）。
- 「候選」取代「這天的候選」。
- 舊的行程 JSON 不用遷移：`trip` 只有第一程（沒有 `rides`）照樣合法。
- 電腦版判斷用 `DESKTOP_QUERY`（`web/src/hooks.ts`，900px）。

## Review Focus

1. **近鐵轉乘、選了第一程比較晚的車，舊的第二程接不上**：第二程自動改成從轉乘站接得上的最早一班，不報錯 → Task 1 測試 `換第一程後第二程接不上：改最早接得上的`。
2. **選定的班次變成搭不到（前一站停留加長）**：卡片照樣顯示那班＋⚠「趕不上 HH:MM 這班」；班次下拉和班次表裡那班標成選定＋搭不到，其他搭不到的照樣不能選 → Task 2 測試 `departureRows：選定的那班搭不到`。
3. **回到的住宿和出發的住宿是同一間**（連住）：時間軸 0 和最後一號都顯示；地圖上整天畫 0、點了最後一段畫最後一號 → Task 2 測試 `mapMark：起終點同一點`。
4. **航班的日子**（2/2 從機場出發、2/13 到機場）和**分組的日子**：起點 0、終點最後一號、分組照組的順序連續編 → Task 2 測試 `stopMarks：航班、分組`。
5. **路線距離還沒查到**（OSRM 失敗或還在查）：交通卡顯示直線距離加「（直線）」，點開後距離不跳 → Task 2 測試 `legDistance：沒有快取時直線`；Task 5 e2e `點交通卡距離不變`。

---

### Task 1: 引擎：步驟資料、一程的所有班次、每一程的選定班次

**Files:**
- Modify: `packages/engine/src/types.ts`（`TransitRide`、`TripRef`、`Leg`）
- Modify: `packages/engine/src/travel.ts`（`trainCandidate`、`routeCandidates`、`fromCandidate`、`tripLeg`；新的 `rideDepartures`）
- Modify: `packages/engine/src/transit.ts`（如果 `directTrains` 不夠用才加）
- Modify: `packages/engine/src/index.ts`（匯出 `rideDepartures`、`RideDeparture`）
- Modify: `packages/engine/src/ops.ts`（`validateItinerary` 接受 `trip.rides`）
- Modify: `docs/CONVENTIONS.md`（行程格式 `trip` 那幾行，約 349～352 行：加 `rides`）
- Test: `packages/engine/test/travel.test.ts`

**Interfaces:**
- Produces（型別）：
  - `TransitRide` 加 `routeId?: string | null`（巴士、船、JR 的路線時刻表 id；近鐵是 null）。
  - `TripRef` 加 `rides?: string[] | null`：每一程的 tripId（依序）；沒有＝只有第一程（`id`）。
  - `Leg` 加 `walkBefore?: number`（走到第一個上車點的分鐘，已進位）、`walkAfter?: number`（最後下車走到終點的分鐘，已進位）、`ready?: TimeString[]`（每一程「走到上車站／轉乘完」的時間，和 `rides` 等長：第一程＝出發＋`walkBefore`，之後＝前一程到站＋`minTransfer`）。不是大眾運輸時這三個是 undefined。
  - `interface RideDeparture { tripId: string; line: string; depart: TimeString; arrive: TimeString }`
  - `rideDepartures(data: EngineData, cfg: EngineConfig, date: DateString, ride: TransitRide): RideDeparture[]`：**同一對站**（`ride.from` → `ride.to`）那天的所有班次，依發車排序。近鐵用 `directTrains`（`from`／`to` 是車站 ID，不要轉乘、不含 `off` 的）；路線時刻表用 `ride.routeId` 找同一條路線、同一個上車停留所和下車停留所的班次。查不到回傳 `[]`。
- 引擎的選班規則：
  - `trip.rides` 有第 2 個以上的 id 時，`tripLeg` 先照第一程找候選（現有做法），再把後面每一程換成指定的那班；**那班接不上**（發車 < 前一程到站＋`minTransfer`）或時刻表裡找不到，就改成同一對站接得上的最早一班。前面那程永遠不被後面改。
  - 只有一程的（巴士、船）`rides` 忽略第 1 個以後的。

- [ ] **Step 1: 寫失敗的測試**（`packages/engine/test/travel.test.ts`，用現有測試裡的近鐵、路線時刻表 fixture）

```ts
test('大眾運輸的 Leg 有 walkBefore、walkAfter、ready', () => {
  // 選一段會搭巴士的（現有 fixture 裡巴士那組）
  const { leg } = planLeg(a, b, ctx, { mode: 'transit' });
  assert.equal(leg.ready!.length, leg.rides.length);
  assert.equal(leg.ready![0], fromMinutes(toMinutes(leg.depart) + leg.walkBefore!));
  assert.equal(leg.walkBefore! + leg.walkAfter!, leg.walkMinutes); // 只有一程、沒有轉乘步行時
});

test('rideDepartures：同一對站的所有班次，依發車排序', () => {
  const deps = rideDepartures(data, cfg, date, leg.rides[0]);
  assert.ok(deps.length >= 2);
  assert.ok(deps.some((d) => d.tripId === leg.rides[0].tripId));
  assert.deepEqual(deps.map((d) => d.depart), [...deps.map((d) => d.depart)].sort());
});

test('rideDepartures：近鐵只列直達（不轉乘）', () => {
  // 近鐵轉乘的那段：第二程的站對
  for (const d of rideDepartures(data, cfg, date, transferLeg.rides[1])) assert.ok(d.arrive > d.depart);
});

test('換第一程後第二程接不上：改最早接得上的', () => {
  // transferLeg 的 trip.rides＝[晚一班的第一程, 原本的第二程]
  const { leg } = planLeg(a, b, ctx, { mode: 'transit', trip: { ...trip, id: later.tripId, depart: later.depart, rides: [later.tripId, transferLeg.rides[1].tripId!] } });
  assert.equal(leg.rides[0].tripId, later.tripId);
  assert.ok(toMinutes(leg.rides[1].depart) >= toMinutes(leg.rides[0].arrive) + cfg.transit.minTransfer);
});

test('指定第二程：接得上就用那班', () => { /* rides[1] 指定後一班，leg.rides[1].tripId 等於它 */ });
test('舊的 trip（沒有 rides）照樣用第一程', () => { /* 和第四輪的結果相同 */ });
test('validateItinerary 接受 trip.rides', () => { /* 沒有錯誤 */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 上面幾個 FAIL（`rideDepartures` 沒定義、`ready` 是 undefined）。

- [ ] **Step 3: 實作**：`Candidate` 已經有 `access`、`pair.walkTo`／`walkOf(toMeters)`，在 `fromCandidate` 寫進 `walkBefore`、`walkAfter`、`ready`；`routeCandidates` 的 ride 帶 `routeId: r.routeId`；`toTrip` 寫 `rides: c.rides.map((r) => r.tripId ?? '')`；`tripLeg` 加後面幾程的替換；新增 `rideDepartures`。CONVENTIONS 的 `trip` 說明加一行：`rides`：每一程的 tripId，選了第二程以後的班次才有；接不上時引擎改成接得上的最早一班。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run typecheck && npm run validate`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/engine docs/CONVENTIONS.md
git commit -m "引擎：交通的步驟資料、一程的所有班次、每一程的選定班次（T15m 第五輪）"
```

---

### Task 2: 畫面的純函式：編號、步驟、等待、時間條、班次、距離、色盤

**Files:**
- Modify: `web/src/lib/planView.ts`
- Modify: `web/src/lib/visual.ts`（`DAY_PALETTE`）
- Test: `web/test/lib.test.ts`（或照現有的分檔放；第四輪的色盤 ΔE 測試在這裡，跟著改）

**Interfaces:**
- Consumes: Task 1 的 `Leg.walkBefore`／`walkAfter`／`ready`、`RideDeparture`。
- Produces:
  - `formatStay(minutes: number): string` 改成 `X小時MM分`：`formatStay(45) === '0小時45分'`、`formatStay(60) === '1小時00分'`、`formatStay(315) === '5小時15分'`。（現有呼叫的地方全部跟著換；交通分鐘不用它。）
  - `stopMarks(day, isLodging)` 改成全部數字：起點（`start`，不管住宿、機場、其他）是 `'0'`，之後照現在的順序（分組：先各組的點、再會合點）`'1'`、`'2'`…，終點（`lodging` 或出發航班 `flight` depart）接著編。回傳型別不變（`byEntry`、`byPlace`），但 `byPlace` 改成**只放最後算出的那一個號碼的規則交給 `mapMark`**：`byPlace: Map<string, string[]>`（同一點的所有號碼，依時間順序）。
  - `mapMark(marks: string[], scope: 'day' | 'leg' | 'trip', leg?: { from: string; to: string } | null, placeId?: string): string`：
    - `'day'`：起終點同一點（號碼裡有 `'0'`）→ `'0'`；其他多個號碼 → 用 `・` 連起來（照現在）。
    - `'leg'`：這段的終點是這個點 → 這段裡的號碼（最大那個），起點 → 較小那個。
    - `'trip'`：住宿 → `'0'`（隔天的起點；呼叫的人傳隔天的 marks）。
  - `cardTypeLetter(type: PlaceType | 'airport' | null): string`：`lodging→'宿'`、`spot→'景'`、`restaurant→'餐'`、`station→'站'`、`airport→'機'`、其他／null→`'點'`。
  - `type LegStep = { kind: 'node'; time: string; name: string; wait?: number } | { kind: 'walk'; minutes: number } | { kind: 'ride'; index: number; mode: TransitRide['mode']; line: string; depart: string; arrive: string; minutes: number }`
  - `legSteps(leg: Leg, fromName: string, toName: string, nameOf: (id: string) => string): LegStep[]`：沒有 `rides` 回傳 `[]`。順序：起點 node（`leg.depart`）→ walk（`walkBefore`，0 分就省略）→ 上車站 node（`ready[0]`，`wait`＝第一程發車−`ready[0]`，0 就不寫）→ ride → 轉乘站 node（到站時間，`wait`＝下一程發車−到站）→ ride …→ 下車站 node → walk（`walkAfter`）→ 終點 node（`leg.arrive`）。下車站就是終點（`walkAfter` 0）時合成一個 node。
  - `waitNote(entry: TimelineEntry, item: VisitItem | null, place: Place | undefined): string | null`：`entry.waitMinutes <= 0` → null；有 `item.start`（📌）→ `⏳ ${arrive} 到，等 ${n} 分（${mealLabel}📌 ${start} 才開始）`（`mealLabel` 是 `'午餐 '`／`'晚餐 '` 或空字串，從 `entry.mealTag`）；否則有開門時間造成的等 → `⏳ … 等 N 分（HH:MM 才開門）`；其他 → `⏳ ${arrive} 到，等 ${n} 分`。
  - `dayBar(day: DayPlan, typeOf: (placeId: string | null) => PlaceType | null): BarSegment[]`：`BarSegment.kind` 改成 `'spot' | 'restaurant' | 'other' | 'travel' | 'wait'`，加 `mark: string | null`（卡片編號，給段落裡寫字用）。交通卡裡的等車（`travel.waitMinutes`）也切成 `wait` 段，放在交通段中間的正確時間（`ready[0]` 到第一程發車）。分組照現在的 `lane`。
  - `type DepartureRow = RideDeparture & { state: 'missed' | 'ok' | 'selected'; wait: number | null; missedSelected?: boolean }`
  - `departureRows(deps: RideDeparture[], readyAt: string, selectedTripId: string | null): DepartureRow[]`：發車 < `readyAt` → `missed`（`wait` null）；是選定的 → `selected`（搭不到時 `missedSelected: true`）；其他 `ok`，`wait`＝發車−`readyAt`。
  - `legDistance(leg: Leg, from: Place, to: Place, roads: { cachedMeters(p: 'foot' | 'car', a: LonLat, b: LonLat): number | null }, ridePathMeters: number | null): { meters: number; straight: boolean }`：步行用 `foot`、計程車和其他車用 `car` 的快取；大眾運輸用傳進來的路徑長度；都沒有 → 直線、`straight: true`。
  - `DAY_PALETTE` 改成 4 色（Global Constraints）；`dayColor` 照舊（`i % length`）。

- [ ] **Step 1: 寫失敗的測試**

```ts
test('formatStay：X小時MM分', () => {
  assert.equal(formatStay(45), '0小時45分');
  assert.equal(formatStay(60), '1小時00分');
  assert.equal(formatStay(315), '5小時15分');
});
test('stopMarks：起點 0、回住宿接著編', () => { /* 2/3 形狀：start 住宿、2 個 visit、lodging → '0','1','2','3' */ });
test('stopMarks：航班、分組', () => { /* 起點是航班抵達（機場）→ '0'；分組：先各組的點、再會合點，連續編 */ });
test('mapMark：起終點同一點', () => {
  assert.equal(mapMark(['0', '3'], 'day'), '0');
  assert.equal(mapMark(['0', '3'], 'leg', { from: 'x', to: 'h' }, 'h'), '3');
  assert.equal(mapMark(['1', '4'], 'day'), '1・4');
});
test('legSteps：步行→等車→巴士→步行', () => {
  // leg：depart 15:01、walkBefore 14、ready ['15:15']、rides[0] 15:58→16:48、walkAfter 8、arrive 16:56
  const s = legSteps(leg, '伊雜宮', '大王埼燈塔', (id) => id);
  assert.deepEqual(s.map((x) => x.kind), ['node', 'walk', 'node', 'ride', 'node', 'walk', 'node']);
  assert.equal((s[2] as { wait?: number }).wait, 43);
});
test('legSteps：計程車沒有步驟', () => { assert.deepEqual(legSteps(taxiLeg, 'a', 'b', (x) => x), []); });
test('waitNote：📌 午餐', () => {
  assert.equal(waitNote(entry /* arrive 10:53, start 12:00, waitMinutes 67, mealTag 'lunch' */, { ...visit, start: '12:00' }, place), '⏳ 10:53 到，等 67 分（午餐 📌 12:00 才開始）');
});
test('dayBar：類型色段落、交通、等待', () => { /* 2/3 形狀 → kinds ['travel','spot','travel','wait','restaurant','travel']，mark '1','2' */ });
test('departureRows：搭不到、搭得到、選定', () => { /* readyAt 15:15：13:28 missed、15:58 selected wait 43、17:08 ok wait 113 */ });
test('departureRows：選定的那班搭不到', () => { /* readyAt 16:00、選定 15:58 → state selected、missedSelected true */ });
test('legDistance：沒有快取時直線', () => { /* roads 回傳 null → straight true */ });
test('DAY_PALETTE：4 色彼此、和類型色分得出來', () => { /* 改寫第四輪的 ΔE 測試，門檻照原本 */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test`
Expected: 新測試 FAIL。

- [ ] **Step 3: 實作上面的函式**；`stopMarks` 改型別後，`Timeline.tsx`、`MapView.tsx`／`overlays.ts` 讀 `byPlace` 的地方先改成 `mapMark(…, 'day')`，讓畫面維持能跑（Task 9 再接 `leg`、`trip` 兩種）。`DayBar` 先接新的 `dayBar` 簽名（Task 8 再重畫）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run typecheck && npm run validate`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib web/src/components web/test
git commit -m "web：編號從 0 起、步驟、等待說明、時間條段落、班次分類、路線距離、4 色色盤（T15m 第五輪）"
```

---

### Task 3: 交通圖示（SVG）和地圖上的路線標籤

**Files:**
- Create: `web/src/components/ModeIcon.tsx`
- Modify: `web/src/lib/overlays.ts`（`RouteLabel` 加 `mode`、`minutes`）、`web/src/components/MapView.tsx`（路線標籤的 DOM：圖示＋分鐘，約 453～510 行）、`web/src/styles.css`
- Test: `web/test/lib.test.ts`（`routeLabels` 的新欄位）

**Interfaces:**
- Produces:
  - `MODE_ICON: Record<'walk' | 'taxi' | 'bus' | 'train' | 'ferry' | 'car', { bg: string; fg: string; path: string }>`（`path` 是 24×24 viewBox 的 SVG path：Material Icons 的 directions_walk、local_taxi、directions_bus、train、directions_boat、directions_car；`charter`、`car`、`other` 用 car）。
  - `modeIconKey(mode: Leg['mode'] | TransitRide['mode'] | 'transit'): keyof typeof MODE_ICON`（`transit` 用第一程的方式，呼叫的人給；沒有就 bus）。
  - `<ModeIcon mode={…} size="l" | "s" />`：`l`＝30px 方塊、20px 圖；`s`＝20px、14px 圖；`aria-label` 寫方式中文名。
  - `modeIconHtml(key, size): string`：給 MapLibre 的 DOM 標記用（同一份 `MODE_ICON`）。
  - `RouteLabel` 加 `mode: Leg['mode']`、`minutes: number | null`；`text` 留著給 e2e 讀（例如 `16 分`，不含 emoji）。

- [ ] **Step 1: 寫失敗的測試**：`routeLabels` 回傳的 `text` 不含 emoji（`/\p{Extended_Pictographic}/u` 不符合）、有 `mode`。
- [ ] **Step 2: 跑測試確認失敗**（`npm test`）。
- [ ] **Step 3: 實作**；`MapView` 的路線標籤和交通標籤（`route-label`、`leg-label`）改成 `modeIconHtml(…, 's') + 分鐘`。
- [ ] **Step 4: `npm test && npm run typecheck && npm run validate` 全過。**
- [ ] **Step 5: Commit**：`web：交通圖示改成 SVG 色塊，地圖路線標籤用圖示（T15m 第五輪）`

---

### Task 4: 時間軸版面：虛線、資料卡（色塊、編號、停留時間）、等待那條、候選

**Files:**
- Modify: `web/src/components/Timeline.tsx`（`Mark`、`EntryRow`、`StayChip`、`GapRow`、`Timeline`）
- Modify: `web/src/components/Wishlist.tsx`（`CandidateRow`、`DayCandidates`）
- Modify: `web/src/lib/planView.ts`（`timelineRows` 不再放 `idle` 空檔列）
- Modify: `web/src/styles.css`
- Test: `web/test/lib.test.ts`（`timelineRows`）、e2e 在 Task 10

**Interfaces:**
- Consumes: Task 2 的 `stopMarks`、`cardTypeLetter`、`formatStay`、`waitNote`。
- Produces: CSS class（後面任務共用）：`.tl-rail`（時間軸外層，畫左邊虛線；虛線的 x 對齊資料卡色塊中心）、`.tl-card-type`（34px 類型色塊）、`.tl-card-no`（右上角編號圓圈，類型色實心白字）、`.tl-wait`（黃色虛框的等待那條）、`.tl-leg`（交通卡：左邊縮排讓出虛線、右緣和資料卡對齊）。

- [ ] **Step 1: 寫失敗的測試**：`timelineRows` 不再產生 `kind: 'gap'` 的 `idle` 列（`lodging` 的「住宿（未排）」照舊）。
- [ ] **Step 2: `npm test` 確認失敗。**
- [ ] **Step 3: 實作**
  - 資料卡：左邊 `.tl-card-type`（`cardTypeLetter`，背景 `TYPE_COLORS`，車站／使用者的點用中性灰），右上 `.tl-card-no`（`stopMarks` 的號碼，背景類型色）；拿掉名稱前的 emoji 類型圖示和現在左邊的編號。
  - 停留時間：`StayChip` 用 `formatStay`，`font-variant-numeric: tabular-nums`，最小寬度固定（例如 `min-width: 5.5em`、置中）；時間範圍也用等寬數字。
  - 等待：交通卡（`LegRow`）之後、下一張資料卡之前畫 `.tl-wait`（文字＝`waitNote`）；點它做現在 `GapRow` 展開的事（看附近的餐廳）。拿掉 `GapRow` 的 idle 列、`StartTime` 旁邊的「等 N 分」。
  - 候選：標題「候選 N」；`CandidateRow` 用和資料卡同一套外觀（淡底色、`.tl-card-type`），虛線框、沒有編號，下面一行「加的人」頭像；拿掉「進入規劃模式，就可以按 ↑ 排進行程」那行；編輯中左邊 `⠿`、右邊 `↑ 排進`（住宿 `↑ 設為這晚的住宿`）。
- [ ] **Step 4: `npm test && npm run typecheck && npm run validate` 全過**；`npm run dev -- --port 5191` 打開 2/3 看：虛線、0～3 的編號、`⏳ 10:53 到，等 67 分（午餐 📌 12:00 才開始）` 只出現一次、在計程車卡下面。
- [ ] **Step 5: Commit**：`web：時間軸虛線、資料卡類型色塊和編號、停留時間固定格式、等待合成一條、候選改樣子（T15m 第五輪）`

---

### Task 5: 交通卡：收起、展開步驟、原地編輯、班次下拉、路線距離

**Files:**
- Modify: `web/src/components/LegRow.tsx`
- Modify: `web/src/uiStore.ts`（`legOpen` 照舊；加 `timetable`，見 Task 6 的 Interfaces，這個任務先加欄位和 `openTimetable`）
- Modify: `web/src/styles.css`
- Test: `web/test/lib.test.ts`（純函式已在 Task 2）；e2e 在 Task 10

**Interfaces:**
- Consumes: Task 1 的 `rideDepartures`、`TripRef.rides`；Task 2 的 `legSteps`、`departureRows`、`legDistance`；Task 3 的 `ModeIcon`。
- Produces:
  - `uiStore` 的 `timetable: { date: string; legKey: string; rideIndex: number } | null`，`openTimetable(t)`、`closeTimetable()`。`legKey` 和現在 `LegRow` 的 `key` 同一個格式。
  - `selectRideTrip(target: LegTarget, leg: Leg, rideIndex: number, dep: RideDeparture): void`（放在 `LegRow.tsx` 匯出，Task 6 的班次表也用）：寫 `TravelSpec.trip`——`rideIndex 0` 時 `id`／`depart` 換成這班、`rides` 第 0 個換掉、後面保留（引擎會處理接不上）；`rideIndex > 0` 時 `id`、`depart` 照目前 `leg.trip`，`rides[rideIndex]` 換成這班。`from`／`to` 是這段的起訖。方式照舊不改（第四輪「換班次不改方式」）。

- [ ] **Step 1: 實作收起**：標題兩行（`ModeIcon size="l"`；第一行 `計程車 12 分`／`步行 16 分`／`大眾運輸 115 分`；第二行距離（`legDistance`，`straight` 時加「（直線）」）、台數、`含等車 N 分`、`📝 備註`）；右邊 Google Maps 小圖示、大眾運輸加 `▸`（編輯中換成 `改 ›`）。拿掉 `rideLines` 的清單（換成步驟）。
- [ ] **Step 2: 實作展開**：大眾運輸點卡片切換 `legOpen`（現有），展開時畫 `legSteps`：左邊時間欄、中間細線（步行點線、搭車用 `MODE_ICON[x].bg` 的粗實線、節點小圓圈）、右邊文字；`node.wait` 畫黃底 `⏳ 等 N 分`；`ride` 是膠囊按鈕 `[ModeIcon s] 路線名 HH:MM 發 › 班次`，下一行 `N 分`，點了 `openTimetable({ date, legKey: key, rideIndex })`（一般模式也可以）。步行、計程車點了照現在只亮地圖那段，不展開。
- [ ] **Step 3: 實作編輯狀態**：同一張卡加藍框；方式一排的 `自動` 寫成 `自動（${目前的方式中文名}）`；大眾運輸時步驟一定展開，膠囊換成 `<select>`（或自訂下拉）`HH:MM 發 ▾`：選項只列 `departureRows(...)` 裡 `ok`、`selected` 的（顯示 `15:58 發 → 16:48 到・等 43 分`），`missed` 的收成一行不能選的說明 `HH:MM 以前的 N 班搭不到`（`readyAt` 是 `leg.ready[rideIndex]`）；選了呼叫 `selectRideTrip`。拿掉 `‹ 前一班`、`後一班 ›`。
- [ ] **Step 4: 距離**：`legDistance` 的 `roads` 用 planStore 的 `RoadCache`（`cachedMeters`），大眾運輸的 `ridePathMeters` 用 `itineraryPathOf` 的路徑長度（`lineMeters`）；不再讀 `routes` 裡畫出來的那條（點開前後同一個數字）。
- [ ] **Step 5: `npm test && npm run typecheck && npm run validate` 全過**；dev 打開 2/4：115 分的卡平常收起、寫 `18.x 公里`（沒有「（直線）」，OSRM 有回應時），點了展開成 7 步、距離不變。
- [ ] **Step 6: Commit**：`web：交通卡收起展開、大眾運輸的步驟、編輯中選搭得到的班次、距離用路線（T15m 第五輪）`

---

### Task 6: 班次表（地圖那側的彈窗）

**Files:**
- Create: `web/src/components/TimetablePopup.tsx`
- Modify: `web/src/App.tsx`（掛在地圖區，和討論、預約彈窗同一層的容器）
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: Task 5 的 `uiStore.timetable`、`closeTimetable`、`selectRideTrip`；Task 1 的 `rideDepartures`；Task 2 的 `departureRows`；Task 3 的 `ModeIcon`。

- [ ] **Step 1: 實作**：讀 `timetable`，從 planStore 找到那天那段的 `Leg`（用 `legKey` 對到 entry），取 `leg.rides[rideIndex]`、`leg.ready[rideIndex]`，用 `rideDepartures(currentEngineData(), cfg, date, ride)` 列班次（`currentEngineData()` 是 null 時顯示「時刻表載入中」）。
  - 標題：`ModeIcon size="l"`＋路線名；下一行 `上車站 → 下車站・約 N 分`。
  - 藍底提示：`走到 ${站名}：${readyAt}（${前一站名} ${leg.depart} 出發）`，前面放步行小圖示；轉乘的那程寫「轉乘完」。
  - 清單：`departureRows` 每列 `發車｜到站｜等多久`；`missed` 灰底劃線＋「搭不到」，`ok` 綠底＋`等 N 分`（≥60 分用橘色字，寫成 `等 1小時53分`），`selected` 藍底＋`等 N 分・選定`（`missedSelected` 時寫 `搭不到・選定`）。
  - 班很多（> 8 班）：預設只列 `readyAt` 前 1 班、之後 4 班，加「看全部」。
  - 最下面：時刻表來源（`RouteTimetable` 的來源、取得日期，近鐵用 `KintetsuTimes` 的；沒有就不寫）。
  - 編輯中點 `ok` 那列＝`selectRideTrip`；一般模式點了沒反應（游標不是手指）。
  - 打開時地圖縮放到這一程、上車站 `commands.highlight`；✕、點地圖其他地方、換天、`legOpen` 收起時關掉。
  - 層級：和 §10 的地圖彈窗一樣高過日期列；電腦放在地圖區左上（不蓋住右邊的時間軸），手機是下方面板（同第四輪彈窗的手機做法）。
- [ ] **Step 2: `npm test && npm run typecheck && npm run validate` 全過**；dev 打開 2/4 點 `御座線 15:58 發 › 班次`，看到搭不到的灰、選定的藍。
- [ ] **Step 3: Commit**：`web：地圖那側的班次表（搭得到、搭不到、選定）（T15m 第五輪）`

---

### Task 7: 編輯入口：「✏️ 編輯這天」、編輯中的藍條和藍框

**Files:**
- Modify: `web/src/components/Planning.tsx`（`PlanningToggle`、`PlanningConfirmDialog`、`PlanningBar`、閒置退出的訊息）
- Modify: `web/src/components/DayPanel.tsx`（`DayHead`；藍條放在面板最上面；選「全部」時結束編輯）
- Modify: 其他寫「規劃模式」的元件（`App.tsx`、`DayPicker.tsx`、`DetailPanel.tsx`、`ItemTags.tsx`、`MeMenu.tsx`、`TopBar.tsx`、`Wishlist.tsx`、`Timeline.tsx`、`LegRow.tsx`）、`web/src/uiStore.ts` 的註解
- Modify: `web/src/styles.css`

- [ ] **Step 1: 實作**
  - `PlanningToggle` 平常是藍色實心按鈕 `✏️ 編輯這天`（日期列上最顯眼；`🤖 問 AI` 改成比較淡的文字按鈕）；編輯中不顯示（離開用藍條的「完成」）。
  - 進入前的確認對話框照舊，標題、按鈕改成「開始編輯？」「開始編輯」。
  - `PlanningBar` 變成時間軸面板最上面的藍條：`✏️ 編輯中・改了會自動存，大家都看得到`，右邊白底 `完成`；快照、儲存狀態照現在放在藍條裡（字小一點）。
  - 編輯中 `.day-panel` 加 `editing` class：2px 藍框；資料卡、候選卡左邊 `⠿`。
  - 第一次進編輯：時間軸上方一行 `拖 ⠿ 換順序；點交通卡改方式、班次`，有 ✕；看過記在 localStorage（`th-edit-hint-seen`，讀寫包 try/catch）。
  - 編輯中換天照樣在編輯；`commands.selectDay('all')`（或任何讓 `day` 變成 `'all'` 的操作）時 `setPlanning(false)`。
  - 全部畫面上的「規劃模式」改「編輯」（閒置退出：`N 分鐘沒有動作，已結束編輯`；快照視窗：`要復原，請先開始編輯。`）。
- [ ] **Step 2: `npm test && npm run typecheck && npm run validate` 全過**；`rg "規劃模式" web/src` 只剩註解裡講歷史的地方（最好是 0）。
- [ ] **Step 3: Commit**：`web：規劃模式改成「✏️ 編輯這天」、編輯中的藍條和藍框（T15m 第五輪）`

---

### Task 8: 時間條

**Files:**
- Modify: `web/src/components/Timeline.tsx`（`DaySummaryLine`、`DayBar`）、`web/src/components/DayPanel.tsx`（不再傳每天的顏色）
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: Task 2 的 `dayBar(day, typeOf)`、`formatStay`。
- Produces: `DayBar({ plan, selected }: { plan: DayPlan; selected?: string | null })`；`selected` 是目前點的卡片的 `itemId`（或交通卡的 `legKey`），那段加藍框。

- [ ] **Step 1: 實作**
  - 摘要：`09:30 出發 → 13:46 回住宿・交通 ${formatStay(n)}・⚠ N`（交通 < 60 分時寫 `39 分`；≥60 用 `formatStay`）。
  - 條高 22px、圓角；`spot`／`restaurant` 用 `TYPE_COLORS` 實心，夠寬（≥ 18px）時寫 `mark`（白字）；`travel` 是細的灰色點線（置中，約 6px 高）；`wait` 黃色斜紋（`repeating-linear-gradient(45deg, #f6d55c 0 4px, #fff7d6 4px 8px)`）；`other`（車站、使用者的點）中性灰。
  - 下面整點刻度（每個整點一條短線＋數字），兩端寫出發、回住宿時間。
  - 點一段：時間軸捲到那張卡並閃一下（用現在點卡片的閃爍）；點卡片、交通卡時 `selected` 那段加藍框（`outline: 2px solid #1a73e8`）。
  - 分組：`lane > 0` 的段落畫成上下幾條細條（一組一條，總高度不變），會合後回到一條。
- [ ] **Step 2: `npm test && npm run typecheck && npm run validate` 全過**；dev 看 2/3：綠 1、黃斜紋、橘 2。
- [ ] **Step 3: Commit**：`web：時間條改用類型色、等待斜紋、整點刻度，和卡片互相對應（T15m 第五輪）`

---

### Task 9: 地圖：彈窗變大在最上層、編號規則、整趟點某天

**Files:**
- Modify: `web/src/components/PreviewCard.tsx`、`web/src/components/MapView.tsx`、`web/src/lib/overlays.ts`（`itineraryFeatures` 的編號、整趟時某天亮其他天淡）、`web/src/store.ts`（如果需要「整趟模式下亮哪一天」的欄位）
- Modify: `web/src/styles.css`
- Test: `web/test/lib.test.ts`（`itineraryFeatures` 的編號和淡化）

**Interfaces:**
- Consumes: Task 2 的 `stopMarks`、`mapMark`。
- Produces: `AppStore.tripFocusDay: string | null`（整趟模式點了哪一天的路線；`setTripFocusDay`）。

- [ ] **Step 1: 寫失敗的測試**：
  - 某一天：起終點同一點的住宿標記是 `0`；`legOpen` 指到最後一段時，那個點是最後一號（`mapMark` 的 `'leg'`）。
  - 整趟：每間住宿標記是隔天的 `0`；`tripFocusDay` 有值時，其他天的路線 feature 有 `dim: true`。
- [ ] **Step 2: `npm test` 確認失敗。**
- [ ] **Step 3: 實作**
  - 彈窗（`PreviewCard`）：寬 340px、照片高 150px（右下 `1 / N`）、類型色塊＋名稱、tag 一排、摘要約三行（`-webkit-line-clamp: 3`）；z-index 高過日期列、右上工具列、比較列、提議列（在 `styles.css` 把這些浮動列的 z-index 列出來對齊，彈窗用最高的那層）；靠近上緣時可以蓋在日期列上。
  - 編號：某一天照 `mapMark(…, 'day')`，有 `legOpen` 時那段的兩端照 `'leg'`；整趟照 `'trip'`。
  - 整趟：點某天的路線 → `setTripFocusDay(date)`，那天的線不透明、其他天 `line-opacity` 0.25；點地圖空白處或換天清掉。
- [ ] **Step 4: `npm test && npm run typecheck && npm run validate` 全過**；dev 在 2/6 hover 鳥羽市立海之博物館（地圖上緣附近）看彈窗蓋過日期列。
- [ ] **Step 5: Commit**：`web：地圖彈窗變大且在最上層、住宿編號規則、整趟點某天的路線（T15m 第五輪）`

---

### Task 10: e2e、截圖、文件

**Files:**
- Modify: `web/e2e/t15m.spec.ts`（找「規劃模式」「空檔」「前一班」「後一班」「這天的候選」的地方都要改）
- Create: `web/e2e/shots-round5.mjs`（照 `shots-round4.mjs` 的寫法：1600、1280、390 寬，拍 2/3 時間軸、2/4 交通卡收起／展開／編輯、班次表、編輯中的藍條、時間條、候選、地圖彈窗、整趟 4 色），輸出到 `data/cache/work/t15m-round5/`
- Modify: `web/README.md`（截圖指令、第五輪說明）、`docs/architecture.md`（§2 用到 `planning`、`legOpen` 的描述，加 `timetable`、`tripFocusDay`）
- Modify: spec 檔頭加「**已實作**（計畫：`docs/superpowers/plans/2026-10-25-itinerary-round5.md`）」

- [ ] **Step 1: 改舊的 e2e、加新的**：
  - `編輯入口`：日期列有 `✏️ 編輯這天`，按了（確認後）出現藍條、`完成` 回到平常；切到「全部」編輯結束。
  - `2/3 等待只出現一次`：`.tl-wait` 一個、文字含 `等 67 分`，畫面上沒有「空檔 67 分」。
  - `點交通卡距離不變`：2/4 的 115 分卡點前點後距離文字相同。
  - `大眾運輸展開`：點了出現步驟，有 `等 43 分`、`御座線`；點 `› 班次` 出現班次表，有 `搭不到` 和 `選定`。
  - `編輯中的班次下拉沒有搭不到的班`：選項裡沒有發車早於 `ready` 的時間。
  - `編號`：2/3 卡片右上角依序 0、1、2、3。
  - `地圖彈窗在日期列上面`：hover 上緣附近的點，`elementFromPoint` 在日期列的位置拿到的是彈窗。
- [ ] **Step 2: 跑**：`npm run dev -- --port 5191`（背景），`npm run e2e`，Expected: 全部 PASS；`node web/e2e/shots-round5.mjs` 產出截圖。
- [ ] **Step 3: 文件**：README、architecture 照上面改；`npm test && npm run typecheck && npm run validate` 全過。
- [ ] **Step 4: Commit**：`T15m 第五輪：e2e、截圖、文件`
