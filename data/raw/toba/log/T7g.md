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

### 2. 住宿（第 2 批）
- 只讀 `data/areas/toba/lodging.json` 和 `dossiers/` 的 38 份住宿筆記；沒有重新爬文、沒有用 Chrome、WebSearch。先讀了 `assessment-notes.md`「景點」一節和第 1 批的紀錄，沿用「資料沒來源就 null」「評論少的高星數不直接當高分」「心得舊就降 confidence」的規則，數字門檻改成住宿版。
- 寫法同第 1 批：摘要、分數先寫成 scratchpad 的資料檔，再用臨時 Node 腳本寫進 `lodging.json`（不進 repo）。`summary.basedOn` 取讀文筆記「來源」列的網址；`generated`、`assessed` 2026-10-18，`rubric: "lodging-v1"`。
- 結果（38 筆）：
  - S 5（鳥羽國際飯店、蒼空の風、大田家、サン浦島、まるさん）、A 18、B 15（3 星 12、2 星 3：彩朝楽、宝屋、リド・ポルテ；1 星 0）。
  - `confidence`：high 14（市區、南部的大型飯店旅館）、medium 14、low 10（離島小宿、包棟）。
  - null 的面向：神島 山海荘 的 `meals`、`groupFit`（只有 1 篇觀光協會採訪，房間數沒查到）。
- 判斷規則（推薦度的數字門檻、評論數上限、往下調一級的條件，以及 `meals`、`groupFit`、`elderFit`、`accessEase`、`confidence`）和校準範例寫在 `assessment-notes.md`「住宿」一節。
- 注意：
  - 接送車載客數幾乎每間都沒寫，`accessEase` 沒有因為「能載全員的接送」打 5 的；選定住宿後要問（`questions.md` 已有）。
  - 小宿（大田家、香潮、たまや、まるさん、美浦荘）推薦度和料理分數高，但 `groupFit` 3：15 人要佔一半到全館，要電話問。
  - `meals` 5 的 8 間（大田家、なかよし、香潮、たまや、まるさん、美浦荘、銀鱗、寿々波；楽天餐 4.7 以上）都是南部和答志島的小宿；市區的大型旅館最多 4。
  - 長輩最友善（`elderFit` 5）：扇芳閣、オーシャンリゾート、亀の井；推薦度都只有 3。
- 驗證：`scripts/validate` 通過（錯誤 0，警告 811 都是已知的「retrieved 在未來」，和改之前相同）。

### 3. 餐廳（第 3 批）
- 只讀 `data/areas/toba/restaurants.json` 和 `dossiers/` 的 83 份餐廳筆記；沒有重新爬文、沒有用 Chrome、WebSearch。先讀了 `assessment-notes.md`「景點」「住宿」兩節和第 1、2 批的紀錄，沿用「評論少的高星數不直接當高分（評論數上限）」「資料沒來源就 null」「心得少就 low」，數字門檻改成餐廳版（食べログ＋Google）。
- 寫法同第 1、2 批：摘要、分數先寫成 scratchpad 的資料檔（4 個，每個約 20 家），再用臨時 Node 腳本寫進 `restaurants.json`（不進 repo）。`summary.basedOn` 取讀文筆記「來源」列的網址；筆記的來源沒有提到這家店或網址已失效的 5 家（重太郎屋、たくちゃん、大春、オレンジ、中山牡蠣）和完全沒有來源的ちさと，改用資料檔 `sources` 的網址。null 的面向在 `rationale` 寫「資料不足」的理由。`generated`、`assessed` 2026-10-18，`rubric: "restaurant-v1"`。
- 結果（83 筆）：
  - S 2（漣、西村食堂）、A 15（シーホース、水沼さざえ、一栄、大阪屋、焼貝いろは、ミネルヴァ、キッチンたかま、七越茶屋、屋形船おきた、モトかき、肉料理まつむら、むつみ、華月、みち潮、サン浦島）、B 66（3 星 48、2 星 16、1 星 2：ポセイドン、梵天）。
  - `confidence`：medium 26、low 57、high 0。筆記標「心得未補」的 39 家，除了評論合計 1,000 則以上或有口コミ彙整（Retty、Wanderlog 等）的，都是 low（README 的建議）。
  - null 的面向：`elderFit` 26（座位形式沒有來源）、`kidsFit` 15、`localFlavor` 3（重太郎屋、ポセイドン、天海：菜單沒有來源）、`groupFit` 3（海楽園、重太郎屋、梵天：預約、席數都沒有來源）。
- 判斷規則（推薦度的 4 條路徑、上限 3、2 星與 1 星的條件，以及 `localFlavor`、`groupFit`、`elderFit`、`kidsFit`、`confidence`）和校準範例寫在 `assessment-notes.md`「餐廳」一節。
- 注意：
  - 推薦度和適合度分開：漣、西村食堂 推薦度 5 但都不接受預約（`groupFit` 1），全員用餐要排別家；天びん屋 本店、はっかい、みなと食堂 `groupFit` 5 但推薦度 3。
  - `groupFit` 5 的 12 家（シーホース、天びん屋 本店、クッカーニャ、オレンジ、おきた、はっかい、大春、まつむら、みなと食堂、王将、丸仙、CaroCaro）是全員用餐的候選；オレンジ、大春 營業狀況要先確認，CaroCaro 晚餐不接受中學生以下（`kidsFit` 1）。
  - 料理旅館的非住客用餐（F③）照住宿本體的楽天「餐」分數打推薦度，最高 4。
  - 中途調整：ザ・貝屋 原本 4，對照規則（2 種以上來源）只有 なっぷ 一種 → 3；七越茶屋 `groupFit` 4 → 3、○八食堂 `localFlavor` 4 → 3（統一成規則的寫法）。
- 驗證：`scripts/validate` 通過（錯誤 0，警告 811 都是已知的「retrieved 在未來」）。
