# 共同規則與資料格式

所有 Claude Code session 都要遵守這份文件。資料格式已由 T0 寫成 JSON Schema，T7（2026-10-17）根據鳥羽試做的結果修正；T7 的討論過程見 [T7-review.md](T7-review.md)。

---

## 1. 目錄結構

```
travel_helper/
├─ CLAUDE.md                 每個 session 自動讀取的入口說明
├─ docs/
│  ├─ PLAN.md                任務與執行順序
│  ├─ CONVENTIONS.md         本文件
│  └─ requests.md            修改共用檔案的請求（由 T0、T7 處理）
├─ schema/                   JSON Schema（T0 建立）
├─ data/
│  ├─ areas.json             區域劃分
│  ├─ stations.json          車站
│  ├─ passes.json            票券規則、特急費用
│  ├─ access/                機場往返交通（T1b）
│  ├─ areas/<area-id>/
│  │  ├─ spots.json          景點
│  │  ├─ lodging.json        住宿
│  │  └─ restaurants.json    餐廳
│  ├─ timetables/
│  │  ├─ kintetsu/<station-id>.json
│  │  ├─ bus/<route-id>.json
│  │  ├─ jr/<station-id>.json
│  │  └─ ferry/<route-id>.json
│  ├─ raw/<area-id>/         研究筆記（怎麼存見 §4「研究筆記怎麼存」）
│  │  ├─ README.md           區域的現況、決定、給後續的建議（開工先讀這個）
│  │  ├─ candidates/         候選清單 JSON（含沒納入、被排除的）
│  │  ├─ dossiers/<id>.md    每個資料點的讀文筆記（摘要、評分的依據）
│  │  ├─ questions.md        要打電話或人工確認的事
│  │  └─ log/<任務 ID>.md    各任務的過程紀錄（寫完不再改）
│  ├─ derived/               腳本產生的檢查結果（例如評分一致性），不要手改
│  └─ cache/
│     ├─ routes/             路線計算的快取
│     └─ work/<任務>-<批>/    一批的工作檔（batch.json、Chrome 抽取結果、facts、judgement），不進 git（見 §4「工具」）
├─ scripts/                  驗證、蒐集、地理計算的腳本
└─ web/                      前端（Vite + React + TypeScript + MapLibre GL）
```

區域 ID：`ise`、`futami`、`toba`、`shima`、`kix`（關西機場周邊，只有住宿和晚餐）

每個區域在 `areas.json` 有**子地區**（`regions`），是搜尋、缺漏檢查、地圖篩選的單位；資料點的 `region` 填子地區 ID。

---

## 1.5 Schema 與驗證（T0 建立）

- JSON Schema 放在 `schema/`：`common`（共同欄位）、`station`、`spot`、`lodging`、`restaurant`、`area`、`timetable-kintetsu`、`kintetsu-travel-times`、`passes`、`access`、`candidate`（`raw/<area>/candidates/*.json`），以及格式還沒定的檔案共用的 `sourced-document`（目前只有 `timetables/bus/*.json`：只要求最外層是物件、有 `sources`，T10 定好格式後到 `docs/requests.md` 提出）。
- 驗證：`npm run validate`（或 `node scripts/validate.mjs`；bash 下可以直接跑 `scripts/validate`）。第一次使用前要先 `npm install`。
  - 檢查：符合 schema、資料點 ID 全專案唯一、座標在伊勢志摩範圍內（`access/`、`kix` 區域放寬到關西、中部）、引用的 ID 存在（`nearestStation`、`access.from`、`anchors`、`transfers`、`group.nearbyCombos`、`areas.json` 的 `stations`）、`region` 在該區域的 `regions` 裡、候選清單的 key 不重複而且 `pointId` 存在、有 `assessment` 時 `tier` 和推薦度一致、檔案在規定的位置。
  - 座標不在所屬區域的 `bbox` 內只會警告（bbox 是大致範圍）。
- `areas/*.json`、`stations.json` 等清單檔的最外層是**陣列**，每個元素一筆資料。
- schema 不允許沒定義的欄位：暫時放進 `extra`，需要正式欄位的話寫到 `docs/requests.md`。

### ID 規則
- 近鐵車站：站名的羅馬字（`toba`、`ugata`、`kashikojima`、`shima-isobe`）；JR 車站加 `jr-` 前綴（`jr-toba`、`jr-futaminoura`）。同一站的近鐵、JR 用 `transfers` 互相連結。
- 區域 ID 是另一個命名空間，可以和車站 ID 相同（區域 `toba`、車站 `toba`）。
- 其他資料點建議以區域開頭，例如 `toba-aquarium`。

### 營業時間（`hours`）
- 整個欄位 `null`：不知道。某一天 `null`：那天不知道；`[]`：那天公休；可以有多個時段，例如 `[["11:00", "14:00"], ["17:00", "21:00"]]`。
- 可以加 `holiday`（國定假日）和 `note`。過了午夜寫 `25:00`。
- `lastEntry`：最後入場或最後點餐（程式會用來檢查）。午、晚各有一個 L.O. 時寫成陣列，依序對應各天的時段（`["14:30", "20:00"]`；某個時段沒有就寫 null）；`always: true`：戶外、自由參觀，全天開放。
- 冬季休業、改裝這類**有日期的休業**寫進 `closures`（`[{ "from": "2027-01-10", "to": "2027-02-28", "note": "冬季休業" }]`），程式才判斷得了；`febNote` 仍然寫給人看的說明。

---

## 2. 檔案歸屬（並行時避免衝突）

| 檔案 | 誰可以寫 |
|---|---|
| `schema/`、`data/areas.json`、`data/stations.json` | 只有 T0、T7 |
| `data/areas.json` 裡**自己區域的 `regions`** | 負責該區的任務（T7b～T7g、T8a、T9a、T19）；其他欄位仍然只有 T0、T7 |
| `data/timetables/kintetsu/`、`data/passes.json` | T1 |
| `data/access/`、`data/raw/access/` | T1b（機場往返交通） |
| `data/timetables/bus/`、`jr/`、`ferry/` | T10（`passes.json` 的巴士部分也由 T10 補充） |
| `data/areas/<area>/`、`data/raw/<area>/` | 負責該區的任務（鳥羽 T2～T4c、T7b～T7h；伊勢 T8a～T8f；志摩 T9a～T9f；關西機場周邊 T19）。例外：T7i 改鳥羽、伊勢、二見 `lodging.json` 的 `ratings`、`sources`（不和 T8e 同時做） |
| `docs/CONVENTIONS.md` 的「口コミ、Google 評論」一節 | T8e 補「還沒確認的」實測結果和選擇器的修正；其他部分照舊由 👤 討論後修改 |
| `data/cache/` | 任何任務都可以新增，不可以刪除別人的檔案 |
| `data/derived/` | 只由腳本產生（例如評分的一致性檢查），不要手改 |
| `docs/decisions-pending.md` | 任何任務都可以新增（自動模式下代替 👤 做的決定）；只追加，不改別人的項目。開頭的「👤 建議先看」由 👤 或盤點的 session 維護 |
| `docs/auto-run-log.md` | 只有指揮 session（PLAN §3「自動依序執行」） |
| `docs/interaction-design.md` | 👤 討論後修改；T11、T12、T14、T15、T16 實作時可以補上細節，改到設計方向的先和 👤 確認 |
| `web/` | T5、T11、T12、T15、T16（同時進行時，各自負責的目錄要先講好） |
| `scripts/` | 新增檔案自由；修改別人的腳本要在 commit 訊息裡說明 |

需要修改不屬於自己的檔案時，寫在 `docs/requests.md`，不要直接改。

---

## 3. 資料格式（草稿）

### 共同欄位（所有資料點都有）
以下範例裡的數值（座標、價格、時間等）都只是示意，**不要直接當成真實資料使用**。
```jsonc
{
  "id": "toba-aquarium",            // kebab-case，全專案唯一
  "type": "spot",                    // station | spot | lodging | restaurant
  "name": { "ja": "鳥羽水族館", "zh": "鳥羽水族館", "en": "Toba Aquarium" },
  "area": "toba",
  "coords": [136.8456, 34.4818],     // [經度, 緯度]，注意順序
  "coordsSource": "google-maps-url", // 座標從哪裡來，方便之後檢查
  "address": "三重県鳥羽市鳥羽3-3-6",
  "hours": {                         // 一週的營業時間；不知道就留 null，不要猜
    "mon": [["09:00", "17:00"]], "tue": null
  },
  "closedNote": "不定休",
  "febNote": "2 月照常營業",          // 冬季、淡季的特別狀況（給人看）
  "closures": [],                    // 有日期的休業（給程式判斷），見 §1.5
  "events": [{ "date": "2027-02-03", "note": "節分祭" }],
  "region": "toba-station",          // 子地區（areas.json 的 regions）
  "photos": [                        // 1～3 張，只記 URL，不下載（見 §4「照片」）
    { "url": "...", "page": "...", "kind": "official", "credit": "鳥羽水族館", "license": null }
  ],
  "summary": {                       // 給使用者看的介紹（見 §4「摘要」）
    "text": "2～3 句介紹",
    "pros": ["推薦原因"], "cons": ["可能的問題"],
    "basedOn": ["https://..."], "generated": "2026-11-01"
  },
  "assessment": {                    // Claude 依類型的評分標準打分（見 §5.1），和 summary 一起寫
    "rubric": "restaurant-v1",
    "scores": { "recommend": 4, "localFlavor": 5, "groupFit": 2, "elderFit": 3, "kidsFit": 4 },   // 1～5 顆星；資料不足填 null
    "rationale": { "recommend": "一句理由", "groupFit": "最大予約 8 人" },
    "confidence": "medium",          // high | medium | low
    "assessed": "2026-11-01"
  },
  "links": { "official": "...", "googleMaps": "...", "tabelog": "...", "instagram": "@xxx" },
  "tags": [],
  "tier": null,                      // S | A | B，由 assessment.scores.recommend 決定（5＝S、4＝A、其他＝B），和 assessment 一起寫
  "sources": [                       // 必填，至少一筆
    { "type": "official", "url": "...", "retrieved": "2026-10-20", "note": "營業時間" }
  ],
  "verified": false,                 // 是否經過人工確認
  "extra": {}                        // schema 還沒定義、但值得留下的資訊
}
```

### 車站（`station`）
```jsonc
{
  "operator": "kintetsu",            // kintetsu | jr | bus
  "lines": ["鳥羽線", "志摩線"],
  "passCovered": true,               // 近鐵 5 日券能不能用
  "coinLockers": "有，大型行李可",
  "accessibility": "有電梯；月台之間要走天橋"   // 長輩上下月台、帶行李時很重要
}
```

### 景點（`spot`）
```jsonc
{
  "nearestStation": { "id": "toba", "mode": "walk", "minutes": 10 },
  "access": [ { "from": "ugata", "mode": "bus", "minutes": 10, "note": "三重交通，班次少" } ],
  "admission": "大人 2800 円",
  "stayMinutes": 120,
  "indoor": true,                    // 下雨天的替代選擇
  "ratings": { "google": 4.3, "googleReviews": 5200 },   // 景點用評論數當人氣
  "phone": "0599-xx-xxxx",
  "fares": {                         // 票價：長輩、小孩分開記
    "adult": "2800 円", "child": "1400 円（小學生）", "senior": "65 歲以上 2500 円", "group": "15 人以上 9 折"
  },
  "group": {                         // 團體相關
    "reservation": "團體需事先聯絡",
    "contact": { "phone": "0599-xx-xxxx", "url": "...", "note": "日文" },
    "note": "遊覽船定員 40 人"
  },
  "accessibility": {                 // 長輩（約 70 歲）友善程度
    "walkInsideMinutes": 40,         // 景點內要走多久
    "stairs": "少",                  // 無 | 少 | 多（例如展望台的長階梯）
    "slope": "有一段上坡",
    "restAreas": true,               // 途中有沒有休息座位
    "toilets": true,
    "barrierFree": "有電梯",
    "note": null
  },
  "kids": {                          // 小孩（6～10 歲）
    "friendly": "high",              // high | medium | low
    "note": "觸摸池、海獅表演"
  }
}
```

