# 志摩：餐廳候選名單（T9c）

- 依子地區分 3 批，候選全部寫進 `data/raw/shima/candidates/restaurants.json`，每筆有 `region`。只做候選，`restaurants.json` 由 T9d 建立（included 暫時 `pointId: null`，validate 只警告）。
- 納入標準：CONVENTIONS §4「餐廳候選納入標準」A～F、「判斷細則」，做法照 `data/raw/ise/log/T8c.md`。

---

## 第 1 批：shima-kashikojima、shima-ugata、shima-yokoyama、shima-spain

- 日期：2026-10-18。工作目錄 `data/cache/work/t9c-1/`。
- Chrome：1 個分頁，browser_batch 8 次（列表 15 頁）＋單獨的 navigate、javascript 約 10 次（DOM 調查、量回傳上限）；沒有遇到驗證碼、登入、封鎖（第一次開啟有 Cloudflare「請稍候」頁，等幾秒自動通過，沒有操作）。結束時 `localStorage.removeItem("__th_tabelog-list")`、關掉分頁。
- **WebSearch 5 次**、WebFetch 6 次（觀光三重 3 篇＋特集 2 篇、スペイン村カレンダー 1）、curl：觀光協會「食べる」列表 7 頁＋詳細 80 頁（`kanko-shima.mjs`，間隔 1.1 秒）。

### 工具（新增、修改）
- **新增 `scripts/chrome/tabelog-list.js`**（附 `scripts/test/tabelog-list.test.ts`）：食べログ列表頁的抽取。實測 **browser_batch 每個動作的回傳只留約 1,000 字**（20 家的 JSON 會被截斷），所以改成一店一行的壓縮文字（`id|店名|類別|分數|口コミ|定休|夜|昼|住所|個室|狀態|area|PR`），全文存在 `window.__thTabelogList`，回傳第 1 段（900 字）；`chrome-actions.mjs --script tabelog-list --parts 3` 接著讀第 2、3 段。各段原樣接起來存 `lists/<町>-<rt|room|kashikiri>-<頁>.txt`（我是把回傳貼進檔案；`[1/2]`、`[2]` 的段落標記 parseLines 會拿掉）。「条件を変えると」（`.list-alleviate`）之後的店不回傳。
- **新增 `scripts/lib/tabelog-list.mjs`**（parseLines：段落接回、檢查件數、#END）、**`scripts/restaurant-candidates.mjs`＋`scripts/lib/restaurant-cand.mjs`**（附 `scripts/test/restaurant-cand.test.ts`）：lists＋`rules.json` → 候選。
- **`scripts/candidates.mjs` 加 `add`**（`scripts/lib/candidates-add.mjs`）：候選檔不存在就建立；key 衝突預設不寫，`--replace` 原位取代。
- **`scripts/kanko-shima.mjs` 加 `--lists eat`**：觀光協會「食べる」→ `data/derived/kanko-shima-eat.json`（80 筆）。
- 修正：parseLines 0 件的篩選結果（坂崎 個室 0 件）不算錯誤；build 加 `regionDefaults`。

### 看過的食べログ列表
| 網址 | 件數 | 看到 |
|---|---|---|
| https://tabelog.com/mie/C24215/rstLst/?SrtT=rt（志摩市全體） | 549 | 1 頁（只為了拿町名代碼和 DOM） |
| https://tabelog.com/mie/C24215/C70665/rstLst/?SrtT=rt（阿児町神明）、/2/、/3/ | 53 | 全部 |
| https://tabelog.com/mie/C24215/C70665/rstLst/?SrtT=rt&ChkRoom=1&ChkSemiRoom=1 | 9 | 全部 |
| https://tabelog.com/mie/C24215/C70665/rstLst/cond09-00-00/?SrtT=rt | 14 | 全部 |
| https://tabelog.com/mie/C24215/C70661/rstLst/?SrtT=rt（阿児町鵜方）、/2/～/4/ | 161 | 1～80 名（到 3.06） |
| https://tabelog.com/mie/C24215/C70661/rstLst/?SrtT=rt&ChkRoom=1&ChkSemiRoom=1 | 27 | 1 頁（到 3.07；第 2 頁 7 家都在 3.07 以下，沒看） |
| https://tabelog.com/mie/C24215/C70661/rstLst/cond09-00-00/?SrtT=rt | 40 | 1 頁（到 3.11；第 2 頁在 3.11 以下，沒看） |
| https://tabelog.com/mie/C24215/C70674/rstLst/?SrtT=rt（磯部町坂崎）、/2/ | 26 | 全部 |
| 坂崎 個室篩選、貸切篩選 | 0、1 | 全部 |

- 3.10 未満的店沒有寫進候選（`rules.json` 的 `minScore`，同 T8c 第 2 批），例外是有 override 的 さざ波食堂（3.08，貸切）。

