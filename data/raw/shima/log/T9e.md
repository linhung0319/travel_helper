## T9e 志摩：收尾（anchors、dinnerAccess、缺漏檢查、地圖檢查，一批，2026-10-19）

- 範圍照任務卡（同 T4c、T7f、T8e 第 2 批）：餐廳 anchors（OSRM）、住宿 `dinnerAccess`、缺漏檢查、地圖檢查、README 整理（301 行 → 220 行）。summary／assessment 留給 T9f。
- 工作檔 `data/cache/work/t9e-1/`：`anchors.txt`／`anchors-report.json`（restaurant-anchors 的輸出）、`dinner*.txt`、`gaps-shima.md`、`coord-check.mjs`／`coord-check.txt`（座標、空白區）、`patch-spots.json`、`regress-*.json`／`gaps-*-before|after.md`／`dinner-*-before|after.txt`（工具改動的回歸）、`readme-restructure.mjs`（README 整理，一次性）。

### 1. anchors
- 先不寫跑一次（OSRM 494 次）：280 筆、estimate 51。看 estimate 的原因，分三類：
  1. **飯店館內**（志摩観光ホテル の ラ・メール、浜木綿、宝生苑、地中海村 的 RIAS／アスール）：OSM 沒有館內的路，吸附 150～400 m；距離都很近，直線估算可以。
  2. **OSRM 少了橋**：芳カツ亭→賢島站（OSRM 3,974 m）、shucafe→志摩神明站（1,885 m）、弁天荘→ラ・メール ザ クラシック（dinnerAccess，3,401 m）。Google 步行 750 m／900 m／1.2 km → 直線估算是對的，不動。
  3. **真的隔著海灣**：OSRM 和 Google 的步行距離一致 → 直線估算會讓人以為走得到，改照 OSRM（下表）。
- Google Maps 步行路線（`/maps/dir/?api=1&…&travelmode=walking`，Chrome navigate＋javascript 讀第一條路線的距離）抽查 10 組：

| 起 → 訖 | 直線 | OSRM | Google 步行 | 結論 |
|---|---|---|---|---|
| 芳カツ亭 → 賢島站 | 625 m | 3,974 m | 750 m（10 分） | OSRM 少橋，估算 |
| 賢島カンツリー → 横山展望台 | 1,576 m | 5,382 m | 5.6 km | 真的繞 |
| マレナ → 地中海村 | 1,518 m | 9,081 m | 9.0 km | 真的繞（英虞湾） |
| shucafe → 志摩神明站 | 585 m | 1,885 m | 900 m | OSRM 少路，估算 |
| 槙之木 → やどかり志摩 | 477 m | 6,449 m | 6.5 km | 真的繞（立神浦） |
| 庄助 → ともやま公園 | 2,413 m | 7,340 m | 7.4 km | 真的繞 |
| RIAS → 賢島站 | 1,334 m | 9,493 m | 9.5 km | 真的繞（英虞湾） |
| 的矢かきテラス → 渡鹿野対岸のりば | 2,236 m | 10,799 m | 10.0 km | 真的繞（的矢湾） |
| 檜扇荘 → マレナ | 400 m | 5,790 m | 5.7 km | 真的繞（賢島西側的半島） |
| 弁天荘 → ラ・メール ザ クラシック | 約 1 km | 3,401 m | 1.2 km（18 分） | OSRM 少橋，估算 |

- 工具（`scripts/lib/anchor-rules.mjs`＋`scripts/test/anchor-rules.test.ts`）：
  - 鳥羽 T4c 的 `REAL_DETOURS` 從 `restaurant-anchors.mjs` 搬過來，加志摩 15 組（上表的 6 組＋同一片水域的 RIAS／アスール→賢島港の住宿、的矢西岸 5 家→渡鹿野対岸）；`REAL_DETOUR_POINTS`（檜扇荘：所有繞路都是真的）、`REAL_DETOUR_REGIONS`（sakko↔kashikojima）。確認過的組合連吸附警告也照 OSRM（RIAS 在地中海村館內吸附 315 m，但 Google 的距離一樣）。
  - `ISLAND_ONLY`：鮨裕禅（間崎島）只和 間崎島、福寿荘（渡鹿野島）只和同島的 福寿荘・わたかの荘・はいふう 算。原本 鮨裕禅→賢島站「直線估算 30 分」、福寿荘→安乗埼灯台「53 分」都不是走得到的路。島上沒有車站時不再當掉（`nearSt` 是空的）。
  - 回歸：鳥羽 83、伊勢 108、二見 18 家 `--offline` 重算的 anchors 和資料檔一字不差。
