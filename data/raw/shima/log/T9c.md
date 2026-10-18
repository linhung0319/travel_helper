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

---

## 第 3 批：shima-daio、shima-tomoyama、shima-goza、shima-wagu、shima-hamajima、shima-sakko、shima-other

- 日期：2026-10-18。工作目錄 `data/cache/work/t9c-3/`。
- Chrome：1 個分頁，browser_batch 8 次（第 1 次是波切列表＋町名代碼的 DOM 調查；町名列表 rt 18 頁、個室・貸切篩選 14 頁、關鍵字搜尋 8 頁）；沒有遇到驗證碼、登入、封鎖。結束時 `localStorage.removeItem("__th_tabelog-list")`、關掉分頁。
- **WebSearch 3 次**（限 kankomie.or.jp）、WebFetch 8 次（觀光三重 season/article/178、report/1992、report/2225、report/997、topic/480、spot/376、report/993、report/305，一篇一次；spot/376 是鳥羽的總覽頁，沒用）。沒有遇到搜尋沒結果、額度用完。

### 工具
- 沒有改工具。數量控制原本預定 `add --replace` 整批重寫第 1 批，改成用 `candidates.mjs set` 只寫回有差異的 7 筆（`qc-patch.json`）；`t9c-1/rules.json` 加了 `thresholds`，重跑 build 和候選檔一致（重跑前先確認過：沒有 thresholds 的 build 和當時的候選檔 74 筆完全相同）。

### 看過的食べログ列表（全部評分排序 `?SrtT=rt`；個室 `&ChkRoom=1&ChkSemiRoom=1`、貸切 `cond09-00-00`）
| 町 | 網址 | 件數（rt／個室／貸切） | 看到 |
|---|---|---|---|
| 大王町波切 | https://tabelog.com/mie/C24215/C70690/rstLst/（＋/2/） | 29／1／3 | 全部 |
| 大王町畔名 | https://tabelog.com/mie/C24215/C70689/rstLst/ | 1／—／— | 全部（3.10 以上 0，篩選沒看） |
| 大王町船越 | https://tabelog.com/mie/C24215/C70692/rstLst/ | 11／3／0 | 全部 |
| 志摩町片田 | https://tabelog.com/mie/C24215/C70684/rstLst/ | 7／—／— | 全部（15 則以上 0，篩選沒看） |
| 志摩町御座 | https://tabelog.com/mie/C24215/C70685/rstLst/ | 19／—／— | 全部（同上） |
| 志摩町越賀 | https://tabelog.com/mie/C24215/C70686/rstLst/ | 10／4／4 | 全部 |
| 志摩町布施田 | https://tabelog.com/mie/C24215/C70687/rstLst/ | 11／—／— | 全部（同上） |
| 志摩町和具 | https://tabelog.com/mie/C24215/C70688/rstLst/（＋/2/） | 37／3／11 | 全部 |
| 浜島町塩屋 | https://tabelog.com/mie/C24215/C70693/rstLst/ | 1／—／— | 全部 |
| 浜島町南張 | https://tabelog.com/mie/C24215/C70694/rstLst/ | 2／—／— | 全部 |
| 浜島町迫子 | https://tabelog.com/mie/C24215/C70695/rstLst/（＋/2/） | 22／3／1 | 全部 |
| 浜島町浜島 | https://tabelog.com/mie/C24215/C70696/rstLst/（＋/2/） | 30／7／5 | 全部 |
| 浜島町桧山路 | https://tabelog.com/mie/C24215/C70697/rstLst/ | 2／—／— | 全部 |
| 阿児町立神 | https://tabelog.com/mie/C24215/C70666/rstLst/ | 6／1／2 | 全部 |
| 關鍵字 | https://tabelog.com/mie/C24215/rstLst/?SrtT=rt&sw=大王町、志摩町、浜島町、阿児町甲賀、阿児町立神、阿児町志島、阿児町安乗、阿児町国府 | 26／1／1／5／1／1／7／10 | 第 1 頁；比對結果 `kw/ago-keywords.txt`（町名外的只有 国府 的 ESSE 3.02／3）。「志摩町」「浜島町」只比對店名，結果是推薦的店，沒存檔 |

