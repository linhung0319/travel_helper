# 共用檔案修改請求

需要修改不屬於自己任務的檔案（schema、`stations.json`、`areas.json` 等）時，寫在這裡，由 T0 或 T7 處理。

格式：
```
## [任務 ID] 標題
- 要改的檔案：
- 內容：
- 原因：
- 狀態：待處理 / 已處理
```

## [T1] 為 data/passes.json 建立正式 schema
- 要改的檔案：`schema/`（新增 `passes.schema.json`）、`scripts/validate.mjs` 的 ROUTES（`passes.json` 改用新 schema）
- 內容：T1 定的格式如下（實際內容見 `data/passes.json`）。金額一律是日圓整數；不知道的留 `null` 或寫在說明文字裡。
  - 最外層物件：`retrieved`（日期）、`notes`、`childRules`、`passes`、`passNotes`、`fares`、`shimakaze`、`otherExpress`、`otherExpressSources`、`booking`、`groupTicket`、`comparison`、`sources`（必填）
  - `childRules`：`adult`、`child`、`infant`、`childAmount`（字串）＋ `sources`
  - `passes[]`：`id`（kebab-case）、`name`（common 的 name）、`price: { adult, child }`（整數）、`validity`、`eligibility`、`purchase`、`coverage`（字串）、`excludes`（字串陣列）、`perks`、`sources`
  - `fares`：`note`；`expressByDistance[]`：`{ upToKm: 整數|null, adult, child, note? }`；`segments[]`：`{ from, to（車站 ID，可以在區間外，例如 osaka-namba、kintetsu-nagoya）, fare: {adult, child}, express: {adult, child}, shimakaze: {adult, child}|null, note? }`；`segmentNote`；`sources`
  - `shimakaze`：`name`、`charge`、`oneWayTotals[]`（`{ from, to, adult, child }`）、`seats`、`operation`、`tripImpact`、`sources`
  - `otherExpress[]`：`{ name, note }`
  - `booking`：`opens`、`online`、`group15`、`refund`、`groupExpress`（字串）＋ `sources`
  - `groupTicket`：`name`、`minPeople`（整數）、`discount`、`freePersons`、`conditions`、`deadline`、`fitForThisTrip`、`sources`
  - `comparison`：`assumption`、`cases[]`（`{ case, total: 整數, insteadOf?: 整數 }`）、`conclusion`、`sources`
  - T10 之後要在 `passes` 補巴士的部分（5day plus 的巴士範圍），格式沿用 `passes[]`。
- 原因：目前 `passes.json` 用 `sourced-document`，只檢查最外層有 `sources`；T11、T14、T16 會讀這些欄位，需要固定格式。
- 狀態：已處理（T7，2026-10-17）：新增 `schema/passes.schema.json`

## [T1] 為 data/timetables/kintetsu/_travel-times.json 建立正式 schema
- 要改的檔案：`schema/`（新增 `kintetsu-travel-times.schema.json`）、`scripts/validate.mjs` 的 ROUTES
- 內容：格式說明也寫在檔案的 `notes` 裡。
  - `validFrom`（日期）、`retrieved`、`stationOrder`（車站 ID 陣列，伊勢市 → 賢島）、`notes`、`sources`
  - `segments`：鍵是 `"<A>><B>"`（相鄰兩個停車站），值是 `{ <列車種別>: { min, max, median, n } }`（分鐘）
  - `trains`：`{ weekday: { <trainNo>: Train }, holiday: { ... } }`；`Train = { type, to（終點站 ID）, dir（for-kashikojima | for-ise-nakagawa）, stops: [[車站 ID, 到站 HH:MM|null, 發車 HH:MM|null], ...] }`
  - 建議 validate 多檢查：stops 的車站 ID 都在 `stations.json`；各站時刻表的 `trainNo` 都能在 `trains` 找到，而且發車時刻一致。
- 原因：`scripts/next-train.mjs`（以及之後的 T11 車站面板、T14 行程引擎）靠 `trains` 查下一班車和車程。
- 狀態：已處理（T7）：新增 `schema/kintetsu-travel-times.schema.json`；validate 加上 stops 車站存在、各站 trainNo 存在且發車時刻一致的檢查

