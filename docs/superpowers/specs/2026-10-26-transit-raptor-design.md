# 大眾運輸改用 RAPTOR（T29）、重算速度（T29b）與交通卡的走法（T29c）設計

2026-10-26 和 👤 討論的結論。T29 只改引擎和靜態資料的 build；交通卡、車站面板的畫面原本是 T29b，2026-10-28 拆成 T29b（重算速度、拿掉選班次，§7）和 T29c（畫面，§8）。

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

## 7. T29b：重算速度、拿掉選班次（不改畫面）

2026-10-28 和 👤 討論：原本的 T29b 拆成兩個。交通卡怎麼呈現要看交通卡能給什麼內容，而且會討論很久，所以畫面拆成 T29c（§8）。T29b 只做畫面以外的部分。

### 7.1 為什麼

- **快取失效**（T29 最終審查留下的）：`web/src/planStore.ts` 的 `buildEngineData` 每次重算都新建 `stations` 陣列（`records.filter(...)`）。引擎的網路和搜尋快取是照陣列認的，所以網站每次編輯都整個重建。11 天的行程約 0.7 秒，舊版約 0.05 秒。
- **整份重算**：現在動一張資料卡，`planItinerary` 會把 12 天全部重算。但一天的結果只看這幾樣：那一天的內容（資料卡、住宿、`start`、`returnTravel`、`lodgingMeals`）、前一天的住宿（那天沒設 `start` 時當起點）、`party`、資料和設定。所以動一張資料卡只要重算那一天；動住宿要重算當天（回住宿那段）和隔天（起點變了）。跨天的只有「連續兩天都累」和「中間沒有半天自由時間」兩個警告，用各天的結果再算一次就好，很便宜。
- 👤 的電腦感覺不到卡頓，但家人的手機可能慢 3～5 倍。大阪的天每段交通都要搜尋轉乘（班距型路線、步行轉乘），比伊勢志摩重。能優化的就優化。

### 7.2 修快取

- `buildEngineData` 照 `d.places` 把 `records`、`getPlace`、`stations` 存起來，`d.places` 沒變就重用同一個陣列；`regionNeedsCar` 照 `d.areas` 重用。
- `EngineData` 本身能重用就重用：`places`、`areas`、時刻表、`roads` 都沒變時，用同一個物件。

### 7.3 只重算有改的那一天

- **用內容比對，不改 `ops.ts`**（Claude 決定）：行程的編輯動作都會把整份行程深拷貝（`clone(it)`），所以不能用「這一天的物件沒換」來判斷。每一天的鑰匙是「那一天的內容＋前一天的住宿（那天沒設 `start` 時）＋`party`」轉成字串，鑰匙一樣就沿用上次的 `DayPlan`。12 天轉字串不到 1 毫秒。
  - `party` 現在網站上改不了（建立行程時寫死 15／5／4），放進鑰匙只是為了保險，幾乎沒有成本。
  - 分組資料卡就在那一天的內容裡，不用另外處理。
- **快取放在哪**（Claude 決定）：引擎提供一個快取物件（例如 `createPlanCache()`），`planItinerary(it, data, config, cache?)` 可以選擇傳進去；不傳就照舊整份算，引擎還是純函式。快取跟著 `EngineData` 和設定走（換了就整個作廢）。
- **道路快取**：`walkMeters`、`driveMeters`、`driveMinutes` 會讀 OSRM 快取，查到新的路線後同一段的時間會變。現在每次編輯都整份重算，所以會順便吃到新值；只重算一天後，其他天不會。做法由實作決定（例如道路快取有新資料時讓 `EngineData` 換一個、或把版本號放進鑰匙），原則是**結果要和整份重算完全一樣**。
- 跨天的警告（`tiring-streak`、`no-free-time`）照舊，每次用各天的結果算。

### 7.4 測速、正確性的測試

- **結果一樣**：用快取算出來的 `ItineraryPlan` 要和不用快取整份重算的一模一樣。至少測：移動一張資料卡、改住宿（隔天的起點跟著變）、改某天的 `start`、改 `party`、換資料（`places` 變了）、道路快取有新值。
- **用網站的方式測速**：每次都是新的 `EngineData`、同一份資料（就是 `buildEngineData` 的做法），量第一次和編輯後重算的時間。行程要含大阪的天（約 8 段大阪的交通）。修之前、修快取之後、加上只重算一天之後，各量一次，數字寫進 commit 訊息。
- 界線（Claude 的建議，照實測調整）：`perf.test.ts` 現有的界線照樣要過；動一張資料卡後的重算要明顯比整份重算快，界線由實作照實測訂。

