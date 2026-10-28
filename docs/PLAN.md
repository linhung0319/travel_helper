# 伊勢志摩旅遊規劃網站：執行計畫

> 旅程：2027-02-02 ～ 2027-02-13，使用近鐵 5 日券
> 行程方向：從南邊的**志摩市**開始，往北到**鳥羽市**、**伊勢市**，最後 1～2 天在**大阪**（2026-10-26 加入）；最後一晚住大阪或關西機場周邊，由使用者排行程時自己選
> 人數：**15 人**（5 位約 70 歲的長輩、4 位 6～10 歲的小孩）；部分行程全員一起，部分分組（4～6 人一組）
> 文件建立：2026-10-17
> 資料格式與共同規則見 [CONVENTIONS.md](CONVENTIONS.md)；網站的互動設計見 [interaction-design.md](interaction-design.md)；技術選型、資料庫、部署、登入見 [architecture.md](architecture.md)（寫程式的任務開工前先讀）

---

## 1. 目標

一個以地圖為中心的行程規劃網站：

1. 地圖上標出事先蒐集好的**資料點**：車站、景點、住宿、餐廳。
2. 點進資料點可以看照片、營業時間、菜單或連結、附近的資料點（附步行時間）；點車站可以看時刻表。
3. 家人在每一天留**建議**、對資料點按 ❤️／👎；進入**規劃模式**的人把建議排進唯一一份**有時間軸的行程**，系統動態計算點到點的交通，並檢查時間衝突（公休、班次、營業時間）。
4. **操作以 AI 對話為主**（2026-10-21）：AI Agent 依使用者需求找地點、寫建議、規劃行程，並**透過操作地圖**來解釋（聚焦、高亮、畫路線）。使用者自己動手的只有看地圖、看詳情、投票、寫或刪自己的建議。**手機優先**，不做拖拉。設計見 [interaction-design.md](interaction-design.md) §0、§6、§11。

### 網站的範圍：只做規劃行程（2026-10-18 決定）
- **網站只負責規劃行程**：選景點、住宿、餐廳，排前後順序，靠我們的時刻表和 T14 檢查交通時間、衝突。這是我們的資料比其他服務強的地方（團體 15 人的條件、長輩小孩、整天的時間銜接）。
- **旅途中不另外做功能**（T16 只做規劃用）：
  - 臨時查詢（附近餐廳、天氣、單一路線班次）直接問手機上的 Claude app。
  - 行程規劃完以後，把最終行程、分組和 `data/` 的資料整理好上傳到 claude.ai Project（T20），讓 Claude app 優先用我們篩過的清單，並考慮人數和座位條件。
  - 實際班次、轉乘用 Google Maps app 確認：網站和 Claude 給 Google Maps 路線連結（`https://www.google.com/maps/dir/?api=1&destination=…&travelmode=transit`，不帶起點就是從現在位置出發），點一下就能看，不用打字。
- **不做的原因**：Google 的路線 API 在日本不提供大眾運輸路線（開發者回報都是 `ZERO_RESULTS`；一般認為是資料授權的限制，看的是路線在哪裡，換伺服器的 IP 也沒用），自己做即時路線不划算；Claude app 已經能搜尋地點和網頁。
- **沒有訂位功能**，所以也不做出發前的統一驗證；營業時間、休業、時刻表改版的確認，由訂位、出發的人自己處理。

### 核心原則
- **資料比介面有價值**：資料先蒐集、存成檔案（JSON），網站只負責讀取和呈現。
- **有層次的蒐集**：車站 → 景點 → 住宿 → 餐廳，每一層都以上一層為基準。
- **先做一區（鳥羽）、看結果、調整規則，再擴展**到其他區域。
- **地圖從一開始就做**：先拿來檢查資料，之後才是給使用者用的介面。
- **資料由 Claude Code 搜尋、蒐集、存檔**；即時 API 只用在少數必要的地方（動態路線計算）。
- **以 15 人團體為前提**：餐廳要能容納團體或可以預約，住宿要有足夠房間，交通要考慮團體票、計程車台數、包車。小店很多的伊勢志摩，「坐不坐得下」常常比「好不好吃」更早決定能不能去。
- **長輩和小孩**：步行距離、階梯、休息點、座位形式（椅子還是榻榻米）、兒童票價都要記錄；行程不能排太滿。
- **全員與分組兩種模式**：全員行動時要找能容納 15 人的地方；分組時，4～6 人的小店也能去。

---

## 2. 任務總覽

工作量單位：
- **S**：約 1 個 Claude Code session 就能完成
- **M**：2～3 個 session，或 1 個 session 加上較多人工檢查
- **L**：4 個 session 以上，建議再拆成子任務

表中「👤」代表需要你親自參與（決策、檢查、手動操作）。

「Chrome」欄：**🌐 大量**＝主要工作就在 Claude in Chrome（食べログ、Google Maps、IG）；**🌐 少量**＝只有一小段要用（地圖檢查、看介面、參考網站），可以集中在最後做；空白＝不用 Chrome。**有 🌐 的任務同時只開 1 個**（見 §3「Chrome 的操作」）；已完成的任務沒有標。

狀態：✅ 完成、🔄 進行中、⬜ 未開始。任務的分支 merge 回 master 後，在 master 上更新該列（見 §3「多個 session 同時執行的方式」）。

| ID | 任務 | 工作量 | 前置任務 | 階段 | Chrome | 狀態 |
|---|---|---|---|---|---|---|
| T0 | 專案骨架：目錄、資料格式（schema）、驗證腳本、車站與區域清單 | S | — | 0 | | ✅ |
| T1 | 近鐵時刻表蒐集（目標區間所有車站） | M | T0 | 1 | | ✅ |
| T1b | 關西機場 ↔ 伊勢志摩的交通（第一天、最後一天） | S | T0 | 1 | | ✅ |
| T2 | 鳥羽：景點 | S | T0 | 1 | | ✅ |
| T3 | 鳥羽：住宿 | M | T2 | 1 | | ✅ |
| T4a | 鳥羽餐廳：候選名單（多來源蒐集、合併、依納入標準篩選） | M | T2、T3 | 1 | | ✅ |
| T4b | 鳥羽餐廳：詳細資料（食べログ、Google Maps 逐家查） | M | T4a | 1 | | ✅ |
| T4c | 鳥羽餐廳：收尾（anchors 步行時間、驗證、地圖檢查） | S | T4b、T6 | 1 | | ✅ |
| T5 | 地圖檢視器 v0（檢查資料用） | M | T0 | 1 | | ✅ |
| T6 | 地理工具：距離估算、步行路線、最近車站計算 | S | T0 | 1 | | ✅ |
| T7 | 👤 檢討試做結果、訂規則 | S | T1～T6 | 2 | | ✅ |
| T7b | 鳥羽補資料：欄位搬移、研究筆記改結構（腳本為主） | M | T7 | 3 | | ✅ |
| T7c | 鳥羽補資料：景點（Google 連結與評分、照片、心得、離島港口） | M | T7b | 3 | 🌐 大量 | ✅ |
| T7d | 鳥羽補資料：住宿（楽天 API 腳本與重查、Google 連結與評分、照片、心得） | M | T7b | 3 | 🌐 大量 | ✅ |
| T7e | 鳥羽補資料：餐廳（依新納入標準補店、照片、心得） | M | T7b | 3 | 🌐 大量 | ✅ |
| T7f | 鳥羽補資料：收尾（重算 anchors、缺漏檢查、地圖檢查） | S | T7c、T7d、T7e | 3 | 🌐 少量 | ✅ |
| T7g | 鳥羽：摘要與評分、校準範例、評分檢查腳本 | M | T7f | 3 | | ✅ |
| T7h | 鳥羽：重點資料點補心得（口コミ、Google 評論）、重新打分 | S | T7g | 3 | 🌐 大量 | ✅ |
| T7i | 小腳本：觀光三重景點列表、じゃらん評分；補鳥羽、伊勢的じゃらん評分 | S | T7 | 3 | | ✅ |
| T7j | 👤 鳥羽：檢討待確認的決定、深入調查（前幾名的部落格心得）、補丁式重新打分（另開 session） | S | T7h | 3 | | ✅ |
| T8a | 伊勢（含二見）：子地區與景點 | M | T7 | 3 | 🌐 大量 | ✅ |
| T8b | 伊勢（含二見）：住宿 | M | T8a、T7d | 3 | 🌐 大量 | ✅ |
| T8c | 伊勢（含二見）餐廳：候選名單 | M | T8b | 3 | 🌐 大量 | ✅ |
| T8d | 伊勢（含二見）餐廳：詳細資料 | L | T8c | 3 | 🌐 大量 | ✅ |
| T8e | 伊勢（含二見）：收尾（anchors、缺漏檢查、地圖檢查）、重點資料點補心得 | M | T8d | 3 | 🌐 大量 | ✅ |
| T8f | 伊勢（含二見）：摘要與評分 | M | T8e、T7g | 3 | | ✅ |
| T8g | 👤 伊勢（含二見）：檢討待確認的決定、深入調查、補丁式重新打分（另開 session） | S | T8f | 3 | | ✅ |
| T9a | 志摩：子地區與景點 | M | T7 | 3 | 🌐 大量 | ✅ |
| T9b | 志摩：住宿 | M | T9a、T7d | 3 | 🌐 大量 | ✅ |
| T9c | 志摩餐廳：候選名單 | M | T9b | 3 | 🌐 大量 | ✅ |
| T9d | 志摩餐廳：詳細資料 | M | T9c | 3 | 🌐 大量 | ✅ |
| T9e | 志摩：收尾（anchors、缺漏檢查、地圖檢查） | S | T9d | 3 | 🌐 少量 | ✅ |
| T9f | 志摩：摘要與評分 | M | T9e、T7g | 3 | | ✅ |
| T9g | 👤 志摩：檢討待確認的決定、深入調查、補丁式重新打分（另開 session） | S | T9f | 3 | | ✅ |
| T10 | 巴士時刻表（需要搭巴士的景點路線）、JR 參宮線、離島定期船 | M | T8a、T9a | 3 | | ✅ |
| T11 | 地圖網站 v1（手機優先）：store、版面、圖層、天數分頁、小卡片與詳情面板、探索模式（圖片牆）、車站時刻表面板 | M | T5、T7、T21、T22 | 3 | 🌐 少量 | ✅ |
| T12 | 地圖動作 API（給 UI 和 AI 共用的地圖指令、篩選標籤、選取的點、畫面狀態） | S | T11 | 3 | 🌐 少量 | ✅ |
| T13 | 跨區整理與驗證：去除重複、分級、缺漏檢查 | M | T7j、T8g、T9g、T19 | 3 | 🌐 少量 | ✅ |
| T13b | 伊勢、二見：補景點 4 筆（T13 決定：古市參宮街道、角屋民具館、御塩殿神社、蘇民の湯） | S | T13 | 3 | 🌐 大量 | ✅ |
| T14 | 行程引擎：確定的行程格式（航班、備案、分組）、行程的操作、時間軸、空檔、交通方式判斷、衝突檢查（純邏輯） | M | T6、T7、T22 | 4 | | ✅ |
| T15m | 行程與建議 UI 原型：這一天的時間軸、建議、規劃模式、手動選單、快照、投票、修改紀錄；用假後端、假登入，👤 用手機和電腦尺寸檢視、定案 | M | T11、T12、T14 | 4 | | ✅ |
| T16m | AI Agent UI 原型：對話介面、兩種模式的流程、瀏覽器端的工具；用寫好的對話腳本代替 Claude API | M | T11、T12、T14（規劃模式的提議要用 T15m 的時間軸） | 4 | | ⬜ |
| T15 | 行程與建議：串接 T24、T25 的 API（儲存、登入、同步、版本衝突），Playwright 完成條件 | S | T15m、T24、T25 | 4 | 🌐 少量 | ⬜ |
| T16 | AI Agent：串接 Claude API（Worker 代理、用量上限、費用估算）、聊天紀錄存 D1、調整提示詞 | M | T16m、T24、T25 | 4 | 🌐 少量 | ⬜ |
| T19 | 關西機場周邊：2/12 住宿與晚餐、摘要與評分 | S | T7d（評分部分等 T7g） | 3 | | ✅ |
| T21 | 代表照片：每個資料點挑一張最能代表的照片，排到 `photos` 第一張 | M | T13、T13b | 3 | | ✅ |
| T20 | 匯出給 Claude app：最終行程、分組和資料整理成 claude.ai Project 用的檔案 | S | T15、行程定案 | 6 | | ⬜ |
| T22 | monorepo 調整：npm workspaces（`packages/engine`、`web`、`worker`、`scripts`） | S | — | 3 | | ✅ |
| T23 | 👤 LINE 登入小實驗：免費官方帳號能不能查單一群組成員 | S | — | 3 | | ✅ |
| T24 | 資料庫與匯入：D1 資料表、匯入腳本（比對、衝突、下架）、資料與修改的 API | M | T22、T13 | 3 | | ✅ |
| T25 | Worker：LINE 登入、群組檢查、白名單、管理頁（本機可以完整跑；部署拆到 T30） | M | T23、T24 | 4 | 🌐 少量 | ✅ |
| T26 | 👤 Places 照片備案：資料點對應 place ID；主照片失效、或詳情往下捲時，透過 Worker 即時向 Places API 取照片（不存照片） | M | T25 | 4 | | ⬜ |
| T27a | 👤 大阪：子地區與景點（含 USJ） | S | — | 3 | 🌐 大量 | ✅ |
| T27b | 大阪：住宿 | S | T27a | 3 | 🌐 大量 | ✅ |
| T27c | 大阪：餐廳（候選和詳細資料一起做） | M | T27a | 3 | 🌐 大量 | ✅ |
| T27d | 大阪：收尾、摘要與評分、代表照片（自動排序）、匯入 | S | T27b、T27c | 3 | | ✅ |
| T28 | 大阪交通：近鐵 大阪 ↔ 伊勢志摩的特急（北上回大阪、第一天南下志摩）、市區路線的所需時間和班距、大站轉乘的步行時間和電梯 | M | — | 3 | | ✅ |
| T29 | engine：大眾運輸改用 RAPTOR（近鐵、巴士、船、JR、大阪班距型路線、轉乘步行），候選走法、錯過的話 | M | T28 | 3 | — | ✅ |
| T29b | 重算速度（修快取、只重算有改的那一天）、拿掉選班次（引擎的 `trip` 路徑、‹ › 和班次下拉）；列出交通卡拿得到的內容給 T29c | S | T29、T15m merge 後 | 4 | 🌐 少量 | ✅ |
| T29c | web：交通卡（收合兩行、一程一行的步驟、錯過的話標籤）、班次表格子（手機也用彈窗）、編輯器（分段按鈕、選走法）、車站面板的班距；車站不當資料卡；engine：買票站留空檔、`ticket-tight` 警告 | M | T29b | 4 | 🌐 少量 | ⬜ |
| T30 | 👤 部署到 Cloudflare：正式的 D1 和 secret、網站和 Worker、正式環境第一次匯入、LINE 改用正式網址、LINE 內建瀏覽器實測 | S | T25、👤 資料和 schema 定案（邀請家人之前） | 4 | 🌐 少量 | ⬜ |

---

## 3. 並行與依序

### 執行順序圖