### 住宿（`lodging`）
```jsonc
{
  "kind": "ryokan",                  // hotel | ryokan | minshuku | rental-house（一棟貸し）| other
  "nearestStation": { "id": "toba", "mode": "walk", "minutes": 5 },
  "pickup": "鳥羽站免費接送，需預約",
  "meals": "dinner+breakfast",       // none | breakfast | dinner+breakfast
  "priceRange": "每人 15000～25000 円（一泊二食）",
  "prices": [                        // 盡量記具體價格，方便之後估預算
    { "plan": "一泊二食", "unit": "per-person", "adult": 18000, "child": 12600, "season": "2 月平日", "source": "rakuten", "retrieved": "2026-10-20" },
    { "plan": "包棟（素泊）", "unit": "per-house", "price": 120000, "maxGuests": 16, "source": "official", "retrieved": "2026-10-20" }
  ],
  "luggage": "可以在入住前寄放",
  "checkIn": "15:00", "checkOut": "10:00",
  "rakutenHotelNo": 12345,           // 楽天トラベルの施設番号；行程定了用 scripts/rakuten.mjs 以實際日期重查。沒上楽天是 null
  "dinnerAccess": "car",             // 不含晚餐時：walk（步行 20 分內有店）| car（要搭車）| null
  "group": {                         // 能不能容納 15 人
    "totalRooms": 8,
    "roomTypes": ["和室 4～5 人", "洋室 2 人"],
    "maxGuests": 30,
    "wholeRental": false,            // 能不能包棟（民宿優先找可以包棟的）
    "pickupCapacity": 9,             // 接送車一次能載幾人
    "note": null
  },
  "ratings": { "rakuten": 4.5, "rakutenReviews": 900, "google": 4.4, "googleReviews": 320, "jalan": null, "jalanReviews": null },
  "accessibility": {                 // 長輩、小孩
    "elevator": true,
    "beds": "和室鋪被（有和洋室）",    // 長輩可能偏好有床的房間
    "stairs": "入口有幾階",
    "kids": "小學生收費為大人的 7 成；有兒童餐"
  },
  "reservation": {                   // 訂房方式與聯絡資訊
    "methods": ["rakuten", "phone"],
    "phone": "0599-xx-xxxx",
    "url": "...",
    "groupNote": "10 人以上請電話洽詢"
  },
  "bookingLinks": { "rakuten": "...", "booking": "..." }
}
```

### 餐廳（`restaurant`）
```jsonc
{
  "anchors": [                       // 這家店「屬於」哪些資料點
    { "id": "toba-aquarium", "walkMinutes": 6, "walkSource": "estimate" }  // estimate | osrm | google
  ],
  "contexts": ["lunch"],             // lunch | dinner | transit | snack | cafe
  "access": "walk",                  // walk | car（要搭車）| ferry（離島）
  "cuisine": ["海鮮丼"],              // 固定清單，見 §5.3
  "priceRange": "¥1500～3000",        // 給人看
  "price": { "lunch": [1500, 3000], "dinner": null },   // 每人（円），估預算、價位標籤用
  "stayMinutes": null,               // null 時依料理種類用預設值（§5.5）
  "mustTry": ["伊勢龍蝦丼（伊勢海老丼）2,800 円"],   // 招牌菜 2～3 道，附日文；有寫價格就記（見 §4「菜單」）
  "menu": [{ "url": "https://tabelog.com/.../dtlmenu/", "source": "tabelog", "retrieved": "..." }],   // 只記菜單頁的連結，不抄完整菜單
  "ratings": { "tabelog": 3.62, "tabelogReviews": 120, "google": 4.3, "googleReviews": 850 },
  "inclusion": ["A", "C"],           // 符合的納入條件（§4「餐廳候選納入標準」），寫法同候選的 criteria：A～F，D、F 可以加小項（"D1"、"F3"）
  "tabelogOwner": false,             // 食べログ店舗会員（資料由店家維護）
  "googleName": null,                // Google 上的店名和食べログ不同時
  "notes": "中午常常賣完；週三公休",
  "group": {                         // 團體可行性
    "seats": 30,
    "maxReservation": 20,            // 食べログ「最大予約可能人数」
    "confirmed15": null,             // 打電話確認可以接 15 人：{ "date": "2026-12-01", "note": "..." }
    "fit15": "yes",                  // 全員 15 人：yes | split（要分桌或分批）| no | unknown
    "fitSubgroup": "yes",            // 分組 4～6 人：yes | no | unknown
    "privateRoom": true,             // 有沒有包廂
    "buyout": "20 人以上可以包場",
    "groupMenu": "宴會套餐 5,500 円起（10 人以上、3 天前預約）",   // fit15 是 yes 或 split 的店才查
    "source": "tabelog"
  },
  "reservation": {                   // 能不能訂位、怎麼訂
    "accepted": "yes",               // yes | no（不接受預約）| groups-only | unknown
    "methods": ["phone", "web"],     // phone | web | instagram-dm | line | other
    "phone": "0599-xx-xxxx",
    "url": "https://...",            // 網路訂位頁（食べログ、ホットペッパー、TableCheck、官網等）
    "language": "日文",
    "note": "團體要 3 天前預約",
    "leadDays": 3                    // 幾天前要訂
  },
  "seating": ["table", "zashiki"],   // table（椅子）| zashiki（榻榻米席）| horigotatsu（下挖式）| counter | terrace | sofa | other
  "kids": { "allowed": "yes", "minAge": null, "kidsMenu": true, "note": null },   // allowed: yes | no | age-limit | unknown（舊格式是字串，T7b 改）
  "accessibility": { "barrierFree": "車椅子で入店可", "note": null },
  "smoking": "全面禁煙"
}
```
`sources` 裡每個推薦來源各記一筆。**被越多獨立來源推薦，可信度越高**（之後分級會用到）。

### 時刻表（`timetables/kintetsu/<station-id>.json`）
```jsonc
{
  "station": "toba",
  "validFrom": "2026-03-xx", "validTo": null,
  "retrieved": "2026-10-xx", "source": "https://...",
  "directions": {
    "for-kashikojima": {
      "weekday": [ { "dep": "06:12", "type": "普通", "to": "kashikojima", "trainNo": null } ],
      "holiday": [ ]
    },
    "for-ise-nakagawa": { "weekday": [], "holiday": [] }
  }
}
```
- 方向鍵只有兩個：`for-kashikojima`（南下，往鳥羽、賢島；伊勢市站終點是宇治山田、鳥羽的車也算這邊，實際終點看 `to`）和 `for-ise-nakagawa`（北上，往伊勢中川、名古屋、大阪）。
- `trainNo` 是近鐵時刻表網站的列車編號（例如 `1-3896`），同一班車在各站相同，可以對到 `_travel-times.json` 的 `trains`。
- 各站之間的車程和每班車的停站時刻存在 `data/timetables/kintetsu/_travel-times.json`（格式見 `schema/kintetsu-travel-times.schema.json`）。

### 行程（T14 會訂出完整格式，這裡先放草稿）
```jsonc
{
  "days": [
    {
      "date": "2027-02-05",
      "lodging": "toba-hotel-xx",
      "items": [
        { "place": "toba-aquarium", "arrive": "09:30", "stayMinutes": 120 },
        { "leg": { "mode": "walk", "minutes": 8 } },
        { "place": "restaurant-yy", "arrive": "11:38", "stayMinutes": 60 }
      ]
    }
  ],
  "wishlist": ["yokoyama-observatory"]
}
```

---

## 4. 資料蒐集規則

### 分層順序
同一區要依序蒐集：**車站 → 景點 → 住宿 → 餐廳**。每一層以上一層的資料點為搜尋中心。

### 餐廳依用餐情境搜尋
| 情境 | 搜尋中心 |
|---|---|
| `lunch` | 景點 |
| `dinner` | 住宿（尤其是不含晚餐的住宿）、主要車站 |
| `transit` | 轉車的車站 |
| `snack`、`cafe` | 散步路線（例如おはらい町） |

### 取得方式（2026-10-18）
選工具時看兩件事：**誰來讀**、**資料多久過期**。

**誰來讀**：
| | 程式讀（確定、可以重跑、不耗 token） | Claude 讀（有判斷力、耗 token） |
|---|---|---|
| 適合 | 欄位固定、要做很多筆或在每一區重複做 | 要判斷、資訊散在文章裡 |
| 方式與優先順序 | 開放資料或下載（OSM、GTFS、時刻表）＞ 官方 API（楽天、OSRM）＞ 爬靜態 HTML（觀光三重列表等） | WebFetch（已知網址）＞ WebSearch（找來源）＞ Claude in Chrome |

