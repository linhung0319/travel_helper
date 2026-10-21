# 跨區整理檢查（T13，scripts/cross-area-check.mjs）

產生：2026-10-21。資料點：景點 79、住宿 145、餐廳 292。

## 1. 重複候選（1）

住宿和它的 `-dining` 不算。

| A | B | 依據 | 跨區 |
|---|---|---|---|
| ise-akafuku-honten | ise-akafuku-bettenpo | 近 24 m |  |

## 2. ID（2）

| ID | 問題 |
|---|---|
| shima-hanaya-dining | -dining 但沒有 extra.lodgingId，也對不到住宿（住宿沒收錄的館內餐廳） |
| shima-amanemu-dining | -dining 但沒有 extra.lodgingId，也對不到住宿（住宿沒收錄的館內餐廳） |

## 3. 標籤

不在固定清單：沒有。

可以從結構化欄位補、還沒補（判斷細則「tags 從結構化欄位補」）：沒有。

## 4. 分級分布

A 以上的比例超過約 25% 要看門檻（§5.1「數字門檻依區調整」；10 筆以下只當參考）。

| 區域 | 類型 | 筆數 | S | A | B | 沒評分 | A 以上 |
|---|---|---|---|---|---|---|---|
| shima | spot | 24 | 1 | 4 | 19 | 0 | 21% |
| shima | lodging | 56 | 6 | 4 | 46 | 0 | 18% |
| shima | restaurant | 78 | 0 | 11 | 67 | 0 | 14% |
| toba | spot | 33 | 3 | 6 | 19 | 5 | 32% ⚠️ |
| toba | lodging | 38 | 5 | 18 | 15 | 0 | 61% ⚠️ |
| toba | restaurant | 83 | 2 | 15 | 66 | 0 | 20% |
| futami | spot | 4 | 1 | 1 | 2 | 0 | 50% |
| futami | lodging | 17 | 2 | 1 | 14 | 0 | 18% |
| futami | restaurant | 18 | 0 | 3 | 15 | 0 | 17% |
| ise | spot | 18 | 2 | 2 | 14 | 0 | 22% |
| ise | lodging | 24 | 3 | 1 | 20 | 0 | 17% |
| ise | restaurant | 108 | 2 | 19 | 87 | 0 | 19% |
| kix | lodging | 10 | 0 | 3 | 7 | 0 | 30% |
| kix | restaurant | 5 | 0 | 0 | 5 | 0 | 0% |

## 5. 車站

餐廳是 anchors 有這個車站的（步行圈內）；午餐、晚餐是旅程中有一天在 11:30～13:30、18:00～19:00 營業。0 家的用粗體。

| 車站 | 區域 | 餐廳 | 午餐 | 晚餐 | fit15 yes | 景點 | 住宿 |
|---|---|---|---|---|---|---|---|
| iseshi 伊勢市 | ise | 13 | 6 | 10 | 5 | 6 | 15 |
| ujiyamada 宇治山田 | ise | 6 | 6 | 3 | 2 | 1 | 2 |
| isuzugawa 五十鈴川 | ise | 47 | 31 | 6 | 14 | 9 | 4 |
| asama 朝熊 | ise | **0** | **0** | **0** | 0 | 0 | 0 |
| ikenoura 池の浦 | toba | **0** | **0** | **0** | 0 | 0 | 1 |
| toba 鳥羽 | toba | 11 | 8 | 5 | 4 | 32 | 37 |
| nakanogo 中之郷 | toba | 2 | 2 | 2 | 1 | 1 | 1 |
| shima-akasaki 志摩赤崎 | toba | 6 | 6 | 5 | 3 | 0 | 0 |
| funatsu 船津 | toba | **0** | **0** | **0** | 0 | 0 | 0 |
| kamo 加茂 | toba | 1 | 1 | **0** | 1 | 0 | 0 |
| matsuo 松尾 | toba | **0** | **0** | **0** | 0 | 0 | 1 |
| shiraki 白木 | toba | **0** | **0** | **0** | 0 | 0 | 0 |
| gochi 五知 | shima | **0** | **0** | **0** | 0 | 0 | 0 |
| kutsukake 沓掛 | shima | **0** | **0** | **0** | 0 | 0 | 0 |
| kaminogo 上之郷 | shima | 1 | 1 | **0** | 0 | 1 | 0 |
| shima-isobe 志摩磯部 | shima | 1 | 1 | 1 | 1 | 1 | 2 |
| anagawa 穴川 | shima | **0** | **0** | **0** | 0 | 0 | 0 |
| shima-yokoyama 志摩横山 | shima | 4 | 4 | 3 | 3 | 0 | 1 |
| ugata 鵜方 | shima | 18 | 16 | 16 | 9 | 16 | 31 |
| shima-shimmei 志摩神明 | shima | 3 | 2 | 2 | 1 | 1 | 2 |
| kashikojima 賢島 | shima | 12 | 9 | 6 | 6 | 5 | 20 |
| jr-iseshi 伊勢市 | ise | 20 | 10 | 12 | 6 | 0 | 0 |
| jr-isuzugaoka 五十鈴ケ丘 | ise | 5 | 4 | 4 | 2 | 1 | 1 |
| jr-futaminoura 二見浦 | futami | 14 | 8 | 6 | 3 | 3 | 15 |
| jr-matsushita 松下 | futami | 3 | 2 | **0** | 0 | 1 | 0 |
| jr-toba 鳥羽 | toba | 21 | 17 | 13 | 5 | 0 | 0 |
| obata 小俣 | ise | 1 | 1 | 1 | 1 | 1 | 0 |
| miyamachi 宮町 | ise | 10 | 7 | 10 | 6 | 0 | 2 |

