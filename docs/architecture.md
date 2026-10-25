# 網站架構：技術選型、資料庫、部署、登入

> 2026-10-21 和 👤 討論後決定。寫程式的任務（T11 以後、T22～T25）開工前先讀這份。
> 任務清單見 [PLAN.md](PLAN.md)；資料格式見 [CONVENTIONS.md](CONVENTIONS.md)；介面設計見 [interaction-design.md](interaction-design.md)。

---

## 0. 決定摘要

| 項目 | 決定 |
|---|---|
| 語言 | 全部用 TypeScript（Node 22）；不用 Python |
| 專案結構 | npm workspaces 的 monorepo：`packages/engine`、`web`、`worker`、`scripts` |
| 前端 | Vite + React + MapLibre GL + Zustand，靜態的單頁應用（SPA），不用 Next.js；**手機優先**，操作以 AI 對話為主，不做拖拉 |
| 部署 | Cloudflare：Workers 靜態資源（網站）＋Worker（API）＋D1（資料庫） |
| 參考資料 | git 裡的 JSON 是**匯入的來源**；匯入 D1 的「預設資料層」後才是正式資料 |
| 使用者的修改 | 另存一層（修改層），**全員共用**，記錄誰改的，可以復原；不直接改預設資料 |
| 時刻表 | 不放進資料庫，維持靜態檔案 |
| 登入 | LINE 登入＋檢查是否為家人 LINE 群組的成員；另有白名單備案 |
| 行程與編輯 | 只有**一份確定的行程**；家人在每一天留**建議**（只有寫的人能刪）；任何人進入**規劃模式**後才能改行程（防止誤按的開關，不是權限控管）；資料點的修改直接生效，有紀錄、可以復原。見 interaction-design §6、§11 |
| AI（T16） | 工具在瀏覽器執行；Worker 只負責轉發，並加上 Claude API key；聊天紀錄存在 D1，只有自己看得到 |
| 時間 | 一律是日本時間，存成日期（`YYYY-MM-DD`）＋`HH:MM` 字串，不做時區換算（§3.8） |

---

## 1. 語言與專案結構

### 為什麼全部用 TypeScript
- **T14 行程引擎要在好幾個地方跑同一份程式**：
  - 瀏覽器（T15、T16）：改行程、顯示 AI 的提議時要馬上重算時間軸、空檔、衝突。
  - AI 工具（T16）：`update_itinerary` 要透過引擎檢查。
  - 測試：Node 的 `node --test`。

  用別的語言寫，前端就要再寫一份，或每次重算都打 API。
- 現有的腳本、schema 驗證（ajv）、v0 前端都是 JS／TS。Claude API 也有官方的 TypeScript SDK。
- T11～T21 沒有非用 Python 不可的部分：沒有資料科學或機器學習，時刻表查詢、步行時間估算都只是簡單的計算。之後真的需要 Python，照 CLAUDE.md 用 uv 管理環境。

### 目錄（T22 調整）

```
travel_helper/
├─ package.json          npm workspaces 的根目錄；validate、test 等指令維持在這裡
├─ packages/
│  └─ engine/            T14 行程引擎和共用型別：純 TS，沒有 UI、沒有 I/O，資料從參數傳進來
├─ web/                  前端（T11、T12、T15、T16）
├─ worker/               Cloudflare Worker：API、登入、匯入、Claude 代理（T24、T25、T16）
├─ scripts/              蒐集資料、驗證、匯入的腳本（檔案位置不變，多一份 package.json）
├─ schema/               JSON Schema：驗證 data/，Worker 驗證修改後的結果也用同一份
└─ data/                 參考資料的匯入來源（見 §3）
```

- `packages/engine` 不 import 瀏覽器或 Node 專用的 API，所以 `web` 和 `worker` 都能用。`tsconfig.json` 的 `lib` 只放 `ES2022`、`types` 是空的，用到 DOM 或 Node 的 API 時 typecheck 就會失敗。
- **共用型別放在 `packages/engine/src/types.ts`，不另開 `packages/types`**（T22 決定）：
  - 引擎本身就是純 TS、沒有任何依賴，`web`、`worker` import 它不會多帶進別的東西；只用型別時寫 `import type`，打包後完全不留。
  - 行程的型別（T14）和操作行程的程式一起改，放在同一個套件，T14 不用同時改兩個套件。
  - 少一個套件，就少一份 `package.json`、`tsconfig.json` 要維護。之後真的需要拆（例如 Worker 只想要型別），再把 `types.ts` 搬出去，`./types` 這個匯出路徑可以照舊。
  - 型別只列程式用得到的欄位；資料格式以 `schema/` 為準。
- **套件不先編譯**：`packages/engine` 的 `exports` 直接指到 `src/*.ts`。Vite 會處理 TS；Node（`node --test`、腳本）用 type stripping 直接跑，所以 engine 裡的 import 要寫副檔名（`./types.ts`），也不能用 `enum`、`namespace` 這類需要轉換的語法。workspace 是用連結裝進 `node_modules` 的，Node 會照實際路徑（`packages/engine/`）處理，不受「`node_modules` 裡的 TS 不能 strip」的限制。
- **workspace 名稱**：`@travel-helper/engine`、`@travel-helper/web`、`@travel-helper/worker`、`@travel-helper/scripts`。互相依賴寫 `"@travel-helper/engine": "*"`（npm 不支援 `workspace:` 協定）。
- **安裝**：只在根目錄跑一次 `npm install`，只有根目錄有 `package-lock.json`。各 workspace 自己的依賴寫在自己的 `package.json`，加套件用 `npm install <套件> -w web` 這種寫法。
- **指令**：都可以在根目錄跑。`npm run validate`、`npm test`（`scripts/test/` 和 `packages/*/test/`）、`npm run typecheck`（每個有 `typecheck` 的 workspace）、`npm run dev`、`npm run build`（轉給 `web`；要加參數時寫 `npm run dev -- --host`）。在 `web/` 裡直接跑 `npm run dev` 也可以。
- `scripts/` 是 workspace，只是為了把 ajv 等依賴寫在 `scripts/package.json`；腳本的指令仍然在根目錄的 `package.json`。

---

## 2. 前端

- 沿用 v0 的 Vite + React + TypeScript + MapLibre GL，圖磚用 OpenFreeMap。
- **手機優先**（interaction-design §1）：手機是全螢幕地圖加上可以拉起的面板；電腦是聊天室在左、地圖在右。同一套元件，用螢幕寬度切換版面。家人多半是在 LINE 內建瀏覽器打開，要在 iOS、Android 的 LINE 裡實測。
- **狀態**：用 Zustand。地圖範圍、選定的天、篩選、選取的點、規劃模式放在同一個 store；UI 和 AI 指令改的是同一份狀態。**store 的形狀在 T11 開頭就定**，T12 再補上動作 API。
- **不做拖拉**：排行程交給 AI，或用規劃模式的手動選單（interaction-design §11）。
- **語音輸入**：靠手機鍵盤的麥克風，網站不另外做語音辨識。
- **不需要伺服器端渲染**：不需要 SEO，打包成靜態檔案，由 Cloudflare 提供。
- **資料存取包在一層介面後面**（`web/src/data/`），有兩種實作：
  - **本機**：直接讀 `data/*.json`（v0 的 `import.meta.glob`），修改層是空的。T11、T12、T14 開發時用，不用等後端。
  - **API**：向 Worker 拿預設資料和修改，在瀏覽器合併（T15 起）。

  UI 只看到合併後的資料點，另外附上「哪些欄位被改過」，所以兩種實作可以互換。

### store 的形狀（T11 定，2026-10-22）

兩個 store，都用 Zustand 的 `createStore`（vanilla，所以 Node 的測試、之後 T12 的指令都能直接用），React 透過 `web/src/hooks.ts` 的 `useApp`、`useData` 讀。

