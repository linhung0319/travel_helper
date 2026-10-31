# T16m 設計：AI 的工具、資料、呈現

> 2026-10-31 👤 和 Claude 討論後決定。影響 T16m-a、T16m-b、T16m-c、T16。和 PLAN、architecture、interaction-design 較早的說法衝突時，以這份為準。
> **這份是原型的規格**：工具和畫面是真的，只有「決定呼叫哪個工具、回什麼話」的模型是假的（§8 的腳本）。

## 1. 決定摘要

| # | 決定 | 取代 |
|---|---|---|
| 1 | T16m 拆成 **T16m-a 共用**（工具、資料、假 AI、訊息格式、問 AI 的脈絡、提議流程）、**T16m-b 網頁**、**T16m-c 手機**；順序 a → b → c | 一張 T16m 任務卡 |
| 2 | 新增「**AI 挑的**」結果集，取代 AI 用的 `highlight`、`compare`；地圖上只留一種 AI 標示，比較的內容放在聊天文字，**比較列拿掉** | `highlight`、`compare`、`CompareBar` |
| 3 | **不在編輯中也能提議**：提議只在自己的畫面，按「採用」時才確認「開始編輯？」 | 「編輯中才有改行程的工具」 |
| 4 | **提議不開放直接手動改**：想改就繼續跟 AI 說，或採用後再手動改（有快照、可以復原） | 提議卡的「修改」按鈕 |
| 5 | 按「問 AI」**不會自動送出**：只帶入脈絡晶片和建議問題，由使用者選或自己打才送 | 行程卡自動送第一個建議問題 |
| 6 | 工具分三類：查資料、改畫面、提議改動（§4）；工具不分平台，平台差異都在「呈現」（§5） | PLAN 舊的工具清單 |
| 7 | 每人有自己的對話，**有簡單的對話清單**，不做共用聊天室；對話滿了要開新對話（§11） | 只有一段聊天紀錄 |

## 2. 原則

- **工具一份，呈現兩份**：AI 不知道也不用管是手機或網頁。它說「給使用者看這幾個點」，怎麼畫由各平台決定。
- **AI 和手動共用同一個操作邏輯**：AI 改的是同一份狀態；AI 才有的呈現，都要有看得懂的退出方式。
- **能算的交給引擎**：時間、衝突、交通都由工具算好再回傳，模型不自己推算。
- **資料沒寫就說不知道**：`null`、`unknown` 原樣回傳，不把「未查」說成「沒有」。
- **影響別人的事要使用者按**：只有按自己的想去直接做，並提供復原。

## 3. AI 的操作分三種

| 類型 | 操作 | 使用者接手時 |
|---|---|---|
| **和手動相同** | 換天、移地圖、切分頁、開詳情、套篩選 | 沒有問題，本來就是同一份狀態 |
| **只適合呈現** | 挑過的一組點、畫路線、提議 | 手動操作疊在上面；用晶片或列上的 ✕ 退出 |
| **不做** | 自由畫圖、標註、範圍圈、自訂表格 | 用文字和清單回答 |

### 3.1 「AI 挑的」結果集

篩選表達不出「2/5 中午有開、離水族館步行 10 分內」這種條件，所以 AI 給的是一組挑過的點。

```ts
interface AiResult {
  id: string;
  title: string;                         // 「鳥羽能坐 15 人的海鮮」
  ids: string[];                         // 照 AI 的順序
  notes: Record<string, string>;         // 點 → 一行理由
  lettered: boolean;                     // 比較時地圖標 A、B、C
}
```

- **放在 store 的 `aiResult`，不放進 `Filter`**：`Filter` 的值都由常數檢查，放不下標題和理由；這和搜尋（`query`）不放進 `Filter` 是同一個理由。
- **出現時**：把目前那頁的篩選和搜尋收起來（沿用 `filterStash` 的做法），否則取交集可能一個都不剩。
- **手動接手**：想去、展開、加到某天照舊；再篩選、再搜尋是和結果集取交集，顯示「AI 挑的 5 家中的 2 家」。
- **退出**：✕ 清掉結果集，還原收起來的篩選和搜尋。
- **排序**：有結果集時預設照 AI 的順序，使用者可以自己換排序。
- **地圖**：這幾個點用 AI 標示，`lettered` 時標 A、B、C。

