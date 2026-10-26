# 大眾運輸改用 RAPTOR（T29）與交通卡的走法（T29b）設計

2026-10-26 和 👤 討論的結論。T29 只改引擎和靜態資料的 build；交通卡、車站面板的畫面是 T29b，等 T15m merge 後再做。

## 1. 為什麼

- 大阪幾乎每段都要轉乘：難波 → 大阪城（御堂筋線 → 本町轉中央線）、伊勢 → 大阪難波 → 住宿（近鐵特急接地鐵）、第一天南下（南海 → 步行轉乘 → 近鐵特急 → 鵜方）。現在的引擎只會「近鐵轉 1 次」或「巴士、船、JR 單一路線直達」，接不起來。
- 第四輪設計（`2026-10-25-itinerary-round4-design.md` §5.3）已經說要把時刻表統一、改用 RAPTOR，介面也留了「好幾條候選」的位置。T29 要加班距型路線，順便做掉（👤 選「RAPTOR 涵蓋全部」）。

## 2. 👤 在意的三件事（交通卡的目的）

1. **資料卡之間的交通要多久**（估算時間）。
2. **要轉乘的話會經過哪些點**：知道大致方向就好。實際旅行時就算沒搭到規劃的那班，也知道要往哪裡走。
3. **班次**：實際旅行通常不會照規劃的時間搭，因為常會錯過。看班次是為了知道錯過了怎麼補救、會影響到什麼。

👤 補充：近鐵特急**到車站才買**，不事先訂固定班次。

## 3. 決定

- **選走法、不選班次**（👤 同意）。排行程的工具（Wanderlog、NAVITIME 旅行プランナー）讓人選怎麼去，班次由系統算；查轉乘的 App（Yahoo!乗換案内）先選走法，再一班一班移。這個網站的交通時間會跟著前後的資料卡重算，記下的班次一動就變成「趕不上」。所以要記的是**走法**（搭哪幾條線、在哪裡上下車），班次每次都照走法重算。
- **拿掉「選班次」**（👤 能接受）：拿掉 ‹ 前一班、後一班 ›、班次下拉。班次表改成只能看。舊行程裡的 `TravelSpec.trip` 忽略，validate 不報錯，做法和拿掉緩衝一樣。這一步在 T29b 做，T29 是過渡期（§6.6）。
- **時間照實際班次算**：有時刻表的（近鐵、巴士、船、JR）照接得上的最早一班；班距型路線照班距估等車。不釘班次，所以前一站時間一變，時間就跟著變，不會出現「趕不上選定的班」。
- **分兩個任務**（👤 同意）：T29 改引擎，`Leg` 只加欄位、不改舊欄位，現在的交通卡照常顯示。T29b 改交通卡和車站面板，等 T15m（另一個 session 正在改 `web/`，包括 `LegRow.tsx`、`planView.ts`、`MobileLeg.tsx`）merge 後再做。

## 4. 目標、不做的、做壞的定義

**目標**
- 一套搜尋涵蓋近鐵（`_travel-times.json`）、巴士、船、JR（`timetables/bus|ferry|jr/*.json`）、大阪班距型路線（`timetables/urban/*.json`），加上轉乘步行（`_transfers.json`、`stations.json` 的 `transfers`、停留所和車站之間走得到的距離）。
- 可以轉乘多次，一段交通給 1～3 條候選走法。
- 行程可以記下選的走法，引擎照走法算時間。
- 每一程給「錯過的話」：下一班幾點發、整段晚幾分到。
- 班距型那一程給班距和首末班。

**不做**
- 不存完整的班距型路線時刻表，也不展開成真的班次給人看。
- 不算票價最佳化，不比較票券。
- 不做「錯過會影響到下一張卡（例如超過訂位時間）」的連鎖提醒，之後再說。
- T29 不改 `web/` 的元件和樣式（T15m 在改）。

**做壞的樣子（就算測試過了也不行）**
- 伊勢志摩現有的行程算出來的時間、交通方式明顯變了。近鐵的比對測試、`toba-day`、`timeline`、`travel` 現有測試要照樣通過；要改測試的期望值，只能是「新的結果明顯比較好」，例如原本搭計程車，現在找到近鐵接巴士，而且要在 commit 訊息寫出來。
- 規劃變慢：`perf.test.ts` 的界線（第一次 4 秒、編輯後重算 0.8 秒）照樣要過。
- 現在的網站壞掉：交通卡、班次表、‹ › 遇到新的走法（含班距型那一程、轉乘步行）不能當掉或顯示亂碼。

