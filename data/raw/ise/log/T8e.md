## T8e 收尾、補心得（伊勢，分批）

## 第 1 批：Chrome 抽取程式實測＋補回大個室店 13 家（2026-10-18）

### 範圍
- 實測 `scripts/chrome/` 的 4 支程式（`tabelog-info.js`、`google-place.js`、`tabelog-reviews.js`、`google-reviews.js`），修好後才做其他家。
- 補回大個室店 13 家（PLAN「各區注意」T8e 補心得段落）。不做：§5.7 住宿 3 間、anchors／缺漏（收尾批）、其他店的補心得。
- 工作目錄 `data/cache/work/t8e-1/`：`cand-include.json`、`batch.json`、`tabelog.jsonl`、`google.jsonl`、`facts/`、`photos.json`、`judgement(.draft).json`、`prompt-common.md`、`reviews-notes.md`。

### 步驟
1. `candidates.mjs set`：13 家 not-included → included、`criteria: ["C"]`、`reason` 寫補回原因、`detailPending: true`（commit e89d8ae）。`candidates.mjs export` 加了 `--ids`（還沒有 pointId 的候選指定資料點 id 當 batch key；先填 pointId 會讓 validate 報錯）。
2. Chrome（1 個分頁，結束關掉；localStorage 存的程式結束時 removeItem）：
   - 食べログ 店家頁 13、コース頁 7（有 party 分頁的 fit15 yes 店）；Google Maps 13 家（列表 3 次：炭火焼肉匠 2 次重搜後截圖點選、柚子 加「新割烹」重搜）。
   - 口コミ 3 家：桂 外宮（dtlrvwlst＋sw 中止・冬・子供）、満船屋 HANARE（＋sw 子供）、伊勢大阪屋（＋sw 座敷・冬）；Google 評論 3 家（評価の低い順 10＋搜尋「子供」，大阪屋只有低分順）。
   - 沒有遇到驗證碼、登入、封鎖（食べログ第一頁的 Cloudflare「請稍候…」自己通過）。
3. 讀文 subagent 5 個（3＋3＋3＋2＋2 家），共同指令 `prompt-common.md`。
4. `build-restaurants.mjs draft` → `judgement.json` → `build --candidates`（先 `--dry-run`，工具 commit 後才寫檔）。第一次 build 漏了 `official`／`ig`（judgement 沒寫就是 null），從 draft 補上後重組（取代 13）。
5. 3 家的口コミ、Google 評論重點追加到 `dossiers/`（來源 5、6），`questions.md` 12 條、`ig-notes.md` 9 筆、decisions-pending 6 列（1 列進「👤 建議先看」）。

### 程式實測的結果與修正（細節在 CONVENTIONS「口コミ、Google 評論」的已確認、「工具」）
- `tabelog-info.js`：選擇器 OK。修：Cloudflare 標題是「請稍候…」（原本只認 Just a moment，第一頁就回空）→ 程式自己等 10 秒；`path` 被擋成「[BLOCKED: Base64 encoded data]」→ 只回傳店家 ID 之後；コース頁回傳整張店舗情報（浪費）且「[PR]」不一定有 → 不回傳 rows、切到「店舗情報（詳細）」前；`tabs` 混進 `party/421882` → 過濾；「予算（口コミ集計）」被當成「予算」（ふぐや、ひびの）→ 不收（`tabelog-parse.mjs` 也改）。
- `google-place.js`：選擇器 OK。修：cid（純數字）13 家中 1 家被當成 Base64 擋下 → 每 4 位加空格、`build-restaurants.mjs` 讀時去掉；電話「+81 596-…」被切成「81 596-…」→ 改回 0；從列表點進去時 `h1` 是「スポンサー」→ 改用地點面板的 aria-label。
- `tabelog-reviews.js`：選擇器 OK、頁尾店舗情報完整。修：同樣等 Cloudflare、`url` 改成短 `path`、`?sw=` 頁不重複回傳店舗情報。
- `google-reviews.js`：`open`、`search` OK；**`lowest` 第一次抽到的是關聯度順**（桂：4、5 星；HANARE：星數混雜）。原因是評論清單要捲動才載入，換排序後清單清空、不捲就沒有，而等待時太早捲動會載入舊排序的更多評論。改成兩段等待（先等舊清單換掉，清空後才捲到底），HANARE、桂、大阪屋 都抽到 1 星開頭的 10 則。
- `chrome-actions.mjs`：加 `--store／--stored／--cleanup`（程式存 localStorage 只傳一次）、`tabelog-reviews --keywords`、`google-reviews --keywords`。本批是手動照這個形式組 batch（toString 存進 localStorage）。
- `scripts/test/tabelog-parse.test.ts` 加 5 家實際 rows（桂、ふぐや、たまちゃん、能代、柚子），`npm test` 58 個全過。

### 結果
- 餐廳 95 → 108 筆（ise-geku 8、ise-kurata 1、ise-outskirts 2、ise-obata 2），13 家 fit15 都是 yes。候選 included 108、`detailPending` 0。
- 照片：官網 9 家（photo-check 16 張中 3 張 403／404 沒用）、Google 主圖 4 家；`photo-check --data` 142 張全部 OK。
- 讀文：多數只有官網＋食べログ；ひびの、たまちゃん（官網 403）、來々軒 幾乎只有食べログ。心得：3 家各約 30 則口コミ＋評論，其他 10 家 0。
- WebSearch：主 session 0 次；讀文 subagent 7 次（A 2、B 2、C 1、D 1、E 1）。

### 給下一批
- 補心得批次直接用修好的 4 支程式；Google 搜尋結果是列表的店先截圖點選。
- 這批 10 家還沒讀口コミ、Google 評論（炭火焼肉匠、匠 PART2、能代、ふぐや、一升びん 松寿亭、ひびの、かぐら、來々軒、柚子、たまちゃん），補心得時一起做。
- 收尾批的 anchors、缺漏檢查要包含這 13 家（`anchors: []`）。
