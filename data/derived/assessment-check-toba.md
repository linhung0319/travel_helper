# 評分一致性檢查：toba（2026-10-19）

`node scripts/assessment-check.mjs` 產生，不要手改。列出來的不一定是錯的，人工確認 `rationale.recommend` 的理由；處理寫在 `docs/decisions-pending.md`。

- 景點：33 筆，評分 28（2 星 9、3 星 10、4 星 6、5 星 3），列出 1 筆；沒有 assessment 5 筆
- 住宿：38 筆，評分 38（2 星 3、3 星 12、4 星 18、5 星 5），列出 1 筆
- 餐廳：83 筆，評分 83（1 星 2、2 星 16、3 星 48、4 星 15、5 星 2），列出 2 筆

| 類型 | id | 名稱 | 星 | 評分 | 規則 | 說明 | 推薦度理由 |
|---|---|---|---|---|---|---|---|
| 景點 | `toba-bay-cruise-irukajima` | 鳥羽湾めぐりとイルカ島 | 4 | Google 3.9（250 則） | high-star-low-rating | 4 星但 Google 不到 4 | 觀光三重主打景點，一票玩遊覽船與海豚島；Google 3.9（250 則） |
| 住宿 | `toba-ryokan-naomi` | 旅館なおみ | 4 | 楽天 4.33、Google 4.3（7 則） | high-star-few-reviews | 4 星但訂房網、Google 都不到 100 則（訂房網評論數沒記的當 0） | Airbnb 4.8（142 則）、Google 4.3（7 則）；Google 有內文的 5 則是 4 則 5 星、1 則 1 星（樓梯陡、暗、入住流程） |
| 餐廳 | `toba-yakatabune-okita` | 鳥羽 海鮮料理 屋形船 おきた | 4 | 食べログ 3.08（21 則）、Google 4.8（449 則） | high-star-low-rating | 4 星但食べログ或 Google 偏低（門檻 3.3／3.8） | 體驗型：Google 4.8（449 則），觀光三重 2 篇、Travel.jp 介紹，口コミ的接待好評多；食べログ 3.08 只有 21 則 |
| 餐廳 | `toba-osatsu-michishio-dining` | 味の宿 みち潮（日帰り夕食） | 4 | 食べログ 3.23（33 則）、Google 4.3（773 則） | high-star-low-rating | 4 星但食べログ或 Google 偏低（門檻 3.3／3.8） | 料理旅館的非住客用餐（F③）：住宿本體楽天餐 4.55（4,943 則）、Google 4.3；Google 低分有料理品質不一的意見 |