## 5. 限制

- Node 22、TypeScript，引擎是純函式，資料由呼叫的人傳進來（architecture §1）。規劃在瀏覽器主執行緒上跑，每次編輯都整份重算。
- 時間一律是日本時間的分鐘數或 `HH:MM` 字串，過了午夜寫 `25:00`（architecture §3.8）。
- 日別：近鐵用 `kintetsuDayType`，巴士、班距型路線用 `busDayType`（`weekday`／`saturday`／`holiday`；班距型路線的 `saturday` 是 null 時照 `holiday`）。
- 規則照 CONVENTIONS §5.4 和 `EngineConfig`：步行團體係數（全員 1.4、分組有長輩或小孩 1.2、只有大人 1.0）、單段步行上限、巴士等車 20 分內而且不是 1 小時以上才一班、電車等車 30 分內、轉乘至少 `minTransfer`（3 分）、離島只能搭船、しまかぜ固定停駛日、`allowExpress`。
- 班距型路線的資料特性（T28 的交接）：環狀線 `stops` 是内回り順，`loop: true`、`loopMin` 45；Osaka Metro 站內換線的 `walkMin` 多是 null，要有預設值；南海空港急行的 `holiday` 整段 null（那天不能搭）；班距、首末班不知道的填 null。

## 6. T29：引擎

### 6.1 資料

- `EngineData` 加 `urban?: UrbanRoute[]`、`urbanTransfers?: UrbanTransfer[]`，型別只列引擎用得到的欄位，格式照 `schema/urban-route.schema.json`、`urban-transfers.schema.json`。
- 讀檔的地方要跟著加，現在讀 `routes` 的地方照樣加 `urban/`：
  - `scripts/build-static.mjs`：靜態資料的 build，`timetables/urban/*.json` 照原樣輸出，`index.json` 加上路線摘要。
  - `web/src/data/local.ts`：開發時用 `import.meta.glob` 讀。
  - 正式環境從靜態檔載入 `routes` 的地方，同樣也要載入 `urban/`。
  - 這幾個檔案是別的任務的，改了要在 commit 訊息說明。`web/` 只動資料載入，不動元件。
- `test/fixtures.ts` 的 `realData()` 也要讀 `urban/`。

### 6.2 搜尋：RAPTOR

**網路**
- 每天的日別（近鐵日別＋巴士日別＋`allowExpress`）先整理一次，用 WeakMap 快取，做法和現在的 `prepare` 一樣。
- **停靠點**：
  - 近鐵、JR、班距型路線用車站 ID。
  - 巴士、船用路線檔的停留所 ID，加上路線 ID 當前綴，避免不同路線檔的 ID 撞在一起；同名、同座標的停留所要能互相轉乘（§6.2 步行轉乘）。
- **有時刻表的路線**：近鐵、巴士、船、JR 的班次，依停站順序分組成 RAPTOR 的 route。同一組的班次要 FIFO，不 FIFO 的就拆成不同組。しまかぜ固定停駛日當天不放進去。
- **班距型路線**：不展開成班次。每條線兩個方向各一個 route（環狀線依 `loop`、`loopMin` 只做内回り、外回り兩個方向，跨過最後一站接回第一站）。掃描時：
  - 在第 i 站上車的時間 `t`，發車＝`t + 等車`。
  - 到第 j 站＝發車＋（`stops[j].min − stops[i].min`），反方向用差的絕對值，環狀線繞過接點要加 `loopMin`。
  - 等車：全員取整個班距，分組取班距的一半（任務卡的規則，比較保守）。班距用 `t` 所在的 `headway` 時段，`t` 不在任何時段時用最接近的時段。
  - 只有 `first ≤ t + 等車 ≤ last` 可以搭（首班前、末班後不能搭）。那天的服務是 null（例如空港急行的 `holiday`）、或 `headway`／`first`／`last` 是 null，那條線那天就不能搭。
  - 首末班、班距是整條線的保守值（T28 記的是兩個方向比較保守的值），不分站，照用即可。
