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

## 第 2 批：補回 §5.7 誤排除的住宿 3 間＋收尾＋補心得的對象清單（2026-10-18）

### 範圍
- 補回 伊勢シティホテル、ホテルキャッスルイン伊勢、外宮前別邸 道（PLAN「各區注意」T8e）。山田館 維持排除（候選 note 已寫）。
- 收尾：伊勢、二見的 anchors、缺漏檢查、`dinnerAccess`、地圖檢查。
- 補心得的對象清單 `data/cache/work/t8e-targets.json`（這一批不讀評論）。
- 工作目錄 `data/cache/work/t8e-2/`：`rakuten-*.json`、`google.jsonl`、`facts/`、`prompt-common.md`、`lodging-new.mjs`（3 筆資料點本體）、`cand-patch.json`。

### 1. 住宿 3 間
- 楽天 API：`detail 740 1360 192775`；`party --hotel 740,1360,192775 --dates 2027-02-09,2027-02-10`；`vacant` 2/9 的「1 間 大人 3＋小學生 1」「1 間 大人 2」「1 間 大人 4」；キャッスルイン 再用 `vacant --plans`（5×3，2/9、2/10）找一般方案的最低價（API 的 cheapest 是三重県民限定）；道 另查 2026-11-17 確認有沒有在賣（沒有）。共約 30 次呼叫。
  - 結果：キャッスルイン 兩天 5×3、4×4 有空房；伊勢シティ 兩天都沒有 15 人組合（2/9 只剩 1 間 3 人）；道 完全沒有方案。
- Google（Chrome，`chrome-actions.mjs --script google-place --store`，1 次 batch 3 家）：3 家都直接開到地點頁。伊勢シティ 3.5／830、キャッスルイン 3.5／1,462（和 T8b 一樣）、道 **3.8／12**（T8b 沒查）。網站欄給了官網：greens.co.jp/isech/、castleinn.co.jp/ise/（キャッスルイン 的讀文 subagent 沒找到官網，主 session 用 HTTP 確認 200）。
- じゃらん：`jalan.mjs yad 379992 311771 396262`（3.8／2,262、3.9／213、4.2／11，和 T7i 一樣）；`apply --dry-run` 確認 3 筆的網址、分數都已經在資料檔，沒有另外寫。
- 讀文 subagent 3 個（一間一個，`prompt-common.md`），WebSearch 各 1 次（共 3）。官網：伊勢シティ 找到、キャッスルイン、道 沒找到。
- 照片：伊勢シティ 官網 2＋楽天 1、キャッスルイン 官網 1＋楽天 1＋Google 1、道 楽天 1＋Google 1（`photo-check.mjs` 8 張都 OK）。
- 資料點由主 session 寫（住宿沒有組裝工具，CONVENTIONS「工具」）：`lodging-new.mjs` → 追加到 `lodging.json`（21 → 24）；候選用 `candidates.mjs set` 改 included、pointId、reason（キャッスルイン 的 region 改 ise-outskirts）。validate 的 §5.7 警告 3 條消失。
- 判斷寫在 decisions-pending（子地區、限定方案、道 的容量、伊勢シティ 的空房）。

### 2. 收尾（伊勢、二見）
- **anchors**：`restaurant-anchors.mjs` 原本的步行圈清單只有鳥羽，先改成鳥羽以外照 `areas.json` 的 `needsCar`（`scripts/lib/anchor-rules.mjs`＋測試；鳥羽重跑 354 筆不變）。然後 `node scripts/restaurant-anchors.mjs ise`／`futami`（先不寫、看報告，再 `--offline --write`）。
  - 伊勢 108 家、811 筆（osrm 809、estimate 2）；二見 18 家、90 筆（osrm 87、estimate 3）。OSRM 呼叫 1,166＋140 次（新路線快取約 1,300 段，`data/cache/routes/`）。全部的店都有 anchors（第 1 批的 13 家原本是 `[]`）。
  - ise-geku 一家平均 11 筆：不含晚餐的住宿多（商務飯店 6 間＋お宿 壱、和装庵、道），20 分內的都照規則加進去。
  - estimate 的原因：さし汐 → 五十鈴ケ丘站、エリアワン 繞路 3.7～4.3 倍（伊勢 IC 一帶的國道、鐵路要繞，沒有人工確認，照估算）；海の蝶（`futami-uminocho-dining`，座標借住宿本體）吸附 779 m → 松下站、松下社、桃源郷 用直線估算。海の蝶 的座標是 Google 的，T8b 沒有問題紀錄；為什麼離 OSM 步行路網那麼遠沒有查（地圖上看是在海邊的建物，可能是 OSM 沒有飯店內的路），列在 README 缺口。