### 7.5 拿掉選班次

- **引擎**：忽略 `TravelSpec.trip`，刪掉過渡期的 `tripLeg` 路徑和只有它用的函式（§6.6）。`prevTrip`／`nextTrip` 拿掉。`rideDepartures` 留著（只能看的班次表要用）。舊行程裡的 `trip` 不報錯（`validateItinerary` 照樣接受），`setLegTravel` 不再寫 `trip`。`docs/CONVENTIONS.md` §3「行程」的 `travel` 說明：`trip` 改成「舊格式，忽略」。
- **網站**：拿掉 ‹ 前一班、後一班 ›、班次下拉（引擎拿掉 `trip` 後按了沒反應，所以要一起拿）。只動到「拿掉」為止，班次表照現在的樣子還能看，新的呈現留給 T29c。
- 用到的元件（`LegRow.tsx`、`MobileLeg.tsx`、`lib/timetable.ts` 等）改了要在 commit 訊息說明。

### 7.6 給 T29c 的交接：交通卡拿得到什麼

- 做完後在這份文件補一節（Claude 決定），用真實資料列出一段交通的 `Leg` 實際有哪些內容：伊勢志摩一段（近鐵或巴士）、大阪一段（班距型路線加轉乘）、第一天南下（南海 → 步行轉乘 → 近鐵特急）、一段搭計程車的。每段列出候選走法、每一程、轉乘步行和電梯、`ifMissed`、班距和首末班、警告。T29c 討論呈現方式時從這裡開始。
- 發現 T29c 會需要、但引擎還沒給的欄位，記在那一節，不在 T29b 加。

### 7.7 完成條件

- `npm test`、`npm run typecheck`、`npm run validate` 通過。
- dev server 打開一次行程，確認交通卡、班次表沒有當掉（🌐 少量）。

### 7.8 交接結果：交通卡拿得到什麼（2026-10-28，真實資料、全員 15 人）

T29b 做完時一段交通的 `Leg`（`packages/engine/src/types.ts`）。T29c 討論呈現方式從這裡開始。

**每一段都有**：`mode`（walk／taxi／train／bus／ferry／…／unknown）、`depart`、`arrive`、`minutes`（含等車）、`waitMinutes`、`walkMinutes`（含轉乘步行）、`transitAvailable`（出發後還有沒有車）、`specified`（使用者設定過）、`basis`（怎麼算的，例如「近鐵時刻表＋kamome-5-kuzaki 時刻表」）。警告另外在時間軸的 `warnings`。

**大眾運輸另外有**：
- `walkBefore`、`walkAfter`：走到第一個上車點、最後下車走到終點的分鐘。
- `ready[i]`：第 i 程「走到上車站／轉乘完」的時間。
- `rides[i]`（每一程）：`line`（近鐵是「特急（往賢島）」、巴士是路線名＋往哪、班距型是線名「大阪環狀線」）、`operator`、`from`／`to`（近鐵、班距型是車站 ID；巴士、船、JR 是停留所名稱）、`depart`／`arrive`、`tripId`（班距型是 null）、`fareAdult`（巴士有，近鐵、多數班距型是 null）、`kind`（timetable／headway）、班距型的 `headwayMin`、`first`、`last`、`ifMissed`（`depart` 下一班、`arrive` 整段晚到幾點、`lateMinutes`；null＝照同一條走法已經沒有下一班）。
- `transfers[i]`：第 i 程和第 i+1 程中間的轉乘：`walkMinutes`（已套係數）、`elevator`（有沒有電梯路線，多數 null）、`elevatorWalkMinutes`、`note`（`_transfers.json` 的說明，可能很長）。
- `alternatives`（1～3 條，第一條是目前用的）：`summary`（例如「特急 → 鳥羽 → 鷗巴士 5 號 鳥羽～國崎線（經相差）」）、`arrive`、`minutes`、`waitMinutes`、`walkMinutes`、`ridesCount`、`rides`、`transfers`、`path`（選了就存 `TravelSpec.path`）。
- 班次表另外用 `rideDepartures(data, cfg, date, ride)` 查同一對站那天的所有班次（班距型回傳 `[]`）。

**計程車另外有**：`taxi`（`cars`、`jumboCars`、`fareFromYen`、`fareEstimateYen`（加算費率沒查到時 null）、`note`）。

**五個例子**：