- **步行轉乘**（footpath，分鐘都乘團體係數；有分數的話，最後顯示時才進位）：
  - `_transfers.json`：`from`、`to` 不同的，就是兩站之間的步行，`walkMin` 是係數 1 的分鐘，`oneWay` 照方向。`walkMin` 是 null 時用預設值（§6.5 `urbanTransferDefault`）。
  - 同一個車站 ID 裡換線（`from`＝`to`，有 `fromLine`／`toLine`）：換線的時間用 `walkMin`，沒有就用預設值。近鐵寫成 `kintetsu`。
  - `stations.json` 的 `transfers`（例如 `iseshi` ↔ `jr-iseshi`、`osaka-namba` ↔ `nankai-namba`）：`_transfers.json` 有記就用它，沒有就用兩站直線距離 × `detourFactor` ÷ 步速，至少 `minTransfer`。
  - 巴士停留所、船的碼頭、車站之間 `transferMaxMeters`（§6.5）以內的，用直線估算的步行。這是新的組合（例如近鐵接巴士）；現在的引擎沒有。
  - 同一站、同一條線（或同一組近鐵）的列車之間換車，至少 `minTransfer`。
- **起點、終點**：沿用現在找上下車點的規則，並推廣到所有路線。
  - 端點本身就是車站或停留所的，步行 0。
  - `nearestStation`（mode walk）。
  - 停留所的 `near`。
  - `accessMaxMeters` 內的車站、停留所，步行照 `walkMinutes()`（anchors → nearestStation → OSRM 快取 → 直線估算）。
  - 走到上車點、下車後走到終點，都不能超過單段步行上限。
  - 每種業者只取最近的幾個，避免太多起點拖慢搜尋，數量由實作決定。
- **輪數**：最多 `maxRides` 程（§6.5，預設 4）。

**候選走法**
- RAPTOR 每一輪會給「坐 k 程最早幾點到」。取這些結果裡不被別的完全贏過的（Pareto：到達時間、程數），最多 `maxAlternatives` 條（預設 3）。
- **預設那條要算轉乘懲罰**（Claude 決定：有長輩、15 人帶行李，轉 3 次早 2 分不該贏過直達）：比的是「到達時間＋每多一程 `transferPenalty` 分」，最小的當預設，`autoLeg` 也拿這條去套等車規則。懲罰只用來挑，顯示的時間照實際的。候選依這個值排序。
- 到達時間一樣時，取晚出發的（現在近鐵搜尋的規則，`earliestTrain` 的測試靠這個）。實作可以先找到最早到達，再對同一條走法往後試發車時刻。
- 離島（`crossesSea`）：只留有船那程的走法。
- **近鐵特急不在大阪市內短程搭**（Claude 決定：要另買特急券，和班距型的 `kintetsu-namba-osaka` 重疊）：近鐵時刻表那一程的上下車站都在大阪側（`osaka-namba`、`osaka-uehommachi`、`tsuruhashi`）的不算。大阪市內用班距型的近鐵難波線。
- 「走法」的定義：依序每一程的（路線 key、上車點、下車點）。路線 key 的寫法：
  - 近鐵：車種加終點，例如「特急・往賢島」，或者整個近鐵當一條。由實作決定，原則是換班次時同一條走法還要找得到班，所以不要用 trainNo。
  - 巴士、船、JR：路線檔 ID。
  - 班距型：路線 ID 加方向。

### 6.3 交通方式判斷（autoLeg）

規則不變，只是候選換成 RAPTOR 的走法：
- 同一點不用移動；步行在上限內就走路；離島只搭船。
- 大眾運輸的候選要比走路早到，而且：
  - 第一程是巴士的，等車 ≤ `busMaxWait`，而且那條巴士不是 `busMinHeadwayInfrequent` 以上才一班。
  - 其他的，第一程等車 ≤ `trainMaxWait`。
  - 中間轉乘的等車不另外設限。
- 都不行就搭計程車，並寫出理由（`long-wait`、`bus-infrequent`、`missed-last`）。
- 班距型路線的等車算在 `waitMinutes`，只有第一程的等車才拿來判斷上面的規則。
- 任務卡說的「大阪的兩點之間，步行超過上限時先找班距型路線，再考慮計程車」照這套規則就會自然成立，不另外寫特例。

### 6.4 輸出：`Leg` 只加欄位

現在的欄位意思不變（`rides`、`walkBefore`、`walkAfter`、`ready`、`waitMinutes`、`trip`、`prevTrip`、`nextTrip`、`transitAvailable`）。新增：