```
階段 0  [T0 骨架]  ← 必須最先做，而且只開 1 個 session
           │
           ├──────────────┬──────────────┬──────────────┐
階段 1     ▼              ▼              ▼              ▼
        Lane A         Lane B         Lane C         Lane D
        [T1 近鐵       [T2 鳥羽景點]  [T5 地圖 v0]   [T6 地理工具]
         時刻表]          ▼
           ▼
        [T1b 機場
         往返交通]
                       [T3 鳥羽住宿]
                          ▼
                       [T4a 餐廳候選]
                          ▼
                       [T4b 餐廳詳細]
                          ▼
                       [T4c 餐廳收尾]
           │              │              │              │
           └──────────────┴──────┬───────┴──────────────┘
階段 2                           ▼
                         [T7 👤 檢討、訂規則]  ← 匯流點，依序
                                 │
                                 │
階段 3（資料）     ┌─────────────────┼─────────────────┐
                   ▼                 ▼                 ▼
               Lane 鳥羽         Lane 伊勢         Lane 志摩
              [T7b 欄位搬移]    [T8a 子地區、景點] [T9a 子地區、景點]
                   │                 │                 │
          ┌────────┼────────┐        │                 │
          ▼        ▼        ▼        │                 │
       [T7c     [T7d      [T7e       │                 │
        景點]    住宿*]    餐廳]      │                 │
          └────────┼────────┘        │                 │
                   │   （T7d 的楽天腳本完成後才能開始）  │
                   │        ├──────► [T8b 住宿]        │
                   │        ├────────────────────────► [T9b 住宿]
                   │        └──► [T19 關西機場周邊]     │
                   ▼                 ▼                 ▼
              [T7f 收尾]        [T8c 餐廳候選]     [T9c 餐廳候選]
                   ▼                 ▼                 ▼
              [T7g 摘要評分     [T8d 餐廳詳細]     [T9d 餐廳詳細]
               ＋校準範例]           ▼                 ▼
                   │            [T8e 收尾]         [T9e 收尾]
                   │                 ▼                 ▼
                   └─（校準範例）──► [T8f 摘要評分]   [T9f 摘要評分]
                                     │                 │
                   [T10 巴士時刻表]（T8a、T9a 完成就可以開始）
                   [T7j／T8g／T9g 深入調查]（各區評分後，另開 session，不在指揮順序裡）
                   [T13 跨區整理]（g 任務都做完後）→ [T21 代表照片]
  * 楽天 API key 已經放在 .env（2026-10-18 測試成功）

階段 3（介面）  [T22 monorepo]（可以和 T13 同時做）    [T23 👤 LINE 實驗]（隨時）
                       │                                      │
       ┌───────────────┼──────────────────┐                   │
       ▼（T21 之後）   ▼                  ▼（T13 之後）       │
  [T11 地圖 v1]   [T14 行程引擎]   [T24 資料庫與匯入]         │
       ▼               │                  └────────┬──────────┘
  [T12 地圖動作 API]   │                           ▼
       │               │                  [T25 登入]
       ▼               ▼                           │
階段 4 └───────┬───────┘                           │
               ├──► [T15m 行程與建議 UI 原型] ──► [T15 串接] ◄──┤（T15 需 T15m、T24、T25）
               └──► [T16m AI Agent UI 原型] ───► [T16 串接] ◄──┘（T16 需 T16m、T24、T25）
                    （T15m、T16m 並行，現在就能做；規劃模式的提議要用 T15m 的時間軸）
                    [T30 部署]（T25 之後；👤 資料和 schema 定案、邀請家人之前）
                                      │
階段 6                        [T20 匯出給 Claude app]（行程定案後）
```

### 接下來的順序（2026-10-19 決定）

T19、T10 已完成，剩下的照這個順序：

```
T7j → T8g → T9g → T13 → T21 → T11、T14、T24（並行）→ T12 → T15m、T16m（並行）→ T15、T16（並行，等 T25）→ （行程定案）→ T20
                                                         └→ T25（等 T23，和 T15m、T16m 同時做）
（T22 在 T11、T14 之前，可以和 T13 同時做；T23 隨時可以做）
```

- **g 任務一區一區做**（T7j → T8g → T9g）：每區都要 👤 一起看 `decisions-pending.md` 的待確認決定，而且各自另開 session 才有自己的 WebSearch 額度（見下方「為什麼這樣排」）。
- **T13 在三個 g 任務之後**：兩邊都會改 `assessment`。T13 也順便和 👤 看 `decisions-pending.md` 的「關西機場周邊（T19）」：它不屬於任何 g 任務。
- **T21 在 T13 之後、介面之前**：T13 去除重複後再挑代表照片；T11 的探索模式、小卡片直接用挑好的照片。
- **介面在資料定案後才開始**：T11、T14、T24 可以開三個 session 並行；T12 接在 T11 之後，T25 接在 T24 之後；T15m、T16m 用 T12 的指令、T14 的引擎做原型，T15、T16 再接上 T24 和 T25 的 API（2026-10-23 拆開，見下方）。
- **時程**：照這個順序，用聊天排行程大約要到 12 月。住宿如果要在 12 月訂，可以在 T21 之後先用「資料＋v0 地圖，直接請 Claude 排」把每晚住哪一區定下來，不用等介面（見 §4「底線」）。

2026-10-21 加上架構的任務（見 [architecture.md](architecture.md)）：

- **T22 先做**：不碰資料，可以和 T13 同時做；T11、T14 都在 T22 之後。
- **T23 隨時可以做**：需要 👤 在 LINE Developers 開 channel、把機器人邀進家人群組。
- **T24 在 T13 之後**：和 T11、T14 並行。T21 之後要再匯入一次（照片順序變了），匯入腳本本來就能重跑。
- **T25 在 T23、T24 之後**；T15 要等 T24、T25，才有共用儲存和登入（2026-10-23 起改成只有串接的 T15 要等，見下方）。

2026-10-21 改成**手機優先、以 AI 對話為主**（[interaction-design.md](interaction-design.md) §0、§6、§11）：

- **T15 縮小、T16 變成主角**：T15 從 L 改成 M（不做拖拉、方案、表單），T16 不再等 T15，兩個並行。T16 規劃模式的提議要畫在 T15a 的時間軸上，最後整合。
- **T11 開頭先定 store 的形狀**（原本在 T12），T12 再補上動作 API，避免 T11 自己寫一套狀態再被 T12 改掉。

2026-10-23 改成**先定 UI，再接後端**：

- **T15、T16 各拆成原型（T15m、T16m）和串接（T15、T16）**。T15、T16 要等 T25，是為了登入、D1 儲存和 Claude API 代理；畫面要用的 T11、T12、T14 都已經完成。所以先用假後端、假登入、寫好的對話腳本把畫面和操作流程做出來，👤 用手機和電腦尺寸檢視、定案，再串接真的 API。
- **T23、T25 和 T15m、T16m 同時做**：👤 的 LINE 實驗不會卡住介面。
- **假的東西只在 dev server 有**（和 `dev-fixtures/fakeItinerary.ts` 一樣），正式 build 不帶。假後端照 T24 已有的 API 形狀（architecture §4「資料 API」）寫，串接時只換實作，畫面的程式不改。
- **原型驗證不了的**：AI 回答的品質、等待時間、真的同時編輯。這些留到 T15、T16 串接時再看。

2026-10-26 加上 **T26 Places 照片備案**（👤 決定）：

- 資料裡約 330 個點用到 Google Maps 的照片網址（`googleusercontent`），其中 173 個點的代表照片就是它；這種網址沒有保證能用多久（2026-10-26 抽測：`gps-proxy` 格式的 2 張已經 403，其他格式正常）。Places API 的照片代號和網址依條款不能存，所以改成用到時才即時查。
- **T26 在 T25 之後**：要用 Worker 的登入和 secret；和 T15、T16 可以同時做（T26 只改詳情的照片區）。

2026-10-26 **T25 拆出部署（T30）**（👤 決定）：

- 預設資料和 schema 還會變（大阪、介面任務），所以先不部署。T25 做到本機可以完整跑（`npm run dev:tunnel` 用真的 LINE 登入、群組檢查、管理頁），部署留給 T30。
- **T30 在 👤 確定資料和 schema 之後、邀請家人之前做**：第一次正式匯入之後 ID 不改名（architecture §3.5）。在那之前不影響其他任務：T15、T16、T26 都可以在本機用 `dev:worker`、`dev:tunnel` 開發和測試。
- LINE 內建瀏覽器的版面實測（接 T11）要用正式網址（ngrok 免費版有警告頁），跟著移到 T30。

2026-10-26 加上**大阪**（👤 決定：最後 1～2 天在大阪）：

```
T27a（👤 子地區）──┬──► T27b 住宿 ──► T27c 餐廳 ──► T27d 收尾、評分、匯入
                   │   （兩個都用 Chrome，依序；T27c 只依賴 T27a，T27b 卡住時可以先做）
T28 大阪交通 ──────┴──► T29 engine RAPTOR ──► T29b 重算速度、拿掉選班次（T15m merge 後）──► T29c 交通卡畫面
```

- **照前三區的經驗縮小範圍**（討論見 2026-10-26 的 session；做法寫在 CONVENTIONS §4「大阪（都市區）的做法」）：不做深入調查和 g 任務、不做 D 規則和每天的缺漏檢查、不做數量控制、不記 IG、不跑じゃらん、代表照片照來源自動排序（不逐張看圖）。評分一開始就照最新的 §5.1 和各區共用的補充，門檻打分前就訂好。
- **手動執行，不進指揮 session**：份量小（約 4 個 session），要 👤 決定的（子地區、USJ 的範圍、邊界判斷）當場問，不累積到 decisions-pending 再開 g 任務。
- **T27a 和 T28 同時開始**：T28 的路線範圍照 T27a 預定的子地區（難波、大阪城、天王寺、海遊館、USJ、梅田）先抓，T27a 定案後再補。
- **T27b、T27c 都用 Chrome，不同時跑**：T27b 先（份量小）。
- **和介面任務不衝突**：區域不寫死（T11、T12、T24 已經處理），新區域的資料只要 validate 通過、重新匯入、重新 build 就會出現。T29 只改 `packages/engine` 和資料載入，`Leg` 只加欄位；交通卡、車站面板的畫面拆成 T29b，等 T15m merge 後做；2026-10-28 再拆成 T29b（重算速度、拿掉選班次）和 T29c（畫面，先討論呈現方式）。

### 同時可以開幾個 session

| 時間點 | 可同時進行 | 建議 session 數 |
|---|---|---|
| 階段 0 | T0 | **1** |
| 階段 1 | T1→T1b、T2→T3→T4a→T4b→T4c（同一條 lane 依序）、T5、T6 | **4**（T1b 也可以另開第 5 個；T4b 可以拆成 2 個並行） |
| 階段 2 | T7（和你一起討論） | **1** |
| 階段 3 開始 | T7b、T8a 或 T9a（擇一，🌐）、T11、T14 | **4** |
| 階段 3 中 | 🌐 大量的任務輪流做（T7c、T7d、T7e、T7h、T8a～T8e、T9a～T9d、T19，同時只開 1 個）；同時進行不用 Chrome 的 T7g、T7i、T8f、T9f、T10、T11/T12、T14 | **3～4** |
| 階段 3 後 | T7f→T7g、T8c～T8f、T9c～T9f、T10、T11/T12、T14 | 4～5 |
| 階段 3 最後 | T7j→T8g→T9g→T13→T21（依序，見上方「接下來的順序」） | 1 |
| 階段 3 介面 | T22 先做；之後 T11、T14、T24 並行，T11 完成後接 T12，T24 完成後接 T25 | 2～3 |
| 階段 4 原型 | T15m、T16m 並行（T15m 可拆成三個子任務，見任務說明）；同時 👤 做 T23，接著 T25 | 2～4 |
| 階段 4 串接 | T15、T16 並行（需 T15m／T16m、T24、T25）；T26 也在 T25 之後，可以同時做 | 2～3 |
| 大阪 | T27a（🌐）＋T28 並行；之後 T27b → T27c（🌐，依序），T29 和 T27c 並行；最後 T27d。可以和階段 4 的介面任務同時做 | 2 |
| 部署 | T30（👤 資料和 schema 定案後；不和改 `worker/wrangler.jsonc`、migration 的任務同時做） | 1 |
| 階段 6 | T20 | 1 |

### 為什麼這樣排
- **T0 一定要先做**：所有 session 都要照同一份 schema 寫資料，否則之後合併會很痛苦。
- **同一區的 景點 → 住宿 → 餐廳 要依序**：餐廳要以景點和住宿為搜尋中心，住宿要看景點分布。
- **不同區域可以並行**：伊勢、志摩、關西機場周邊各自寫自己的檔案，不會互相衝突。唯一共用的是 `areas.json`（T8a、T9a 各自加自己區域的 `regions`），merge 時兩邊都保留。
- **同一個檔案不要兩個 session 同時寫**：鳥羽的 T7b 會同時改三個檔案，所以要先單獨做；之後 T7c（`spots.json`）、T7d（`lodging.json`）、T7e（`restaurants.json`）各寫一個檔案，可以並行。T7f 重算 anchors 要用 T7c 新增的港口，所以等三個都 merge 後再做。
- **共用腳本誰先寫**：楽天 API 的查詢腳本由 T7d 寫，T8b、T9b、T19 直接用；評分檢查腳本和校準範例由 T7g 產生，T8f、T9f、T19 的評分部分要等 T7g。觀光三重、じゃらん的腳本由 T7i 寫，T9a、T9b、T19 直接用，所以 T7i 要在 T9a 之前做。
- **Chrome 的操作**：T7c、T7d、T7e、T8a～T8d、T9a～T9d 都要用 Claude in Chrome。官方文件沒有說明多個 Claude Code session 同時用同一個 Chrome 是否支援；Windows 上有具名管道衝突（EADDRINUSE）的已知問題，文件的處理方式是「關掉其他使用 Chrome 的 Claude Code session」；社群回報過多個 session 共用同一個分頁群組。所以：
  - **預設同時只開 1 個用 Chrome 的 session**（§2 任務總覽「Chrome」欄有 🌐 的任務）；其他 session 做不用 Chrome 的工作（T7b、T7g、T8f、T9f、T10、T14，以及讀文 subagent、楽天 API）。
  - **🌐 少量**的任務（收尾的地圖檢查、介面任務看畫面）可以和 🌐 大量的任務同時開，但要用 Chrome 的那一段先暫停，等另一個 session 告一段落再做，或把要看的東西留給 👤 自己在瀏覽器確認。
  - 同一個任務裡，Chrome 的部分集中在主 session，讀文交給 subagent（WebFetch），所以一個 session 用 Chrome 也不會太慢。
  - 想多開的話，先用 2 個 session 做一次小測試（各開一個頁面、互相切換），確認沒有搶分頁或斷線，再寫進這裡。
- **深入調查（T7j、T8g、T9g）另開 session**：WebSearch 額度（200 次）由 session 和所有 subagent 共用，蒐集階段又已經不找部落格心得，所以把找心得集中到各區評分完成後，只對前幾名做（CONVENTIONS §4「深入調查」）。它是各區的最後一步，沒有其他任務依賴，所以**不放進指揮 session**，每區另開新的 session（或先 `/clear`），用 worktree；但會改該區的評分，不和同區其他任務、T13 同時做。
- **T7 是匯流點**：試做的資料和地圖都要看過之後才能訂規則，訂好再擴展。
- **介面和資料可以並行**：地圖只依賴 schema，可以先用鳥羽的資料或假資料開發。

### 並行時避免衝突
- **每個任務只寫自己負責的檔案**（見 CONVENTIONS.md 的「檔案歸屬」）。
- 共用檔案（schema、`stations.json`）只有 T0 和 T7 可以修改；其他任務需要改的話，寫在 `docs/requests.md` 裡提出。
- 每個 session 完成一個小段落就 commit。

### 多個 session 同時執行的方式

同時開多個 Claude Code session 時，每個任務在**自己的分支和 worktree** 上工作，不直接改 master。

1. **開始**：session 開始時，從最新的 master 建立分支和 worktree，之後所有工作都在 worktree 目錄裡做。
   ```sh
   git worktree add ../travel_helper-t3 -b t3 master   # 分支名稱用任務 ID 的小寫，例如 t1b、t3
   cd ../travel_helper-t3
   npm install                                         # worktree 不會共用 node_modules；在根目錄跑一次就裝好所有 workspace
   ```
2. **進行中**：照常在分支上 commit（跑過 `scripts/validate` 才 commit）。
3. **結束**：任務完成後**先不要 merge**，回報分支名稱、commit 清單和驗證結果，等 👤 你說「merge」。
4. **merge**：你說 merge 之後才合併回 master：
   ```sh
   cd <主目錄>
   git checkout master
   git merge --no-ff t3
   scripts/validate                                    # 合併後再驗證一次
   ```
   有衝突時先回報，不要自己決定取捨（`package.json` 這類檔案通常是兩邊都保留）。