- **住宿 `dinnerAccess`**：T8b 全部留 null、decisions-pending 寫「T8e 收尾時照 T7f 的方式判斷」。T7f 是在 scratchpad 寫臨時腳本，這次寫成 `scripts/lodging-dinner-access.mjs`（規則同 CONVENTIONS「判斷細則」；晚餐店的判斷和 `restaurant-gaps.mjs` 共用 `scripts/lib/trip-hours.mjs`）。每間取直線 1.6 km 內最近 8 家晚餐店查 OSRM（呼叫 152＋42 次）。晚餐店從伊勢、二見兩區一起找。
  - 伊勢 22 間（meals 是 none／breakfast／varies 的）全部 `walk`；內宮周邊 4 間（伊久、神宮會館、宿屋五十鈴、おかげ参り宿場）20 分內只有 焼肉すだく（4～12 分，**週三休**），宿屋五十鈴、おかげ参り宿場 另有 かぐら 19～20 分、カンパーニュ 18 分。エリアワン 是 さし汐、四十三番、Knott's 8～11 分。
  - 二見 13 間：11 間 `walk`（二見浦旅館街 3～15 分；オレンジガーデン 只有 う吉 20 分、プラフィーノ う吉 17 分・ワスケ 19 分）；**海の蝶 `car`**（有自己的晚餐，但選素泊時附近沒有店）、**桃源郷 `car`**（只有海の蝶 日帰り会席，`-dining` 照規則不算，note 寫明）。
  - 每間的店名、分鐘數在 `extra.dinnerAccessNote`。
- **缺漏檢查**（`restaurant-gaps.mjs ise`／`futami`，結果在 `data/cache/work/t8e-2/gaps-*.md`）：
  - 午餐：ise-asama 每天只有 朝熊茶屋（1 家，已知）；ise-geku 週三 13 家（其他天 15～24）；ise-isuzugaoka 週二、週四 2 家；ise-obata 週二、週三 2 家；ise-outskirts 週一 2 家；二見 3～6 家。其他子地區每天 3 家以上。
  - fit15 yes：ise-asama 0（朝熊茶屋 unknown）；其他子地區都有（ise-geku 17、naiku 10、kurata 4、obata 4、isuzugaoka 2、outskirts 2；二見 okitama 3、outskirts 1）。
  - 不含晚餐的住宿：見上面 `dinnerAccess`；anchors 裡的晚餐店和 gaps 表一致。
  - 營業時間全部 null 的：つむぐ（ise-geku，T8d 已知）、潮騒（二見）。
- **地圖檢查**（Chrome，`cd web && npx vite --port 5199 --strictPort`，開 `http://localhost:5199/` →「伊勢」）：面板「檢查（0）」；各區筆數 伊勢 8／18／24／108、二見 2／4／17／18（和資料檔一致）。整區截圖看過：點都在陸上、在伊勢 bbox 內；離子地區中心最遠的幾家（伊勢大阪屋 上地町、たまちゃん 小俣町湯田、來々軒 川端町、う吉 二見町西）和地址的町名一致。新補的 3 間住宿位置和地址一致。**沒有修正座標**；海の蝶 的吸附問題沒有在地圖上個別看。
- Chrome 操作（第 2 批全部）：Google Maps 1 次 batch（住宿 3 間）＋清掉 localStorage 1 次、本機地圖 3 次；沒有驗證碼、登入、封鎖、對話框。結束時關掉分頁、停掉 dev server。