- 結果（`--offline --write`）：**78 家 272 筆，osrm 237、estimate 35**；步行圈 41 家、需搭車 37 家；39 家有 30 分內的車站；每家 1～9 筆。需搭車照實算、60 分以上 7 筆（板橋→Grand Mercure 109、かきテラス→BBQ 集合地 135、いかだ荘 山上→安乗埼 70、丸定→伊雑宮 82、別亭 まとや→伊雑宮 79、庄助→ともやま公園 92、きゅう→志摩自然学校 93）。
- 的矢湾 BBQ 的座標改了之後（見 4.）重跑：渡鹿野対岸 的 OSRM 13 次。

### 2. 住宿 dinnerAccess
- `lodging-dinner-access.mjs shima`：meals none 14、breakfast 3、varies 23 共 40 間（dinner+breakfast 14 間不動；meals null 的 アネックス、UMILABO 工具跳過，留 null）。OSRM 141 次。
- 第一次的結果有 2 間錯：**やどかり志摩→槙之木「直線估算 8 分」walk**（Google 步行 6.5 km）、**檜扇荘→マレナ「7 分」walk**（Google 5.7 km）。工具改成也用 `pairRule`（key 是「餐廳>住宿」，`regions` 傳兩邊的子地區），並把直線估算的原因印出來（只印，不寫進資料）→ 兩間都改 car。
- 工具另外修：日期用 `toISOString()`（UTC）在日本上午會變成前一天 → 本地日期。
- 之後發現 `trip-hours.mjs` 沒算 closures（見 3.），改了以後 `--overwrite` 重算：walk／car 不變，7 間的 note 拿掉 ラ・メール ザ クラシック。
- **結果：walk 25、car 15**。car：わたかの荘、里創人倶楽部、民宿一葉、檜扇荘、はいふう、いかだ荘 山上、森源、ねぼーや、Kabuku、Tabist ヴィラダイオー、やどかり志摩、UMIBE、UMIBE Terrace、花多來、OCEAN VILLA 倭。
- T9c D② 的店：BALI HOUSE→森と海 14 分（walk）；ひでちゃん→Small Resort 19 分（walk）；味幸→倭 直線 2.9 km、はまなぎ→UMIBE 3.3 km、きゅう・庄助→やどかり 29 分以上（car）。T9c 寫「太遠的改 not-included」，但 3 組照樣 included（decisions-pending「👤 建議先看」）。

### 3. 缺漏檢查
- `restaurant-gaps.mjs shima` 第一次的每天午餐表和 T9d README 的表差在 kashikojima（ラ・メール ザ クラシック 2027-01-23～03-04 改裝，`closures` 有寫，工具沒算）。原因：`restaurant-gaps.mjs` 每天的家數自己讀 `hours`，`trip-hours.mjs` 的 `tripCount` 也沒看 closures（T9d 的 `final-stats.mjs` 有算）。
- 工具：`trip-hours.mjs` 加 `closedOn`、`slotsOn` 遇到 closures 回傳 []（測試加 1 個）；`restaurant-gaps.mjs` 每天的家數改用 `slotsOn`、加每天晚上的表、地區加上 `areas.json` 裡沒有店的子地區（amanoiwato、spain 才會出現）。回歸：鳥羽、伊勢、二見的 gaps 只多了晚上的表；三區的 dinnerAccess 輸出一字不差。`npm test` 110 個全過。
- 結論（和 T9d README 一致，T9d 的 +N? 不明的店工具不算）：
  - 每天 0 家：goza 晚餐；yokoyama 午晚（只有 ミラドール 喫茶）；other 午餐；amanoiwato、spain（沒有店）。
  - 特定日 0 家：wagu 2/7（日）晚餐；other 2/2・2/4・2/9・2/11 晚餐（只剩營業時間不明的 きゅう 不算）。
  - 只剩 1 家：goza 午餐 磯人（每天）；hamajima 2/3・2/10 午餐 ヨット；wagu 晚餐 ひでちゃん（日以外）、2/7 午餐 火場；daio 2/2・2/9 晚餐 大万。
  - **T9d 沒寫到的**：isobe 2/3・2/10（三）晚餐只有 川うめ（はま崎 水休）；matoya 2/2・2/3 晚餐 2 家（いかだ荘 山上、橘；別亭 まとや 休館、橘 2/2・2/3 晚餐官網已滿）；kokufu 週三午晚 2 家；kashikojima 週二三午餐 5 家。
  - fit15 yes 0 的子地區：yokoyama、kokufu、daio、tomoyama、goza、other（split 有：kokufu 2、daio 4、tomoyama 1、other 1）。
