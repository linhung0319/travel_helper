## T7g 鳥羽摘要與評分（2026-10-18）

分 3 批：景點、住宿、餐廳（同一類型在同一批打完）。評分一致性檢查腳本由第 3 批寫。

### 1. 景點（第 1 批）
- 只讀 `data/areas/toba/spots.json` 和 `dossiers/` 的 28 份景點筆記；沒有重新爬文、沒有用 Chrome、WebSearch。
- 寫法：摘要和分數先寫成 scratchpad 的資料檔，再用臨時 Node 腳本寫進 `spots.json`（不進 repo）。`summary.basedOn` 取該筆讀文筆記「來源」列的網址；港口取 `sources` 的網址。`generated`、`assessed` 都是 2026-10-18，`rubric: "spot-v1"`。
- 結果（33 筆）：
  - 28 筆景點：S 3（水族館、石神さん、はちまんかまど）、A 6（真珠島、遊覽船、海の博物館、鳥羽展望台、相差かまど、伊射波神社）、B 19（3 星 10、2 星 9、1 星 0）。
  - 港口 5 筆：只寫 `summary`，`assessment`、`tier` null（決定寫在 `docs/decisions-pending.md`）。
  - `confidence`：high 2、medium 11、low 15。離島和南部的展望台、燈塔幾乎沒有心得，多半是 low。
  - null 的面向：`elderFit` 4 筆（亂步館、角屋、鎧埼燈塔、春雨展望台：階梯坡道沒有來源）。
- 校準範例和中間星等的判斷規則（`winterFit`、`elderFit`、`accessEase`、`confidence`）寫在 `data/raw/toba/assessment-notes.md`「景點」一節。
- 注意：
  - 遊覽船推薦度 4，但 `winterFit` 2（2 月很可能休業）；排行程前要先打電話。
  - 伊射波神社推薦度 4、`elderFit` 1：推薦度只看地點本身，長輩難度放在適合度。
  - 相差かまど 的座位形式（椅子或坐地）不明，`elderFit` 打 3、`confidence` low。
- 驗證：`scripts/validate` 通過（錯誤 0，警告都是已知的「retrieved 在未來」）。
