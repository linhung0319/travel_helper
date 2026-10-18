# T8d 二見：餐廳詳細資料 — 過程紀錄

- 伊勢＋二見分 6 批做，二見是第 6 批（最後一批）。共同做法（讀文 subagent、食べログ／Google 的抽取方式、合併腳本、fit15 規則）在 [`data/raw/ise/log/T8d.md`](../../ise/log/T8d.md) 第 1～5 批，這裡只寫二見的部分。
- 資料寫 `data/areas/futami/restaurants.json`（這一批新建），id 前綴 `futami-`。`summary`／`assessment`／`tier` 留給 T8f，`anchors` 留給 T8e。

## 第 6 批：二見 17＋待確認的住宿本體 3（2026-10-18）

### 結果
- 收錄 **18 筆**：futami-okitama 13（御福餅、旭家、ウァン、扇屋、勢語庵、BonTin cafe、花栞、まるはま、海風美術店、潮騒、松風軒、maruru cafe、う吉）、futami-outskirts 5（ワスケ、民話の駅 蘇民、マイヤー、パイン＋**旅荘 海の蝶 `futami-uminocho-dining`**）。
- **待確認的住宿本體 3 家**：
  - **旅荘 海の蝶 → 收錄**（A 3.35／83＋F③）：官網首頁公告「日帰り夕食」開始，489ban 的日帰りプラン 2 件（上質会席 14,850 円～、プレミアム会席 19,800 円～，8 名以上電話確認）。id 用 `futami-uminocho-dining`（`futami-uminocho` 是住宿；筆記 `dossiers/futami-uminocho-dining.md`）。Google 星數・座標・照片借住宿本體，`extra.lodgingId`。
  - **大石屋 → excluded**：官網料理頁、FAQ 只有住宿方案（團體用餐最多 10 人），食べログ 予約不可、營業時間空白。沒有開讀文 subagent（住宿筆記 `dossiers/futami-oishiya.md` 已有官網 FAQ・料理頁的內容），沒有 `-dining` 筆記。
  - **オーベルジュ ユスラ → excluded**：官網、観光三重 只有住宿方案，預約系統的日帰りプラン頁出錯；只有食べログ 有午晚營業時間和 2018 年的コース（ランチ 7,020 円）。「先確認可以才收錄」，確認不了就不收；讀文筆記 `dossiers/futami-yusura-dining.md` 留著，`questions.md` 列了要電話確認。
- fit15：yes 4（松風軒 官網宴會・團體、maruru cafe 貸切 20～50、う吉 貸切 20～50、海の蝶 8 名以上電話＋宴會場）、split 1（ワスケ 36 席可預約）、no 3（旭家 10 席、勢語庵 6 席、ウァン 外帶專門）、unknown 10（御福餅・BonTin・海風美術店・蘇民 席數不明、扇屋 60 席・まるはま 50 席 但不能預約、花栞・潮騒・マイヤー・パイン 席數不明）。
- `access`：car 6（う吉＝二見町西、outskirts 5 家），walk 12。
- **晚餐（17:00 以後）**：扇屋（L.O. 19:30，週三只有午餐、週四休，**不能預約**）、花栞（21:00，週二休）、maruru cafe（L.O. 19:30，不定休）、松風軒（17:00～20:00 前後，不定休）、う吉（L.O. 18:30，週四休）、ワスケ（20:00，週一休）、マイヤー（20:00）、海の蝶（日帰り会席）。二見浦（okitama）每天至少有 2 家晚上開，D② 不用從 竹味・多市屋 補。
- 定休要注意（2/4、2/11 是週四）：週四 扇屋・う吉（う吉 食べログ 祝日營業）；週二 花栞（＋月 2 次週一）；週三 ウァン；週五 BonTin・海風美術店（神社境內）；週一 ワスケ（ホットペッパー 另寫祝日休）；不定休 旭家・勢語庵・まるはま・松風軒・maruru；無休 御福餅・蘇民。`closures` 全部是空的。
- 照片：官網 6 家（御福餅、扇屋 2、BonTin 2（神社官網）、海風美術店（神社官網）、maruru、海の蝶）＋Google 主圖；全部 curl 200。
- `mustTry`：15 家有；**潮騒、マイヤー、パイン 是空的**（食べログ 以外幾乎沒有來源）。`groupMenu`：松風軒（宴會依預算，價格未列）、maruru（コース 1,870～11,000 円）、海の蝶（会席 14,850／19,800 円）有；う吉 沒有來源（null）。
- IG 11 筆（新建 `ig-notes.md`），`questions.md` 加 9 條，`docs/decisions-pending.md` 加 4 項。
- 讀文：7 個 subagent（3 家×6、ユスラ 1 家），WebSearch 20 次。19 份筆記（含不收的 ユスラ）。**心得幾乎 0 篇**：候選階段沒有 mentions，來源多半是 まっぷる、るるぶ、HAMONI、ホットペッパー、4travel 短評、二見興玉神社 官網；**パイン 完全沒有食べログ 以外的來源**，マイヤー 只有搜尋摘要，花栞・松風軒 只有 HAMONI。

