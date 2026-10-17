# T7b：鳥羽補資料（欄位搬移、研究筆記改結構）

- 日期：2026-10-18。分支 `t7b`。沒有用 Chrome，也沒有新的網路蒐集；只用 T2～T4c 已有的資料和筆記。
- 輸入一律是 T7b 開工時的 master（`d7e6c6f`），所以腳本可以重跑、結果相同。

## 做了什麼

1. **欄位搬移**（`node scripts/migrate-toba-t7b.mjs`）：`spots.json`、`lodging.json`、`restaurants.json` 137 筆改成新 schema 的欄位。轉換規則寫在腳本開頭的註解；主要的判斷：
   - `region`：餐廳照 `extra.region`；景點、住宿照地址的町名（`regionByAddress`），春雨、面白展望台照 areas.json 的 note 歸 kuzaki。
   - `tags`：只從舊標籤對到固定清單（`TAG_MAP`），不從其他欄位推導。
   - `closures`：只轉來源寫明月日的；每年固定的休業只轉 2026-12～2027-01 那一次；部分設施停用不轉。
   - `hours.always`：文字寫「全天開放」「隨時」「24 小時」「自由參觀」「無開放時間限制」的 7 個景點。
   - `hours.lastEntry`：只有一個 L.O.／最後入館、而且適用 2 月的（景點 4、餐廳 10）。
   - 住宿 `checkIn`／`checkOut`：取開頭的時間，括號裡的補充放 `extra.checkInNote`／`checkOutNote`。
   - 住宿 `dinnerAccess`：不含餐的 5 筆照 T4c 缺漏檢查的結論；`varies` 不填。
   - 餐廳 `price`：食べログ預算「晚／午」分開的照填；只有一個區間時看 `contexts`（只有白天 → lunch、只有晚上 → dinner、兩個都有 → 不轉）。
   - 餐廳 `cuisine`：`CUISINE_MAP` 對到固定清單；「海鮮」這類籠統的詞在有其他種類時省略。
   - 餐廳 `kids`：「可帶小孩」或有小孩價 → `allowed: yes`；年齡限制 4 家手動（喜久屋 minAge 10、屋形船 おきた、丸善水産 age-limit、クッカーニャ unknown）。
   - 餐廳 `group.maxReservation`：只有寫「最大予約可能人数」的 2 家（天びん屋 本店 36、喜久屋 12）。
   - 餐廳 `access`：照 T4c「需搭車的店」（浦村、國崎、外圍 → car）、離島 → ferry、其他 → walk。
   - 餐廳 `seating`：舊的 `other`（沙發座）改成 `sofa`；あみ焼き 天びん屋 的 `seatingNote` 寫有沙發座，加上 `sofa`。
2. **候選清單**（同一支腳本）：`candidates/restaurants.json` 205 家（從 `restaurants.md` 候選表解析）、`candidates/spots.json` 66 筆、`candidates/lodging.json` 112 筆（已收錄的從資料檔產生，被排除、沒收錄的從舊筆記抄進腳本的 `SPOT_CANDIDATES`、`LODGING_CANDIDATES`）。
3. **筆記改結構**（`node scripts/split-toba-notes-t7b.mjs .`）：舊筆記的過程紀錄原文切到 `log/T2.md`、`T3.md`、`T4a.md`、`T4b.md`、`T4c.md`；候選表、被排除的候選換成指到 `candidates/` 的一行；要問的事換成指到 `questions.md` 的一行；T4c 貼上的 `restaurant-gaps.mjs` 輸出刪掉（結論「缺口」保留）。相對連結改成從 `log/` 出發的路徑。
4. `questions.md`（人工整理：從舊筆記的「待確認」「要打電話問」「缺最多的欄位」「給 T4c、T7 的注意事項」集中）、`README.md`（現況、決定、給 T7c～T7e 的建議）。
5. 刪掉舊的 `spots.md`、`lodging.md`、`restaurants.md`。確認方式：舊筆記每一行都在 log 的 keep 範圍裡，或在 cut 範圍裡而且內容在 `candidates/`、`questions.md`、`README.md`（腳本的範圍表）。
6. 改了別人的腳本：`restaurant-gaps.mjs`、`restaurant-anchors.mjs` 改讀 `region`（保留 `extra.region` 的相容）。`restaurant-anchors.mjs toba --offline` 的結果和 T4c 相同（312 筆，OSRM 264、estimate 48）。