- **空白區**（`coord-check.mjs`：每個景點、住宿、車站到最近的午餐店、晚餐店（不含 `-dining`）直線距離，2 km 以上列出）：天の岩戸（午 3.2 km／晚 5.3 km）、御座 的景點 3 筆（真珠の里 午 2.1／晚 2.3 km、さとうみ庵 晚 2.4 km、パール美樹 晚 2.9 km）、民宿一葉・森源（晚 2.4～2.7 km）、Kabuku・花多來（甲賀・志島，2.0～2.3 km）、UMIBE 2 棟（晚 2.8 km）、OCEAN VILLA 倭（南張，2.8～2.9 km）、グリーンアドベンチャー（迫子，2.3 km）、近鉄 五知站（2.6 km）、沓掛站（晚 2.2 km）。只列出，不新增店。阿児町 7 個大字（鵜方、神明、立神、志島、甲賀、国府、安乗）都有食べログ町名頁（T9c 看過），座標上的空白是甲賀・志島（Kabuku、花多來）和立神（other）。

### 4. 地圖檢查
- 本機地圖檢視器：port 5199 已經被別的程序佔用（沒有動它），改用 `npx vite --port 5207 --strictPort`。志摩 車站 9、景點 24、住宿 56、餐廳 78（和資料檔一致），「檢查」0 件。縮放到 1 km 比例尺的整區截圖：點都在陸上或岸邊，渡鹿野島、間崎島的點在島上。
- 之後 Chrome 的截圖（screenshot、zoom）一直逾時（javascript、navigate 正常），所以沒有再看地圖，改用：OSRM 吸附距離（150 m 以上的都看過原因，見 1.）、`coord-check.mjs` 的「離子地區 center 3 km 以上、或更接近別的 center」（8 筆：はま崎（穴川）、どんぐり、UMIBE 2 棟（船越）、庄助・きゅう・やどかり（立神）、OCEAN VILLA 倭（南張），都和地址的大字一致）、Google 步行路線。
- **修正 1 筆**：`shima-matoya-bbq-cruise` 的座標是 T9a 取的 Google「大東丸観光」（渡鹿野島上，OSRM 吸附 448 m），但集合地是對岸（安乗側）的渡船場（じゃらん、讀文）→ Google Maps 查「渡鹿野渡船場 志摩市阿児町国府」得到「渡鹿野島対岸渡船のりば」（cid 4556790400064677513、阿児町国府3584、[136.8793042, 34.355704]，和觀光三重原座標差約 60 m），`apply-patch.mjs` overwrite，舊值寫 `extra.conflicts`。
- T9c、T9d 推定子地區的 3 家（Michelle 神明 2180-6、まんぷく食堂 板橋 恵利原 240、槙之木 波切ともやま 2235-13）都已經是 Google 的座標（`links.googleMaps` cid），和子地區一致。子地區 `center` 沒改（decisions-pending）。
- Chrome 操作合計：本機地圖 navigate 2、截圖・放大約 15 次（成功 6 次，其餘逾時）；Google Maps 地點 1 次、步行路線 10 次（navigate＋javascript）。沒有驗證碼、登入、封鎖、對話框。第一個分頁截圖逾時後換新分頁時，`tabs_create_mcp` 開的一個空白分頁在關掉舊分頁後脫離了分頁群組，工具關不到（「新分頁」，沒有內容）。結束時關掉自己的分頁、停掉 dev server。

### WebSearch
- 0 次。

### 給 T9f
- `accessEase`、住宿 `meals` 可以直接看 `dinnerAccess`（car 15 間）、anchors（需搭車 37 家的分鐘數只代表附近有什麼）；離島 2 家（鮨裕禅、福寿荘）要搭船。

## 從 README 搬來的舊段落（T9e，2026-10-19，原文）
README 超過 200 行，T9e 把已經過時的段落原文搬到這裡（沒有改寫）。現況以 README 為準。