- **同一件事要在三區重複做、而且欄位固定，就寫成 `scripts/` 的腳本**；只做一次或要判斷的，交給 Claude 讀。
- **Chrome 是最稀缺的資源**（只有一個瀏覽器、只有主 session 用、每家 3～10 次操作），只用在「固定網站但程式會被擋」的地方：食べログ、Google Maps。不要拿 Chrome 找零散資料。
- **WebSearch 用來找、WebFetch 用來讀**：知道網址就直接 WebFetch，不要再搜尋。
- **WebSearch 有次數上限**（Claude Code 官方文件，2026-10-18 查）：一個互動 session 預設 200 次，**主 session 和所有 subagent 共用**；用完後約每小時補回 100 次，`/clear` 歸零；上限可以用環境變數 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` 調高，但不能取消。用完時**不會報錯**，只會提示 Claude 用現有資料繼續，所以要靠每個 subagent 限 2～3 次來控制（T7e 沒限制，用完兩次，讀文 subagent 默默只剩 WebFetch）。指揮 session 連續跑多個任務也共用這 200 次。
- **WebSearch 的分配**（2026-10-18）：蒐集階段（標準作業流程步驟 1～10）只用 WebSearch 找官網和事實來源，**不找部落格心得**；心得先靠食べログ口コミ、Google 評論。部落格心得留到各區評分完成後的「深入調查」（見下方），只對各區的前幾名做，而且另開 session，才有自己的 200 次。
- **WebFetch 沒有次數上限，但回傳的是摘要**：網頁轉成 Markdown 後，由另一個小模型照指令摘要，Claude 拿到的不是原文，數字可能被簡化或漏掉（例如平日、週末不同的營業時間只剩一個）。所以：
  - 讀營業時間、休業、票價、席數這些事實欄位時，WebFetch 的指令要寫「**原文照抄**相關段落」，不要叫它總結（`docs/prompts/dossier.md` 規則 5）。
  - 要準確比對或重複執行的（例如じゃらん），用腳本 `fetch` 或 `curl` 讀原始頁面，不用 WebFetch。
  - 每次最多讀 10 萬字；同一網址 15 分鐘內會用快取；非 UTF-8 頁面（Shift_JIS）會亂碼。
- **程式讀得到但內容亂碼**多半是編碼問題（例如じゃらん是 Shift_JIS，見下方來源表），用腳本指定編碼解碼，不要直接退到 Chrome。

**資料多久過期**：
| 類型 | 例子 | 怎麼處理 |
|---|---|---|
| 幾乎不變 | 座標、席數、包廂、階梯、招牌菜 | 規劃期查一次，存進資料檔 |
| 會變但可以預先整理 | 近鐵、巴士時刻表、2 月休業、價格 | 存起來，需要時用腳本重跑 |
| 真正即時 | 臨時休業、船班停航、天氣、空位 | **不存**；資料點附連結（`links.googleMaps`、官網），旅途中點進去看 |

某個時間點前後的班次是靜態時刻表算得出來的（`scripts/next-train.mjs`），不需要即時 API。

### 資料來源
| 來源 | 主要用途 |
|---|---|
| 官方網站（店家、設施、觀光協會、觀光三重） | 營業時間、公休、票價：**以官方為準** |
| 食べログ | 餐廳的**主要來源**：分數、口コミ數、席数、最大予約可能人数、個室、貸切、予約、お子様連れ、公休、IG 帳號；口コミ是重點店的**心得來源**（見下方「口コミ、Google 評論」） |
| Google Maps | 星數、評論數、座標、營業時間、臨時休業或閉業；網站欄常常就是店家的 IG；評論是重點資料點的**心得來源**。不使用 API（T7 決定），用 Chrome 查；**每筆都要有 `links.googleMaps`**，需要即時資訊（臨時休業、最新評論、照片）的人點連結看 |
| 觀光三重 | 景點列表（固定網站、固定欄位）：先試用腳本抓列表當景點候選的母體，被擋才改人工 |
| じゃらん | 住宿評分、評論數（楽天沒有的補充）：用腳本（`scripts/jalan.mjs`，T7i）讀：先抓地區列表（`list`）把名稱對到旅館 ID，再讀旅館頁的結構化資料（`apply`）；地區列表只列有開放方案的旅館，列表上沒有的用 WebSearch 找 `jalan.net/yad<ID>/` 再 `--map` 指定。**近一年評論數不夠時じゃらん不顯示分數**（旅館頁沒有クチコミ総合），這時維持 null，不用總評論數推。**頁面是 Shift_JIS**，WebFetch 會亂碼（T7d、T8b 因此幾乎沒記到），要自己抓原始位元組再用 `new TextDecoder('shift_jis')` 解碼（T3 這樣讀成功過）。方案、價格是動態載入，抓不到，價格照舊用楽天 API |
| 日文部落格、地方媒體 | 在地人推薦。**蒐集階段不搜尋**，只讀候選清單 `mentions` 裡已知的文章；搜尋留給「深入調查」（鄉下小店幾乎沒有個人部落格，找不到就停，不要一直搜尋） |
| 中文部落格（台灣旅遊部落客、PTT、Dcard） | 觀光客視角、點餐建議、排隊狀況。只在「深入調查」搜尋 |
| Instagram | **不查看**，只記錄帳號（從食べログ或 Google 取得） |
| ホットペッパーグルメ | 網站、API 都不使用（T7 決定：沒有討論到需要；之後缺團體資訊時再考慮，見 T7-review.md「決定」）。讀文 subagent 讀到的ホットペッパー 店家頁可以當一般來源 |
| 楽天トラベル API | **住宿的主要來源**（T7 決定）：空室検索 API 用座標和旅程日期查空房、實際價格、照片，可以直接指定「5 間 × 3 人」這種房型組合；施設情報 API 有總評分和晚餐、早餐、浴場、清潔度等細項評分。用法見下方「楽天トラベル API」。沒上楽天的小民宿、包棟照舊人工查 |
| 近鐵官網 | 時刻表、票券規則 |

#### 食べログ、Google Maps 的讀取方式（2026-10-17 實測）
- **食べログ用 WebFetch 或 curl 會被擋**（列表頁、店家頁都回傳 403），要在有 **Claude in Chrome** 的 session（先 `/chrome`）裡瀏覽。Google Maps 也用 Chrome。
- 盡量讀整頁文字，不要一直截圖，可以省操作次數。
- 食べログ：
  - 鳥羽市列表：https://tabelog.com/mie/C24211/rstLst/ （全 465 家）。**預設排序不是照分數**，要改成評分或口コミ數排序。
  - 「店舗情報」表格就在店家首頁。欄位不固定：沒有「定休日」時，公休常常寫在營業時間裡；沒有「電話番号」時，可能寫在「予約・お問い合わせ」。
  - 頁面上有「食べログ店舗会員等に登録しているため、ユーザーの皆様は編集することができません」的店，資料由店家維護，記在 `extra.tabelogOwner: true`。
- Google Maps：
  - 要等頁面載完才讀得到資料。
  - **座標用網址裡的 `!3d<緯度>!4d<經度>`**，不要用 `@緯度,經度`（那是地圖畫面的中心）。
  - 一家店可能被拆成好幾筆（例如晚上和中午不同名稱）：取評論數最多的那筆，其他寫在 `extra`。
  - 評論會被機器翻譯，不要引用評論內容（寫筆記時只寫重點，見下方「口コミ、Google 評論」）。
- **JS 只用在目前開著的頁面**：可以用 `javascript_tool` 從目前頁面抽取內容、點分頁、排序、搜尋框、「もっと見る」這幾種元素（2026-10-18 實測，見下方「口コミ、Google 評論」）；**不要用 JS（`fetch`、`XMLHttpRequest`、開新視窗等）讀其他頁面**（T7e 在食べログ這樣做被擋下，之後禁止）。換頁一律用 `navigate`，看的頁數和人工瀏覽一樣，不因為 JS 變快就多看。
- Instagram：很多帳號早就停止更新（例如最後一篇是 2021 年），簡介裡的營業時間不一定是最新的；要先看最近一篇貼文的日期再判斷。

#### 口コミ、Google 評論（心得）
T7、T8 的心得幾乎是 0：鄉下小店本來就沒有個人部落格，而這些店的心得其實集中在食べログ口コミ和 Google 評論，偏偏 subagent 不能讀這兩個網站。所以**重點資料點的心得改由主 session 在 Chrome 上讀**（2026-10-18 決定）。
- **對象**（預設值，不是每筆都做）：
  - 餐廳：`fit15` 是 `yes` 或 `split` 的店；以及食べログ 3.40 以上或 Google 4.3 以上（評論 100 則以上）的店。
  - 景點、住宿：讀文筆記的心得不到 2 篇的。住宿另外看楽天的評分細項就好，不用讀楽天評論。
- **評論是用來回答資料檔填不了的問題**，不是判斷好不好吃（星數已經在 `ratings`）：`[缺點]`（每家都查）、`[招牌]`（2 則以上提到同一道才寫）、`[小孩]`、`[團體]`、`[長輩]`（座位、階梯）、`[冬季]`。**要查哪些由資料檔裡還是 null 或 unknown 的欄位決定**，資料已經完整的店只看缺點和冬季。實測發現最新幾則評論幾乎不會提到小孩、團體、長輩，要靠關鍵字搜尋才找得到。
- **關鍵字**（食べログ、Google 共用；依資料檔決定）：
  - 固定查：`中止`、`冬`（缺點和 2 月的情況；食べログ**不能依評分排序**，負面資訊靠這類字和 Google 的低分排序）
  - `kids` 是 null／unknown：`子供`、`子連れ`
  - `fit15` 是 split／unknown：`団体`、`予約`
  - `seating`、`accessibility` 是 null，或有 2 樓：`階段`、`2階`、`座敷`
- **固定步驟：JS 抽取**（2026-10-18 用 横丁 いかだ荘 實測，全程不截圖；每家約 2～3 次 `browser_batch` 呼叫）。抽取用的 JS 放在 `scripts/chrome/`（`tabelog-reviews.js`、`google-reviews.js`），每家照抄，不要每次重寫：
  1. **食べログ，1 次 batch**：用 `navigate` 依序開 `{店家頁}dtlrvwlst/`（最新 20 則，標準排序就是訪問時間由新到舊）和每個 `{店家頁}dtlrvwlst/?sw=<URL 編碼的關鍵字>`，每頁後面接一次抽取 JS，回傳每則的訪問年月、評分、投稿者口コミ數、摘要；第一頁順便抽頁尾的「店舗情報」（各層席數、個室、貸切、予約、營業時間），核對 `group`、`seating`。`?sw=` 的結果只列含這個詞的口コミ，摘要截在關鍵字附近；0 筆就跳過。
  2. **Google，1～2 次 batch**：開 `{links.googleMaps}&hl=ja`（`?cid=` 網址可以用；評論和主題標籤會是日文）→ `google-reviews.js` 步驟 `open`（點「クチコミ」分頁）→ `lowest`（排序改「評価の低い順」，展開「もっと見る」並抽前 10 則：星數、相對日期、全文），寫 `[缺點]` → 只對食べログ沒結果的關鍵字做評論搜尋：`search`（打開搜尋框、取得焦點並全選舊字）→ `computer` 打字 → Enter → `extract`（等清單換掉再展開並抽取）；每個詞重複這四步。搜尋會保留原本的排序；沒結果時 `noResult` 是 true（頁面顯示「〇〇に言及しているクチコミはありません」）。
     - `google-reviews.js` 只改最後一行的步驟名稱；開頭的 `await` 不能拿掉（`javascript_tool` 不會自己等 Promise，沒有 await 會回傳 `{}`）。食べログ的 `tabelog-reviews.js` 不用改任何字。
     - 兩支都可以用 `scripts/chrome-actions.mjs` 產生整段 actions（T8e 加入）：`--script tabelog-reviews --batch batch.json --keywords 中止,冬,子供 <key>`、`--script google-reviews --keywords 子供 <links.googleMaps>`；加 `--store` 程式只傳一次（存進該網站的 localStorage，之後每頁只傳一行 eval，每頁省約 3k 字），同一網站之後的 batch 用 `--stored`，最後加 `--cleanup`（或結束時手動 `removeItem`）。
     - `open`、`lowest`、`search` 失敗時會 throw，讓 batch 停在打字之前。**不要把這幾步的失敗吞掉繼續打字**：實測搜尋框沒打開時，`computer` 打的字會進到地圖上方的地點搜尋框，整頁跳到別的地方。
  3. **Claude 只做判斷**：選關鍵字、讀抽出來的 JSON、寫筆記。
  4. 結束關掉分頁。
- **選擇器**：Google 用 aria-label（「クチコミの並べ替え」「クチコミを検索」「N つ星」），食べログ用 `.rvw-item`、`.rstinfo-table`，都算穩定；Google 評論內文的 `.wiI7pd` 是混淆過的 class 名稱，可能會變。**抽取 JS 抓不到東西時要回傳警告**（不要回傳空陣列假裝沒有評論），這家改用下面的退路，並修正 `scripts/chrome/` 的選擇器。JS 只點分頁、排序、搜尋框、「もっと見る」這幾種元素，不點其他按鈕（按讚、登入、送出）。
- **退路（JS 抽不到時）**：食べログ用 `get_page_text`（每頁約 5k tokens，雜訊多）；Google 截圖拿座標再點（元素 ref 點「並べ替え」常常沒反應，座標會隨視窗變），`get_page_text` 讀評論（讀不到星數）。每家約 6～7 次操作。
- **已確認**（2026-10-18 用 `scripts/chrome/` 的程式在 いかだ荘 實測）：
  - Google 用 `?cid=…&hl=ja` 開，再用 JS 點「クチコミ」分頁，可以用。完整的 place 網址（含 `!9m1!1b1`）也能直接開到評論分頁，但裡面的 ID 要先開過店家頁才拿得到；只有 hex ID 的短網址開不出來。
  - 外文評論抽出來的是原文（英文評論就是英文），抽取結果的 `lang` 標 `original-foreign`。
  - Google 評論搜尋框收起來時寬度是 0（但 `offsetParent` 不是 null），程式用寬度判斷有沒有打開。搜尋後清單要 2～4 秒才換掉，太早抽會抽到「読み込んでいます」之前的舊清單，`extract` 會等第一則換掉。
  - 食べログ搜尋 0 筆時頁面是「全 0 件」「ご指定の条件に該当する口コミは見つかりませんでした。」，程式不會當成選擇器失效。
- **已確認**（2026-10-18 T8e 第 1 批，在 桂 外宮、満船屋 HANARE、伊勢大阪屋 實測；修正都已進 `scripts/chrome/`）：
  - 食べログ的選擇器（`.rvw-item`、`.rvw-item__date`、`.c-rating-v3__val`、`.rvw-item__rvw-comment`、`.rstinfo-table`）都抓得到。最新 20 則的摘要只有約 100 字（列表頁本來就截斷）；`?sw=` 的摘要截在關鍵字附近。最新 20 則的第一則可能是置頂的舊口コミ（伊勢大阪屋 2016），看日期。
  - **口コミ頁頁尾的店舗情報是完整的表**（個室、貸切、營業時間、席數都有），只讀口コミ的店不用另外開店家頁；但沒有分數、口コミ數、交通手段、ホームページ。`?sw=` 頁不再重複回傳這張表。
  - Cloudflare 的畫面標題依瀏覽器語言是「請稍候…」（不是「Just a moment」），食べログ的兩支程式自己等最多 10 秒，實測第一頁都會遇到、之後不會。
  - **完整的食べログ路徑（/mie/A2403/A240301/24012311/）和 Google 的純數字 cid 會被 Claude in Chrome 當成 Base64 擋下**（回傳「[BLOCKED: Base64 encoded data]」）：`path` 只回傳店家 ID 之後的部分，cid 每 4 位加空格（`build-restaurants.mjs` 讀的時候去掉）。
  - **Google 評論清單要捲動才載入**：換排序、搜尋後清單會先清空（約 2.5 秒），視窗不高時一則都不會出現；太早捲動會載入更多「舊排序」的評論（第一次實測抽到的「評価の低い順」其實是關聯度順）。`google-reviews.js` 改成先等舊清單換掉、清空後才把評論面板捲到底，修正後 3 家都正確。
  - Google 的店家評論可能混有同址別的店（桂 外宮 門口的伊勢うどん 櫃台），讀的時候看內容。
- **已確認**（2026-10-18 T8e 第 3 批，ise-geku 23 筆；修正都已進 `scripts/chrome/google-reviews.js`）：
  - 「評価の低い順」有時沒套用（網址變成 `/place//@25.10…,121.52…` 的頁面：柚 クッチーナ、匠 PART2、一升びん、河崎商人館），回傳關聯度順。原因是選單一出現就點、或只用 `.click()`。改成等 0.7 秒再送完整的 pointer／mouse 事件；低分順時檢查星數由低到高，不是就重點一次，還不對就加警告（這時截圖點選排序，再跑 `extract`）。
  - `open` 之後馬上 `search`，第一次點擊可能沒打開輸入框 → 程式會再點一次。
  - **住宿（旅館、飯店）的評論版型不同**（おく文、伊勢神泉）：排序是 aria-label 為目前排序名稱的下拉按鈕、搜尋框一直開著、星數是「4/5」文字、日期後面接「（Google）」「（Tripadvisor）」等來源；評論要捲動才載入。程式都支援（分頁仍用 `.click()`，送 pointer 事件反而不切換）。住宿附設的 `-dining` 讀住宿本體的評論時只取用餐相關。
  - `chrome-actions.mjs --store` 存進 localStorage 的程式拿掉整行註解（google-reviews 少約 1/4）。
