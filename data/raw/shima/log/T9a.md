# T9a 志摩：子地區與景點 — 過程紀錄

> 每批一節，往下加；寫完的節不再改，T9a 結束後整份不再改。

## 第 1 批：子地區＋景點候選（2026-10-18，自動模式）

範圍：CONVENTIONS §4 標準作業流程步驟 0～1。不用 Chrome、不開讀文 subagent、不寫 `data/areas/shima/spots.json`。

### 用到的工具與次數
- `node scripts/kanko-mie.mjs fetch shima`：觀光三重「見る・遊ぶ」志摩市 118 筆（列表＋12 類別＋詳細頁，約 150 次呼叫、1.1 秒間隔），**沒有被擋**。
- `node scripts/kanko-shima.mjs fetch`（**T9a 新增**，附測試）：志摩市観光協会（kanko-shima.com）「観る・遊ぶ」「体験する」列表＋詳細頁 141 筆。robots.txt 只禁止 `/cms/wp-admin/`。網站和伊勢市觀光協會同一套 WordPress 版型（T8a 在 scratchpad 解析、沒存，這次改成 repo 的腳本）。
- WebSearch 2 次：①志摩市観光協会 公式 觀光スポット一覧（沒找到協會網站，之後直接 WebFetch 猜到的 kanko-shima.com）②志摩マリンランド 休館 再開（2021-03-31 營業休止，沒有再開的消息）。
- WebFetch 約 15 次：kanko-shima.com 首頁；parque.co.jp（公司網站，不是樂園）、parque-net.com 首頁；shima-marineleisure.com；anorisaki.com（**301 轉到無關網域，沒有跟過去**）；燈光会 安乗埼、大王埼；puebloamigo.jp；umihozuki.org；satoumian.com（STUDIO 網站，讀不到文字）；katuobushi.com；環境省 横山；shima-nature-school.jp；kaiyuuen.com；entrada-kashikojima.com。
- curl：parque-net.com `calendar/index.html`（休園日）；kanko-shima.com 的 robots.txt、列表、幾個詳細頁（確認版型）。

### 子地區怎麼定
- 先看兩份列表的住所（大字）和觀光三重的座標，畫出聚落群；觀光協會的 5 個エリア是舊町界（一個町裡有好幾群），不直接用。
- 原則照伊勢 2026-10-18 👤 的修正：以車站或聚落為中心，相距 4 km 以上的群不合併。結果 16 個（含 shima-other）。
- 邊界判斷：
  - 鵜方、賢島分開（相距約 2～4 km、兩個站；賢島是遊覧船的據點）。志摩神明站併進鵜方。海遊苑（賢島大橋本土側）放賢島。
  - 横山 獨立（離鵜方站 2.5 km 的山上、要計程車），needsCar true。
  - 上之郷、志摩磯部、穴川 三站一帶合成 shima-isobe（三站之間 1～1.5 km，沿電車）；スペイン村（坂崎）離志摩磯部站約 4 km、有直達巴士，獨立。
  - 安乗、国府 分開（約 4 km）；大王（波切）和登茂山分開（約 5 km）；前島半島分成御座・越賀、和具・布施田・片田（3～6 km）。
  - 浜島 包含北邊的塩屋（約 1.5 km）、西邊的南張（約 1.8 km）；迫子（地中海村、NEMU）離浜島市街約 4 km，獨立。
  - 間崎島：地址是志摩町和具，但只有賢島來的定期船，照交通放 shima-kashikojima。
  - 恵利原 的平地（磯部神社、佐美長神社）在 isobe；山裡的天の岩戸、鸚鵡岩 是 shima-amanoiwato（離志摩磯部站約 6 km）。
- needsCar：沿近鐵的 kashikojima、ugata、isobe，加上直達巴士多的 spain 是 false；其他都是 true（巴士多半 1 小時 1 班以下）。大王 的巴士約 1 小時 1 班，照 §5.4「1 小時以上才一班 → 不算」標 true。