## [T1] 時刻表 schema：方向鍵的命名
- 要改的檔案：`schema/timetable-kintetsu.schema.json`（只改 description）、`docs/CONVENTIONS.md` 的時刻表範例
- 內容：T1 把方向鍵統一成兩個：`for-kashikojima`（南下，往鳥羽、賢島）和 `for-ise-nakagawa`（北上，往伊勢中川、名古屋、大阪）。CONVENTIONS.md 範例裡的 `for-ujiyamada` 請改成 `for-ise-nakagawa`。在伊勢市站南下終點是宇治山田、鳥羽的車也算 `for-kashikojima`，實際終點看 `to`。另外 `trainNo` 存的是近鐵時刻表網站的列車編號（例如 `1-3896`），同一班車在各站相同。
- 原因：讓各站檔案的方向一致，程式不用逐站判斷。
- 狀態：已處理（T7）：schema description 與 CONVENTIONS.md 範例已改

## [T1] stations.json：各站電梯、手扶梯、置物櫃（accessibility、coinLockers）
- 要改的檔案：`data/stations.json`（21 個近鐵車站的 `accessibility`、`coinLockers`，以及 `sources`）
- 內容：建議填入下表（「不明」＝來源沒有提到，請留 `null` 或照寫「不明」，不要寫「無」）。
  - 來源代號：**WP**＝日文維基百科各站條目（駅構造）；**RK**＝らくらくおでかけネット `https://www.ecomo-rakuraku.jp/ja/station/<站名>/`（頁面註記 2019-04-01 現在，可能過時）；**KM**＝近鐵站內圖 `https://www.kintetsu.co.jp/soukatsu/kounai/<站>.html`（只有圖片，內容是判讀圖片得到的；只有伊勢市、宇治山田、五十鈴川、鳥羽、白木、鵜方、賢島有）；**CL**＝近鐵「主な駅のコインロッカー」`https://www.kintetsu.co.jp/gyoumu/coinlocker/`。全部取得日期 2026-10-17。
  - 近鐵官網車站頁、バリアフリー頁的設施資料是從 CMS API 載入的，依指示沒有使用。