- **已確認**（2026-10-18 T9a 第 2、3 批，志摩景點 22 筆）：
  - **評論少於 10 則時，`open` 之後該跑哪一步不固定，兩種情況都遇過**：T8e 的オレンジガーデン（2 則）`lowest` 回傳空清單、改跑 `extract` 才有；T9a 的間崎島（9 則）相反，`open` 後直接 `extract` 抽到 0 則、改跑 `lowest` 才有；いわほ観光汽船（4 則）兩步都抽得到。做法：評論少的地點 batch 裡 `open` 後**`extract`、`lowest` 都排**，取有結果的那一個（兩個都 0 則才算沒有評論）。
  - `?cid=` 網址會轉到 `www.google.com/maps/place/…`，batch 第一個 JS 有時會因「換網域」失敗：`chrome-actions.mjs` 加 `--wait 2`（navigate 後等 2 秒）就穩定，第 3 批 12 筆都沒再失敗。
  - `lowest` 偶爾回傳「星數不是由低到高」的警告（かつおの天ぱく，38 則、幾乎都是 5 星）：評論少、低分少的地點照樣用（筆記寫「關聯度順」），不用重試。
- **已確認**（2026-10-19 T9d 志摩餐廳 5 批）：
  - Claude in Chrome 會把回傳裡**像 JWT 的字串**換成「[BLOCKED: JWT token]」：第 4 批的店名「Cafe.C.C」、第 5 批 `location.hostname` 的「www.google.com」都被擋過（判斷是啟發式的，和 Base64 那條一樣）。被擋的欄位在 jsonl 裡照頁面手改，其他欄位照常用；只是確認用的回傳（例如清 localStorage 後的主機名）可以不管。
  - 讀文 subagent 的筆記來源清單偶爾不是「  1. 」的連續項目（第 4 批 磯人 把「官網讀取失敗」寫在第一項前面）：`scripts/dossier-merge.mjs` 接受「- 來源：」或「## 來源」、縮排不拘的「1. 」「1) 」、項目前的說明行和項目的續行；還是找不到時那一家報錯、其他家照做，手改筆記後重跑（已經併過的會跳過）。
- **讀的時候注意**：
  - Google 的主題標籤是系統自動產生的，多半是菜名（例如カキフライ 36），可以當 `[招牌]` 的參考，不會有「子供」「団体」這類標籤。
  - Google 預設顯示原文，外文評論旁邊才有翻譯開關，不用另外切換。
  - Google 的日期是「1 年前」這種相對時間：寫筆記時換算成大約年份（例如「約 2025」）。星數只在圖片的 alt（「N つ星」），JS 抽得到，`get_page_text` 讀不到。
  - 食べログ列表上看得到投稿者的口コミ總數：投稿多的人寫的比較可靠。
  - 食べログ第一次載入可能出現 Cloudflare「安全驗證中」「請稍候…」畫面，實測等 5 秒就自動通過（抽取程式會自己等最多 10 秒）；不會自己消失、或要手動操作就照規則停下來。
  - `find` 讀不到食べログ搜尋結果的內容，要用 JS 抽取或 `get_page_text`。
- **跳過沒有價值的評論**：只有星數或只寫「好吃」「推薦」、和用餐無關（只講停車場、周邊觀光）、疑似招待或業配（寫「招待」「PR」，或和店家宣傳文幾乎一樣）。值得讀的評論有具體細節：幾個人去、什麼時候去、點了什麼、多少錢、等多久、座位。
- **評論日期**：優先用近 3 年的。3～5 年前的可以用，但要標日期，事實類（例如「預約只收 11:00 那一輪」）加註「要再確認」，寫進 `questions.md`；5 年以上的不寫。評論說的事實和食べログ店舗情報、官網不一致時，以店舗情報和官網為準。
- **寫進筆記**：由主 session 直接加在 `dossiers/<id>.md`。來源寫挑法和日期，例如：
  - `[tabelog] 食べログ口コミ（最新 20 則、搜尋「子供」「団体」「中止」；2026-10-18 讀）{店家頁}dtlrvwlst/`
  - `[google-maps] Google 評論（評価の低い順 10 則、搜尋「個室」；2026-10-18 讀）{links.googleMaps}`

  每條重點寫出有幾則提到、大約日期（例如「多則低分評論提到，約 2025」「1 則，2022/11」），打分時才看得出證據強弱。用固定標籤寫重點，**不要引用原文**。「資料量」一節把這兩類算進心得（例如「心得 6 則（食べログ口コミ 4、Google 評論 2）」）。

  範例（横丁 いかだ荘）：
  ```markdown
  - [冬季] 2024/12、2026/02 都遇到生牡蠣暫停供應（推測不漁或海況）；2 月不一定吃得到生牡蠣（5）
  - [缺點] 生牡蠣偏小、有腥味，多則低分評論提到（6，約 2025）
  - [長輩] 椅子座位都在 2F，要走木樓梯；1F 只有カウンター和小座敷（5，2024，2 則）
  - [小孩] 有小人松花堂弁当、お子様膳 1,100 円（有生魚片）；有帶小孩被安排進包廂的經驗（5、6）
  - [團體] 預約要打電話，曾經只收 11:00 那一輪（5，2022/11，1 則，要再確認）
  ```
- 評論裡的事實（席數、營業時間）只當作參考，和資料檔不同時寫進 `extra.conflicts`，不覆蓋。回填 null 欄位用 `scripts/apply-patch.mjs`（見「工具」），它只填 null、不同就寫進 `extra.conflicts`。

#### 楽天トラベル API
- 需要 👤 到楽天ウェブサービス註冊，取得 `applicationId` 和 `accessKey`，放在環境變數 `RAKUTEN_APPLICATION_ID`、`RAKUTEN_ACCESS_KEY`（寫在 `.env`，**不要 commit**）。
- **空室検索**（`VacantHotelSearch`）：子地區中心座標、半徑最多 3 km、入住和退房日期（用旅程實際可能住的日期），`roomNum`（最多 10）× `adultNum`（每間最多 10）。例如 15 人查「5 間 × 3 人」和「4 間 × 4 人」，結果裡有空房的就是能全員同住的候選。
- **施設情報**（`HotelDetailSearch`）：`reviewAverage`、`reviewCount`，以及服務、地點、房間、設備、浴場、早餐、晚餐、清潔度的細項評分；評分時晚餐、浴場的細項很有用。
- 施設番号寫進 `rakutenHotelNo`（正式欄位，T7i 從 extra、網址搬過來）。取得的價格寫進 `prices`（`source: "rakuten-api"`，附查詢日期和入住日期）；照片寫進 `photos`（`kind: "rakuten"`）。
- 規約要求顯示楽天的標示，T11 顯示這些資料時要加上；申請時順便確認規約對存放資料的規定，有限制的話寫進 `docs/requests.md`。
- 呼叫間隔至少 1 秒，查詢腳本放在 `scripts/`。

#### 營業時間、地址的優先順序
不同來源常常互相矛盾（實測：同一家店，Google 寫 10:00 開，食べログ寫 10:15，IG 寫 9:30）。依下面的順序採用，其他來源的值寫進 `extra.conflicts`：
1. 官網
2. 食べログ（店舗会員）
3. Google Maps
4. 食べログ（非店舗会員）
5. IG（只採用最近一年內的貼文或簡介）

**座標**：餐廳以 Google Maps 為準（`coordsSource: "google-maps-url"`）；景點、住宿如果 OSM 有而且位置正確，可以用 OSM（`"osm"`，可以自由存放），否則用 Google。

**Google 的資料**：星數、評論數、營業時間照現行做法（Chrome）存在各區的 JSON；景點、住宿也要記 Google 星數和評論數（給 Claude 評分時參考）。

### 餐廳候選納入標準
> 2026-10-17 依 T4a 鳥羽的結果修訂：B 不算會員名錄、C 加口コミ下限、D 加晚餐缺口、新增會員制與旅程期間不營業的排除、同類型上限；F 加入體驗型的用餐。
> 2026-10-17 T7：D 加「任何一天 0 家」、離島可以用外帶便當保底；F 加入接受非住客用餐的料理旅館；伊勢的數量目標改成 80～100 家。

這個標準只決定「哪些候選店值得詳細查」（T4a → T4b），**不是推薦分級**（分級由 T7 訂）。符合**任一條**就納入：