### 3.2 路線

`drawRoute` 照舊。地圖上的「路線 N 條 · 清掉」也照舊（`MarksBar`，只留路線的部分）。

### 3.3 提議

- **只在自己的畫面**，不寫進後端、別人看不到，也不存檔。
- **內容是引擎的操作清單**：採用時才套到**最新的**行程上；別人先改過時重新檢查。
- **行程變了（同步、別人改）就重算**差異和警告；操作套不上時，提議標成過期，只留「不要」和「請 AI 重新提議」。
- **同時只有一份提議**，新的取代舊的。
- **時間軸只顯示差異**：提議的項目加「提議」膠囊，被換掉的項目變淡、劃掉（interaction-design §12.5）。有差異的天在日期列上標出來。
- **上方的提議列**：摘要、「採用」「不要」「看原本」。
- **提議期間手動改行程**：確定的行程照常可以改（編輯中），提議跟著重算。
- **採用**：
  1. 不在編輯中：先確認「開始編輯？」（沿用現有的對話框）；取消就什麼都不改，提議留著。
  2. `changeItinerary` 寫入（先存快照），跳「復原」提示，清掉提議，留在編輯中。
- **不要**：清掉提議；AI 下一輪看得到使用者拒絕了。

### 3.4 共同規則

- **新的取代舊的**：新的 AI 呈現取代上一個同類的。
- **手動不清除呈現**：只有按 ✕、新的呈現、或按「不要」才會清掉。
- **再看一次**：有呈現的訊息留一顆按鈕，按了用相同的參數重新呈現一次；手機的「在地圖上看」是同一件事。提議按了會用最新的行程重新檢查（§3.3）。
- **不搶畫面**：AI 回覆期間如果使用者動過畫面（移地圖、切分頁、開詳情），呈現就不生效，訊息改顯示「看結果」，使用者按了才呈現。

## 4. 工具

每個工具都回傳 `{ ok: true, … }` 或 `{ ok: false, error }`（同 T12 的指令），AI 可以讀了再決定下一步。所有工具都在瀏覽器執行（architecture §6）。

### 4.1 查資料：畫面不動

| 工具 | 參數 | 回傳 | 對應的問題 |
|---|---|---|---|
| `search_places` | `text`（中、日文名、別名模糊比對）、`types`、`areas`、`regions`、`cuisine`、`near`（點或座標、步行分鐘）、`inView`、`openAt`（日期、時間）、`fit15`、`fitSubgroup`、`elderly`、`kids`、`reservable`、`votes`、`sort`、`limit` | 精簡清單：`id`、名稱、類型、地區、等級、標章、一句話、符合條件的總數 | 「鳥羽有哪些能坐 15 人的海鮮？」 |
| `get_place` | `ids`、`sections`（`group`、`hours`、`access`、`accessibility`、`kids`、`price`、`menu`、`reservation`、`reviews`、`summary`、`assessment`、`links`） | 只回要的分區；合併修改層後的資料，附 `edited`；`null` 原樣回傳；不帶照片網址、`sources` 內容，只帶 `verified` | 「能包棟嗎？」「長輩走得上去嗎？」 |
| `get_day` | `date` | 引擎算好的時間軸：每項時間、停留、交通、等車、空檔、警告、住宿 | 「這天會不會太趕？」 |
| `get_trip_overview` | 無 | 每天：地區、幾個點、住宿、警告數、候選數 | 「哪天最趕？」 |
| `check_changes` | `ops`（§4.4） | 差異、文字摘要、新出現和消失的警告（engine 的 `checkProposal`）；畫面不動 | AI 自己試幾種排法 |
| `suggest_position` | `placeId`、`date` | 最順路的位置（engine 的 `bestInsertIndex`）和排進後的警告 | 「排哪天比較順？」 |
| `get_route` | `from`、`to`、`mode?`、`date?`、`time?` | 走法、分鐘、班次、轉乘、錯過的話、Google Maps 連結；引擎算不出來時明說 | 「從水族館怎麼去？」 |
| `get_timetable` | `station` 或 `route`、`date`、`after?` | 班次 | 「幾點有車？」 |
| `get_opinions` | `placeId` 或 `date`，或都不給（整趟的摘要） | 誰想去、誰不喜歡、候選在哪天、留言（含作者） | 「大家怎麼看？」 |
| `get_trip_info` | `topic`（`passes`、`airport`、`party`） | `passes.json`、`access/`、旅客條件 | 「五日券怎麼用？」 |

