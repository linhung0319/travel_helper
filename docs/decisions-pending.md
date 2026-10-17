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
| 2026-10-18 | T7d | 楽天 API 用 2027-02-06（六）、02-09（二）兩天查 15 人的空房與價格；15 人全部當大人，組合 5×3、4×4、3×5、2×8；兒童價另用 2/9「1 間 大人 3＋小學生高學年 1」推算 | 行程還沒排，住鳥羽哪幾晚未定：取一個週末、一個平日當代表（2/9 和 T3 網頁報價同一天，方便比對）；API 的人數參數每間相同，混合大人小孩的 15 人組合查不了 | 行程定了以後用 `node scripts/rakuten.mjs party --hotel <編號> --dates <日期>` 重查，替換 `source: "rakuten-api"` 的 prices 和 `extra.rakutenVacancy` |
| 2026-10-18 | T7d | T3 網頁人工抄的 `source: "rakuten"` 價格保留，和 API 的 `rakuten-api` 並列；每天只記有空房組合裡含晚餐的最低每人價 1 筆，另加兒童價 1 筆 | README 給 T7d 的建議是「替換或並列」；網頁報價有房型細節（例如 13 人房），刪掉會掉資訊 | 刪掉 `prices` 裡 `source: "rakuten"` 的項目 |
| 2026-10-18 | T7d | 楽天細項評分放在 `ratings.rakutenService`／`rakutenLocation`／`rakutenRoom`／`rakutenEquipment`／`rakutenBath`／`rakutenMeal`；每天有空房的組合放在 `extra.rakutenVacancy` | schema 的 `ratings` 允許其他數字欄位；空房結果沒有正式欄位，先放 extra | 要正式欄位的話寫到 `docs/requests.md`；或刪掉這些欄位 |
| 2026-10-18 | T7d | 照片順序官網 → 楽天 `hotelImageUrl` → Google 主圖，每筆最多 3 張；官網照片不一定是外觀（輪播、大廳、客室也接受），每張都先用 HTTP 確認能打開；不用じゃらん的 og:image | CONVENTIONS §4「照片」的順序；じゃらん不在來源清單 | 改 `photos` |
| 2026-10-18 | T7d | 只從口コミ推論、來源沒有明寫的值不填：美さき的電梯（心得說館內全靠樓梯）、亂碼的じゃらん頁面分數（香潮 4.8 等）；口コミ或第三方設施列表明寫「有電梯」的（海百景、海女乃島、サン浦島）填 `true`，在 `accessibility.note` 註明來源 | 「不知道就 null」；明寫的第三方來源可以追溯 | 把這 3 筆的 `accessibility.elevator` 改回 null |
| 2026-10-18 | T7d | ロッキー的 `dinnerAccess` 設 `car` | 不供餐、口コミ只提到去 AEON 採買，沒有步行可到的晚餐店；子地區 toba-outskirts 是 `needsCar` | 改回 null，留給 T7f 的缺漏檢查判斷 |
| 2026-10-18 | T7d | 銀鱗的 `group.wholeRental` 設 `true` | 官網料金頁寫「全館貸切りなども可能」（價格要洽詢） | 改回 null |
| 2026-10-18 | T7d | 定洋的 source `https://4travel.jp/dm_hotel-10058241` 刪掉，改成 dm_hotel-10048688 | 讀文 subagent 發現舊網址其實是「漁師の宿 やまよ」 | 從 git 歷史加回 |
