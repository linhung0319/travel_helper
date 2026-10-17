# T8a 伊勢（含二見）：子地區與景點 — 過程紀錄

> 每批一節，往下加；寫完的節不再改，T8a 結束後整份不再改。二見的過程也記在這裡（`data/raw/futami/log/T8a.md` 只放指向）。

## 第 1 批：子地區＋景點候選（2026-10-18，自動模式）

範圍：CONVENTIONS §4 標準作業流程步驟 0～1，以及步驟 2 的一部分（有來源的基本欄位）。不用 Chrome、不開讀文 subagent。

### 用到的工具與次數
- WebSearch 3 次：①伊勢市觀光景點一覽（找到 ise-kanko.jp 的エリア劃分）②伊勢市節分（找到二見興玉神社節分祭的觀光三重頁）③伊勢忍者キングダム 營業時間（找到 walkerplus、官網網域）。
- WebFetch 約 30 次：觀光協會首頁、神宮（visit、qa、ritual/annual、course/naiku）、二見興玉神社（首頁、event）、猿田彥神社（首頁、gyouji_saiten）、シーパラ（首頁、opening-hours、price、group、service、3925）、せんぐう館（首頁、user_guide）、徴古館、おかげ橫丁、スカイライン、參宮巴士、walkerplus、忍者キングダム官網、若松屋、オカゲ屋敷、觀光三重 event/8199。
- curl：觀光協會「見る」列表 10 頁、「遊ぶ・体験する」列表 3 頁、詳細頁約 38 頁（腳本在 scratchpad 解析，沒有存進 repo）；おかげ橫丁 about、スカイライン spot-summit、松尾觀音寺（EUC-JP）、伊勢苺園。
- 座標：Nominatim（26 個名稱查詢）、Overpass（名稱 regex）、國土地理院 AddressSearch（7 個地址）。

### 看過的列表頁
- https://ise-kanko.jp/purpose_cate/see/ （115 筆，10 頁）
- https://ise-kanko.jp/purpose_cate/experience/ （36 筆，3 頁）
- 觀光協會的エリア：內宮、外宮、二見、朝熊、河崎（おすすめエリア）＋列表標籤裡的倉田山、小俣、御薗、横輪矢持、その他。

### 子地區怎麼定
- 依觀光協會的エリア合併成伊勢 5、二見 2（理由寫在 `docs/decisions-pending.md`）。
- center 是各子地區主要景點和車站的大致中心（手算，不是平均值）；餐廳收完後可以改成資料點的平均（鳥羽 T7 的做法）。
- 觀光協會的エリア標籤和地址不一致的，照地址：月讀宮（標內宮 → ise-kurata）、松尾觀音寺（標內宮 → ise-kurata）、菊池パール（標二見、地址伊勢市通町 → ise-outskirts）、朝熊山麓公園・音無山（標二見；沒收錄）。

### 景點的取捨
- 母體是觀光協會的兩個列表；神宮 125 社裡宮域內的別宮、所管社併進外宮、內宮一筆，宮域外的別宮（月夜見宮、月讀宮、倭姬宮）各自一筆。
- 觀光案內所、車站、行李寄放、巴士（參宮バス）排除（服務設施）。
- 季節不合排除：神宮ばら園（5～6、10～11 月）、宮川堤の桜（4 月）、田んぼアート（夏）、二見浦海水浴場（夏）、二見しょうぶロマンの森（6 月，併在蘇民那筆 not-included）。
- 休業排除：伊勢忍者キングダム（官網首頁直接轉到「2026-07-23 起改裝休業」的公告圖片）、賓日館（2026-03～2032）。
- 小孩不能參加排除：伊勢焼陶芸体験（中學生以上）。
- 觀光三重（kankomie）的景點列表沒有另外看（WebSearch 額度留給後面的批次）；觀光協會沒列、可能漏掉的：伊勢夫婦岩めおと横丁（シーパラ 隔壁的商店街，寫在 シーパラ 的 extra）。