**`web/src/store.ts`：畫面狀態**（UI 和 T12 的地圖指令改的是這一份）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `view` | `{ center, zoom, bounds } \| null` | 地圖目前的範圍，地圖移動結束時更新。探索模式的圖片牆、AI 的脈絡用（interaction-design §5） |
| `day` | `'all' \| 'YYYY-MM-DD'` | 選定的天；不是 `all` 時其他天的點變淡 |
| `filter` | `{ areas, regions, types, contexts, tiers, fit15 }` | 都是陣列，空陣列＝不篩；`fit15` 是餐廳的 `group.fit15`（「可容納 15 人」，T12 加）；各項之間是「且」、同一項裡是「或」。不符合的點變淡，圖片牆不放 |
| `mode` | `'map' \| 'explore' \| 'wish'` | 電腦版右欄的分頁：行程（`map`）、探索、想去（第二輪加 `wish`；右欄順序探索｜想去｜行程） |
| `planning` | `boolean` | 編輯中（第五輪前叫「規劃模式」，欄位名照舊）：日期列的「✏️ 編輯這天」確認後打開、藍條的「完成」關掉、閒置自動結束；整個 app 一個值，換到別天照樣在編輯，選「全部」（`selectDay('all')`）就結束 |
| `tripFocusDay` | `string \| null` | 整趟（`day` 是 `all`）時點了某天的路線：那天亮、其他天變淡（第五輪 §9.1）；`selectDay` 時清掉，`setTripFocusDay` 設定 |
| `hoveredId` | `string \| null` | 地圖上要閃的點（滑鼠移過去、圖片牆點了、聊天室的地點標籤） |
| `previewId` | `string \| null` | 小卡片 |
| `detailId` | `string \| null` | 詳情面板（車站的詳情裡有時刻表） |
| `exploreTarget` | `{ id, seq } \| null` | 電腦版點了地圖上的點：探索清單捲到那張卡片（`seq` 讓同一點再點也會捲） |
| `selection` | `string[]` | 「問 AI」選取的點 |
| `stationTime` | `string \| null` | 車站面板的指定時間（`HH:MM`），null 時用行程排到的時間或 09:00 |
| `camera` | `{ seq, bbox?, center?, zoom? } \| null` | 叫地圖移動的請求：MapView 看到 `seq` 變了就移過去。使用者自己拖地圖不產生請求，只更新 `view` |
| `highlights` | `{ primary?, warning?, muted?: string[] }` | `highlight` 標示的點，每種樣式一組（黃、紅、灰框）（T12） |
| `routesVersion` | `number` | 確定的行程線查到新路徑（`itineraryRoutes.ts`）就加一，`MapView` 看到變了就重畫行程線（第三輪） |
| `routes` | `MapRoute[]` | `drawRoute` 畫的路線：起訖（資料點或座標）、交通方式、分鐘、路徑、距離、`source`（`pending`／`osrm`／`rail`／`straight`／`given`）（T12） |
| `compare` | `string[]` | 比較中的點：地圖標 A、B、C，上方出現比較列（T12） |
| `proposal` | `{ itinerary, dates, changes, summary } \| null` | AI 提議的行程（itinerary-v1）、有改動的天、engine `diffItinerary` 的改動；地圖用虛線、半透明畫，不改確定的行程（T12） |

設定函式（同步、不檢查輸入；UI 和 AI 要用下面的地圖指令）：`setView`、`selectDay`、`setFilter(patch)`、`toggleFilter(key, value)`、`clearFilter`、`setMode`、`setPlanning`、`hover`、`openPreview`、`openDetail`（小卡片收起）、`closeDetail`、`revealInExplore(id)`、`addToSelection`、`removeFromSelection`、`setStationTime`、`moveCamera`；T12 加 `setSelection`、`setHighlight(style, ids)`、`addRoute`、`updateRoute`、`setCompare`、`clearHighlights`（標示、路線、比較一起清）、`setProposal`。

### 手機版的殼、mobileStore、shared（T15m 第六輪，2026-10-25）

- **分界**：`App.tsx` 只在最外層用 `useIsDesktop()`（`DESKTOP_QUERY`，900px）分一次：電腦畫 `web/src/components/` 的三欄，手機畫 `web/src/mobile/MobileApp.tsx`。手機版元件全在 `mobile/`，自己的 `mobile.css`、`chat.css`（class 用 `m-` 開頭）。舊手機版的拉起面板（`sheet`、`setSheet`）第六輪已經從 `store.ts` 刪掉；手機版的分頁、面板高度、整頁都在 `mobileStore`。
- **殼**：底部 5 個分頁（探索、想去、行程、AI、我）。`MapView` 一直掛著，不在行程分頁時用 CSS（`visibility: hidden`）藏起來，不卸載（T12 的地圖指令、e2e 的 `ready()` 都要用到）。詳情、討論、預約是蓋在最上面的整頁，一次只有一層。
- **`mobile/mobileStore.ts`**（vanilla Zustand，dev 時掛在 `window.__thMobile`）：手機版自己的畫面狀態，不放進 `store.ts`——現在的分頁（`tab`）、行程面板的高度（`tripSnap`：low／mid／high，`setSnap`）、行程選到的卡（`focused`，`focusItem` 設定）、編輯中打開的「⋯」動作面板（`actions`）、整頁詳情（`detail`）和討論／預約（`page`）、行程頁的半屏聊天（`chatSheet`）、探索的篩選、想去的設定。打開整頁（詳情或討論／預約）時推一筆 history：手機的返回鍵關掉那一頁，頁面的「‹」也是退回那一筆（兩種整頁互換時共用一筆）。
- **`uiStore.chatDraft`**：「問 AI」的草稿 `{ seq, text, placeId, date, from }`，由 `askAboutPlace(placeId, text, from)` 寫入並把地點放進選取；畫面怎麼切由各平台的 store 監聽 `seq`：電腦版放進左邊的聊天欄；手機版從行程打開的詳情回行程、打開半屏聊天，其他地方打開的跳到 AI 分頁。AI 的內容先是 `mobile/chatDemo.ts` 的假訊息，T16m 接上。
- **`web/src/shared/`**：網頁版、手機版共用的純函式，有單元測試（`web/test/shared.test.ts` 等）：`tagOptions`（標籤的分組、顏色、互斥的 `toggleTag`）、`cardActions`（卡片的「⋯」動作清單，兩邊用同一份）、`askAiPrompts`（問 AI 的建議問題）、`placeLists`（探索、想去的清單計算的 hook，兩邊共用）、`exportJson`（下載行程 JSON）。引擎的 visit 用 `tags` 取代 `meal`、`dining`（CONVENTIONS §3）。

### 地圖指令（T12，2026-10-22）

**UI 和 AI（T16）都透過 `web/src/commands.ts` 的指令操作地圖**，改的是上面同一份 store；網站共用的一份是 `web/src/appCommands.ts` 的 `commands`（dev server 下也在 `window.__th.commands`）。每個指令都檢查輸入，回傳 `{ ok: true, … }` 或 `{ ok: false, error }`（失敗時狀態不變），AI 可以讀結果決定下一步。

| 指令 | 做什麼 |
|---|---|
| `focus(target)` | 地圖移過去。目標：資料點 ID（放大到 15、點會閃）、ID 的陣列（框住全部）、`{ area }`、`{ region }`（從 areas.json 讀）、`{ day }`、`{ bbox }`、`{ center, zoom }` |
| `highlight(ids, style = 'primary')` | 標示幾個點；同一樣式再叫一次是取代，給空陣列是清掉那一組 |
| `drawRoute(from, to, mode = 'walk', { minutes?, label?, geometry? })` | 畫一條路線，回傳 `routeId`。路徑由 `routeResolver.ts` 在背景補上（見下面「路線」） |
| `compare(ids)` | 比較 2～6 個點：地圖框住、標 A、B、C，上方出現比較列；回傳每個點的分級、標章、摘要 |
| `clearHighlights()` | 清掉標示、路線、比較（篩選、選取、提議不動） |
| `selectDay(day)` | 切換天數；選了某一天，地圖框住那天排的點（最多放大到 14） |
| `setFilter(patch)`／`clearFilter()` | 給的那幾項整個取代，沒給的不動；值從 areas.json 和常數檢查。回傳篩選標籤和筆數。地圖上方出現可以取消的篩選標籤 |
| `select(ids)`／`unselect(ids?)` | 「問 AI」的選取：累加、不重複；`unselect()` 全部取消 |
| `showProposal(itinerary, { summary? })`／`clearProposal()` | 顯示 AI 提議的行程：和確定的行程比出改動的天，只有一天時切到那天、框住提議的點。採用由 T15／T16 用 engine 的操作寫進行程，再 `clearProposal` |
| `getViewState()` | 給 AI 的畫面狀態（interaction-design §5）：地圖範圍、畫面裡符合篩選的點數、選定的天和那天的點、篩選和標籤、模式、規劃模式、選取的點、打開的詳情、標示、比較、路線、提議。可以直接 JSON 化 |