5. **清理**：merge 完成、驗證通過後，刪除用完的 worktree 和分支：
   ```sh
   git worktree remove ../travel_helper-t3
   git branch -d t3
   ```

**任務總覽的狀態**：為了避免多個分支同時改同一張表而衝突，分支上不要改 §2 的狀態欄；merge 完成後在 master 上把該任務改成 ✅ 再 commit。

### 自動依序執行（指揮 session）

資料任務可以交給一個**指揮 session** 自動依序做完，不用每個任務都等 👤 說 merge（2026-10-18 測試過：subagent 可以用 Chrome、可以再開一層讀文 subagent，依序使用 Chrome 沒有問題）。指令範本在 [docs/prompts/orchestrator.md](prompts/orchestrator.md)。

**範圍與順序**（到 T11 之前為止；已經 ✅ 的跳過）：
T7c → T7d → T7e → T7f → T7g → T8a → T8b → T8c → T8d → T7i → T8e → T8f → T7h → T9a → T9b → T9c → T9d → T9e → T9f → T19 → T10

（T7i 改鳥羽、伊勢、二見的 `lodging.json`，要排在 T8e 之前、不和 T8e 同時做；T7h 用 Chrome，排在 T8e 之後。深入調查 T7j、T8g、T9g 不在這個清單裡：要另開新 session 才有自己的 WebSearch 額度，見 §3「為什麼這樣排」。）

**和手動模式不同的規則**：
- **分支**：每個任務從 master 開自己的分支（不用 worktree，指揮 session 在主目錄工作），做完由指揮 session 驗證後**自動 merge**、再驗證、把 §2 的狀態改成 ✅、刪分支。出問題時只要 revert 那一個 merge。
- **不問問題**：任務卡裡要 👤 決定的地方（T8a、T9a 的子地區確認、T7g 評分檢查列出的項目、fit15 的疑問、納入標準的邊界等）照規則自己決定，寫進 `docs/decisions-pending.md`（日期、任務、決定、理由、怎麼改回）。**會改變收錄或排除、`fit15`／`groupFit`、子地區、評分門檻，或擴大解釋、違反 CONVENTIONS 規則的決定**，另外加到 decisions-pending 開頭「👤 建議先看」該區的清單（一行：任務、決定、為什麼要看）；邊界判斷只寫表格。這些要討論的決定，集中在該區的 g 任務（T7j、T8g、T9g）和 👤 一起看，不在自動流程中停下來問。
- **只有這些情況才停**：驗證修 2 次還不過、merge 衝突、前置任務失敗、整個任務因為 API 或 Chrome 連續失敗而做不下去。網站要求驗證碼、登入或封鎖時**不繞過**：那一部分跳過、記錄，繼續做其他部分。
- **紀錄**：每個任務結束在 `docs/auto-run-log.md` 加一行（任務、時間、merge commit、驗證、跳過或要 👤 看的事）。中斷後重開指揮 session，從這份紀錄接著做。
- **定期換 session（WebSearch 額度）**：一個 session 的 WebSearch 是 200 次，指揮 session 和所有 subagent 共用，用完**不會報錯**（subagent 會默默只剩 WebFetch，T7e 發生過）。所以每個任務 subagent 回報 WebSearch 用了幾次，寫在 auto-run-log 那一行的最後一欄（「WebSearch N 次」）；**累計超過約 120 次**，或任務回報搜尋沒有結果、看起來像額度用完，就在 auto-run-log 寫「換 session（累計 N 次）」後停下來（不因為做了幾個任務就停：context 變長時 Claude Code 會自動壓縮），請 👤 開新的指揮 session、貼同一個 prompt 接著做（`/clear` 也會歸零）。
- **分批**：一個 subagent 的 context 有限，大任務分成幾批，一批一個 subagent，依序做：
  | 任務 | 一批的範圍 |
  |---|---|
  | T7c、T7d | 景點、住宿各一批 |
  | T7e | 補店一批、照片與讀文依子地區分批 |
  | T8a、T9a | 子地區＋景點候選一批；景點讀文與 Chrome 依子地區分批 |
  | T8b、T9b、T19 | 一批 |
  | T8c、T9c | 依子地區分批（每批的候選清單寫進同一個 candidates 檔） |
  | T8d、T9d | 依子地區分批，每批約 20 家 |
  | T7g、T8f、T9f | 景點、住宿、餐廳各一批（同一類型不要拆開，避免評分標準漂移） |
  | T7h | 補心得一批（Chrome）、重新打分一批 |
  | T7i | 一批 |
  | T8e | 收尾一批；補心得依子地區分批，每批約 20 筆（Chrome） |
- **Chrome**：同一時間只有一個 subagent 用 Chrome。用 Chrome 的 subagent 先呼叫 `tabs_context_mcp(createIfEmpty: true)`（新的 subagent 沒有自己的分頁群組，直接開分頁會失敗），結束時關掉自己開的分頁。
- 指揮 session 跑的時候，👤 可以另外開不用 Chrome 的 session（T11、T14），照手動模式用 worktree。

---

## 4. 建議時程

| 期間 | 階段 | 重點 |
|---|---|---|
| 2026/10 下旬 | 0、1 | 骨架、鳥羽試做、地圖 v0、近鐵時刻表 |
| 2026/11 上旬 | 2 | 👤 檢討試做結果、訂規則 |
| 2026/11 中 ～ 12 上 | 3 | 伊勢、志摩蒐集；地圖 v1；行程引擎 |
| 2026/12 | 4 | 行程與建議 UI、AI Agent；👤 **行程大致確定後就訂住宿、團體用餐、特急座位**（15 人要早訂） |
| 2027/01 上旬 | 5 | AI Agent |
| 2027/01 | 6 | 行程定案後，匯出給 Claude app |

**底線**：就算後面的階段沒做完，**階段 1～3 的資料加上地圖**就已經能用來規劃行程，也能直接拿資料給 AI 排行程。

---

## 5. 任務說明

每張任務卡都可以直接當成 Claude Code session 的指令。例如：「請執行 docs/PLAN.md 的 T2」。

### T0 專案骨架 〔S〕
- 建立 CONVENTIONS.md 規定的目錄結構。
- 把 CONVENTIONS.md 的資料格式草稿寫成 **JSON Schema**，放在 `schema/`。
- 寫驗證腳本 `scripts/validate`：檢查 `data/` 下的所有 JSON 都符合 schema、ID 不重複、座標落在範圍內、每筆資料都有來源。
- 建立 `data/stations.json`：近鐵目標區間的車站（至少包含伊勢市、宇治山田、五十鈴川、朝熊、池の浦、鳥羽、中之郷、志摩赤崎、船津、加茂、松尾、白木、五知、沓掛、上之郷、志摩磯部、穴川、志摩横山、鵜方、神明、賢島；名單以近鐵官網為準），以及 JR 二見浦等相關車站。
- 建立 `data/areas.json`：區域劃分（伊勢、二見、鳥羽、志摩）。
- **完成條件**：驗證腳本可以執行，車站和區域資料通過驗證。

### T1 近鐵時刻表 〔M〕
- 從近鐵官網等來源，蒐集 T0 車站清單的**平日、假日時刻表**（上下行，含列車種別：普通、急行、特急、しまかぜ等）。
- 存成 `data/timetables/kintetsu/<station-id>.json`。
- 記錄時刻表的**適用期間**和取得日期（近鐵通常在 3 月改版）。
- 另外整理特急費用、5 日券的使用規則，存到 `data/passes.json`。
- **團體相關**：近鐵的團體乘車券（人數門檻、折扣）和 5 日券比較，哪個划算；しまかぜ等特急一次能不能訂到 15 個座位、要多早訂。
- **兒童票**：5 日券和特急費用的兒童價格（6～11 歲）。
- 各站有沒有電梯、手扶梯（長輩上下月台），記在 `stations.json` 的修改請求裡（寫到 `docs/requests.md`）。
- **完成條件**：可以回答「某天某時從 A 站出發，下一班到 B 站的車是幾點、要多久」。
- 可以並行：時刻表跟各區的景點、餐廳沒有依賴關係。

### T1b 關西機場 ↔ 伊勢志摩的交通 〔S〕
航班（分兩批，大致一起抵達、一起離開）：
| 日期 | 航段 | 時間 |
|---|---|---|
| 2027-02-02 | 桃園 → 關西 | 08:20→11:55、09:45→13:20 |
| 2027-02-13 | 關西 → 桃園 | 12:45→15:00、12:55→15:05 |

要整理的內容：
- **第一天**：行程從志摩開始，所以要查**關西機場到志摩（鵜方、賢島一帶）**的路線、所需時間、費用。例如南海電鐵到難波，轉近鐵特急到賢島；或包車。以兩批中較晚的 13:20 抵達來算，加上入境和領行李，**當天傍晚到得了志摩嗎**？到不了的話，第一晚要在途中（大阪、伊勢）先住一晚嗎？
- **兩批人怎麼會合**：在機場等、在大阪難波會合，還是各自出發、在住宿會合。
- **最後一天**：國際線大約要在起飛前 2 小時到機場，所以**10:45 左右要到關西機場**。行程最後在伊勢，要查**從伊勢市出發要多早**；前一晚（2/12）是不是住大阪或機場附近比較好？
- **15 人的行李**：特急車廂的行李放置空間、要不要用宅配把行李直接寄到住宿（手ぶら観光）、大型計程車或包車接送。
- **長輩和小孩**：轉乘次數、各站有沒有電梯。
- 結果存成 `data/access/kix.json`，研究筆記放在 `data/raw/access/`。
- 可以和 T1 並行。

### T2 鳥羽：景點 〔S〕
- 搜尋鳥羽區的景點，來源見 CONVENTIONS.md 的「資料來源」。
- 每筆記錄：座標、最近車站和交通方式、營業時間、公休日、**2 月是否營業或縮短營業時間**、門票（大人、小孩、長輩、團體）、建議停留時間、照片連結。
- **長輩、小孩**：景點內步行時間、階梯和坡道、休息處、廁所、無障礙設施；適不適合小孩。這些資訊**只記錄、不排除**：要爬長階梯的景點照樣收錄，由看行程的人決定。
- 寫入 `data/areas/toba/spots.json`；研究過程的筆記寫在 `data/raw/toba/spots.md`。
- **完成條件**：通過驗證腳本，而且在地圖 v0 上看起來合理。

### T3 鳥羽：住宿 〔M〕
- 依 T2 的景點分布，搜尋飯店、旅館、民宿。
- 每筆記錄：離最近車站步行幾分鐘、有沒有接送、**是否含晚餐（一泊二食）**、價位、訂房連結、行李寄放。
- **能不能住下 15 人**：總房間數、房型（和室可以多人一間）、能不能包棟、接送車一次能載幾人。小民宿可能要 2～3 間分住，記下附近可以搭配的住宿。
- **條件**：不住評價差的地方。民宿優先找**可以包棟**的（一棟貸し），旅館、飯店、一泊二食都可以。記下各訂房網站的評分。
- **價格**：每個方案（一泊二食、素泊、包棟）的價格、計價單位（每人或每棟）、大人與小孩價格，盡量查 2 月的價格。
- **長輩、小孩**：有沒有電梯、床或鋪被、兒童收費。
- **訂房方式與聯絡資訊**：訂房網站、電話、團體是否要電話洽詢。
- 寫入 `data/areas/toba/lodging.json`。

### T4 鳥羽：餐廳（拆成 T4a → T4b → T4c）

共同事項（三個子任務都適用）：
- **T4a、T4b 必須在有 Claude in Chrome 的 session 做**（先執行 `/chrome` 連線）。食べログ用程式抓會被擋（403），要在 Chrome 裡瀏覽；Google Maps 也一樣。讀取方式和注意事項見 CONVENTIONS.md 的「資料來源」。
- 每家店大約 5～10 次瀏覽器操作；整個 T4 預估 300～700 次，分好幾個 session 做是正常的。
- 研究筆記寫在 `data/raw/toba/restaurants.md`（候選表、搜尋關鍵字、納入與排除原因）。
- 海女小屋（相差かまど、はちまんかまど）、鳥羽マルシェ的餐廳已經以景點收錄，**不另建餐廳資料**，在筆記裡註明「用餐見 spot `<id>`」。
- 沒有忌口；有人很喜歡海鮮。

#### T4a 候選名單 〔M〕
- **按地區搜尋**，不是逐個景點搜尋：
  | 地區 | 包含 | 主要情境 |
  |---|---|---|
  | 鳥羽站周邊 | 鳥羽站、佐田浜、水族館、真珠島、城跡一帶 | lunch、dinner、transit、snack、cafe |
  | 浦村 | 浦村牡蠣（牡蠣小屋、吃到飽）；2 月是盛產期 | lunch |
  | 相差 | 石神さん、海女文化資料館一帶 | lunch、snack |
  | 國崎、パールロード | 鎧埼燈塔、各展望台、海の博物館 | lunch |
  | 離島 | 答志島、菅島、神島（2 月可能休業，要特別注意） | lunch |
  | 中之郷 | 中之郷站、鳥羽大庄屋かどや | transit |
  晚餐另外對照 `lodging.json` 裡**不含晚餐**的住宿，確認附近有沒有店。
- **來源**：食べログ列表（鳥羽市 https://tabelog.com/mie/C24211/rstLst/ ，用評分排序、口コミ數排序、「貸切可」「個室あり」篩選）、鳥羽市觀光協會、觀光三重、日文部落格與地方媒體、中文部落格。
- **合併同一家店**：依序用食べログ網址、電話號碼、店名加距離 50m 以內來判斷；記錄每家被哪些來源推薦。
- **依 CONVENTIONS.md「餐廳候選納入標準」的 A～F 篩選**，候選表每家都記是靠哪一條納入。沒納入的店也留在候選表裡（附分數和口コミ數），T7 調整門檻時可以重新撈出來。
- **產出**：`data/raw/toba/restaurants.md` 的候選表，欄位：店名（日文）、地區、類別、食べログ分數／口コミ數、食べログ網址、來源數、納入條件、可能的情境。這一步**不寫** `restaurants.json`。
- **完成條件**：每個地區都有候選；總數約 50～70 家（超過時照標準裡的數量控制處理）。

#### T4b 詳細資料 〔M〕
- 對候選表裡**已納入**的店逐家查，寫進 `data/areas/toba/restaurants.json`：
  - **食べログ店家頁**（「店舗情報」表格就在店家首頁）：席数、最大予約可能人数、個室、貸切、予約可否、営業時間、定休日、電話、お子様連れ、禁煙・喫煙、公式アカウント、是否為「店舗会員」，以及空間・設備（バリアフリー、座敷、掘りごたつ）。
  - **Google Maps**：星數、評論數、營業時間、網站欄、座標、是否顯示臨時休業或閉業。
  - 欄位對應：`ratings`（`tabelog`、`tabelogReviews`、`google`、`googleReviews`）、`group`（`fit15` 照 CONVENTIONS.md 的判斷規則）、`reservation`、`seating`、`kids`、`hours`（照營業時間的優先順序，衝突寫進 `extra.conflicts`）、`febNote`、`links.instagram`。
  - `contexts` 依地區和營業時段填；`anchors` 先填最近的車站或景點（`walkSource: "estimate"`），T4c 再精算。
- **IG 不主動查**，只記帳號（從食べログ的公式アカウント或 Google 的網站欄取得），寫進 `links.instagram`，並在 `data/raw/toba/ig-notes.md` 列出帳號和建議的 hashtag。
- **可以拆成 2 個並行 session**：T4b-1 鳥羽站周邊、T4b-2 其他地區。兩邊都寫 `restaurants.json`，merge 時會有陣列衝突，處理方式是**兩邊的資料都保留**（ID 不會重複）；照 §3 的流程，衝突先回報再處理。
- 每查完一批（例如 10 家）就跑 `scripts/validate` 再 commit。