### 遇到的問題
- 伊勢忍者キングダム 官網（ise-jokamachi.jp）的首頁回傳一張 PNG（休業公告），WebFetch 讀不到文字，用 Read 看圖確認。第三方（walkerplus 2026-08）的資料還寫營業中，以官網為準。
- 神宮官網的 2/11 祭典名稱是「建国記念祭」；二見興玉神社、猿田彥神社的行事表寫「紀元祭」。照各自的寫法記。
- 二見興玉神社節分祭：觀光三重的頁面是 2025-02-02（那年節分是 2/2），官網年中行事寫「立春前一天 14:00」→ 2027 年是 2/3。
- シーパラ 官網的營業時間頁列了 4 種時段，沒寫哪天用哪種；票價分 Value／Regular／Peak 也沒寫日期對應。先照觀光協會的 9:30～17:00 填，note 註明。
- 參宮巴士（朝熊山）的時刻表頁是 2015-04-01 版，班次和票價可能已變。
- 松尾觀音寺官網是 EUC-JP，curl 後用 TextDecoder 解碼。
- 伊勢苺園的座標只在官網嵌入的 Google 地圖網址（`!2d…!3d…`），coordsSource 記 `official`。
- 近鐵小俣站不在 `stations.json`，伊勢苺園的 `nearestStation` 留 null（步行 8 分寫在 `extra.accessNote`）。要的話之後到 `docs/requests.md` 提。

### 結果
- `areas.json`：ise 5 個子地區、futami 2 個。
- `data/areas/ise/spots.json` 18 筆、`data/areas/futami/spots.json` 4 筆。
- 候選：伊勢 50 筆（included 18、not-included 24、excluded 8）、二見 19 筆（included 4、not-included 12、excluded 3）。
- `scripts/validate`：錯誤 0（警告只有已知的「retrieved 在未來」）。

## 第 2 批：ise-geku、ise-kurata、ise-asama、ise-outskirts 的 14 個景點（2026-10-18，自動模式）

範圍：Google Maps（Chrome）、照片、讀文筆記，依讀文回填 `stayMinutes`、`kids`、`accessibility` 等。ise-naiku 4 筆和二見 4 筆留給第 3 批。

### 讀文
- 11 個 subagent（`docs/prompts/dossier.md`，同時最多 5 個，背景執行）：外宮、せんぐう館、外宮參道、河崎、若松屋、徴古館、松尾觀音寺、伊勢苺園、菊池パール 各一；宮域外別宮 3 筆（月夜見宮、月讀宮、倭姬宮）合一；朝熊山 2 筆（金剛證寺、山頂展望台）合一。
- 共同規則放在 session scratchpad 的 `dossier-rules.md`（範本內容＋spot-v1 面向），每個 prompt 只寫資料點、已知來源、要找的重點。
- WebSearch：每個 subagent 都用滿 3 次，合計 33 次。讀不到的：co-trip、iko-yo（外宮）、tabi-mag、gazoo、VELTRA（403）、伊勢市步行路線 PDF（404）。
- 發現：個人心得非常少，多數只有官網、觀光協會、觀光三重、4travel／じゃらん／asoview 口コミ；中文心得 1 篇（gltjp，沒有實用細節）。朝熊山 2 筆完全沒有心得，冬季封路、足湯、拜觀費都沒有來源。
- 回填由主 session 寫（套用腳本在 scratchpad 的 `apply-t8a2.mjs`，從 59fa7c8 的 `spots.json` 讀，可以重跑）。subagent 推斷的值沒有採用：金剛證寺 `stairs: 少`（來源只說有石階）→ null；倭姬宮 `stairs: 多`（來源「石段が続く参道」）採用。