| # | 條件 | 用意 |
|---|---|---|
| A | **人氣**：食べログ 3.30 以上而且口コミ 10 則以上，**或** Google 4.0 以上而且評論 50 則以上 | 公認好吃的店；評論數門檻是為了排除少數評論造成的高分 |
| B | **多來源推薦**：被 2 種以上獨立來源推薦。來源種類是觀光協會、觀光三重、日文部落格與媒體、中文部落格，**同一種算一個**（兩篇日文文章仍算 1）。觀光協會的**會員店家名錄不算推薦**，精選特集（例如牡蠣特集）才算；食べログ本身不算 | 分數普通但常被推薦的店 |
| C | **能接團體**：食べログ 3.10 以上**而且口コミ 15 則以上**，而且在「貸切可」或「個室」（食べログ的勾選預設含半個室）的篩選結果裡 | 能坐下 15 人的店很稀少；口コミ下限是為了排除只在食べログ勾了「貸切可」、但沒人去過的店 |
| D | **缺口保底**：A～C 都沒有店，**或旅程中有任何一天這個子地區中午 0 家有營業**時才用，每家要寫明補的是哪個缺口。① 店少的子地區取口コミ數最多的前 3～5 家；② 不含晚餐的住宿附近沒有晚餐的店時，取附近口コミ數最多的 1～3 家；③ 離島找不到可以坐下吃的店時，外帶便當店也可以（例外於「只做外帶」的排除） | 每個景點、每個住宿附近、旅程的每一天都要有地方吃飯 |
| E | **車站保底**：主要車站步行 5 分鐘內至少 3 家 | 轉車空檔（`transit`） |
| F | **目的地型**：① 浦村牡蠣這類特產聚落（牡蠣小屋、吃到飽），取口コミ數前 5～8 家；② **體驗型的用餐**（屋形船、海上料亭、海女小屋這類，用餐本身就是體驗），不看分數和口コミ門檻；已以景點收錄的不重複；③ **接受非住客用餐的料理旅館**（例如相差的伝洋、花椿），在晚上沒有店的子地區特別重要；住宿本體另外收在 `lodging.json`，餐廳這筆的 `notes` 註明 | 本身就是行程重點的用餐地點；體驗型的店評論常常很少，分數反映不出價值 |

- **排除**：
  - 便利商店、連鎖速食、スナック和酒吧、食べログ標示「閉店」「移転」「休業」的店、只做外帶的店（甜點、小吃除外）。
  - **會員制、只限住客**：會員制度假飯店（例如エクシブ、ウイスタリアンライフクラブ）裡的餐廳，以及寫明只接待住客（宿泊者のみ）的店。能不能讓非會員用餐不確定時，標「待確認」先不算進納入數，T4b 第一步確認，確認可以用餐才補查其他欄位。
  - **旅程期間大多不營業**：來源明寫的公休日蓋過旅程大部分日子（例如平日公休），或來源明寫 2 月休業。只在來源已經寫明時套用，營業時間的細節由 T4b 查。
- **同類型上限**：同一地區、同一類型的店（例如浦村的牡蠣小屋）最多 12 家，依 A → F → B → C 的順序取，同一條件內依口コミ數。超過的標 `over-limit` 留在候選清單。
- **數量控制**：一區總數目標約 50～70 家（伊勢含おはらい町，店多很多，目標 80～100 家）。套用上面的規則後仍超過時：
  - 只提高**店多的子地區**的門檻（可以不只一個，例如伊勢的 ise-naiku、ise-geku），先提高 A，例如食べログ改成 3.40；A 降不下來才提高 C。**店少的子地區不提高**，缺口照 D 補。
  - **能坐 15 人的店不受數量控制**（2026-10-18 決定）：食べログ列表顯示個室或貸切可以容納 15 人以上（例如「個室有(2〜30人可)」「貸切可(20人〜50人可)」）的店，C 的門檻提高了也照原門檻（3.10）收錄。坐不坐得下比好不好吃更早決定能不能去，這類店是全員用餐的候選，不能為了總數刷掉（T8c 的 ise-geku 曾因此刷掉 20～30 人個室的店）。候選表的 `note` 要抄列表上的個室、貸切人數，才判斷得了。
  - **子地區事後拆分時，門檻沿用拆分前的，不重篩**（2026-10-18 決定）：拆子地區是為了讓缺漏檢查更準，行程會去的地方沒變，收錄結果不該跟著邊界變（伊勢的 ise-obata 拆出來時，照原門檻會多 24 家）。拆出來的子地區有缺口，照 D 補。
  - 因數量控制沒收的在地名店（例如小俣的へんばや商店 本店），等行程排到那個子地區再從候選清單撈（`reason` 含「因數量控制」），照餐廳詳細的方式補，不整區重篩。
  - 因數量控制取消的店 `reason` 寫「A／C 因數量控制（門檻）取消」，之後可以用程式重篩。總數超過目標一些（例如保護大個室店多出來的）可以接受，在 README 寫明。
- **只用規則過濾**：無法寫成規則的判斷（例如「有特色」「同區已有類似的店」）不拿來刪店，符合條件就放行。
- 沒納入的店留在 `data/raw/<area>/candidates/restaurants.json`（`status: not-included`），附分數和口コミ數；T7 之後調整門檻時可以用程式重新篩選。

### 判斷細則（從 decisions-pending 升格，2026-10-18）
T7c～T8d 在自動模式下反覆用到、沒有被 👤 改掉的判斷，整理成規則，各區照這裡做才不會漂移（原始紀錄和理由在 `docs/decisions-pending.md`）。這裡沒寫到的新情況，照舊寫進 decisions-pending。

**座標、Google 地點**
- Google 座標和原座標（OSM、官網、地址）差 **300 m 以上**就改用 Google，300 m 以內保留原座標；原座標寫進 `extra.conflicts`。內宮這類大範圍的地點用入口（宇治橋），anchors 才是從入口算。
- Google 有多筆時，取**評論數最多、名稱對得上**的那筆；其他筆的星數、評論數寫在 `ratings.note` 或 `extra`。只有地址型的地點（沒有星數）`ratings.google` 填 null，不借附近店家的分數。
- Google 找不到：`links.googleMaps` 用座標搜尋連結（`https://www.google.com/maps/search/?api=1&query=緯度,經度`），不借同名的別家。餐廳在 Google 沒有獨立店家頁時，可以借所在住宿的 cid，但星數不填。

**營業時間、停留時間**
- 戶外、無人、來源沒寫時間的景點：設 `hours.always: true`，`hours.note` 寫「推定」，列進 `questions.md`。來源寫「散策自由」的不算推定。
- 有規則的休館（每月第 2、4 週二、遇國定假日改隔天）推算成旅程內的日期寫進 `closures`。
- 某天的結束時間沒有來源：那天填 null，已知的時間寫在 `hours.note`。
- `contexts` 依實際營業時間和菜色修正：17:00 前打烊的不算 dinner；正餐店不標 snack。
- `stayMinutes` 的來源是範圍時取中間（明顯以小孩為主的設施可以取偏長），原文寫在 `extra.stayMinutesNote`。

**欄位怎麼填**
- 讀文 subagent 推斷的值不採用（例如來源只說「有石階」，不填 `stairs: 少`）；口コミ或第三方設施列表**明寫**的可以用，在 note 註明來源。
- `tags` 從結構化欄位補，只加不刪：`indoor: true` → 室內、雨天備案；`accessibility.stairs: 多` → 長階梯；`kids.friendly: high` → 親子。
- `kids.friendly` 只給有小孩相關描述、或明顯是親子體驗的；神社、博物館沒有來源就留 null。
- 照片：官網 → 楽天（住宿）→ Google 主圖，每筆最多 3 張；只用官網網域的圖（媒體、部落格的不用），觀光協會、觀光三重的照片 `kind` 記 `official`；每張先用 `scripts/photo-check.mjs` 確認打得開。
- `mustTry` 只從筆記的 `[招牌]` 整理，沒有就留空，不用コース名稱補。`menu`：食べログ沒有文字菜單的店記 `dtlmenu/photo/` 的連結。
- IG 帳號不確定是不是同一家店就不填；兩個都可能對的保留現有值，差異寫在 `ig-notes.md`。

**住宿**
- 楽天 API 的 `reviewAverage` 是 0：評分不公開，`ratings.rakuten` 填 null，`ratings.note` 註明，不當作 0 分（§5.7 也不算進「低於 3.8」）。
- 兒童價只在楽天「大人 3＋小學生 1」推算出 0～99% 時填 `prices[].child`；100%（多半是以房計價）、0（可能不佔床）只寫在 note。
- 15 人住不下的：`group.nearbyCombos` 連同區直線 1 km 內最近的 4 間。
- `dinnerAccess`（不含晚餐、或方案不同的住宿）：選素泊時，步行 20 分內（OSRM、係數 1）有沒有晚餐店 → `walk`／`car`。晚餐店＝`contexts` 有 dinner 而且旅程中有一天 18:00～19:00 營業；住宿附設的 `-dining` 不算；營業不確定的不算。分鐘數和店名寫在 `extra.dinnerAccessNote`。
- 所有方案都限制 70 歲以上或學齡前不能住的排除；楽天「停止受理新預約」等營業狀態不明的標 pending。

**餐廳**
- **住宿附設的餐廳（F③）**：官網、訂房網有非住客的用餐方案或用餐營業時間（例如「日帰り夕食」「神宮参拝の昼食」）才收錄，只有舊口コミ說「非住客吃過」的不算（標 excluded 或 pending）。資料點 id 用 `<住宿 id>-dining`，`extra.lodgingId` 指回住宿；Google 連結、座標、星數借住宿本體，`ratings.note` 註明。官網沒有明寫「非住客可」的，`questions.md` 列電話確認。
- 同一處的伴手禮賣場＋食事處只收食事處（例如ザ・朝市 → はくたか亭）。
- 食べログ類別第一項是バー類（バー、日本酒バー、ワインバー、ビアバー）的店照「スナック和酒吧」排除；居酒屋不排除。
- D①（店少的子地區補店）只取可以吃午餐的店，甜點、伴手禮店補不了午餐缺口。
- 讀文、口コミ回填的事實只填原本是 null 的欄位，和現有值不同的寫進 `extra.conflicts`（`scripts/apply-patch.mjs` 照這個規則做）。

### 讀文與筆記（dossier）
摘要和評分要根據文章內容，但文章很多、很長，不能都塞進同一個 session。所以**讀文**和**判斷**分開：

1. **讀文（每個資料點一個 subagent）**：主 session 每個資料點開一個 subagent，指令用 [docs/prompts/dossier.md](prompts/dossier.md) 的範本。subagent 讀官網、觀光協會、媒體、口コミ站的**已知網址**（主 session 給的、候選清單 `mentions` 裡的，或 Chrome 步驟從食べログ HP 欄、Google 網站欄拿到的官網），不搜尋部落格心得，做兩件事：
   - 寫筆記 `data/raw/<area>/dossiers/<id>.md`：每條重點附來源編號，用固定標籤（推薦、缺點、團體、長輩、小孩、冬季、交通、價格），40 行以內。
   - 把要回填的事實欄位和 `sources` 寫成工作目錄的 `facts/<id>.json`（格式見 dossier.md），回覆主 session 只要 5 行以內（不貼 JSON，省主 session 的 context）。**由主 session 寫進資料檔**（`build-restaurants.mjs` 或 `apply-patch.mjs`；subagent 不改資料檔，避免互相覆蓋）。
2. **判斷（每個類型一次）**：區域蒐集完，主 session 只讀筆記和資料檔，寫 `summary`、`assessment`、`tier`（§5.1），**不重新爬文**。筆記資訊不夠的，`confidence` 填 low，或再開一個 subagent 用已知網址補讀；部落格心得留給「深入調查」。

