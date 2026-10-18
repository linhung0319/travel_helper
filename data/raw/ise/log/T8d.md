## T8d 餐廳詳細資料（伊勢＋二見，分 6 批）

- 分批照 `README.md`「給 T8d 的建議」：1 ise-naiku 正餐 25＋待確認 神宮会館、伊久／2 ise-naiku 咖啡・甜點、小吃 17＋ise-asama 4／3 ise-geku 晚餐為主 19／4 ise-geku 其餘 19＋待確認 おく文／5 ise-kurata 8＋ise-outskirts 3／6 二見 17＋待確認 3。
- 資料寫 `data/areas/ise/restaurants.json`（二見寫 `data/areas/futami/restaurants.json`）。每批在候選清單填 `pointId`、拿掉 `detailPending`；其他批次的條目不動。
- `summary`／`assessment`／`tier` 留給 T8f，`anchors` 留給 T8e（這幾批都是 `anchors: []`、`tier: null`）。

## 第 1 批：ise-naiku 正餐＋待確認 2（2026-10-18）

### 結果
- 收錄 **26 筆**：正餐 25（烏龍麵 7、燒肉・肉料理 5、海鮮丼 4、壽司 3、定食・食堂 2、和食・割烹 2、牡蠣 1、洋食 1）＋ `ise-jingu-kaikan-dining`（神宮会館 團體昼食）。
- 待確認的住宿本體：**神宮会館 → 收錄**（官網昼食頁「神宮参拝の昼食に」「団体10名様より」，F3＋C）；**いにしえの宿 伊久 → excluded**（官網 FAQ 不做午餐、日帰り入浴限住客，沒有非住客晚餐的來源）。兩項都寫進 `docs/decisions-pending.md`。
- fit15：yes 9（すし久 最大宴會 70、ゑびや大食堂 貸切 50 以上、海老丸・とうふや 備考「団体…対応」、えび勢 貸切 20 以下／宴會 28、カキアキ 最大予約 50、おく乃 コース 1～16 名、すだく 貸切 20～50、神宮会館 10 名以上）、split 6（角屋、野あそび棚、寶来亭、一升びん、いかだ荘、はいからさん）、no 1（伊勢醤油本舗 5 席）、unknown 10（不能預約的店：ふくすけ、奥野家、岡田屋、手こね茶屋 2 家、中井屋、川西屋、海さち山さち、参宮亭、まるよし）。
- **晚餐**：這 26 家只有 焼肉すだく（到 21:00，週三休）、えび勢（到 18:00，之後只有前一天前預約的套餐）、カキアキ水産（到 18:00）營業到 17:00 以後；候選階段標了 dinner 的 いかだ荘、奥野家、手こね茶屋 中央店、まるよし、とうふや 實際上都 17:00 前打烊（`contexts` 已改成 lunch）。おはらい町的晚餐缺口留給 T8e 照 D② 判斷。
- 定休要注意：岡田屋 週四（祝日營業 → 2/4 休、2/11 開）、中井屋 週二、一升びん 週二（遇祝日改週三）、すだく 週三。其他多半無休。`closures` 全部是空的（沒有有日期的休業）。
- 照片 34 張（官網 13 家、Google 主圖 13 家），全部 curl 確認 200 image/jpeg。
- `mustTry` 26 家都有（2～3 道）；`menu` 26 家都有（食べログ dtlmenu／party 或官網菜單頁；食べログ沒有菜單分頁的記 `dtlmenu/photo/`）。
- `group.groupMenu`：fit15 yes/split 的 15 家中 11 家有寫（すし久、ゑびや、海老丸、えび勢、とうふや、おく乃、一升びん、神宮会館；はいからさん 價格沒寫、野あそび棚 宴會要洽詢、すだく 明寫沒有套餐）；角屋、寶来亭、いかだ荘、カキアキ 沒有來源，`null`。
- IG：12 個帳號寫進 `links.instagram`，新建 `data/raw/ise/ig-notes.md`。`questions.md` 加 8 條。

### 做法（後面的批次沿用）
1. **讀文 subagent 先開**（背景，同時最多 5 個）：共同指令寫在 scratchpad 的 `prompt-common.md`（照 `docs/prompts/dossier.md`，加上旅客條件、評分面向、輸出格式），每個 subagent 的 prompt 只寫「先讀這份指令檔」＋負責的 key。每家店的基本資料（食べログ網址、類別、mentions）放在 scratchpad 的 `batch.json`，subagent 自己讀。
   - 分組：mentions 3 篇的 ふくすけ、すし久 各 1 個；其他 3 家一組（同類型或同地點放一起，例如 奥野家＋同址的おく乃＋岡田屋），共 10 個 subagent。
   - subagent 每家寫兩個檔：筆記 `dossiers/<id>.md`、事實 JSON `scratchpad/t8d1/facts/<id>.json`（官網、IG、照片、營業時間、公休、席數、預約、座位、小孩、無障礙、mustTry、conflicts、sources）。回覆只要 3 行（避免主 session context 爆掉）。
   - 每個 subagent 限 3 次 WebSearch（3 家合計），10 個合計約 28 次，**沒有用完額度**。