#### T4c 收尾 〔S〕
- 用 `node scripts/geo.mjs walk` 計算每家店到附近景點、住宿、車站的步行時間，更新 `anchors`（`walkSource: "osrm"`）。
- 跑 `scripts/validate`；在地圖 v0 上檢查位置是否合理（例如店不在海上、地區沒有標錯）。
- 缺漏檢查：每個景點地區、每個不含晚餐的住宿附近，是不是都至少有一家店；沒有的話寫在筆記裡。
- 整理 `data/raw/toba/ig-notes.md`。

### T5 地圖檢視器 v0 〔M〕
- 技術：Vite + React + TypeScript + MapLibre GL + OpenFreeMap 圖磚（免費、不需要 key）。
- 讀取 `data/` 下所有 JSON，依類別用不同圖示；可以開關各圖層；點了顯示原始資料。
- **用途是檢查資料**：分布、缺漏、座標錯誤，所以不用做得漂亮。
- 可以並行：只依賴 schema，開發時可以先用假資料。

### T6 地理工具 〔S〕
- `scripts/` 或 `web/src/lib/geo/`：
  - 直線距離 → 估算步行時間（直線距離 × 1.3 ÷ 每分鐘 80 公尺，係數可以調）
  - 找最近的車站
  - 用 OSRM（或 OpenRouteService）查實際的步行路線，結果快取到 `data/cache/routes/`
- 寫成前端和腳本都能用的模組。

### T7 👤 檢討試做結果、訂規則 〔S〕
- 和你一起在地圖 v0 上看鳥羽的資料，決定：
  - 名店和一般店的分級門檻
  - 各區的搜尋半徑
  - 標籤分類（料理種類、價位）
  - 交通方式判斷規則（步行上限幾分鐘、什麼時候搭巴士或計程車）。15 人搭計程車要 4 台以上，可能包一台巴士或大型計程車比較划算
  - 長輩、小孩的步行係數和步行上限；每天的行程密度、休息時間
  - 團體用餐規則：多少人以上要預約；全員和分組各在什麼時候
  - 住宿的評分門檻
  - 餐廳的推薦指數（地圖上點的大小、顏色）：食べログ分數、Google 星數、評論數、來源數怎麼組合；評論數少的星數要打折
  - 餐廳候選納入標準（T4a 用的 A～F）要不要調整門檻
  - schema 要不要調整
- 把結果更新到 CONVENTIONS.md 的「規則」區段，並修改 schema。

### T7b～T7g 鳥羽補資料
照 T7 的新規則（CONVENTIONS.md §4、§5，討論見 T7-review.md）補鳥羽已有的 137 筆資料，讓鳥羽成為 T8、T9 的範本。

#### T7b 欄位搬移、筆記改結構 〔M〕
- **先單獨做**（會同時改 `spots.json`、`lodging.json`、`restaurants.json` 和 `data/raw/toba/`）。以腳本為主，不用 Chrome。
- `extra.region` → `region`（子地區 ID 見 `areas.json`），景點 `tags` 裡的子地區拿掉；`extra.tabelogOwner`、`extra.googleName`、`extra.barrierFree`（→ `accessibility.barrierFree`）、`extra.phone`（景點 → `phone`）、`extra.checkIn`/`checkOut`（住宿）升格；`kids` 改成物件；`group.maxReservation` 從 `group.source` 的文字取出；`cuisine`、`tags` 改成固定清單；數字的 `price`（從 `priceRange` 轉）；`hours.always`、`hours.lastEntry`、`closures`（從 `febNote`、`hours.note` 轉，只轉來源寫明日期的）；住宿 `dinnerAccess`、餐廳 `access`（照 T4c 的缺漏檢查結果）。
- 轉不了的（例如文字太模糊）留原樣，列在 `data/raw/toba/log/T7b.md`。
- **筆記改結構**（CONVENTIONS §4「研究筆記怎麼存」）：
  - `restaurants.md` 的候選表 205 家轉成 `candidates/restaurants.json`（寫轉換腳本，文章標題放進 `mentions`）；`spots.md`、`lodging.md` 裡被排除、沒收錄的候選轉成 `candidates/spots.json`、`candidates/lodging.json`。
  - 各檔案裡的「待確認」「要打電話問」集中到 `questions.md`。
  - 其餘過程紀錄原文搬到 `log/T2.md`、`log/T3.md`、`log/T4a.md`、`log/T4b.md`、`log/T4c.md`（只搬不改寫）；貼上的腳本輸出刪掉，只留結論。
  - 寫 `README.md`：每個類型的現況、重要決定（例如數量控制、fit15 的判斷疑問、缺口）、給 T7c 之後的建議。
  - 刪掉舊的 `spots.md`、`lodging.md`、`restaurants.md`（內容都已經搬走）。

#### T7c 景點 〔M〕（Chrome）
- 每筆補 `links.googleMaps`、Google 星數與評論數（`ratings`）、照片 1～3 張（CONVENTIONS §4「照片」）。
- **讀文**：每個景點開一個 subagent（`docs/prompts/dossier.md`），讀 T2 的來源和 2～4 篇心得，寫筆記 `data/raw/toba/dossiers/<id>.md`，回報要補的欄位和官網照片（CONVENTIONS §4「讀文與筆記」）。主 session 同時用 Chrome 查 Google Maps。
- 離島港口（`docs/requests.md` 的 T4c 請求）：菅島港、神島港、答志島的和具港與答志港（和景點分開）、桃取港。
- 只寫 `spots.json`、`data/raw/toba/` 的景點部分（`candidates/spots.json`、筆記、`log/T7c.md`；`README.md` 只改景點那一節）。

#### T7d 住宿 〔M〕（楽天 API＋Chrome）
- 楽天 API key 已經在 `.env`（`RAKUTEN_APPLICATION_ID`、`RAKUTEN_ACCESS_KEY`，2026-10-18 測試成功）；用法見 CONVENTIONS §4「楽天トラベル API」。
- 寫共用的查詢腳本 `scripts/rakuten.mjs`（空室検索、施設情報；T8b、T9b、T19 會沿用，參數要能指定區域和日期）。
- 用 2 月的日期重查 38 筆裡有上楽天的：價格、15 人的房型組合有沒有空房、細項評分、照片。
- 全部住宿補 `links.googleMaps`、Google 星數與評論數、照片（Chrome）。
- **讀文**：每間住宿一個 subagent，寫筆記（同 T7c）。
- 只寫 `lodging.json`、`data/raw/toba/` 的住宿部分（`candidates/lodging.json`、筆記、`log/T7d.md`；`README.md` 只改住宿那一節）、`scripts/rakuten.mjs`。

#### T7e 餐廳 〔M〕（Chrome）
- 照修訂後的納入標準補店：D 的「任何一天 0 家」（菅島週三、國崎週三週四）、F③ 接受非住客用餐的料理旅館（相差的伝洋、花椿等）、D③ 離島便當（菅島 おかげ屋）；新店照 T4b 的方式查詳細資料。
- 全部餐廳補照片（官網或 Google Maps 的照片 URL，不用食べログ的照片）。
- 菜單（CONVENTIONS §4「菜單」）：`mustTry` 從讀文筆記的 `[招牌]` 整理；`menu` 記食べログ菜單、コース分頁或官網菜單頁的連結；fit15 是 yes 或 split 的店（約 30 家）看コース頁，補 `group.groupMenu`。
- **讀文**：每家店一個 subagent（來源少的 3 家合一個），候選清單 `mentions` 裡的文章當已知來源，再找 1～3 篇心得，寫筆記。
- 只寫 `restaurants.json`、`data/raw/toba/` 的餐廳部分（`candidates/restaurants.json`、筆記、`ig-notes.md`、`log/T7e.md`；`README.md` 只改餐廳那一節）。

#### T7f 收尾 〔S〕
- T7c、T7d、T7e 都 merge 後才做。
- 重跑 `node scripts/restaurant-anchors.mjs toba --write`（加入港口）、`node scripts/restaurant-gaps.mjs toba`；地圖檢查新增的資料點。

#### T7g 摘要與評分 〔M〕
- 照 CONVENTIONS §5.1：只讀資料檔和筆記（不重新爬文），寫 `summary`、`assessment`、`tier`。**每個類型在同一個 session 打完**；可以拆成 3 個並行 session（景點、住宿、餐廳各一個，各寫各的檔案）。
- 每個類型、每個星等挑 1～2 筆當校準範例，寫進 `data/raw/toba/assessment-notes.md`（附理由），T8f、T9f、T19 打分前要讀。
- 寫評分一致性檢查腳本（推薦度和評分數字明顯矛盾的列出來，輸出到 `data/derived/`），👤 看過列出來的項目。

#### T7h 重點資料點補心得、重新打分 〔S〕（Chrome）
- 背景：鳥羽餐廳 `confidence` low 57 家、high 0 家，原因是心得只找部落格，沒讀食べログ口コミ和 Google 評論（CONVENTIONS §4「取得方式」「口コミ、Google 評論」，2026-10-18）。
- **只補重點**：餐廳 `assessment.groupFit` 5 的 12 家，加上 `tier` S、A 的店（重複的算一次，約 20～25 家）；景點、住宿只補 `tier` S、A 而且筆記心得不到 2 篇的。其他 low 的先不補，等行程縮小範圍再看。
- 照 CONVENTIONS「口コミ、Google 評論」的固定步驟讀（用 `scripts/chrome/` 的抽取程式，每家約 2～3 次 batch），補進 `dossiers/<id>.md`。評論讓 `kids`、`seating` 這類 null 欄位有了明確來源的（例如口コミ寫「有兒童餐」），用 `scripts/apply-patch.mjs` 回填資料檔（只填 null，`sources` 加上該頁）。
- 補過的資料點照 §5.1 重新寫 `assessment`、`tier`、`summary`（先讀 `assessment-notes.md`，標準不變）；星等或 tier 有變的列在 `data/raw/toba/README.md`。重跑評分檢查腳本。
- 寫 `data/raw/toba/dossiers/`、`data/areas/toba/` 三個資料檔的 `assessment`、`tier`、`summary`。

#### T7i 小腳本：觀光三重列表、じゃらん評分 〔S〕
- **觀光三重景點列表**（`scripts/kanko-mie.mjs`）：依市町抓景點列表（名稱、網址、類別），輸出到 `data/derived/kanko-mie-<area>.json`。先看 robots.txt、呼叫間隔至少 1 秒；被擋就停，記在 README，T9a 改人工。
  - 對伊勢、二見跑一次，和 `candidates/spots.json` 比對，沒在候選裡的列成 `data/derived/kanko-mie-missing-ise.json`（T8a 沒看觀光三重列表，可能漏景點）。**只產生清單，不改候選檔**，要不要補由 T13 決定。
- **じゃらん評分**（`scripts/jalan.mjs`）：讀住宿頁的總評分和評論數。先看 robots.txt 和利用規約，不允許就停、記在 README。
  - **頁面是 Shift_JIS**：用 `fetch` 取 `arrayBuffer()`，再用 `new TextDecoder('shift_jis')` 解碼（T3 用這個方法讀成功過，見 `data/raw/toba/log/T3.md`）；不要用 WebFetch 或 `res.text()`，會亂碼（T7d、T8b 就是因此沒記到）。
  - 方案、價格是動態載入，抓不到；腳本只拿總評分和評論數。
  - 現況：鳥羽 38 間有 21 間、伊勢 21 間有 1 間、二見 17 間有 1 間（二見那筆是搜尋摘要，沒有讀頁面）。補鳥羽、伊勢、二見 `lodging.json` 的 `ratings.jalan`、`ratings.jalanReviews`（只填讀得到的，讀不到維持 null；已有的值和腳本結果不同時以腳本為準，舊值寫進 `extra.conflicts`），`sources` 加じゃらん頁面。
- **山田館**（伊勢，候選 `ise-yamadakan`，excluded）：官網最多 80 人、有宴會場，只因 Google 3.4（50 則）被排除（T8b）。腳本補查它的じゃらん評分，寫進候選的 `ratings` 和 README；10 則以上而且 3.8 以上的話，照 §5.7 不該排除，交給 T8e 照讀文筆記（`dossiers/ise-yamadakan.md`）補進 `lodging.json`（2026-10-18 👤 決定）。
- 寫 `scripts/`、`data/derived/`、三區的 `lodging.json`（只動 `ratings`、`sources`），伊勢候選清單的山田館 `ratings`。

#### T7j 👤 檢討待確認的決定、深入調查、補丁式重新打分 〔S〕（另開 session）
- **先和 👤 檢討**：讀 `docs/decisions-pending.md` 開頭「👤 建議先看」裡這一區還沒打勾的項目（不用讀整張表），逐項說明影響、給建議，讓 👤 決定；改了的照決定修資料、規則寫進 CONVENTIONS，打勾並在表格最後加一列。檢討完才挑深入調查的對象（決定可能改變收錄或分數）。
- T7h 完成後做。照 CONVENTIONS §4「深入調查」：挑鳥羽的前幾名（住宿 S、A 而且 `groupFit` 4 以上；餐廳 S、A 加上 `groupFit` 5；景點 S 加上 `confidence` low 的 A；最多 25 筆），每筆一個 subagent 找部落格、中文心得（每筆 WebSearch 2～3 次），追加到 `dossiers/<id>.md`。
- 只對有新資訊、或檢討時改了資料的那幾筆重寫 `summary`、`assessment`、`tier`（先讀 `assessment-notes.md`；檢討改了評分門檻的話，受影響的全部重打）；星等或 tier 有變的列在 `data/raw/toba/README.md`，重跑評分檢查腳本。
- **另開新的 Claude Code session（或先 `/clear`），不要放進指揮 session**；用自己的 worktree，不和鳥羽的其他任務、T13 同時做。`log/T7j.md` 記每筆的搜尋次數和找到的篇數。
- **第二輪**：行程大致定下來後（T15 前後），照同一張任務卡，對象改成「行程選中、第一輪沒做過的」。
- 寫 `data/raw/toba/dossiers/`、`README.md`、`log/T7j.md`、`data/areas/toba/` 三個資料檔的 `summary`、`assessment`、`tier`。

### T8a～T8f 伊勢（含二見）／ T9a～T9f 志摩
兩區的步驟相同，照 CONVENTIONS §4 的「標準作業流程」（步驟 0～11）、「研究筆記怎麼存」和 §5 的規則。每一步都更新 `data/raw/<area>/README.md` 自己的那一節，過程寫在 `log/<任務 ID>.md`；開工先讀 README，不要整份讀其他 session 的 log。**兩區可以並行；同一區的步驟依序**。每筆從一開始就填新欄位：`region`、`links.googleMaps`、Google 星數與評論數、`photos`、數字的 `price`、`closures`，並且每筆都要有讀文筆記（subagent，`docs/prompts/dossier.md`）。一批的工作檔放 `data/cache/work/<任務>-<批>/`，用 CONVENTIONS §4「工具」的共用腳本。

| 步驟 | 內容 | 工具 | 寫入 |
|---|---|---|---|
| a 子地區與景點 〔M〕 | 流程步驟 0～3：先定子地區，寫進 `areas.json` 該區域的 `regions`（例外允許，見 CONVENTIONS §2），👤 確認後列景點候選；每個景點一個讀文 subagent；Google Maps 用 Chrome 批次查 | WebSearch、subagent、Chrome | `areas.json` 的 regions、`spots.json`、`candidates/spots.json`、筆記 |
| b 住宿 〔M〕 | 流程步驟 4～6：用 T7d 的 `scripts/rakuten.mjs` 依子地區和 2 月日期撈候選，套 §5.7 門檻；包棟、小民宿另外找；每間一個讀文 subagent；Google Maps 用 Chrome | 楽天 API、subagent、Chrome | `lodging.json`、`candidates/lodging.json`、筆記 |
| c 餐廳候選 〔M〕 | 流程步驟 7：依子地區用食べログ列表、觀光協會、媒體蒐集，套 A～F（同 T4a）；列表文章的推薦重點寫進 `mentions` | Chrome | `candidates/restaurants.json` |
| d 餐廳詳細 〔M～L〕 | 流程步驟 8：逐家查食べログ、Google Maps（同 T4b），記菜單連結、fit15 是 yes 或 split 的店的團體套餐，同時在背景開讀文 subagent；用 CONVENTIONS §4「工具」的 `candidates.mjs export` → `chrome-actions.mjs` → `build-restaurants.mjs draft／build`，不要在 scratchpad 重寫腳本；**可以依子地區拆成 2 個並行 session**，merge 時陣列衝突兩邊都保留 | Chrome、subagent | `restaurants.json`、`ig-notes.md`、筆記 |
| e 收尾 〔S〕 | anchors（OSRM）、缺漏檢查、地圖檢查（同 T4c、T7f）；T8e 另外補心得（見下方「各區注意」） | 腳本 | `restaurants.json`、筆記 |
| f 摘要與評分 〔M〕 | 流程步驟 10：先讀 `data/raw/toba/assessment-notes.md`，**先試算這一區 A 以上的比例，超過約 25% 照「依區調整」換門檻（伊勢的餐廳要換，試算見 assessment-notes）**，再只讀資料檔和筆記，照 §5.1 寫 `summary`、`assessment`、`tier`（同 T7g；可以依類型拆 3 個並行） | — | 三個檔案 |
| g 👤 檢討＋深入調查 〔S〕 | 流程步驟 11（同 T7j）：f 完成後**另開新 session**（不在指揮 session 裡跑），先和 👤 檢討「👤 建議先看」裡這一區的項目，再挑前幾名找部落格、中文心得，重寫有新資訊那幾筆的評分；伊勢、二見各自算 25 筆上限；行程定了以後做第二輪 | WebSearch、subagent | 筆記、三個檔案的 `summary`／`assessment`／`tier` |