## 遇到的問題
- `log/T3.md` 有 356 行，超過 CONVENTIONS 的 300 行：T3 的筆記本身就長（四組各自的「每間重點」），照「只搬不改寫」沒有刪。
- `hours.lastEntry` 只能放一個時間，午、晚各有 L.O. 的店（10 家）放不下；固定清單的 `cuisine` 沒有籠統的「海鮮」，4 家只有「海鮮」的店轉不了。兩件都寫到 `docs/requests.md`。
- 候選清單的 `mentions`：T4a 的候選表只記「來源種類」，沒記是哪一篇；已納入的店從 `restaurants.json` 的 `sources` 補回文章，未納入的 27 家只能在 `note` 寫來源種類。

## 轉不了、留原樣的項目

`node scripts/migrate-toba-t7b.mjs --dry-run --report` 的輸出（這是 T7b 的產出清單，不是檢查結果，所以存下來）。

| 欄位 | 筆數 |
|---|---|
| `closures` | 7 |
| `hours.lastEntry` | 11 |
| `dinnerAccess` | 14 |
| `checkIn` | 1 |
| `cuisine` | 7 |
| `price` | 15 |

#### `closures`（7）

| ID | 原文 | 原因 |
|---|---|---|
| toba-mikimoto-pearl-island |  | 「每年 12 月第 2 個星期二起 3 天」：沒有寫日期 |
| toba-bay-cruise-irukajima |  | 海豚島 2026-12-14～12-28 休園，但遊覽船照常（部分休業）；1～2 月的停航檢修只有第三方資料、沒有日期 |
| toba-seaside-hotel |  | 露天「風見の湯」11～12 月整修（部分設施，沒有寫日） |
| toba-ocean-resort |  | 女湯露天 2026-12-09～11 整修（部分設施） |
| toba-osatsu-michishio |  | 休館日多在週三，2027 年 2 月的還沒公布 |
| toba-toshijima-nakamuraya |  | 露天風呂 1/10 或 1/11～3/17 或 3/18 停用（部分設施，來源有兩種寫法） |
| toba-kamishima-sankaiso |  | 只接週五～週一晚上的住宿（2023 年採訪，不是日期） |

#### `hours.lastEntry`（11）

| ID | 原文 | 原因 |
|---|---|---|
| toba-observatory-pearl-road | 此為咖啡＆商店「海女のテラス」的營業時間（官網）；咖啡最後點餐為打烊前 30 分。週三公休（旺季照常營業，可能改休他日）；週二因設備保養最後點餐可能提早到 15:30。戶外展望廣場本身應可自由進入，但開放時間未查到官方說明。 | 咖啡「打烊前 30 分」L.O.，週二可能提早到 15:30 |
| toba-sazanami | L.O. 14:30、18:30；售完提早打烊；繁忙期 10:30～19:30 不休息（官網） | 午、晚各一個 L.O.（14:30、18:30） |
| toba-seahorse | L.O. 早餐 9:30、午餐 13:30、晚餐 20:30；2026 年 3 月起週五午餐公休（國定假日、黃金週、盂蘭盆、年末年始照常） | 早、午、晚各一個 L.O. |
| toba-the-lobby-lounge | 下午茶時段 10:00～17:00；午餐 11:00～14:00（L.O. 13:30）；Afternoon tea 11:30～13:00、13:30～15:00（各 90 分，前一天 18 時前預約）；輕食、外帶 11:00～17:00；酒吧 17:00～22:30（L.O. 22:00） | 午餐、酒吧各一個 L.O. |
| toba-tenbinya-honten | L.O. 午餐 14:00、晚餐 21:00（週六 21:30）；三連休的週日也營業到 22:00 | 午、晚各一個 L.O.，週六不同 |
| toba-amiyaki-tenbinya | L.O. 午餐 14:00、晚餐 21:00 | 午、晚各一個 L.O.（14:00、21:00） |
| toba-dining-shiraishi | 早餐 L.O. 9:30；晚餐 L.O. 20:30，17:30～ 或 20:00 前後～ 兩梯次（官網） | 早餐、晚餐各一個 L.O. |
| toba-hakkai | 觀光三重：10:00～16:00（L.O.）；牡蠣吃到飽 11:00～、12:30～、14:00～ | 「10:00～16:00（L.O.）」：打烊時間就是 L.O.，和 hours 的關係不明 |
| toba-kikuya | 午餐最後入店 13:00、晚餐 19:00；不定休（食べログ店舗会員） | 午、晚各一個最後入店（13:00、19:00） |
| toba-niku-matsumura | L.O. 14:00、20:00 | 午、晚各一個 L.O.（14:00、20:00） |
| toba-kagetsu | 官網時間是 L.O.；不定休 | 「官網時間是 L.O.」：午、晚兩段都是 L.O. |

