# T29 大眾運輸改用 RAPTOR 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引擎的大眾運輸搜尋改用 RAPTOR，一套涵蓋近鐵、巴士、船、JR、大阪班距型路線和轉乘步行；`Leg` 只加欄位（候選走法、轉乘、班距、錯過的話），`TravelSpec.path` 記走法。

**Architecture:** 新增 `packages/engine/src/raptor/` 三個檔：`network.ts`（把各種時刻表整理成一天的 RAPTOR 網路，快取）、`search.ts`（多輪 RAPTOR，回傳各程數的最早到達走法）、`path.ts`（照走法重算、錯過的話）。`travel.ts` 的自動、`transit` 改用新搜尋；舊的 `transit.ts` 和選班次（`trip`）的路徑過渡期保留。

**Tech Stack:** TypeScript（Node 22 `--experimental-strip-types`）、`node:test`，引擎是純函式。

**Spec:** `docs/superpowers/specs/2026-10-26-transit-raptor-design.md`（§6 是這份計畫的範圍；§7 T29b 不做）

## Global Constraints

- 所有工作在 worktree `D:\workspace\travel_helper-t29`（分支 `t29`），不改 master。
- 文件、註解、commit 訊息用繁體中文；註解密度、命名照 `travel.ts`、`transit.ts` 的風格。commit 訊息結尾加 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。commit 訊息用 heredoc（`git commit -F - <<'EOF'`），訊息裡的反引號不要放在雙引號字串裡。
- 單一測試：`node --experimental-strip-types --disable-warning=ExperimentalWarning --test packages/engine/test/<file>.test.ts`；全部：根目錄 `npm test`、`npm run typecheck`、`npm run validate`。
- 時間在引擎裡是「從 00:00 起的整數分鐘」，過了午夜 > 1440（`toMinutes('24:12')` = 1452）；輸出用 `fromMinutes`。
- 規則數字照 `EngineConfig`／CONVENTIONS §5.4：團體係數全員 1.4、分組有長輩或小孩 1.2、只有大人 1.0；單段步行上限全員 15、分組 25；`busMaxWait` 20、`busMinHeadwayInfrequent` 60、`trainMaxWait` 30、`minTransfer` 3、`accessMaxMeters` 1200。
- 新設定（`EngineConfig.transit`）：`maxRides` 4、`maxAlternatives` 3、`urbanTransferDefault` 5、`transferMaxMeters` 300、`transferPenalty` 10。
- 班距型等車：全員＝整個班距，分組＝班距 ÷ 2，**向上取整數分鐘**。轉乘步行＝係數 1 的分鐘 × 團體係數，向上取整，至少 `minTransfer`。
- 不改 `web/` 的元件和樣式（T15m 在改）；`web/` 只動 `src/data/local.ts`、`src/data/source.ts` 的資料載入。改別人的程式（`scripts/build-static.mjs`、`web/src/data/*`）要在 commit 訊息說明。
- 現有測試不能為了遷就新寫法隨便改期望值；只有「新結果明顯比較好」才改，並在 commit 訊息寫出改了哪個、為什麼（spec §4）。
- `perf.test.ts` 的界線照舊：第一次規劃 < 4000 ms、編輯後重算 < 800 ms，而且近鐵段都有 `prevTrip` 或 `nextTrip`。

## Review Focus

- **過了午夜的首末班**（`last: "24:12"`）：23:50 出發要搭得到、24:20 要搭不到 → Task 2 測試。
- **時刻不在任何班距時段內**（例如 05:10 在 `05:24` 時段之前、或資料時段有空隙）：用最接近的時段，但仍受首末班限制 → Task 2 測試。
- **那天服務是 null、或 `headway`／`first`／`last` 是 null**（南海空港急行的 `holiday`）：那條線那天不能搭，不能當掉 → Task 2 測試。
- **舊行程在大阪那段存了 `trip`**（現在的畫面選過班次）：舊路徑算不出來就當作沒選，照自動算，不能報錯或當掉 → Task 5 測試。
- **近鐵特急在大阪市內短程**（`osaka-namba` → `tsuruhashi`）：不能出現在走法裡 → Task 3 測試。

---