### 景點的取捨
- 兩份列表的每一筆都對到一筆候選（`data/cache/work/t9a-1/build-candidates.mjs` 用 id 檢查，沒有遺漏、沒有重複）；同一地點的多個頁面、同一業者的多個方案（じゃらん的方案頁）合成一筆，`mentions` 全部留著。
- 排除（excluded 25）：2 月休業（スペイン村、ひまわりの湯、歴史民俗資料館）、營業休止（志摩マリンランド）、季節（海水浴場 5 筆、オオシマザクラ、夏季獨木舟）、服務設施（觀光案內所、圖書館）、運動・市民設施、高爾夫、露營場、住宿（LUXUNA）、市外（伊勢志摩スカイライン、海島遊民くらぶ、伊勢湾フェリー、天空の旅）。
- 沒收錄（not-included 60）：小寺社、小公園、拍照點、橋、漁港；2 月下水的活動（潛水、衝浪、SUP、海女潛水 22,000 円）；購物（NARUMI、道の駅、わかめ詰め放題）；以住宿為主的（NEMU RESORT、渡鹿野島）；高價、1 組限定的方案（鮮魚店バックヤード 7,000 円～、鮨裕 禅）。
- 收錄（included 25）：見 README。2 月營業沒確認的先收、`note` 寫「要讀文確認」。
- 歴史民俗資料館：2/12 有開，但那天是往關西機場的移動日（PLAN：2/12 住大阪或關西機場附近），所以排除，不是 not-included。

### 遇到的問題
- **志摩スペイン村 2027-01-12～02-12 冬季休園**：官網 `calendar/index.html` 的「休園日・休館日のご案内」。這是志摩最大的景點，影響很大 → decisions-pending「👤 建議先看」。
- parque.co.jp 是營運公司的網站，樂園是 parque-net.com（觀光三重登記的官網正確）。
- 觀光三重登記的安乗埼官網 `anorisaki.com` 301 轉到 `hitomissav02.com`（網域被別人拿走），沒有跟過去；改用燈光会的頁面。之後讀文 subagent 不要給這個網址。
- 觀光三重的サミエール 地址欄有「2017 年 12 月前預定設置樓梯升降機」的舊說明，現況不明 → `questions.md`。
- 海ほおずき 官網 2026-10-18 寫冬季體驗（11 月初～4 月中）「現在休止中」，看起來是季前的說明，讀文要確認 2027 年 2 月有沒有。
- `kanko-mie.mjs missing shima` 用名稱比對，合成一筆的候選會被列成「可能是同一個 5 筆、沒有 3 筆」，實際上都已對到；產生的 `kanko-mie-missing-shima.json` 沒有留（會誤導）。

### 結果
- `areas.json`：shima 16 個子地區。
- `candidates/spots.json` 110 筆：included 25（`detailPending: true`、`pointId` null）、not-included 60、excluded 25。
- 後續批次 `data/cache/work/t9a-plan.json`：第 2 批 13 筆（沿近鐵、北部）、第 3 批 12 筆（南部、要開車）。
- `scripts/validate`：錯誤 0、警告 25（都是 included 還沒有 pointId，資料檔還沒建立）。

## 第 2 批：沿近鐵、北部的景點 13 筆（讀文＋Chrome＋spots.json）（2026-10-18，自動模式）

範圍：`t9a-plan.json` 的 `batch: 1` 13 筆（kashikojima 6、ugata 2、yokoyama、isobe、amanoiwato、matoya、anori）。plan.json 的 batch 編號是景點批次的序號，和 README 的「第 2 批」是同一組。工作目錄 `data/cache/work/t9a-2/`。

### 讀文
- 13 個 subagent（`docs/prompts/dossier.md`；共同規則寫成 `t9a-2/prompt-common.md`，個別 prompt 只寫 id、已知來源、要確認的重點），同時最多 5 個、背景執行。
- WebSearch：間崎島、海遊苑、Rays Farm、天の岩戸、安乗埼 各 1 次，合計 5 次；其他 8 個 0 次。主 session 0 次。搜尋都有結果，沒有額度用完的跡象。
- 讀不到的：nta.co.jp（520，Rays Farm）、海上保安廳的燈塔參觀頁（404）、すし べんけい 觀光協會連的官網（JS 頁）。官網 SSL 錯誤的（kashikojima-boat.jp、amigo.ne.jp）subagent 改用 curl 讀 http；じゃらん 用 curl＋iconv 解 Shift_JIS。
- 重要發現：エスパーニャクルーズ 2027-02-01～03-05 大船休業（小型代替船）；横山展望台 2026-11-24～2027-03-01 工事（VC→展望台停車場不能通行、迂回步道沒有斜坡）；横山VIEWタクシー 土日祝不運行；サミエール 已有階段昇降機（觀光三重的 2017 舊文過時）；Rays Farm 2 月只有志摩藍染め、限 10 歲以上；的矢湾 BBQ 現在用じゃらん 預約、官網 2010 年停更、集合地在對岸。