UI 的天數分頁、篩選標籤的 ✕、「跳到區域」、詳情的「問 AI」、聊天室選取標籤的 ✕、「這一天」的項目都改走這些指令。篩選面板的切換按鈕直接用 store 的 `toggleFilter`（同一份狀態）。

**地圖上的樣子**（`components/mapOverlayLayers.ts`、`lib/overlays.ts`）：
- 標示：黃、紅、灰的框；比較：紫框加 A、B、C。
- 路線：白底加一條依交通方式上色的線，步行點線、船虛線、其他實線；直線（查不到路徑）比較淡。中間的標籤（「🚶 8 分」）是 DOM 標記。
- 提議（👤 2026-10-22 決定）：確定的行程照常；提議那幾天的點用半透明白底、那天顏色的框，編號在點的下方（確定的行程的編號在上方），依序用那天顏色的虛線連起來；新增的點加綠框，拿掉的點變灰加 ×。提議列有摘要（「2/5：＋鳥羽水族館、－XX」）和「不看提議」；「採用／修改」在 T15／T16 加。

**路線**（`lib/routing.ts`，👤 2026-10-22 決定：沿道路走、在瀏覽器直接查）：
- 步行（OSRM foot）、計程車、包車、自駕、巴士（OSRM car）：在瀏覽器查公開的 OSRM（`routing.openstreetmap.de`），請求排隊、間隔 1.1 秒；查過的存在記憶體和 localStorage，同樣的起訖點（四捨五入到約 1 公尺）不再查。查不到（網路、OSRM 錯誤）畫直線。
- 電車：依序連經過的車站（同一家、同字首的站號，例如近鐵 M71～M93）；連不起來（JR 沒有站號）畫直線。船、其他：直線。
- 分鐘：呼叫者給的優先（例如 T14 的 `Leg.minutes`）；沒給時，步行用路徑距離 ÷ 每分 80 m × 全員係數（engine 的 `DEFAULT_CONFIG`，實際路徑不再乘繞路係數），計程車、包車、自駕用 engine 的 `taxiEstimate`；電車、巴士、船看時刻表，不算。
- 查到的距離也給引擎用：`roadRouter.cachedMeters(profile, from, to)` 是同步的，T15 先查好路徑，再接到 `EngineData.walkMeters`、`driveMeters`（T12 加，計程車、包車用實際開車距離）；第四輪加 `driveMinutes`（OSRM 的開車時間，計程車用它）。`data/cache/routes/` 照 §3.1 不上網站。
- 地圖上確定的行程線（第三輪）每一天都沿道路／鐵路畫：`itineraryRoutes.ts` 的 `startItineraryRoutes` 把每一天每一段步行、車依序向同一個 `roadRouter`（共用的佇列，1.1 秒一個，有快取）要路徑，選定的那天先、其他天照日期排在後面，選「全部」就照日期；選定的天變了、時間軸重算或別處（drawRoute）查到路徑時重新排（已在快取的不再查，舊的一輪停止往下排），查到就讓 store 的 `routesVersion` 加一，`MapView` 重畫。`createPathOf` 同步取路徑（步行、車看快取，電車用 `railPath`），給 `itineraryFeatures(…, pathOf)`。查不到就維持直線。

**`web/src/dataStore.ts`：讀進來的資料**：`status`、`areas`（areas.json，依 `tripOrder`）、`basePlaces`（預設資料）、`places`（套上修改層的，畫面都用這一份）、`byId`、`itinerary`（確定的行程，engine 的 itinerary-v1，從後端讀）、`days`（資料點 → 排在哪幾天、第幾個；順序是 `lib/itinerary.ts` 的 `dayStops`：選定的選項、同一個機場連續的航班算一站、分組只放會合點、住宿放最後）、`stationNames`。`itinerary`、`places` 由下面的 `sharedStore` 換（存檔、同步、修改紀錄變了）。

### 後端、共用資料、行程引擎（T15m，2026-10-23）

T15m 先用假後端把畫面做出來，T15 只換後端的實作，畫面的程式不改。

- **`web/src/backend/`：後端的介面**（`types.ts` 的 `Backend`）。形狀照 §4「資料 API」：行程（`version`、409 衝突）、快照、投票（❤️ 就是想去）、留言（地點或某一天）、候選（某天的候選）、修改紀錄、成員、`sync`。2026-10-24 拿掉建議、改成想去分頁和候選（設計見 `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md`）；留言、候選 Worker 還沒有，T15 要補（§3.6）。錯誤是 `BackendError`（HTTP 狀態＋`error`、`message`、`details`）。
  - `mock.ts`：假後端，規則和 Worker 一樣（只有寫的人能改刪、軟刪除、改行程前自動存快照、version 不對回 409），資料存在記憶體加 localStorage（`travel-helper:mockBackend:v2`）。種子資料在 `dev-fixtures/seed.ts`（4 位假家人、排了一半的行程：有時段備案、分組、空檔）。
  - `index.ts`：dev server 用假後端；正式 build 先用「還沒接上」的版本（只能看、寫入都回 503）。**T15 在這裡換成呼叫 API 的實作**。假後端、種子資料、dev 選單都用 `import.meta.env.DEV` 包起來，不會進 `dist/`。
- **`web/src/sharedStore.ts`（純邏輯）／`appShared.ts`（網站共用的一份）：大家共用的資料**。
  - 狀態：`me`、`members`、`version`（手上那份行程的）、`updatedBy`、`updatedAt`、`snapshots`、`votes`、`comments`、`wishes`、`edits`、`saving`、`conflict`（409 之後不能再改，按「重新載入」才清掉）、`toast`、`lastSync`。
  - 動作：`changeItinerary(fn, reason)`（fn 用 engine 的操作；先在畫面上改，存不了就退回；**一個使用者動作只存一次檔**，快照才會整個復原）、`reloadItinerary`、`restoreSnapshot`、`vote(placeId, value)`、留言的新增／修改／刪除（`comment`、`editComment`、`deleteComment`）、`addCandidate(placeId, day)`、`removeCandidate(id, reason?, placed?)`（自己加的直接撤回；別人加的要理由，理由變成那個點一則 `kind: 'decline'` 的留言；排進行程後用 `placed` 拿掉）、`revertEdit`、`syncOnce`。純函式在 `lib/wishlist.ts`：`likedPlaces`（有人 ❤️ 的點、頭像）、`dayCandidates`（某天的候選，已經排進那天的不列）。
  - 同步照 §3.8：每 30 秒、切回分頁時打一次 `sync`，變了才重抓那一種；行程有別人的新版本時直接換上（存檔中、衝突中不換）。
  - 修改紀錄在瀏覽器合併：`data/merge.ts` 直接用 Worker 的 `worker/src/lib/merge.ts`，`place.edited` 是「欄位 → 最新那筆修改（`editId`、誰、何時、原本的值）」。