### Task 1: 班距型路線、轉乘的資料型別和讀檔

**Files:**
- Modify: `packages/engine/src/data.ts`（型別、`EngineData`）
- Modify: `packages/engine/src/config.ts`（`EngineConfig.transit` 加 5 個設定和預設值）
- Modify: `packages/engine/test/fixtures.ts`（`realData()` 讀 `data/timetables/urban/`）
- Modify: `web/src/data/source.ts`、`web/src/data/local.ts`（`loadEngineTimetables()` 多回傳 `urban`、`urbanTransfers`）
- Modify: web 呼叫 `loadEngineTimetables()` 組 `EngineData` 的地方（`grep -rn loadEngineTimetables web/src`），把兩個欄位傳進去
- Modify: `scripts/build-static.mjs`（輸出 `timetables/urban/*.json`；`index.json` 加 `urban: [{ id, name, mode, stops: string[], file }]`）
- Test: `packages/engine/test/raptor.test.ts`（新）、`scripts/test/build-static.test.ts`

**Interfaces:**
- Produces（`data.ts`，照 `schema/urban-route.schema.json`、`urban-transfers.schema.json` 核對 nullable）：
  ```ts
  export interface UrbanService { first: TimeString | null; last: TimeString | null; headway: { from: TimeString; to: TimeString; min: number | null }[] | null; note?: string | null }
  export interface UrbanRoute {
    id: string; mode: string; operator?: string; name: { ja: string; zh?: string | null }; serviceType?: string | null;
    stops: { id: string; min: number; note?: string | null }[]; loop: boolean; loopMin: number | null;
    service: { weekday: UrbanService | null; saturday: UrbanService | null; holiday: UrbanService | null };
    fares?: { adult?: Record<string, Record<string, number>> | null } | null;
  }
  export interface UrbanTransfer {
    from: string; to: string; fromLine?: string | null; toLine?: string | null; walkMin: number | null;
    elevator?: boolean | null; elevatorRoute?: string | null; elevatorWalkMin?: number | null; exitGates?: boolean | null; oneWay?: boolean; note?: string | null;
  }
  // EngineData 加：urban?: UrbanRoute[]; urbanTransfers?: UrbanTransfer[];
  // EngineConfig.transit 加：maxRides; maxAlternatives; urbanTransferDefault; transferMaxMeters; transferPenalty（都是 number）
  ```

- [ ] **Step 1: 寫測試**：`raptor.test.ts` 加 `test('realData 讀得到班距型路線和轉乘')`：`realData().urban` 長度 10、有 `id === 'jr-osaka-loop'` 而且 `loop === true`；`urbanTransfers` 長度 22。`build-static.test.ts` 加一個斷言：輸出裡有 `timetables/urban/metro-midosuji.json`，`index.json` 的 `urban` 有 `metro-midosuji`（照該檔現有測試的寫法）。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作**型別、設定預設值、`realData()`、web 載入（`import.meta.glob('../../../data/timetables/urban/*.json')`：`_transfers.json` 是 `urbanTransfers`，其他是 `urban`）、build-static。
- [ ] **Step 4: 跑測試確認通過**，再跑 `npm run typecheck`。
- [ ] **Step 5: Commit**（訊息說明改了 `scripts/build-static.mjs`、`web/src/data/` 的資料載入）。

### Task 2: 一天的 RAPTOR 網路（network.ts）

**Files:**
- Create: `packages/engine/src/raptor/network.ts`
- Test: `packages/engine/test/raptor.test.ts`