### 媒體、觀光（WebSearch 5 次）
1. 「観光三重 賢島 鵜方 グルメ ランチ 特集」（限 kankomie.or.jp）→ 海鮮丼特集（season/article/153，2023-09-01：志摩市 0 家）、report/1736（宝生苑）、report/1956（HIRAMATSU）。
2. 「志摩市観光協会 グルメ 特集 賢島 鵜方 おすすめ 店」→ 只有 4travel、じゃらん、まっぷる的地區列表（名錄型，不算），沒有觀光協會的特集。
3. 「まっぷる るるぶ 賢島 鵜方 グルメ ランチ おすすめ 志摩」→ まっぷる 的地區列表、店家頁（不是特集），沒用。
4. 「賢島 鵜方 美食 推薦 餐廳 志摩」（中文）→ 沒有中文部落格、媒體；ミシュランガイド 的 HIRAMATSU 飯店頁（`media`）。
5. 「kanko-shima.com グルメ 特集 志摩 てこね寿司 伊勢えび 牡蠣 食べられる店」→ 觀光三重 てこね寿司特集（article/178，2025-12-19：志摩市只有 大王荘，第 2 批）、グルメ大特集（article/194，2026-08-17：只有特產，沒有店）。
- 觀光協會的「食べる」（purpose_cate/eat）用 curl 抓（`kanko-shima.mjs`），是會員名錄、不算 B；營業時間、定休寫進 note。

### 納入判斷（第 2、3 批沿用）
- **子地區**：依住所的町名＋番地（`rules.json` 的 `regions`）。阿児町神明 680～760 番地、「賢島」字樣、阿児町鵜方 3618／3620／3626／943 → kashikojima（T9b 住宿的判斷：賢島大橋西側，座標離賢島較近）；鵜方 875 → yokoyama；其他鵜方、神明 → ugata；磯部町坂崎 → spain。神明 2180（パスタ屋 Michelle）、473、480（パールヴィレッジ、グランパ）等位置不確定，照規則放 ugata，T9d 看座標。
- **類型**：T8c 的對應表，新增 スペイン料理・ヨーロッパ料理・パスタ → 洋食・義式；バーベキュー → 燒肉・肉料理；ドーナツ・パンケーキ・サンドイッチ → 咖啡・甜點；カレーうどん → 烏龍麵・蕎麥；レストラン・ビュッフェ・丼・たこ焼き → 其他（`scripts/lib/restaurant-cand.mjs`）。
- **住宿本體**（食べログ類別是ホテル、料理旅館、オーベルジュ）：符合 A～C 的標 pending（reason 寫 lodging id、哪一條、觀光協會有沒有列營業時間）；飯店內**有自己店名**的餐廳（ラ・メール、浜木綿、山吹、リアン、マレナ）當一般的店收（included，note 寫「住宿附設，非住客用餐 T9d 確認」）——伊勢 T8b 的「ステーキの石かわ」同樣做法。
- **ゴルフ場的餐廳**（近鉄賢島カンツリークラブ）：「會員制」排除規則的「待確認」→ pending。
- **スペイン村**：官網カレンダー（パーク休園、ホテル休館）→ 子地區全部 excluded「旅程期間大多不營業」（`regionDefaults`）。
- **contexts**：工具的初步值；銀鱗、みやぎ野 列表只有午餐價位，但觀光協會有晚上的營業時間 → 加 dinner；ミラドール → lunch、snack、cafe。

### 數量
- 第 1 批收錄預定 35、pending 9。數量控制還沒套用（見 README「數量控制」）。

---

## 第 2 批：shima-isobe、shima-amanoiwato、shima-matoya、shima-anori、shima-kokufu

- 日期：2026-10-18。工作目錄 `data/cache/work/t9c-2/`。
- Chrome：1 個分頁，browser_batch 6 次（列表 30 頁＋關鍵字搜尋 2 頁）＋單獨的 javascript 1 次（町名代碼、確認磯部町只有 7 個町名頁）；沒有遇到驗證碼、登入、封鎖。結束時 `localStorage.removeItem("__th_tabelog-list")`、關掉分頁。
- **WebSearch 3 次**（限 kankomie.or.jp）、WebFetch 9 次（觀光三重 season/article/189、report/2129、topic/1104、report/1295、spot/22848、report/1992、report/2037、topic/1303、report/355，一篇一次）。沒有遇到搜尋沒結果、額度用完。

### 工具（修改）
- `scripts/restaurant-candidates.mjs` 的 rules 加 **`onlyRegions`**：只輸出指定子地區的店。「磯部町」關鍵字搜尋的頁面混到第 1 批的店（スペイン村、大田屋 鵜方支店），`candidates add` 會因 key 衝突整批不寫。附測試（`scripts/test/restaurant-cand.test.ts`）。

