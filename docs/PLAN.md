# 伊勢志摩旅遊規劃網站：執行計畫

> 旅程：2027-02-02 ～ 2027-02-13，使用近鐵 5 日券
> 行程方向：從南邊的**志摩市**開始，往北到**鳥羽市**，最後到**伊勢市**
> 人數：**15 人**（5 位約 70 歲的長輩、4 位 6～10 歲的小孩）；部分行程全員一起，部分分組（4～6 人一組）
> 文件建立：2026-10-17
> 資料格式與共同規則見 [CONVENTIONS.md](CONVENTIONS.md)

---

## 1. 目標

一個以地圖為中心的行程規劃網站：

1. 地圖上標出事先蒐集好的**資料點**：車站、景點、住宿、餐廳。
2. 點進資料點可以看照片、營業時間、菜單或連結、附近的資料點（附步行時間）；點車站可以看時刻表。
3. 使用者把資料點排進**有時間軸的行程**，系統動態計算點到點的交通，並檢查時間衝突（公休、班次、營業時間）。
4. 進階：AI Agent 依使用者需求規劃行程，並**透過操作地圖**來解釋（聚焦、高亮、畫路線）。

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
| T7j | 👤 鳥羽：檢討待確認的決定、深入調查（前幾名的部落格心得）、補丁式重新打分（另開 session） | S | T7h | 3 | | ⬜ |
| T8a | 伊勢（含二見）：子地區與景點 | M | T7 | 3 | 🌐 大量 | ✅ |
| T8b | 伊勢（含二見）：住宿 | M | T8a、T7d | 3 | 🌐 大量 | ✅ |
| T8c | 伊勢（含二見）餐廳：候選名單 | M | T8b | 3 | 🌐 大量 | ✅ |
| T8d | 伊勢（含二見）餐廳：詳細資料 | L | T8c | 3 | 🌐 大量 | ✅ |
| T8e | 伊勢（含二見）：收尾（anchors、缺漏檢查、地圖檢查）、重點資料點補心得 | M | T8d | 3 | 🌐 大量 | ✅ |
| T8f | 伊勢（含二見）：摘要與評分 | M | T8e、T7g | 3 | | ✅ |
| T8g | 👤 伊勢（含二見）：檢討待確認的決定、深入調查、補丁式重新打分（另開 session） | S | T8f | 3 | | ⬜ |
| T9a | 志摩：子地區與景點 | M | T7 | 3 | 🌐 大量 | ✅ |
| T9b | 志摩：住宿 | M | T9a、T7d | 3 | 🌐 大量 | ✅ |
| T9c | 志摩餐廳：候選名單 | M | T9b | 3 | 🌐 大量 | ✅ |
| T9d | 志摩餐廳：詳細資料 | M | T9c | 3 | 🌐 大量 | ✅ |
| T9e | 志摩：收尾（anchors、缺漏檢查、地圖檢查） | S | T9d | 3 | 🌐 少量 | ✅ |
| T9f | 志摩：摘要與評分 | M | T9e、T7g | 3 | | ✅ |
| T9g | 👤 志摩：檢討待確認的決定、深入調查、補丁式重新打分（另開 session） | S | T9f | 3 | | ⬜ |
| T10 | 巴士時刻表（需要搭巴士的景點路線）、JR 參宮線、離島定期船 | M | T8a、T9a | 3 | | ✅ |
| T11 | 地圖網站 v1（先做網站版）：圖層、詳情面板、車站時刻表面板 | M | T5、T7 | 3 | 🌐 少量 | ⬜ |
| T12 | 地圖動作 API（給 UI 和 AI 共用的地圖指令） | S | T11 | 3 | 🌐 少量 | ⬜ |
| T13 | 跨區整理與驗證：去除重複、分級、缺漏檢查 | M | T7g、T8f、T9f、T19 | 3 | 🌐 少量 | ⬜ |
| T14 | 行程引擎：時間軸、交通方式判斷、衝突檢查（純邏輯） | M | T6、T7 | 4 | | ⬜ |
| T15 | 行程規劃 UI：候選清單、分天、拖拉、交通顯示 | L | T11、T14 | 4 | 🌐 少量 | ⬜ |
| T16 | AI Agent（只做規劃行程用）：查資料工具、地圖動作工具、對話介面 | L | T12、T14、T15 | 5 | 🌐 少量 | ⬜ |
| T19 | 關西機場周邊：2/12 住宿與晚餐、摘要與評分 | S | T7d（評分部分等 T7g） | 3 | | ✅ |
| T20 | 匯出給 Claude app：最終行程、分組和資料整理成 claude.ai Project 用的檔案 | S | T15、行程定案 | 6 | | ⬜ |

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
                   [T13 跨區整理]（全部資料完成後）
  * 楽天 API key 已經放在 .env（2026-10-18 測試成功）