#### `dinnerAccess`（14）

| ID | 原文 | 原因 |
|---|---|---|
| toba-todaya | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-kokusai-hotel | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-shiojitei | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-seaside-hotel | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-senpokaku | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-saichoraku | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-amanoshima | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-kamenoi-hotel | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-osatsu-sora-no-kaze | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-osatsu-ohtaya | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-ijika-kagura | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-motoura-sun-urashima | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-motoura-ginrin | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |
| toba-log-rocky | meals: varies | T4c 只檢查 meals 是 none／breakfast 的住宿 |

#### `checkIn`（1）

| ID | 原文 | 原因 |
|---|---|---|
| toba-sugashima-nakora | 14:30（楽天，最晚 15:00）／15:00（じゃらん） | 兩個來源的時間不同 |

#### `cuisine`（7）

| ID | 原文 | 原因 |
|---|---|---|
| toba-sazanami | 炸物（コロッケ） | 對不到固定清單，省略（其他詞已轉） |
| toba-kaisen-yamato | ["海鮮"] | 只有籠統的「海鮮」或對不到固定清單 |
| toba-nishikiya | 麵類 | 對不到固定清單，省略（其他詞已轉） |
| toba-kuroshio-osatsu | 炸物 | 對不到固定清單，省略（其他詞已轉） |
| toba-kikuya | ["海鮮"] | 只有籠統的「海鮮」或對不到固定清單 |
| toba-mutsumi | ["海鮮"] | 只有籠統的「海鮮」或對不到固定清單 |
| toba-ousho-honten | ["海鮮"] | 只有籠統的「海鮮」或對不到固定清單 |

#### `price`（15）

| ID | 原文 | 原因 |
|---|---|---|
| toba-sazanami | ¥3,000～3,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-osakaya | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-amagoya-hamanami | ¥2,000～3,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-sushiume | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-nagatokan | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-yakatabune-okita | 每人 ¥4,980～8,950（含料理和乘船費） | 格式不是食べログ的預算區間 |
| toba-nishikiya | ¥1,000～1,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-manten-shokudo | ～¥999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-cafeterrace-orange | ¥1,000～1,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-kaitaro | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-petit-kamado-uemura | 基本套餐 ～¥4,000（官網） | 格式不是食べログ的預算區間 |
| toba-nishimura-shokudo | ¥2,000～3,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-marumitsu-sushi | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-mutsumi | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |
| toba-minato-shokudo | ¥2,000～2,999 | 只有一個區間，contexts 午晚都有，看不出是哪一餐 |

#### 候選清單：只知道來源種類、不知道是哪一篇（27 家，寫在 note，mentions 沒有填）

漁師直営店浜幸（not-included）、味佐々（not-included）、喫茶 チェリー（not-included）、海鮮茶屋えびしま（not-included）、いわし亭（not-included）、うどん・そば 吉平（not-included）、鳥羽の食堂 海誠（not-included）、弁慶（not-included）、ごはんや ふくつぎ（not-included）、海月（excluded）、カーナピーナ（not-included）、オイスターファーム 山善水産（not-included）、久保田水産（not-included）、まっちゃん食堂（not-included）、小島水産かき養殖場（not-included）、ROUTE 750（not-included）、牡蠣料理 さとや（over-limit）、かきいち 大吉店（over-limit）、モンキー（over-limit）、マルナカ水産 マルマ本店（over-limit）、焼きカキ かき丸（over-limit）、OYSTER HOUSE Grow（not-included）、きゅう＆しろ おやつとコーヒー（not-included）、みのなる森とこよの郷（not-included）、相差かまど（excluded）、海女小屋はちまんかまど（excluded）、お弁当 おかげ屋（excluded）