### 3. 補心得的對象（`data/cache/work/t8e-targets.json`，這一批不讀評論）
- 工具：`node scripts/review-targets.mjs ise futami --max 52 --extra <景點、住宿 22 筆> --out data/cache/work/t8e-targets.json`（T8e 新增，T9e 可以照用）。輸出 `[{ batch, id, type, region, keywords, tier }]`。
- **餐廳的挑法**：CONVENTIONS 的對象（fit15 yes／split，或食べログ 3.40 以上，或 Google 4.3／100 則以上）伊勢＋二見有 117 家，去掉第 1 批已讀過的 3 家（桂 外宮、満船屋 HANARE、伊勢大阪屋；筆記有「[tabelog] 食べログ口コミ（」「[google-maps] Google 評論（」的來源才算讀過）是 114 家。照指示的優先順序 ① fit15 yes／split ② 食べログ 3.40 以上 ③ Google 4.3／100 則以上評論數多的：**① 就有 52 家**（yes 40、split 12），所以只取 ①，② 58 家、③ 4 家都不做（fit15 是 unknown 或 no 的店，多半是不能預約的甜點、烏龍麵、小吧台店）。原本想取 50 家，但 ① 剩下的 2 家（カキアキ水産 HANARE、う吉）只差一點，① 全部取比較好說明，改成 52。
  - 第 1 批補回、還沒讀評論的 10 家（炭火焼肉匠、匠 PART2、能代、ふぐや、一升びん 松寿亭、ひびの、かぐら、來々軒、柚子、たまちゃん）都在 ① 裡。
  - 住宿附設的 `-dining` 3 家（神宮会館、おく文、海の蝶）在 ①：食べログ有店家頁，Google 是借住宿本體的（評論會混住宿的），讀的時候看內容。
- **景點、住宿**：筆記「資料量」心得不到 2 篇的，由主 session 逐筆看「資料量」那一行判斷（寫法不一，例如「心得 1 處（楽天 1,291 則）」實際上讀了很多則，程式判斷不了）：
  - 景點 15：外宮參道、月夜見宮、河崎、若松屋、月讀宮、倭姬宮、徴古館、松尾觀音寺、おはらい町、猿田彥神社、オカゲ屋敷、金剛證寺、朝熊山頂（伊勢 13）；二見表參道、松下社（二見 2）。內宮（3 篇媒體）、せんぐう館（3＋4travel 20 則）、外宮（3）、苺園（11）、菊池パール（4）、興玉神社（2）、シーパラ（3）不做。
  - 住宿 7：伊勢神泉（1）、宿屋五十鈴（0）、おかげ参り宿場（0）、岩戸館（0，只有業配文）、日章館（0）、桃源郷（1）、オレンジガーデン（0）。照規則只看 Google 評論＋楽天評分細項（細項已經在 `ratings`，T8b 從 API 取得），不讀楽天評論。**お宿 壱**（心得 0）不放：Google 地圖找不到這間（T8b），楽天細項也已經有，沒有東西可以補。星出館（「楽天摘要數則」）、和装庵（楽天 2 則）、伊久（楽天 1,291 則讀了摘要）算 2 篇以上。
- **關鍵字**（照 CONVENTIONS，`keywordsFor`）：餐廳固定 `中止`、`冬`；`kids.allowed` null／unknown 加 `子供`、`子連れ`；fit15 split／unknown 加 `団体`、`予約`；`seating` 空、`accessibility` 沒有內容或寫到 2 樓加 `階段`、`2階`、`座敷`。景點固定 `冬`，`kids.friendly` null 加 `子供`、`accessibility.stairs` null 加 `階段`；住宿固定 `冬`，`accessibility.kids` null 加 `子供`、電梯或階梯 null 加 `階段`。
- **分批**（依 `areas.json` 子地區順序，同一子地區同一批）：

| 批 | 筆數 | 子地區 | 餐廳／景點／住宿 |
|---|---|---|---|
| 1 | 23 | ise-geku 23 | 18／4／1 |
| 2 | 15 | ise-kurata 9、ise-isuzugaoka 2、ise-obata 4 | 11／4／0 |
| 3 | 25 | ise-naiku 22、ise-asama 2、ise-outskirts 1 | 18／5／2 |
| 4 | 11 | futami-okitama 6、futami-outskirts 5 | 5／2／4 |

  合計 74 筆（餐廳 52、景點 15、住宿 7）。每家約 2～3 次 browser_batch（CONVENTIONS「固定步驟」），餐廳約 130 次、景點住宿只做 Google 約 30 次。
- 縮小對象（② ③ 不做）是邊界判斷，寫在 decisions-pending 表格。

### 工具（這一批改的、加的，都附測試；`npm test` 68 個全過）
- `scripts/lib/anchor-rules.mjs`（新）＋`restaurant-anchors.mjs`：步行圈的判斷（鳥羽手寫清單、其他照 needsCar）。
- `scripts/lib/trip-hours.mjs`（新）：從 `restaurant-gaps.mjs` 拆出旅程日期、午餐／晚餐判斷；gaps 對鳥羽、伊勢的輸出和改之前一字不差。
- `scripts/lodging-dinner-access.mjs`（新）：住宿 `dinnerAccess`。
- `scripts/review-targets.mjs`（新）：補心得的對象清單。
- 工作用的 `data/cache/work/t8e-2/mdrep.mjs`、`append-md.mjs`（改 README、追加 log 時保留 CRLF）只是這一批的輔助，沒有放進 scripts/。