**Interfaces:**
- Consumes: Task 1 的型別；`kintetsuDayType`、`busDayType`、`toMinutes`（`time.ts`）；`haversineMeters`（`geo.ts`）。
- Produces:
  ```ts
  /** 換線的組：近鐵 'kintetsu'、路線檔 routeId、班距型 routeId（兩個方向同一組） */
  export interface TimedTrip { tripId: string; line: string; arr: number[]; dep: number[]; fareAdult: (number | null)[] | null }
  export interface TimedRoute { kind: 'timetable'; key: string; group: string; mode: 'train' | 'bus' | 'ferry'; routeId: string | null; stops: string[]; trips: TimedTrip[] /* 依發車排序、FIFO */ }
  export interface HeadwayRoute { kind: 'headway'; key: string; group: string; routeId: string; line: string; stops: string[]; offsets: number[] /* 這個方向從第一站起的車上分鐘 */; service: UrbanService | null }
  export type NetRoute = TimedRoute | HeadwayRoute;
  export interface Footpath { to: string; walk: number /* 係數 1 的分鐘 */; transfer: UrbanTransfer | null }
  export interface NetStop { id: string; name: string; coords: LonLat | null; stationId: string | null }
  export interface Network {
    stops: Map<string, NetStop>; routes: NetRoute[];
    routesAt: Map<string, { route: number; index: number }[]>;
    footpaths: Map<string, Footpath[]>;
    /** 同一站換線（fromGroup → toGroup）的係數 1 分鐘與轉乘資料 */
    sameStopChange(stop: string, fromGroup: string, toGroup: string): { walk: number; transfer: UrbanTransfer | null };
  }
  export function buildNetwork(data: EngineData, cfg: EngineConfig, date: DateString): Network;
  /** 班距型路線在 t（分鐘）上車的等車分鐘；不能搭回傳 null */
  export function headwayWait(service: UrbanService | null, t: number, whole: boolean): { wait: number; headway: number } | null;
  ```
- 規則（spec §6.2）：
  - 停靠點 ID：近鐵、JR（路線檔裡停留所 ID 就是車站 ID 的照用）、班距型＝車站 ID；巴士、船＝`${routeId}/${stopId}`。`stationId` 是對得到 `stations.json` 的 ID，否則 null。
  - 近鐵班次依停站序列分組成 route，`key` 也是 `'kintetsu'`、`group` 是 `'kintetsu'`。不放 `allowExpress` 為 false 時的特急、當天固定停駛的しまかぜ（照 `transit.ts` 的 `SHIMAKAZE_OFF`，改成 export 共用）。
  - 路線檔（`data.routes`）照日別、`trip.dates`、`validFrom` 篩，依停站序列分組，`key`＝`group`＝routeId，`mode` 照 `travel.ts` 的對應（ferry → ferry、jr → train、其他 bus）。
  - 同一組裡不 FIFO（後發車的比較早到某站）的班次拆到另一個 route。
  - 班距型：每條線兩個方向，`key`＝`${routeId}:+`／`${routeId}:-`，`group`＝routeId。環狀線兩個方向都從第一站繞一圈回到第一站前（`offsets` 跨接點加 `loopMin`；外回り是反方向）。日別：`busDayType`；`saturday` 是 null 用 `holiday`。
  - Footpath：`_transfers.json` 中 `from !== to` 的（`oneWay` 只加一個方向，`walkMin` null 用 `urbanTransferDefault`）；`stations.json` 的 `transfers` 沒在 `_transfers.json` 的，用直線 × `detourFactor` ÷ `metersPerMinute`；停靠點之間 `transferMaxMeters` 內的（有座標的），同樣直線估算。
  - `sameStopChange`：`_transfers.json` 有 `from === to === stop` 而且 fromLine/toLine 對得上（任一方向，除非 `oneWay`）就用它的 `walkMin`（null 用 `urbanTransferDefault`）；兩邊有一邊是班距型 group 的用 `urbanTransferDefault`；其他用 `minTransfer`。同一 group 也回傳 `minTransfer`。
  - `headwayWait`：`service`、`first`、`last`、`headway` 有 null，或 `t + wait` 不在 `[first, last]` → null；時段用包含 t 的那段，沒有就用 `from`／`to` 離 t 最近的那段；那段 `min` 是 null → null。wait＝`Math.ceil(whole ? min : min / 2)`。
  - `buildNetwork` 用 WeakMap（key：`data`）＋ Map（`${kintetsuDayType}|${busDayType}|${allowExpress}|${date 有 trip.dates 時才加 date}`）快取。