- **`web/src/planStore.ts`：行程引擎在瀏覽器跑**。行程或資料點變了就重算整份（12 天約 15 ms）。引擎要的時刻表從 `DataSource.loadEngineTimetables()` 讀（近鐵 `_travel-times.json`、巴士、船、JR 的路線檔，約 1.3 MB，第一次算時才載入）；`walkMeters`、`driveMeters` 接 `roadRouter.cachedMeters`。T15 的 API 實作要從 `build:static` 的輸出讀這些檔案。
- **`web/src/uiStore.ts`：對話框和地圖區的視窗**，對話框一次只開一個（開始編輯的確認、快照、排進行程、移到別天、拿掉別人加的候選、修改紀錄、需要預約），`components/Dialogs.tsx` 負責畫；另有編輯的閒置分鐘（預設 10）、`mapPanel`（電腦版地圖區右上角 💬 討論、📋 預約打開的彈窗：浮在地圖上、四周留地圖，點彈窗外的地圖就關掉；手機版不用它，💬／📋 打開的是 `mobileStore.page` 的整頁；`{ kind: 'comments' | 'reservations', scope: 'day' | 'trip', focus? }`，`openMapPanel`／`closeMapPanel`／`setMapPanelScope`；時間軸的預約 tag 用 `focus` 帶到那一列）、`legOpen`（點開的交通卡，一次一段，key 是 `legKeyOf`（`日期:visit:項目 ID` 這類）：交通卡平常收起，點了地圖只畫那一段（`commands.drawRoute`），大眾運輸展開步驟，編輯中就在原地變成編輯狀態（方式、每一程的班次下拉、備註）；點開前後距離一樣（第五輪 §3.5）；卡片不見了也清掉）、`timetable`（地圖那側的班次表 `TimetablePopup`：`{ date, legKey, rideIndex }`，交通卡步驟裡搭車那一行的「› 班次」用 `openTimetable` 打開，和 `mapPanel` 互斥；✕、點地圖、換天、那張交通卡收起或換別段、這一程不見了就關掉；編輯中點搭得到的班＝選它）。
- **篩選加 `votes`**（`'popular'`：❤️ 2 人以上、`'mine'`：我按了 ❤️）。投票不在資料點裡，`appShared` 用 `setVoteLookup` 註冊查詢，`matchesFilter` 的呼叫者不用改；T12 的 `setFilter` 也認得。**搜尋**不放進 `Filter`（`setFilter` 的格式都是陣列）：`appStore.query`＋`matchesQuery`，探索、想去、地圖共用。
- **編輯**（第五輪前叫規劃模式）：`appStore.planning` 還是唯一的開關；「✏️ 編輯這天」（`PlanningToggle`，「這一天」面板的日期列，編輯中不顯示）、進入前確認（「開始編輯？」）、時間軸面板最上面的藍條（`PlanningBar`：快照、「完成」）、面板不在畫面上時浮在地圖上方的精簡條（`EditingStrip`）、第一次的提示（`EditHint`，記在 localStorage）、閒置結束（`usePlanningIdle`）。Worker 不檢查規劃模式（§3.6）。**想去**是 `appStore.mode === 'wish'`：電腦版右欄的分頁（順序探索｜想去｜行程），內容是 `ExplorePanel source="wish"`（只列有人 ❤️ 的點，卡片底下是 `Wishlist.tsx` 的 `WishExtras`）；地圖在這個模式把沒人 ❤️ 的點變淡。手機版的想去是底部的分頁（`mobile/WishlistPage.tsx`，設定在 `mobileStore.wish`），不用 `appStore.mode`。行程分頁時間軸下面是這天的候選（`DayCandidates`，規劃模式下 ↑ 排進）和這天的留言（`DayComments`，`target` 是 `day:<日期>`）。排進行程走 `components/addToDay.ts`：引擎的 `bestInsertIndex` 找最順路的位置（`planStore.currentEngineData()` 給引擎資料），`proposedBy` 記按 ❤️ 的人。排進後那天的候選自動拿掉。拖曳在 `components/planDrag.ts`（電腦版 HTML5 拖放，手機長按 0.4 秒後拖；放開的結果由 `lib/dropIntent.ts` 算）：時間軸的卡片、合併卡片正在看的備卡、這天的候選都能拖；放在同類型卡片中間＝合併（`mergeItems`／`addOption`／`moveOption`），卡片上下邊緣、交通卡、最後的放置區＝排在那裡（`moveItemTo`／`addItem`／`detachOption`），備卡放到候選區＝放回候選；放回原位不存檔。這些都經過 `changeItinerary` 的 `undo` 跳「復原」提示（候選的增減在 `settle` 裡做完才跳提示；行程之後又被改過就不復原）。
- **交通的時間和班次**：引擎不加緩衝（第四輪拿掉 `config.buffer`、`Leg.bufferMinutes`；舊資料的 `TravelSpec.bufferMinutes` 忽略），`leg.arrive`＝出發＋`minutes`，等車含在 `minutes` 裡、另外寫在 `waitMinutes`（前一站的時間不變）。計程車用 `EngineData.driveMinutes`（OSRM 開車時間），沒有時用距離 ÷ `taxi.kmPerHour`（`taxi.overheadMinutes` 預設 0）。搭車的段落 `Leg.trip` 是用的那班（`TripRef`），`prevTrip`／`nextTrip` 是同一對上下車點的前一班、後一班，`transitAvailable` 是出發後時刻表裡還有沒有這兩點之間的班次（不管等多久；false 時規劃模式的「大眾運輸」灰掉）。每段交通可以設定（`TravelSpec`：`mode`（含 `transit`：一定搭大眾運輸）、`minutes`、`trip`（選定的班次；`trip.from`／`to` 和這段的起訖點不同時當作沒選，趕不上照樣用、警告 `missed-trip`，時間照走到上車點後搭同一程算）、`note`，都可省略；一天最後回住宿的那段放在 `ItineraryDay.returnTravel`，航班在 `FlightItem.travel`）：`setLegTravel`／`getLegTravel`。標籤是 `VisitItem.tags`（`setTags`；舊的 `meal`、`dining` 用 `upgradeItinerary` 轉），用餐標籤在時間軸上是 `TimelineEntry.mealTags`，引擎不再自動產生用餐的空檔。
- **預約筆記的假後端**（第三輪）：`Backend.listReservations()`、`putReservation({ date, placeId, status, note?, nights? })`；`Reservation` 是 `{ date, placeId, status: 'pending' | 'booked' | 'skip', note, nights, updatedBy, updatedAt }`，同一個 `(date, placeId)` 只有一筆（住宿的 `date` 是入住那晚），`putReservation` 整筆取代，`updatedBy`、`updatedAt` 由後端填。`sync` 多回一個 `reservations` 時間戳，`sharedStore.reservations` 跟著換；`putReservation` 在畫面上先改、失敗退回。整趟的留言是 `target` 為 `TRIP_TARGET`（`'trip'`）的留言，和地點（ID）、某一天（`day:<日期>`）並列。假後端的 localStorage key 升到 `travel-helper:mockBackend:v4`。狀態和時間軸 tag 的對應在 `lib/reservations.ts`（住宿換了入住日、項目移到別天就回到未訂位）。
- **地圖**（`lib/overlays.ts` 的 `itineraryFeatures`、`placeBadges`）：每天顏色的路線（直線，照時間軸的順序）、選了某一天時那天的交通標籤、時段備案的備選是那天顏色的空心圈、每個點的 ❤️ 數（放大到 10 以上）。
- **電腦版三欄**（T15m 版面調整，參考 puma.taipei/heart-island）：`App.tsx` 的 `DesktopLayout` 是聊天室｜地圖｜右欄。地圖上方浮著 `TopBar.tsx` 的 `MapTopBar`（日期、待處理、規劃模式、我、篩選標籤）；右欄是 `SidePanel.tsx`，分頁用 `appStore.mode`（`map`＝行程、`explore`＝探索），`detailId` 有值時詳情蓋在右欄上。探索是 `Explore.tsx`（清單邏輯在 `lib/explore.ts`），類型寫在 `filter.types`，從探索切回行程時拿掉（`showItinerary`）。點地圖上的點走 `showInExplore`：切到探索、換成那一類（目前的篩選看不到它就只留類型和地區）、捲到卡片；再點卡片才開詳情。詳情面板（`DetailPanel.tsx`）分成總覽、詳細、附近・連結、圖片四頁。探索上方的類型分頁是 sticky；篩選捲出畫面時（看 `.side-body` 的捲動）收合成一列摘要，疊在清單上、不推動清單。
- **問 AI**（`components/askAi.ts`）：電腦版的探索卡片、詳情標題用 HTML 的拖放（`dragPlaceProps`，資料型別 `application/x-travel-place`），放到聊天欄（`dropAiProps`，`data-drop-ai`）就 `commands.select(id)` 並提示「已帶進聊天」。電腦版詳情標題的「＋ 問 AI」（`toggleAskAi`）也是加進選取。手機沒有拖曳：整頁詳情的「✨ 問 AI」（`AskAiBox`）送出後，從行程打開的回到行程開半屏聊天、其他的跳到 AI 分頁（`mobileStore`；編輯中從行程打開的詳情不畫問 AI，因為編輯中半屏聊天藏起來）。地圖上的點不做拖曳（和拖地圖衝突）。T16 的聊天室把選取帶進對話，AI 就知道要問哪幾個點（例如兩點的距離）；之後再加輸入框的 `@` 選地點、自動帶入正在看的點。
- **地圖的點**（`MapView.tsx`、`mapIcons.ts`）：照片標記拿掉，改成 Google Maps 那種類別圖標（canvas 畫的 `icon-<type>`），`ICON_ZOOM`（12）以下是小點。選了某一天，那天的點換成編號圓（`places-mark`），編號由 `lib/planView.ts` 的 `stopMarks` 照時間軸算（住宿「宿」、機場「機」、其他 1、2、3…；分組先編各組再編會合點），時間軸用同一份；那天的路線加方向箭頭（`itinerary-arrow`，分組時每組各一條）。選中的點（`detailId`，或探索分頁的 `exploreTarget`）畫成水滴圖釘（`pin-<type>`、`places-pin` 圖層），原本的圖標藏起來；只有小卡片時才用圓框（`places-focus`）。點的時候查 `places-circle`、`places-icon`、`places-mark`、`places-pin` 四層。探索分頁時不因為「不在那天」變淡。
- **`data-day` 只給天數分頁用**（e2e 靠它找分頁）；其他選日子的按鈕用 `data-pick-day`、`data-overview-day`。