### Google Maps（Chrome）
- 方式同 T7c：`/maps/search/<名稱>?hl=ja` → JS 讀 `h1`、`div.F7nice`、網址 `!1s0x…:0x…`（第二段轉十進位＝cid）、`!3d!4d`、主圖（寬 300 以上的 `googleusercontent` 圖）。單一分頁，約 20 次頁面操作，沒有遇到驗證碼、登入或封鎖；結束時關掉分頁。
- 單一結果直接跳到地點頁時網址還沒更新，要多等幾秒再讀座標（河崎、倭姬宮各重讀一次）。
- 搜尋結果有多筆：
  - 外宮參道：直接搜尋跳到道路「伊勢市道外宮参道線」（沒有評論）；「外宮参道 商店街」的列表有兩筆「外宮参道」（4.4／19 則、0 則），取前者。列表另有 参道terrace 4.0（600）、伊勢百貨店 3.9（223）、伊勢菊一 4.5（67）。
  - 外宮：列表另有 多賀宮 4.5（180）、風宮 4.4（178）、せんぐう館 4.5（955）。
  - 月夜見宮：另有 高河原神社 4.1（40）。月讀宮：另有 葭原神社 4.4（47）、伊佐奈彌宮 4.6（28）。
  - 金剛證寺：另有 奥之院 4.2（151）。山頂展望台：另有 天空のポスト 4.3（950）。
  - 若松屋：Google 是店舖（日本食材店），沒有體驗的獨立地點；下野工場沒查。
- 座標差（Google vs 原座標）：伊勢苺園 236 m、山頂展望台 156 m、外宮參道 102 m、倭姬宮 82 m、其他 50 m 以內 → 全部保留原座標（300 m 規則）。

### 照片
- 官網／觀光協會（ise-kanko.jp 的 og:image 或主圖）優先；Wikimedia 用 Commons geosearch（半徑 250 m）找，選 8 張＋朝熊山 2 張（作者、授權從 extmetadata 取）；不夠的補 Google 主圖。
- Commons API 連續查詢會被擋（"too many requests"），間隔 2 秒以上再查就可以。
- 沒採用：神宮・徴古館・伊勢苺園官網的 og:image（全站共用圖）；觀光協會徴古館頁的 og:image（路線圖）。
- 44 個網址全部用 curl 確認 200。

### 其他
- 菊池パール 官網首頁有「※珠出し体験は、対応出来ません」的一行，看上下文是在講定休日（定休日可以買商品、不能體驗），見 `docs/decisions-pending.md`。
- 近鐵小俣站的新增請求寫在 `docs/requests.md`（座標用 OSM way 184365192）。
- 新的人工確認項目加在 `questions.md`（スカイライン冬季路況、金剛證寺石階、若松屋本店上限、菊池パール金具費等 8 條）。

### 結果
- `spots.json` 14 筆：`links.googleMaps`（cid）、`ratings`、`photos`（2～3 張）都有；`stayMinutes` 7 筆、`kids.friendly` 5 筆（high 4、medium 1）、`indoor` 13 筆（松尾觀音寺 沒有來源）。
- 筆記 14 份（`dossiers/`）。
- `scripts/validate`：錯誤 0（警告只有已知的「retrieved 在未來」）。

## 第 3 批：ise-naiku 4 筆＋二見 4 筆（2026-10-18，自動模式）

範圍：內宮、おはらい町・おかげ横丁、猿田彥神社、オカゲ屋敷，和二見全部 4 筆（二見興玉神社、伊勢シーパラダイス、夫婦岩表參道、松下社）的 Google Maps（Chrome）、照片、讀文筆記，依讀文回填。T8a 到這批結束。

### 讀文
- 7 個 subagent（同時最多 5 個，背景執行）：內宮、おはらい町、猿田彥神社、オカゲ屋敷、二見興玉神社、シーパラ 各一；夫婦岩表參道＋松下社（來源少）合一。共同規則同第 2 批（scratchpad 的 `dossier-rules-3.md`，只改了檔案路徑：二見的筆記放 `data/raw/futami/dossiers/`）。
- WebSearch：每個都用滿 3 次，合計 21 次（T8a 三批合計 3＋33＋21＝57 次）。全部 8 個 id 都有筆記，沒有沒讀文的。
- 讀不到的：tabi-mag（403，松下社）。個人心得仍然很少：オカゲ屋敷（2026-07 開幕）、猿田彥神社、夫婦岩表參道、松下社 0 篇；シーパラ 有 asoview 口碑和部落格，內宮只有 2017～2020 年的媒體文。
- 回填由主 session 寫（scratchpad 的 `apply-t8a3.mjs`，從 8dd93fb 的 `spots.json` 讀，可以重跑；`--tags` 才補 tags）。subagent 推斷的值沒有採用：シーパラ `stairs: 少`（FAQ 只說部分區域只能走樓梯）→ null，寫在 note。