- [ ] **Step 1: 寫測試**（`raptor.test.ts`，班距型用手寫的小 `UrbanService`／`UrbanRoute`，其他用 `realData()`）：
  - `headwayWait`：`{first:'05:24', last:'24:12', headway:[{from:'10:00',to:'16:00',min:7.5}]}`，t=600（10:00）全員 → `{wait:8, headway:7.5}`、分組 → `{wait:4, headway:7.5}`。
  - 首末班：t=300（05:00）→ null；t=1430（23:50）→ 不是 null；t=1460（24:20）→ null。
  - 時段外：headway 只有 `[{from:'06:00',to:'07:00',min:8}]`、first `05:24`，t=330 → 用 8 分那段。
  - null：service null、`headway:null`、`min:null` 都回 null。
  - `buildNetwork(realData(), DEFAULT_CONFIG, '2027-02-12')`：有 `metro-chuo:+`、`metro-chuo:-`；`jr-osaka-loop:+` 的 `stops` 第一個和最後一個不同、`offsets` 遞增而且最後一個 < `loopMin` + 第一站以外的最大值（跨接點有算到）；`metro-chuo:-` 是 `metro-chuo:+` 的反方向，相鄰站分鐘差一樣。
  - footpath：`osaka-namba` → `nankai-namba` 有一條 `walk === 11`、`transfer.elevator === true`；`sameStopChange('metro-hommachi', 'metro-midosuji', 'metro-chuo').walk` 是 `_transfers.json` 的值，沒有的話是 5。
  - 2027-02-11（holiday）：`nankai-airport-express` 的 route 的 `headwayWait(service, 600, true)` 是 null。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作** `network.ts`。
- [ ] **Step 4: 跑測試確認通過**、`npm run typecheck`。
- [ ] **Step 5: Commit**。

### Task 3: 多輪 RAPTOR 搜尋（search.ts）

**Files:**
- Create: `packages/engine/src/raptor/search.ts`
- Test: `packages/engine/test/raptor.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Network`、`NetRoute`、`headwayWait`、`sameStopChange`。
- Produces:
  ```ts
  export interface Access { stop: string; walk: number /* 已套係數、已進位 */ }
  export interface JourneyRide {
    route: NetRoute; trip: TimedTrip | null; from: string; to: string; dep: number; arr: number;
    /** 班距型：用的班距、首末班；有時刻表的是 null */
    headway: { min: number; first: TimeString; last: TimeString } | null;
  }
  export interface JourneyTransfer { walk: number /* 已套係數、已進位；同站同 group 換車是 0 */; transfer: UrbanTransfer | null }
  export interface Journey { origin: Access; target: Access; rides: JourneyRide[]; transfers: JourneyTransfer[] /* rides.length - 1 */; dep: number /* 第一程發車 */; arr: number /* 含下車步行 */ }
  export interface SearchQuery { origins: Access[]; targets: Access[]; depart: number; whole: boolean; factor: number; requireFerry?: boolean }
  /** 各程數的最早到達（Pareto：到達、程數），依到達排序；到達一樣取晚出發的 */
  export function searchJourneys(net: Network, q: SearchQuery, cfg: EngineConfig): Journey[];
  /** 預設那條：到達 + transferPenalty × (程數 − 1) 最小；同值取程數少的 */
  export function pickDefault(js: readonly Journey[], cfg: EngineConfig): Journey | null;
  ```
- 演算法（標準 RAPTOR，最多 `maxRides` 輪）：
  - 第 0 輪：每個 origin 的 `depart + walk`，再走一次 footpath（spec：起點也可以接 footpath，例如端點是 `nankai-namba` 要走到 `osaka-namba`；這段算轉乘步行還是 access 由實作決定，但要出現在 `Leg.walkMinutes` 裡）。
  - 每輪掃描被標記的停靠點的 routes：
    - 有時刻表：標準的「搭上最早可搭的那班」。上車時刻要 ≥ 到這站的時間 ＋ 換車時間：上一輪是坐車到的，換車時間＝`ceil(max(minTransfer, sameStopChange(...).walk × factor))`，同 group 是 `minTransfer`；走 footpath 到的不另外加。
    - 班距型：依 `stops` 順序掃，維持「虛擬發車 − offset」最小的上車；上車時刻 t 用 `headwayWait(service, t, q.whole)`，null 就不能從這站上。
    - 近鐵那程的上下車站都在 `OSAKA_KINTETSU = ['osaka-namba', 'osaka-uehommachi', 'tsuruhashi']` 的，不算（spec §6.2）。
  - 每輪之後 footpath：到達＋`ceil(walk × factor)`。
  - 每輪結束算 targets 的到達（＋`target.walk`），比上一輪早才收進結果。
  - 到達一樣取晚出發：找到某輪的最佳走法後，對同一條走法的第一程試後面的班（班距型不用），仍然同時到就換成晚的。
  - `requireFerry`：只收至少有一程 `mode === 'ferry'` 的。
  - 結果用 WeakMap（key：`net`）＋ Map（查詢內容當字串 key，上限照 `transit.ts` 的 `EARLIEST_MEMO_MAX`）快取；呼叫的人不能改回傳的陣列。