**區域不寫死**：區域清單、名稱、子地區、區域篩選的選項、「跳到區域」都從 `areas.json` 讀。地圖的初始範圍：bbox 彼此在 30 km 以內的區域分成一群，用資料點最多的那群的資料點範圍（`web/src/lib/areas.ts`）；所以加了大阪也會和關西機場周邊同一群，不影響初始畫面。區域的顏色依 `tripOrder` 的順序配。

---

## 3. 資料：預設資料層＋修改層

### 3.1 資料分成哪幾種

| 資料 | 誰寫 | 存在哪裡 |
|---|---|---|
| **預設資料**：車站、景點、住宿、餐廳 | **只有匯入腳本** | D1 `places_base` |
| **修改**：針對某個點的某個欄位的修改 | 使用者（網站） | D1 `place_edits` |
| **自己加的點** | 使用者（網站） | D1 `user_places` |
| **確定的行程、快照、建議、投票** | 使用者（網站） | D1（§3.6） |
| **聊天紀錄** | 使用者和 AI | D1，只有自己看得到（§6） |
| **時刻表**（近鐵、JR、巴士、定期船）、`passes.json`、`access/` | Claude Code | 靜態檔案（§3.7） |
| **研究筆記**（`data/raw/`）、`data/cache/`、`data/derived/` | Claude Code | **不上網站**，只留在 git |

**預設資料層只有匯入能改**：使用者在網站上改的東西一律寫進修改層。這樣永遠分得出「原本查到的」和「使用者改的」，重新匯入時才不會互相覆蓋（§3.4）。

### 3.2 合併規則
- 網站看到的資料點 ＝ 預設資料，再套上每個欄位**最新一筆、還沒復原**的修改。
- **修改的單位是欄位**：`field_path` 指到最上層欄位，或往下一層，例如 `hours`、`group.maxSeats`、`reservation`。修改的值整個取代那個位置的值。陣列也是整個取代，例如 `photos`。
- **改完要驗證**：Worker 收到修改時，先合併再用 `schema/` 驗證，不符合就拒絕。Worker 不能執行 `new Function`，所以用 ajv 的 standalone 模式，把 schema 先編譯成驗證程式。
- 修改時順便記下當時的預設值（`base_value`），重新匯入時用來比對（§3.4）。
- **畫面上標出改過的欄位**：顯示「已修改（誰、何時）」，可以看修改紀錄、復原，也可以一鍵看原本的值。
- **修改直接生效，不走建議**：這是事實的更正，不是行程的安排，而且有紀錄、可以復原。使用者透過 AI 修改（AI 提議、使用者確認）。
- **不刪別人的修改**：改錯了就再新增一筆修改蓋過去；復原（`reverted_at`）只有改的人自己能按。
- 個人想記、不給大家看的東西，之後需要時另外做成「個人備註」，不放進修改層。

### 3.3 資料表（D1，T24 定案）

定案的 SQL 在 `worker/migrations/0001_init.sql`（每個欄位都有註解）。下面是 2026-10-21 的草稿，T24 定案時改了這些：

- `place_edits` 加 `updated_at`（建立、復原、匯入收掉時更新，`GET /api/edits?since=` 用）、`note`（修改的理由）、`closed_at`／`closed_import_id`／`closed_reason`（匯入時收掉：`same-as-new-base` 兩邊改成一樣、`conflict-use-base` 衝突時選了新的預設值）。ID 是自動編號的整數，越大越新。
- `base_value` 是 SQL 的 `NULL` 表示「預設資料沒有這個欄位」，和 JSON 的 `null`（欄位是 null）分開。
- `places_base` 加 `first_import_id`、`retired_import_id`；`import_id` 是最後一次改到這一列的匯入。
- `votes` 加 `deleted_at`：收回投票是軟刪除。**所有刪除都是軟刪除**，同步只要看 `MAX(updated_at)`（§4「同步」）。
- `user_places` 加 `updated_by`；ID 是 `user-<隨機 12 碼>`，validate 禁止匯入的資料用 `user-` 開頭，不會撞。
- `redirects` 加 `reason`。
- 時間欄位（`*_at`）是 UTC 的 ISO 字串，只用來記錄誰、何時改的；行程裡的時間照 §3.8 存日本時間的字串。
- D1 預設開著外鍵檢查：`author`、`member_id` 都要先在 `members` 裡（開發用的身分第一次出現時自動加進去）。

草稿：

```sql
imports       (id, area, git_commit, imported_at, imported_by, summary JSON)
places_base   (id PK, type, area, data JSON, content_hash, import_id, retired_at)
place_edits   (id PK, place_id, field_path, value JSON, base_value JSON,
               author, created_at, reverted_at, reverted_by)
user_places   (id PK, type, data JSON, author, created_at, updated_at, deleted_at)
redirects     (old_id PK, new_id, import_id)        -- 合併重複點時用（§3.5）
members       (line_user_id PK, display_name, picture_url, source, checked_at, disabled_at)
itinerary     (id PK, data JSON, version, updated_by, updated_at)   -- 只有一列：確定的行程
snapshots     (id PK, data JSON, version, reason, created_by, created_at)
suggestions   (id PK, day, place_ids JSON, text, author, created_at, updated_at,
               status, status_note, status_by, status_at, adopted_item_ids JSON, deleted_at)
               -- day：'2027-02-02'～'2027-02-13'，或 'trip'（整趟）
               -- status：pending／adopted／declined
votes         (place_id, member_id, value, note, updated_at, PRIMARY KEY (place_id, member_id))
chat_messages (id PK, member_id, conversation_id, role, content JSON, created_at)
ai_usage      (member_id, date, input_tokens, output_tokens, PRIMARY KEY (member_id, date))
```

- 結構複雜、常常整份讀寫的東西（資料點的內容、行程）存成 JSON 欄位；要統計、篩選的東西（投票、修改紀錄、建議）拆成一列一列。
- `user_places`、`suggestions` 的 `author`、`votes` 的 `member_id` 都對到 `members`；**只有本人能刪**，由 Worker 檢查。
- 資料點 551 筆（2026-10-22：住宿 145、餐廳 292、景點 82、車站 32），JSON 共約 2.9 MB，最大的一筆約 12 KB。D1 的免費額度見 §4「免費額度」。

### 3.4 匯入（T24 寫腳本）

匯入的對象是 `data/areas/<area>/*.json` 和 `data/stations.json`，一次匯入一個區域或全部。流程：

1. 跑 `scripts/validate`，不過就不匯入。
2. **先比對、出報告（dry run）**，用 ID 對應資料庫：
   - **新的 ID**：新增。
   - **內容變了**（`content_hash` 不同）：更新預設資料。這個點有修改的話，逐個欄位做三方比對：

     | 情況 | 處理 |
     |---|---|
     | 新的預設值 ＝ `base_value`（預設值沒變） | 保留使用者的修改 |
     | 新的預設值 ＝ 使用者改的值（兩邊改成一樣） | 這筆修改標成已收掉 |
     | 三個都不一樣（兩邊都改了） | **列成衝突**，不自動決定 |

   - **這次沒有的 ID**：標成下架（`retired_at`），**不刪除**。行程、投票、修改都用 ID 連到它；網站上照樣顯示，但標示「已下架」，引擎發出警告。
3. 👤 看過報告、處理完衝突，再正式匯入。匯入記在 `imports`（區域、git commit、各類筆數）。
4. **本機和正式環境分開**：先匯入本機的 D1（`wrangler dev`）試，沒問題再匯入正式環境。

**實作（T24）**：`scripts/db-import.mjs`（比對和 SQL 在 `scripts/lib/import-plan.mjs`，合併和三方比對和 Worker 共用 `worker/src/lib/merge.ts`）。