## 6. 子地區

| 區域 | 子地區 | needsCar | 景點 | 住宿 | 餐廳 |
|---|---|---|---|---|---|
| shima | shima-kashikojima 賢島 |  | 6 | 12 | 13 |
| shima | shima-ugata 鵜方・志摩神明 |  | 1 | 9 | 24 |
| shima | shima-yokoyama 横山 | ✓ | 1 | 0 | 1 |
| shima | shima-isobe 志摩磯部・上之郷・穴川 |  | 1 | 0 | 4 |
| shima | shima-spain 志摩スペイン村（坂崎） |  | 0 | 0 | **0** |
| shima | shima-amanoiwato 天の岩戸・恵利原 | ✓ | 1 | 0 | **0** |
| shima | shima-matoya 的矢湾・渡鹿野島 | ✓ | 1 | 8 | 7 |
| shima | shima-anori 安乗 | ✓ | 1 | 3 | 4 |
| shima | shima-kokufu 国府・甲賀・志島 | ✓ | 0 | 6 | 4 |
| shima | shima-daio 大王・波切 | ✓ | 3 | 0 | 4 |
| shima | shima-tomoyama 登茂山（ともやま公園） | ✓ | 2 | 5 | 3 |
| shima | shima-goza 御座・越賀 | ✓ | 3 | 4 | 1 |
| shima | shima-wagu 和具・布施田・片田 | ✓ | 0 | 1 | 2 |
| shima | shima-hamajima 浜島 | ✓ | 2 | 5 | 6 |
| shima | shima-sakko 迫子（志摩地中海村・NEMU） | ✓ | 2 | 2 | 3 |
| shima | shima-other 志摩市その他（散在） | ✓ | 0 | 1 | 2 |
| toba | toba-station 鳥羽駅周辺 |  | 9 | 8 | 32 |
| toba | toba-outskirts 鳥羽市街外縁 | ✓ | 1 | 6 | 6 |
| toba | nakanogo 中之郷 |  | 1 | 1 | 4 |
| toba | uramura 浦村 | ✓ | 1 | 6 | 18 |
| toba | osatsu 相差 | ✓ | 4 | 7 | 10 |
| toba | kuzaki 国崎・パールロード | ✓ | 4 | 2 | 6 |
| toba | toshijima 答志島 |  | 5 | 6 | 3 |
| toba | sugashima 菅島 |  | 3 | 1 | 2 |
| toba | kamishima 神島 |  | 5 | 1 | 2 |
| futami | futami-okitama 二見浦・夫婦岩 |  | 3 | 12 | 13 |
| futami | futami-outskirts 二見町外縁 | ✓ | 1 | 5 | 5 |
| ise | ise-geku 外宮・伊勢市駅周辺 |  | 6 | 17 | 45 |
| ise | ise-kurata 倉田山・五十鈴川駅周辺 |  | 4 | 1 | 7 |
| ise | ise-isuzugaoka 五十鈴ケ丘・伊勢IC周辺 | ✓ | 1 | 1 | 4 |
| ise | ise-obata 小俣・御薗 |  | 1 | 0 | 4 |
| ise | ise-naiku 内宮・おはらい町 |  | 4 | 4 | 43 |
| ise | ise-asama 朝熊山 | ✓ | 2 | 0 | 1 |
| ise | ise-outskirts 伊勢市街外縁（その他） | ✓ | 0 | 1 | 4 |
| kix | kix-island 関西空港（空港島） |  | 0 | 1 | 1 |
| kix | rinku りんくうタウン |  | 0 | 6 | 1 |
| kix | izumisano 泉佐野 |  | 0 | 3 | 3 |