- [ ] **Step 1: 寫測試**（用 `realData()` 的網路，日期 2027-02-02 週二）：
  - `test('近鐵 1 程：鳥羽 → 賢島 和 earliestTrain 一樣')`：origins `[{stop:'toba',walk:0}]`、targets `[{stop:'kashikojima',walk:0}]`、depart 600、whole true、factor 1.4，第一條（或程數 1 那條）的 `arr`、`rides[0].trip.tripId` 和 `earliestTrain(realData().kintetsu!, {from:'toba',to:'kashikojima',date:'2027-02-02',after:600,holidays:DEFAULT_CONFIG.holidays})` 的最後一程 `arr`、第一程 `trainNo` 相同。
  - `test('近鐵轉 1 次的到達和 earliestTrain 一樣')`：挑 `transit.test.ts` 裡現有的轉乘例子，`searchJourneys` 的最早到達＝`earliestTrain` 的到達，第一程發車一樣（晚出發的 tie-break）。
  - `test('班距型：難波 → 大阪城 會轉乘')`：origins `metro-namba`、targets `metro-tanimachi-4chome`、2027-02-12、depart 600：有結果，最早那條 `rides.length >= 2`，每程 `headway` 不是 null；whole true 和 false 的 `arr` 不同而且 whole 比較晚。
  - `test('轉乘步行套團體係數')`：origins `nankai-namba`→targets `osaka-namba` 一帶的走法裡，`osaka-namba` ↔ `nankai-namba` 的步行是 `ceil(11 × 1.4)` = 16（全員）、`ceil(11 × 1.2)` = 14（factor 1.2）。
  - `test('近鐵特急不在大阪市內短程搭')`：origins `osaka-namba`、targets `tsuruhashi`，所有結果裡沒有 `route.group === 'kintetsu'` 的程。
  - `test('pickDefault 照轉乘懲罰')`：手造兩條 Journey（1 程 arr 700、3 程 arr 692）→ 選 1 程那條；（1 程 arr 700、2 程 arr 680）→ 選 2 程那條。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作** `search.ts`。
- [ ] **Step 4: 跑測試確認通過**、`npm run typecheck`。
- [ ] **Step 5: Commit**。

### Task 4: 照走法重算、錯過的話（path.ts）

**Files:**
- Create: `packages/engine/src/raptor/path.ts`
- Modify: `packages/engine/src/types.ts`（`PathRef`、`PathRide`、`TravelSpec.path`）
- Test: `packages/engine/test/raptor.test.ts`

**Interfaces:**
- Consumes: Task 2、3。
- Produces:
  ```ts
  // types.ts
  export interface PathRide { line: string /* NetRoute.key 的 group（近鐵 'kintetsu'、路線檔 routeId、班距型 routeId） */; from: string /* 停靠點 ID */; to: string }
  export interface PathRef { rides: PathRide[]; from: string | null; to: string | null }
  // TravelSpec 加：path?: PathRef | null;
  // path.ts
  export function pathOf(j: Journey): PathRide[];
  /** 從 depart 起照走法依序搭每一程最早接得上的班；接不上或那天沒車回傳 null */
  export function evaluatePath(net: Network, rides: readonly PathRide[], origin: Access, target: Access, depart: number, q: { whole: boolean; factor: number }, cfg: EngineConfig): Journey | null;
  /** 第 i 程錯過（改搭發車晚於規劃那班的下一班）：整段到達、晚幾分；沒有下一班回傳 null */
  export function ifMissed(net: Network, j: Journey, i: number, q: { whole: boolean; factor: number }, cfg: EngineConfig): { depart: number; arrive: number; lateMinutes: number } | null;
  ```
