# 地圖網站（T11 v1、T12 地圖指令、T15m 行程與建議 UI 原型）

伊勢志摩旅遊規劃的地圖網站，**手機優先**（家人多半在 LINE 內建瀏覽器打開）。設計見 [interaction-design.md](../docs/interaction-design.md)，技術與 store 的形狀見 [architecture.md](../docs/architecture.md) §2。

技術：Vite + React + TypeScript + MapLibre GL + Zustand，圖磚用 [OpenFreeMap](https://openfreemap.org/)（免費、不需要 key）。

## 啟動

需要 Node 22。`web` 是 npm workspaces 的一員（`@travel-helper/web`），**在專案根目錄**安裝和執行：

```sh
npm install        # 在根目錄跑一次就好
npm run dev        # 開發伺服器（預設 http://localhost:5173）
npm run dev -- --host   # 手機上看：用手機開終端機印出的區網網址
```

其他指令（在根目錄跑）：

```sh
npm test                       # 單元測試（含 web/test/）
npm run e2e                    # Playwright：主要流程，手機（390px）和電腦各跑一次；第一次要先 npx playwright install chromium
npm run typecheck              # 所有 workspace 的 tsc
npm run build                  # tsc + vite build，輸出到 web/dist/
npm run preview -w web         # 預覽 build 的結果
```

加套件：`npm install <套件> -w web`。共用的型別從 `@travel-helper/engine/types` import；engine 還沒有的先放在 `src/data/types.ts`。

## 假後端、假登入（T15m，只在 dev server）

T15、T16 接上 Worker 之前，`npm run dev` 用假後端（`src/backend/mock.ts`，資料存在瀏覽器的 localStorage）和種子資料（`src/dev-fixtures/seed.ts`：4 位假家人、排了一半的行程、建議、投票、修改紀錄）。上方列右邊的「我」點了是開發用選單：

- **切換使用者**：看別人的建議、試「只有寫的人能刪」、投票數。
- **假裝別人改了行程**：下次存檔會出現「別人改過了」。
- **重設假資料**／**重設成只有航班的行程**。
- **規劃模式閒置**：改成 1 分鐘可以試自動退出。

給 👤 檢視的截圖：先 `npm run dev -- --port 5191`，再 `node web/e2e/shots.mjs`，手機和電腦各一組放在 `data/cache/work/t15m/`；電腦版版面（1600、1280 寬）用 `node web/e2e/shots-layout.mjs`，放在 `data/cache/work/t15m-layout/`。

## 畫面

- **手機**（900px 以下）：上方是天數分頁、規劃模式、篩選、地圖／探索；全螢幕地圖；下面是可以拉起的面板（聊天、這一天、詳情）。
- **電腦**：三欄（參考 puma.taipei/heart-island）。聊天室在左（T16 才做，先留位置）；中間是地圖，日期、待處理、規劃模式、「我」浮在地圖上方，篩選標籤在日期下面；右側一欄頂到最上面，分頁「行程｜探索｜AI 建議（T16）」，點了探索的卡片，詳情蓋在這一欄上（「← 返回」）。
- **地圖**：像 Google Maps 的類別圖標（車站藍🚃、景點綠📷、住宿紫🛏、餐廳橘🍴）；縮小時是小點，放大到 12 以上換成圖標、13 以上寫名稱；S 級明顯大、B 級小。選中的點（打開詳情、點了跳到探索卡片的那個）換成水滴形的大圖釘。選了某一天，那天的點換成那天顏色的編號圓（起點、終點的住宿「宿」、機場「機」、其他 1、2、3…，和時間軸的編號一樣），路線有方向箭頭；其他天的點變淡（不隱藏），不符合篩選的也變淡。
- **小卡片**：電腦滑鼠移上去、手機點一下。手機再點一下小卡片才開詳情；電腦點地圖上的點（或小卡片），右側切到探索、捲到那張卡片，再點卡片才開詳情。
- **問 AI**：把地點帶進聊天（加進選取，T16 的聊天室再用）。電腦版把探索的卡片、詳情的標題拖到左邊的聊天室（拖著時聊天室亮起來）；手機沒有拖曳，按照片上的「＋ AI」或詳情的「＋ 問 AI」，聊天分頁顯示帶了幾個點。地圖上的點不能拖（會和拖地圖衝突），從地圖開始是先點點跳到探索卡片。
- **詳情面板**：最上面一列是「← 返回」（電腦版；手機是右邊的 ✕）、寫建議、「問 AI」（先放進選取，T16 再用），規劃模式下多一個「📅 排進行程」。標題列是分級徽章（S 金、A 銀、B 銅）、名稱、❤️／👎 的數量（移上去看是誰投的）。下面分四頁：總覽（首張照片、評分、介紹、價格、排在哪幾天、提到這裡的建議；評分平常只看到 Google、食べログ，展開看其他網站和我們的五項評分）、詳細（住宿、團體、長輩小孩、營業時間）、附近・連結（附近、連結、來源；點附近的地點，地圖移過去、點會閃）、圖片。一打開不用捲就看得到介紹。改過的欄位標「已修改（誰、何時）」，點了看修改紀錄、原本的值，自己的可以復原。
- **這一天（T15m）**：引擎算的時間軸（交通、等待、空檔、警告、時段備案、分組與會合），下面是這天的建議；選「全部」是整趟的總覽。空檔點了可以看附近的餐廳、寫建議。另有「需要預約」的清單、匯出行程 JSON。
- **規劃模式（T15m）**：進入前確認，規劃列一直顯示（待處理的建議、快照、退出），10 分鐘沒動作自動退出。時間軸的每個項目有「⋯」選單：上移／下移、移到第 _ 天、切換備案、刪除；建議可以標已採用（順便排進行程）／不採用。每次修改前自動存快照，可以復原。別人先改過時存不了，會提示重新載入。
- **探索**：電腦版是右側的「探索」分頁：餐廳／住宿／景點是最上層、一直黏在上面；底下選地區（再細分小區域）、常用篩選一排（含「只列地圖畫面裡的」）、其他在「更多篩選」；可以依推薦、評分、❤️ 排序。往下捲時篩選收合成一列摘要（例如「鳥羽・午餐」，旁邊是筆數、排序、顯示方式），點摘要在原地展開；顯示方式可以切換大照片或只有文字。滑鼠移上去地圖上的點會閃，點了地圖移過去、打開詳情；反過來點地圖上的點，清單跳到那張卡片。手機還是圖片牆：只放目前地圖畫面裡、符合篩選的點，S 大一倍、A 正常、B 小張；移動地圖跟著換。照片和地圖互相連動（滑鼠移上去或點一下照片，地圖上的點會閃）。
- **車站面板**：車站的詳情裡有時刻表：選日期（自動判斷平日／土休日）和時間，顯示上下行前 2 班、後 4 班，附 Google Maps 路線和ジョルダン的連結。
- **地圖指令（T12）**：UI 和之後 T16 的 AI 都透過 `src/commands.ts` 操作地圖（`focus`、`highlight`、`drawRoute`、`compare`、`clearHighlights`、`selectDay`、`setFilter`／`clearFilter`、`select`／`unselect`、`showProposal`／`clearProposal`、`getViewState`），說明在 architecture §2「地圖指令」。地圖上方會出現說明列：AI 的提議（虛線、半透明）、比較（A、B、C）、標示和路線（可以清掉）。
- **路線**：步行、車沿道路走，在瀏覽器查公開的 OSRM（`routing.openstreetmap.de`），查過的存在 localStorage；電車依序連車站；查不到畫直線。時間用 engine 的預設速度算（`src/lib/routing.ts`）。
- **資料檢查頁**：網址加 `?check` 是 v0 的檢查工具（座標、ID、來源的問題、各區筆數、bbox 框線），程式在 `src/v0/`，新增區域蒐集資料時用。

## 資料從哪裡來

- 資料存取包在 `src/data/` 的介面後面（`DataSource`）。現在是本機的實作 `local.ts`：build 時用 `import.meta.glob` 讀 `data/areas/*/*.json`、`data/stations.json`、`data/areas.json`；時刻表（`data/timetables/kintetsu/`、`jr/`）照車站拆開，用到才載入。研究筆記（`raw/`）、`cache/`、`derived/` 不打包。T15 改成 API 時只換 `src/data/index.ts` 那一行。
- **區域不寫死**：區域清單、名稱、子地區、篩選的選項、初始範圍都從 `areas.json` 和資料來。新增區域時把資料放進 `data/areas/<新區域>/`、`areas.json` 加上這一區，重新 build 就會出現。
- **代表照片**是 `photos` 的第一張（T21 排好）。打不開時依序換下一張，全部打不開就顯示類別色的替代圖；Wikimedia 的原圖改用 800px 縮圖網址；不送 referrer。
- **楽天**的資料（評分、價格、照片）在詳情面板下方附「Supported by Rakuten Developers」。
- **假行程**（`src/dev-fixtures/itinerary.json`，engine 的 itinerary-v1）只在 dev server 載入，用來試天數分頁、提議的顯示；篩選面板最下面可以關掉。正式 build 不帶。T15 換成確定的行程。

## 目錄

```
web/
├─ src/
│  ├─ main.tsx            進入點（?check 時載入 v0）
│  ├─ App.tsx             手機、電腦兩種版面
│  ├─ store.ts            畫面狀態（architecture §2）
│  ├─ dataStore.ts        讀進來的資料
│  ├─ hooks.ts            useApp、useData、螢幕寬度
│  ├─ commands.ts         地圖指令（T12）：UI 和 AI 共用；appCommands.ts 是網站共用的那一份
│  ├─ routeResolver.ts    drawRoute 的路線在背景補上路徑（OSRM、車站、直線）
│  ├─ data/               資料存取的介面、本機實作、型別、整理資料的函式
│  ├─ lib/                純邏輯（篩選、區域、照片、時刻表、日期、附近…），有單元測試
│  ├─ components/         地圖、上方列、篩選、小卡片、詳情、車站、圖片牆、拉起面板
│  ├─ dev-fixtures/       開發用的假資料（v0 的假資料點、假行程）
│  ├─ v0/                 資料檢查頁（T5）
│  └─ lib/geo/            地理工具（T6）
├─ test/                  單元測試（node --test，根目錄 npm test 會跑）
└─ e2e/                   Playwright
```

## 測試和畫面檢查用的掛勾

dev server 下 `window.__th` 有 `map`（MapLibre）、`appStore`、`dataStore`、`commands`（地圖指令）、`visual(id)`，Playwright 用它算點的像素位置、讀狀態、下指令（`e2e/commands.spec.ts`，OSRM 用假的回應）；正式 build 沒有。設 `TH_SHOTS=<目錄>` 跑 `npm run e2e` 會順便拍標示、路線、比較、提議的截圖。

## 備註

- maplibre-gl v6 的 worker 是另一個檔案，`MapView.tsx` 用 `?worker&url` 讓 Vite 打包，再用 `setWorkerUrl` 指定。
- 瀏覽器 console 裡 `highway-shield…filter`、`Image "…" could not be loaded` 的警告來自 OpenFreeMap 的樣式本身，不影響使用。
- 地圖一律朝北（關掉旋轉），手機上兩指縮放比較不會誤觸。