## 7. 可信度

### S、A 但 confidence low（8）

| tier | ID | 名稱 | 推薦度理由 |
|---|---|---|---|
| A | shima-iwajin-kissa | イワジン喫茶室 | 食べログ 3.45（122 則）＋ Google 4.3 → 第 1 條 4；口コミ（2025～2026）多在 3.5 以上，負評只有送錯餐 1 則 |
| A | futami-ofukumochi-honke | 御福餅 本家 | 食べログ 3.49（203 則）、Google 4.2（604 則），まっぷる、4travel 都有介紹；口コミ多半是 2024 年搬遷前的舊店 |
| A | futami-asahiya-sakamoto-manju | 旭家 酒素饅頭製造本舗 | 食べログ 3.45（100 則）、Google 4.6（175 則），観光三重、るるぶ、まっぷる 都介紹 |
| A | ise-tofuan-yamanaka | 豆腐庵山中 | 食べログ 3.59（593 則）、Google 4.2（227 則），觀光三重 2 篇特輯都選入 |
| A | ise-nikawa | にかわ | 食べログ 3.93（150 則）、Google 4.5（62 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；Time Out、なっぷ 說入選米其林必比登 |
| A | ise-bon-vivant | ボン・ヴィヴァン | 食べログ 3.71（155 則）、Google 4.5（147 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；米其林 2019、Gault&Millau 掲載，觀光三重、まっぷる 推薦 |
| A | ise-dandelion-chocolate-geku | ダンデライオン・チョコレート 伊勢外宮店 | 食べログ 3.59（414 則）、Google 4.1（535 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；觀光三重、Walkerplus、Time Out 介紹 |
| A | ise-kaki-no-tomo | 牡蠣の朋 | 食べログ 3.55（178 則）、Google 4.5（296 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；介紹只有 TikTok／IG 轉載 |

### 2 月營業或營業狀態沒確認的景點（11）

| tier | ID | 名稱 | winterFit | 理由 |
|---|---|---|---|---|
| B | shima-espana-cruise | 賢島エスパーニャクルーズ（英虞湾遊覧） | 2 | 2/1～3/5 大船休業、改小型代替船（定員、設備不明），冬天甲板冷 |
| B | shima-kashikojima-yuransen | あご湾島めぐりクルーズ（賢島遊覧船組合） | 2 | 2 月營業沒明寫（不定期運行、天候休）→ 照「2 月很可能休業但日期未確認」打 2 |
| B | shima-kaiyuen | 賢島フィッシングパーク 海遊苑 | 2 | 觀光協會說冬天改陶板燒，但 2 月釣り堀營業沒明寫 → 2 |
| B | shima-sushi-benkei | すし べんけい 寿司握り体験 | 4 | 室內體驗；營業日、2 月營業沒有來源，但沒有冬季休業的跡象 → 照室內打 4（T9g：「沒明寫」不再一律 2，同鳥羽 おおさつ かまど） |
| B | shima-satoumian | 海女小屋体験施設さとうみ庵（海女資料館） | 3 | 2 月營業沒明寫（觀光三重是 2022～23 年的資料），沒有冬季休業的跡象；海女小屋沒有暖氣 → 3（T9g：「沒明寫」不再一律 2） |
| B | shima-pearl-miki | 真珠体験 パール美樹 | 4 | 室內的珍珠體驗；2 月營業沒明寫，但沒有冬季休業的跡象 → 4（T9g：「沒明寫」不再一律 2） |
| B | shima-iwaho-bbq-cruise | あご湾めぐりと船上バーベキュー（いわほ観光汽船） | 2 | 2 月營業沒明寫（觀光三重只寫年中無休）→ 2 |
| B | shima-green-adventure | 志摩グリーンアドベンチャー（アトラクションフィールド） | 3 | 戶外設施；營業カレンダー只公布到 2026-10（還沒公布，不是休業的跡象）→ 戶外 3（T9g：「沒明寫」不再一律 2） |
| A | toba-bay-cruise-irukajima | 鳥羽湾めぐりとイルカ島 | 2 | 1 月中旬～2 月上旬有年度休業，旅程大半很可能停航；有開的話海上也冷 |
| A | toba-osatsu-kamado | 海女小屋 相差かまど | 4 | 室內有炭火、冬天是貝類的季節；2 月營業沒有來源確認 |
| B | futami-omotesando | 夫婦岩表参道（旅館街） | 3 | 戶外街道、全年通行，2 月店家營業不明 |