- 大王町的町名頁只有畔名、波切、船越（名田沒有）；志摩町 5 個、浜島町 5 個都有。
- 3.10 未満的店沒有寫進候選，例外是有 override 的 D、F（大万、どんぐり、槙之木、はまなぎ、磯人、海女の庭、縁、志摩半島、火場 広の浜、西口屋、味幸、きゅう、庄助）。

### 媒體、觀光（WebSearch 3 次）
1. 「観光三重 大王町 波切 浜島 和具 グルメ ランチ 海鮮 おすすめ」→ report/2225（2026-09-29 兜風路線：シェブロン 10:00～20:00（火～15:00）、まつむら、田中料理店）、report/997（2021，アクアフォレスト 夕食ビュッフェ）、海鮮丼特集（志摩 0）。另外直接 WebFetch 第 2 批記下的 season/article/178（大王荘）、report/1992（トッポリーノ）。
2. 「観光三重 伊勢えび 特集 食べられる店 志摩 浜島 御座 海女小屋」→ topic/480（海女の庭，2024-03-27）、spot/376（鳥羽的海女小屋總覽）、民宿 やまや、山万（spot 頁，住宿）。
3. 「観光三重 志摩地中海村 NEMU RESORT アマネム レストラン ランチ 日帰り」→ report/993（地中海村，2021-11-20：ココチャ、アスール 日帰り可）、report/305（NEMU，2022-10-12：里海、ロビーラウンジ）。アマネム 沒有觀光三重的記事。

### 納入判斷
- **子地區**：`rules.json` 的 `regions`（大王町船越、波切ともやま → tomoyama；波切・畔名・名田 → daio；御座・越賀 → goza；和具・布施田・片田 → wagu；浜島町迫子 → sakko；其他浜島町 → hamajima；阿児町立神 → other）。
- **景點的用餐不重複**：さとうみ庵（A）excluded，用餐見 spot（同鳥羽 はちまんかまど）。
- **F②**：海女小屋 磯人、海女の庭（御座）、火場 広の浜（和具）。
- **D①**：daio 週二（田中、十次郎 火休）→ しまや、Cafe.C.C、大万；hamajima 2/3、2/4、2/10（八代 休）→ ヨット、坂のうえ、西口屋；tomoyama A～C 0 家 → はまなぎ、どんぐり、槙之木（pending）；goza A～C 0 家 → 縁、志摩半島（pending）。料理旅館 高曽 列表只有晚餐價位，沒收。other 沒有能吃午餐的店，D 補不了。
- **D②**：登茂山的無晚餐住宿 → はまなぎ；OCEAN VILLA 倭 → 味幸；Small Resort 志摩 → 志摩半島；やどかり志摩 → 居酒屋きゅう、庄助。
- **住宿本體 pending**：アマネム（A）、志摩地中海村（C）、ニュー浜島（C）、大江戸温泉 伊勢志摩（C）、志摩半島、槙之木；館內有店名的餐廳 included。
- **排除**：メロンハウス かわぐち（月～金休，旅程 12 天裡 9 天）。
- E 沒有用（這 7 區沒有近鐵車站）。

### 數量
- 第 3 批 43 筆：included 24、pending 6、excluded 2、not-included 11。

---

## T9c 總結

- **候選 150 筆**：included 72、pending 20、excluded 13、not-included 45（三批：74＋33＋43）。
- **數量控制**：三批合計收錄預定 75 → shima-ugata 的 A 提高到 3.40（大田屋、おとべ、すず木 取消）→ 72。C 沒提高（保留鵜方站周邊的晚餐店）；能坐 15 人的店不受影響。
- **WebSearch：第 1 批 5、第 2 批 3、第 3 批 3，合計 11 次**（全部找觀光三重、觀光協會的特集；沒有找部落格心得）。沒有遇到搜尋沒結果、額度用完。
- **Chrome**：三批合計 browser_batch 22 次、單獨的 navigate／javascript 約 11 次；列表約 87 頁；沒有遇到驗證碼、登入、封鎖。
- **給 T9d**：分批 `data/cache/work/t9d-plan.json`（5 批，92 家），要確認的事見 README「給 T9d 的提醒」。
