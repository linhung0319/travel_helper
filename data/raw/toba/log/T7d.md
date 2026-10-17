# T7d 鳥羽住宿補資料（2026-10-18）

## 做了什麼
- 新增 `scripts/rakuten.mjs`（楽天トラベル API）：`detail`（施設情報）、`vacant`（空室検索，可用飯店編號、子地區中心或座標）、`party`（15 人房型組合 × 多個日期）。key 從 `.env` 讀，輸出不含 key。
- 38 筆住宿：`links.googleMaps`（`https://maps.google.com/?cid=<cid>`）、Google 星數與評論數、照片 1～3 張；有上楽天的 32 筆用 API 重查。
- 讀文：34 個 subagent（`docs/prompts/dossier.md`；指令寫成 scratchpad 檔，subagent 讀檔執行）。合併的：鳥羽国際ホテル＋潮路亭、宝屋＋定洋、なこら＋山海荘、東の窓＋リド・ポルテ。筆記 38 份在 `dossiers/`。同時開的 subagent 最多 5 個（最後一輪短暫 6 個）。
- 套用腳本在 session 的 scratchpad（不進 repo）：從 T7d 開工時的 commit（756dd55）讀 `lodging.json`，套楽天、Google、讀文 patch 後寫回，可以重跑。patch 的 `set` 只填空欄位，不覆蓋已有值（衝突的寫進 `extra.conflicts`）。

## 楽天 API
- 端點 `https://openapi.rakuten.co.jp/engine/api/Travel/...`（新版，`applicationId`＋`accessKey`；舊的 `app.rakuten.co.jp` 對新 key 回 400）。`datumType=1` 才是世界測地系的度。
- 查詢：`detail` 32 間；`party --dates 2027-02-06,2027-02-09`（六、二；15 人全部當大人，組合 5×3、4×4、3×5、2×8）；另查 2/9「1 間 大人 3＋小學生高學年 1」（推兒童價）和「1 間 大人 2」。共約 120 次呼叫，間隔 1.1 秒，沒有錯誤。
- 寫進資料：`ratings.rakuten`／`rakutenReviews`（更新）、細項 `rakutenService/Location/Room/Equipment/Bath/Meal`、`prices`（`source: "rakuten-api"`，每天取有空房組合裡含晚餐的最低每人價，加 1 筆兒童價）、`photos`（`kind: "rakuten"`，`hotelImageUrl`）、`extra.rakutenVacancy`（每天有空房的組合）。網頁人工抄的 `source: "rakuten"` 價格保留並列。
- 15 人組合兩天都沒有空房的 11 筆：潮路亭、なかよし、たまや、まるさん、美浦荘、中村屋、寿々波、美さき、なこら、リド・ポルテ、なおみ。小宿是房數不夠或 2027 年方案還沒開放（なかよし、たまや、まるさん T3 已知），美浦荘、なこら 1 間有空房。
- 兒童價（大人 3＋小學生 1 的總價減大人 3 人份）：大多 70%；大田家 100%、香潮 54%、やま七 53%、なこら 64%、美浦荘 60%、彩朝楽 80%。

## Google Maps（Chrome）
- 照 T7c：`/maps/search/<名稱>?hl=ja` → JS 讀 `h1`、`div.F7nice`、網址的 `!1s0x…:0x…`（轉十進位＝cid）、`!3d!4d`、主圖 `lh3.googleusercontent.com`。4 個分頁輪流，約 50 次頁面操作。沒有遇到驗證碼、登入或封鎖；結束時關掉所有分頁。
- 列表或拆成多筆時取評論數最多、名稱對得上的：オーシャンリゾート（列表，1,277 則）、銀鱗（「銀鱗〜炭火焼き…」127 則；另有地址名稱的「料理の宿 銀鱗」無評分）、MFR（本館 72 則；Villa、HANARE A/B 另列在 sources note）、やま七（「ニューやま七」102 則）。
- 座標：Google 和原座標都在 300 m 內，沒有改（T7c 的規則）。
- Google 星數普遍比楽天低 0.3～0.6；彩朝楽 3.6、一井 3.8、宝屋 3.8（28 則）。§5.7 的排除條件（全部來源都 < 3.8）沒有人符合。

## 照片
- 順序：官網（subagent 回報）→ 楽天 `hotelImageUrl` → Google 主圖，最多 3 張；每張用 HTTP 確認回 200（蒼空の風的 webp 伺服器回 `audio/unknown`，照副檔名接受）。
- 結果 96 張：官網 26（25 筆）、楽天 32、Google 38。官網照片很多是首頁輪播或客室圖，不一定是外觀；subagent 推出來的相對路徑都有驗證過能打開。沒採用：じゃらん的 og:image（不在 CONVENTIONS 的來源清單）。

## 讀文的發現（細節在各筆筆記）
- 個人部落格心得很少，主要是楽天、じゃらん、4travel、cocolocala、Relux 的口コミ；4travel 很多是 2015 年以前的舊文。中文心得幾乎沒有。
- じゃらん頁面用 WebFetch 讀常常是亂碼：只採用讀得清楚的分數（這次新增 9 筆），亂碼頁的分數不記。
- 電梯：新確認 8 筆（海百景、胡蝶蘭、彩朝楽、オーシャン、海女乃島、なかよし、神具良、サン浦島），其中海百景、海女乃島、サン浦島只有口コミ或第三方來源，在 note 註明。美さき心得說館內全靠樓梯，但沒有明寫沒電梯，`elevator` 留 null。
- 定洋的舊 source（4travel dm_hotel-10058241）其實是「漁師の宿 やまよ」，已移除改成 dm_hotel-10048688。山海荘的 4travel 搜尋結果是青森同名飯店，沒用。
- 亀の井：早餐螃蟹吃到飽的新聞稿寫限定到 2026-02-28，febNote 補註要確認。
- まるさん：資料檔的 `elevator: true`（T3）這次讀的來源都沒寫，寫進 `extra.conflicts` 和 questions。

## 沒做、留給後面
- 摘要、評分（T7g）。
- `dinnerAccess` 是 null 的 `varies` 住宿（除了ロッキー）沒有判斷，留給 T7f 重跑缺漏檢查。
- 接送車載客數、電梯、包棟可否等仍是共通缺口，questions.md 加了 T7d 讀文的問題。
