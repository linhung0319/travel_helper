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