```sh
npm run db:import -- --all                 # 1. dry run：validate → 比對 → 報告（還沒寫進資料庫）
npm run db:import -- --area ise,futami     #    只匯入指定的區域（areas.json 的 ID）
npm run db:import -- --all --resolve r.json  # 有衝突時：{ "<修改 ID>": "keep" | "use-base" }，再出一次報告
npm run db:import -- --apply data/cache/import/<時間>-all.json   # 2. 👤 看過報告後正式匯入
```

- 報告寫到 `data/cache/import/<時間>-<範圍>.md`（給 👤 看：新增、更新的欄位、恢復、下架、區域換了、衝突的三個值、轉址）和 `.json`（計畫）。
- `--apply` 會重新比對一次，算出的 `planHash` 和報告不一樣（出報告之後資料或資料庫變了）就不匯入。有沒處理的衝突也不匯入。
- 比對用 `content_hash`：資料點的 JSON 鍵排序後的 sha256，所以只改縮排、鍵的順序不算「變了」。
- **區域不寫死**：可以指定的區域、要讀哪些檔案都從 `areas.json` 來。資料點的 `area` 換了（例如從 A 搬到 B），只匯入 A 時不下架（報告列成「區域換了」），匯入 B 時才更新。
- **衝突的處理**：`keep`＝保留使用者的修改，`base_value` 換成新的預設值（之後再匯入時以新的為準）；`use-base`＝用新的預設值，這筆修改收掉。兩種都記在 `imports.summary`。
- 下架的點又出現時恢復（`retired_at` 清掉）。
- 正式環境（`--remote`）的匯入等 T25 設定好 Cloudflare 才開放。

**新增區域**（例如之後加大阪）：照現在的方式蒐集到 `data/areas/osaka/`，驗證後匯入。大阪的 ID 都是新的，只會新增，不會碰到任何人的修改。

### 3.5 規則
- **ID 不改名**：ID 是連接預設資料、修改、行程、投票的關鍵。第一次正式匯入之後，已經匯入的 ID 不改名。
- **合併重複的點**：保留一個 ID，被合併的記成轉址（舊 ID → 新 ID）。轉址記在 `data/redirects.json`，匯入時寫進 `redirects`；行程、投票、修改都跟著轉過去。
  - 格式（T24 定，schema 見 `docs/requests.md`）：`[{ "from": "舊 ID", "to": "保留的 ID", "date": "YYYY-MM-DD", "reason": "為什麼合併", "task": "T13" }]`。validate 檢查：舊 ID 已經不在資料裡、目的地存在、不能連鎖、不能重複。
  - 匯入時：舊的點下架；修改的 `place_id` 換成新 ID；投票換過去（同一個人兩邊都投過就保留新 ID 那一票，舊的軟刪除）；建議的 `place_ids`、確定的行程裡**完全等於**舊 ID 的 JSON 字串換成新 ID（行程改之前先存快照、`version` 加一）；之前轉到舊 ID 的轉址直接改指新 ID。
  - Worker 收到舊 ID（`GET /api/places/:id`、修改、投票）時自動轉到新 ID；`GET /api/places` 回傳轉址表，前端顯示舊行程時用。
- **網站上線後，資料的修正一律在網站上改**（修改層），不再請 Claude Code 改既有區域的 JSON。預設資料只有匯入一種改法。例外是整批重查（例如重查某一區的營業時間），這時照 §3.4 重新匯入並處理衝突。
- **schema 改版**：欄位改名、搬位置時，修改層的 `field_path` 也要跟著搬，寫在 migration 裡。

### 3.6 確定的行程、建議、快照、投票
設計見 interaction-design §6、§11。

- **確定的行程只有一份**：整份存成一個 JSON 文件（格式由 T14 定），帶一個 `version` 號碼。一開始就放好航班當固定項目。不做「方案」。
- **只有規劃模式能改行程**：規劃模式是前端的開關，Worker 只檢查有沒有登入，不另外做權限。每次改動記下是誰改的。
- **同時編輯**：存檔時送出自己手上的 `version`。和資料庫的不一樣，就表示有人先改過，提示「別人改過了」，讓使用者重新載入再改。15 人的規模不做即時協作（CRDT、Durable Objects）。
- **快照**：每次改行程前自動存一份（包括採用 AI 的提議），可以復原；復原本身也是一次修改，會再存快照。
- **建議**：存一則一列（`suggestions`）。寫的人可以改、可以刪（軟刪除）；規劃模式下的人只能改狀態（已採用／不採用＋一句話）。採用時記下對應的行程項目，行程項目也記「誰提的」。
- **投票**：一人對一個點一筆（❤️／👎＋備註），見 interaction-design §9。
- **2026-10-24 改成想去清單**（T15m，設計見 `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md`）：❤️ 就是想去，投票拿掉備註；建議拿掉，換成**留言**（`comments`：`target` 是地點 ID 或某一天 `day:<日期>`，`kind` 是 `normal`／`planner`／`decline`，只有作者能改刪）和**候選**（`candidates`：哪個點、哪天、誰加的；同一天同一個點只有一筆，誰都能拿掉，拿掉別人加的由畫面另外留一則 `decline` 留言）。上面「建議」那兩條和 §4 的建議 API、D1 的 `suggestions` 是 T24 做的舊版，**T15 串接時改成這裡的形狀**（假後端 `web/src/backend/mock.ts` 是規則的參考）。
- 行程裡的點可能是預設資料、自己加的點，或已下架的點，引擎都要能處理。

### 3.7 時刻表和其他靜態資料
- `timetables/`、`passes.json`、`access/`、`areas.json` 在 build 時整理成靜態 JSON，和網站一起部署。
- **時刻表照車站拆開**，用到時才載入。
- **實作（T24）**：`npm run build:static`（`scripts/build-static.mjs`），先跑 validate，預設輸出到 `build/static/`（不進 git；部署時 T25 放進網站的靜態檔案）。
  - 近鐵：一站一個檔案，每一班加上 `next`（這班車在這站之後的停站 `[[車站, 到, 發], ...]`，從 `_travel-times.json` 的 `trains` 拆進來），查「從這站到哪站」只要載入出發站。站間車程另外放 `timetables/kintetsu/_segments.json`。
  - JR 各站、巴士、船：一個車站或路線一個檔案，照原樣。巴士停留所不是車站，所以照路線分。
  - `timetables/index.json`：每個檔案有什麼（車站、路線名、停留所的座標、GTFS 的出處），加上 `byPlace`（資料點 ID → 附近有停的路線，從停留所的 `near`）。
  - `manifest.json`：每個檔案的 sha256（快取用）和 git commit。網站先讀它和 `index.json`，用到哪個車站或路線再載入那一個檔案。
  - `areas.json` 也照原樣輸出：網站的區域清單從這裡讀（區域不寫死）。
- 這些資料使用者不會在網站上改，查詢量又大，所以不放進資料庫。要更新就改 JSON、重新部署。

### 3.8 時間與同步
- **時間一律是日本時間**：行程、時刻表、營業時間都存成日期（`YYYY-MM-DD`）加 `HH:MM` 字串，過了午夜寫 `25:00`（同 CONVENTIONS 的 `hours`）。**不轉成 JavaScript 的 `Date`、不做時區換算**：看網站的人在台灣，瀏覽器的時區比日本晚一小時，一換算就錯。網站只做規劃，用不到「現在幾點」。
- **同步**：別人改了行程、寫了建議、投了票，切回分頁時重新抓一次，平常每 30 秒檢查一次有沒有新的（用 `version` 或最後更新時間比對）。不做即時推播。

---

## 4. 後端與部署（Cloudflare）

| 需要的東西 | 服務 |
|---|---|
| 網站（React 的 build） | Workers 靜態資源（Pages 的後繼） |
| API：資料、修改、行程、投票 | Worker（`worker/`） |
| 登入：LINE、群組檢查、登入憑證 | 同一個 Worker |
| LINE 的通知（webhook） | 同一個 Worker：只用來記下群組 ID，和成員加入、退出 |
| Claude API 代理（T16） | 同一個 Worker；API key 存成 Worker secret |
| 資料庫 | D1 |