- `TransitRide`：
  - `kind: 'timetable' | 'headway'`。
  - 班距型那一程：`headwayMin`（用的班距）、`first`、`last`、`routeId`（班距型路線 ID）。`depart`／`arrive` 是估的時間，`tripId` 是 null。
  - `mode` 還是 `'train' | 'bus' | 'ferry'`，地鐵、環狀線、南海算 `train`；另外加 `operator` 或線名給畫面用。
  - `from`／`to`：現在近鐵是車站 ID，巴士是停留所名稱，照舊；班距型用車站 ID。
- **轉乘步行**：`Leg.transfers?: { walkMinutes: number; elevator: boolean | null; elevatorWalkMinutes: number | null; note: string | null }[]`，長度＝`rides.length − 1`，第 i 個是第 i 程下車到第 i+1 程上車中間。
  - `walkMinutes` 是套係數、進位後的分鐘；同站同線換車是 0。
  - 時間照 `walkMin` 算，電梯路線的分鐘只給畫面看（Claude 決定：長輩不用輪椅，照一般路線算；有電梯路線時畫面另外寫）。
  - `ready[i]`（i ≥ 1）改成「前一程到站＋轉乘步行（至少 `minTransfer`）」。
  - **轉乘步行算進 `Leg.walkMinutes`**（Claude 決定：對長輩來說也是走路，一天累計步行的警告要算到）。但**不受單段步行上限管**：站內轉乘躲不掉，例如南海なんば → 近鐵大阪難波 11 × 1.4 ＝ 15.4 分，還是要能搭。超過上限時加一個 `info` 警告，寫「轉乘要走 N 分」。
- **候選走法**：`Leg.alternatives?: LegAlternative[]`，含目前用的那條（第一個或 `selected`）。每條有：
  - `path`：要存進行程的走法，§6.6 的 `PathRef`。
  - `arrive`、`minutes`、`waitMinutes`、`walkMinutes`、`rides`、`transfers`、`ridesCount`。
  - 一句摘要，例如「御堂筋線 → 本町 → 中央線」，給畫面用。摘要的格式由實作決定。
- **錯過的話**：每一程 `TransitRide.ifMissed?: { depart: TimeString; arrive: TimeString; lateMinutes: number } | null`。
  - 算法：這一程改成「發車晚於規劃那班」的下一班，前面幾程不變，後面照同一條走法重算到終點。`arrive` 是整段的到達時間，`lateMinutes` 是比規劃晚幾分。
  - 班距型的下一班＝規劃發車＋班距。
  - 那天沒有下一班（末班）是 null，畫面寫「這是末班」。
- `transitAvailable`、`missedLast` 的意思照舊（出發後時刻表裡還有沒有任何走法）。

### 6.5 設定（`EngineConfig.transit` 加的）

數字是 Claude 的建議，實作時可以照測試結果調整，調整後寫進 commit 訊息。

| 名稱 | 預設 | 意思 |
|---|---|---|
| `maxRides` | 4 | 一段最多搭幾程 |
| `maxAlternatives` | 3 | 最多給幾條走法 |
| `urbanTransferDefault` | 5 | `_transfers.json` 的 `walkMin` 是 null、或同站換線沒記錄時的分鐘（係數 1） |
| `transferMaxMeters` | 300 | 停留所、車站之間可以當成步行轉乘的直線距離 |
| `transferPenalty` | 10 | 挑預設走法時，每多一程加的分鐘（只用來挑，不加到時間上） |

### 6.6 行程格式：記走法；過渡期的 `trip`

- `TravelSpec` 加 `path?: PathRef | null`：
  - `PathRef = { rides: { line: string; from: string; to: string }[]; from: string | null; to: string | null }`。
  - `from`／`to` 是選的時候這段起訖的地點 ID，和 `TripRef` 一樣：起訖點變了就當作沒選。