### 舊的檔案地圖（README 第 5～31 行）
| 檔案 | 內容 |
|---|---|
| `candidates/spots.json` | 景點候選 110 筆（included 24、not-included 60、excluded 26）。每筆有 `region`、`status`、`reason`、`mentions`（觀光三重、觀光協會、官網的頁面）、`note`（讀文結論）。included 24 筆都有 `pointId`。用 `scripts/candidates.mjs list shima spots` 過濾，不要整份讀 |
| `data/derived/kanko-mie-shima.json` | 觀光三重「見る・遊ぶ」志摩市 118 筆（`scripts/kanko-mie.mjs fetch shima`；名稱、類別、住所、座標、官網） |
| `data/derived/kanko-shima.json` | 志摩市観光協会「観る・遊ぶ」「体験する」141 筆（`scripts/kanko-shima.mjs fetch`，T9a 新增；エリア、タグ、住所、電話、営業時間、定休日、料金、アクセス原文） |
| `data/cache/work/t9a-plan.json` | 景點批次的分組（`batch: 1` 是第 2 批、`batch: 2` 是第 3 批）：`[{batch, region, ids}]` |
| `data/cache/work/t9a-1/` | 第 1 批的工作檔：`build-candidates.mjs`（候選的組裝表，一次性）、`regions.json` |
| `data/cache/work/t9a-2/` | 第 2 批的工作檔：`batch.json`、`prompt-common.md`（讀文共同規則，第 3 批可以照抄）、`facts/`、`google.jsonl`、`photos.json`、`judgement.json`（`build-spots.mjs` 的輸入）、`rv-*.json`（Google 評論重點）、`add-reviews.mjs`（把評論重點加進筆記的小工具） |
| `data/cache/work/t9a-3/` | 第 3 批的工作檔（格式同第 2 批）：`judgement-src.mjs`（產生 `judgement.json`）、`patch-facts.json`（apply-patch）、`cand-*.json`（candidates set）、`list-notes.txt`（Google 列表的其他候選） |
| `candidates/lodging.json` | 住宿候選 147 筆（included 56、not-included 79、excluded 11、pending 1）。楽天 SimpleHotelSearch 16 個子地區中心 3 km（志摩市內 142 間）＋じゃらん列表上沒上楽天的 5 間；每筆 note 有楽天番号、房數、2/2・2/3 的 15 人組合、2/2 一間可住人數 |
| `data/cache/work/t9b-1/` | T9b 的工作檔：`rk/`（楽天 detail、party-*.json、kids.json、rooms-N.json）、`google.jsonl`、`photos.json`、`facts/`、`judgement-src.mjs`（產生 `judgement.json`，`build-lodging.mjs` 的輸入）、`build-candidates.mjs`、`rv/`（Google 評論重點）、`reports.md`（讀文 subagent 的回報） |
| `candidates/restaurants.json` | 餐廳候選 150 筆（T9c，三批寫同一個檔：included 72、pending 20、excluded 13、not-included 45）。key 是 `tabelog-<店家 ID>`、`pointId` 還是 null（T9d 用 `candidates.mjs export --ids` 指定 id）。用 `scripts/candidates.mjs list shima restaurants` 過濾 |
| `data/derived/kanko-shima-eat.json` | 志摩市観光協会「食べる」80 筆（`scripts/kanko-shima.mjs fetch --lists eat`，T9c）：住所、營業時間、定休日原文。**會員名錄，不算 B 的推薦**，只當營業時間的參考 |
| `data/cache/work/t9c-1/` | T9c 第 1 批的工作檔：`lists/*.txt`（食べログ列表的抽取結果，一頁一檔）、`rules.json`（子地區規則、override、mentions；`restaurant-candidates.mjs build` 的輸入）、`new.json`（輸出）、`day-check.mjs`（每天有幾家沒公休，一次性） |
| `data/cache/work/t9c-2/` | T9c 第 2 批的工作檔（格式同第 1 批；`rules.json` 多了 `onlyRegions`，`lists/isobekw-rt-1.txt` 是「磯部町」關鍵字搜尋） |
| `data/cache/work/t9c-3/` | T9c 第 3 批的工作檔（格式同第 2 批）；`kw/ago-keywords.txt`（阿児町、大王町 等關鍵字搜尋的比對）、`qc-patch.json`（數量控制寫回的 7 筆）、`t9c-1-rules.before.json`（加 thresholds 前的第 1 批 rules） |
| `data/cache/work/t9d-plan.json` | T9d 的分批：`[{batch, regions, count, pending, keys}]`（included＋pending 92 家，5 批） |
| `data/areas/shima/restaurants.json` | 餐廳資料點 78 筆（T9d 完成；第 1 批 13 筆、第 2 批 24 筆、第 3 批 19 筆、第 4 批 13 筆、第 5 批 9 筆） |
| `data/cache/work/t9d-1/`～`t9d-5/` | T9d 第 1～5 批的工作檔（見「餐廳」的 T9d 一節） |
| `ig-notes.md` | 餐廳的 IG 帳號（T9d，沒有打開 IG） |
| `questions.md` | 要打電話、人工確認的事 |
| `log/T9a.md` | T9a 的過程紀錄 |
| `log/T9b.md` | T9b 的過程紀錄（楽天查詢、Chrome、讀文、WebSearch 次數） |
| `log/T9c.md` | T9c 的過程紀錄（看過的食べログ列表網址、媒體、WebSearch 次數） |
| `log/T9d.md` | T9d 的過程紀錄（各批的 Chrome 操作、讀文、口コミ、WebSearch 次數） |