### WebSearch
- 主 session 0 次；讀文 subagent 3 次（伊勢シティ、キャッスルイン、道 各 1）。搜尋都有結果。

### 給補心得批次（T8e 第 3 批起）
- 對象清單 `data/cache/work/t8e-targets.json`，一批照 `batch` 欄位做；每筆的 `keywords` 已經照資料檔決定好，`chrome-actions.mjs --script tabelog-reviews --keywords <keywords>`、`--script google-reviews --keywords <食べログ沒結果的詞>`。
- 景點、住宿只做 Google（評価の低い順 10＋關鍵字搜尋）；住宿的楽天細項已經在 `ratings`（`rakutenService`…），不用再查。
- 住宿附設的 `-dining`（神宮会館、おく文、海の蝶）Google 評論是住宿本體的，讀的時候只取用餐相關的。

## 第 3 批：補心得 ise-geku 23 筆（2026-10-18）

### 範圍
- 對象清單 `data/cache/work/t8e-targets.json` 的 batch 1：餐廳 18（向井、虎丸、豚捨 若柳、鉄饌、酒場 森下、まめや、倭庵 黒石、柚、かみむら、町家バル、大喜、匠 PART2、ひびの、能代、炭火焼肉匠、ふぐや、一升びん、おく文）、景點 4（外宮參道、月夜見宮、河崎商人館、若松屋）、住宿 1（伊勢神泉）。
- 工作目錄 `data/cache/work/t8e-3/`：`batch.json`（id、食べログ、Google、關鍵字）、`notes/`、`notes-s/`（每筆的重點 JSON）、`notes-r.json`、`notes-s.json`、`patch-r.json`、`patch-r2.json`、`patch-l.json`、`dossier-merge.mjs`（工作用：把重點併進筆記的來源、重點、待確認、資料量，保留 CRLF）。

### 步驟
1. Chrome 1 個分頁（結束關掉；兩個網站的 localStorage 都 removeItem）。食べログ：每家 1 次 batch（最新 20＋關鍵字頁），第一頁 Cloudflare 會重新載入、讓第一個 JS 失敗，從 JS 那步重跑就好。Google：低分順 10＋食べログ 0 筆的關鍵字，和下一家的食べログ合併成 1 次 batch。每家約 1.5～2 次 batch。
2. 沒有遇到驗證碼、登入、封鎖。
3. 重點寫成 `notes/<id>.json`（固定標籤、不引用原文、日期換算成約略年份），`dossier-merge.mjs` 併進 `dossiers/`；回填用 `apply-patch.mjs`。

### 程式修正（`scripts/chrome/google-reviews.js`、`chrome-actions.mjs`；commit 155b916 和第 3 批收尾的 commit）
- 低分順沒套用：柚 クッチーナ 第一次抽到關聯度順（4、5 星混雜）卻沒有警告。加 `starsAscending` 檢查（附測試）→ 匠 PART2、一升びん 跳出警告；改送 pointer／mouse 事件（手動測試在一升びん 有效）；河崎商人館 還是不行，再加「等 0.7 秒才點選單項目」後成功。共同點是網址變成 `/place//@25.10…,121.52…` 的頁面。
- `search` 在 `open` 之後馬上跑，輸入框沒打開（かみむら）→ 再點一次。
- 住宿版型（おく文、伊勢神泉）：排序按鈕、星數「4/5」、常開的搜尋框、捲動才載入評論 → 都支援；分頁用 `.click()`（pointer 事件反而不切換）。
- `chrome-actions.mjs --store`：拿掉整行註解。執行中的修正是直接改 localStorage 裡的那份（字串替換），檔案同步改。

### 結果
- 23 筆筆記都追加了口コミ／評論（餐廳每家約 26～70 則，景點、住宿 8～15 則）。
- 回填：`accessibility.barrierFree` 4（豚捨 若柳、大喜、向井、鉄饌）、まめや `kids.kidsMenu: true`、伊勢神泉 `accessibility.elevator: true`；向井、虎丸 `kids.allowed` unknown → yes（overwrite，decisions-pending「👤 建議先看」）；conflicts：虎丸 seating、倭庵 黒石 kids。
- `questions.md` +11（3～5 年前的事實、經營變動、吸菸、樓梯、時段）。
- 讀法的例外：町家バル Google 漏搜「座敷」；若松屋 多搜「体験」；一升びん 另讀關聯度順 10 則；おく文 的 Google 是住宿本體，只取用餐相關。

