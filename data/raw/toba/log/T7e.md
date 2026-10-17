## T7e 餐廳

## 第 1 批：補店（2026-10-18）

照修訂後的納入標準（CONVENTIONS §4：D 加「任何一天 0 家」、D③ 離島便當、F③ 接受非住客用餐的料理旅館）補店。既有 71 家這一批沒動（只有新店重算 anchors，舊店的 anchors 還原成原值）。

### 先找缺口
- `node scripts/restaurant-gaps.mjs toba`：神島每天 0 家（やま海營業時間不明）、菅島週三 0 家、國崎週三週四 1 家；不含晚餐住宿的晚餐：旅館なおみ 20 分內沒有、Anchor.／東の窓 走路範圍沒有、MFR 只有海太郎。
- 候選清單用程式撈：國崎・相差・浦村的 not-included、excluded（住宿本體）全部列出來。

### 非住客用餐查證（subagent，WebSearch／WebFetch）
- 料理旅館 16 間查官網、楽天日帰り頁、観光三重。**有來源的**：神具良（楽天日帰り昼食）、サン浦島（楽天日帰り昼食）、みち潮（楽天、官網日帰り夕食）；丸仙（讀文 subagent 讀到官網預約頁「不住宿也可以只訂餐」）；CaroCaro（食べログ「日帰りの方の送迎は行っておりません」、官網日帰りプラン入口）。戸田家有昼食方案但只到 2027-01-31。
- **沒有來源的**：伝洋、花椿（楽天日帰り沒有方案、官網沒寫；伝洋官網憑證錯誤、Chrome 也打不開）、The Earth、芭新萃、いじか荘、志摩ビーチホテル、ひょうすけ、丸善、TAOYA、一井、蒼空の風。伝洋、花椿改成 `pending`（照 CONVENTIONS 的「不確定時標待確認先不算進納入數」），其他維持 excluded、note 加註。
- 菅島：除了重太郎屋、おかげ屋沒有其他有來源的店（なこら「レストラン 無」）。神島：山海荘的昼食（観光三重 2023-02-11：完全予約制、非住客可、可外帶便當）。

### 食べログ、Google Maps（Chrome）
- 食べログ 15 頁（店家頁 13、コース頁 2），用 JS 讀「店舗情報」表格；Google Maps 約 20 次（`/maps/search/<名稱>?hl=ja` → JS 讀 `h1`、`div.F7nice`、`!1s…:0x…` 轉 cid、`!3d!4d`、主圖；週營業時間從 `aria-label` 含「曜日」的元素讀）。沒有驗證碼、登入、封鎖；結束時關掉所有分頁。
- 住宿兼用餐的 4 筆（みち潮、神具良、サン浦島、山海荘）的 Google 連結、座標、評分借 `lodging.json`，沒有重查。
- ポセイドン官網 ijika-poseidon.com 現在是無關的中文影音網站（網域失效），`links.official` 不填。天海官網 404。

### 新增 12 家
| id | 子地區 | 條件 | 補的缺口 | fit15 |
|---|---|---|---|---|
| toba-ijika-poseidon | kuzaki | D1 | 國崎週三週四 | unknown |
| toba-kuzaki-marusen | kuzaki | F2 F3 D1 | 國崎週三週四；海女小屋かまど | yes（宴會場 60 人） |
| toba-ijika-kagura-dining | kuzaki | F3 D1 | 國崎週三週四（午餐 11,000 円起） | unknown |
| toba-carocaro | uramura | F3 D2 | Anchor.、MFR 晚餐（要開車）；**晚餐限中學生以上** | yes（最大予約 20） |
| toba-motoura-sun-urashima-dining | uramura | F3 | 浦村午餐（8,624 円起，鳥羽站接駁） | unknown |
| toba-osatsu-michishio-dining | osatsu | F3 | 相差晚餐（東の窓） | unknown |
| toba-osatsu-bonten | osatsu | D2 | 東の窓晚餐 | unknown |
| toba-osatsu-tenkai | osatsu | D2 | 東の窓晚餐（OSRM 12 分） | unknown |
| toba-adako-oyster-grow | osatsu | D2 | 東の窓晚餐（同在畔蛸，8 分；晚餐完全預約制） | unknown（最大予約 14 vs 貸切 20 矛盾） |
| toba-horumon-takuchan | toba-station | D2 | 旅館なおみ晚餐（OSRM 19 分） | unknown |
| toba-sugashima-okageya | sugashima | D3 | 菅島週三（外帶便當，2 天前預約） | unknown |
| toba-kamishima-sankaiso-dining | kamishima | D1 | 神島午餐（完全預約制，營業時間不明） | unknown |

- 沒加的：千（カフェ，只到 16:00）、おくのせこ（只有 12:00～14:00）不符合 D② 晚餐；伝洋、花椿待確認。
- 候選清單新增 1 筆（`toba-kamishima-sankaiso-dining`），候選 206 家：included 83、not-included 62、excluded 53、pending 3（伝洋、花椿、戸田家）、over-limit 5。
- 住宿兼用餐的 id 用 `<住宿 id>-dining`，`extra.lodgingId` 指回住宿；Google 星數是住宿本體的。
- criteria 代號：D1 地區保底（含「任何一天 0 家」）、D2 晚餐缺口、D3 離島便當、F3 料理旅館的非住客用餐。

### 照片、菜單、讀文
- 照片 24 張（官網 14、三重縣 1、Google 9），24 張都用 curl 確認回 200 image/jpeg。山海荘借住宿的 Google 照片。
- `menu`：官網菜單或方案頁、楽天日帰り頁、食べログ dtlmenu。`group.groupMenu`：fit15 yes 的 2 家（丸仙：依人數預算商量、會食場 2 小時；CaroCaro：食べログ沒有コース頁、官網沒寫 → null）。食べログ的 `/party/` 頁兩家都是空的。
- 讀文：5 個 subagent（CaroCaro 1、國崎 2、相差畔蛸 3、旅館用餐 3、市區離島 3）。**整個 session 的 WebSearch 額度（200 次）在查證 subagent 用完**，讀文 subagent 幾乎都只能用 WebFetch 讀已知網址，個人心得 0～2 篇；ポセイドン、たくちゃん、天海 沒有任何新資訊。這幾家的心得要在第 2、3 批（或 T7g 前）補讀。
- 讀文 subagent 發現：サン浦島 的 489ban 預約頁（季節の昼懐石 8,470 円、1～30 人）其實是岐阜「滝元館 遊季の里」，沒有採用。

### anchors
- `node scripts/restaurant-anchors.mjs toba --write` 後，把 71 家舊店還原成執行前的值（只保留新店的 anchors；舊店重算是 T7f 的工作）。OSRM 呼叫 107 次，快取在 `data/cache/routes/`。
- 重跑缺口：菅島週三 1（おかげ屋）、國崎週三週四 4；神島仍是 0（やま海、山海荘都沒有營業時間）；東の窓 有天海 12 分、Grow 8 分（Grow 晚餐只有預約，`hours` 沒有晚上時段）；なおみ 有たくちゃん 19 分；Anchor.、MFR 走路範圍還是沒有（CaroCaro 直線 1.1～1.6 km，要開車）。