| 站 | accessibility（建議文字） | coinLockers（建議文字） |
|---|---|---|
| iseshi 伊勢市 | 有電梯：2010 年起近鐵月台有 2 座（WP）；剪票口在 1F（5 號線側），經 2F 天橋到 4 號線（KM）。站前有斜坡到剪票口（RK）。相對式 2 面 2 線、天橋（WP）。有站員。剪票口內有無障礙廁所（RK）。手扶梯：不明 | 有：特大 0、大 6、中 12、小 10（CL）；JR 側有伊勢市觀光協會行李寄放（KM） |
| ujiyamada 宇治山田 | 有電梯（RK；KM 約 4 座：1F↔2F 剪票口、2F↔3F 月台）、手扶梯 2 座（KM）。3F 高架 3 面 4 線，剪票口在 2F，入口只有 1F 西側（WP）。有站員（站長駐站）。無障礙廁所只在剪票口外（RK）。登錄有形文化財（2001） | 有：特大 11、大 47、中 36、小 151（CL）；在 1F（KM） |
| isuzugawa 五十鈴川 | 有電梯：每個島式月台各 1 座（KM）。島式 2 面 4 線、築堤上，剪票口在 1F，從下方通道搭電梯或走樓梯上月台（WP、KM）。有站員。剪票口內有無障礙廁所（RK）。手扶梯：不明 | 有：特大 0、大 28、中 12、小 10（CL） |
| asama 朝熊 | 高架、相對式 2 面，只有樓梯（WP）；RK：三段（入口→剪票口→月台→月台間）都需要協助。無人站、沒有廁所。電梯、手扶梯：不明 | 不明（CL 沒有列出） |
| ikenoura 池の浦 | 高架、坡地上，相對式 2 面，樓梯（WP）；RK：三段都需要協助。無人站、沒有廁所。電梯、手扶梯：不明 | 不明（CL 沒有列出） |
| toba 鳥羽 | 有電梯：近鐵剪票口內 2 座、1 號出口外 1 座；JR 側沒有（WP）。手扶梯通往各島式月台和 3 號出口（KM）。橋上站、島式 2 面 4 線，剪票口在 2F（WP）。有站員（站長駐站）。無障礙廁所在剪票口外（RK）。近鐵與 JR 的轉乘通道 2020-03-17 起關閉，剪票口完全分開（WP） | 有：特大 5、大 56、中 79、小 88（CL） |
| nakanogo 中之郷 | 沒有電梯（WP）；有手扶梯但無人化後停用（WP）；有斜坡、隨時可以通行（WP）。橋上站房、相對式 2 面，樓梯（WP）。無人站，一般廁所。RK：三段都「需要協助，但有設施」 | 不明（CL 沒有列出） |
| shima-akasaki 志摩赤崎 | 相對式 2 面，站內平交道（WP）；RK：三段都有無障礙路線。無人站、沒有廁所。電梯、手扶梯：不明 | 不明（CL 沒有列出） |
| funatsu 船津 | 相對式 2 面，站內平交道；入口是斜坡（WP）。RK：三段都有無障礙路線。無人站、沒有廁所 | 不明（CL 沒有列出） |
| kamo 加茂 | 築堤上、相對式 2 面（WP）；RK：剪票口→月台、月台間需要協助。無人站、沒有廁所。電梯、手扶梯：不明 | 不明（CL 沒有列出） |
| matsuo 松尾 | 地面、相對式 2 面，入口在鳥羽側（WP）；RK：三段都有無障礙路線。無人站、沒有廁所 | 不明（CL 沒有列出） |
| shiraki 白木 | 沒有電梯、手扶梯（KM）；相對式 2 面＋通過線，到 1 號線要走天橋（WP、KM）。無人站、沒有廁所。**來源衝突**：KM 只畫了天橋樓梯，RK 說有無障礙路線（車いす専用通路） | 不明（CL 沒有列出） |
| gochi 五知 | 相對式 2 面、沒有站房；月台間怎麼連接：不明（WP）。RK：三段都有無障礙路線。無人站、沒有廁所 | 不明（CL 沒有列出） |
| kutsukake 沓掛 | 島式 1 面，從平交道進站（WP）；RK：三段都有無障礙路線。無人站、沒有廁所 | 不明（CL 沒有列出） |
| kaminogo 上之郷 | 島式 1 面，從平交道進站（WP）；RK：剪票口→月台需要協助。無人站、沒有廁所 | 不明（CL 沒有列出） |
| shima-isobe 志摩磯部 | 有電梯：剪票口外 1 座、內 2 座（WP）；西側有電梯到剪票口（RK）。手扶梯全部停用、加蓋（WP）。橋上站房、2 面 3 線（WP）。有站員。剪票口內有無障礙廁所（無人工肛門設備）（RK） | 不明（CL 沒有列出） |
| anagawa 穴川 | 高架、相對式 2 面，樓梯（WP）；RK：剪票口→月台、月台間需要協助。無人站、沒有廁所 | 不明（CL 沒有列出） |
| shima-yokoyama 志摩横山 | 地面、相對式 2 面，直接進站（WP）；RK：三段都有無障礙路線。無人站、沒有廁所 | 不明（CL 沒有列出） |
| ugata 鵜方 | 有電梯：南北兩側（RK；KM 約 4 座）；南口有手扶梯到剪票口（KM）。島式 1 面在 1F，剪票口在 3F（WP）。有站員。剪票口內有無障礙廁所（RK）。有觀光案內所、巴士、計程車 | 有：特大 0、大 25、中 14、小 14（CL）；在南口樓梯旁（WP） |
| shima-shimmei 志摩神明 | 島式 1 面；賢島側入口是斜坡（WP）。RK：三段都有無障礙路線。無人站、沒有廁所 | 不明（CL 沒有列出） |
| kashikojima 賢島 | 終點站，4 面 5 線；月台到北口（巴士、計程車、飯店接駁車）幾乎沒有階梯（WP）；剪票口和月台都在 1F（KM）。往南口（遊覽船碼頭，低一層）只有上行手扶梯；輪椅使用者可以請站員帶繞路（WP、KM）。電梯：不明（KM 的旅客動線上沒有畫）。有站員（全天）。無障礙廁所在剪票口外（RK） | 有：特大 3、大 14、中 19、小 53（CL） |

  - 給長輩的重點：有電梯的站是伊勢市、宇治山田、五十鈴川、鳥羽、志摩磯部、鵜方；賢島月台到北口幾乎平面。朝熊、池の浦、穴川只有樓梯。無人站需要協助時，RK 說要在前一天以前聯絡鳥羽站（0599-25-2126）。
  - 未確認：宇治山田的樓梯牆與柱子間距不到 60 cm（伊勢市的文件，搜尋摘要提到，沒有打開原文）；中之郷月台間是否用平交道連接（說法不一，沒有列入）。