### 景點「給 T9b 住宿的建議」（T9a）
- **第一晚（2/2）18:35～18:40 才到鵜方、賢島**，要住賢島、鵜方步行或接送範圍內；賢島 6 筆景點都在站前，賢島住宿最方便。
- 南部（大王、登茂山、御座、浜島、迫子）沒有電車、巴士 1 小時 1 班以下：以賢島、鵜方為據點、包車日歸，或在南部住一晚。南部的候選：**志摩地中海村**（本身是住宿，住客免入村料、可逛住客限定區，但官網寫非無障礙、石板路階梯多，長輩要評估）、NEMU RESORT（迫子，候選 not-included）、御座・和具・浜島 的民宿（一泊二食、海鮮，T9b 用楽天撈）。
- 前島半島（御座・越賀・和具）的民宿適合排「真珠體驗＋さとうみ庵」的一天；大王・登茂山 適合「燈塔＋天ぱく＋桐垣夕陽」（2 月日落約 17:20，桐垣在 17 時前就有夕陽）。

### 住宿「給後續的建議」的 T9c／T9d、T9e 兩條（T9b；T9f 那條留在 README）
- **T9c／T9d（餐廳）**：不含晚餐或方案不同的住宿集中在賢島站周邊（ベイガーデン、ハーバー）、鵜方站周邊（クインテッサ、ビジネスホテル、アネックス、藤）、志摩神明（Villa ISE shima）和包棟（UMIBE、LOG、森と海、やどかり、Small Resort、倭）：第一晚 19 時以後能吃的晚餐要特別找。
- **T9e**：跑 `node scripts/lodging-dinner-access.mjs shima --write`（現在沒有 restaurants.json，工具會跳過）。

### 餐廳 T9d 的「D 補上的（T9c）都確認過」、「給 T9e」那條
- **D 補上的（T9c）都確認過**：hamajima 2/3・2/4・2/10 的 ヨット 有營業（火休）；daio 週二的 Cafe.C.C、大万；anori 週二的 ひさだ、丸寅（非住客午餐、不定休）；goza、tomoyama 照上面。
- **T9e**：78 筆的 `anchors`（OSRM）、缺漏檢查、地圖檢查；住宿的 `dinnerAccess`（`lodging-dinner-access.mjs`）——D② 的 味幸（OCEAN VILLA 倭）、はまなぎ（ともやま 等）、BALI HOUSE（森と海）、庄助・きゅう（やどかり志摩）距離是重點；**大江戸 `-dining` 是住宿附設，照判斷細則不算 dinnerAccess**。子地區推定的座標（神明 2180、恵利原 240、波切ともやま 2235）用 Google 座標確認。ESSE（国府、3.02／3）在缺漏檢查時看。

### T9c 的現況（README 第 226～301 行，原文）
#### 現況（T9c 完成：候選 150 筆，收錄預定 72、pending 20）
- **母體**：食べログ町名列表（評分排序）志摩市 27 個町名頁全部看過（阿児町 7、磯部町 7、志摩町 5、大王町 3、浜島町 5；鵜方 161 家只看到 3.06），3.10 以上而且 15 則以上的店再看個室（含半個室）、貸切可篩選；沒有町名頁的大字用關鍵字搜尋補（「磯部町」找到 お食事処 祭；「阿児町<大字>」只多 ESSE（3.02，沒記）；「大王町」0；**「志摩町」「浜島町」關鍵字只比對店名，不能用**）。3.10 未満的店不記，例外是 D、F 的 override。觀光三重的特集、報導＋觀光協會「食べる」（會員名錄，不算 B，只用營業時間）；Google 沒查（同 T8c）。看過的網址、WebSearch 次數見 `log/T9c.md`。
- **工具**：`scripts/chrome/tabelog-list.js`（列表抽取）→ `lists/*.txt` → `scripts/restaurant-candidates.mjs build`（A～C、類型、contexts、排除、同類型上限照規則算；D～F、pending、子地區、`onlyRegions`、`thresholds` 由 `rules.json` 寫）→ `scripts/candidates.mjs add`。工作檔 `data/cache/work/t9c-1/`～`t9c-3/`（`rules.json` 是判斷的全部紀錄）。
- **子地區**：照住所的大字＋番地（各批 `rules.json` 的 `regions`）。推定的：神明 2180、473、480（ugata）、恵利原 240（isobe）、「波切ともやま」（tomoyama），T9d 看座標。