#### 拿掉的自由標籤（66 筆，不是錯誤：描述性的文字和子地區不放 tags）

| ID | 拿掉的 |
|---|---|
| toba-aquarium | 水族館、鳥羽站周邊 |
| toba-mikimoto-pearl-island | 博物館、珍珠、海女、鳥羽站周邊 |
| toba-bay-cruise-irukajima | 遊覽船、海豚、海獅、戶外、鳥羽站周邊 |
| toba-castle-ruins | 城跡、歷史、公園、免費、戶外、九鬼水軍 |
| toba-hiyoriyama-observatory | 登山步道、免費、戶外、歷史 |
| toba-marche | 購物、產地直售、伴手禮、餐廳、鳥羽站周邊 |
| toba-ichibangai | 購物、伴手禮、珍珠、餐廳、足湯、鳥羽站周邊 |
| toba-edogawa-rampo-museum | 文學館、博物館、江戶川亂步、鳥羽站周邊 |
| toba-kadoya | 歷史建築、免費、江戶時代 |
| toba-sea-folk-museum | 博物館、海女文化、漁業民俗、建築 |
| toba-observatory-pearl-road | 太平洋、パールロード、咖啡、伴手禮、戶外 |
| toba-osatsu-ishigami | 海女信仰、許願、女性守護、戶外 |
| toba-osatsu-ama-culture-museum | 資料館、海女文化、免費、觀光案內、停車場 |
| toba-osatsu-kamado | 海女小屋、用餐、海鮮炭烤、海女文化、需預約 |
| toba-hachiman-kamado | 海女小屋、用餐、海鮮炭烤、海女文化、需預約、接駁車 |
| toba-yoroizaki-lighthouse | 燈塔、太平洋、志摩半島最東端、戶外、國崎 |
| toba-harusame-observatory | 的矢灣、夕陽、鐘、戶外 |
| toba-omoshiro-observatory | パールロード、リアス海岸、廁所、戶外 |
| toba-izawa-jinja | 志摩國一宮、森林步道、難走、戶外 |
| toba-sadahama-marine-terminal | 碼頭、交通、離島出發點 |
| toba-toshijima-wagu | 離島、歷史、史跡、九鬼水軍、搭船、戶外 |
| toba-toshijima-toshi | 離島、漁村、街區散步、搭船、戶外 |
| toba-sugashima-lighthouse | 離島、燈塔、重要文化財、健行、水仙、搭船、戶外 |
| toba-sugashima-shirongo-beach | 離島、海女、搭船、戶外 |
| toba-kamishima-yatsushiro-jinja | 離島、潮騒、三島由紀夫、搭船、戶外 |
| toba-kamishima-lighthouse | 離島、燈塔、潮騒、健行、搭船、戶外 |
| toba-kamishima-kantekisho | 離島、戰爭遺跡、潮騒、搭船、戶外 |
| toba-kamishima-karst | 離島、地質、搭船、戶外 |
| toba-todaya | 一泊二食、大浴場、包租浴池、海景、鳥羽站步行、大型旅館、團體方案、電梯 |
| toba-kokusai-hotel | 飯店、海景、西餐、鳥羽站周邊、洋室、床 |
| toba-shiojitei | 一泊二食、大浴場、海景、和室、鳥羽站周邊 |
| toba-seaside-hotel | 一泊二食、自助餐、大浴場、海景、大型飯店、團體方案、安楽島 |
| toba-view-hotel-hanashinju | 一泊二食、大浴場、海景、和室、安楽島 |
| toba-senpokaku | 一泊二食、大浴場、海景、電梯 |
| toba-grand-hotel | 一泊二食、自助餐、房間餐、大浴場、海景、小浜、團體 |
| toba-kochoran | 一泊二食、房間餐、大浴場、海景、小浜 |
| toba-saichoraku | 一泊二食、自助餐、大浴場、泳池、平價、小浜 |
| toba-ocean-resort | 一泊二食、全包式、大浴場、海景、床、安楽島 |
| toba-amanoshima | 一泊二食、大浴場、海景、椅子席、安楽島 |
| toba-kamenoi-hotel | 一泊二食、自助餐、大浴場、海景、電梯、安楽島 |
| toba-osatsu-michishio | 一泊二食、海景、大浴場、貸切風呂、大廣間、電梯、伊勢海老、相差、大型 |
| toba-osatsu-sora-no-kaze | 一泊二食、素泊、海景、大浴場、貸切風呂、電梯、伊勢海老、牡蠣、相差、大型 |
| toba-osatsu-ichii | 一泊二食、海景、大浴場、鳥羽站免費接送、伊勢海老、相差、大型 |
| toba-osatsu-ohtaya | 一泊二食、素泊、海景、大浴場、三溫暖、有床、石神さん步行圈、伊勢海老、相差 |
| toba-osatsu-nakayoshi | 一泊二食、大浴場、露天風呂、貸切風呂、伊勢海老、鮑魚、石神さん步行圈、相差 |
| toba-osatsu-kashio | 一泊二食、料理自慢、伊勢海老、鮑魚、包廂用餐、石神さん步行圈、相差、小型 |
| toba-kuzaki-tamaya | 一泊二食、伊勢海老、鮑魚、海景、国崎、小型、幾乎包棟 |
| toba-ijika-kagura | 一泊二食、一泊朝食、海景、大浴場、貸切風呂、鳥羽站免費接送、伊勢海老、石鏡、大型 |
| toba-motoura-sun-urashima | 一泊二食、一泊朝食、海景、大浴場、貸切風呂、有床、鳥羽站免費接送、牡蠣、伊勢海老、浦村、大型 |
| toba-uramura-marusan | 一泊二食、海景、牡蠣、伊勢海老、包廂用餐、電梯、浦村 |
| toba-uramura-miurasou | 一泊二食、牡蠣、伊勢海老、海景、包廂用餐、展望風呂、浦村、小型 |
| toba-motoura-ginrin | 一泊二食、一泊朝食、炭火燒、伊勢海老、鮑魚、牡蠣、海景、大浴場、浦村、小型、幾乎包棟 |
| toba-toshijima-nakamuraya | 一泊二食、海景、離島、答志島、和具港、港口接送、大廣間 |
| toba-toshijima-suzunami | 一泊二食、海景、離島、答志島、和具港、電梯、大廣間 |
| toba-toshijima-yamashichi | 一泊二食、海景、離島、答志島、和具港、港口接送、電梯、大廣間、牡蠣 |
| toba-toshijima-misaki | 一泊二食、海景、離島、答志島、答志港、港口接送、2月價格 |
| toba-toshijima-takaraya | 一泊二食、露天風呂、離島、答志島、和具港、港口接送、ふぐ |
| toba-toshijima-teiyou | 一泊二食、海景、離島、答志島、答志港、港口接送 |
| toba-sugashima-nakora | 一泊二食、民宿、離島、菅島、港口接送、包租浴池、寵物可 |
| toba-kamishima-sankaiso | 一泊二食、離島、神島、海景、潮騷 |
| toba-anchor-ajito | 素泊、自炊、海景、BBQ、大人數、南鳥羽 |
| toba-log-rocky | 素泊、自炊、BBQ、伊勢龍蝦鍋、木屋、可帶寵物、海景 |
| toba-higashinomado | 素泊、自炊、海景、BBQ、南鳥羽 |
| toba-mfr-iseshima | 素泊、自炊、海景、BBQ、牡蠣、三溫暖、卡拉OK、可帶寵物、大人數、南鳥羽 |
| toba-lido-porte | 素泊、自炊、近車站、鳥羽市區 |
| toba-ryokan-naomi | 古民家、素泊、自炊、漁港、鳥羽市區 |