### Google Maps（Chrome）
- `chrome-actions.mjs --script google-place --google … --store`，單一分頁，3 個 batch（各 5 筆）＋列表點選 3 次：エスパーニャ（列表：きっぷうりば、賢島のりば、定期船のりば → 取 賢島のりば 4.2／217）、天の岩戸（列表：天の岩戸、天の岩戸口 → 天の岩戸）；Rays Farm 重搜一次確認只有一筆。
- 程式誤判：的矢湾「船上BBQ 大東丸観光」回傳 rating 5，截圖確認沒有星數、評論 → null；Rays Farm 的 `closed` 是真的「閉業しました」。
- 座標差：的矢湾 818 m（改用 Google，規則）、エスパーニャ 119 m、天の岩戸 31 m、安乗埼 21 m、伊雑宮 14 m、横山 7 m、海遊苑 0 m（保留觀光三重座標）；沒有觀光三重座標的 6 筆用 Google。
- 沒有遇到驗證碼、登入或封鎖。

### Google 評論（心得不到 2 篇的景點，13 筆的筆記全部是 0 篇）
- `google-reviews.js`（`--store`，之後 `--stored`），一筆一個 batch：横山（冬、階段、工事）、エスパーニャ（冬、子供、階段）、遊覧船組合（冬、子供）、サミエール（階段、子供）、海遊苑（冬、子供）、Entrada（冬、子供）、伊雑宮（階段、冬）、天の岩戸（階段、冬、子供）、安乗埼（階段、子供、冬）、間崎島（9 則全讀）。合計約 12 個 batch、約 150 個動作。
- 沒讀：すし べんけい（沒有クチコミ分頁）、的矢湾（沒有評論）、Rays Farm（排除）。
- 遇到的問題：間崎島（9 則）`open` 後直接 `extract` 抽到 0 則、改跑 `lowest` 才有（CONVENTIONS 寫的是反過來的情況）；天の岩戸 `?cid=` 網址轉到 www.google.com，batch 第一個 JS 因「換網域」失敗 → navigate 後等 2 秒；`lowest` 第一次找不到「評価の低い順」、再跑一次成功。
- 寫進筆記用 `t9a-2/add-reviews.mjs`（在來源清單加一行、在「衝突」前插入重點、改「資料量」）。
- 結束時 `removeItem` 兩個 localStorage 鍵、關掉分頁。

### 組裝
- 新增 `scripts/build-spots.mjs`（`scripts/lib/spot-build.mjs`，測試 `scripts/test/spot-build.test.ts` 7 個）：Claude 寫 `judgement.json`，程式做 Google 連結、星數、座標 300 m 規則、照片（photo-check 結果，最多 3 張、Google 主圖補位）、tags、sources 合併、寫回、候選 pointId。
- 照片 39 張全部 `photo-check` 200。
- 步行分鐘沒有來源的 2 筆用 `geo.mjs walk`（OSRM）：海遊苑 志摩神明站 1.2 km 15 分（賢島站要繞 3.7 km、46 分）、すし べんけい 鵜方站 1.6 km 20 分；伊雑宮 上之郷站 360 m。
- 決定寫進 `docs/decisions-pending.md`（10 條，「👤 建議先看」2 條：Rays Farm 排除、横山 stairs 多）；`questions.md` 新增 10 條、打勾 2 條。

### 結果
- `data/areas/shima/spots.json` 12 筆；候選 included 24（12 筆有 pointId）、excluded 26（＋Rays Farm）。
- 筆記 13 份（含 Rays Farm）；心得：Google 評論 7～30 則（10 筆），すし べんけい、的矢湾 0。
- `scripts/validate`：錯誤 0、警告 12（第 3 批的 included 還沒有 pointId）。`npm test` 79 個通過。

## 第 3 批：南部的景點 12 筆（讀文＋Chrome＋spots.json）＋T9a 總結（2026-10-18，自動模式）

範圍：`t9a-plan.json` 的 `batch: 2` 12 筆（daio 3、tomoyama 2、goza 3、hamajima 2、sakko 2）。工作目錄 `data/cache/work/t9a-3/`。

### 讀文
- 12 個 subagent（`t9a-2/prompt-common.md` 改工作目錄後照抄成 `t9a-3/prompt-common.md`），同時最多 5 個、背景執行。
- WebSearch：大王埼灯台（塔內階梯段數，沒找到）、大王美術ギャラリー（電梯，沒找到）、ともやま公園、さとうみ庵（團體人數，沒找到）、海ほおずき（冬季休止公告，沒找到）、いわほ観光汽船（官網，沒找到）、グリーンアドベンチャー（冬季營業，沒找到）各 1 次，合計 7 次；其他 5 個 0 次。主 session 0 次。搜尋都有結果，沒有額度用完的跡象。
- 讀不到的：satoumian.com（STUDIO 網站，只讀到標題）、tabiniche.kankomie.or.jp（連線失敗）、uminohi.jp 的 PDF；いわほ 的じゃらん頁亂碼沒採用。
- 重要發現：志摩自然学校 シーカヤック「通年催行」（第 1 批的疑問解決）；海ほおずき 冬季體驗官網標「現在休止中」；天ぱく 2025-04 漲價（3,500／2,500 円）、官網建議 10 歲以上；パール美樹 官網價格比觀光協會高（3,000＋金具 2,000 円～）、週三四休；**觀光協會 1589 頁其實是海遊苑的筏上 BBQ，不是いわほ**；地中海村 日歸要預約、團體要先電話、官網明寫非無障礙。