- 規則：`evaluatePath` 的每一程只搭 `group === line`、停 `from` 再停 `to` 的 route；換車、步行照 Task 3。`ifMissed`：有時刻表的程＝同一對站發車 > 規劃發車的下一班；班距型＝規劃發車＋班距（仍受首末班限制）；後面照 `evaluatePath` 重算。

- [ ] **Step 1: 寫測試**：
  - `pathOf` 再 `evaluatePath`（同一個 depart）得到同樣的 `arr`（用 Task 3 的難波 → 大阪城走法）。
  - 同一條走法 depart + 60 還找得到，`arr` 晚約 60 分。
  - 走法裡放一個那天不能搭的線（2027-02-11 的 `nankai-airport-express`）→ null。
  - `ifMissed`：近鐵鳥羽 → 賢島那條，第 0 程的 `depart` > 規劃發車，`lateMinutes > 0`；班距型那程 `lateMinutes` 約等於班距（±1）；用當天末班（`departuresFrom` 取最後一班當 depart）時回 null。
- [ ] **Step 2～4: 跑測試確認失敗、實作、跑測試確認通過**、`npm run typecheck`。
- [ ] **Step 5: Commit**。

### Task 5: travel.ts 改用 RAPTOR，Leg 加欄位

**Files:**
- Modify: `packages/engine/src/travel.ts`、`packages/engine/src/types.ts`（`TransitRide`、`Leg` 加欄位、`LegAlternative`）、`packages/engine/src/transit.ts`（export `SHIMAKAZE_OFF` 給 network 用，其他不動）
- Test: `packages/engine/test/travel.test.ts`、`packages/engine/test/raptor.test.ts`

**Interfaces:**
- Consumes: Task 2～4。
- Produces（`types.ts`，都是可省略的新欄位）：
  ```ts
  // TransitRide 加：
  kind?: 'timetable' | 'headway'; headwayMin?: number | null; first?: TimeString | null; last?: TimeString | null;
  operator?: string | null; ifMissed?: { depart: TimeString; arrive: TimeString; lateMinutes: number } | null;
  // 班距型那程：tripId null、routeId＝班距型路線 ID；mode 'train'；from／to 車站 ID
  export interface LegTransfer { walkMinutes: number; elevator: boolean | null; elevatorWalkMinutes: number | null; note: string | null }
  export interface LegAlternative { path: PathRef; summary: string; arrive: TimeString; minutes: number; waitMinutes: number; walkMinutes: number; ridesCount: number; rides: TransitRide[]; transfers: LegTransfer[] }
  // Leg 加：transfers?: LegTransfer[]; alternatives?: LegAlternative[];
  ```
- 做法（spec §6.3、§6.4、§6.6）：
  - 新的 `raptorCandidates(a, b, ctx, factor, departMinutes)` 取代 `transitCandidates`／`searchTransit` 在 `autoLeg`、`specifiedLeg`（transit／train／bus／ferry）、`transitExists` 裡的用法。起訖點：把 `kintetsuAccess` 和 `stopMatcher` 的規則推廣成 `accessStops(e, ctx, factor, net): Access[]`（端點本身是停靠點 → 0；`nearestStation` walk；停留所 `near`；`accessMaxMeters` 內每種 group 最近的 2 個；步行用 `walkMinutes()`、超過 `legWalkMax` 的不要；walk 向上取整）。
  - Journey 轉 `Candidate`：`mode`＝第一個非步行程的 mode（有船就是 ferry，離島判斷照舊）；`wait`＝第一程等車；`headway`：第一程是巴士的，用同一對站下一班的發車差（照現在 `routeCandidates` 的算法）；`rides`、`transfers`、`ready`（`ready[i]`＝前一程到站＋轉乘步行，第 0 程＝出發＋access）。
  - 只有「近鐵 1～2 程而且起訖都是近鐵站」或「單一路線檔 1 程」的 Journey，才帶舊的 `pair`／`trains`（或 route 欄位），讓 `neighbours`、`toTrip` 照舊算 `prevTrip`／`nextTrip`；其他 null（spec §6.6）。
  - `autoLeg` 用 `pickDefault` 挑，再套現在的 `ok()` 規則（第一程等車、巴士班距、要比走路早到）；不合規則時照現在的理由警告、改計程車。
  - `walkMinutes`＝access＋egress＋所有轉乘步行；有轉乘步行 > `legWalkMax` 的加 `{ code: 'transfer-walk', level: 'info', message: '轉乘要走 N 分' }`。
  - `alternatives`：`searchJourneys` 的結果依 pickDefault 的值排序，最多 `maxAlternatives` 條，`summary` 照「線名 → 轉乘站 → 線名」（線名：近鐵用車種、其他用路線名）。
  - 每一程的 `ifMissed` 用 Task 4。
  - `trip` 照舊走舊的 `tripLeg`（舊的 `searchTransit`，改名 `legacySearchTransit`）；舊路徑找不到就照自動。
  - `transitAvailable`、`missedLast`：用 `searchJourneys`（depart 起、depart 0 起）有沒有結果。