### WebSearch
- 0 次（沒有開讀文 subagent）。

### 給下一批（第 4 批起：kurata・isuzugaoka・obata 15 筆）
- 直接用修好的 `google-reviews.js`（`--store` 第一次存，之後 `--stored`）；低分順有警告時截圖點「評価の低い順」再跑 `extract`。
- 食べログ和 Google 可以放同一個 batch（兩個網站的程式都存在各自的 localStorage）。
- `dossier-merge.mjs` 可以照抄這批的 notes JSON 格式（`data/cache/work/t8e-3/notes/*.json`）。

## 第 4 批：補心得 kurata・isuzugaoka・obata 15 筆（2026-10-18）

### 範圍
- 對象清單 `data/cache/work/t8e-targets.json` 的 batch 2：餐廳 11（オランジェ カフェウッド、クッカーニャ・トレ、リビエラ、つぼ銀、かぐら、とんかつ四十三番、さし汐、三玄、柚子、たまちゃん、パセプション）、景點 4（月讀宮、倭姬宮、神宮徴古館、松尾觀音寺）。沒有住宿。
- 工作目錄 `data/cache/work/t8e-4/`：`batch.json`（id、食べログ、Google、關鍵字、現有欄位）、`notes/`（每筆的重點 JSON，格式同第 3 批）、`notes-all.json`、`patch-r.json`、`patch-r2.json`、`q.md`、`d.md`；工作用腳本 `mk.sh`（串 chrome-actions 的輸出）、`up.cjs`（改 notes JSON）、`dossier-merge.mjs`（第 3 批的照抄）、`append-md.mjs`、`mdrep.mjs`（第 2 批的照抄）。

### 步驟
1. Chrome 1 個分頁（結束關掉；www.google.com、tabelog.com 的 localStorage 都 removeItem 並確認）。`chrome-actions.mjs --store` 第一次存程式，之後 `--stored`。食べログ（最新 20＋關鍵字）和上一家的 Google（低分順 10＋食べログ 0 筆的詞）放同一個 batch，每家約 1.5 次 batch，共 18 次 browser_batch。
2. 這批食べログ第一頁沒遇到 Cloudflare 重新載入；`google-reviews.js` 的低分順 15 筆都正確套用（沒有警告、不用截圖）。沒有遇到驗證碼、登入、封鎖、對話框。
3. 狀況：倭姬宮＋徴古館 放同一個 batch（26 個動作）時 browser_batch 逾時、結果沒回來（頁面其實跑完了），改成一個景點一個 batch 重做；さし汐 的 Google 那次擴充功能斷線 1 次，`tabs_context_mcp` 後重跑成功。
4. 重點寫成 `notes/<id>.json`，`dossier-merge.mjs` 併進 `dossiers/`（「資料量」併入原本的心得數，例如 Retty 8 則、HAMONI 2 則）；回填 `apply-patch.mjs`（先 `--dry-run`）；validate 通過後 commit 6102d6b。

### 結果
- 15 筆筆記都追加了口コミ／評論。
- 回填：`accessibility.barrierFree` 3（オランジェ、クッカーニャ・トレ、パセプション）；パセプション `seating` [] → zashiki・horigotatsu（overwrite，「👤 建議先看」）；柚子 seating 的口コミ衝突（2022 年 和室擺桌椅）寫進 `extra.conflicts`。
- `questions.md` +11。decisions-pending 4 列（1 列進「👤 建議先看」）。
- 讀法的例外：食べログ只有 5 年以上舊口コミ的詞當 0 筆（パセプション「冬」有補搜 Google，リビエラ「冬」沒補搜）；かぐら「子供」食べログ有 1 則，Google 沒搜。

### WebSearch
- 0 次（沒有開讀文 subagent）。

### 給下一批（第 5 批：naiku・asama・outskirts 25 筆）
- 一個 browser_batch 控制在約 20 個動作內（Google 2 家＋搜尋 5 個詞會逾時）。
- 住宿（第 5 批有 2 間）用住宿版型，程式已支援（第 3 批）。

## 第 5 批：補心得 naiku・asama・outskirts 25 筆（2026-10-18）