**資料量**：資料點 597 筆、約 3.2 MB，一筆中位數約 5 KB（2026-10-31 量）。`search_places` 只回精簡清單，`get_place` 才回細節。

### 4.2 改畫面：不動資料

| 工具 | 參數 | 對應 |
|---|---|---|
| `show_places` | `ids`、`title`、`notes`、`lettered?` | 設定結果集（§3.1） |
| `show_route` | `from`、`to`、`mode`、`minutes?`、`label?` | `drawRoute`、框住 |
| `show_day` | `date` 或 `all` | `selectDay`；手機切到行程 |
| `open_place` | `id` | 開詳情（各平台用自己的方式） |
| `move_map` | `area`、`region`、`ids`、`bbox`、`center` | `focus` |
| `set_filter` | 同 `setFilter`、`clear?` | 探索的篩選；手機的 `feed` 要接上（T16m-c） |
| `clear_view` | 無 | 清掉結果集、路線 |

### 4.3 提議改動：使用者按了才寫

| 工具 | 內容 | 卡片 | 按下確認後 |
|---|---|---|---|
| `propose_changes` | `ops`、`summary` | 提議卡（§3.3） | 採用流程 |
| `draft_comment` | `target`（地點、某天、整趟）、`text`（理由要寫進去，因為聊天紀錄只有自己看得到） | 草稿卡，可以直接改字 | `sharedStore.comment`，用使用者的名字 |
| `add_candidate` | `placeId`、`date` | 一行卡片 | `sharedStore.addCandidate` |
| `propose_place_edit` | `placeId`、`fieldPath`、`value`、`note` | 舊值 → 新值 | 寫進修改層，有紀錄、可以復原 |
| `propose_user_place` | `name`、`coords` 或連結、`type?`、`note?` | 不另做卡片 | `addPlaceStore.start({ via: 'ai', … })`，走同一個確認畫面（interaction-design §8） |
| `vote` | `placeId`、`value` | **直接做**，訊息裡有「復原」 | `castVote`（只影響自己、可以收回） |

### 4.4 `ops`：行程的操作

對應 engine 的 `ops.ts`；用項目 ID 指定要改哪一項（`get_day` 會回傳）：

```ts
type Op =
  | { op: 'add'; date: string; place: string; index?: number; start?: string; stayMinutes?: number; tags?: TagId[]; note?: string }
  | { op: 'remove'; itemId: string }
  | { op: 'move'; itemId: string; date: string; index?: number }
  | { op: 'replace'; itemId: string; place: string }
  | { op: 'addOption'; itemId: string; place: string }
  | { op: 'setStay'; itemId: string; minutes: number | null }
  | { op: 'setStart'; itemId: string; start: string | null }
  | { op: 'setTags'; itemId: string; tags: TagId[] }
  | { op: 'setTravel'; to: LegTarget; spec: TravelSpec | null }
  | { op: 'setLodging'; date: string; lodging: string | null; meals?: LodgingMeals | null };
```

- **模型不輸出整份行程**：比較不容易出錯，別人先改過也能重新套用。工具內部算出套用後的行程，交給 `showProposal`。
- 住宿不寫進一般的 `add`：engine 本來就分開。
- `replace` 在 engine 沒有對應的操作：工具層直接換掉那張卡目前選的點，時間、標籤、備選都留著。

