# 自動模式下代替 👤 做的決定

自動依序執行時，任務卡裡要 👤 決定的地方由 session 照規則自己決定，記在這裡。👤 看過後要改的話另外開 session 改。只追加，不改別人的項目。

| 日期 | 任務 | 決定 | 理由 | 怎麼改回 |
|---|---|---|---|---|
| 2026-10-18 | T7c | 戶外、無人、來源沒寫時間的景點設 `hours.always: true`，`hours.note` 註明「推定」：日和山展望台、伊射波神社、菅島灯台、しろんご浜（神島 4 筆有るるぶ「散策自由」的來源，不算推定） | README 給 T7c 的建議「戶外自由參觀的設 always: true」；和「不知道就 null」有衝突，選擇讓行程引擎能用，同時在 note 和 `questions.md` 標出 | 把這 4 筆的 `hours.always` 拿掉、`hours` 改回 null（`spots.json`） |
| 2026-10-18 | T7c | 離島港口新增 5 筆獨立的 spot（`toba-port-wagu`、`-toshi`、`-momotori`、`-sugashima`、`-kamishima`，`extra.kind: "port"`）；答志島兩筆景點（`toba-toshijima-wagu`、`-toshi`）的座標從港口改到首塚、美多羅志神社 | T4c 請求的建議之一是「港口和景點分成兩筆」；港口放進 spots.json 才會被 `restaurant-anchors.mjs` 選成 anchor | 刪掉 5 筆 `toba-port-*`（和候選清單的 5 筆），答志島兩筆的座標改回 `extra.conflicts` 裡記的原座標 |
| 2026-10-18 | T7c | Google 座標和原座標差 300 m 以上就改用 Google（面白展望台、遊覽船、答志島兩筆），差 300 m 以內保留 OSM／Wikipedia | CONVENTIONS：OSM「有而且位置正確」才用 OSM；300 m 是步行約 4 分，超過會影響 anchors | 原座標都寫在各筆 `extra.conflicts`，照抄回 `coords` |
| 2026-10-18 | T7c | 遊覽船的 Google 連結、座標用「真珠島・水族館前のりば」（250 則），不用マリンターミナルのりば（35 則） | 「一家店拆成好幾筆時取評論數最多的」 | 換成マリンターミナルのりば的 cid（log/T7c.md 有列） |
| 2026-10-18 | T7c | `tags` 用同一條規則從結構化欄位補（`indoor` → 室內＋雨天備案、`stairs: 多` → 長階梯、`kids.friendly: high` → 親子），只加不刪；マリンターミナル因此也有「室內／雨天備案」 | README 給 T7c 的建議；規則化才不會漂移 | 把這三種 tag 從規則加上的筆拿掉（比對 2bb5825 的 tags） |
| 2026-10-18 | T7c | 港口的 `ratings` 照樣記 Google 星數（菅島港 2.6、桃取港 1 則），T7g 建議不打分 | 每筆都要有 Google 連結和星數；港口是交通節點，星數不代表推薦度 | — |