| 子地區 | 候選 | included | pending | excluded | not-included | criteria（included） |
|---|---|---|---|---|---|---|
| kashikojima | 20 | 8 | 7 | 1 | 4 | A 7、A＋C 1 |
| ugata | 45 | 23 | 2 | 1 | 19 | C 17、A＋C 4、A 2 |
| yokoyama | 1 | 1 | 0 | 0 | 0 | A 1 |
| isobe | 10 | 4 | 0 | 0 | 6 | A＋C 2、A 1、C 1 |
| spain | 8 | 0 | 0 | 8 | 0 | —（休園） |
| amanoiwato | 0 | 0 | 0 | 0 | 0 | — |
| matoya | 11 | 3 | 5 | 1 | 2 | A＋F① 1、F① 2 |
| anori | 4 | 4 | 0 | 0 | 0 | A＋C 2、C 1、D① 1 |
| kokufu | 8 | 5 | 0 | 0 | 3 | A＋C 1、A 1、C 2、D② 1 |
| daio | 6 | 5 | 0 | 0 | 1 | A＋C 1、C 1、D① 3 |
| tomoyama | 4 | 2 | 1 | 0 | 1 | D①＋D② 1、D① 1 |
| goza | 5 | 3 | 1 | 1 | 0 | F② 2、D① 1 |
| wagu | 6 | 3 | 0 | 0 | 3 | A 1、C 1、F② 1 |
| hamajima | 9 | 5 | 2 | 1 | 1 | A＋C 1、D① 3、D② 1 |
| sakko | 10 | 4 | 2 | 0 | 4 | A＋C 1、A 2、C 1 |
| other | 3 | 2 | 0 | 0 | 1 | D② 2 |
| **合計** | **150** | **72** | **20** | **13** | **45** | 含 A 29、C 37、D 14（D① 10、D② 5）、F 6（F① 3、F② 3）；B、E 0 |

- **B、E 都是 0**：mentions 全部是觀光三重（1 種來源），志摩市観光協会沒有餐廳的精選特集；E 的「主要車站」只有鵜方、賢島，店都在 A～C 裡。over-limit 0（同類型最多是 ugata 的和食・割烹）。
- **各區的店**（第 1、2 批的細節見 `log/T9c.md`）：
  - kashikojima 8：志摩観光ホテル的 ラ・メール、ラ・メール ザ クラシック、浜木綿、山吹、リアン，都リゾート マレナSHIMA，イワジン喫茶室，芳カツ亭（前 6 家是飯店內的餐廳）。
  - ugata 23：A——東山物産、宮本；A＋C——とばり、鯛、長太屋、大家族；C——おとや、みやま亭、磯っ子、わさび、エドイチ、Michelle、PIZZICA、うえむら、いちや、ノルポル、shucafe、みやぎ野、ろっぽん木、しまかぜ、京城、伊鈴屋、銀鱗。
  - isobe 4：中六、まんぷく食堂 板橋、川うめ（個室 2〜30）、はま崎。matoya 3：的矢かきテラス、はしもと、別亭 まとや。anori 4：灯台カフェ、まるせい、ひさだ、丸寅。kokufu 5：鮨暁、ポンチーズ、シェブロン、まつむら、BALI HOUSE。
  - **daio 5**：田中料理店（A＋C 3.33／59，かつお茶漬け，火休）、漁師料理十次郎（C，個室・貸切）、D①：しまや（うなぎ・寿司）、Cafe.C.C（月休）、**大王荘の お食事処 大万**（觀光三重 てこね寿司特集：漁師ずし御膳 1,100 円；水休）。
  - **tomoyama 2＋pending 1**：A～C 0 家 → D①：レストラン はまなぎ（都リゾート アクアフォレスト 館內，也是 D②）、喫茶 どんぐり（UMIBE 旁）；槙之木（ホテル槇之木，pending）。
  - **goza 3＋pending 1**：さとうみ庵（A 3.51）是景點 → excluded（用餐見 spot）；F② 海女小屋 磯人、海女の庭（觀光三重 2024：ランチ 1,500 円當天可、コース 4,980 円～）；D① 縁；志摩半島（料理旅館，個室 10〜20，pending）。
  - **wagu 3**：お食事処 ひでちゃん（A 3.39／50，日休）、鮨裕禅（C，昼夜 30,000 円～，オーベルジュ）、F② 海女小屋 火場 広の浜。トッポリーノ（3.22／11，觀光三重 絶景の飲食店 2025）沒達門檻。
  - **hamajima 5＋pending 2**：網元の店八代（A＋C 3.52／127，水休＋第 1・3 木）、D①：磯料理ヨット（3.22／65，火休）、坂のうえ（定休不一致）、西口屋；D② 味幸（晚餐 17～22 時，個室 4〜6）。pending：ニュー浜島、大江戸温泉 伊勢志摩。メロンハウス かわぐち excluded（月～金休）。
  - **sakko 4＋pending 2**：リアス バイ ココチャ（A＋C 3.60／90，地中海村，日帰り可）、アマネムダイニング（A 3.56／91，夜 100,000 円～）、タベルナ・アスール（A，ランチ只有土日祝，2021 資料）、**里海**（C，HOTEL NEMU，**個室 2〜20 人**）。pending：アマネム 本體、志摩地中海村 本體。カフェ アミーゴ 3.29／117 差 A 一點。
  - other 2：D② 居酒屋きゅう、居酒屋 庄助（やどかり志摩 附近）。