### 4.5 每次對話自動帶的脈絡

只帶小的東西，其他用工具查：

- **系統提示（不變的部分）**：旅程日期、航班、旅客（15 人、長輩、小孩）、網站只做規劃、工具的規則。
- **畫面狀態**：`getViewState()`，加上現在的平台無關的「正在看什麼」：行程、探索、想去、詳情。
- **脈絡晶片**（§6）：每個晶片帶 ID 和精簡內容。

PLAN 原本要每次帶「目前的建議和投票」，改成用 `get_opinions` 查；15 人的投票和留言累積起來太大。

## 5. 訊息格式、平台分工

**格式照 Claude API 的 messages（含 tool use）**，T16 換成真的 API 時不用改。畫面從訊息和工具結果畫出來：

| 區塊 | 來源 | 說明 |
|---|---|---|
| 文字 | `text` | `[[place:<id>]]` 畫成地點標籤 |
| 快速選項 | `suggest_replies` 工具 | 2～4 顆按鈕，點了當成使用者的訊息送出 |
| 工具狀態 | 查資料的工具 | 一行灰字（「查了鳥羽的餐廳」），可以收合；讓使用者知道 AI 看了什麼 |
| 地點結果 | `show_places` | 平台各自畫（下表） |
| 提議卡、草稿卡 | §4.3 | 按鈕的狀態（已採用、已送出、已過期）要跟著存 |
| 狀態 | | 思考中、逐字顯示、出錯（可以重試）、超過每天上限 |

| | 網頁 | 手機 |
|---|---|---|
| **主要的呈現區** | 地圖、右欄（一直看得到） | 訊息本身；地圖要到行程頁才看得到 |
| **`show_places`** | 右欄切到探索、列出結果集；地圖標出來；聊天裡一行「看 5 家」 | 訊息裡的卡片輪播，下面「在地圖上看」 |
| **提議** | 右欄時間軸顯示差異，地圖畫虛線 | 提議卡；「在行程上看」到行程頁開半屏聊天，地圖畫虛線，時間軸切換要另外定 |
| **聊天的位置** | 左欄 300px（窄，不放輪播、表格） | AI 分頁（整頁）、行程頁的半屏 |
| **帶多個點** | 拖到聊天欄、「＋ 問 AI」累加 | 要新做（T16m-c） |
| **編輯中** | 照常 | 半屏現在藏起來，要改成打得開 |

**呈現介面**（`web/src/ai/stage.ts`）：`Stage` 給工具用；地圖、結果集、路線兩邊一樣（`createBaseStage`），平台只寫切畫面的部分 `ScreenSurface`（`showList`、`showDay`、`openPlace`、`screenKey`、`screenName`），T16m-b、T16m-c 用 `setScreenSurface` 接上。提議由 `proposals.ts` 處理，平台只負責畫。

**現有的指令**：`showProposal` 不變，工具內部把 `ops` 算成行程再交給它；切分頁、開詳情由各平台的 `ScreenSurface` 負責，不放進 `commands`；AI 不再呼叫 `highlight` 指令（地圖的 `highlightFeatures` 交通卡還在用，要留著）；`compare` 和比較列由 T16m-a 刪除，e2e 跟著改。

## 6. 問 AI

**統一流程**：按下去帶入脈絡晶片、顯示建議問題、游標停在輸入框；使用者選問題或自己打才送出。

**脈絡晶片**取代現在的 `selection`（只有地點）加 `chatDraft.placeId`（只有一個地點）：

```ts
type ChatContext =
  | { kind: 'place'; id: string; date?: string; itemId?: string }
  | { kind: 'day'; date: string }
  | { kind: 'trip' }
  | { kind: 'list'; source: 'explore' | 'wish'; filter: Filter; query: string; count: number };
```

- 晶片在輸入框上面，可以按 ✕ 拿掉；地點晶片可以累加。
- 送出後晶片跟著那一則訊息存下來，輸入框上面的晶片留著（接著問同一件事不用重帶），可以自己 ✕。
- **「正在看」是灰色的提示**：沒有晶片時顯示目前畫面（「正在看：2/5」），也會帶給 AI，可以 ✕。

