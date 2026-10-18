# 志摩：研究筆記 README

> 開工先讀這份。最後更新：2026-10-18（T9a 第 2 批：沿近鐵、北部的景點資料點 12 筆，`spots.json` 建立）。這份是**現況**，各任務更新自己的那一節（覆寫，不是追加）；過程紀錄在 `log/`，需要時才讀。

## 檔案地圖

| 檔案 | 內容 |
|---|---|
| `candidates/spots.json` | 景點候選 110 筆（included 25、not-included 60、excluded 25）。每筆有 `region`、`status`、`reason`、`mentions`（觀光三重、觀光協會、官網的頁面）、`note`（給讀文的重點）。included 的 `pointId` 還是 null、`detailPending: true`（之後的批次建立資料點時填）。用 `scripts/candidates.mjs list shima spots` 過濾，不要整份讀 |
| `data/derived/kanko-mie-shima.json` | 觀光三重「見る・遊ぶ」志摩市 118 筆（`scripts/kanko-mie.mjs fetch shima`；名稱、類別、住所、座標、官網） |
| `data/derived/kanko-shima.json` | 志摩市観光協会「観る・遊ぶ」「体験する」141 筆（`scripts/kanko-shima.mjs fetch`，T9a 新增；エリア、タグ、住所、電話、営業時間、定休日、料金、アクセス原文） |
| `data/cache/work/t9a-plan.json` | 之後的景點批次（讀文＋Chrome＋寫 `spots.json`）：`[{batch, region, ids}]` |
| `data/cache/work/t9a-1/` | 第 1 批的工作檔：`build-candidates.mjs`（候選的組裝表，一次性）、`regions.json` |
| `data/cache/work/t9a-2/` | 第 2 批的工作檔：`batch.json`、`prompt-common.md`（讀文共同規則，第 3 批可以照抄）、`facts/`、`google.jsonl`、`photos.json`、`judgement.json`（`build-spots.mjs` 的輸入）、`rv-*.json`（Google 評論重點）、`add-reviews.mjs`（把評論重點加進筆記的小工具） |
| `questions.md` | 要打電話、人工確認的事 |
| `log/T9a.md` | T9a 的過程紀錄 |

`data/areas/shima/spots.json`：景點 12 筆（第 2 批）；第 3 批再加南部 12 筆。讀文筆記在 `dossiers/`（13 份，含排除的 Rays Farm）。

## 子地區（`areas.json` 的 `shima.regions`，T9a 自己定，見 `docs/decisions-pending.md`）

定法：照伊勢 2026-10-18 👤 修正後的原則——**以車站或聚落為中心、相距 4 km 以上的兩群不放同一個子地區**。志摩市很大（直線距離：賢島到御座約 6.5 km、到安乗約 10 km、到天の岩戸約 12 km），聚落分散在英虞湾、的矢湾、前島半島和太平洋岸，所以分得比伊勢細。觀光協會的 5 個エリア（磯部、阿児、大王、志摩、浜島）是舊町界，一個町裡就有好幾群（例如大王町的波切和登茂山差 5 km），只當參考。歸屬看地址的大字（町名）＋座標；只能從某個港搭船去的島照交通歸（間崎島 → 賢島）。