規則：
- **subagent 不用 Chrome**：只有一個瀏覽器，給主 session 查食べログ、Google Maps；subagent 只用 WebSearch、WebFetch，也不要讀食べログ、Google Maps。主 session 可以一邊在 Chrome 查，一邊讓 subagent 在背景讀文。食べログ口コミ、Google 評論的心得由主 session 補（見上方「口コミ、Google 評論」）。
- **subagent 的 WebSearch 每個資料點最多 1 次，而且只用來找官網或事實來源**（例如官網網址不知道、要確認非住客能不能用餐）：先 WebFetch 已知網址，已知網址就夠的不搜尋。**不找部落格心得**，筆記「資料量」寫「部落格心得：未查（深入調查）」。
- **同時最多 5 個 subagent**；景點、住宿一點一個；餐廳來源少（2 篇以內）的可以 3 家合成一個。
- **不存全文**：筆記只寫重點（繁體中文，菜名附日文），不要複製原文；要再看就點來源連結。
- **候選階段讀過的文章不要白讀**：T4a 這類候選名單步驟讀列表型文章（「鳥羽ランチ 11 選」）時，在候選清單該店的 `mentions[].highlight` 寫一句這篇為什麼推薦這家，之後交給該店的 subagent 當已知來源。
- `summary.cons` 要涵蓋結構化欄位裡的問題（不能訂位、公休日、2 月休業、長階梯、只有榻榻米、不接受小孩、要搭車、坐不下 15 人）。

### 深入調查（部落格心得）
2026-10-18 決定：鄉下小店的部落格心得很少，蒐集階段每家都搜尋，搜尋次數用掉很多卻幾乎找不到。所以蒐集階段的心得只靠口コミ、Google 評論，**部落格心得等各區評分完成後，只對前幾名找**，找到的補進筆記，再對有新資訊的那幾筆重新打分（補丁式）。
- **時機**：
  - 第一輪：該區的摘要與評分（T7g／T7h、T8f、T9f）完成後。
  - 第二輪：行程大致定下來後（T15 前後），對行程選中、但第一輪沒做過的資料點再做一次。
- **對象**（預設值，每區最多 25 筆；超過時依 `recommend`、`groupFit` 由高到低取）：
  - 住宿：`tier` S、A，而且 `assessment.groupFit` 4 以上（可能真的會訂的）。
  - 餐廳：`tier` S、A，加上 `assessment.groupFit` 5（全員用餐的候選）。
  - 景點：`tier` S，加上 `confidence` low 的 A。
  - 筆記裡已經有 `[blog]` 來源的不重做。
- **找什麼**：口コミ、Google 評論回答不了的事，筆記裡已經有的不重複找：
  - 觀光客的角度：點什麼、排多久、值不值得專程去
  - 中文心得（台灣旅客怎麼安排、踩過的雷）
  - 2 月（冬季）實際去的經驗
  - 團體、帶長輩或小孩去的實際經驗
- **怎麼做**：
  - 每筆一個 subagent（同時最多 5 個），範本用 [docs/prompts/dossier.md](prompts/dossier.md) 的「深入調查」一節；**每筆 WebSearch 2～3 次**，找不到就停，不要換關鍵字一直搜。
  - 關鍵字範本（日文優先）：`<店名> ブログ`、`<名稱> 子連れ`、`<名稱> 高齢者 階段`（景點）、`<名稱> 冬`（景點）、`<中文名> 心得`、`<中文名> 團體`。
  - 結果**追加**在 `dossiers/<id>.md`：標籤照讀文筆記，來源類型寫 `[blog]`（中文另標「中」），日期規則同「口コミ、Google 評論」（近 3 年優先、5 年以上不寫）；「資料量」改成實際篇數。
  - 部落格寫的事實（營業時間、席數）不覆蓋資料檔，和資料檔不同時寫進 `extra.conflicts` 或 `questions.md`。
- **重新打分**：只對有新資訊的那幾筆重寫 `summary`、`assessment`、`tier`（先讀 `data/raw/toba/assessment-notes.md`，標準不變），不重打整區。星等或 tier 有變的列在該區 `README.md`；重跑評分檢查腳本。
- **另開 session**：WebSearch 額度由 session 和所有 subagent 共用，所以深入調查**不放進指揮 session**，每區另開一個新的 Claude Code session（或先 `/clear`）。它沒有其他任務依賴，但會改該區的筆記和三個資料檔的評分，所以用自己的 worktree，不和同區其他任務、T13 同時做。`log/<任務 ID>.md` 記每筆的搜尋次數和找到的篇數。

### 菜單
菜單很零散（官網的圖片或 PDF、食べログ、IG、Google Maps 的使用者照片），價格常改又有季節限定，所以**不蒐集完整菜單**，只記對決策有用、又幾乎不用多花工夫的部分：

| 欄位 | 內容 | 從哪來 |
|---|---|---|
| `mustTry` | 招牌菜 2～3 道，附日文名稱，來源有寫價格就記 | 讀文 subagent 的筆記（`[招牌]` 標籤），多篇提到的優先 |
| `menu` | 菜單頁的**連結**（食べログ的菜單、コース分頁，官網的菜單頁） | 查食べログ店家頁時順便記；不抄內容 |
| `group.groupMenu` | 有沒有團體或宴會套餐、每人價格、人數條件、要幾天前訂 | **只查 fit15 是 yes 或 split 的店**：食べログ的コース頁或官網。很多店團體只能點套餐，訂 15 人時最需要這個 |
| `kids.kidsMenu` | 有沒有兒童餐 | 食べログ、心得 |

- 不存菜單照片（版權屬店家或投稿者），要看就點 `menu` 的連結。

### 照片
- **照片**（`photos`）：每筆 1～3 張，**只記 URL，不下載**。來源優先順序：官網（`og:image` 或主視覺）→ 楽天トラベル API 的飯店照片（住宿）→ Wikimedia Commons（景點，記作者和授權）→ Google Maps 上的照片 URL（Chrome，`kind: "google"`，`page` 記 Google Maps 連結）。**不使用食べログ的照片**（版權屬投稿者）。Wikimedia 等可以自由使用的照片才可以存縮圖。官網照片可以由讀文 subagent 順便回報。

### 工具（scripts/）
T7c～T8d 每一批都在 session 的 scratchpad 重寫同樣的抽取程式、合併腳本，session 結束就不見了，還出過轉換錯誤（T7e 把「沒有座敷」轉成 zashiki、把電話號碼當成天數）。2026-10-18 起改用 repo 裡的共用工具；**不要再在 scratchpad 重寫**，工具不夠用就改工具（附測試），在 commit 訊息說明。

| 工具 | 用途 |
|---|---|
| `scripts/candidates.mjs list` | 過濾候選清單（不要整份讀）：`--status`、`--region`、`--criteria`、`--pending`、`--keys`、`--fields` |
| `scripts/candidates.mjs export` | 一批的 `batch.json`（食べログ網址、類別、criteria、mentions），給讀文 subagent、`chrome-actions.mjs`、`build-restaurants.mjs` |
| `scripts/candidates.mjs set` | 改候選的 `status`、`criteria`、`reason`、`pointId`、拿掉 `detailPending`；保留原本的換行和縮排 |
| `scripts/chrome-actions.mjs` | 產生 `browser_batch` 的 actions：每頁 navigate＋跑 `scripts/chrome/` 的抽取程式（一次 4～5 頁） |
| `scripts/chrome/tabelog-info.js` | 食べログ店家頁的店舗情報（白名單欄位）、分數、口コミ數、店舗会員、菜單分頁；コース頁的文字 |
| `scripts/chrome/google-place.js` | Google Maps 地點：名稱、星數、評論數、cid、座標、地址、網站、主圖；搜尋結果是列表時回傳候選名稱 |
| `scripts/chrome/tabelog-reviews.js`、`google-reviews.js` | 口コミ、Google 評論（見「口コミ、Google 評論」） |
| `scripts/photo-check.mjs` | 照片網址能不能打開、是不是圖片（`--out photos.json` 給 build 用；`--data` 檢查資料檔） |
| `scripts/build-restaurants.mjs` | 餐廳詳細（步驟 8）：`draft` 把食べログ店舗情報轉成欄位草稿（fit15 是建議值），Claude 改成 `judgement.json` 後 `build` 組成資料點寫進 `restaurants.json`，`--candidates` 同時更新候選 |
| `scripts/kanko-mie.mjs` | 觀光三重的景點列表（名稱、網址、類別、住所、座標）：`fetch` 抓列表，`missing` 和候選比對、列出可能漏掉的景點（T9a 當景點候選的母體） |
| `scripts/jalan.mjs` | じゃらん的住宿評分：`list` 地區列表、`yad` 單一旅館、`apply` 寫進 `lodging.json` 的 `ratings.jalan`、`jalanReviews` 和 `sources`（分數變了舊值寫 `extra.conflicts`） |
| `scripts/apply-patch.mjs` | 回填既有資料點（讀文 facts、口コミ、官網）：只填 null，不同就寫進 `extra.conflicts`；確定要換的用 `overwrite` |
| `scripts/dossier-merge.mjs` | 口コミ、Google 評論的重點併進讀文筆記：`node scripts/dossier-merge.mjs <area> <工作目錄>/notes [--dry-run]`；`notes/<id>.md` 的格式見 `scripts/lib/dossier-merge.mjs` 開頭（T9d 第 5 批，取代每批複製的 notes-to-json.mjs＋dossier-merge.mjs） |

- **工作目錄**：一批一個 `data/cache/work/<任務>-<批>/`（例如 `t9d-1`），不進 git，但 session 結束後還在，下一個 session 可以接著用。放 `batch.json`、`tabelog.jsonl`、`google.jsonl`（Chrome 回傳的 JSON 一家一行，前面加 `"key"`）、`facts/`、`photos.json`、`judgement.json`、讀文用的 `prompt-common.md`。
- **Claude 只做判斷**：`judgement.json` 裡的 `hours`、`contexts`、`cuisine`、`price`、`access`、`notes`、`febNote`，以及確認草稿的 `group`、`reservation`、`kids`、`seating`。食べログ字樣的轉換、來源和菜單連結的合併、照片的取捨、候選清單的更新都由工具做。
- `tabelog-parse.mjs` 的 `fit15` 只看容量和能不能訂位（不能預約 → unknown、可預約＋最大予約／個室／貸切 ≥15 → yes、可預約＋席數 ≥20 → split、席數 <15 → no）；備考提到團體、不接小孩這類要判斷的，放在 `_check` 給 Claude 看。
- 景點、住宿的新資料點還沒有組裝工具（筆數少、來源不同）：照舊由主 session 寫，回填用 `apply-patch.mjs`。
- **實測過**（2026-10-18 T8e 第 1 批，伊勢 13 家）：`tabelog-info.js`、`google-place.js` 的選擇器都抓得到，修正了這幾點：等 Cloudflare 畫面；`path` 只回傳店家 ID 之後、cid 每 4 位加空格（完整路徑和純數字 cid 會被當成 Base64 擋下）；コース頁不重複回傳店舗情報、切到「店舗情報（詳細）」前；`tabs` 排除コース頁裡的 `party/<ID>`；不收「予算（口コミ集計）」；Google 電話的 +81 改回 0；從搜尋列表點進去時店名改用地點面板的 aria-label（第一個 h1 是「スポンサー」）。實際的 rows 已加進 `scripts/test/tabelog-parse.test.ts`。Google 搜尋結果是列表時（同名店多，例如「匠」）程式只回傳候選名，要截圖點對的那筆再跑一次；用電話號碼搜尋找不到。`build-restaurants.mjs` 用 T8e 第 1 批 13 家組裝過。

### 標準作業流程
每一區照這個順序做（同一區依序，不同區可以並行；任務拆分見 PLAN.md）。「主」是主 session，「sub」是讀文 subagent。