| 入口 | 晶片 | 帶給 AI | 建議問題 |
|---|---|---|---|
| 行程・一張卡 | 地點（含那天、項目） | 精簡資料、前後站 | 這天排它會不會太趕？／換一家類似的／前後怎麼去？ |
| 行程・一天 | 某天 | `get_day` 的內容、候選、留言數 | 幫我檢查這天／午餐吃哪裡？／長輩會不會太累？ |
| 行程・整趟 | 整趟 | `get_trip_overview` | 哪天最趕？／哪幾晚還沒定住宿？ |
| 探索・一張卡、詳情 | 地點（有選天就帶） | 精簡資料 | 照類型（`askAiPrompts`） |
| 探索・整份清單（新） | 清單 | 篩選條件、筆數 | 挑 3 家最適合全員的／這些哪幾家適合長輩？ |
| 想去・一張卡 | 地點 | 精簡資料、`get_opinions` 摘要 | 排哪天比較順？／誰想去？ |
| 想去・整份（新） | 清單 | 依地區和票數的摘要 | 把還沒排的分到各天／大家最想去的是？ |

入口的位置由 T16m-b、T16m-c 定：至少探索和想去的展開卡、清單的篩選列要有按鈕；拖曳保留，但不是唯一的方法。

**問完之後畫面怎麼切**：
- 網頁：聊天一直在左邊，不切畫面。
- 手機：從行程問的開半屏聊天；其他的跳到 AI 分頁（現況）。送出前晶片和建議問題也在那裡顯示。

## 7. 假 AI

- **介面**：`ModelClient.send({ system, messages, tools, context })` 回傳逐字的事件流；T16 換成呼叫 Worker 的實作。
- **工具是真的**：腳本寫工具呼叫的參數，工具真的去查、真的改畫面。
- **回覆從工具結果組**：腳本的回覆是模板，名字、數字、時間從工具結果來，資料變了腳本不會變成謊話；下面 §8 的句子只是示意。
- **對不到腳本**：回「原型只能回答這幾種問題」，列出可以試的句子。
- **聊天紀錄**：原型存 localStorage（§11）。
- **只在 dev server 有**，正式 build 不帶。
- **目錄**：`web/src/ai/`（`tools/`、`stage.ts`、`context.ts`、`chatStore.ts`、`model.ts`）；假的放 `web/src/dev-fixtures/ai/`。取代 `mobile/chatDemo.ts`。

## 8. 對話腳本

資料點是 `data/` 裡真的點，行程是 `dev-fixtures/seed.ts` 的假行程。T16m-a 的單元測試跑「工具呼叫和結果」；T16m-b、T16m-c 的 e2e 跑畫面。

### 一般

**S1 找地點**：「鳥羽能坐 15 人的海鮮餐廳」
1. `search_places({ areas:['toba'], types:['restaurant'], cuisine:['浜焼き・貝','牡蠣','伊勢海老・高級海鮮'], fit15:['yes'] })`
2. `get_place` 取前幾家的 `group`、`reservation`
3. `show_places({ ids:['toba-yakigai-iroha','toba-yakatabune-okita','toba-hakkai'], title:'鳥羽能坐 15 人的海鮮', notes:{…} })`
4. 回覆「找到 3 家：[[place:toba-yakigai-iroha]]…」，快速選項「只看不用爬樓梯的」「排進 2/5 午餐」

畫面：網頁右欄切到探索，晶片「AI 挑的 · 3 家 ✕」；手機訊息裡的輪播。手動：按其中一家 ❤、再篩選、按 ✕ 回到原本的清單。

**S2 問單點**（從 `toba-osakaya` 詳情的「15 人坐得下嗎？」）
1. 帶晶片、點建議問題才送出
2. `get_place(['toba-osakaya'], ['group'])`
3. 回覆「全部坐一起不行、要分桌：有 80 席但不能包場，包廂只有 2 人用；分成 4～6 人可以」