階段 3（介面，和資料並行）  [T11 地圖 v1] → [T12 地圖動作 API]    [T14 行程引擎]
                  │
階段 4            └──────────► [T15 行程規劃 UI]（需 T11 + T14）
                                      │
階段 5                        [T16 AI Agent（規劃行程用）]
                                      │
階段 6                        [T20 匯出給 Claude app]（行程定案後）
```

### 同時可以開幾個 session

| 時間點 | 可同時進行 | 建議 session 數 |
|---|---|---|
| 階段 0 | T0 | **1** |
| 階段 1 | T1→T1b、T2→T3→T4a→T4b→T4c（同一條 lane 依序）、T5、T6 | **4**（T1b 也可以另開第 5 個；T4b 可以拆成 2 個並行） |
| 階段 2 | T7（和你一起討論） | **1** |
| 階段 3 開始 | T7b、T8a 或 T9a（擇一，🌐）、T11、T14 | **4** |
| 階段 3 中 | 🌐 大量的任務輪流做（T7c、T7d、T7e、T7h、T8a～T8e、T9a～T9d、T19，同時只開 1 個）；同時進行不用 Chrome 的 T7g、T7i、T8f、T9f、T10、T11/T12、T14 | **3～4** |
| 階段 3 後 | T7f→T7g、T8c～T8f、T9c～T9f、T10、T11/T12、T14 | 4～5 |
| 階段 3 最後 | T13，以及繼續 T11/T12/T14 | 2～3 |
| 階段 4 | T15（可拆成兩個子任務，見任務說明） | 1～2 |
| 階段 5 | T16 | 1 |
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
   npm install && (cd web && npm install)              # worktree 不會共用 node_modules
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
| 2026/12 | 4 | 行程規劃 UI；👤 **行程大致確定後就訂住宿、團體用餐、特急座位**（15 人要早訂） |
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
- **動手前先參考業界做法**：找幾個旅遊規劃產品（例如 Google Maps、Wanderlog、Roadtrippers）和開源專案的介面與操作方式，整理成截圖或重點，👤 和你確認方向後再開始做。可以參考的方向：地圖加側邊詳情面板、分類圖層與篩選、手機版的底部可上拉面板（bottom sheet）。
- 把 v0 改成正式介面：
  - 分類圖層、篩選（區域、情境、分級）
  - 地點詳情側邊面板：照片、營業時間、公休、來源連結、附近資料點和步行時間
  - 車站面板：指定時間（例如行程裡的某個時間點）前後的班次（上下行）、外部查詢連結（Google Maps、Jorudan）
- **先做好網站版**。有用手機看的需求，但手機要怎麼呈現，等網站版做好再決定。

### T12 地圖動作 API 〔S〕
- 定義一組地圖指令，**UI 和 AI 都透過它操作地圖**：
  - `focus(target)`、`highlight(ids, style)`、`drawRoute(from, to, mode)`、`compare(ids)`、`clearHighlights()`
- 實作方式：狀態放在 store（例如 Zustand），地圖依狀態重畫。

### T13 跨區整理與驗證 〔M〕
- 建議在各區的深入調查（T7j、T8g、T9g）第一輪之後做，至少不要同時做（兩邊都會改 `assessment`）。
- 跨區去除重複；檢查資料點有沒有缺漏（例如某個車站附近沒有餐廳）。
- 看 T7i 的 `data/derived/kanko-mie-missing-ise.json`（伊勢、二見在觀光三重有、候選裡沒有的景點），決定要不要補；要補的列成清單給 👤，或另開任務補。
- 統一分級和標籤；列出「資料可信度低、需要人工確認」的清單給 👤 你。

### T14 行程引擎 〔M〕
- 純邏輯模組，不碰 UI：
  - 行程的資料格式（見 CONVENTIONS.md）
  - 兩點之間：依規則選交通方式 → 計算時間（步行、時刻表、巴士）
  - 時間軸推算：抵達時間、停留時間、出發時間
  - 衝突檢查：公休、營業時間外、錯過末班車、班次間隔太長
  - **團體檢查**：餐廳坐不下 15 人、沒有預約；巴士班次少、15 人可能擠不上；計程車台數和費用
  - **分組**：支援某一段時間分成幾組（每組 4～6 人）各自行動，再約時間地點會合；每組可以有不同的行程
  - **長輩、小孩檢查**：連續步行太久、階梯太多、一天太滿、沒有休息時間時提出警告
- 要寫測試。T7 一訂好規則就可以開始，不必等 T11。

### T15 行程規劃 UI 〔L〕
- 候選清單（想去）→ 分天行程；可以拖拉；每天一個顏色。
- 相鄰兩點之間顯示交通方式和時間；衝突用 ⚠️ 標示。
- 行程先存在 localStorage，也可以匯出、匯入 JSON。
- **15 人共用的方式**（編輯、投票、分享）：👤 在做這個任務時再和你一起決定。
- 「需要預約」的項目要能列成清單，附上訂位方式和聯絡資訊。
- 分組行動的時段要能看出「哪幾組、各自去哪、幾點在哪裡會合」。
- **可以拆成兩個並行子任務**：T15a 行程側欄，T15b 地圖上的行程路線和每天的顏色。

### T16 AI Agent 〔L〕
- **只做規劃行程用**：在網站上幫忙選點、排順序、檢查衝突。旅途中的臨時查詢交給 Claude app（見 §1「網站的範圍」），這裡不做。
- 交通的回答附上 Google Maps 路線連結（§1），實際班次讓使用者在 app 上確認。
- 用 Claude API 的 tool use，工具有：
  - 查資料：`search_spots`、`search_restaurants`、`get_timetable`、`get_lodging`
  - 改行程：`update_itinerary`（透過 T14 檢查）
  - 操作地圖：T12 的地圖指令
- 對話介面：AI 回覆裡的地點名稱可以點，點了地圖就跳過去。
- API key 不可以放在前端；用一個小型代理（本機或 Cloudflare Worker）。
- **簡單版的替代方案**：先不做聊天介面，直接把 `data/` 給 Claude 看，請它輸出行程 JSON，再匯入網站。

### T20 匯出給 Claude app 〔S〕
- **行程規劃完以後才做**：要匯出哪些資料、做成什麼格式，等行程定案後再具體決定，工作量也到時候再估。
- 目的（§1「網站的範圍」）：把最終行程、分組和 `data/` 的資料整理成 claude.ai Project 能用的檔案，讓旅途中的 Claude app 優先用我們篩過的清單，並考慮人數和座位條件。
- 交通附 Google Maps 路線連結（格式見 §1），實際班次在 app 上確認。

---

## 6. 待確認事項 👤

- [x] 航班：2/2 桃園 → 關西（11:55、13:20 抵達），2/13 關西 → 桃園（12:45、12:55 起飛）；分兩批搭，但大致一起抵達、一起離開
- [x] 近鐵 5 日券用哪幾天：排完行程再決定，不夠可以再買一張，**蒐集資料時不用考慮**
- [ ] 選 5 日券還是 **5 日券 Plus**（含奈良、三重的巴士）：同上，排完行程再決定
- [x] 住宿預算：先不設上限，蒐集時把價格記錄下來
- [ ] 12 天都待在伊勢志摩嗎？還是有幾天在大阪、京都、奈良、名古屋等其他地方？（會影響資料蒐集的範圍）
- [x] 住宿偏好：不住評價差的地方；民宿（傾向包棟）、一泊二食、旅館、飯店都可以
- [x] 同行人數：15 人
- [x] 組成：5 位長輩（約 70 歲）、4 位小孩（6～10 歲）
- [x] 行動方式：部分行程全員一起，部分分組（每組約 4～6 人）
- [x] 飲食：沒有忌口，有人很喜歡海鮮
- [x] 訂位：蒐集資料時只查能不能訂位和聯絡資訊；誰負責訂位之後再說
- [ ] 行程的編輯、投票方式：做 T15 行程規劃 UI 時再決定
- [x] 長輩不需要輪椅；長階梯等資訊記在景點資料裡，看行程的人自己決定