### 範圍
- 對象清單 `data/cache/work/t8e-targets.json` 的 batch 3：餐廳 18（ise-naiku 17＋ise-outskirts 味の來々軒）、景點 5（おはらい町、猿田彥神社、オカゲ屋敷、金剛證寺、朝熊山頂展望台）、住宿 2（宿屋五十鈴、おかげ参り宿場）。25 筆都做了，沒有跳過。
- 工作目錄 `data/cache/work/t8e-5/`：`batch.json`（id、食べログ、Google、關鍵字、現有欄位）、`notes/`（每筆的重點 JSON，格式同第 3、4 批，多了 `questions`）、`notes-a/b/c.json`、`patch-a.json`、`patch-b.json`、`patch-spots.json`、`patch-lodging.json`、`q.md`、`q-b.md`、`q-c.md`、`d.md`；工作用腳本 `mk.sh`、`up.cjs`、`dossier-merge.mjs`、`append-md.mjs`、`mdrep.mjs`（第 4 批照抄）。

### 步驟
1. Chrome 1 個分頁（結束關掉；tabelog.com、www.google.com 的 localStorage 都 removeItem 並確認）。`chrome-actions.mjs --store` 第一次存程式，之後 `--stored`；共 41 次 browser_batch（一次 13～21 個動作，沒有逾時）。食べログ（最新 20＋關鍵字）和 Google（低分順 10＋食べログ 0 筆的詞）照第 4 批的方式接在同一個 batch。
2. 狀況：すし久 的食べログ第一頁遇到 Cloudflare 重新載入（JS 那步失敗），從 JS 重跑就好；神宮会館（住宿版型）`open` 第一次逾時沒找到排序按鈕，重跑成功；おかげ参り宿場 的資料檔 Google（宇治浦田荘）沒有クチコミ分頁（0 則），改用 Google Maps 搜尋開另一棟「おはらい町通り荘」讀 2 則；截圖 2 次逾時（renderer 沒回應，沒影響）。`google-reviews.js` 的低分順 25 筆都正確套用（沒有警告，網址變成 `/place//@25.10…` 的頁面也正常）。沒有驗證碼、登入、封鎖、對話框。
3. 重點寫成 `notes/<id>.json`，`dossier-merge.mjs` 併進 `dossiers/`；回填 `apply-patch.mjs`（先 `--dry-run`）；分 3 次 validate、commit（餐廳 9、餐廳 9、景點住宿 7）。

### 結果
- 25 筆筆記都追加了口コミ／評論（餐廳每家約 25～60 則；神宮会館 dining 的食べログ全是住宿餐，團體午餐相關只有約 6 則；景點 3～20 則；住宿 2～10 則）。
- 回填：accessibility 9 家（barrierFree：とうふや、豚捨、岩戸屋、おく乃；note：角屋、ゑびや、寶来亭、海老丸、はいからさん）；いかだ荘、來々軒 `kids.allowed` unknown → yes、角屋・野あそび棚・はいからさん `seating` [] → 確定值（overwrite，「👤 建議先看」）；來々軒 `kidsMenu: true`；猿田彥神社 `stairs: 無`、朝熊山頂 `stairs: 少`、兩處 `toilets: true`；宿屋五十鈴 `accessibility.stairs` 補館內樓梯（overwrite）。conflicts：海老丸 seating、焼肉すだく バリアフリー vs 2F、とうふや 營業時間、猿田彥神社 stairs。
- 海老丸 `seating` 第一次誤用 overwrite（`["counter"]` → 3 種），照第 3 批 虎丸 的做法用 Edit 手動改回、conflicts 改寫（commit 前）。
- `questions.md` +11。decisions-pending 9 列（2 條進「👤 建議先看」）。
- 讀法的例外：食べログ只有 5 年以上舊口コミ的詞當 0 筆、Google 補搜（寶来亭、えび勢、野あそび棚、來々軒）；神宮会館 dining 多搜「昼食」、沒搜「2階」；オカゲ屋敷 多搜「子供」（評論多是 2026-07 改裝前）。

### WebSearch
- 0 次（沒有開讀文 subagent）。

### 給下一批（第 6 批：futami 11 筆）
- 住宿版型的 `open` 偶爾第一次找不到排序按鈕，直接重跑 `open` 就好。
- 資料檔 Google 連結沒有評論的住宿，先看候選或筆記有沒有別棟／別名的 Google 地點。