畫面不動。

**S3 資料未查**：「漣坐得下 15 人嗎？」
1. `search_places({ text:'漣' })`，`get_place(['toba-sazanami'], ['group'])`
2. `fit15` 是 `unknown`：回覆「我們的資料沒有查到，不能說可以或不行，建議打電話問」，快速選項「找能確定坐得下的」

**S4 比較**（晶片帶 `toba-yakigai-iroha`、`toba-hakkai`、`toba-osakaya`）：「比較這 3 家」
1. `get_place` 取 `group`、`hours`、`price`、`access`
2. `show_places({ ids, lettered:true, title:'比較' })`
3. 文字條列差異，用 A、B、C 對應地圖

**S5 路線**：「從水族館走到珍珠島多久？」
1. `get_route({ from:'toba-aquarium', to:'toba-mikimoto-pearl-island', mode:'walk' })`
2. `show_route`
3. 回覆分鐘（已乘長輩、小孩的係數）、Google Maps 連結

**S6 幫忙留言、按想去、加候選**
- 「幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯」→ `draft_comment({ target:'toba-mikimoto-pearl-island', text:… })` → 草稿卡可以改字 → 按「送出」→ 詳情的留言分頁多一則。
- 「想去水族館」→ `vote` → 直接按，訊息裡有「復原」。
- 「把遊覽船加到 2/6 的候選」→ `add_candidate` → 按「加入」→ 那天的候選多一筆。

**S7 修改資料**：「大阪屋週三公休」
1. `get_place(['toba-osakaya'], ['hours'])`
2. `propose_place_edit({ placeId:'toba-osakaya', fieldPath:'closedNote', value:'週三公休', note:'使用者提供' })`
3. 卡片顯示舊值 → 新值；按「確認」才寫進修改層，詳情標「已修改」

**S8 貼連結加地點**：貼 Google Maps 連結
1. 解析連結（`lib/addPlace`）
2. `propose_user_place` → 開確認畫面，使用者按「加進來」才存

**S9 探索清單**（探索篩選「餐廳、鳥羽」時，按清單的問 AI）：「挑 3 家最適合長輩的」
1. 用晶片的篩選呼叫 `search_places`，`get_place` 取 `accessibility`
2. `show_places`：收起篩選、列出 3 家；✕ 還原篩選

### 行程

**S10 檢查一天**（行程 2/5 按問 AI）：「幫我檢查這天」
1. `get_day('2027-02-05')`、`get_opinions({ date:'2027-02-05' })`
2. 回覆引擎的警告、候選（遊覽船、大阪屋）；有人不喜歡大阪屋也要提
3. 主動問一個問題，快速選項帶下一步

畫面：`show_day`（已經在那天就不動）。

**S11 排一天（主流程，不在編輯中）**：「幫我排第 3 天，加午餐」
1. `get_day('2027-02-04')`、`get_opinions`（大王埼燈塔：阿公不喜歡、阿姨想去，要講）
2. `search_places({ near:'shima-izawanomiya', openAt:{ date:'2027-02-04', time:'12:00' }, fit15:['yes'] })`
3. `suggest_position({ placeId:<第 2 步的第一家>, date:'2027-02-04' })`
4. `check_changes([{ op:'add', date:'2027-02-04', place:<同上>, index:<第 3 步>, tags:['lunch'] }])`
5. `propose_changes(同上, summary:<第 4 步的摘要>)`

畫面：地圖虛線、時間軸差異、提議卡。
- 按「採用」→「開始編輯？」→ 確認 → 時間軸更新、有快照、跳「復原」、留在編輯中。
- 按「不要」→ 提議消失，行程沒變。
- 在「開始編輯？」按取消 → 行程沒變，提議還在。

**S12 提議過期**：「2/5 午餐換成大阪屋」→ `propose_changes([{ op:'replace', itemId:'i-7', place:'toba-osakaya' }])`；提議還在時，別人刪掉 `i-7`（dev 選單切換使用者）
- 同步後差異重算；操作套不上，提議卡顯示過期，只留「不要」「請 AI 重新提議」。
- 對照：別人只是改了同一天的其他項目時，提議照樣套得上，差異和警告跟著重算。