各區注意：
- **伊勢（T8）**包含兩個區域：`ise`、`futami`（寫 `data/areas/ise/`、`data/areas/futami/`，筆記各自放在 `data/raw/ise/`、`data/raw/futami/`）。おはらい町的店很多，餐廳目標 80～100 家，T8d 建議拆成 2～3 個 session（例如：內宮・おはらい町／外宮・伊勢市站／二見）。旅程期間有 **2/3 節分**（神社活動）、**2/11 國定假日**，記在 `events`。
  - **T8e 補心得**（2026-10-18 加入）：T8a～T8d 是在「心得改讀口コミ、Google 評論」之前做的，96 份餐廳筆記心得幾乎 0 篇。T8e 在收尾之後、T8f 打分之前，照 CONVENTIONS「口コミ、Google 評論」的對象和固定步驟補進 `dossiers/`（餐廳約 30～50 家，加上心得不到 2 篇的景點、住宿；用 JS 抽取每家約 2～3 次 batch，退路是每家 6～7 次操作）。
    - **補回 §5.7 誤排除的住宿**（T7i 補了じゃらん評分後發現）：伊勢シティホテル（じゃらん 3.8／2,262 則）、外宮前別邸 道（4.2／11 則）、ホテルキャッスルイン伊勢（3.9／213 則）有 10 則以上、3.8 以上的來源，照 §5.7 不該排除。候選改 included，照 T8b 的方式補讀文、Google、楽天 API，寫進 `lodging.json`（伊勢シティ、キャッスルイン 是「評價普通」）。山田館 じゃらん不顯示分數，維持排除（候選 note）。
    - **補回大個室店**（2026-10-18 數量控制改規則，CONVENTIONS §4「餐廳候選納入標準」：能坐 15 人的店不受數量控制）：伊勢候選裡 `reason` 是「C 因數量控制」而且 `note` 的個室最多 15 人以上的 13 家（ise-geku 炭火焼肉匠、満船屋 HANARE、桂 外宮、あぶり焼肉 匠 PART2、やきとり能代、居酒屋 ふぐや、一升びん 松寿亭、ひびの；ise-kurata かぐら；ise-outskirts 味の來々軒、伊勢大阪屋；ise-obata 柚子、たまちゃん（2026-10-18 子地區調整後）。さし汐、パセプション 已經用 D 收錄），用 `candidates.mjs set` 改成 included（criteria 加 C、reason 寫補回原因、`detailPending: true`），照 T8d 的方式用 `build-restaurants.mjs` 補詳細（Chrome，一批），再一起算 anchors、缺漏。README 的「大個室店的 D 檢討」改成這個結果。
    - `scripts/chrome/tabelog-reviews.js`、`google-reviews.js` 已經寫好，2026-10-18 在 いかだ荘 實測過（CONVENTIONS「已確認」）。第一批再用 2～3 家確認能用，抓不到時照 CONVENTIONS 修正選擇器；之後的批次和 T7h、T9 直接用。評論讓 null 欄位有了明確來源的，用 `scripts/apply-patch.mjs` 回填資料檔。第一批順便用 2～3 家試跑 `scripts/chrome/tabelog-info.js`、`google-place.js`（2026-10-18 從 T8d 的程式整理出來，還沒在實際頁面跑過），抓不到就修選擇器，T9 才能直接用。T8a 沒看觀光三重列表的部分由 T7i 產生清單，T13 決定要不要補。
- **志摩（T9）**的店和景點比較分散，很多地方要搭巴士或開車：子地區要標 `needsCar`，餐廳要填 `access`。第一天（2/2）傍晚才會到志摩，T9b 要特別看鵜方、賢島一帶的住宿，T9c 要找第一晚的晚餐。
  - 志摩比伊勢更鄉下，部落格心得只會更少：從一開始就照 CONVENTIONS 標準作業流程的步驟 3、6、8，由主 session 在 Chrome 讀口コミ、Google 評論補心得；讀文 subagent 只讀官網和已知網址，WebSearch 每個資料點最多 1 次（只找官網或事實來源）；部落格心得留給 T9g。
  - T9a 的景點候選先跑 T7i 的 `scripts/kanko-mie.mjs`（觀光三重列表）當母體；T9b 的じゃらん評分用 `scripts/jalan.mjs`。
  - 很多景點要搭巴士：T10 盡量在 T9a 完成後就做，T9c、T9d 判斷交通時才有班次可以看。

### T19 關西機場周邊：2/12 住宿與晚餐 〔S〕
- 區域 `kix`（子地區：空港島、りんくうタウン），**不蒐集景點**。T7d 的楽天腳本完成後就可以開始，和 T8、T9 並行。
- 住宿 5～10 間（用 `scripts/rakuten.mjs`，2027-02-12 入住）：到機場的接駁（時間、班次、能不能一次載 15 人和行李）、早上能不能在 10:45 前到機場、從伊勢過來的交通（參考 `data/access/kix.json`）。照 §5.7 的評分門檻。
- 餐廳：住宿附近能接 15 人的 3～5 家（晚餐）。
- 每筆都要有讀文筆記（subagent，`docs/prompts/dossier.md`）。
- 最後寫 `summary`、`assessment`、`tier`（要等 T7g 的校準範例）。
- `stations.json` 目前沒有りんくうタウン、関西空港站；需要的話寫到 `docs/requests.md`。
- 寫 `data/areas/kix/`、`data/raw/kix/`。

### T10 巴士、JR、定期船時刻表 〔M〕
- 從 T2、T8a、T9a 的景點資料，挑出「需要搭巴士」的路線。
- 蒐集三重交通等業者的時刻表（先找 gtfs-data.jp 有沒有 GTFS-JP 資料，沒有的話就從官網整理）。
- **JR 參宮線**（伊勢市～二見浦～鳥羽，T1 建議）：二見最近的車站是 JR 二見浦，近鐵沒有經過；存成 `data/timetables/jr/<station-id>.json`，格式沿用近鐵時刻表（需要 T7 加 schema 與驗證路徑，寫到 requests.md）。
- 存成 `data/timetables/bus/<route-id>.json`，並在 `passes.json` 註明 5 日券不含巴士、Plus 版的涵蓋範圍。
- **離島定期船**（鳥羽、志摩的資料裡已經有離島景點）：
  - 鳥羽市営定期船：佐田浜（鳥羽マリンターミナル）↔ 答志島（和具、答志）、桃取、菅島、神島。港口已經是資料點（`toba-port-*`）。
  - あご湾定期船：賢島 ↔ 間崎島（`shima-mazakijima`）等，經過的港口一併整理。
  - 存成 `data/timetables/ferry/<route-id>.json`，格式盡量和巴士一致；格式定好後，schema 與驗證路徑寫到 `docs/requests.md` 給 T7。
  - 記下票價（大人、小孩）、所需時間、冬季（2 月）的班次，以及長輩上下船要注意的地方（棧橋、階梯）。
  - 停航是即時資訊，不存；在檔案裡記官方的運航狀況頁連結，並註明 2 月季風強、神島線容易停航。
  - **遊覽船不算**（鳥羽湾めぐり、エスパーニャクルーズ等）：它們是景點本身，班次記在景點的營業時間就好。

### T11 地圖網站 v1 〔M〕
- **照 [interaction-design.md](interaction-design.md) 做**（§0、§1 版面、§3、§4、§7、§11）和 [architecture.md](architecture.md) §2。業界做法已經在那裡整理過；有不清楚或想改的地方，先和 👤 確認再動手。
- **先定 store 的形狀**（Zustand）：地圖範圍、選定的天、篩選、選取的點、規劃模式、目前打開的面板。T12 會在上面加動作 API，T15、T16 都用同一份。定好的形狀寫進 architecture.md §2。
- **手機優先**：先照手機做（全螢幕地圖＋可以拉起的面板），再放寬成電腦版（聊天室在左、地圖在右）。不做拖拉。在 iOS、Android 的 LINE 內建瀏覽器實測。
- 把 v0 改成正式介面：
  - 版面：聊天室的位置先留著（T16 才做）；「這一天」面板先留位置（T15）
  - 分類圖層、篩選（區域、類型、情境、分級）
  - 天數分頁：選一天時其他天變淡、不隱藏（行程資料來之前可以先用假資料）
  - 小卡片（電腦：滑鼠移上去；手機：點一下）；詳情面板（電腦：側邊；手機：拉起的面板），內容和順序照設計文件 §4，包括附近資料點和步行時間
  - **探索模式**：Pinterest 式圖片牆，照片大小依分級，只顯示目前地圖畫面裡的點，和地圖互相連動（§7）；代表照片用 `photos` 第一張（T21 會排好）
  - 一般地圖放大後，S、A 級顯示小張照片，其他只顯示小點
  - 車站面板：指定時間（例如行程裡的某個時間點）前後的班次（上下行）、外部查詢連結（Google Maps、Jorudan）
  - ❤️／👎、「寫建議」、「問 AI」的按鈕先放位置，功能在 T15、T16 接上
- **資料存取包在一層介面後面**（architecture §2）：T11 先用本機的實作（直接讀 `data/`），T15 再換成 API。UI 只看到合併後的資料點和「哪些欄位被改過」。
- **區域不寫死**（2026-10-22 👤 決定，為了之後加大阪這類新區域）：區域清單、名稱、子地區、地圖的初始範圍和各區範圍（`center`、`bbox`）、區域篩選的選項，一律從 `areas.json` 讀，程式裡不出現 `ise`、`toba` 這些區域 ID 的清單。新增一個區域時，網站只要重新 build 就會出現，不用改程式。
- **完成條件**：
  - 手機尺寸（約 390px 寬）和電腦尺寸都能完成：找到一個點 → 看小卡片 → 開詳情 → 關掉；切換天數；套用、取消篩選；切到探索模式，移動地圖時圖片牆跟著換。
  - 上面這些流程有 Playwright 測試（architecture §8）。
  - 在手機的 LINE 內建瀏覽器打開過（👤 協助），沒有版面跑掉或點不到的地方。**（2026-10-22 👤 決定：移到 T25，部署後和 LINE 登入一起實測；2026-10-26 部署拆到 T30，跟著移到 T30）**

### T12 地圖動作 API 〔S〕
- 在 T11 的 store 上定義一組地圖指令，**UI 和 AI 都透過它操作地圖**：
  - `focus(target)`、`highlight(ids, style)`、`drawRoute(from, to, mode)`、`compare(ids)`、`clearHighlights()`
  - 再加上：`selectDay(day)`、`setFilter(filter)`／`clearFilter()`（地圖上方要出現可以取消的篩選標籤）、`select(ids)`／`unselect(ids)`（「問 AI」選取的點，設計文件 §5）、`showProposal(itinerary)`（AI 提議的版本用虛線或半透明，見設計文件 §0）
- **畫面狀態**要能讀出來給 AI 當脈絡：目前地圖範圍、選定的天、篩選、選取的點、是不是規劃模式（設計文件 §5）。拉框選取先不做。
- 地圖依 store 的狀態重畫；使用者的操作和 AI 的指令改的是同一份狀態。
- **區域不寫死（接 T11）**（2026-10-22 👤 決定）：`packages/engine/src/types.ts` 的 `AREA_IDS` 寫死五個區域，改成區域 ID 是一般字串（`AreaId = string`），區域清單在執行時從 `areas.json` 讀；一併處理 `docs/requests.md` 的「[T24] packages/engine 的 AREA_IDS 寫死五個區域」並標成已處理，`packages/engine/test/index.test.ts` 跟著改。改 engine 要在 commit 訊息說明（T14 已完成）。
- **完成條件**：每個指令都有測試（呼叫後 store 的狀態正確）；用指令能重現 T11 的手動操作（切天數、篩選、聚焦），畫面一樣。

### T13 跨區整理與驗證 〔M〕
- 在三區的 g 任務（T7j、T8g、T9g）都做完後做（兩邊都會改 `assessment`）。
- 跨區去除重複；檢查資料點有沒有缺漏（例如某個車站附近沒有餐廳）。
- 看 T7i 的 `data/derived/kanko-mie-missing-ise.json`（伊勢、二見在觀光三重有、候選裡沒有的景點），決定要不要補；要補的列成清單給 👤，或另開任務補。
- 統一分級和標籤；列出「資料可信度低、需要人工確認」的清單給 👤 你。
- 和 👤 一起看 `docs/decisions-pending.md` 的「關西機場周邊（T19）」還沒打勾的項目（不屬於任何 g 任務），做法同 T7j 的「先和 👤 檢討」。
- 結果（2026-10-21）：[T13-review.md](T13-review.md)；檢查腳本 `scripts/cross-area-check.mjs`（報告 `data/derived/cross-area-check.md`）。

#### T13b 伊勢、二見：補景點 4 筆 〔S〕（Chrome）
- T13 和 👤 決定要補的（觀光三重列表、各區 README 提過的）：**伊勢古市參宮街道**（`ise`，外宮 → 內宮之間的舊參宮道、古市）、**角屋民具館・味噌溜り蔵資料館**（`ise`，神久）、**御塩殿神社**（`futami`）、**二見温泉 蘇民の湯**（`futami`，日歸溫泉）。
- 照 T8a 的做法（CONVENTIONS §4 標準作業流程步驟 1～3）：候選加進 `candidates/spots.json`、讀文 subagent 寫 `dossiers/<id>.md`、Google Maps 用 Chrome 查 cid、星數、照片；口コミ、Google 評論照「口コミ、Google 評論」補心得。
- 照 `data/raw/toba/assessment-notes.md` 伊勢、二見景點的門檻寫 `summary`、`assessment`、`tier`；重跑附近餐廳的 anchors（`restaurant-anchors.mjs ise`、`futami`）、`assessment-check.mjs`、`cross-area-check.mjs`。
- 在 T21 之前做（T21 要幫新的點挑代表照片）。寫 `data/areas/ise/`、`data/areas/futami/` 的 `spots.json`（anchors 會改 `restaurants.json`）、`data/raw/ise/`、`data/raw/futami/`。