- **住宿本體 pending 20**：kashikojima 7（宝生苑、志摩観光ホテル、ベイスイート、はな屋、都リゾート、HIRAMATSU、賢島カンツリー）、ugata 2（プロヴァンス、フィオーレ志摩）、matoya 5（いかだ荘 山上、橘、はいふう、福寿荘、丸定旅館）、tomoyama 1（槙之木）、goza 1（志摩半島）、hamajima 2（ニュー浜島、大江戸）、sakko 2（アマネム、地中海村）。飯店內有自己店名的餐廳當一般的店 included（note 寫「住宿附設，非住客用餐 T9d 確認」）。
- **excluded 13**：スペイン村 8（休園）、ばさら邸、志摩醸造（ビアバー）、Grand Mercure 本體（バー類別）、さとうみ庵（景點）、メロンハウス（月～金休）。

#### 數量控制（第 3 批套用）
- 三批合計收錄預定 75（第 1 批 35、第 2 批 16、第 3 批 24）→ 照第 1 批的決定**只提高 ugata 的 A 到 3.40**：大田屋 鵜方支店、おとべ、すず木 改 not-included（reason「A 因數量控制（3.40）取消」）；おとや、みやま亭、磯っ子、わさび 剩 C → **72**。
- C 沒有提高（3.20 會再少約 10 家，多是鵜方站周邊、第一晚的晚餐店）；A 再提高也只會少宮本 1 家，所以停在 72（比約 70 多 2，CONVENTIONS「超過一些可以接受」）。能坐 15 人的店不受影響。店少的 14 個子地區沒動，缺口照 D 補。
- 做法：`t9c-1/rules.json` 加 `thresholds: {"shima-ugata": {"aScore": 3.4}}` 重跑 build，差異 7 筆用 `candidates.mjs set`（`t9c-3/qc-patch.json`）寫回。

#### 第一晚（2/2，週二）的晚餐
- **結論：在鵜方站下車吃最穩**（18:35 到）。週二有營業、19 時以後還能點餐的收錄預定店（觀光協會「食べる」）：**日本料理 鯛**（站 3 分，16:30～21:30，月休，**個室 2〜30 人** → 15 人一起的第一候選）、長太屋（站 5 分，～21:00，個室 4〜8）、磯っ子（～22:00）、銀鱗（～23:00，無休）、みやぎ野（～21:30）、みやま亭（L.O. 19:30）、LA PIZZICA（～21:00）、大家族、焼肉うえむら（個室 2〜20，時間 T9d 查）。分 3 組時鯛＋長太屋＋磯っ子／銀鱗 可以同時在站周邊。
- 2/2 週二公休：東山物産、とばり、おとや、宮本、ノルポル、京城、伊鈴屋。
- **賢島站（18:40 到）**：晚上只有飯店內的餐廳（志摩観光ホテル 17:30～20:30 L.O.、20,000 円以上、限小學生以上；マレナSHIMA 週二只有法式）。賢島沒有平價的晚餐店。
- 數量控制刷掉的 3 家（大田屋、おとべ、すず木）都不是晚餐店，第一晚的候選沒變。

#### 旅程期間每天有幾家（`t9c-1/day-check.mjs`：食べログ列表的定休，再對觀光協會的定休手算）
- **午餐 0 家的日子**：
  - **matoya 週二（2/2、2/9）**：かきテラス、はしもと 都火休，只剩住宿本體（いかだ荘 山上、橘、丸定旅館，pending）。T9d 確認不到的話週二不排的矢湾，或到 isobe（川うめ、中六）。
  - **amanoiwato、shima-other 每天 0 家**：子地區裡沒有能吃午餐的店（只有麵包店），D 補不了；amanoiwato 最近的是 isobe 的 川うめ（車 10 分），other 是零散的子地區。
  - spain：整區休園，不用補。