| id | 名稱 | needsCar | 主要車站／交通 | 收錄景點 |
|---|---|---|---|---|
| shima-kashikojima | 賢島 | false | 近鐵賢島站 | 6 |
| shima-ugata | 鵜方・志摩神明 | false | 近鐵鵜方站（特急、巴士總站）、志摩神明站 | 1（Rays Farm 第 2 批排除） |
| shima-yokoyama | 横山 | true | 鵜方站計程車 8 分（志摩横山站步行 45 分） | 1 |
| shima-isobe | 志摩磯部・上之郷・穴川 | false | 近鐵上之郷、志摩磯部、穴川站 | 1 |
| shima-spain | 志摩スペイン村（坂崎） | false | 鵜方、賢島站直達巴士 | 0（休園） |
| shima-amanoiwato | 天の岩戸・恵利原 | true | 志摩磯部站約 6 km | 1 |
| shima-matoya | 的矢湾・渡鹿野島 | true | 車；渡鹿野島 渡船 | 1 |
| shima-anori | 安乗 | true | 鵜方站巴士（班次少） | 1 |
| shima-kokufu | 国府・甲賀・志島 | true | 鵜方站巴士（班次少） | 0 |
| shima-daio | 大王・波切 | true | 鵜方站巴士約 20～25 分（約 1 小時 1 班） | 3 |
| shima-tomoyama | 登茂山（ともやま公園） | true | 鵜方站計程車約 25 分 | 2 |
| shima-goza | 御座・越賀 | true | 鵜方站巴士 50～60 分；賢島→和具 定期船 | 3 |
| shima-wagu | 和具・布施田・片田 | true | 鵜方站巴士；和具港↔賢島 定期船 | 0 |
| shima-hamajima | 浜島 | true | 鵜方站巴士（班次少） | 2 |
| shima-sakko | 迫子（志摩地中海村・NEMU） | true | 度假村接駁巴士、賢島的海上計程車 | 2 |
| shima-other | 志摩市其他（零散） | true | — | 0 |

- **第一天（2/2）**：16:10 難波發的直達特急 18:35 到鵜方、18:40 到賢島（`data/raw/access/README.md`），當天不排景點。**T9b、T9c 要先看 shima-kashikojima、shima-ugata**（住宿、第一晚的晚餐，兩站相距約 4 km、電車 5 分）。
- **needsCar: false 只有沿著近鐵的 4 個（賢島、鵜方、磯部、スペイン村）**；其他都要巴士（多半 1 小時 1 班以下）、計程車或包車。前島半島（goza、wagu）、大王、浜島、迫子一天的行程，照 §5.4 建議包車或大型計程車。
- 收錄景點 0 的子地區（kokufu、wagu、spain、other）留著：國府、和具有民宿、餐廳，T9b、T9c 會用到；spain 是 2/13 以後才有用（旅程中休園）。
- center 是主要景點和車站的大致中心（手算）；餐廳收完後可以改成資料點的平均（同鳥羽、伊勢）。

## 景點

### 現況（T9a 第 2 批：沿近鐵、北部 12 筆建立資料點）
- **母體、納入標準**：見第 1 批（觀光三重 118＋觀光協會 141 → 候選 110 筆；收錄的標準照 CONVENTIONS「團體（15 人）」、伊勢 T8a）。現在 included 24（Rays Farm 第 2 批改 excluded）、not-included 60、excluded 26。
- **`spots.json` 12 筆**（每筆都有 `links.googleMaps`（cid）、Google 星數、照片 2～3 張、讀文筆記＋Google 評論心得）：
  | id | Google | 重點 |
  |---|---|---|
  | shima-espana-cruise | 4.2（217） | **2027-02-01～03-05 大船エスペランサ 休業、小型代替船**（定員、時刻沒寫）；15 人以上 FAX 團體預約 9 折 |
  | shima-kashikojima-yuransen | 4.3（311） | 定員 70、可包船；**人數不夠不開船**、2 月運航沒明寫，要先打電話 |
  | shima-mazakijima | 4.3（9） | 定期船 10 分、2 月每天；島上沒有店，中午 12:50～15:25 沒船 |
  | shima-samiere | 3.9（568） | 賢島站 2 樓、免費、室內；有輪椅用階段昇降機 |
  | shima-kaiyuen | 4.3（70） | 海上釣鯛、小孩評價高；2 月釣り堀沒明寫、電話難預約 |
  | shima-entrada | 4.4（58） | 小船約 12 人，15 人分 2 艘；到地中海村 10 分 |
  | shima-sushi-benkei | 3.7（評論極少） | 握壽司 8,800 円、90 分當午餐；1 組 4 人×最多 6 組，15 人可同場；6 歲以上 |
  | shima-yokoyama-observatory | 4.4（7,510） | **2026-11-24～2027-03-01 工事，VC→展望台停車場不能通行、迂回步道沒有斜坡**；平日有 VIEWタクシー 1,000 円 |
  | shima-izawanomiya | 4.6（1,676） | 上之郷站步行 3 分；2/11 建国記念祭 |
  | shima-amanoiwato | 4.4（983） | 水穴不遠，風穴是山路木階梯；大型車不能進、窄路 |
  | shima-matoya-bbq-cruise | 沒有評論 | 2 月營業（じゃらん）、BBQ 定員 36、15 人可一次訂；船內冷暖房、廁所 |
  | shima-anorisaki-lighthouse | 4.3（807） | 2 月 9:00～12:00、13:00～16:00；燈塔窄螺旋階梯（評論說短）、草坪廣場適合小孩；進岬的路很窄 |