### T14 行程引擎 〔M〕
- 純邏輯模組，不碰 UI，放在 `packages/engine`（T22 建立）；瀏覽器（T15）和 AI 工具（T16）共用同一份（[architecture.md](architecture.md) §1）：
  - **確定的行程**的資料格式（定好後寫進 CONVENTIONS.md）：只有一份，12 天，每天多個項目；一開始就放好**航班**當固定項目；項目記「誰提的」，可以有**時段備案**（主選、備選）和**分組**（設計文件 §6）。不做方案。建議、投票、使用者加的點分開存（architecture §3.6）。
  - **時間**：一律是日本時間的日期＋`HH:MM` 字串，不用 `Date`、不做時區換算（architecture §3.8）。
  - **行程的操作**：新增、刪除、移到別天、上移／下移、改停留時間、切換備案。T15 的手動選單和 T16 的 AI 提議都用同一組操作；套用前後都能跑檢查，也能算出「改了什麼」給 UI 顯示提議的摘要（設計文件 §0）。
  - **空檔**：時間軸上該吃飯、該到住宿卻沒排的時段，產生「午餐（未排）」之類的空格給 UI 和 AI 用；午餐、晚餐時段、最晚到住宿的時間等規則做成可以調整的設定（設計文件 §2）
  - 兩點之間：依規則選交通方式 → 計算時間（步行、時刻表、巴士）
  - 時間軸推算：抵達時間、停留時間、出發時間
  - 衝突檢查：公休、營業時間外、錯過末班車、班次間隔太長
  - **團體檢查**：餐廳坐不下 15 人、沒有預約；巴士班次少、15 人可能擠不上；計程車台數和費用
  - **分組**：支援某一段時間分成幾組（每組 4～6 人）各自行動，再約時間地點會合；每組可以有不同的行程
  - **長輩、小孩檢查**：連續步行太久、階梯太多、一天太滿、沒有休息時間時提出警告
- 使用者自己加的點只有座標：交通時間用估算，營業時間、團體條件標成「未查」，不做這些檢查。
- 已下架的點（[architecture.md](architecture.md) §3.4）還留在行程裡時，照樣能算，但要發出警告。
- 要寫測試。T7 一訂好規則就可以開始，不必等 T11。
- **完成條件**：每一種檢查、每一種操作都有測試；拿鳥羽一天的假行程跑得出時間軸、空檔和警告；格式已經寫進 CONVENTIONS.md。

### T15m 行程與建議 UI 原型 〔M〕
- **目的是先把 UI 定下來**：用假後端、假登入做出完整的畫面和操作流程，👤 用手機和電腦尺寸檢視，定案後 T15 再串接真的 API。
- 照 [interaction-design.md](interaction-design.md) 做（§3、§6、§9、§11）。**不做拖拉、方案、修改資料的表單**：這些交給 T16 的 AI。
- **這一天**面板：上面是確定的行程的時間軸（手機是直的清單，電腦放在地圖下方），和地圖連動；T14 產生的空檔顯示成可以點的空格；相鄰兩點之間顯示交通方式和時間；衝突用 ⚠️ 標示。下面是這一天的建議。
- 地圖上的行程：每天一個顏色、順序編號、路線；備選用空心標記；有建議的點加 💬 標記。
- **建議**：寫建議（哪一天或「整趟」、資料點、一段話）、改和刪自己的建議、看狀態。
- **規劃模式**：進入前確認、畫面上一直顯示、閒置自動退出；手動選單（刪除、移到第 _ 天、上移／下移）、切換時段備案；標建議的狀態（已採用／不採用＋一句話）；快照列表與復原；「待處理的建議」數量。
- **❤️／👎 投票**：每人對每個點按喜歡、不喜歡，可加一句備註；地圖、圖片牆顯示 ❤️ 數，可以篩選「大家喜歡的」（設計文件 §9）。
- **修改紀錄**：改過的欄位標「已修改（誰、何時）」，可以看紀錄、看原本的值，自己的修改可以復原（[architecture.md](architecture.md) §3.2）。修改本身由 T16 的 AI 做；原型用假資料放幾筆修改紀錄。
- 匯出行程的 JSON。
- 「需要預約」的項目要能列成清單，附上訂位方式和聯絡資訊。
- 分組行動不另外做（2026-10-27 👤，interaction-design §6）：分組和備案一樣用合併卡表示，卡上寫一句誰去哪家。
- **假後端**：
  - 確定的行程、快照、建議、投票、修改紀錄的讀寫包在一層介面後面（和 T11 的 `dataSource` 一樣的做法），先寫存在記憶體加 localStorage 的實作。介面的形狀照 T24 已有的 API（architecture §4「資料 API」、`worker/src/api/`），T15 只要換成呼叫 API 的實作。
  - `version` 號碼照 API 的規則遞增，「別人改過了，請重新整理」的畫面可以用 dev 選單假裝觸發。
  - 預設資料：用 `dev-fixtures/` 的假行程，再加幾筆不同人寫的建議和投票，畫面一打開就有東西看。
- **假登入**：dev 模式的角落放「切換使用者」的選單（例如 3～4 位家人），用來試「別人的建議看得到、刪不掉」、投票數、修改紀錄的「誰」。
- **假的東西只在 dev server 有**（同 `dev-fixtures/fakeItinerary.ts`），正式 build 不帶；dev 選單可以「重設假資料」。
- **可以拆成三個並行子任務**：T15m-a 這一天的時間軸、地圖上的行程路線；T15m-b 建議、規劃模式、手動選單、快照；T15m-c 投票、修改紀錄、需要預約的清單。
- **👤 檢視**：每個子任務做完，用 `npm run dev` 讓 👤 在瀏覽器切換手機、平板、電腦尺寸檢視；另外用 Playwright 對手機和電腦尺寸各截一組主要畫面的圖，放在 `data/cache/work/t15m/`（不進 git）方便對照。👤 確認的 UI 決定寫回 interaction-design.md。
- **完成條件**（Playwright，手機和電腦尺寸各跑一次，用假後端）：按 ❤️ → 想去分頁出現、留言 → 換人看得到、改不了別人的留言 → 加到某天 → 這天的候選 → 進入規劃模式按 ↑ 排進 → 時間軸出現、有交通時間 → 改停留時間 → 復原快照後回到原狀；👤 確認 UI 定案。（2026-10-24 建議改成想去分頁和這天的候選，設計見 `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md`；2026-10-25 第四輪拿掉緩衝、換住宿、併到…，改成拖曳合併，設計見 `docs/superpowers/specs/2026-10-25-itinerary-round4-design.md`）

### T15 行程與建議：串接 〔S〕
- **把 T15m 的假後端換成 T24、T25 的 API**：確定的行程、快照、投票、留言、候選、修改紀錄存在 D1；畫面的程式不改（要改的話，代表 T15m 的介面沒定好，回頭修介面）。
- **Worker 要跟上 T15m 改的形狀**（2026-10-24，architecture §3.6）：投票拿掉備註；建議（`suggestions` 和它的 API）換成留言（`comments`，對地點或某一天）和候選（`candidates`）；`sync` 改回傳 `votes`、`comments`、`candidates`。規則照 `web/src/backend/mock.ts`。
- **預約筆記和整趟留言也要接 worker 和 D1**（T15m 第三輪，architecture §2「預約筆記的假後端」）：`Reservation` API 形狀是列出全部（`GET`）加按 `(date, placeId)` 寫入一筆（`PUT`，整筆取代），欄位 `status`（`pending`／`booked`／`skip`）、`note`、`nights`、`updatedBy`、`updatedAt`（後者由 Worker 填）；住宿的 `date` 是入住那晚。D1 多一張 `reservations` 表（主鍵 `(date, place_id)`），`sync` 回傳 `reservations` 時間戳。整趟留言（`target` 為 `'trip'`，`TRIP_TARGET`）走原本的留言 API，Worker 要接受這個 target。規則照 `web/src/backend/mock.ts`。
- **行程格式的第四輪改動也要接到 Worker 的驗證**（T15m 第四輪，`packages/engine/src/types.ts`）：`TravelSpec.mode` 多了 `transit`（舊的 `train`、`bus`、`ferry`、`charter`、`car`、`other` 照樣合法）、`TravelSpec.trip`（選定的班次 `TripRef`，可以省略或 `null`）；`bufferMinutes` 拿掉了，舊資料留著也不能報錯。Worker 存行程時的驗證要照 `validateItinerary` 收這些欄位。
- 假登入換成 T25 的 LINE 登入；同時編輯用 `version` 號碼偵測；同步照 architecture §3.8。
- 用兩個真的帳號試一次同時編輯、同步。
- **完成條件**（Playwright，手機和電腦尺寸各跑一次，用本機的 Worker 和 D1）：同 T15m 的流程，但「別人」是另一個登入的帳號；重新整理後資料還在。

### T16m AI Agent UI 原型 〔M〕
- **目的是先把對話的 UI 和流程定下來**：用寫好的對話腳本代替 Claude API，工具和畫面都是真的；👤 檢視、定案後 T16 再接上 Claude API。
- **AI 是主要的操作方式**（[interaction-design.md](interaction-design.md) §0、§2、§4、§5、§8、§11）。**只做規劃行程用**：旅途中的臨時查詢交給 Claude app（見 §1「網站的範圍」），這裡不做。
- 對話介面：手機在拉起的面板裡，電腦在左邊；輸入框用一般的文字輸入，語音靠手機鍵盤的麥克風；回答附快速選項按鈕；回覆裡的地點名稱是可以點的標籤，點了（或滑鼠移過去）地圖上的點會閃。
- **兩種模式**：
  - **一般模式**：幫忙找地點、篩選、比較；把使用者的話整理成**建議的草稿**（哪一天、資料點、一段話，理由要寫進去），使用者按「送出」；資料點修改的提議（例如「這家週三公休」），使用者確認後寫進修改層；自己加地點（解析 Google Maps 連結或地址，拖圖釘確認）。
  - **規劃模式**：讀那幾天的建議和投票，照引導順序（骨架 → 景點 → 住宿 → 餐廳）提議行程的修改；用 `showProposal` 在地圖上畫出提議，聊天室附文字摘要和「採用／修改」，按了才用 T14 的操作寫進行程（先存快照）；看到 T14 的空檔和警告就主動問。
- **2026-10-24 建議改成想去清單**（T15m）：下面的「建議的草稿」「`draft_suggestion`」「`set_suggestion_status`」改成幫忙按 ❤️、留言、加到某天的候選；規劃模式的提議先讀這天的候選和這天的留言（`lib/wishlist.ts`）。沒有地點的願望（例如「想吃一次伊勢龍蝦」）是在聊天室對 AI 說。設計見 `docs/superpowers/specs/2026-10-24-wishlist-planning-design.md`。
- **脈絡**：每次對話帶上 T12 的畫面狀態（地圖範圍、選定的天、篩選、選取的點、模式）、目前的建議和投票。
- 交通的回答附上 Google Maps 路線連結（§1），實際班次讓使用者在 app 上確認。
- 工具在瀏覽器執行（architecture §6），**原型就寫真的工具**，只有「決定要呼叫哪個工具、回什麼話」的模型是假的：
  - 查資料：`search_places`（中文名、日文名、別名模糊搜尋；類型、區域、條件篩選）、`get_place`、`get_timetable`
  - 地圖：T12 的地圖指令
  - 一般模式：`draft_suggestion`、`propose_place_edit`、`propose_user_place`
  - 規劃模式：`propose_itinerary_change`（用 T14 的操作，套用前跑檢查）、`set_suggestion_status`
  - 寫入的部分（建議、修改、行程）走 T15m 的假後端。
- **假 AI**：模型包在一層介面後面，輸入是對話和脈絡，輸出是文字、工具呼叫、快速選項，格式照 Claude API 的 messages（含 tool use），T16 換成真的 API 時畫面和工具不改。先寫好幾段對話腳本，用關鍵字對應，至少涵蓋：
  - 一般模式：找地點（回覆帶可以點的地點標籤）、「這家週三公休」→ 修改提議 → 確認、說一句話 → 建議草稿 → 送出、貼 Google Maps 連結加地點。
  - 規劃模式：「排第 3 天」→ `showProposal` 畫虛線、摘要、「採用／修改」→ 採用 → 時間軸更新、有快照；看到空檔和警告主動問。
  - 狀態：AI 思考中（假裝延遲幾秒、逐字顯示）、出錯、超過每天上限的提示。
  - 對不到腳本時回「原型只能回答這幾種問題」，列出可以試的句子。
- **聊天紀錄**：原型存在 localStorage，只有自己（假登入的那個人）看得到。
- **假的東西只在 dev server 有**，正式 build 不帶。
- 規劃模式的提議要畫在 T15m-a 的時間軸上：和 T15m 並行時先講好介面，最後整合。
- **👤 檢視**：同 T15m，手機和電腦尺寸各截一組圖，放在 `data/cache/work/t16m/`；👤 確認的 UI 決定寫回 interaction-design.md。
- **完成條件**（Playwright，手機和電腦尺寸各跑一次，用假 AI）：一般模式「說一句話 → 產生建議草稿 → 送出」；規劃模式「請 AI 排第 3 天 → 地圖出現虛線提議和摘要 → 採用 → 時間軸更新、有快照」；一般模式下 AI 改不到行程；超過每天上限時有明確的提示；👤 確認 UI 定案。

### T16 AI Agent：串接 〔M〕
- **把 T16m 的假 AI 換成 Claude API 的 tool use**；畫面和工具不改。
- API key 不可以放在前端。Worker 只負責轉發並加上 API key（`POST /api/claude/messages`，T25 沒做，在這裡做）；只有登入的人能用，依使用者設每天的用量上限。開工時先估算 15 人使用的費用，再定上限和模型（[architecture.md](architecture.md) §6）。
- **系統提示詞和工具說明**：用 T16m 的對話腳本當測試案例，調到真的模型在這些情境下會呼叫對的工具。
- **脈絡**、交通的路線連結、兩種模式的限制照 T16m 的說明，這裡確認真的模型做得到。
- **聊天紀錄**改存 D1（`/api/chats`），只有自己看得到。
- **簡單版的替代方案**：先不做聊天介面，直接把 `data/` 給 Claude 看，請它輸出行程 JSON，再匯入網站。
- **完成條件**：同 T16m 的流程，但用真的 Claude API 和登入的帳號；超過每天上限時有明確的提示（用 Worker 的真實計數）。

### T21 代表照片 〔M〕
- 給 T11 的探索模式、小卡片用（[interaction-design.md](interaction-design.md) §7）。
- 每個資料點（約 500 個）從現有的 `photos` 裡挑一張最能代表它的，**排到第一張**；不改 schema，介面一律用第一張當代表。
- 要看過圖再挑：照片下載到 `data/cache/work/t21-<批>/`（不進 git），Claude Code 讀圖判斷。景點選外觀或代表性景色，餐廳選招牌菜或店面，住宿選外觀、房間或料理中最吸引人的。
- 優先選官網、楽天、Wikimedia 的照片；`googleusercontent` 的網址可能過期，除非沒有別的選擇，不當代表。先跑 `scripts/photo-check.mjs`，打不開的不選。
- 現有照片都不合適的列成清單給 👤，不另外找圖。
- 會改各區的三個資料檔：等 T13 做完再做，不和同區的深入調查（T7j、T8g、T9g）同時做。`log/T21.md` 記每筆選了哪張、為什麼。

### T20 匯出給 Claude app 〔S〕
- **行程規劃完以後才做**：要匯出哪些資料、做成什麼格式，等行程定案後再具體決定，工作量也到時候再估。
- 目的（§1「網站的範圍」）：把最終行程、分組和 `data/` 的資料整理成 claude.ai Project 能用的檔案，讓旅途中的 Claude app 優先用我們篩過的清單，並考慮人數和座位條件。
- 交通附 Google Maps 路線連結（格式見 §1），實際班次在 app 上確認。
- 資料點從 D1 匯出**合併後的版本**（預設資料加使用者的修改），不是 git 裡的 JSON。

### T22 monorepo 調整 〔S〕
- 照 [architecture.md](architecture.md) §1 改成 npm workspaces：根目錄的 `package.json` 管 workspaces，建立 `packages/engine`（先放空殼和型別定義）、`worker/`（先放空殼）；`web/`、`scripts/` 移進 workspaces，但檔案位置不變。
- 決定共用的型別放在 `packages/engine` 還是另一個 `packages/types`，寫回 architecture.md。
- 現有的指令（`npm run validate`、`npm test`、`web` 的 `dev`／`build`）都要照常能跑；worktree 的安裝步驟（§3「多個 session 同時執行的方式」）改成在根目錄跑一次 `npm install`。
- 更新 CLAUDE.md、CONVENTIONS.md §1 目錄結構、`web/README.md` 裡的指令。
- 不碰 `data/`，可以和 T13 同時做。