**S13 多天提議**（想去整份的問 AI）：「把還沒排的分到各天」
1. `get_opinions()`、`get_trip_overview()`
2. `check_changes`、`propose_changes`（有動到 2/6、2/7、2/11）
3. 日期列標出有差異的天，切天時時間軸跟著顯示；摘要列出每天的變動

**S14 提議後接著說**：S11 之後「換一家不要義大利麵的」（換成第 2 步後面第一家不是義大利麵的）
- 新的 `propose_changes` 取代舊的；舊訊息的提議卡標「已被新的取代」。

### 狀態

**S15 不搶畫面**：S1 思考中切到行程分頁
- 回覆完成時右欄不切；訊息顯示「看結果」，按了才切。

**S16 手動接手**：S1 之後手動打開其中一家的詳情、切到行程再切回探索
- 結果集還在；新的 AI 回覆才取代。

**S17 再看一次**：S1、S5 之後，按 S1 訊息的「再看一次」
- 結果集回來，路線照舊（不同類的不取代）。

**S18 狀態**：思考中（假裝延遲、逐字顯示）、出錯（可以重試）、超過每天上限（有明確提示、輸入框停用）。dev 選單切換。

**S19 對不到腳本**：回「原型只能回答這幾種問題」，列出可以試的句子。

### 對話（§11）

**S20 新對話和清單**：S1 之後按「新對話」，問一句，再從清單回到 S1 那段
- 清單有兩段，新的在上面，標題取第一句話；舊對話可以接著問。

**S21 多個使用者**：dev 選單切換使用者
- 看到的是那個人自己的對話；切回來原本的還在。

**S22 對話滿了**：dev 選單把用量切到「快滿」「滿了」
- 快滿：提示「這段對話快滿了」，還能繼續問。
- 滿了：輸入框停用，只留「開新對話」；舊訊息和「再看一次」照常。
- 這時按詳情的問 AI：自動開新對話，帶入晶片。

**S23 重新整理**：S11 提議還在時重新整理
- 對話還在；地圖和右欄沒有結果集、提議；提議卡按「在行程上看」用最新的行程重新檢查。

**S24 回覆中關閉**：S11 跑到一半時重新整理
- 那則回覆標「沒有回完」，有「重試」；按了重新送出，紀錄裡沒有留下沒結果的工具呼叫。

## 9. 任務範圍

- **T16m-a 共用**：`web/src/ai/`；§4 的工具、`ModelClient` 和假 AI、聊天的 store、`ChatRepository` 的 localStorage 實作、對話的生命週期（§11）、訊息格式、脈絡晶片的資料（`chat.ask`）、提議的 store 和採用流程、`aiResult`、把 `compare` 拿掉；單元測試跑完 §8 的工具部分。**不做版面**：現有的入口（`selection`、`chatDraft`、`chatDemo.ts`、自動送出）在 T16m-a 不動。
- **T16m-b 網頁**：聊天欄、對話清單、快滿和滿了的提示、右欄的結果集、時間軸的提議差異、提議列、問 AI 入口（改成 `chat.ask`，拿掉自動送出）、在 `App` 啟動 `startAi`、dev 選單切換假 AI 的狀態；e2e。
- **T16m-c 手機**：AI 分頁、半屏、對話清單、快滿和滿了的提示、輪播、提議卡、編輯中的半屏、帶多個點、問 AI 入口（改成 `chat.ask`，拿掉自動送出）、`set_filter` 接到 `feed`；e2e。兩邊都換完後刪掉 `selection`、`chatDraft`、`chatDemo.ts`。

T16m-b、T16m-c 開工前各自和 👤 討論畫面，看草圖定案，再寫回 interaction-design。

## 10. 留到 T16 看的事

- 真的模型會不會照這些工具的說明呼叫（用 §8 當測試案例）。
- 工具回傳的大小、費用、每天的上限。
- 要不要給模型上網查的能力（第一版不給，資料沒寫就說不知道）。