### Google Maps（Chrome）
- 方式同第 2 批。單一分頁，約 25 次頁面操作，沒有遇到驗證碼、登入或封鎖；結束時關掉分頁。讀網址時不要把整個網址回傳（含 query 會被工具擋），只回傳解析出的 cid、座標。
- 搜尋結果有多筆：
  - 內宮：「皇大神宮 内宮」的列表第一筆「伊勢神宮」4.7（33,534 則）就是內宮（座標在正宮附近），取這筆；另有 皇大神宮 御正宮 4.7（157）、風日祈宮 4.6（612）、瀧祭神 4.6（112）。
  - おはらい町・おかげ横丁：取「おかげ横丁」4.2（38,666）；「おはらい町」4.4（1,280，cid 11624565743466390586）寫在 ratings.note。
  - 猿田彥神社：另有 佐瑠女神社 4.4（292）、方位石 4.0（23）、たから石 4.3（20）。
  - 二見興玉神社：列表第一筆 4.4（12,515）；另有 夫婦岩 4.4（2,028）、龍宮社 4.2（218）、天の岩屋 4.2（128）、社務所 4.3（43）。
  - 夫婦岩表參道：Google 是地址型的地點，沒有星數、評論（`ratings.google` null）。
  - 松下社：另有 松下社の大楠 3.9（8）。
- 座標差（Google vs 原座標）：松下社 648 m、內宮 442 m、夫婦岩表參道 218 m、二見興玉神社 110 m、オカゲ屋敷 72 m、猿田彥神社 49 m、シーパラ 29 m、おかげ横丁 6 m。
  - 松下社（地址座標，> 300 m）、オカゲ屋敷（地址座標是おかげ横丁的番地，不是建築物）改用 Google（`google-maps-url`）；原座標寫在 `extra.conflicts`。
  - 內宮差 442 m 但保留宇治橋（Google 的點在正宮附近，anchors 要從入口算），寫在 `extra.conflicts`、`coordsNote`。

### 照片
- 觀光協會＋官網（神宮官網 og:image 是全站共用圖，不用）各 1～2 張，Wikimedia 只有內宮採用 1 張（「View on Ujibashi Bridge」，CC BY-SA 4.0）；Commons geosearch 松下社 0 張、夫婦岩表參道只有海灘和狗的照片（沒用）。Google 主圖加 `=w800-h600-k-no`。
- 22 個網址全部用 curl 確認 200（シーパラ 官網圖是 webp）。

### 其他
- 二見興玉神社的 `hours` 改成 `always: true`（官網 FAQ「終日參拜」）；第 1 批的 9:00～16:00 是社務所電話時間（見 `docs/decisions-pending.md`）。
- シーパラ 2026 年 2 月每天的營業時間在官網營業時間頁背後的日曆資料（subagent 找到 `admin-ajax.php?action=eventorganiser-fullcal`），寫進 `hours.note`；2027 年還沒公布。
- 猿田彥神社的境內社 佐瑠女神社 2024-11 起改修，預定 2026-11 完工（`febNote`）。
- `questions.md`：伊勢 3 條、二見 4 條新增；二見興玉神社的參拜時間那條打勾。

### 結果
- `spots.json`：ise-naiku 4 筆、二見 4 筆都有 `links.googleMaps`（cid）、`ratings`（夫婦岩表參道 星數 null）、`photos`（2～3 張）；`stayMinutes` 5 筆（內宮 60、猿田彥 30、オカゲ屋敷 45、二見興玉 45、シーパラ 150；おはらい町、表參道、松下社沒有來源）、`kids.friendly` 3 筆（オカゲ屋敷・シーパラ high、二見興玉 medium）。
- 筆記 8 份（伊勢 4、二見 4）。T8a 合計：伊勢 18 份、二見 4 份，全部景點都有筆記。
- `scripts/validate`：錯誤 0（警告只有已知的「retrieved 在未來」）。