### T23 👤 LINE 登入小實驗 〔S〕
- 目的：確認 [architecture.md](architecture.md) §5 的做法可行。👤 要做的事：在 LINE Developers 開 provider 和兩個 channel（LINE Login、Messaging API），把機器人邀進家人群組（或先用一個測試群組）。
- 👤 在 LINE Developers 的設定細節：
  - Messaging API channel 要先在 LINE Official Account Manager 建免費官方帳號，再啟用 Messaging API，選同一個 provider（選了不能改）。
  - 官方帳號打開「允許加入群組」，關掉自動回應和歡迎訊息，Webhook 設成啟用。
  - 發一個 long-lived 的 channel access token。
  - LINE Login channel 選 Web app。
- 用一個臨時的 Worker（或 `wrangler dev` 加上通道）接 LINE 的通知，記下群組 ID。通道用 ngrok 的固定網域（`@ngrok/ngrok`，見 [architecture.md](architecture.md) §4「本機接 LINE」）；實驗用的 secret 也放在 `data/cache/work/t23/`。
- 用**免費的官方帳號**呼叫 `GET /v2/bot/group/{groupId}/member/{userId}`，測這幾種人：群組成員、沒加機器人好友的群組成員、不在群組的人。預期依序是 200、200、404。
- 在 iOS、Android 的 LINE 內建瀏覽器試 LINE 登入，確認點一下就能登入；也試試 channel 還在「開發中」時，非測試人員會看到什麼。
- 結果寫回 architecture.md §5「要注意的地方」。群組檢查行不通的話，改用「LINE 登入＋白名單核准」（§5「備案」），和 👤 確認後更新 T25。
- 實驗用的程式不進 `worker/`，放在 `data/cache/work/t23/` 或另外的分支，做完刪掉。

### T24 資料庫與匯入 〔M〕
- 照 [architecture.md](architecture.md) §3 做：
  - D1 的資料表（§3.3）和 migration。
  - **匯入腳本**（`scripts/` 或 `worker/` 底下，由 T24 決定）：驗證 → 比對出報告（新增、更新、三方比對的衝突、下架）→ 👤 確認 → 正式匯入，記在 `imports`。可以只匯入一個區域。先在本機的 D1 跑。
  - 訂出 `data/redirects.json` 的格式，schema 和驗證路徑寫到 `docs/requests.md`。
  - Worker 的資料 API：預設資料、修改（新增、復原、紀錄）、自己加的點、確定的行程、快照、建議、投票、聊天紀錄（§4 API 草稿）；「只有本人能刪」由 Worker 檢查。修改先合併再用 `schema/` 驗證（ajv standalone）。
  - 時刻表等靜態資料的 build 腳本（§3.7）：時刻表照車站拆開。
- **區域不寫死**（2026-10-22 👤 決定，為了之後加大阪這類新區域）：匯入的對象、可以指定的區域，從 `areas.json`（和 `data/areas/` 底下的目錄）讀，不寫死五個區域 ID。新增區域時，資料放進 `data/areas/<新區域>/`、`areas.json` 加上這一區，驗證通過就能匯入（全部是新 ID，只會新增），不用改匯入腳本或 Worker。
  - `scripts/validate.mjs` 現在也寫死了：檔案路徑的規則（`areas/(ise|futami|toba|shima|kix)/…`、`raw/(…)/candidates/…`）和座標範圍（伊勢志摩，只有 `kix` 放寬到關西、中部）。T24 匯入的第一步就是跑 validate，所以一併改成讀 `areas.json`：區域 ID 從 `areas.json` 來，座標檢查用各區的 `bbox`（或在 `areas.json` 加一個「檢查用的大範圍」欄位；要改 schema 的話寫到 `docs/requests.md`）。改別人的腳本要在 commit 訊息說明、補測試。
  - 測試裡放一個假的新區域（例如 `test-area`），確認 validate、匯入都不用改程式就能處理。
- 登入在 T25 做；T24 先用開發用的固定身分。
- 要寫測試：合併規則、三方比對、下架、轉址。
- 會在 T21 之後再匯入一次（照片順序變了），確認重跑沒有問題。

### T25 Worker：登入 〔M〕
- **2026-10-26 👤 決定：部署拆到 T30**。T25 做到本機可以完整跑：`npm run dev:tunnel` 用真的 LINE 登入、群組檢查、管理頁。
- 照 [architecture.md](architecture.md) §4、§5 做：
  - LINE 登入（OAuth、驗證 ID token）、群組成員檢查、白名單、登入憑證（HttpOnly cookie）、`GET /api/me`。
  - LINE 的通知：驗證簽章，記下群組 ID、成員加入、退出。
  - 除了登入和 LINE 的通知，所有 API 都要先登入。
  - ~~Claude API 代理~~：留到 T16。
  - 部署的設定（`wrangler.jsonc` 的 `assets`、`npm run build:site`、`deploy`、匯入的 `--remote`）先做好，實際部署在 T30。
  - 白名單用的簡單管理頁（只有 👤 能看）。
- LINE 的設定需要 👤：LINE channel 的 secret、ngrok 帳號（固定網域）。
- **本機開發用 ngrok 通道**（2026-10-23 👤 決定，見 [architecture.md](architecture.md) §4「本機接 LINE」「設定值和 secret」）：
  - 加 `npm run dev:tunnel`：啟動 `wrangler dev`，用 `@ngrok/ngrok` 開固定網域的通道，在 terminal 印出要貼到 LINE Developers 的 Webhook URL、Callback URL。
  - `PUBLIC_BASE_URL` 用來組 `redirect_uri`（`dev:tunnel` 自動帶 ngrok 的網址）。
  - 本機的值放在 `worker/.env`，附一個 `worker/.env.example`（只有名稱、沒有值）。正式環境用 `wrangler secret put`。
  - `DEV_AUTH` 從 `wrangler.jsonc` 拿掉：只有 `dev:worker` 傳 `"1"`，而且只認 localhost 的請求。
  - 變數名稱定案後更新 architecture §4 的表。
- 在手機的 LINE 裡實際登入一次（🌐 少量：電腦上的流程可以用 Chrome 看）。2026-10-26 用 `dev:tunnel` 實測：👤 用 iPhone 登入（管理員）、在管理頁核准測試群組，都正常。
- LINE 內建瀏覽器的版面實測移到 T30（要用正式網址）。

### T30 👤 部署到 Cloudflare 〔S〕
- **什麼時候做**：👤 確定預設資料和 schema 之後、邀請家人之前（2026-10-26 👤 決定）。第一次正式匯入之後 ID 不改名（[architecture.md](architecture.md) §3.5）；在那之前，正式環境的 D1 可以清空重建。
- 步驟照 [architecture.md](architecture.md) §4「部署（T30）」：
  1. 👤 註冊 Cloudflare（免費方案）、`npx wrangler login`；第一次用 Workers 要選帳號的子網域。
  2. `npx wrangler d1 create travel-helper`，把 ID 填進 `worker/wrangler.jsonc` 的 `database_id`；`npm run db:migrate:remote`。
  3. `npm run deploy`（`build:site` 加 `wrangler deploy`），拿到正式網址 `https://travel-helper.<子網域>.workers.dev`。
  4. secret：LINE 的四個值、`ADMIN_LINE_USER_IDS` 和本機一樣；`SESSION_SECRET` 另外產生一組（不和本機共用）；`PUBLIC_BASE_URL` 是正式網址。用 `wrangler secret put`，不寫進檔案。
  5. 正式環境第一次匯入：`npm run db:import -- --all --remote` 出報告，👤 看過再 `--apply … --remote`。
  6. 👤 在 LINE Developers：Messaging API 的 Webhook URL 改成正式網址（只能填一個，之後本機的 `dev:tunnel` 就收不到通知）；LINE Login 的 Callback URL 加上正式網址（可以填多個，ngrok 的留著）。
  7. 機器人已經在群組裡的話，在群組講一句話，正式環境才會記下這個群組；👤 在正式的 `/admin` 核准。
- **決定群組裡貼的網址**：要不要加 `?openExternalBrowser=1`（用手機的預設瀏覽器打開，architecture §5「要注意的地方」），和 👤 一起試過再決定。
- **LINE 內建瀏覽器實測（接 T11）**（2026-10-22 👤 決定）：登入時一併看地圖網站在 iOS、Android 的 LINE 內建瀏覽器有沒有版面跑掉或點不到的地方（天數分頁左右滑、拉起面板的把手、小卡片→詳情、iPhone 下緣的安全區域、外站照片能不能顯示）；Android 的 LINE 登入也一起測（T23 只測了 iPhone）。結果寫進 T30 的回報；有問題的另開任務修。
- 完成條件：正式網址用 LINE 登入成功（iOS、Android）；不在群組的人被擋下、出現在管理頁的「等待核准」；`wrangler tail` 看得到 webhook 的通知；正式環境的 D1 有匯入紀錄。

### T26 👤 Places 照片備案 〔M〕
- 目的：主照片打不開、或想在詳情多看幾張照片時，用 Places API (New) 即時取得 Google Maps 上的照片。**照片代號和照片網址都不存**（Google 條款只允許長期保存 place ID），每次用到才查。
- **做不到的**：API 回傳的照片沒有分類，分不出食物、菜單；每個地點最多 10 張。所以不拿來看菜單，菜單照舊用 `menu` 連結（CONVENTIONS §4「菜單」）。
- 👤 要做的事：
  - 開 GCP 專案、綁帳單帳戶、啟用 Places API (New)；API key 限制只能用 Places API。
  - 在 GCP 設預算警示和每日用量上限。
- 動工前先查最新的計價和每月免費額度（Place Details 只取 `photos`、Place Photo、Text Search），寫進 architecture.md，附來源和取得日期。
- **資料點對應 place ID**（一次性腳本，可以重跑）：
  - 現在 518 個資料點的 `links.googleMaps` 是 `?cid=…` 網址，沒有 place ID；Places API 不收 cid。
  - 每個點用 Text Search 搜店名、限定在資料點座標附近，拿回的 `googleMapsUri` 裡的 cid 和我們的一樣才算對到；對不上或找到多個的列給 👤。
  - place ID 存在哪個欄位由本任務決定；要改 schema 的話照 CONVENTIONS 的規則提出。之後查照片回 NOT_FOUND 時重新搜尋（place ID 偶爾會變）。
- **Worker**：
  - `GET /api/places/photos?point=<資料點 ID>`（要先登入）：用 Place Details（field mask 只有 `photos`）拿照片代號，再取每張的短期網址，連同上傳者名字回傳。
  - API key 存成 Worker secret（名稱由本任務定，更新 architecture §4 的表）；key 不出現在網頁上。
  - 每人每天的次數上限（同 T25 的 Claude API 用量上限）；不把照片代號、網址寫進 D1。
- **介面**（詳情的照片區）：
  - 使用者往下捲到照片區底部時才查，不在打開網站或打開詳情時就查。
  - 主照片載入失敗時，改用 Places 的第一張。
  - 照 Google 的規定顯示上傳者名字等標示。
- 要寫測試：cid 比對、place ID 對應的結果分類（對到、對不上、多個）、Worker 的登入檢查和次數上限、照片區只在捲到時才查。
- 完成條件：對應報告交給 👤 看過；手機尺寸實測「捲到才查」和「主照片失效改用 Places」；一天的用量在免費額度內（附估算）。

### T27a～T27d 大阪
- 區域 `osaka`，最後 1～2 天（2026-10-26 👤 決定）。最後一晚住大阪或關西機場周邊（`kix`）由使用者排行程時選，兩區的資料都保留，不互相取代。
- **照 CONVENTIONS §4「大阪（都市區）的做法」**：它列出標準作業流程裡哪些步驟在大阪不做、哪些改了。其他照標準作業流程、讀文與筆記、§5 的規則。
- **手動執行**（不進指揮 session），每個任務用自己的 worktree；要 👤 決定的當場問。開工先讀 `data/raw/osaka/README.md`（T27a 建立）。
- 工具沿用（T19 已經把 `jalan.mjs`、`lib/tabelog-list.mjs`、`restaurant-anchors.mjs` 改成不限三重）；照舊不在 scratchpad 重寫。

#### T27a 👤 子地區與景點 〔S〕（Chrome）
- **`areas.json` 加區域 `osaka`**（例外允許，見 CONVENTIONS §2）：`name`、`municipality`、`definition`、`tripOrder`（排在伊勢之後，和 `kix` 同一個數字或下一個，由本任務決定）、`center`、`bbox`（大阪市＋USJ 一帶，只用來檢查座標）、`stations`（T28 新增的車站，T28 還沒完成就先留空、T28 補）。
- **子地區**，預定（👤 確認、增減）：
  - **難波・道頓堀**（含心齋橋、日本橋、上本町；住宿的據點，近鐵、南海都到）
  - **大阪城**
  - **天王寺・新世界**
  - **海遊館・天保山**
  - **ユニバーサルシティ（USJ）**
  - **梅田**（可選）
- **景點 10～15 筆**：來源用大阪觀光局（OSAKA-INFO）、各設施官網、Google 星數和評論數；不跑觀光三重的腳本（不適用）。照標準作業流程步驟 1～3：讀文 subagent 讀官網（營業、票價含兒童和團體、電梯、園內或館內步行、2 月營業），Chrome 查 Google Maps；景點不讀口コミ、Google 評論（大阪的景點資料多，筆記心得不到 2 篇的例外）。
- **USJ** 是一筆景點，另外記：
  - 票價依日期變動：2027 年 2 月的價格月曆還沒公布的話，記查得到的最近一個同期（或同星期幾）價格當參考，`fares` 的 note 寫查詢日期和「出發前要再查」。
  - 身高限制：哪些設施 6～10 歲（約 115～140 cm）可以玩、哪些不行，記在 `kids.note` 或筆記。
  - 長輩：輪椅、代步車出租，休息處；園內步行時間記在 `stayMinutes` 的 note。
  - 快速通關（Express Pass）的價格範圍、要不要事先買；入場人數多的日子（2/11 國定假日）。
  - 園內餐廳不另外收進 `restaurants.json`。
- 子地區、景點清單定案前先和 👤 確認（T8a、T9a 的做法）。
- 寫 `areas.json`（`osaka` 這一筆）、`data/areas/osaka/spots.json`、`data/raw/osaka/`（README、candidates、dossiers、questions、log）。
- **完成（2026-10-26）**：子地區 6 個（含梅田，👤 完整收）、景點 14 筆；Google 評論不讀（👤）。`nearestStation` 先填 null（T28 的車站還沒進 master），預定 ID 在 `data/raw/osaka/log/T27a.md`，T28 先 merge 由 T27a、否則由 T27d 補。

#### T27b 住宿 〔S〕（Chrome）
- 照 T19 的做法（`data/raw/kix/log/T19.md`）：`scripts/rakuten.mjs` 用子地區中心查候選、`party` 查 15 人的房型組合、`detail` 拿細項評分和照片。
  - **範圍**：難波一帶 10～15 間（含上本町、日本橋、心齋橋）；USJ 周邊 3～5 間（官方合作飯店多有 4～6 人的家庭房，適合排 USJ 那天）。
  - **日期**：查 **2027-02-11（四，國定假日；隔天是平日，平日價）** 和 **2027-02-12（五，隔天是週六，休前日價）**，當成價格的代表，不查每一晚。
  - **組合**：城市飯店大多是 2 人房，要查 `8x2`（`--combos 8x2 --party 16`），另外照常查 `5x3`、`4x4`、`3x5`。
- 包棟（一棟住 15 人）另外找 3～5 間：照 §5.7 沒有評分的不排除、標「無評分」；只收有合法登記（旅館業或民泊的届出番号）寫在頁面上的。
- 不跑じゃらん。Google 星數和評論數用 Chrome 的 `google-place.js`，而且**先跑 Google、拿到官網網址再開讀文 subagent**（T19 的建議）。
- 讀口コミ、Google 評論：只讀 `party` 有 15 人組合、或包棟的那幾間。
- 每間都要算 `dinnerAccess`（城市飯店大多不含晚餐），T27c 收完餐廳後由 T27d 重算。
- 寫 `data/areas/osaka/lodging.json`、`data/raw/osaka/`。
- **完成（2026-10-26）**：住宿 23 筆（難波 13、梅田 4、USJ 5、包棟 1；👤 梅田收 3～5、大阪城・天王寺・海遊館不收）。包棟只有此花區的四貫島戸建て有登記番號（今昔荘 道頓堀、CREWSO 等沒有番號，👤 不收）。`nearestStation` 用 T28 的車站（OSRM）；`dinnerAccess` 因為還沒有餐廳維持 null，T27d 重算。過程在 `data/raw/osaka/log/T27b.md`。