- 引擎照 `path` 算時間。從出發時間依序找每一程最早接得上的班；班距型照班距。
- 照走法找不到的話（停駛、末班過了、資料改了），退回自動挑，加一個 `info` 警告，寫「選的走法這時間沒有車，改用 …」。不當成錯誤。
- `mode` 沒寫（自動）或是 `transit` 時才用 `path`。指定了 `path` 而且 `mode` 沒寫時，不套等車、班距的規則改計程車（使用者選了這條走法）。
- `validateItinerary`、`setLegTravel`、`getLegTravel` 要接受 `path`；`docs/CONVENTIONS.md` §3「行程」的 `travel` 說明補上 `path`。
- **過渡期（T29 到 T29b 之間）的 `trip`**：
  - 現在的畫面還能選班次，所以 T29 保留舊的 `tripLeg` 路徑：近鐵、單一路線巴士或船的時刻表搜尋、`transit.ts` 的函式都留著。
  - 有 `trip` 的段照舊算；照舊算不出來（例如走法含班距型那一程），就當作沒選。
  - `rideDepartures` 照舊。班距型那一程回傳 `[]`。
  - `prevTrip`／`nextTrip`：只有舊的 `tripLeg` 解讀得了的走法才給，也就是近鐵 1～2 程、或單一路線的巴士、船、JR。其他走法是 null，例如含班距型那一程、近鐵接巴士（Claude 決定：不擴充 `TripRef`，免得按了 › 沒反應；T29b 會整個拿掉）。
  - 同一段同時有 `trip` 和 `path` 時，`path` 優先（新格式）。
  - T29b 拿掉選班次時，引擎改成忽略 `trip`，同時刪掉用不到的舊路徑。

### 6.7 測試（`packages/engine/test/`）

- 班距型：等車（全員整個班距、分組一半）、首班前和末班後不能搭、那天服務是 null 不能搭、環狀線跨接點、反方向。
- 轉乘：`_transfers.json` 的步行套團體係數、`walkMin` null 用預設值、同站換線、`oneWay`。
- 全員和分組的係數差別：同一段交通，全員和分組的時間不同，而且差在等車和轉乘步行。
- **伊勢 → 大阪難波 → 住宿**：近鐵特急（照時刻表）接地鐵（班距），到大阪的住宿。
- **第一天南下**：なんば（南海）→ 步行轉乘 → 近鐵大阪難波 → 鵜方，結果是 `data/access/kix.json` 的 16:10 → 18:35（特急 1-382）。
- **大阪一天的假行程**：難波 → 大阪城 → 天王寺 → 難波，時間軸合理、警告合理（不應該出現計程車、`travel-unknown`）。
- 候選走法：至少一個例子有 2 條以上（例如少轉一次但比較慢）；同時到達取晚出發。
- `ifMissed`：有時刻表的、班距型的、末班時是 null。
- `path`：照走法算；換時間後同一條走法還是找得到班；走法這時間沒車時退回自動並加 `info` 警告。
- 現有測試照樣通過（§4「做壞的樣子」），`perf.test.ts` 照樣通過。另外加一個大阪的效能檢查：一天約 8 段大阪的交通、整份 12 天。
- 完成條件：`npm test`、`npm run typecheck`、`npm run validate` 通過。

## 7. T29b：交通卡和車站面板（T15m merge 後）

照 👤 的三件事（§2）：
- **收合時**：第一行照舊「大眾運輸 N 分」，小字「含等車 N 分」。第二行是走法，例如「近鐵特急 → 鶴橋 → JR 環狀線 → 大阪城公園」。
- **候選走法**：卡片上可以切換（`Leg.alternatives`），預設最快的那條。選了就存 `TravelSpec.path`；記的是走法，不是班次。
- **展開後的步驟**：現在的步驟照舊。兩程中間的轉乘步行另外列一段「步行 N 分」，有電梯路線的話寫「有電梯，約 N 分」。
- **班次表**：只能看，不能選。標出規劃搭的那班和前後幾班。每一程寫一句「錯過的話：下一班 10:45，晚 30 分到」（`ifMissed`），末班時寫「這是末班」。班距型那一程不開班次表，改寫「約 N 分一班・首班 5:24／末班 24:12」。
- **拿掉選班次**：‹ 前一班、後一班 ›、班次下拉都拿掉；舊的 `trip` 忽略（validate 不報錯）；引擎刪掉過渡期的 `trip` 路徑（§6.6）。
- **車站面板**：班距型路線顯示「約 N 分一班、首末班」，不列班次。這原本在 T29 的卡上，移到這裡，避免和 T15m 同時改 `web/`。
- 完成條件：手機尺寸看一次交通卡和車站面板（🌐 少量）。

## 8. 留給實作的

- RAPTOR 的資料結構、快取方式、起點數量的上限。
- 近鐵在走法裡的路線 key 怎麼分組（§6.2）。
- 走法摘要的文字格式。
- §6.5 的數字（照測試調整，寫進 commit 訊息）。
- `scripts/build-static.mjs` 的 `index.json` 怎麼摘要班距型路線。