| 步驟 | 主 session 做的事 | subagent 做的事 | 產出 |
|---|---|---|---|
| 0 子地區 | 定子地區和中心點，👤 確認 | — | `areas.json` 的 `regions` |
| 1 景點候選 | 觀光三重的景點列表（腳本）、觀光協會＋WebSearch，列候選和要給 sub 的已知來源 | — | `candidates/spots.json` |
| 2 景點讀文 | 每個景點開 sub，收回事實欄位寫進 `spots.json` | 官網（營業、票價、無障礙、團體）、觀光協會、已知網址的口コミ站、官網照片（不搜尋部落格） | `spots.json`、筆記 |
| 3 景點 Chrome | 批次查 Google Maps：座標、`links.googleMaps`、星數、評論數、照片 URL；筆記心得不到 2 篇的順便讀評論，補進筆記 | — | `spots.json`、筆記 |
| 4 住宿候選 | `scripts/rakuten.mjs` 依子地區、2 月日期撈候選（價格、15 人房型組合的空房、細項評分、照片），套 §5.7；另外找沒上楽天的包棟、民宿 | — | `candidates/lodging.json` |
| 5 住宿讀文 | 每間開 sub，收回欄位寫進 `lodging.json` | 官網（團體、接送、電梯、床、兒童價）、已知網址的口コミ站（不搜尋部落格） | `lodging.json`、筆記 |
| 6 住宿 Chrome | Google Maps 的連結、星數、評論數；筆記心得不到 2 篇的順便讀評論，補進筆記。じゃらん評分用腳本（讀不到才用 Chrome） | — | `lodging.json`、筆記 |
| 7 餐廳候選 | 食べログ列表（Chrome）＋觀光協會、媒體；套 A～F；列表文章的推薦重點寫進 `mentions[].highlight` | — | `candidates/restaurants.json` |
| 8 餐廳詳細 | 逐家查食べログ店家頁、Google Maps（Chrome，`tabelog-info.js`、`google-place.js`），用 `build-restaurants.mjs` 寫進 `restaurants.json`（見「工具」）；店家頁有菜單、コース分頁就記連結（`menu`），fit15 是 yes 或 split 的店再看コース頁記團體套餐（`group.groupMenu`）；重點店讀口コミ、Google 評論，補進筆記（見「口コミ、Google 評論」）；同時在背景開 sub 讀文 | 官網、候選清單 `mentions` 裡的文章（不搜尋部落格） | `restaurants.json`、筆記 |
| 9 收尾 | `restaurant-anchors.mjs`、`restaurant-gaps.mjs`、地圖檢查 | — | `restaurants.json`、筆記 |
| 10 摘要與評分 | 先讀 `data/raw/toba/assessment-notes.md`（校準範例），每個類型一次讀完筆記，寫 `summary`、`assessment`、`tier` | 筆記不夠時用已知網址補讀 | 三個資料檔 |
| 11 深入調查（另開 session） | 照「深入調查」挑前幾名、開 sub；收回後重寫有新資訊那幾筆的 `summary`、`assessment`、`tier` | 部落格、中文心得（每筆 WebSearch 2～3 次） | 筆記、三個資料檔 |

每一步結束時：跑 `scripts/validate`、commit；更新 `README.md`（現況、決定、給下一步的建議），過程寫在 `log/<任務 ID>.md`。

### 研究筆記怎麼存
鳥羽的 `restaurants.md` 長到 97 KB：一半是候選表，四分之一是貼上的腳本輸出，其他是各任務一路追加的過程紀錄。之後每個 session 都要讀它，會越來越吃 context。所以**依內容的性質分開存**：

| 內容 | 存在哪裡 | 怎麼寫 |
|---|---|---|
| 區域的現況、重要決定、例外、給後續的建議 | `README.md` | **覆寫成最新狀態**，不是一路追加；200 行以內，每個類型一節。之後的 session 開工先讀這個 |
| 候選（含沒納入、被排除、同類型上限外）和原因 | `candidates/<spots\|lodging\|restaurants>.json` | 一筆一個候選，格式見 `schema/candidate.schema.json`（`status`、`criteria`、`reason`、`ratings`、`mentions`）。要看時用程式過濾，不整份讀 |
| 每個資料點的心得、優缺點 | `dossiers/<id>.md` | §4「讀文與筆記」，40 行以內 |
| 要打電話、人工確認的事 | `questions.md` | 一條一行：`- [ ] <資料點 ID>：問題（為什麼要問）`；問到了改成 `[x]` 並把結果寫進資料檔 |
| 搜尋關鍵字、看過的列表頁、操作次數、遇到的問題 | `log/<任務 ID>.md` | 每個任務一個檔，任務結束後不再改；之後的 session 只在需要時讀。300 行以內 |
| 腳本的輸出（缺漏檢查、anchors 檢查） | **不存** | 要看就重跑腳本；只把結論（缺口在哪、決定怎麼補）寫進 README |
| 交通選項（計程車、包車）、IG 帳號 | `transport.md`、`ig-notes.md` | 照舊 |

- **每筆資料點的事實**寫在資料檔（JSON），不要在筆記裡再寫一次「各間重點」。
- 鳥羽的舊筆記由 T7b 改成這個結構。

### 語言：日文蒐集、中文呈現
蒐集時**日文資料優先**：營業時間、公休、2 月休業、團體預約、席數、包場這些資訊，幾乎只有日文的官網、食べログ、觀光協會頁面才有，而且最新。中文部落格常常已經過時，而且偏向台灣觀光客熟悉的店。
- **搜尋關鍵字用日文**，例如「鳥羽 ランチ 団体 個室」「鳥羽水族館 2月 営業時間」「〇〇 席数 貸切」。中文關鍵字只用來找部落格心得（排隊狀況、點餐建議、值不值得去）。
- **事實欄位**（營業時間、公休、票價、席數、預約）以日文官方來源為準。中文來源只當作補充和交叉確認；只有中文來源的資訊，要在 `sources` 註明，`verified` 維持 `false`。
- **存檔語言**：
  - `name.ja` 用日文原名（之後搜尋、比對用），`name.zh` 填中文名稱。
  - `notes`、`febNote`、`closedNote` 等說明文字用**繁體中文**寫，因為最後要給使用者看。
  - 菜名、專有名詞附上日文原文，例如「伊勢龍蝦丼（伊勢海老丼）」，到店裡看菜單、點餐、打電話時才對得上。
  - 地址、電話保留日文原樣，不翻譯，方便直接貼進地圖或撥號。

### 團體（15 人）
**成員**：15 人，包括 **5 位約 70 歲的長輩**、**4 位 6～10 歲的小孩**。
**行動方式**：部分行程全員一起，部分行程分成 **4～6 人一組**。
**飲食**：沒有忌口。

蒐集時要記錄：
- **團體可行性**：餐廳、住宿、景點都要記錄 `group` 欄位。餐廳要同時判斷「全員 15 人」（`fit15`）和「4～6 人小組」（`fitSubgroup`）坐不坐得下。
  - 餐廳的團體資訊優先看食べログ店家資訊頁的「席数」「最大予約可能人数」「個室」「貸切」「予約」；官網有寫的話以官網為準。
  - **`fit15` 的判斷規則**（不要用猜的）：**只看容量和能不能訂位**。不接小孩、有年齡限制、全面可吸菸這些不影響 `fit15`，記在 `kids`、`smoking`，由 §5.6 和評分的 `kidsFit` 處理（2026-10-18 決定：混在一起會看不出「坐得下但不能帶小孩」，只限大人的分組也會被誤判）。
    - `yes`：可以訂位，而且來源明確寫可以接 15 人以上，例如最大予約可能人数 15 人以上、貸切可以容納 15 人以上、包廂可以坐 15 人以上、明寫可以接團體或宴會（食べログ備考「団体…対応」也算）。
    - `split`：有明確席數（20 席以上）而且可以訂位，但沒寫能不能一次接 15 人，要分桌或分批。
    - `no`：席數不到 15（只能外帶、沒有座位的也是），或明寫不接團體。
    - `unknown`：其他情況，包括**不能預約的店（就算席數很多）**、外帶店的座位數不明、來源互相矛盾。
    - 席數照原文記在 `group.seats`，判斷依據寫在 `group.source`，T7 可以重新判斷。`scripts/lib/tabelog-parse.mjs` 照這個規則給建議值。
  - 坐不下 15 人、但 4～6 人可以的店**不要刪掉**，它們很適合分組行動時去。
- **訂位資訊**：能不能訂位、訂位方式、電話、網路訂位網址，記在 `reservation` 欄位。只記錄資訊，不需要實際訂位。
- **長輩友善**：景點內要走多久、階梯、坡道、休息座位、廁所、無障礙設施（`accessibility`）。這些資訊**只記錄、不拿來排除景點**；例如要爬長階梯的展望台照樣收錄，看行程的人自己決定要不要去，或分組時由能走的人去。餐廳要記座位形式（`seating`），長輩坐榻榻米可能比較辛苦，**有椅子座位或下挖式座位比較好**。
- **小孩**：適不適合小孩（`kids`）、兒童票價、兒童餐。
- **票價**：大人、小孩、長輩（很多設施有 65 歲以上優惠）、團體票分開記（`fares`）。
- **交通**：一般計程車坐 4 人，全員要 4 台以上；4～6 人的小組則是 1 台大型計程車（Jumbo taxi，約 9 人座）或 2 台一般計程車。大型計程車和包車的選項記錄在 `data/raw/<area>/transport.md`。

### 住宿條件
- **不住評價太差的地方**。門檻在 T7 訂，在那之前先全部記錄評分（`ratings`），讓之後可以篩選。
- **價格要記錄**（`prices`）：方案（一泊二食、素泊、包棟）、計價單位（每人或每棟）、大人與小孩價格、適用季節，並註明來源和取得日期。盡量查 2 月的價格。
- 可以接受的類型：民宿（**優先找可以包棟的**，例如一棟貸し）、一泊二食、旅館、飯店。
- 15 人住一間最理想；做不到的話，記下附近可以一起搭配的住宿。

### 必須遵守
- **每一筆資料都要有 `sources`**，記錄網址和取得日期。
- **不知道就留 `null`，不要猜。**營業時間、公休這類資訊錯了，比沒有更糟。
- 不同來源的資訊衝突時，以官方網站為準，並把衝突寫在 `extra.conflicts`。
- 只存事實資訊（營業時間、價格、評分）和連結；**不要大段複製評論或文章內容。**
- 不大量瀏覽 Instagram、食べログ等網站，也不繞過登入或網站的限制（驗證碼、封鎖）。在 Chrome 裡只看任務需要的頁面；IG 不查看，只記錄帳號。爬靜態 HTML 的腳本要先看 robots.txt，呼叫間隔至少 1 秒；被擋（403、驗證碼）就停，不要換方法繞過。
- 被排除的候選資料點，在 `data/raw/<area>/candidates/` 裡標 `status: excluded` 並寫 `reason`（例如已經歇業、太遠），之後的任務才不會重複搜尋。
- 寫完資料要跑 `scripts/validate`，通過才 commit。

---

## 5. 規則（T7 訂定，2026-10-17）

討論過程和試算見 [T7-review.md](T7-review.md)。這些是預設值，T13、T14 實作時可以再調。

### 5.1 評分（`assessment`）與分級（`tier`）
**由 Claude 打分，不用公式**：Claude 讀過該筆的評分數字、評論數、讀文筆記（`data/raw/<area>/dossiers/<id>.md`，見 §4「讀文與筆記」）、結構化欄位，依下面的標準給 1～5 顆星，每個面向附一句理由。景點沒有訂房網站或食べログ的評分也沒關係，只要有心得、介紹文就能打分。