- **只靠 D 補上的日子**：anori 週二（丸寅、ひさだ）、daio 週二（Cafe.C.C、大万；田中、十次郎、しまや 都火休）、hamajima 2/3、2/4、2/10（ヨット；八代 水休＋第 1 木）、goza、tomoyama 全部（A～C 0 家）。
- 最少的：kashikojima 週三午餐 1 家（ラ・メール ザ クラシック；觀光協會寫リアン、山吹 無休，T9d 確認）、goza 週三（磯人；縁 水休、海女の庭 的定休不明）、wagu 週日（鮨裕禅、火場；ひでちゃん 日休）、sakko 平日午餐只有 ココチャ（アスール 土日祝）。
- **晚餐**：goza **每天 0 家**（只有 pending 的志摩半島；景點 さとうみ庵 11:00～20:30 L.O.19:00 完全預約制）；tomoyama 只有 はまなぎ（非住客未確認）；matoya 只有 別亭 まとや（2/2 Grand Mercure 休館）；daio 週二只有大万、週三只有田中；hamajima 週二、三 1 家；isobe、kokufu 2～3 家；ugata 每天 12 家以上。這些子地區的住宿大多是一泊二食。
- 2/11（週四、祝日）：收錄店沒有「祝日休」；木休的是 グリルエドイチ、LA PIZZICA、長太屋（觀光協會）。2/4 是第 1 木（八代 休）。

#### 不含晚餐的住宿附近（D②）
- 第一晚的鵜方站周邊、賢島站周邊、Villa ISE shima：附近都有收錄預定的晚餐店，D② 沒用（賢島只有高價的飯店餐廳）。
- **用了 D② 的**：森と海（国府）→ BALI HOUSE；**リゾートパーク ともやま、Tabist ヴィラダイオー、UMIBE／UMIBE Terrace（登茂山）→ レストラン はまなぎ**（波切的 田中料理店、大万 開車約 10 分）；**OCEAN VILLA 倭（南張）→ 味幸**（浜島市街）；**Small Resort 志摩（越賀）→ 志摩半島（pending）**；**やどかり志摩（立神）→ 居酒屋きゅう、庄助**。距離 T9e 用座標算（`lodging-dinner-access.mjs`），太遠的改 not-included。
- LOG（安乗）、花多來・ねぼーや（甲賀）、Kabuku（志島）附近有 まるせい、ひさだ、まつむら、鮨暁。

#### 15 人
- 列表寫明個室 15 人以上：**日本料理 鯛（2〜30）**、**川うめ（2〜30、30 人以上可）**、おとや（10〜20）、焼肉うえむら（2〜20）、**里海（2〜20，NEMU）**；pending 的料理旅館 橘（30 人以上）、志摩半島（10〜20）。個室有但沒寫人數的 T9d 看店家頁的席數、最大予約人數。
- 南部（daio～sakko）全員午餐的候選很少：田中料理店、十次郎、八代、ココチャ（貸切可）、鮨裕禅（貸切），其他都要 T9d 看席數。

#### 給 T9d 的提醒
- **分批**：`data/cache/work/t9d-plan.json`（`[{batch, regions, count, pending, keys}]`，included＋pending 92 家）——1：kashikojima＋yokoyama 16（pending 7）；2：ugata 25（2）；3：isobe＋matoya＋anori＋kokufu 21（5）；4：daio＋tomoyama＋goza＋wagu＋other 17（2）；5：hamajima＋sakko 13（4）。可以拆成 2 個並行 session（例如 1・2 和 3～5）。
- **pending 要先確認的事**（非住客能不能用餐，判斷細則 F③：官網、訂房網要有非住客方案或用餐營業時間）：住宿本體 20 筆（見上）；賢島カンツリー（不打球能不能吃）；HIRAMATSU、アマネム 是高價的住宿餐廳。
- **included 但要確認的**：飯店內的店（志摩観光ホテル 5 家、マレナ、はまなぎ、里海、アマネムダイニング、ココチャ、アスール、鮨裕禅、別亭 まとや）的非住客用餐、年齡限制（志摩観光ホテル 限小學生以上）、2/2 的營業；安乗 ひさだ、丸寅 的非住客午餐（來源是觀光三重，不是官網）；**海女小屋 3 家（磯人、海女の庭、火場 広の浜）的營業、預約、人數**（海女の庭 食べログ的定休欄被截斷）；大万（大王荘）是不是對外營業的食事處。
- **營業時間、定休要看官網的**：觀光協會和食べログ不同的（リアン、山吹、京城、伊鈴屋、LA PIZZICA、長太屋、坂のうえ（食べログ 月～金休 vs 觀光協會 月休））；シェブロン（**觀光三重 2026-09-29：10:00～20:00、火 10:00～15:00** → 晚上有營業，可以修 contexts）、まつむら（同文：11:00～14:00、17:00～20:30）、まるせい 的火休；タベルナ・アスール 平日午餐（2021 資料只有土日祝）；NEMU 2026-04 改裝後的 里海；横山 ミラドール（展望台工期）。
- **座標**：子地區是推定的（神明 2180 等、恵利原 240、波切ともやま 2235）、D② 的距離；渡鹿野島「カフェ・レストランかいげつ」是不是福寿荘 館內；ESSE（国府3489，森と海 旁，3.02／3）在 T9e 缺漏檢查時再看。