### 看過的食べログ列表（全部評分排序 `?SrtT=rt`；個室 `&ChkRoom=1&ChkSemiRoom=1`、貸切 `cond09-00-00`）
| 町 | 網址 | 件數（rt／個室／貸切） | 看到 |
|---|---|---|---|
| 阿児町安乗 | https://tabelog.com/mie/C24215/C70660/rstLst/ | 14／5／3 | 全部 |
| 阿児町国府 | https://tabelog.com/mie/C24215/C70662/rstLst/（＋/2/） | 24／2／1 | 全部 |
| 阿児町甲賀 | https://tabelog.com/mie/C24215/C70663/rstLst/ | 20／8／3 | 全部 |
| 阿児町志島 | https://tabelog.com/mie/C24215/C70664/rstLst/ | 3／—／— | rt 全部（沒有 3.10 以上的店，篩選沒看） |
| 磯部町穴川 | https://tabelog.com/mie/C24215/C70667/rstLst/ | 17／2／4 | 全部 |
| 磯部町恵利原 | https://tabelog.com/mie/C24215/C70669/rstLst/ | 3／0／0 | 全部 |
| 磯部町上之郷 | https://tabelog.com/mie/C24215/C70670/rstLst/ | 1／1／0 | 全部 |
| 磯部町迫間 | https://tabelog.com/mie/C24215/C70678/rstLst/ | 9／1／0 | 全部 |
| 磯部町的矢 | https://tabelog.com/mie/C24215/C70680/rstLst/ | 14／4／2 | 全部 |
| 磯部町渡鹿野 | https://tabelog.com/mie/C24215/C70683/rstLst/ | 9／2／0 | 全部 |
| 「磯部町」關鍵字 | https://tabelog.com/mie/C24215/rstLst/?SrtT=rt&sw=磯部町（＋/2/） | 36 | 全部；町名列表外的只有 お食事処 祭（第 2 頁沒有新店，沒存檔） |

- 食べログ的磯部町町名頁只有穴川、恵利原、上之郷、坂崎、迫間、的矢、渡鹿野 7 個；五知、築地、下之郷、山原、三ヶ所 等大字的店只能用關鍵字或座標找。阿児町（安乗、国府、甲賀、志島）沒有做關鍵字搜尋（「阿児町」會撈到鵜方、神明的幾百家）。
- 3.10 未満的店沒有寫進候選（同第 1 批），例外是有 override 的 はしもと、別亭 まとや、丸寅、丸定旅館、shima cafe。

### 媒體、觀光（WebSearch 3 次）
1. 「観光三重 的矢かき 牡蠣 食べられる店 特集」→ 的矢かきテラス report/1295（2022-11-07）、牡蠣特集 report/2129、topic/1104（2025-12-24，志摩的店 0）、いかだ荘 山上 spot/22848（營業時間 9:00～21:00、不定休，沒有非住客用餐的記載）。
2. 「観光三重 伊雑宮 磯部 うなぎ ランチ 志摩 安乗ふぐ」→ **あのりふぐ特集 season/article/189（2025-11-19：まるせい、丸寅、ひさだ，都有昼食營業時間）**。磯部的うなぎ（中六、川うめ）沒有觀光三重的特集。
3. 「観光三重 国府白浜 甲賀 志摩 カフェ ランチ 鮨 おすすめ」→ 阿児の松原 report/355（2018，シェブロン 11:00-21:00）、RVパーク topic/1303（2026-08-17，BALI HOUSE 昼夜、PaAni）、かき氷特集 report/2037（2025-06-17，shima cafe；id BOWL（国府1-13）食べログ列表上沒有）、絶景の飲食店 report/1992（志摩只有和具的トッポリーノ，第 3 批 wagu 用）。

### 納入判斷
- **子地區**：`rules.json` 的 `regions`（磯部町的矢・渡鹿野・三ヶ所 → matoya；恵利原 1000 番台以上 → amanoiwato；其他磯部町 → isobe；安乗 → anori；国府・甲賀・志島 → kokufu）。恵利原 240（板橋）、1421（えりはら）是推定。
- **F①（的矢牡蠣）**：比照浦村牡蠣的「特產聚落」，牡蠣類別的店依口コミ數取：かきテラス（A）、はしもと、別亭 まとや；佐藤養殖場 是かきテラス 同址（伴手禮＋食事處只收食事處）。
- **住宿本體**：同第 1 批標 pending（いかだ荘 山上、橘、はいふう、福寿荘、丸定旅館）；Grand Mercure 本體是バー類別 → 自動排除。**例外**：安乗的料理旅館 ひさだ（C）、丸寅（D①）included，根據是觀光三重 あのりふぐ特集的昼食營業時間（不是官網）。
- **D**：matoya、anori 週二午餐 0 家 → D①（丸定旅館 pending、丸寅 included）；森と海 附近沒有確定的晚餐 → D②（BALI HOUSE）；amanoiwato 沒有能補的店。E 沒有用（這 5 區沒有轉車的主要車站；志摩磯部站周邊的店是 川うめ 700 m）。
- **contexts**：照觀光協會、觀光三重的營業時間改：中六 lunch；川うめ、はま崎、まるせい、ひさだ、鮨暁、シェブロン、BALI HOUSE 加 dinner；別亭 まとや dinner。

### 數量
- 第 2 批 33 筆：included 16、pending 5、excluded 1、not-included 11。兩批合計收錄預定 51、pending 14。