- 原因：長輩上下月台、帶行李時很重要（PLAN.md T1）；`stations.json` 只有 T0、T7 可以改。
- 狀態：已處理（T7）：21 站照表填入，來源 WP/RK/KM/CL 已加；RK 有 6 站（池の浦、船津、加茂、松尾、志摩磯部、穴川）找不到站頁，來源指向首頁並註明

## [T1] 建議：JR 參宮線時刻表（伊勢市～二見浦～鳥羽）
- 要改的檔案：無（建議在 PLAN.md 新增任務，或併入 T10）
- 內容：建議另外蒐集 JR 參宮線 伊勢市～五十鈴ケ丘～二見浦～松下～鳥羽 的時刻表（存成 `data/timetables/jr/<station-id>.json`，格式沿用近鐵時刻表）。JR 不能用近鐵 5 日券，車資另付。
- 原因：二見（夫婦岩、二見興玉神社）最近的車站是 JR 二見浦，近鐵沒有經過；JR 參宮線班次比近鐵少（實際班距待蒐集時確認），15 人搭車要先看時刻表，否則容易等很久。也要注意鳥羽站的近鐵、JR 轉乘通道 2020 年起關閉，要出站再進站。替代方案是巴士（CAN バス等，由 T10 處理）。
- 狀態：已處理（T7）：併入 T10（PLAN.md 的 T10 任務卡已加上）

## [T1b] 為 data/access/kix.json 建立正式 schema
- 要改的檔案：`schema/`（新增 `access.schema.json`）、`scripts/validate.mjs` 的 ROUTES（`access/*.json` 改用新 schema）
- 內容：T1b 定的格式如下（實際內容見 `data/access/kix.json`）。各區塊都有自己的 `sources`；推估的數字在文字裡標「推估」。
  - 最外層：`id`、`name`（common 的 name）、`retrieved`、`notes`、`flights`、`routes`、`day1`、`lastDay`、`luggage`、`accessibility`、`openQuestions`（字串陣列）、`sources`（必填）
  - `flights`：`arrive` / `depart`（`date`、`weekday`、`flights: [[起飛 HH:MM, 抵達 HH:MM], ...]`，`depart` 另有 `targetAtAirport`）、`terminal`、`sources`
  - `routes[]`：`id`、`name`、`recommended`（boolean | null）、`transfers`（整數）、`transferNote`、`legs[]`（`{ from, to（車站 ID 或站名）, mode, minutes, frequency?, fare?: { adult, child, note? }, note? }`）、`totalMinutes`、`costPerPerson`、`note`、包車另有 `driving`、`options[]`、`pros`、`cons`；`id: "rejected"` 的項目只有 `items`（字串陣列）
  - `day1`：`answer`、`assumptions`、`southboundTrains`（`note`、`trains[]`：`{ trainNo, type, osakaNamba, tsuruhashi, iseshi, toba, ugata, kashikojima（HH:MM | null）, note? }`、`sources`）、`timeline[]`（`{ time, event }`）、`fallback`、`dinnerWarning`、`overnightEnRoute`、`meetup`（`options[]`：`{ id, plan, pros, cons }`、`recommendation`、`sources`）
  - `lastDay`：`answer`、`assumptions`、`fromIseOptions[]`（`{ iseshiDep, train, arrive, then, airport }`）、`fromIseNote`、`stayOn0212[]`（`{ where, toAirport, note }`）、`recommendation`、`sources`
  - `luggage`、`accessibility`：說明文字欄位＋`sources`；`accessibility.stations[]` 是 `{ station, note }`
  - `trainNo` 對應 `data/timetables/kintetsu/_travel-times.json` 的 `trains.weekday`，建議 validate 檢查存在。