### 做法（和伊勢第 5 批的差異）
1. **先確認住宿本體**：開讀文前先 WebFetch 3 家的官網（海の蝶 首頁、大石屋 FAQ・料理頁、ユスラ 首頁），再用 Chrome 看食べログ 店家頁。海の蝶 的 489ban 日帰りプラン 是動態載入，WebFetch 只拿到外框，**用 Chrome 開頁面、讀 `document.body.innerText`** 才拿到方案和價格。
2. 讀文共同指令 `t8d6/prompt-common.md`（伊勢第 5 批改字）：「這一批的重點」改成二見（傍晚就關、2/3 節分、外圍開車、和菓子店的內用、神社境內的店）；住宿本體加 `nonGuestDining` 欄；註明 mentions 是空的。
3. **食べログ**：同伊勢第 3～5 批的白名單抽取程式，店家頁 20＋コース頁 3（海の蝶、ユスラ、maruru）。沒有驗證碼、登入、封鎖。
4. **Google Maps**：17 家全部直接命中（沒有列表）；海の蝶 借住宿。潮騒 在 Google 叫「民宿 お食事処 潮騒」。
5. 官網補查：花栞（伊勢志摩観光ナビ，WebFetch）、松風軒（官網憑證錯誤，WebFetch 失敗 → curl＋iconv 讀 Shift_JIS 頁面：營業時間、宴會、團體便當）。潮騒 官網 isesima.net/shiosai/ 404。
6. 合併 `t8d6/build6.js`（新建檔案，18 筆）、候選 `t8d6/cand6.js`（海の蝶 pending→included、大石屋・ユスラ pending→excluded，其餘拿掉 `detailPending`）。

### 遇到的狀況
- 潮騒：同址是民宿「潮騒」（4travel），Google 名稱「民宿 お食事処 潮騒」。照候選（C）收錄，營業時間全部 null。
- maruru cafe 在女性專用旅館 やわらの湯 まるや 1F，但咖啡店對外營業（官網、媒體）；晚餐 17:00 以後幼兒不能入店（`kids.allowed: age-limit`）。
- ウァン 本店 現在外帶專門（`fit15: no`、`seats: 0`，同伊勢 山村みるく 外宮前店）。
- 扇屋 官網明寫不接受預約（食べログ 也 予約不可），是二見浦站前最熱門的晚餐店，15 人要分批。
- パイン 地址：食べログ 松下 1337-2、Google 松下 227（座標在 蘇民 旁）。

### 伊勢＋二見 T8d 完成
- 伊勢 96 筆、二見 18 筆，合計 114 筆。伊勢、二見候選都沒有 `detailPending` 了（`scripts/validate` 警告 0）。