- **API 草稿**（T24、T25 定案；T24 定案的資料部分見下方「資料 API（T24）」）：
  - 資料：`GET /api/places`（預設資料，用匯入版本當 ETag 快取）、`GET /api/edits?since=`、`POST /api/edits`、`POST /api/edits/:id/revert`、`/api/user-places`
  - 行程、建議、投票：`GET/PUT /api/itinerary`（PUT 要帶 `version`）、`/api/itinerary/snapshots`、`/api/suggestions`（`PATCH /api/suggestions/:id/status` 標狀態）、`/api/votes`
  - 聊天紀錄：`/api/chats`（只回傳自己的）
  - 登入：`/auth/line/login`、`/auth/line/callback`、`/auth/logout`、`GET /api/me`
  - LINE 的通知：`POST /line/webhook`（驗證簽章）
  - AI：`POST /api/claude/messages`
- **除了登入和 LINE 的通知，所有 API 都要先登入。**
- **環境**：本機用 `wrangler dev`（本機的 D1），正式環境部署到 Cloudflare。用 GitHub Actions 自動部署是之後的事，一開始手動 `wrangler deploy` 就好。
- **本機接 LINE：用 ngrok 通道**（2026-10-23 👤 決定）：LINE 的 webhook 是從外面連進來，手機的 LINE 也連不到電腦的 `localhost`，所以本機開發要開一個公開的 HTTPS 網址。
  - 用 ngrok 免費帳號的**固定網域**（`xxxx.ngrok-free.app`）：LINE Developers 的 Webhook URL、Callback URL 貼一次就好，重開不用改。不用 Cloudflare 的臨時通道（每次網址都換）。
  - `npm run dev:tunnel`：啟動 `wrangler dev`，再用 npm 套件 `@ngrok/ngrok` 開通道，在 terminal 印出要貼到 LINE Developers 的兩個網址（`<網址>/line/webhook`、`<網址>/auth/line/callback`）。`npm run dev:worker` 照舊不開通道。
  - 開不開通道看跑哪個指令，不在 `.env` 放開關；`wrangler deploy` 不會執行這支腳本，正式環境不會用到 ngrok。
  - 免費版 ngrok 用瀏覽器第一次打開時會先出現一頁警告，要按 Visit；webhook 不受影響。所以在 LINE 內建瀏覽器實測版面、登入要用部署後的正式網址。
- **設定值和 secret**：
  - 本機放在 `worker/.env`（wrangler dev 會讀；根目錄 `.gitignore` 已經擋 `.env`）。不用 `.dev.vars`，因為 `.gitignore` 沒擋。
  - 正式環境用 `npx wrangler secret put <名稱>`（在 `worker/` 底下跑），不寫進檔案。
  - Cloudflare 帳號用 `wrangler login`，不放進 `.env`。
  - 正式環境不能設 `DEV_AUTH = "1"`。

| 名稱 | 從哪裡拿 | 用途 |
|---|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login channel → Basic settings | OAuth、驗證 ID token（`aud`） |
| `LINE_LOGIN_CHANNEL_SECRET` | 同上 | 用授權碼換 token |
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API channel → Basic settings | 驗證 webhook 簽章 |
| `LINE_MESSAGING_ACCESS_TOKEN` | Messaging API 分頁發的 long-lived token | 查群組成員 |
| `SESSION_SECRET` | 自己產生的亂數（例如 `openssl rand -base64 32`） | 簽登入憑證（cookie） |
| `PUBLIC_BASE_URL` | 本機是 ngrok 網址，正式環境是正式網址 | 組 LINE 的 `redirect_uri`；明確設定，不從 request 猜 |
| `ADMIN_LINE_USER_IDS` | 第一次登入後從 `members` 查 | 白名單管理頁只給 👤 看 |
| `ANTHROPIC_API_KEY` | Claude Console | Claude API 代理（T25 或 T16） |
| `NGROK_AUTHTOKEN`、`NGROK_DOMAIN` | ngrok 後台 | 只有本機的 `dev:tunnel` 用 |

  變數名稱由 T25 定案，改了要更新這張表。群組 ID 不放設定檔：機器人被邀進群組時從 `join` 通知記下來，存在資料庫（§5）。
- **費用**：預期都在免費額度內。Workers 免費方案每次請求的 CPU 時間很短，所以 Worker 只做轉發、讀寫資料庫、簡單的合併與驗證；重的計算（行程引擎）放在瀏覽器（§6）。

### 免費額度（2026-10-22 查官網）

| 項目 | Workers 免費方案 | 對這個網站的意思 |
|---|---|---|
| Worker 請求 | 每天 10 萬次（UTC 0 點重算） | 15 人每 30 秒輪詢一次，整天開著約 4.3 萬次：**輪詢只能打一支 API**（`/api/sync`） |
| 每次請求的 CPU 時間 | 10 ms（付費方案預設 30 秒、最多 5 分鐘） | 不在 Worker 裡解開、重組 3 MB 的資料點（`/api/places` 直接接起 JSON 文字）；行程引擎在瀏覽器 |
| 記憶體 | 每個 isolate 128 MB | |
| 子請求 | 每次請求 50 個 | LINE、Claude API 的呼叫（T25、T16） |
| Worker 大小 | 64 MiB（沒壓縮的；沒有壓縮後的上限） | 產生的驗證程式約 314 KB |
| 靜態檔案 | 每個版本 2 萬個、每個 25 MiB | 靜態資料 53 個檔案、約 2.3 MB |
| 環境變數 | 64 個、每個 5 KB | |
| D1 讀取 | 每天 500 萬列（掃過的列都算，不管有沒有回傳；UTC 0 點重算） | `/api/places` 一次讀約 550 列，靠 ETag（匯入編號）回 304 省掉；同步只用有索引的 `MAX()`，**不用 `COUNT(*)`**（每次都會掃整張表） |
| D1 寫入 | 每天 10 萬列 | 一次全部匯入約 550 列 |
| D1 容量 | 每個資料庫 500 MB、帳號共 5 GB、最多 10 個資料庫 | 資料點約 3 MB |
| D1 每次請求的查詢數 | 50 個 | 一個 API 最多 6～7 個查詢 |
| D1 一句 SQL | 最長 100 KB；參數最多 100 個；一列（字串）最大 2 MB | 匯入一筆一句（最大約 12 KB）；行程限制 1 MB |
| D1 的 LIKE 樣式 | 最長 50 bytes | 用 `instr()` 代替 LIKE（轉址時找 ID） |
| D1 Time Travel | 7 天 | 正式環境誤改時可以還原 |

### 資料 API（T24）

除了 T25 的登入，所有 API 都要先登入；T24 用開發用的固定身分（`worker/src/auth.ts`：`wrangler.jsonc` 的 `DEV_AUTH = "1"`、`DEV_MEMBER_ID`，測試時可以加 header `X-Dev-Member: dev-xxx` 換人），T25 換掉 `currentMember()` 就好。錯誤一律回 `{ error, message, details? }`。

| API | 說明 |
|---|---|
| `GET /api/places` | `{ importId, places, retired: {id: 時間}, redirects: {舊: 新} }`，ETag 是 `"imp-<匯入編號>"`，沒變回 304 |
| `GET /api/places/:id` | 合併後的 `data`、預設的 `base`、`edited`（改過的欄位 → 誰、何時）、`edits`（修改紀錄）；舊 ID 自動轉址 |
| `GET /api/edits?since=&place=` | 修改紀錄（含已復原、已收掉的）；`since` 比 `updated_at`（`>=`，前端用 id 去重複） |
| `POST /api/edits` | `{ placeId, fieldPath, value, note? }`：先合併再用 schema 驗證（不符合 400，`details` 列出哪裡錯）；不能改 `id`、`type` |
| `POST /api/edits/:id/revert` | 只有改的人自己能按（別人 403） |
| `GET/POST /api/user-places`、`PATCH/DELETE /api/user-places/:id` | 自己加的點：只檢查名稱、座標、類別（不是查到的資料，沒有 sources）；誰都能改、只有本人能刪 |
| `GET/PUT /api/itinerary` | PUT 帶 `version`，和資料庫不同回 409（`details.current`）；改之前自動存快照 |
| `GET /api/itinerary/snapshots`、`/:id`、`POST /:id/restore` | 復原也是一次修改，會再存快照 |
| `GET/POST /api/suggestions`、`PATCH/DELETE /api/suggestions/:id` | 只有寫的人能改、能刪；`day` 是日期或 `trip` |
| `PATCH /api/suggestions/:id/status` | `{ status, note?, adoptedItemIds? }`：誰都能標（規劃模式是前端的開關） |
| `GET /api/votes`、`PUT/DELETE /api/votes/:placeId` | `{ value: 'like' | 'dislike', note? }`，只能投、收回自己的 |
| `GET /api/chats`、`GET/POST/DELETE /api/chats/:conversationId` | 只看得到自己的 |
| `GET /api/me`、`GET /api/members` | |
| `GET /api/sync` | 各種資料的版本（匯入編號、行程 version、其他是 `MAX(updated_at)`）：前端輪詢只打這一支，變了才用 `since=` 抓那一種 |