- **排除**：Rays Farm 藍染め体験（Google「閉業しました」、官網 2023 後沒更新、2 月方案限 10 歲以上；見 decisions-pending「👤 建議先看」）。第 1 批的排除（スペイン村 冬季休園 等）不變。
- **2 月**：明寫營業的 8 筆（間崎島、サミエール、横山、伊雑宮、的矢湾 BBQ、安乗埼、Entrada（2 月有時刻）、エスパーニャ（代替船））；沒明寫、要電話確認的：遊覧船組合、海遊苑、すし べんけい；天の岩戸 沒有開放時間的來源（推定自由）。
- **長輩**：横山（工期中石段）、天の岩戸（風穴段）、安乗埼（塔內窄階梯）、サミエール（一層樓梯，有昇降機）、エスパーニャ（大船廁所在地下）。
- **交通**：賢島 6 筆都在賢島站步行 2 分內（海遊苑 例外：志摩神明站步行 15 分）；横山、的矢湾 從鵜方站計程車 8～10 分；伊雑宮 上之郷站步行 3 分；天の岩戸 志摩磯部站計程車 10 分（窄山路、大型車不可）；安乗埼 鵜方站巴士 20～30 分＋步行 15 分（班次等 T10）。
- 的矢湾 BBQ 的座標用 Google（渡鹿野島上），集合地是對岸的渡鹿野渡船場（座標待查，questions）。

### 給第 3 批（南部 12 筆）的建議
- 範圍：`data/cache/work/t9a-plan.json` 裡 `batch: 2` 的 12 筆（daio 3、tomoyama 2、goza 3、hamajima 2、sakko 2）。工作目錄 `data/cache/work/t9a-3/`。
- **讀文**：`t9a-2/prompt-common.md` 照抄（改工作目錄），每筆一個 subagent；第 2 批 13 個 subagent 合計 WebSearch 5 次，夠用。
- **Google Maps**：`chrome-actions.mjs --script google-place --google "<名稱>" --store`；列表時截圖點選再跑一次（エスパーニャ、天の岩戸 是這樣）。**cid 網址開的頁面會轉到 www.google.com**，batch 第一個 JS 有時會因「換網域」失敗，navigate 後加 `computer wait 2` 就好。
- **Google 評論**：`--script google-reviews --keywords 冬,子供,階段 --store`，一筆一個 batch（約 11～15 個動作）。評論少於 10 則（間崎島 9 則）時，`open` 後直接 `extract` 抽不到、改跑 `lowest` 就有；沒有「クチコミ」分頁的（すし べんけい）跳過。`lowest` 第一次可能「找不到評価の低い順」，再跑一次就好（天の岩戸）。
- **組裝**：寫 `judgement.json`（格式見第 2 批的檔案），`node scripts/build-spots.mjs shima data/cache/work/t9a-3 --candidates --dry-run` 看過再正式跑；照片先 `photo-check.mjs --file … --out photos.json`。
- 第 1 批列的 2 月未確認的南部景點（志摩自然学校、いわほ 船上 BBQ、志摩グリーンアドベンチャー、海ほおずき 冬季體驗）讀文要先確認，沒有就改 excluded。

### 缺口
- 觀光三重的 `kanko-mie.mjs missing shima` 用名稱比對，合成一筆的候選會被列成「可能是同一個」；兩份列表的每一筆都已經用 id 對過，不用再補。
- 沒有看旅遊書、媒體的「志摩必去」文章（蒐集階段不找），可能漏掉列表外的小店型體驗（例如賢島的真珠店）。T13 或 T9g 再看。
- summary／assessment 留給 T9f。