- [ ] **Step 1: 寫測試**（`travel.test.ts`）：
  - `test('舊行程在大阪存了 trip：當作沒選，照自動算')`：`planLeg`（照檔裡現有的寫法組 Endpoint）從 `osaka-castle-tenshukaku` 到 `osaka-harukas300`，`spec = { trip: { id: '1-382', depart: '16:10', arrive: '18:35', from: 'osaka-castle-tenshukaku', to: 'osaka-harukas300' } }` → 沒有 throw，`leg.mode` 不是 `'unknown'`，`leg.rides.length >= 1`，沒有 `missed-trip` 警告。
  - `test('大阪：Leg 有 transfers、alternatives，班距型那程有班距')`：`osaka-dotonbori` → `osaka-castle-tenshukaku`，2027-02-12 10:00，全員：`leg.transfers.length === leg.rides.length - 1`；有一程 `kind === 'headway'` 而且 `headwayMin`、`first`、`last` 有值、`tripId` 是 null；`alternatives[0].rides` 和 `leg.rides` 一樣；`walkMinutes >= walkBefore + walkAfter`。
  - `test('近鐵段照舊有前一班、後一班')`：`toba` → `kashikojima` 10:00 → `prevTrip` 或 `nextTrip` 不是 null，`rides[0].kind === 'timetable'`、`ifMissed.lateMinutes > 0`。
- [ ] **Step 2: 跑新測試確認失敗**。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑全部引擎測試**：`node --experimental-strip-types --disable-warning=ExperimentalWarning --test "packages/engine/test/*.test.ts"`，全部通過（含 `perf.test.ts`、`toba-day.test.ts`、`transit.test.ts`）。有現有測試的期望值變了，先查原因：是 bug 就修程式；新結果明顯比較好才改期望值，並記下來寫進 commit 訊息。
- [ ] **Step 5: `npm run typecheck`**（含 `web/`：新欄位都可以省略，web 不用改）。
- [ ] **Step 6: Commit**。

### Task 6: 行程格式記走法（TravelSpec.path）