#### T27c 餐廳 〔M〕（Chrome）
- **候選和詳細資料一起做**（店少，不拆成兩個任務）。照 CONVENTIONS §4「大阪（都市區）的做法」的納入標準，目標 **30～40 家**：
  - **全員用（能坐 15 人、能訂位）8～10 家**，集中在難波（住宿的據點），其他子地區各 1～2 家：食べログ列表用個室、貸切篩選（T19 的 `tabelog-list.js` 做法），候選的 `note` 抄個室、貸切的人數。
  - **分組用（4～6 人）每個子地區 3～5 家**：大阪名物（たこ焼き、お好み焼き、串カツ）和平價的店，不用預約的優先。
  - USJ 子地區不收（園內吃）。
- 照標準作業流程步驟 8 查食べログ、Google Maps（`candidates.mjs export` → `chrome-actions.mjs` → `build-restaurants.mjs`）；fit15 是 yes 或 split 的店看コース頁記團體套餐。
- 讀口コミ、Google 評論只讀 fit15 是 yes 或 split 的店（T8e 的做法）。
- 讀文 subagent 照舊（來源少的 3 家合一個）。
- 寫 `data/areas/osaka/restaurants.json`、`data/raw/osaka/`。
- **完成（2026-10-26）**：餐廳 41 筆（G 18、S 23；namba 15、osaka-castle 7、tennoji 7、osaka-bay 5、umeda 7），候選 338 筆。👤 決定：`inclusion` 的 schema 加 G、S（T27c 改 schema、重產 validators）；S 的名物＝食べログ類別第一項、平價＝昼 1,999 円以下、同類每區最多 2 家（寫進 CONVENTIONS §4 大阪、`restaurant-candidates.mjs` 的 `scheme: osaka`）。列表用口コミ人数順。`anchors`、評分留給 T27d。過程在 `data/raw/osaka/log/T27c.md`。

#### T27d 收尾、摘要與評分、匯入 〔S〕
- `restaurant-anchors.mjs osaka`、`lodging-dinner-access.mjs`；不跑 `restaurant-gaps.mjs`（大阪不做缺漏檢查）。
- **評分**：先在 `data/raw/toba/assessment-notes.md` 加「大阪」一節，**打分前**訂好這一區的數字門檻（試算 A 以上的比例，照「依區調整」），再照 §5.1 和各區共用的補充寫 `summary`、`assessment`、`tier`（三個類型各一批）。`localFlavor` 的「在地」換成大阪名物（見 CONVENTIONS）。跑 `assessment-check.mjs osaka`、`cross-area-check.mjs`。
- **代表照片**：照 CONVENTIONS §4「大阪」的來源順序自動排第一張，`photo-check.mjs` 打不開的往後排；不逐張看圖。
- validate 通過後，用 T24 的匯入腳本匯入 `osaka`（全部是新 ID，只會新增），重新 build 網站確認地圖上出現。
- 更新 `data/raw/osaka/README.md`（現況、決定、給排行程的人看的限制）。
- **完成（2026-10-26）**：景點 nearestStation（OSRM）、餐廳 anchors、住宿 dinnerAccess（USJ 5 間 car，👤 維持）。評分門檻（👤）：景點 5＝Google 4.5／5 萬則、4＝4.4／2 萬則（A 以上 29%）；住宿照伊勢調整版、承認 30%；餐廳 5 改成只看數字（食べログ 3.70／1,000＋Google 4.2／1,000），A 以上 24%，負評往下調 11 家。`cross-area-check.mjs` 加 osaka；景點 tags 改固定清單。代表照片 78 筆都不用換。本機 D1 匯入 osaka 109 筆、build 後地圖有大阪。過程在 `data/raw/osaka/log/T27d.md`。

### T28 大阪交通 〔M〕
- **近鐵 大阪 ↔ 伊勢志摩**：把大阪難波、大阪上本町、鶴橋（ID `osaka-namba`、`osaka-uehommachi`、`tsuruhashi`，`passes.json` 已經用 `osaka-namba`）加進 `stations.json`，往返大阪的特急加進 `data/timetables/kintetsu/_travel-times.json`（格式不變，只收往返大阪的特急；大阪側的停站加進各班的 `stops`、`stationOrder`），兩個方向都要：
  - **北上**（伊勢市、宇治山田、五十鈴川、鳥羽 → 大阪）：行程最後回大阪，2/9～2/13 平日、假日都要有。
  - **南下**（大阪 → 鳥羽、志摩磯部、鵜方、賢島）：第一天從關西機場直接南下到志摩。2/2 是週二，收平日時刻。T1b 已經在 `data/access/kix.json` 手動列了 2/2 的 6 班（大阪難波 14:10～19:10 發），加進來後要對照，`trainNo` 要一致。來源和做法參考 `data/raw/access/kintetsu-osaka.md`（T1b 已經查過一部分），一併處理 `docs/requests.md`「[T1b] stations.json：大阪側轉乘站的無障礙資訊」。
- **市區路線用班距表示**（格式見 CONVENTIONS §3「班距型路線」），不存完整時刻表：
  - 預定的路線（照 T27a 的子地區增減）：Osaka Metro 御堂筋線、中央線、長堀鶴見緑地線（大阪城）、堺筋線（日本橋、天王寺）；JR 大阪環状線、ゆめ咲線（USJ）；南海（なんば ↔ 関西空港，和 `data/access/kix.json` 對照）；近鐵 難波線（大阪難波 ↔ 上本町 ↔ 鶴橋）。海遊館用地鐵中央線（大阪港）。
  - 每條線記：站與站的所需分鐘、尖峰和離峰的班距、首班和末班車、大人和兒童票價、5 日券涵蓋哪一段。
  - 先看 gtfs-data.jp、公共交通オープンデータセンター（ODPT）有沒有 Osaka Metro、JR 西日本、南海的開放資料，有的話用它算所需分鐘和班距（不存完整的 trips）；沒有就讀官網。照 robots.txt，被擋就停。
- **轉乘**（大阪最影響長輩的部分）：難波（近鐵、南海、地鐵）、鶴橋（近鐵、JR）、天王寺、梅田、大阪城公園、西九条（JR 環状線 ↔ ゆめ咲線）這幾站，記站內轉乘的步行分鐘、有電梯的路線和出口、行李多時的走法，格式見 CONVENTIONS §3「轉乘」。
- **票券比較**：Osaka Metro 的一日券（エンジョイエコカード 等）、大阪周遊パス 對 15 人（大人、兒童）划不划算，寫在 `data/raw/access/osaka.md`；計程車照 CONVENTIONS「團體（15 人）」記台數和估價規則（初乘、加算），不另外查包車。
- **車站**加進 `stations.json`（例外允許，見 CONVENTIONS §2），ID 規則見 CONVENTIONS §1.5；`accessibility` 記電梯、無障礙廁所。
- 要改 schema（班距型路線、轉乘）、validate 的路徑時，本任務直接改（例外允許），補測試、在 commit 訊息說明。
- 寫 `data/stations.json`（大阪的車站）、`data/timetables/kintetsu/_travel-times.json`（大阪的特急）、`data/timetables/urban/`、`data/raw/access/osaka.md`、`schema/`（新格式）、`scripts/validate.mjs`。
- **完成（2026-10-26）**：結果和沒查到的見 `data/raw/access/osaka.md`。gtfs-data.jp、ODPT 都沒有大阪的鐵道資料，全部讀官網。班距型路線 10 條（Osaka Metro 5 線含谷町線、JR 環状線・ゆめ咲線、南海空港急行・ラピート、近鐵難波線市區段），轉乘 22 筆，大阪車站 31 站。格式：`schema/urban-route.schema.json`、`urban-transfers.schema.json`（CONVENTIONS §3）。近鐵特急的大阪側停站用 `scripts/kintetsu-osaka.mjs` 補（T1 的腳本重跑後要再跑）。給 T29：環狀線 `stops` 是内回り順、`loopMin` 45；Osaka Metro 站內換線的 `walkMin` 多是 null（要有預設值）；南海空港急行的 `holiday` 整段 null。

### T29 engine：大眾運輸改用 RAPTOR 〔M〕
- 設計見 [specs/2026-10-26-transit-raptor-design.md](superpowers/specs/2026-10-26-transit-raptor-design.md)（2026-10-26 和 👤 討論：選走法、不選班次；近鐵特急到車站才買）。先讀 [architecture.md](architecture.md)。
- `packages/engine`：RAPTOR 涵蓋近鐵、巴士、船、JR 和 `data/timetables/urban/` 的班距型路線、轉乘步行；等車＝班距的一半（全員取整個班距）；首班前、末班後不能搭。`Leg` 只加欄位（`alternatives`、`transfers`、班距型那一程的班距和首末班、每一程的 `ifMissed`），現在的畫面照常能用；`TravelSpec.path` 記走法。過渡期保留舊的選班次（`trip`）路徑，T29b 拿掉。
- 讀檔：`scripts/build-static.mjs`、`web/src/data/local.ts` 等載入 `routes` 的地方加上 `urban/`（只動資料載入，不動元件；改別人的程式要在 commit 訊息說明）。
- 測試：等車和轉乘的計算、首末班、全員和分組的係數差別、伊勢 → 大阪難波 → 住宿、第一天南下（なんば → 近鐵大阪難波 步行轉乘 → 鵜方，和 `data/access/kix.json` 的 16:10 → 18:35 一致）、大阪一天的假行程（難波 → 大阪城 → 天王寺 → 難波）；現有測試和 `perf.test.ts` 照樣通過。
- 完成條件：`npm test`、`npm run typecheck`、`npm run validate` 通過。

### T29b 重算速度、拿掉選班次 〔S〕
- 設計見 [specs/2026-10-26-transit-raptor-design.md](superpowers/specs/2026-10-26-transit-raptor-design.md) §7（2026-10-28 和 👤 討論：畫面拆成 T29c，T29b 只做畫面以外的）。先讀 [architecture.md](architecture.md)。
- **快取（T29 最終審查留下的）**：`web/src/planStore.ts` 的 `buildEngineData` 每次重算都新建 `stations` 陣列，引擎的網路、搜尋快取全部失效，11 天的行程約 0.7 秒（舊版約 0.05 秒）。照 `d.places` 存起來重用，`EngineData` 能重用就重用。
- **只重算有改的那一天**：用內容比對（那一天的內容＋前一天的住宿＋`party`），不改 `ops.ts`。動資料卡算一天，動住宿算當天和隔天；跨天的警告照舊。引擎提供可選的快取物件，不傳就照舊整份算。道路快取有新值時，結果要和整份重算一樣。
- **測試**：用快取和整份重算的結果一模一樣（移卡、改住宿、改 `start`、改 `party`、換資料、道路快取有新值）；用網站的方式（每次新的 `EngineData`、同一份資料）測速，含大阪的天，修之前、修快取後、只重算一天後各量一次，數字寫進 commit 訊息。
- **拿掉選班次**：引擎忽略 `trip`、刪掉過渡期的 `tripLeg` 路徑和 `prevTrip`／`nextTrip`（`rideDepartures` 留著）；舊行程的 `trip` 不報錯；CONVENTIONS §3 的 `travel` 說明跟著改。網站只拿掉 ‹ › 和班次下拉，班次表照現在的樣子還能看。改了 `LegRow.tsx`、`MobileLeg.tsx` 等元件要在 commit 訊息說明。
- **給 T29c 的交接**：在設計文件補一節，用真實資料列出交通卡拿得到的內容（伊勢志摩一段、大阪一段、第一天南下、計程車一段）；缺的欄位記下來，不在 T29b 加。
- 完成條件：`npm test`、`npm run typecheck`、`npm run validate` 通過；dev server 打開一次行程，確認交通卡、班次表沒有當掉（🌐 少量）。
- **完成（2026-10-28）**：動一張卡後重算（網站的方式、12 天含大阪 2 天）從平均約 118 ms 降到約 5 ms（沿用 EngineData），加上 PlanCache 後不到 1 ms；整份重算（資料點、道路快取變了）照舊約 100～200 ms。交通卡拿得到什麼、T29c 要注意的 6 點（「錯過的話」只照同一條走法、候選常只有 1 條等）見設計文件 §7.8。

### T29c web：交通卡、班次表、車站面板 〔M〕
- 設計見 [specs/2026-10-26-transit-raptor-design.md](superpowers/specs/2026-10-26-transit-raptor-design.md) §8（2026-10-28 和 👤 用草圖討論定案）。先讀 [architecture.md](architecture.md)、[interaction-design.md](interaction-design.md) §13.6。
- **web**：收合兩行（方式分鐘＋⚠ 數字、走法膠囊或計程車台數）；點開是補充資訊框＋一程一行的步驟（「錯過 +N 分」標籤、點上車站開班次表）；班次表改成格子（網頁四欄、手機三欄，手機也用彈窗、高度固定）；編輯器的方式改分段按鈕、可以選候選走法；計程車也能點開；車站面板寫班距型路線的班距和首末班。
- **engine**：到達時間一樣時優先挑買票站留得出 `ticketMargin`（10 分）的班次；加 `ticket-tight` 警告；`validateItinerary` 不接受車站資料卡。
- **車站不當資料卡**：擋掉所有排進行程的入口，假後端種子資料換掉，localStorage key 升 v6。
- 改到的別的任務的檔案（`LegRow.tsx`、`MobileLeg.tsx`、`TimetablePopup.tsx`、`planView.ts`、`seed.ts`、`mock.ts` 等）在 commit 訊息說明。
- 完成條件見設計文件 §8.12（含手機、網頁截圖，🌐 少量）。

---

## 6. 待確認事項 👤

- [x] 航班：2/2 桃園 → 關西（11:55、13:20 抵達），2/13 關西 → 桃園（12:45、12:55 起飛）；分兩批搭，但大致一起抵達、一起離開
- [x] 近鐵 5 日券用哪幾天：排完行程再決定，不夠可以再買一張，**蒐集資料時不用考慮**
- [ ] 選 5 日券還是 **5 日券 Plus**（含奈良、三重的巴士）：同上，排完行程再決定
- [x] 住宿預算：先不設上限，蒐集時把價格記錄下來
- [x] 12 天都待在伊勢志摩嗎？（2026-10-26）最後 1～2 天在大阪（T27a～T29）；最後一晚住大阪或關西機場周邊由使用者自己選
- [x] 住宿偏好：不住評價差的地方；民宿（傾向包棟）、一泊二食、旅館、飯店都可以
- [x] 同行人數：15 人
- [x] 組成：5 位長輩（約 70 歲）、4 位小孩（6～10 歲）
- [x] 行動方式：部分行程全員一起，部分分組（每組約 4～6 人）
- [x] 飲食：沒有忌口，有人很喜歡海鮮
- [x] 訂位：蒐集資料時只查能不能訂位和聯絡資訊；誰負責訂位之後再說
- [x] 行程的共用、編輯方式（2026-10-21）：LINE 登入，只有家人 LINE 群組的成員能進來（另有白名單備案）；只有一份確定的行程，家人留建議（只有寫的人能刪），任何人進入規劃模式才能改行程；資料點的修改全員共用、可以復原；聊天紀錄只有自己看得到。見 [architecture.md](architecture.md) §3、§5，[interaction-design.md](interaction-design.md) §6、§11
- [x] 長輩不需要輪椅；長階梯等資訊記在景點資料裡，看行程的人自己決定
- [ ] 「行程」畫面整體精簡（2026-10-28 👤 在 T29c 討論時提出）：資料卡、當天摘要列等也照「外面只放真正要知道的，補充資訊點開才看」重看一次；T29c 只做交通卡，其他的之後另外討論
