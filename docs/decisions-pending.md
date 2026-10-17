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
| 2026-10-18 | T7e | 相差的伝洋、花椿（任務卡舉的 F③ 例子）**沒有新增**，候選改成 `pending` | 楽天日帰り沒有方案、官網沒寫非住客用餐（伝洋官網憑證錯誤打不開）；CONVENTIONS「能不能讓非會員用餐不確定時，標待確認先不算進納入數」 | 電話確認可以後，照 T7e 新增其他店的方式建資料（候選 `tabelog-24008197`、`tabelog-24003550`） |
| 2026-10-18 | T7e | 住宿兼用餐的 F③ 用獨立的餐廳 id `<住宿 id>-dining`（みち潮、神具良、サン浦島、山海荘），`extra.lodgingId` 指回住宿，Google 連結、座標、星數借住宿本體 | F③「住宿本體另外收在 lodging.json，餐廳這筆的 notes 註明」；id 全專案唯一，不能和住宿同 id | 刪掉這 4 筆和候選清單的對應（候選 `tabelog-24009973`、`-24006751`、`-24002026` 改回 excluded，`toba-kamishima-sankaiso-dining` 刪掉） |
| 2026-10-18 | T7e | 丸仙、CaroCaro 判成「接受非住客用餐」：丸仙依官網預約頁「不住宿也可以只訂餐」；CaroCaro 依食べログ「日帰りの方の送迎は行っておりません」和官網的日帰りプラン入口（沒有明寫「非住客」） | 寫明日帰り客的存在就等於接受非住客；浦村、國崎晚上缺店 | CaroCaro 改成 `pending`、刪掉 `toba-carocaro` |
| 2026-10-18 | T7e | 戸田家的非住客昼食標 `pending`（不新增） | 楽天昼食方案只到 2027-01-31，2 月方案還沒上架；鳥羽站周邊不缺店 | 2 月方案上架後新增 `toba-todaya-dining` |
| 2026-10-18 | T7e | D②「附近口コミ數最多的 1～3 家」：東の窓 取梵天、天海、Grow（晚上營業的相差・畔蛸 3 家）；なおみ 取たくちゃん；Anchor.／MFR 用 F③ 的 CaroCaro（要開車），沒有另外補 | 千、おくのせこ 只營業到下午，不算晚餐；浦村 not-included 的店都沒有晚上營業的來源 | 刪掉對應的店 |
| 2026-10-18 | T7e | Grow 的 fit15 判 `unknown`（最大予約 14 人、貸切 20 人以下互相矛盾）；CaroCaro 判 `yes`（最大予約 20）但 note 寫晚餐限中學生以上 | 照 T4b 喜久屋的前例；fit15 規則只看人數 | 改 `group.fit15` |
| 2026-10-18 | T7e | 新店的營業時間：CaroCaro 官網只寫不定休、食べログ寫月火休 → 月、火設 `null`（不知道）；たくちゃん 午餐沒有打烊時間 → 只記晚上；梵天 用食べログ（るるぶ寫 21:00 打烊記在 conflicts） | 「不知道就 null」；食べログ在優先順序裡，るるぶ不在 | 改 `hours` |
| 2026-10-18 | T7e | 舊 71 家的 anchors 在跑 `restaurant-anchors.mjs --write` 後還原成原值，只保留新店的 anchors | 任務說第 1 批不動舊店；舊店重算是 T7f | T7f 重跑時會一起更新 |
| 2026-10-18 | T7e | 第 2 批 `menu`：食べログ只有使用者投稿的菜單照片、沒有文字菜單的店，記 `dtlmenu/photo/` 的連結（14 家）；有文字菜單記 `dtlmenu/`，有コース記 `party/` | CONVENTIONS「不存菜單照片，要看就點 menu 的連結」；這些店多半沒有官網菜單，沒有連結就看不到菜單 | 刪掉 `menu` 裡網址結尾是 `dtlmenu/photo/` 的項目 |
| 2026-10-18 | T7e | Dining 白石 的 `links.googleMaps` 借用潮路亭（住宿 `toba-shiojitei`）的 cid，`googleName` 記潮路亭，Google 星數不填（`ratings.note` 註明） | 「每筆都要有 `links.googleMaps`」；Google 搜尋沒有白石的獨立店家頁；住宿星數不代表餐廳評價 | 把 `links.googleMaps`、`googleName` 改回 null |
| 2026-10-18 | T7e | ふる里館 `fit15` unknown → `split`（`group.seats` 32） | fit15 規則：有明確席數 20 以上而且可以訂位 → split；ホットペッパー（2020）32 席、電話可訂、不能包場 | `group.fit15` 改回 unknown、`seats` 改回 null |
| 2026-10-18 | T7e | 海楽園 **沒有刪除或改 pending**，只在 `notes`、`questions.md` 寫「晚餐只給住客、非住客午餐沒有來源」 | 第 2 批的範圍是補照片、菜單、讀文，不重判納入；午餐能不能吃還不確定（不是確定不行） | 確認不行的話，候選改成 excluded、刪掉 `toba-kairakuen` |
| 2026-10-18 | T7e | 讀文回填的事實只寫進原本是 null 的欄位；和現有值不同的（席數、營業時間、座位）寫進 `extra.conflicts`，不覆蓋；屋形船 おきた 的 `mustTry` 從 5 道減成筆記 `[招牌]` 的 3 道 | 現有值多半來自食べログ（在優先順序裡），讀文來源多是口コミ站或舊介紹文；CONVENTIONS mustTry 2～3 道 | 依 `extra.conflicts` 改值；おきた 的 5 道在 git 歷史（c2c670c 之前） |
