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
| 2026-10-18 | T7e | 第 2 批 `menu`：食べログ只有使用者投稿的菜單照片、沒有文字菜單的店，記 `dtlmenu/photo/` 的連結（17 家）；有文字菜單記 `dtlmenu/`，有コース記 `party/` | CONVENTIONS「不存菜單照片，要看就點 menu 的連結」；這些店多半沒有官網菜單，沒有連結就看不到菜單 | 刪掉 `menu` 裡網址結尾是 `dtlmenu/photo/` 的項目 |
| 2026-10-18 | T7e | Dining 白石 的 `links.googleMaps` 借用潮路亭（住宿 `toba-shiojitei`）的 cid，`googleName` 記潮路亭，Google 星數不填（`ratings.note` 註明） | 「每筆都要有 `links.googleMaps`」；Google 搜尋沒有白石的獨立店家頁；住宿星數不代表餐廳評價 | 把 `links.googleMaps`、`googleName` 改回 null |
| 2026-10-18 | T7e | ふる里館 `fit15` unknown → `split`（`group.seats` 32） | fit15 規則：有明確席數 20 以上而且可以訂位 → split；ホットペッパー（2020）32 席、電話可訂、不能包場 | `group.fit15` 改回 unknown、`seats` 改回 null |
| 2026-10-18 | T7e | 海楽園 **沒有刪除或改 pending**，只在 `notes`、`questions.md` 寫「晚餐只給住客、非住客午餐沒有來源」 | 第 2 批的範圍是補照片、菜單、讀文，不重判納入；午餐能不能吃還不確定（不是確定不行） | 確認不行的話，候選改成 excluded、刪掉 `toba-kairakuen` |
| 2026-10-18 | T7e | 讀文回填的事實只寫進原本是 null 的欄位；和現有值不同的（席數、營業時間、座位）寫進 `extra.conflicts`，不覆蓋；屋形船 おきた 的 `mustTry` 從 5 道減成筆記 `[招牌]` 的 3 道 | 現有值多半來自食べログ（在優先順序裡），讀文來源多是口コミ站或舊介紹文；CONVENTIONS mustTry 2～3 道 | 依 `extra.conflicts` 改值；おきた 的 5 道在 git 歷史（c2c670c 之前） |
| 2026-10-18 | T7e | 第 3 批 `fit15` 改 4 家：はっかい split → `yes`（ホットペッパー 2020：宴會最多 40 人，`group.maxReservation` 40）；みなと食堂 unknown → `yes`（官網宴會頁：包場最多約 50 人）；モトかき unknown → `split`（Retty：100 席全桌席，完全預約制）；山安 パールロード unknown → `split`（Retty：可容納 350 人，ebica 預約） | fit15 規則：來源寫最大予約或包場 15 人以上 → yes；有 20 席以上而且可以訂位 → split | `group.fit15` 改回原值（はっかい split、其他 unknown），はっかい 的 `maxReservation` 改回 null |
| 2026-10-18 | T7e | 讀文回填的事實沒有對應的結構化欄位時（價格、停車、付款、時間限制、官網菜單頁），寫進新的 `extra.dossierFacts`（字串陣列，附來源網址），`price` 不從文字自動轉 | 「不知道就 null」；吃到飽的大人／小孩價、時價很難轉成 `[最低, 最高]`；放 extra 不會遺失，T7f 或 T7g 可以再轉 | 刪掉 `extra.dossierFacts`（資訊仍在筆記裡） |
| 2026-10-18 | T7e | 照片只採用官網網域的照片，讀文回報的媒體照片（みえメン 的七越本店、觀光三重 的やま海）不用，改用 Google 主圖 | CONVENTIONS §4「照片」的順序是官網 → Google，媒體不在清單 | 換成筆記裡的媒體照片網址 |
| 2026-10-18 | T7e | 筆記沒有 `[招牌]` 的店 `mustTry` 留空（大春、オレンジ、中山牡蠣、重太郎屋、ポセイドン、天海、たくちゃん），不用食べログ菜單或コース名稱補 | CONVENTIONS：`mustTry` 從讀文筆記的 `[招牌]` 整理 | 從食べログ `dtlmenu/`、`party/` 挑 2～3 道補上 |
| 2026-10-18 | T7e | 黒潮 相差店 的 `links.instagram` 不填（官網連的是伊勢店 @hana_seafood_don）；喜久屋 保留食べログ的 @104kikuya（官網寫 kikuya104）、馳走 保留 @tisou.toba（官網另有 @chiso_toba），差異寫在 `ig-notes.md` | 不確定是同一家店的帳號時不填；兩個都可能對時保留現有值 | 改 `links.instagram` |
| 2026-10-18 | T7f | `meals: varies` 的 13 筆住宿 `dinnerAccess` 照「選素泊／朝食方案時，步行 20 分內有沒有晚上營業的店」判斷（OSRM 係數 1，晚餐店＝`contexts` 有 dinner 而且旅程中有一天 18:00～19:00 營業，住宿附設餐廳 `-dining` 不算）：walk 10 筆（戸田家、鳥羽国際、潮路亭、扇芳閣、海女乃島、蒼空の風、大田家、神具良、サン浦島、銀鱗），car 3 筆（シーサイド、彩朝楽、亀の井）；分鐘數和店名寫在 `extra.dinnerAccessNote` | CONVENTIONS：walk＝步行 20 分內有店；只看有沒有店，不看 fit15。海女乃島只有 華月 剛好 20 分、相差 2 間只有 梵天 1 家、浦村 2 間只有 CaroCaro（限中學生以上），都寫在 note | 改 `dinnerAccess`（`lodging.json`），或全部改回 null |
| 2026-10-18 | T7f | 旅館なおみ 的 `dinnerAccess` car → `walk` | T7e 新增的 ホルモン たくちゃん 步行 19 分（OSRM），在 20 分內 | 改回 `car` |
| 2026-10-18 | T7f | 東の窓 的 `dinnerAccess` 維持 `car`（沒有改成 walk） | 20 分內只有 天海 12 分（還有沒有營業不確定，T7e）和 Grow 8 分（完全預約、`hours` 沒有晚上時段，不算晚餐店）；不能確定有店就不改 | 改成 `walk` |
| 2026-10-18 | T7f | 漁師めし みなと食堂 的 `hours` 改用官網（午餐 11:00～15:00、晚餐 17:00～22:00，週三週四休）；原本採用 Google（11:00～14:00、17:00～21:00） | CONVENTIONS 營業時間優先順序：官網 → 食べログ（店舗会員）→ Google；T7e 讀文才拿到官網的時間 | 改回 Google 的時段（記在 `extra.conflicts`） |
| 2026-10-18 | T7f | はっかい 的 `hours` 維持 Google（10:00～15:00、週四休），沒有改成じゃらん的 10:00～17:00 | 官網首頁沒有營業時間（WebFetch 只有店名）；じゃらん、觀光三重不在優先順序裡 | 改 `hours` |
| 2026-10-18 | T7f | かきいち 本店 週四的 `hours` 改成 null（週二原本就是 null） | 觀光三重寫週二休、觀光協會寫週四休，官網寫公休未定；不知道就 null | 週四改回 `[["10:30","15:00"]]` |
| 2026-10-18 | T7f | `extra.dossierFacts` 的價格轉成 `price`（12 家：まんてん、海太郎、かきいち、うえむら、西村食堂、かどや、まるみつ、喜久屋、やま海、むつみ、みなと食堂、王将）：取文中主要餐點的最低～最高每人價；只有「起」的最高填 null；`contexts` 有 dinner 而且晚上菜單相同的，dinner 填同樣的值；かきいち 改成官網的 3,500 円（原本是觀光三重的 3,300） | README 給 T7f 的建議；價位標籤、估預算要用 `price`。王将 的來源 tabiiro 是平均預算，不是菜單價 | 這 12 家的 `price` 改回 null（かきいち 改回 `[3300, 3300]`）；原文仍在 `extra.dossierFacts` |
| 2026-10-18 | T7f | かどや（国崎）的 `address` 改用官網的「国崎町 378」（原本是 Google 的 257），座標維持 Google | CONVENTIONS 地址優先順序：官網 → 食べログ（店舗会員）→ Google；餐廳座標以 Google 為準 | `address` 改回「三重県鳥羽市国崎町257」 |
| 2026-10-18 | T7f | 浦村カキ 英治丸 的 `address` 維持 Google 的「浦村町 1429-6」，觀光協會的 1229-6 只記在 `extra.conflicts` | 官網 eijimaru.com 憑證錯誤打不開；Google 在優先順序裡，觀光協會不在 | 改 `address` |
| 2026-10-18 | T7g | 5 個港口（`toba-port-*`）不評分：`assessment`、`tier` 維持 null，只寫 `summary`（船程、廁所、停航風險） | README 給 T7g 的建議「港口是交通節點，建議不打分」；spot-v1 的推薦度是「值不值得去」，港口不適用；地圖上 tier null 的點不會被當成 B 級景點 | 照 spot-v1 補 `assessment`（推薦度 1～2）和 `tier: "B"` |
| 2026-10-18 | T7g | 佐田浜（`toba-sadahama-marine-terminal`）照景點評分：`recommend` 2（B），理由寫「交通節點」 | 它不是 `extra.kind: port`，T2 就收錄成景點、有讀文筆記；打分可以讓地圖照推薦度縮小，不和港口混在一起 | 改成 `assessment: null`、`tier: null`（和港口一樣） |
| 2026-10-18 | T7g | 鳥羽灣遊覽船 `winterFit` 打 2（不是 1） | 官網 FAQ 寫 1 月中旬～2 月上旬休業，但 2027 年日期未公告，2/11 以後可能已經開航；rubric 的 1 是「2 月休業」，未確認時打 2，`summary.cons` 第一條寫要打電話 | 確認旅程內休業後改成 1 |
| 2026-10-18 | T7g | 階梯、坡道完全沒有來源的 4 個景點 `elderFit` 填 null（江戶川亂步館、角屋、鎧埼燈塔、春雨展望台），不從「古民家」「海角」推測 | §5.1「資料不足該面向填 null，不要猜」 | 電話確認後補分數（`questions.md` 已有相關項目的寫在那裡） |
| 2026-10-18 | T7g | `confidence` 的門檻：high＝Google 1,000 則以上而且有 2 篇以上近年心得；low＝Google 不到 100 則，或心得 0 篇而且 Google 不到 1,000 則；其他 medium（結果 high 2、medium 11、low 15） | §5.1 只寫「多個評分來源而且有心得／只有一個來源或評論很少」，沒有數字；訂成數字讓 T8f、T9f 一致，寫在 `assessment-notes.md` | 改 `assessment-notes.md` 的門檻後重填 `confidence` |
| 2026-10-18 | T7g | 景點沒有打 `recommend` 1 的；冷門、心得 0 篇的打 2；離島各點 Google 4.2～4.7 但評論 7～53 則，最高打 3 | rubric 的 1 是「心得普遍說不值得」，鳥羽沒有這樣的負評；評論數太少的高星數不可靠 | 個別調整 `recommend` 和 `tier` |
| 2026-10-18 | T7g | `accessEase` 的交通細則：定期船約每 1～2 小時 1 班而且下船 15 分內到 → 3（答志島）、下船還要走 20～30 分 → 2（菅島）、冬季一天 4 班 → 1（神島）；平日沒有公車 → 2（鳥羽展望台）；沒有公車、只能開車或計程車 → 1（春雨、面白展望台）；はちまんかまど 的接駁車能載全員但一天 1 班 → 4 | rubric 只有 5／3／1 的描述，中間值要訂規則才能跨區一致；寫在 `assessment-notes.md` | 改 `assessment-notes.md` 的規則後重打 `accessEase` |