**Files:**
- Modify: `packages/engine/src/travel.ts`（`planLeg` 用 `path`）、`packages/engine/src/ops.ts`（`validateItinerary`、`isEmptySpec`、`setLegTravel`／`getLegTravel` 帶 `path`）
- Modify: `docs/CONVENTIONS.md` §3「行程」的 `travel` 說明（補 `path` 一行，照 `trip` 那幾行的寫法）
- Test: `packages/engine/test/travel.test.ts`、`packages/engine/test/ops.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `PathRef`、`evaluatePath`；Task 5 的 `alternatives[].path`。
- 規則（spec §6.6）：`path.from === a.id && path.to === b.id` 而且 `mode` 沒寫或是 `transit` 時才用；`path` 比 `trip` 優先；用 `path` 時不套等車、班距規則；`evaluatePath` 回 null → 照自動算，加 `{ code: 'path-unavailable', level: 'info', message: '選的走法這時間沒有車，改用 <新走法的 summary>' }`。`validateItinerary`：`path.rides` 是陣列、每個有非空字串的 `line`／`from`／`to`；`path.from`／`to` 是字串或 null。

- [ ] **Step 1: 寫測試**：
  - `travel.test.ts`：先算 `osaka-dotonbori` → `osaka-castle-tenshukaku` 的 `alternatives`，取「不是第一條」的那條 `path` 放進 spec 再算一次 → `leg.rides` 照那條走法（`rides.length` 和那條的 `ridesCount` 一樣）；出發時間 + 90 分再算，同一條走法、`arrive` 變晚。
  - `path` 放一條 2027-02-11 不能搭的線 → `path-unavailable` 警告，`leg.mode` 不是 `'unknown'`。
  - `path.from` 和 a.id 不同 → 照自動（和沒寫 path 的結果一樣）。
  - `ops.test.ts`：`validateItinerary` 收 `path` 合法的不報錯；`path.rides: [{ line: '' }]` 報錯；`setLegTravel` 存 `{ path }` 後 `getLegTravel` 拿得回來。
- [ ] **Step 2～4: 跑測試確認失敗、實作、跑測試確認通過**、`npm run typecheck`。
- [ ] **Step 5: Commit**（含 CONVENTIONS 的修改）。

### Task 7: 大阪的情境測試和效能

**Files:**
- Create: `packages/engine/test/osaka.test.ts`
- Modify: `packages/engine/test/perf.test.ts`（加大阪的那一個）
- 必要時 Modify: Task 2～5 的檔（情境測試抓到的問題）

**Interfaces:**
- Consumes: `planLeg`、`planItinerary`、`createItinerary`、`addItem`、`setLodging`（`ops.ts`），`realData()`。

- [ ] **Step 1: 寫測試**（`osaka.test.ts`）：
  - `test('第一天南下：關西機場 14:35 → 鵜方，搭近鐵 1-382 16:10 → 18:35')`：`planLeg` 從車站 `kansai-airport` 到車站 `ugata`，2027-02-02、depart 14:35、全員 15 人（elders 5、kids 4）、`spec = { mode: 'transit' }` → 最後一程 `tripId === '1-382'`、`depart === '16:10'`、`arrive === '18:35'`；有一程是南海（`routeId` 是 `nankai-rapit` 或 `nankai-airport-express`）；`transfers` 裡有 `nankai-namba` ↔ `osaka-namba` 那筆（`walkMinutes === 16`）。
  - `test('伊勢 → 大阪難波 → 住宿')`：`iseshi` → `osaka-hotel-nikko`，2027-02-12 10:00，全員、自動 → `leg.mode` 不是 `taxi`／`unknown`；第一程是近鐵（`kind === 'timetable'`、`routeId` null、`tripId` 有值）；至少一程 `kind === 'headway'` 或最後步行到住宿；`leg.minutes < 210`。
  - `test('大阪一天：難波 → 大阪城 → 天王寺 → 難波')`：`createItinerary()`，2027-02-12 `setLodging` 住 `osaka-grids-premium-namba`（2027-02-11 也住這裡，當天從住宿出發），依序 `addItem` `osaka-castle-tenshukaku`、`osaka-harukas300`、`osaka-dotonbori` → `planItinerary` 那天：沒有 `travel-unknown`、`taxi` 警告；城 → 天王寺那段有 `kind === 'headway'` 的程；回住宿的時間有值；每段 `minutes` < 60。
- [ ] **Step 2: 跑測試**；失敗的照原因修 Task 2～5 的程式（不是改期望值；`kix.json` 的 16:10 → 18:35 是定的）。
- [ ] **Step 3: perf**：`perf.test.ts` 加 `test('效能：12 天裡有 2 天大阪、每天 8 段')`，界線和現有的一樣（第一次 < 4000 ms、重算 < 800 ms）；不過的話先做快取（網路、搜尋結果、access 停靠點）再調 `accessStops` 的數量。
- [ ] **Step 4: 全部驗證**：根目錄 `npm test`、`npm run typecheck`、`npm run validate` 都通過。
- [ ] **Step 5: Commit**。
