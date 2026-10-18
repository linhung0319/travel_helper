# T9b 志摩 住宿（2026-10-18，一批）

工作目錄：`data/cache/work/t9b-1/`（不進 git）。

## 工具
- 新增 `scripts/build-lodging.mjs`＋`scripts/lib/lodging-build.mjs`（附 `scripts/test/lodging-build.test.ts`，8 個測試）：仿 `build-spots.mjs`，從 `rk/`（楽天 detail、party-*.json、kids.json、rooms-N.json）、`google.jsonl`、`photos.json`、`facts/` 和 Claude 寫的 `judgement.json` 組住宿資料點。reviewAverage 0 → null、兒童價 1～99% 才填、15 人組合每天的最低價（含晚餐、和不同方案時的全部最低）、`extra.rakutenVacancy`、`nearbyCombos`（15 人住不下的，同區 1 km 內最近 4 間）、照片官網 → 楽天 → Google、座標 300 m 規則（共用 spot-build）。T19 可以直接用。
  - 第二次修：一棟貸し只有每間總價時 priceRange 寫「每間（棟）約 X 円」；楽天方案名是 null 時用房型名。
  - **重跑 build 會把 じゃらん 的分數清掉**（judgement 沒有 jalan）：build 之後要再跑 `jalan.mjs apply`。
- `scripts/lodging-dinner-access.mjs`：區域還沒有 restaurants.json 時，印訊息後結束（原本會 crash；也避免把「沒有餐廳資料」當成 car）。
- 一次性腳本（工作目錄）：`merge-simple.mjs`、`regions.mjs`（地址大字＋最近中心分子地區）、`vac-summary.mjs`、`run-rooms.sh`（kids／rooms 查詢）、`build-candidates.mjs`（候選組裝表）、`jalan-addr.mjs`（じゃらん旅館頁的住所，判斷是不是志摩市）、`mkact.sh`、`mkrv.mjs`（多家 google-reviews 接成一個 batch）、`fill-official.mjs`、`judgement-src.mjs`。

## 楽天 API（`scripts/rakuten.mjs`，間隔 1.1 秒，沒有錯誤）
- `simple` × 16 子地區（各 1～5 頁）：169 間，鳥羽市（相差、畔蛸）27 間剔除 → 志摩市 142 間。
- `detail` × 142。
- `party --dates 2027-02-02,2027-02-03`（15 人全部當大人；5x3、4x4、3x5、2x8）× 14 個中心（amanoiwato 0 間沒查、other 和 kokufu 等重疊），約 112 次查詢＋分頁。
- `vacant --rooms 1 --adults 3 --up 1` 和 `--adults 10／8／6／4／2`（2027-02-02，每次 15 間）× 10 組 × 6 種：約 60 次＋分頁。
- 另查 2027-02-03、02-09 的「1 間 2 人」（10 間沒有任何價格的）：只有 Villa Ryusei 02-09 有，其他 2027-02 方案多半還沒開。
- 合計約 420 次呼叫。
- 15 人組合有空房：2/2 25 間、2/3 27 間。一棟貸し 1 間 10 人有空房：LOG、Small Resort、森と海、やどかり志摩、UMIBE；8 人：UMILABO、御宿はな、Villa ISE shima、UMIBE Terrace。

## じゃらん（`scripts/jalan.mjs`）
- `list 241400`：82 間（含南伊勢町）。列表上沒上楽天的用 `jalan-addr.mjs` 讀住所：志摩市的是 花多來（收錄）、VILLA SOUTH COAST、LAIDBACK HOTEL、ペンション海老蔵（沒有評分，不收）、観光旅館みさき荘（＝楽天的 みさき荘 魚魚庵，沒有分數）。
- `apply shima --candidates`：名稱對到 31 間，`--map` 補 4 間（プロヴァンス、わたかの荘、丸定、NEMU）→ 35 間有分數；8 間旅館頁不顯示分數（近一年評論數不足）。

## Chrome（Claude in Chrome，1 個分頁，沒有驗證碼、登入或封鎖）
- `google-place.js`：§5.7 邊界 10 間＋收錄 56 間，約 70 頁。名稱是列表的重搜（UMILABO、Villa ISE shima、ノクターンの森（Google 上仍是舊名フィオーレ志摩 4.3／312；新名地點沒有評分）、鵜方ビジネスホテル、リゾートパークともやま）。
- **結果字串含「&」會被擋（[BLOCKED: Cookie/query string data]）**：Grand Mercure（Resort & Spa）、B&B フォレスト 兩次失敗；JS 最後加 `.replace(/&/g,"＆")` 就過。
- `google-reviews.js`（open → extract／lowest）：17 間（沒有楽天評分的包棟、小宿 10 間＋Google 比楽天低很多的 7 間）。評論抽取結果太長會被截斷 → 只回傳星數、日期、前 150～220 字。我手打 cid 打錯兩次（彩朝楽、アネックス 多一位數）→「找不到クチコミ分頁」，改用 `rv-targets.json` 的網址就好。
- 結束時 `localStorage.removeItem`（google-place、google-reviews 兩格），關掉分頁。

## 讀文
- 60 個 subagent（`prompt-common.md`；每個 prompt 只給 `prompt-lines.json` 的第 N 筆），同時最多 5 個（中途有一次跑了 6 個）。收錄 56＋排除後仍寫筆記的 4 間（SHIMA BOAT HOUSE、ばさら邸、the circle、B&B フォレスト）。
- 讀文後改判：ばさら邸、circle → excluded（小孩不能住）；B&B フォレスト → pending。
- 回報重點在 `reports.md`。

## WebSearch
- 主 session 2 次（「志摩市 一棟貸し 10人以上 貸別荘」「SHIMA BOAT HOUSE 定員」）。
- 讀文 subagent 21 次（60 個裡 21 個用了 1 次，其他 0 次）。
- **合計 23 次**。搜尋都有結果，沒有額度用完的跡象。

## 沒做、留給後面
- `dinnerAccess` 全部 null（T9e）。
- summary／assessment（T9f）。
- Airbnb 等沒上楽天的包棟只靠 WebSearch 2 次、じゃらん列表；沒有大量找。
- 2027-02 方案還沒開的住宿，行程定了以後重查。