| 段落 | 結果 | 候選走法 | 錯過的話 | 警告 |
|---|---|---|---|---|
| 伊勢市 8:00 → 中之郷（2/5） | 45 分（等 11、走 6）：特急 伊勢市 08:11 → 鳥羽 08:26，轉乘走 3 分，鷗巴士 5 號 08:30 → 08:42，走 3 分 | 2 條：上面那條、「普通」直達 09:31 到（等 67 分） | 兩程都是下一班 → 10:03 到，晚 78 分 | `bus-crowd` |
| 鳥羽 10:00 → 賢島（2/5） | 39 分（等 10）：特急 10:10 → 10:39 | 1 條 | 10:29 發，晚 29 分 | — |
| 通天閣 10:00 → SAN-OBP（2/12，大阪） | 45 分（走 11＋15、等 4）：大阪環狀線 新今宮 → 大阪城公園，約 4 分一班、05:15～23:48 | 1 條 | 10:19 發，晚 4 分 | — |
| 關西機場 14:35 → 鵜方（2/2，第一天南下） | 240 分（等 33、轉乘走 16）：南海 機場急行（15 分一班）15:08 → なんば 15:54，轉乘走 16 分（有電梯路線約 24 分，`note` 很長），近鐵特急 1-382 16:10 → 18:35 | 1 條 | 兩程都是 null（見下面 1.） | `long-wait`、`transfer-walk` |
| 伊勢市 10:00 → 朝熊（2/5） | 計程車 13 分：一般 4 台或大型 2 台，`fareEstimateYen` null | 沒有 | 沒有 | `long-wait`（電車要等 39 分，改搭計程車）、`taxi` |

**T29c 要注意、引擎還沒給的**（T29b 不加）：
1. **`ifMissed` 只照同一條走法重算**：16:10 是大阪難波直達鵜方的末班特急，所以錯過南海或錯過 16:10 都是 null，照 §8 會寫「這是末班」；但其實改搭 17:10 特急到伊勢市轉普通，20:13 還到得了。需要「錯過的話改用別條走法」的話，引擎要另外算。
2. **候選走法常常只有 1 條**（RAPTOR 只留到達時間和程數互不輸的）：「切換走法」在很多段落沒東西可以切。
3. **轉乘的 `note` 很長**（例如難波那段約 300 字），要摺起來或摘要。
4. **巴士、船的 `from`／`to` 是停留所名稱，近鐵、班距型是車站 ID**：畫面要自己轉成名稱，而且巴士停留所沒有資料點可以點。
5. **近鐵、班距型的 `fareAdult` 多是 null**，票價只有巴士比較完整。
6. **計程車沒有候選**：計程車段落看不到「搭電車要等多久」，只有警告的文字（`long-wait` 寫了「電車要等 39 分」）。

## 8. T29c：交通卡和車站面板的畫面（T29b 之後）

先和 👤 討論呈現方式（從 §7.6 的清單開始），定案後再做。以下是 2026-10-26 的初步想法，討論時可以改。

照 👤 的三件事（§2）：
- **收合時**：第一行照舊「大眾運輸 N 分」，小字「含等車 N 分」。第二行是走法，例如「近鐵特急 → 鶴橋 → JR 環狀線 → 大阪城公園」。
- **候選走法**：卡片上可以切換（`Leg.alternatives`），預設最快的那條。選了就存 `TravelSpec.path`；記的是走法，不是班次。
- **展開後的步驟**：現在的步驟照舊。兩程中間的轉乘步行另外列一段「步行 N 分」，有電梯路線的話寫「有電梯，約 N 分」。
- **班次表**：只能看，不能選。標出規劃搭的那班和前後幾班。每一程寫一句「錯過的話：下一班 10:45，晚 30 分到」（`ifMissed`），末班時寫「這是末班」。班距型那一程不開班次表，改寫「約 N 分一班・首班 5:24／末班 24:12」。
- **拿掉選班次**：T29b 已經拿掉（§7.5），這裡只做新的呈現。
- **車站面板**：班距型路線顯示「約 N 分一班、首末班」，不列班次。這原本在 T29 的卡上，移到這裡，避免和 T15m 同時改 `web/`。
- 完成條件：手機尺寸看一次交通卡和車站面板（🌐 少量）。

## 9. 留給實作的

- RAPTOR 的資料結構、快取方式、起點數量的上限。
- 近鐵在走法裡的路線 key 怎麼分組（§6.2）。
- 走法摘要的文字格式。
- §6.5 的數字（照測試調整，寫進 commit 訊息）。
- `scripts/build-static.mjs` 的 `index.json` 怎麼摘要班距型路線。
