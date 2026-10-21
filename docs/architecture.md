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

### 3.3 資料表草稿（D1，T24 定案）

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
- 資料點約 550 筆（2026-10-21：住宿 145、餐廳 292、景點 79、車站 28），D1 的免費額度對 15 人綽綽有餘（實際數字開工時再查官網）。

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

**新增區域**（例如之後加大阪）：照現在的方式蒐集到 `data/areas/osaka/`，驗證後匯入。大阪的 ID 都是新的，只會新增，不會碰到任何人的修改。

### 3.5 規則
- **ID 不改名**：ID 是連接預設資料、修改、行程、投票的關鍵。第一次正式匯入之後，已經匯入的 ID 不改名。
- **合併重複的點**：保留一個 ID，被合併的記成轉址（舊 ID → 新 ID）。轉址記在 `data/redirects.json`，格式由 T24 定，匯入時寫進 `redirects`；行程、投票、修改都跟著轉過去。
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
- 行程裡的點可能是預設資料、自己加的點，或已下架的點，引擎都要能處理。

### 3.7 時刻表和其他靜態資料
- `timetables/`、`passes.json`、`access/`、`areas.json` 在 build 時整理成靜態 JSON，和網站一起部署。
- **時刻表照車站拆開**，用到時才載入。
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

- **API 草稿**（T24、T25 定案）：
  - 資料：`GET /api/places`（預設資料，用匯入版本當 ETag 快取）、`GET /api/edits?since=`、`POST /api/edits`、`POST /api/edits/:id/revert`、`/api/user-places`
  - 行程、建議、投票：`GET/PUT /api/itinerary`（PUT 要帶 `version`）、`/api/itinerary/snapshots`、`/api/suggestions`（`PATCH /api/suggestions/:id/status` 標狀態）、`/api/votes`
  - 聊天紀錄：`/api/chats`（只回傳自己的）
  - 登入：`/auth/line/login`、`/auth/line/callback`、`/auth/logout`、`GET /api/me`
  - LINE 的通知：`POST /line/webhook`（驗證簽章）
  - AI：`POST /api/claude/messages`
- **除了登入和 LINE 的通知，所有 API 都要先登入。**
- **環境**：本機用 `wrangler dev`（本機的 D1），正式環境部署到 Cloudflare。用 GitHub Actions 自動部署是之後的事，一開始手動 `wrangler deploy` 就好。
- **費用**：預期都在免費額度內。Workers 免費方案每次請求的 CPU 時間很短，所以 Worker 只做轉發、讀寫資料庫、簡單的合併與驗證；重的計算（行程引擎）放在瀏覽器（§6）。

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
| T15 行程與建議 UI | §2（改用 API）、§3.2（修改紀錄的顯示）、§3.6、§3.8（同步） |
| T16 AI Agent | §6 |
| T20 匯出給 Claude app | 匯出合併後的資料（預設資料加修改），不是 git 裡的 JSON |

---

## 8. 測試與完成條件

- **引擎、匯入、Worker 的邏輯**：單元測試（`node --test`），每個任務卡列的規則都要有測試。
- **UI**：用 Playwright 跑幾條主要流程，例如「點資料點 → 看詳情 → 按 ❤️」「寫建議 → 進入規劃模式 → 採用 → 時間軸出現」。手機尺寸和電腦尺寸各跑一次。畫面好不好看用 Claude in Chrome 看，或交給 👤 看。
- **每張任務卡都列「完成條件」**，做完逐條確認，結果寫在回報裡。

---

## 來源（2026-10-21 取得）
- LINE Developers：[Getting user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)：同一個 provider 底下，不同 channel 的 userId 相同；列出群組全部成員的 API 只限認證過或付費的帳號；成員加入、發言時的通知裡會帶 userId
- LINE Developers：[Consent on getting user profile information](https://developers.line.biz/en/docs/messaging-api/user-consent/)：使用者要同意才拿得到資料；只用電腦版 LINE 的人無法同意
- [LINE Messaging API SDK for Python（PyPI）](https://pypi.org/project/line-bot-sdk/1.4.0)：查群組成員資料的 API，可以查沒加機器人好友或封鎖機器人的人