## 11. 對話的生命週期

**T16m 做畫面和流程，T16 做真實的儲存和計算**；兩邊之間是下面的介面，T16 只換實作，畫面不改。

| 情況 | T16m | T16 |
|---|---|---|
| 同一個使用者的對話 | 新對話、清單、切換；存 localStorage（key 含使用者 ID） | 存 D1（`chat_messages` 的 `conversation_id`），換裝置接得上 |
| 多個使用者 | 切換假使用者，看到各自的對話 | Worker 依登入身分限制，只能讀寫自己的 |
| 長度限制 | 快滿、滿了的畫面；用量由 dev 選單切換 | 計算真實用量、定門檻 |
| 關閉再打開 | 還原對話、中斷的訊息；用 localStorage 驗證 | 從 D1 載入；多個分頁、裝置之間切回來時重新抓 |

```ts
interface ChatRepository {                                    // T16m：localStorage；T16：/api/chats
  listConversations(): Promise<ConversationSummary[]>;        // id、標題、更新時間、用量狀態
  loadMessages(conversationId: string): Promise<ChatMessage[]>;
  createConversation(title: string): Promise<ConversationSummary>;
  updateConversation(id: string, patch: Partial<Pick<ConversationSummary, 'title' | 'usage'>>): Promise<void>;
  appendMessages(conversationId: string, messages: ChatMessage[]): Promise<void>;
  updateMessage(conversationId: string, message: ChatMessage): Promise<void>;   // 卡片按了之後
  removeTurn(conversationId: string, turn: string): Promise<void>;              // 重試前拿掉沒回完的一輪
}
type ContextUsage = 'ok' | 'near' | 'full';                   // ModelClient 回報；假 AI 由 dev 選單決定
```

### 對話
- **每人有自己的對話，不做共用聊天室**：聊天紀錄只有自己看得到；要讓大家知道的事用留言（`draft_comment`）。
- **清單**：標題（第一句話的開頭）、更新時間，新的在上面；舊對話可以接著問。第一版不做改名、刪除、搜尋。
- **打開網站**：回到最近的那段對話。
- **切換對話、開新對話**：提議清掉（提議卡還在，可以重新看），結果集和路線不動，輸入框上面的晶片清掉。

### 長度限制
- **快滿**：提示「這段對話快滿了」，還能繼續問。
- **滿了**：停用輸入框，只留「開新對話」；舊訊息、「再看一次」照常。
- **新對話不帶舊內容**：行程、想去都能用工具重新查。
- **滿了的時候按問 AI**：自動開新對話，帶入晶片。
- T16 可以先從送給模型的歷史裡拿掉舊的工具結果，讓對話撐久一點；畫面上的訊息不受影響。

### 關閉再打開
| 項目 | 打開後 |
|---|---|
| 對話、每則訊息帶的晶片 | 還在 |
| 輸入框上面的晶片、沒送出的字 | 不保留 |
| 地圖和右欄的呈現 | 不自動恢復，按「再看一次」才出現，避免一打開畫面就被改掉 |
| 提議 | 地圖上不顯示；提議卡還在，按了用最新的行程重新檢查 |
| 已採用、已送出的卡片 | 維持那個狀態，不能再按一次 |
| 回覆到一半的訊息 | 標「沒有回完」，有「重試」 |

**回覆中關閉會中斷**：工具在瀏覽器執行，頁面一關 AI 的工作就停了，不能在背景繼續。所以：
- **訊息的存法**：每次工具呼叫和結果一起存；一輪回覆走到 AI 不再呼叫工具才算完成。沒完成的那輪標「沒有回完」，重試時整輪拿掉重跑。
- **送給模型的歷史不能留下沒結果的工具呼叫**（Claude API 要求每個工具呼叫都有對應的結果），重試前先拿掉那一輪。T16m 用同樣的格式，由測試檢查。
- **重試不會重複寫入**：會影響別人的改動都要按確認才寫；`vote` 是設定值，重做一次結果相同。