2. **食べログ（Chrome，一般瀏覽）**：每家只開店家首頁，必要時加 `party/`（コース）頁。讀法：第一次在食べログ分頁用 `localStorage.setItem('__tx', <抽取程式>)` 存一段讀「店舗情報」表格（`.rstinfo-table tr` 的 th／td）、分數、口コミ數、店舗会員、閉店標示、菜單分頁連結的程式，之後每頁 `browser_batch` 裡 navigate＋`eval(localStorage.getItem('__tx'))`，一次 5 家。**只讀目前頁面的 DOM，沒有用 fetch**。結束時 `removeItem` 清掉。
   - 程式裡不要直接寫 `\s` 這類反斜線（經過 JSON 兩層跳脫會壞掉），用 `new RegExp(String.fromCharCode(92)+'s+','g')`。
   - 「予約・お問い合わせ」的 th 有換行，比對前先去空白。
   - 食べログ 27 頁（店家 26、party 2；神宮会館、伊久 各 1）。沒有驗證碼、登入、封鎖。
3. **Google Maps（Chrome）**：`https://www.google.com/maps/search/<店名＋地名>?hl=ja` → 等 5 秒（網址要從 `/search/` 變成 `/place/` 才有 `!1s` 和 `!3d!4d`）→ 同樣用 localStorage 存的程式讀 `h1`、`div.F7nice`（星數和評論數）、`!1s0x…:0x…` 第二段轉十進位當 cid、`!3d!4d` 座標、主圖（`button[aria-label^="写真"] img`，尾端改 `=w800`）、地址、網站欄。搜尋結果是列表時（手こね茶屋 內宮店），讀 `div[role=feed] a.hfpxzc` 的 aria-label 再點對的那筆。26 家約 30 次。營業時間沒有從 Google 讀（官網、食べログ 已足夠）。
   - 回傳完整網址會被 Claude in Chrome 擋（query string），只回傳解析後的值。
4. **合併**：主 session 寫 scratchpad 的 `build.js`：每家手寫判斷欄位（hours、group、reservation、seating、kids、notes、conflicts），自動合併食べログ、Google、subagent 的 sources、候選 mentions、照片（官網照片 curl 200 才用，否則 Google 主圖）。候選清單用另一支腳本填 `pointId`、拿掉 `detailPending`、補 Google 星數（檔案是 CRLF、2 格縮排，寫回時要照原格式）。
5. **營業時間的採用**：官網 → 食べログ店舗会員 → 食べログ非店舗会員（Google 沒讀）；L.O. 寫 `lastEntry` 和 `note`；其他來源的值寫 `extra.conflicts`。おかげ横丁的店多半是官網店舗頁（okageyokocho.com/main/tenpo/…）。

### 遇到的狀況
- おかげ横丁官網的照片有一半 404（舊網址 `/tenpo/` 和 `/main/tenpo/` 混用），改用 Google 主圖。二光堂 官網的圖是圖庫素材、菜單圖在別的網域（25-10.relac.jp），不用。
- 讀文幾乎找不到個人部落格心得：多數只有官網、觀光三重、まっぷる、Retty、ホットペッパー、4travel。**心得 0 篇（只有官網或口コミ站）**：参宮亭五十鈴食堂（只有一筆 403 的摘要）、カキアキ水産（只有 Retty）、川西屋、中井屋（只有 Retty）、海さち山さち（只有官網）。T8f 的 `confidence` 多半是 low～medium。
- 同址同電話：奥野家 與 おく乃（宇治今在家町 18、0596-22-2589），各自收錄，`extra.conflicts` 註明。
- 讀文 subagent 提到野あそび棚 可能有另一個食べログ ID（24010530）；主 session 看的 24008115 地址、電話和官網一致，沿用。
- 神宮会館 的 Google 星數、座標借住宿本體（`lodging.json` 的 `ise-jingu-kaikan`），`ratings.note` 註明；`extra.lodgingId` 指回住宿。

### 給下一批
- 第 2 批（甜點、小吃 17＋朝熊山 4）多半不能預約、席數少，重點是營業時間、座位、外帶；fit15 大多會是 unknown／no，`groupMenu` 不用查。
- 朝熊山的店要確認 2 月平日有沒有營業（伊勢志摩スカイライン 的冬季時間）。
- 可以直接沿用 scratchpad 的做法；scratchpad 在 session 結束後會消失，`prompt-common.md` 的內容要照上面的說明重寫。

## 第 2 批：ise-naiku 甜點・小吃 17＋ise-asama 4（2026-10-18）