- **本機開發**：`npm run db:migrate`（套用 migrations 到本機的 D1）→ `npm run db:import` → `npm run dev:worker`（`wrangler dev`，和匯入用同一份 `worker/.wrangler/state`）。
- **驗證程式**：`npm run build:validators` 把 `schema/` 編譯成 `worker/src/generated/place-validators.js`（ajv standalone，不 require 任何套件）。schema 改了要重跑；`npm test` 會檢查有沒有過期。
- **區域不寫死**：`common.schema.json` 的 `areaId` 還是五個區域的 enum（改 schema 的請求在 `docs/requests.md`）；validate 和 Worker 的驗證程式讀 schema 時先換成一般的 ID 格式（`scripts/lib/schemas.mjs`），區域在不在 `areas.json` 由 validate 檢查。

---

## 5. 登入與權限：LINE 登入＋家人群組檢查

### 設定
- 在 LINE Developers 開一個 provider，底下開兩個 channel：
  - **LINE Login**：給網站登入用，要切成「公開」狀態，否則只有管理員和測試人員能登入。
  - **Messaging API**：一個免費的 LINE 官方帳號（機器人）。
- **兩個 channel 一定要在同一個 provider 底下**：同一個人在兩邊的 userId 才會一樣，網站才能拿登入的人去比對群組成員。
- 把機器人邀進家人的 LINE 群組。機器人被加進群組時，Worker 會收到 `join` 通知，從裡面記下群組 ID（存成設定）。機器人不發訊息。

### 登入流程
1. 使用者按「用 LINE 登入」→ LINE 授權（scope：`openid profile`）→ 回到 `/auth/line/callback`。
2. Worker 驗證 ID token，拿到 userId、顯示名稱、大頭照。
3. **檢查是不是群組成員**：Worker 呼叫 `GET /v2/bot/group/{groupId}/member/{userId}`。
   - 回應 200：是成員，寫入或更新 `members`。
   - 其他回應：再查白名單（`members.source = 'allowlist'`），也沒有就擋掉，顯示「請洽管理員」。
4. Worker 發一個簽章過的登入憑證，存在 HttpOnly cookie。之後的 API 只驗這個憑證，不每次都問 LINE。
5. **定期重新檢查**：每次登入時檢查一次；憑證的有效期限設長一點（例如 30 天），過期就重新登入，順便再檢查一次群組。收到成員退出群組的通知時，也標成停用。

### 為什麼這樣做
- 不用「選你的名字」：直接用 LINE 的名字和大頭照，投票和修改紀錄都對得到真人，也不能冒用別人的名字。
- 在 LINE 群組裡貼網址，點開會用 LINE 內建的瀏覽器，通常點一下「同意」就登入了，長輩不用打帳號密碼。
- 有人退出群組，下次檢查就進不來了。

### 要注意的地方（T23 實驗確認）
- **「一次列出全部群組成員」的 API 只有認證過或付費的官方帳號能用**，所以改成登入時只查「這一個人」在不在群組裡。查單一成員的 API，SDK 文件寫明連沒加機器人好友的人都查得到；官方文件裡沒查到它有沒有帳號類型的限制，**要用免費帳號實際測過**。
- **使用者要同意分享個人資料**：LINE 規定機器人要拿到使用者的資料，使用者得先同意。手機版 LINE 在一開始使用時就同意了；**只用電腦版 LINE 的人沒辦法同意**，查不到。
- 群組裡會多一個機器人。

### 備案：白名單
- `members` 表可以手動加人（`source = 'allowlist'`）。萬一群組檢查行不通，或者要給不在群組裡的人用，就靠白名單。
- 如果 T23 證實群組檢查行不通，就**只用白名單**：照樣用 LINE 登入，第一次登入的人顯示「等待核准」，由 👤 在管理頁核准。

---

## 6. AI（T16）：工具在瀏覽器執行

```
瀏覽器 ──(對話、工具結果)──► Worker（檢查登入、加上 API key）──► Claude API
   ▲                                                              │
   └──────────────(回覆、要呼叫的工具)────────────────────────────┘
瀏覽器執行工具：查資料、跑 packages/engine、操作地圖（T12 的指令）
```

- **地圖指令本來就一定要在瀏覽器執行**（`focus`、`showProposal`）；查資料、跑引擎也在瀏覽器，因為資料和引擎已經在那裡了。
- Worker 只負責轉發，不用載入資料、不用跑引擎，所以不會碰到 Worker 的 CPU 時間限制。
- **AI 是主要的操作方式**（interaction-design §0、§11），所以工具要涵蓋：查資料（中文名、日文名、別名模糊搜尋）、篩選與地圖指令、寫建議的草稿、提議行程的修改、提議資料點的修改、自己加地點。
- **兩種模式給不同的工具**：一般模式只能產生建議的草稿和資料點修改的提議；規劃模式才有改行程的工具。每種改動都要使用者按確認才寫進去。
- **聊天紀錄**存在 D1（`chat_messages`），只有自己看得到；同一個人換裝置（手機、電腦）也接得上。AI 對話時帶上目前的建議和投票，避免重複提一樣的東西。
- **防止用掉太多額度**：只有登入的人能呼叫；Worker 依使用者記錄用量（`ai_usage`），設每天的上限。15 人都會用，T16 開工時先估算費用，再定上限和模型。

---

## 7. 對應的任務

| 任務 | 這份文件裡的部分 |
|---|---|
| T22 monorepo 調整 | §1 目錄 |
| T23 👤 LINE 登入小實驗 | §5 |
| T24 資料庫與匯入 | §3（資料表、匯入、規則）、§4 API 的資料部分 |
| T25 Worker：登入與部署 | §4、§5 |
| T11、T12 | §2（手機優先、store、先用本機的資料存取） |
| T14 行程引擎 | §1（`packages/engine`）、§3.6（確定的行程，要能處理自己加的點、已下架的點）、§3.8（時間） |
| T15m 行程與建議 UI 原型 | §2（假後端照 §4「資料 API」的形狀）、§3.2（修改紀錄的顯示）、§3.6 |
| T15 行程與建議：串接 | §2（改用 API）、§3.8（同步） |
| T16m AI Agent UI 原型 | §6（工具在瀏覽器執行；模型先用對話腳本代替） |
| T16 AI Agent：串接 | §6 |
| T20 匯出給 Claude app | 匯出合併後的資料（預設資料加修改），不是 git 裡的 JSON |

---

## 8. 測試與完成條件

- **引擎、匯入、Worker 的邏輯**：單元測試（`node --test`），每個任務卡列的規則都要有測試。
- **UI**：用 Playwright 跑幾條主要流程，例如「點資料點 → 看詳情 → 按 ❤️」「按 ❤️ → 加到某天 → 進入規劃模式 → ↑ 排進 → 時間軸出現」。手機尺寸和電腦尺寸各跑一次。畫面好不好看用 Claude in Chrome 看，或交給 👤 看。
- **每張任務卡都列「完成條件」**，做完逐條確認，結果寫在回報裡。

---

## 來源（2026-10-21 取得；Cloudflare 是 2026-10-22）
- Cloudflare：[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)、[D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)、[D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)：§4「免費額度」的數字（2026-10-22 取得）
- LINE Developers：[Getting user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)：同一個 provider 底下，不同 channel 的 userId 相同；列出群組全部成員的 API 只限認證過或付費的帳號；成員加入、發言時的通知裡會帶 userId
- LINE Developers：[Consent on getting user profile information](https://developers.line.biz/en/docs/messaging-api/user-consent/)：使用者要同意才拿得到資料；只用電腦版 LINE 的人無法同意
- [LINE Messaging API SDK for Python（PyPI）](https://pypi.org/project/line-bot-sdk/1.4.0)：查群組成員資料的 API，可以查沒加機器人好友或封鎖機器人的人
