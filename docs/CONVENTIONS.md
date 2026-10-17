# 共同規則與資料格式

所有 Claude Code session 都要遵守這份文件。這裡的資料格式是**草稿**：T0 會把它寫成 JSON Schema，T7 再根據鳥羽試做的結果修正。

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
│  │  └─ bus/<route-id>.json
│  ├─ raw/<area-id>/         研究筆記（Markdown）：搜尋過程、候選清單、被排除的原因
│  └─ cache/routes/          路線計算的快取
├─ scripts/                  驗證、蒐集、地理計算的腳本
└─ web/                      前端（Vite + React + TypeScript + MapLibre GL）
```

區域 ID：`ise`、`futami`、`toba`、`shima`

---

## 1.5 Schema 與驗證（T0 建立）

- JSON Schema 放在 `schema/`：`common`（共同欄位）、`station`、`spot`、`lodging`、`restaurant`、`area`、`timetable-kintetsu`，以及格式還沒定的檔案共用的 `sourced-document`（`passes.json`、`access/*.json`、`timetables/bus/*.json`、`timetables/kintetsu/_travel-times.json`：目前只要求最外層是物件、有 `sources`，負責的任務定好格式後到 `docs/requests.md` 提出）。
- 驗證：`npm run validate`（或 `node scripts/validate.mjs`；bash 下可以直接跑 `scripts/validate`）。第一次使用前要先 `npm install`。
  - 檢查：符合 schema、資料點 ID 全專案唯一、座標在伊勢志摩範圍內（`access/` 放寬到關西、中部）、引用的 ID 存在（`nearestStation`、`access.from`、`anchors`、`transfers`、`group.nearbyCombos`、`areas.json` 的 `stations`）、檔案在規定的位置。
  - 座標不在所屬區域的 `bbox` 內只會警告（bbox 是大致範圍）。
- `areas/*.json`、`stations.json` 等清單檔的最外層是**陣列**，每個元素一筆資料。
- schema 不允許沒定義的欄位：暫時放進 `extra`，需要正式欄位的話寫到 `docs/requests.md`。

### ID 規則
- 近鐵車站：站名的羅馬字（`toba`、`ugata`、`kashikojima`、`shima-isobe`）；JR 車站加 `jr-` 前綴（`jr-toba`、`jr-futaminoura`）。同一站的近鐵、JR 用 `transfers` 互相連結。
- 區域 ID 是另一個命名空間，可以和車站 ID 相同（區域 `toba`、車站 `toba`）。
- 其他資料點建議以區域開頭，例如 `toba-aquarium`。

### 營業時間（`hours`）
- 整個欄位 `null`：不知道。某一天 `null`：那天不知道；`[]`：那天公休；可以有多個時段，例如 `[["11:00", "14:00"], ["17:00", "21:00"]]`。
- 可以加 `holiday`（國定假日）和 `note`（例如「最後入場 16:00」）。過了午夜寫 `25:00`。

---

## 2. 檔案歸屬（並行時避免衝突）

| 檔案 | 誰可以寫 |
|---|---|
| `schema/`、`data/areas.json`、`data/stations.json` | 只有 T0、T7 |
| `data/timetables/kintetsu/`、`data/passes.json` | T1 |
| `data/access/`、`data/raw/access/` | T1b（機場往返交通） |
| `data/timetables/bus/` | T10（`passes.json` 的巴士部分也由 T10 補充） |
| `data/areas/<area>/`、`data/raw/<area>/` | 負責該區的任務（T2～T4、T8、T9） |
| `data/cache/` | 任何任務都可以新增，不可以刪除別人的檔案 |
| `web/` | T5、T11、T12、T15、T16、T17（同時進行時，各自負責的目錄要先講好） |
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
  "febNote": "2 月照常營業",          // 冬季、淡季的特別狀況
  "photos": [{ "url": "...", "source": "..." }],
  "links": { "official": "...", "googleMaps": "...", "tabelog": "...", "instagram": "@xxx" },
  "tags": [],
  "tier": null,                      // 分級，T7 訂規則後才填
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
  "group": {                         // 能不能容納 15 人
    "totalRooms": 8,
    "roomTypes": ["和室 4～5 人", "洋室 2 人"],
    "maxGuests": 30,
    "wholeRental": false,            // 能不能包棟（民宿優先找可以包棟的）
    "pickupCapacity": 9,             // 接送車一次能載幾人
    "note": null
  },
  "ratings": { "rakuten": 4.5, "google": 4.4, "googleReviews": 320, "jalan": null },
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
  "cuisine": ["海鮮丼"],
  "priceRange": "¥1500～3000",
  "mustTry": ["伊勢海老丼"],
  "menu": [{ "url": "...", "source": "instagram", "retrieved": "..." }],
  "ratings": { "tabelog": 3.62, "google": 4.3, "googleReviews": 850 },
  "notes": "中午常常賣完；週三公休",
  "group": {                         // 團體可行性
    "seats": 30,
    "fit15": "yes",                  // 全員 15 人：yes | split（要分桌或分批）| no | unknown
    "fitSubgroup": "yes",            // 分組 4～6 人：yes | no | unknown
    "privateRoom": true,             // 有沒有包廂
    "buyout": "20 人以上可以包場",
    "groupMenu": "團體需事先訂套餐",
    "source": "tabelog"
  },
  "reservation": {                   // 能不能訂位、怎麼訂
    "accepted": "yes",               // yes | no（不接受預約）| groups-only | unknown
    "methods": ["phone", "web"],     // phone | web | instagram-dm | other
    "phone": "0599-xx-xxxx",
    "url": "https://...",            // 網路訂位頁（食べログ、ホットペッパー、TableCheck、官網等）
    "language": "日文",
    "note": "團體要 3 天前預約"
  },
  "seating": ["table", "zashiki"],   // table（椅子）| zashiki（榻榻米席）| horigotatsu（下挖式）| counter
  "kids": "有兒童餐；可帶小孩",       // 小孩相關，不知道就 null
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
    "for-ujiyamada": { "weekday": [], "holiday": [] }
  }
}
```
各站之間的車程另外存在 `data/timetables/kintetsu/_travel-times.json`（T1 決定格式）。

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

### 資料來源
| 來源 | 主要用途 |
|---|---|
| 官方網站（店家、設施、觀光協會、觀光三重） | 營業時間、公休、票價：**以官方為準** |
| 食べログ | 日本人的評價、排名、百名店、公休 |
| Google Maps | 座標、照片、評論數 |
| 日文部落格、地方媒體 | 在地人推薦 |
| 中文部落格（台灣旅遊部落客、PTT、Dcard） | 觀光客視角、點餐建議、排隊狀況 |
| Instagram | 最新菜單、照片、臨時公告：**由 👤 手動瀏覽**，Claude Code 只記錄帳號 |
| 近鐵官網 | 時刻表、票券規則 |

### 團體（15 人）
**成員**：15 人，包括 **5 位約 70 歲的長輩**、**4 位 6～10 歲的小孩**。
**行動方式**：部分行程全員一起，部分行程分成 **4～6 人一組**。
**飲食**：沒有忌口。

蒐集時要記錄：
- **團體可行性**：餐廳、住宿、景點都要記錄 `group` 欄位。餐廳要同時判斷「全員 15 人」（`fit15`）和「4～6 人小組」（`fitSubgroup`）坐不坐得下。
  - 餐廳的團體資訊優先看食べログ店家資訊頁的「席数」「個室」「貸切」「予約」；官網有寫的話以官網為準。
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
- 不爬 Instagram，也不繞過登入或網站的限制。
- 被排除的候選資料點，在 `data/raw/<area>/` 的筆記裡寫下排除原因（例如已經歇業、太遠），之後的任務才不會重複搜尋。
- 寫完資料要跑 `scripts/validate`，通過才 commit。

---

## 5. 規則（T7 填寫）

以下要在看過鳥羽試做的資料後再決定：

- [ ] 分級（`tier`）的門檻
- [ ] 各區的搜尋半徑
- [ ] 標籤清單（料理種類、價位級距）
- [ ] 交通方式判斷規則（步行上限、巴士與計程車的條件）
- [ ] 步行時間估算的係數：有長輩和小孩，全員行動時要比一般時間多抓（例如多 30～50%），分組時可以依組別調整
- [ ] 步行上限：全員行動時連續步行幾分鐘以內、超過就搭車
- [ ] 每天的行程密度：長輩、小孩需要休息時間，每天排幾個景點、午後要不要留休息時間
- [ ] 團體用餐規則：哪些情況一定要預約；全員用餐和分組用餐各在什麼時段
- [ ] 住宿的評分門檻

---

## 6. Git
- 一個小段落完成就 commit，commit 訊息用繁體中文，開頭標上任務 ID，例如：`T2: 新增鳥羽景點 12 筆`。
- 多個 session 並行時，可以用 worktree 讓每個 session 在自己的分支上工作，完成後再合併。