### 結果
- 收錄 **20 筆**：ise-naiku 17（赤福 4 家、五十鈴茶屋、五十鈴川カフェ、豚捨、豆腐庵山中、だんご屋、団五郎茶屋、若松屋、へんばや、小西湖、お伊勢屋本舗、いもんね、SNOOPY茶屋、岩戸屋 本店）＋ise-asama 3（藤屋窓月堂 本館、朝熊茶屋、はくたか亭，都是 `access: car`）。
- **ザ・朝市 → excluded**：用餐的部分就是 2F 的 はくたか亭（同址），1F 是海產・伴手禮賣場。朝熊山的 D① 剩 2 家。寫進 `docs/decisions-pending.md`。
- fit15：yes 2（岩戸屋 本店 官網團體餐 2,650～4,500 円・7 天前預約；はくたか亭 團體最多 120 名）、split 1（豚捨 電話預約、官網 134 席）、no 3（だんご屋 4 席、若松屋 10、小西湖 14）、unknown 14（不能預約或沒有席數的甜點・外帶店）。邊界判斷寫進 decisions-pending。
- 營業時間：全部 17:00～17:30 前打烊，**沒有晚餐的店**。赤福 本店 5:00 開、岩戸屋 食堂 8:00／8:30 有早餐，是內宮早上參拜前後少數能坐下的地方。
- 定休要注意：豆腐庵山中 週四（遇國定假日營業 → 2/4 休、2/11 開）、へんばや 週一（2/8 休）。其他無休。`closures` 全部是空的。
- 朝熊山：朝熊茶屋 年中無休（觀光三重），冬季時間沒有來源，2 月平日營業是推定；スカイライン 1～7 月 7:00～19:00、普通車 1,270 円、マイクロバス 3,210 円。
- 照片 28 張（官網 24、Google 主圖 4：豆腐庵山中（官網只有 logo）、お伊勢屋本舗、朝熊茶屋、はくたか亭），全部 curl 200。`mustTry` 20 家都有（1～3 道；へんばや、赤福 別店舗 只有 1 道）；`menu` 都有（食べログ dtlmenu 或 `dtlmenu/photo/`，官網菜單頁 9 家）。
- IG 14 筆寫進 `links.instagram`（赤福 4 家共用公司帳號），`ig-notes.md` 加第 2 批；`questions.md` 加 6 條。
- 讀文：7 個 subagent（3 家一組，赤福 3 家一組、赤福 五十鈴川店 和五十鈴茶屋・カフェ 一組），WebSearch 21 次（每個 3 次用完）。**心得幾乎都是 0 篇**（只有官網、觀光三重、まっぷる、Retty、4travel 口コミ）。

### 做法（和第 1 批的差異）
1. 讀文 subagent 的共同指令同第 1 批（scratchpad `t8d2/prompt-common.md`），加一段「這一批的重點」：內用座位、外帶、排隊、冬季時間；赤福 4 家各寫各的；朝熊山要確認 2 月平日營業。
2. **食べログ**：這一批 `localStorage.setItem` 存抽取程式的做法被自動模式的安全檢查擋下，改成每頁在 `browser_batch` 裡直接傳一段較短的抽取程式（只留「店舗情報」需要的列：ジャンル、予約、住所、営業時間、予算、席数、個室、貸切、禁煙、駐車場、お子様、ホームページ、公式アカウント、備考），一次 5～6 家。一樣只讀目前頁面的 DOM、沒有 fetch。食べログ 20 頁。
3. **Google Maps**：同第 1 批，但抽取程式不用正規表達式（`split('!1s')`、`split('!3d')` 解析網址），一樣每次直接傳；搜尋結果是列表時（赤福 本店別店舗、朝熊茶屋）用 aria-label 找到那筆點進去或改用 Google 上的店名重搜。約 22 次。
4. 合併腳本 `t8d2/build2.js`：讀現有 `restaurants.json`，**第 1 批 26 筆原樣保留在前**，第 2 批 20 筆接在後面（git diff 只有新增）。候選清單用 `t8d2/cand2.js`（CRLF、2 格縮排）。

### 遇到的狀況
- 赤福 本店別店舗、朝熊茶屋 的 Google 搜尋是列表；朝熊茶屋 在 Google 上叫「お食事処朝熊茶屋」。
- SNOOPY茶屋 2023-12 改裝成「SNOOPY Village 伊勢」，內用有沒有各來源衝突（見 decisions-pending）。
- 豚捨 的營業時間有 4 種說法；採食べログ 寫的 1～2 月時間。
- 藤屋窓月堂 本館 地址 食べログ 1650-2、Google 1655-1；はくたか亭 的 Google 地址欄寫「鳥羽市堅神町1-11」（座標在朝熊 IC 旁），資料用食べログ地址。

### 給下一批
- 第 3 批（ise-geku 晚餐 19 家）可以沿用 `t8d2/` 的腳本：`build2.js` 的保留舊資料＋追加的寫法、`cand2.js`。食べログ、Google 的抽取程式直接寫在 browser_batch 裡（不要用 localStorage）。
- 晚餐店要看 `fit15` 的 C 條件（席數、最大予約人數、個室人數），groupMenu 要看コース頁。
