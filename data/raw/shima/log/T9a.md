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