### Google Maps（Chrome）
- `google-place`：2 個 batch（5＋7 筆），列表點選 5 次：大王埼灯台（另有灯台ミュージアム 4.3／21）、ともやま公園（桐垣展望台 4.4／134、公園 4.2／258、芝生広場展望台 4.6／30 → 取公園，桐垣另讀）、海ほおずき（取 4.1／85，另有市役所名義 4.4／16）、グリーンアドベンチャー（取アトラクションフィールド 4.2／434，另有グランピング 4.6／36）。一次截圖逾時（renderer 沒回應），等 2 秒重截就好。
- 座標差：天ぱく 2,385 m（觀光三重是事務所）、いわほ 1,668 m → 改用 Google；大王埼灯台 256 m、ともやま公園 101 m、其他 5～51 m 保留原座標；真珠の里、グリーンアドベンチャー 沒有觀光三重座標，用 Google。
- 沒有遇到驗證碼、登入或封鎖。

### Google 評論（12 筆的筆記心得都是 0 篇 → 全部讀）
- `google-reviews.js`（`--wait 2 --store`，之後 `--stored`），10 個 batch（2 筆一個 batch 的 4 次）、約 130 個動作；ともやま公園 另讀桐垣展望台。關鍵字依缺的欄位：冬、階段、子供、団体、煙、日帰り、身長、伊勢海老、駐車場。
- 實測：`?cid=` 網址加 `--wait 2` 後，第一個 JS 沒再失敗；いわほ（4 則）`open` 後 `extract`、`lowest` 都抽得到——和間崎島（9 則，extract 0）、T8e オレンジガーデン（2 則，lowest 0）都不同 → CONVENTIONS「口コミ、Google 評論」加一條「已確認」：評論少的地點兩步都排。天ぱく `lowest` 回「星數不是由低到高」警告（幾乎都是 5 星），照關聯度順用。
- 寫進筆記用 `add-reviews.mjs`（從 t9a-2 複製），ともやま公園 跑 2 次（公園、桐垣）。筆記 30～43 行（加評論後有 4 份超過 40 行）。
- 結束時 `removeItem` 兩個 localStorage 鍵、關掉分頁。

### 組裝
- `judgement-src.mjs` → `judgement.json`（12 筆）→ `build-spots.mjs --candidates`（dry-run 後正式）；照片 36 張全部 photo-check 200。
- `apply-patch`：讀文 facts 的官網、IG 核對（12 筆相同）；海遊苑補 `extra.raftBbqNote`＋觀光協會 1589 來源。候選：1589 的 mention 從いわほ移到海遊苑，5 筆 note 改成讀文結論。
- 決定寫進 `docs/decisions-pending.md`（表格 11 條，「👤 建議先看」3 條：いわほ 營業不明仍收錄、2 月沒明寫的 4 筆照收、天ぱく 建議 10 歲以上仍收錄）；`questions.md` 打勾 2 條、新增 9 條。

### 結果
- `spots.json` 24 筆；候選 included 24（全部有 pointId）、not-included 60、excluded 26。`scripts/validate`：錯誤 0、警告 0。

## T9a 總結
- 子地區 16 個（第 1 批）；景點候選 110 → 資料點 24 筆（賢島 6、大王 3、御座・越賀 3、登茂山 2、浜島 2、迫子 2、其他 6 個子地區各 1）。排除 26（含スペイン村 冬季休園、Rays Farm 閉業標示）。
- 讀文筆記 25 份（含 Rays Farm），每份都有 Google 評論心得（すし べんけい、的矢湾 沒有評論）。
- WebSearch：第 1 批 2 次、第 2 批 5 次（讀文 subagent）、第 3 批 7 次（讀文 subagent），合計 14 次；主 session 只有第 1 批的 2 次。
- Chrome：Google Maps 約 25 地點＋評論約 23 地點，全程沒有遇到驗證碼、封鎖。
- 新增工具：`scripts/kanko-shima.mjs`（第 1 批）、`scripts/build-spots.mjs`（第 2 批）。
- 留給後續：T9b 住宿（README「給 T9b 住宿的建議」）、T10 巴士班次（南部全部要巴士或包車）、T9f 打分、T9g 檢討「👤 建議先看」志摩 9 條＋部落格心得。