- 原因：目前 `access/*.json` 用 `sourced-document`，只檢查最外層有 `sources`；T14 行程引擎、T16 行程 UI 排第一天、最後一天時會讀這些欄位。
- 狀態：已處理（T7）：新增 `schema/access.schema.json`（另外收了 request 沒列的 `legs[].example`、`flights.arrive.airport`、`routes[].note`）

## [T1b] stations.json：大阪側轉乘站的無障礙資訊（參考）
- 要改的檔案：`data/stations.json`（只有在決定把大阪側車站加進來時）
- 內容：目前 `stations.json` 沒有大阪難波、鶴橋、大阪上本町、伊勢中川。這些站的電梯資訊整理在 `data/access/kix.json` 的 `accessibility.stations` 和 `data/raw/access/kintetsu-osaka.md`。如果 T11 的地圖要顯示機場往返路線，再考慮新增（`passes.json` 已經用 `osaka-namba` 當 ID）。
- 原因：長輩帶行李轉乘時，難波、鶴橋的無障礙路線和一般路線不同。
- 狀態：保留（參考）：等 T11 決定要不要在地圖顯示機場往返路線

## [T4b] restaurant schema：常用的 extra 欄位升格
- 要改的檔案：`schema/restaurant.schema.json`、`docs/CONVENTIONS.md` 的餐廳範例
- 內容：T4b 在 71 家餐廳裡反覆用到下面這些 `extra` 欄位，建議 T7 決定要不要變成正式欄位：
  - `extra.region`（候選表的地區：鳥羽站周邊、浦村、相差……）、`extra.inclusion`（納入條件 A～F）：地圖篩選和 T7 檢討門檻會用到。
  - `extra.tabelogOwner`（CONVENTIONS 已規定放 extra）。
  - `extra.barrierFree`（食べログ「バリアフリー」「車椅子で入店可」）：長輩相關，建議和景點一樣放進 `accessibility`。
  - `extra.googleStatus`（Google 顯示「臨時休業」）、`extra.movedFrom`（食べログ的移轉前地址）。
  - `extra.googleName`（Google 上的店名和食べログ不同時）。
  - `group` 建議加 `maxReservation`（食べログ「最大予約可能人数」）；目前只寫在 `group.source` 的文字裡。
  - `seating` 的 `other` 目前用來表示沙發座，建議加 `sofa`。
- 原因：這些資訊 T11 詳情面板、T14 團體檢查會用到，放在 extra 裡格式不固定。
- 狀態：已處理（T7）：`tabelogOwner`、`googleName`、`accessibility.barrierFree`、`group.maxReservation`、`seating: sofa` 升格；`region` 改成共同欄位；`inclusion`、`googleStatus`、`movedFrom` 維持在 extra。資料搬移由 T7b 做

## [T4c] spots.json：離島的港口資料點
- 要改的檔案：`data/areas/toba/spots.json`（T2 的檔案）
- 內容：建議新增離島航線的港口（定期船的乘船處），讓離島的餐廳可以用港口當 anchor、算「下船走幾分」：
  - 菅島港（菅島）、神島港（神島）：目前完全沒有資料點，T4c 只能用島上的景點（菅島灯台、八代神社等）當 anchor。
  - 答志島的和具港、答志港：目前和觀光點合併成 `toba-toshijima-wagu`（和具港・九鬼嘉隆の首塚・胴塚）、`toba-toshijima-toshi`（答志港・答志集落），座標是不是在港口不確定；建議分成港口和景點兩筆，或確認座標在乘船處。
  - 桃取港（答志島西側）如果行程會用到也一起加。
  - 座標用 Google Maps 的 `!3d!4d`；可以順便記鳥羽市營定期船的班次連結（佐田浜 `toba-sadahama-marine-terminal` 已有）。
- 原因：離島的店（まるみつ寿司、大春、喜久屋、重太郎屋、やま海）要配合船班，T14 需要「港口 → 店」的步行時間。補上港口後重跑 `node scripts/restaurant-anchors.mjs toba --write` 就會自動選進 anchors（港口在 spots.json 裡就會被當成景點候選）。
- 狀態：轉給 T7b（鳥羽補資料）