- **只和同類型比**：景點、住宿、餐廳各有自己的標準（`rubric`），推薦度是「在這一區的餐廳裡算不算值得去」（例如在伊勢的餐廳裡），不和住宿、景點比，也不和別區比。
- **數字門檻依區調整**（2026-10-18 👤 決定）：打分前先用 `assessment-notes.md` 的門檻試算這一區的分布；**A 以上（推薦度 4、5）超過約 25%**，就照 `assessment-notes.md`「依區調整」提高門檻，讓每區的 A 大約是那區的前 20% 左右，實際用的門檻寫進 `assessment-notes.md`。原因：收錄時已經用數量控制篩過、觀光區的分數本來就高（伊勢食べログ中位數 3.49，鳥羽 3.30），用同一套絕對門檻，伊勢一半的店會是 A，地圖上挑不出重點。所以**不同區的 A 不能直接比**（伊勢的 A 比鳥羽的 A 難拿），跨區比較看原始評分。地圖上也是各圖層各自表示。
- **推薦度**和**適合度**分開：推薦度是地點本身值不值得（地圖上點的大小、`tier`）；適合度是對我們這團（15 人、長輩、小孩、2 月）方不方便（地圖上的顏色或篩選）。
- **資料不足**：該面向填 `null`，不要猜。
- **`confidence`**（2026-10-18 改定義）：看**評分的量**和**心得來源有幾種**，不數評論則數或篇數（讀口コミ一次就是 20 則，數則數的話重點店會自動變 high）。
  - 心得來源的種類：食べログ口コミ、Google 評論、訂房網口コミ（楽天、じゃらん）、口コミ站（Retty、4travel 等）、日文部落格、中文部落格。每種算 1，近 3 年有內容的才算。
  - high：評分夠多（各類型的門檻見 `data/raw/toba/assessment-notes.md`）**而且**心得來源 2 種以上；low：評分太少，或心得來源 0 種而且評分不到 high 的門檻，或讀文完全沒有來源；其他 medium。心得都在 2021 年以前、或評分來源互相差 1 分以上 → 降一級。
  - 讀過口コミ、Google 評論的重點店會比較容易 high，這是刻意的：`confidence` 表示「這筆的判斷有多少根據」，不是地點本身好不好。
- **分級**：`recommend` 5＝S、4＝A、1～3＝B。
- **標準有版本**（`rubric: "restaurant-v1"`）：改標準就升版本，舊版本打的分在之後重評。

#### 餐廳（`restaurant-v1`）
| 面向 | 看什麼 | 5 顆星 | 3 顆星 | 1 顆星 |
|---|---|---|---|---|
| `recommend` 推薦度 | 食べログ分數與口コミ數、Google 星數與評論數、被幾種獨立來源推薦、心得的評價 | 地區代表性的店：分數高而且評論多，多個來源都說值得專程去 | 評價穩定、普通好吃，適合順路 | 有明顯負評（品質不穩、服務差），或只是填缺口 |
| `localFlavor` 在地特色 | 是不是伊勢志摩的特產或體驗（海女小屋、牡蠣、伊勢海老、手こね寿司、伊勢烏龍） | 本身就是行程重點的在地體驗 | 有在地食材，但哪裡都吃得到類似的 | 和在地無關（連鎖、一般洋食） |
| `groupFit` 15 人 | `fit15`、最大予約人数、包廂、包場、能不能訂位 | 明確可以接 15 人以上，可以預約 | 要分桌或分批、或要電話確認 | 坐不下或不接受預約 |
| `elderFit` 長輩 | 椅子座位、無障礙、要不要排隊、離車站或停車處多遠 | 椅子座位、平地、不用排隊 | 有些不便（部分榻榻米、要走一段） | 只有榻榻米、要爬坡或排很久 |
| `kidsFit` 小孩 | `kids`、兒童餐、料理類型（生食為主？） | 歡迎小孩、有兒童餐或小孩愛吃的選項 | 可以帶小孩，但選擇少 | 不接受小孩或有年齡限制 |

#### 景點（`spot-v1`）
| 面向 | 看什麼 | 5 顆星 | 3 顆星 | 1 顆星 |
|---|---|---|---|---|
| `recommend` 推薦度 | 觀光協會、觀光三重是不是主打，媒體與部落格提到的次數，Google 評論數（人氣）與星數，心得的評價 | 這一區的代表景點，來這裡就該去 | 有時間可以去，順路的好選擇 | 心得普遍說不值得、或已經沒什麼可看 |
| `winterFit` 2 月 | 2 月是否營業、室內或室外、海風、冬季限定（牡蠣、日出） | 2 月正常營業而且冬天去也好（或冬季才有） | 營業，但冬天比較冷或景色普通 | 2 月休業或冬天幾乎不適合 |
| `elderFit` 長輩 | 階梯、坡道、景點內步行時間、休息處、廁所 | 平地、步行少、有休息處 | 有一段階梯或坡道 | 長階梯或山路，長輩很難去 |
| `kidsFit` 小孩 | `kids.friendly`、互動、安全 | 小孩會很喜歡（動物、體驗、互動） | 小孩可以去但會無聊 | 不適合小孩 |
| `accessEase` 交通 | 離車站多遠、巴士班次、要不要包車或搭船 | 車站步行 10 分內 | 要搭巴士或計程車，但班次還可以 | 只能開車或船班很少 |

#### 住宿（`lodging-v1`）
| 面向 | 看什麼 | 5 顆星 | 3 顆星 | 1 顆星 |
|---|---|---|---|---|
| `recommend` 推薦度 | 楽天、じゃらん、Google 的評分與評論數，楽天細項評分，心得的評價 | 評分高而且評論多，心得幾乎都是好評 | 評價普通、沒有明顯問題 | 有明顯負評（老舊、不乾淨、服務差） |
| `meals` 餐食 | 楽天晚餐、早餐細項評分，心得對料理的評價；不含餐時看附近的晚餐（`dinnerAccess`） | 料理本身就是住這裡的理由 | 普通；或不含晚餐但附近步行有店 | 不含晚餐而且附近沒有店（要開車） |
| `groupFit` 15 人 | 全員能不能同住、包棟、房型、團體方案 | 15 人可以同住（或包棟），有團體方案 | 要分 2 間住、或要電話確認 | 住不下，附近也沒有可以搭配的住宿 |
| `elderFit` 長輩 | 電梯、床、入口階梯、大浴場的動線 | 有電梯、有床的房間 | 部分不便（只有鋪被、要爬一層樓） | 沒有電梯又有很多階梯 |
| `accessEase` 交通 | 離車站多遠、接送、接送車能載幾人 | 車站步行 5 分內或有能載全員的接送 | 要搭計程車，或接送要分批 | 只能開車到，沒有接送 |

#### 一致性
- 同一區的同類型**在同一個 session 一次打完**，避免標準漂移。
- **校準**：T7g 打完鳥羽後，每個類型挑每個星等 1～2 筆當「範例」，記在 `data/raw/toba/assessment-notes.md`；T8f、T9f、T19 打分前先讀這份範例。
- **檢查腳本**（T7g 寫）：把 `recommend` 和評分數字明顯矛盾的（例如 5 顆星但食べログ 3.1、Google 3.6；或 2 顆星但兩邊都很高）列出來，輸出到 `data/derived/`，人工確認理由是否合理。
- T13 跨區整理時，看各區的星等分布是否差太多。

### 5.2 搜尋範圍
- 用**子地區**（`areas.json` 的 `regions`），不用半徑。每區開始蒐集前先定子地區。
- anchors 的步行範圍：車站、景點、住宿 15 分；不含晚餐的住宿 20 分。分鐘數存**係數 1** 的值，使用時才乘團體係數。詳情面板只顯示最近的 3 個。

### 5.3 標籤
- **料理種類**（`cuisine`，可複選）：海鮮丼、壽司、浜焼き・貝、牡蠣、伊勢海老・高級海鮮、定食・食堂、和食・割烹、烏龍麵・蕎麥、燒肉・肉料理、洋食・義式、咖啡・甜點、居酒屋、其他。籠統的「海鮮」照實際菜色歸類（海鮮丼為主 → 海鮮丼；定食為主 → 定食・食堂；生魚片、煮魚套餐 → 和食・割烹），看不出來就「其他」；炸物、麵類同樣依實際菜色。候選階段的類型用食べログ類別的第一項對應（T8c 的對應表在 `data/raw/ise/log/T8c.md`）。
- **價位**（每人，看 `price`）：`$` 1,500 円以下、`$$` 1,500～3,000、`$$$` 3,000～6,000、`$$$$` 6,000 以上。
- **景點、住宿的 `tags`**（固定清單）：室內、雨天備案、親子、長輩友善、長階梯、展望、神社寺院、海邊、體驗、溫泉、包棟、無障礙。子地區不放在 tags（用 `region`）。

### 5.4 交通方式與步行
| 項目 | 規則 |
|---|---|
| 基本步速 | 80 m/分 × OSRM 路線距離 |
| 團體係數 | 全員 **1.4**；分組有長輩或小孩 1.2；分組只有大人 1.0 |
| 單段步行上限 | 全員：套係數後 **15 分**；分組：25 分 |
| 一天累計步行（景點內不算） | 全員約 60 分以內 |
| 超過上限 | ① 巴士：等車 20 分以內、不是 1 小時以上才一班 → 搭巴士；② 否則計程車：全員 4 台一般計程車，或大型計程車（9 人座）2 台；③ 一整天都在巴士稀少的子地區（`needsCar: true`）→ 建議包車 |
| 離島 | 以船班為主；全員上島要確認回程末班船和冬季停航 |

### 5.5 每天的行程密度（T14 的警告，不是硬性限制）
- 全員日：主要景點 2 個＋午餐；09:30 以後出發，**16:30～17:00 回到住宿**（2 月日落約 17:20）。
- 連續兩天內最多一天是「累」的行程（長階梯、景點內步行 60 分以上、或船程）。
- 到達日（2/2）、最後一天（2/13）不排景點；中間至少一個半天自由時間。
- 餐廳沒有 `stayMinutes` 時的預設：定食・食堂、海鮮丼 45 分；浜焼き、牡蠣小屋 75 分；和食・割烹、套餐 90 分；咖啡 40 分。

### 5.6 團體用餐
- **全員用餐一定要預約**，只能選 `fit15: yes`，或 `split`／`unknown` 但已經電話確認（`group.confirmed15`）。
- 晚餐預設在住宿吃（一泊二食）；餐廳晚餐只排在不含晚餐的住宿那幾天，或刻意安排的一餐。
- 分組（4～6 人）：午餐可以不預約；完全預約制的店照店家規定。
- 不接受小孩或有年齡限制的店（`kids.allowed`），在有小孩的組裡要警告；全員用餐（有 6～10 歲小孩）不能選，就算 `fit15` 是 yes（`fit15` 只看容量，見 §4「團體（15 人）」）。

### 5.7 住宿評分門檻
- **排除**：所有評分來源（評論 10 則以上的）都低於 **3.8**。
- **評價普通**：3.8～4.0，照常收錄，地圖和詳情面板標示。
- **沒有評分**（小民宿、包棟）：不排除，標示「無評分」。
- 選住宿時看 `dinnerAccess`：不含晚餐、附近又沒有店（`car`）的住宿，要先規劃晚餐的交通。

### 5.8 餐廳候選納入標準
見 §4「餐廳候選納入標準」（T7 已修訂 D、F 和數量目標）。

---

## 6. Git
- 一個小段落完成就 commit，commit 訊息用繁體中文，開頭標上任務 ID，例如：`T2: 新增鳥羽景點 12 筆`。
- 多個 session 並行時，可以用 worktree 讓每個 session 在自己的分支上工作，完成後再合併。
