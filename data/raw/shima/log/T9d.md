## T9d 餐廳詳細資料（志摩，分 5 批）

- 分批照 `data/cache/work/t9d-plan.json`（T9c 產生）：1 kashikojima＋yokoyama 16（pending 7）／2 ugata 25（2）／3 isobe＋matoya＋anori＋kokufu 21（5）／4 daio＋tomoyama＋goza＋wagu＋other 17（2）／5 hamajima＋sakko 13（4）。
- 資料寫 `data/areas/shima/restaurants.json`（第 1 批新建）。每批 `build-restaurants.mjs build --candidates` 填 `pointId`、拿掉 `detailPending`；其他批次的條目不動。
- 志摩照任務卡「從一開始就由主 session 讀口コミ、Google 評論補心得」：同一批裡做完讀口コミ（T8e 的做法）。`anchors`、缺漏檢查留給 T9e；`summary`／`assessment`／`tier` 留給 T9f。

## 第 1 批：shima-kashikojima＋shima-yokoyama 16 家（2026-10-18）

### 結果
- 收錄 **13 筆**（kashikojima 12、yokoyama 1）：イワジン喫茶室、はな屋 あじさい、宝生苑 日帰り昼食、ラ・メール、ラ・メール ザ クラシック、浜木綿、リアン、芳カツ亭、山吹、賢島カンツリー レストラン、都リゾート 和食・カフェ、マレナSHIMA フレンチ、ミラドール志摩。
- **pending 7**：收錄 4（F3）——はな屋（官網「お食事のみのお客様も大歓迎」）、宝生苑（官網「日帰り昼食プラン」，只收午餐）、賢島カンツリー（官網「レストランのみ（ゴルフをされない方）の利用も可能」）、都リゾート ベイサイドテラス（TableCheck 公開預約、貸切ランチ 15～50 人；一筆代表和食＋カフェ＋貸切ランチ）；排除 3——志摩観光ホテル、同 ベイスイート 的食べログ總頁（和館內餐廳重複）、THE HIRAMATSU 賢島（非住客用餐沒有來源）。
- fit15：yes 6、split 2、no 1、unknown 4（README「詳細資料（T9d）」）。
- **ラ・メール ザ クラシック 2027-01-23～03-04 改裝**（TableCheck，讀文發現）：`closures` 3 段，旅程中當作休業；ラ・メール 在同期間加開午餐。
- 照片：官網 12 張（photo-check 全部 200）；マレナ 用 Google 主圖；ベイサイドテラス 借住宿的官網照片。`menu`：食べログ dtlmenu／party 或 `dtlmenu/photo/`＋官網菜單頁 5 家。
- IG 7 帳號（`ig-notes.md` 新建）、`questions.md` +13、`decisions-pending.md` 14 列（5 條進「👤 建議先看」）。

### 步驟
1. `candidates.mjs export --keys … --ids …` → `t9d-1/batch.json`（16 家，id 先指定；住宿附設的用 `<住宿 id>-dining`）。
2. **食べログ（Chrome，1 個分頁）**：`chrome-actions.mjs --script tabelog-info --store`，店家頁 16＋コース頁 3（クラシック、浜木綿、マレナ）＝ browser_batch 4 次。第一頁沒有 Cloudflare 畫面。
3. **讀文 subagent 5 個**（背景，`t9d-1/prompt-common.md`：照 `docs/prompts/dossier.md`，「這一批的重點」是非住客用餐（facts 加 `nonGuestDining`）、年齡限制、2/2 晚上、團體、交通）：3＋3＋3＋3＋2 家。14 份筆記（含排除的 HIRAMATSU）。
4. **Google Maps**：`google-place.js --google --store`，browser_batch 4 次＋列表 1 次截圖點選（イワジン喫茶室：搜尋結果先命中 イワジン真珠）。列表重搜：イワジン、はな屋（Google 店名「賢島ファミリーホテルはな屋「あじさい」」）、ラ・メール（店名「フレンチレストラン「ラ・メール」」）、リアン。
5. `candidates.mjs set`（`cand-status.json`）：pending 7 → included 4／excluded 3；`cand-detailpending.json`：其他批次 included 63 筆加 `detailPending: true`（restaurants.json 建立後 validate 會把「included 沒有 pointId」當錯誤，T9c 沒加）。
6. `photo-check.mjs` → `build-restaurants.mjs draft` → `judgement-src.mjs`（每家的判斷）→ `judgement.json` → `build --candidates`（先 `--dry-run`）。validate 通過，commit。
7. **口コミ・評論**（對象：fit15 yes／split，或 食べログ 3.40 以上、Google 4.3／100 以上 → 12 家，山吹（3.30、Google 4.9／13、no）除外）：`chrome-actions.mjs --script tabelog-reviews／google-reviews --store`，之後手寫同格式的 `--stored` actions；browser_batch 共 13 次（逾時 1 次）＋截圖 0。重點寫 `t9d-1/notes/<id>.md` → `notes-to-json.mjs` → `dossier-merge.mjs`（照抄 `t8e-6/`）併進 `dossiers/`；回填 `apply-patch.mjs`（`patch-r.json`、`patch-r2.json`，先 `--dry-run`）。
8. 結束：tabelog.com、www.google.com 的 `__th_*` localStorage 都 removeItem（確認 0 筆），關掉分頁。沒有遇到驗證碼、登入、封鎖、對話框。

### 口コミ・評論的讀法（關鍵字依資料檔的 null／unknown 決定）
- 一般店：食べログ 最新 20＋「中止」「冬」（＋「子供」「団体」「座敷」「階段」看欄位），Google 評価の低い順 10＋食べログ 0 筆的詞。
- 住宿・球場本體（宝生苑、ベイサイドテラス、賢島カンツリー）：最新 20 則多是住客或打球客，只搜「ランチ」「昼食」「和食」「レストラン」取用餐相關，Google 沒讀低分順。
- マレナ（Google 4 則）：`open` 後 `extract` 0 則（警告）、`lowest` 4 則——CONVENTIONS 已確認的狀況。
- 例外：一個 batch 18 個動作（食べログ 9 頁）逾時，之後拆成 8～12 個動作；拆的時候 ミラドール 食べログ 漏搜「子供」（Google 有搜）。浜木綿 Google 沒搜「中止」、リアン 沒搜「予約」。はな屋 多搜 Google「夜」（第一晚的晚餐，0 則）。賢島カンツリー 的 Google `search` 第一次輸入框沒開（throw），重跑成功。
- 發現：はな屋 是 2F 脫鞋座敷＋桌席（回填 seating、kids）；芳カツ亭 的招牌是エビフライ、開店前就排 6 組、全員到齊才帶位；ミラドール 只收現金、VC 走上去 15～20 分很累；宝生苑 日帰りランチ＋入浴 4,800 円評價好但上菜慢。

### WebSearch
- 主 session 0 次；讀文 subagent 6 次（A 2、B 1、C 0、D 2、E 1）。搜尋都有結果，沒有額度用完的跡象。

### 給下一批
- 第 2 批（ugata 25＋pending 2：プロヴァンス、フィオーレ志摩）照這批的步驟；`t9d-1/judgement-src.mjs`、`notes-to-json.mjs`、`dp-add.mjs` 可以照抄改內容。
- browser_batch 控制在約 12 個動作；食べログ口コミ頁回傳很長（每頁約 5～8k 字）。
- 第一晚的晚餐：賢島 沒有平價、確定營業的晚餐店，鵜方站周邊（第 2 批）是重點，要確認 2/2 週二的營業和 19 時以後的 L.O.。

## 第 2 批：shima-ugata 25 家（2026-10-19）

### 結果
- 收錄 **24 筆**（ugata）：鯛、長太屋、おとや、磯っ子、大家族、まぶしのいちや、伊鈴屋、東山物産、銀鱗、みやぎ野、宮本、京城、うえむら、LA PIZZICA、ノルポル、ろっぽん木、しまかぜ食堂、グリルエドイチ、とばり、みやま亭、わさび、Michelle、shucafe、プロヴァンス（`shima-provence-dining`）。
- **pending 2**：プロヴァンス 收錄（F3，觀光協會的非住客晚餐）；フィオーレ志摩 排除（官網只剩不定期カフェ）。
- fit15：yes 13、split 3、unknown 8（README）。照片：官網 9 張（photo-check 200）＋Google 主圖，東山物産 0 張（官網維護中、Google 主圖抓不到）。
- 第一晚（2/2）晚餐的結論寫在 README「第一晚（2/2 週二）的晚餐」。

### 步驟
1. `candidates.mjs export --keys … --ids …` → `t9d-2/batch.json`（25 家；住宿附設 `shima-provence-dining`、`shima-nocturne-no-mori-dining`）。
2. **食べログ（Chrome）**：`tabelog-info --store`，店家頁 25＋コース頁 6（長太屋、LA PIZZICA、ろっぽん木、いちや、ノルポル、プロヴァンス）＝ browser_batch 5 次。沒有 Cloudflare 畫面。
3. **讀文 subagent 5 個**（背景，`t9d-2/prompt-common.md`：「這一批的重點」是第一晚的晚餐時間、L.O.、週二營業、團體）：5 家 × 5。25 份筆記。官網是 Shift_JIS 的（鯛、おとや、磯っ子 Q&A）WebFetch 會亂碼：B 用 curl＋iconv 讀了磯っ子 Q&A；A 只辨識出部分。
4. **Google Maps**：`google-place --google --store`，browser_batch 4 次＋截圖點選 1 次（長太屋：列表有「松阪牛肉亭 長太屋」和肉店「松阪牛の長太屋」）。プロヴァンス 搜到地址型地點，用住宿本體（lodgingId）。
5. `candidates.mjs set`（`cand-status.json`）→ `photo-check` → `build-restaurants draft` → `judgement-src.mjs` → `build --candidates`（先 `--dry-run`）。validate 通過，commit。
6. **口コミ・評論**（對象 18 家：fit15 yes／split 16＋食べログ 3.40 以上的 東山物産、宮本；Google 4.3／100 以上的都已在內）：tabelog-reviews（最新 20＋關鍵字）browser_batch 9 次、google-reviews（低分順＋第一晚候選的搜尋）9 次，截圖 0、逾時 0（一個 batch 8～14 個動作）。重點寫 `t9d-2/notes/` → `notes-to-json.mjs` → `dossier-merge.mjs`；回填 `patch-r-src.mjs` → `patch-r.json` → `apply-patch.mjs`（先 `--dry-run`）。
7. 結束：www.google.com、tabelog.com 的 `__th_*` localStorage 都 removeItem（確認 0 筆），關掉分頁。沒有遇到驗證碼、登入、封鎖、對話框。

### 口コミ・評論的讀法
- 食べログ：最新 20＋「中止」「冬」，再依缺口加詞：kids unknown →「子供」（大家族、LA PIZZICA、伊鈴屋、うえむら、みやぎ野）、seating 空 →「座敷」（磯っ子）、團體 →「団体」「宴会」（鯛、長太屋、うえむら）、定休有衝突 →「火曜」（とばり）、晚上營業 →「夜」（伊鈴屋）、非住客 →「日帰り」（プロヴァンス）。
- Google：低分順 10 則；第一晚候選加搜尋（鯛「階段」、長太屋・大家族「団体」、プロヴァンス 是住宿本體只搜「ディナー」）。評論少的店低分順包含 3～4 星（みやぎ野 最低 2 星）。
- 發現：LA PIZZICA 2026/01 移轉（讀文的「神明1506-1」是舊址）；大家族 依預算おまかせ＋兒童 1,000 円；東山物産 只能預約鰻魚；伊鈴屋 晚上有營業；グリルエドイチ 在陡坡上；磯っ子 2F 全座敷；おとや 沒標價、結帳高。

### WebSearch
- 主 session 0 次；讀文 subagent 9 次（A 1、B 3、C 1、D 1、E 3）。搜尋都有回應（わさび、shucafe、うえむら、いちや 沒找到店家頁），沒有額度用完的跡象。

### 給下一批
- 第 3 批（isobe＋matoya＋anori＋kokufu 21＋pending 5）照這批的步驟；`t9d-2/judgement-src.mjs`、`patch-r-src.mjs`、`dp-add.mjs` 可以照抄改內容。
- `google-reviews` 一次跑 3 家的 open＋lowest（12 個動作）沒問題；食べログ口コミ 7 頁一個 batch 也沒逾時。

## 第 3 批：shima-isobe＋matoya＋anori＋kokufu 21 家（2026-10-19）

### 結果
- 收錄 **19 筆**（isobe 4、matoya 8、anori 4、kokufu 3）：はま崎、川うめ、中六、まんぷく食堂 板橋、的矢かきテラス、いかだ荘 山上、橘、福寿荘、丸定旅館、はしもと、別亭 まとや、まるせい、ひさだ、丸寅、灯台カフェ、シェブロンカフェ、BALI HOUSE、鮨暁、まつむら。
- **pending 5**：收錄 4（F3）——いかだ荘 山上（官網 FAQ）、橘（官網各套餐可只用餐預約）、丸定旅館（官網お食事プラン 1 日 3 組 10 名）、福寿荘（團體昼食プラン）；排除 はいふう（官網沒有只用餐方案）。
- **included → excluded 1**：ポンチーズ・ピザ（Google「閉業」、官網 404）。ひさだ、丸寅 的非住客午餐在官網確認（criteria 加 F3）。
- fit15：yes 6、split 4、no 1、unknown 8。照片：官網 9 張＋住宿的官網照片（photo-check 10 張全部 200；別亭 まとや 的「【AI】」外觀圖不用）＋Google 主圖。
- matoya 週二午餐的結論寫在 README「的矢湾（matoya）週二」。

### 步驟
1. `candidates.mjs export --keys … --ids …` → `t9d-3/batch.json`（21 家；住宿附設 `<住宿 id>-dining` 5 家，別亭 まとや 用自己的 id＋`lodgingId: shima-grand-mercure`）。排除的 2 家從 batch 拿掉後才 draft（原檔 `batch.all.json`）。
2. **食べログ（Chrome）**：`tabelog-info --store`，店家頁 21＋コース頁 5（まるせい、川うめ、いかだ荘、かきテラス、丸定）＝ browser_batch 5 次。沒有 Cloudflare 畫面。橘 的備考有「￥」被抓成反斜線，手改 tabelog.jsonl（heredoc 裡的反斜線會被吃掉，改用 `String.fromCharCode(92)`）。
3. **讀文 subagent 5 個**（背景，`t9d-3/prompt-common.md`：重點是住宿附設的非住客用餐（facts `nonGuestDining`）、週二午餐、團體、交通）：3＋3＋5＋5＋5 家，21 份筆記（含排除的 2 家）。ひさだ、丸寅 官網是 Shift_JIS，用 Node fetch＋TextDecoder 讀；Grand Mercure 官網 Node fetch 403，改 WebFetch。D 用 curl 下載灯台カフェ 的菜單圖到 scratchpad 讀（decisions-pending）。
4. **Google Maps**：`google-place --google --store`，browser_batch 4 次＋BALI HOUSE 列表重搜 1 次（「バリハウス 国府3003」直接命中）。住宿附設 5 家借住宿本體（lodgingId）。**5 家被標 `closed-or-temporary`**，用 JS 看面板文字確認：まるせい、かきテラス、鮨暁 是貼文・訪問者情報裡的「臨時休業」（誤判），ポンチーズ「閉業」、はしもと「臨時休業」是真的 → 修 `google-place.js`（只看「概要」之前的面板開頭，加測試），google.jsonl 手改。
5. `candidates.mjs set`（`cand-status.json`）→ `photo-check` → `build-restaurants draft` → `judgement-src.mjs` → `build --candidates`（先 `--dry-run`）。validate 通過，commit。之後 `cand-criteria.json`（ひさだ、丸寅、別亭 加 F3）。
6. **口コミ・評論**（`review-targets.mjs shima` → 13 家：fit15 yes／split 10＋Google 4.3／100 以上的 中六、はしもと、丸定）：tabelog-reviews browser_batch 5 次（一次 5～8 頁）、google-reviews 6 次（低分順 3 家一批；住宿本體 4 家只搜「ランチ」「昼食」；福寿荘 第一次把「昼食」打成別字，重跑 1 次）。はしもと 加跑 `newest`（看最新評論日期）。截圖 0、逾時 0。重點寫 `t9d-3/notes/` → `notes-to-json.mjs` → `dossier-merge.mjs`；回填 `patch-r-src.mjs` → `patch-r.json` → `apply-patch.mjs`（先 `--dry-run`）；いかだ荘 hours 另外 `patch-h.json`（照食べログ原文）。
7. 結束：www.google.com、tabelog.com 的 `__th_*` localStorage 都 removeItem（確認 0 筆），關掉分頁。沒有遇到驗證碼、登入、封鎖、對話框。

### 口コミ・評論的讀法
- 食べログ：最新 20＋「中止」「冬」，依缺口加「子供」（中六、橘、まるせい、鮨暁）、「団体」（かきテラス）、「椅子」（川うめ，0 則）；住宿本體 福寿荘 搜「ランチ」「昼食」；口コミ 25 則以下的（はま崎、丸定、はしもと）只讀全部／最新 20。まつむら 只讀最新 20（漏搜「子供」「団体」）。
- Google：低分順 10 則（9 家）；住宿本體（いかだ荘、橘、福寿荘、丸定）只搜「ランチ」（福寿荘 加「昼食」0 則）。
- 發現：**的矢かきテラス、いかだ荘 2026/01～02 生牡蠣停止供應**（ノロ・食中毒對策，多則）、かきテラス 吃完腹痛 1 星 3 則；はしもと「只在牡蠣季營業」（Google 臨時休業＝季節外）；丸定 牡蠣季以外沒有午餐；福寿荘 ランチ＋溫泉 3,800～5,000 円（約 2024）、「かいげつ」是玄關外的獨立店；はま崎 Google 有菸灰缸・菸味；まつむら 是洋食店；中六 只開 2 小時、排隊 15～50 分。

### WebSearch
- 主 session 0 次；讀文 subagent 9 次（A 1、B 3、C 1、D 1、E 3）。搜尋都有回應（はしもと、ポンチーズ、まつむら、シェブロン、はいふう、別亭 沒找到新事實），沒有額度用完的跡象。

### 給下一批
- 第 4 批（daio＋tomoyama＋goza＋wagu＋other 17＋pending 2：槙之木、志摩半島）照這批的步驟；`t9d-3/judgement-src.mjs`、`patch-r-src.mjs`、`dp-add.mjs` 可以照抄改內容。
- 新的 `google-place.js` 存進 localStorage 前要用 `--store`（舊程式還在其他瀏覽器分頁的話不影響，這批已清掉）。
- 海女小屋（磯人、海女の庭、火場）、大万 的營業・預約・人數是重點；牡蠣、生食的 2 月狀況看口コミ「中止」。

## 第 4 批：shima-daio＋tomoyama＋goza＋wagu＋other 17 家（2026-10-19）

### 結果
- 收錄 **13 筆**（daio 4、tomoyama 3、goza 1、wagu 2、kashikojima 1、other 2）：田中料理店、しまや、Cafe.C.C、大万、はまなぎ、どんぐり、槙之木、海女小屋 磯人、鮨裕禅、海女小屋 火場 広の浜、ひでちゃん、庄助、居酒屋きゅう。
- **pending 2**：槙之木 收錄（F3，官網 MENU 只用餐可）；志摩半島 排除（官網、楽天 只有住宿方案）。
- **included → excluded 3**：十次郎（Google「閉業」）、縁（Google「臨時休業」，評論：2025-08-16 起設備故障休止）、海女の庭（Google「臨時休業」，官網改成船接送的包場設施）。
- 鮨裕禅 在間崎島 → 子地區 kashikojima、`access: ferry`（候選 region 也改）。
- fit15：yes 1、split 7、no 2、unknown 3（README）。照片：官網 6 張（photo-check 200）＋Google 主圖。
- 南部的結論寫在 README「南部（daio・tomoyama・goza・wagu）的午餐、晚餐」。

### 步驟
1. `candidates.mjs export --keys … --ids …` → `t9d-4/batch.json`（17 家；住宿附設的 はまなぎ 用自己的 id＋`extra.lodgingId: shima-aqua-forest`，志摩半島 `shima-shimahanto-dining`，槙之木、大万 的住宿不是資料點，用自己的 id）。排除的 4 家從 batch 拿掉後才 draft（原檔 `batch.all.json`）。
2. **食べログ（Chrome）**：`tabelog-info --store`，店家頁 17＋コース頁 1（海女の庭）＝ browser_batch 3 次。沒有 Cloudflare 畫面。Cafe.C.C 的店名被 Claude in Chrome 擋成「[BLOCKED: JWT token]」，tabelog.jsonl 手改。
3. **讀文 subagent 5 個**（背景，`t9d-4/prompt-common.md`：重點是住宿附設的非住客用餐、海女小屋的營業・預約・人數、goza・daio 的晚餐、週二午餐）：4＋3＋3＋3＋4 家，17 份筆記。大万 官網是 Shift_JIS（Node＋TextDecoder）；志摩半島 官網其實是 UTF-8；しまや 官網 WebFetch 502、改 Node；磯人 官網憑證錯誤讀不到（沒有繞過）；海女の庭 的食べログ HP（ama-iseshima.com）DNS 不存在。
4. **Google Maps**：`google-place --google --store`，browser_batch 3 次（+ 大万 另搜 1 次：食事處有自己的地點）。志摩半島 不搜（排除）。**3 家 closed**：十次郎 `permanently-closed`、海女の庭・縁 `temporarily-closed` → JS 讀面板開頭確認（「閉業」「臨時休業」），縁・海女の庭 再跑 `open`＋`newest`（海女の庭 是 `extract`）看最新評論；主 session 用 Node fetch 讀了海女の庭 的新官網 amanoniwa.jp（Google 網站欄）。
5. `candidates.mjs set`（`cand-status.json`：pending 2、excluded 3、criteria 加 F3 3 家、鮨裕禅 region）→ `photo-check` → `build-restaurants draft` → `judgement-src.mjs` → `build --candidates`（先 `--dry-run`）。validate 通過，commit。
6. **口コミ・評論**（`review-targets.mjs shima` → 8 家：fit15 split／yes 的 田中、しまや、Cafe.C.C、大万、槙之木、火場、ひでちゃん、庄助；加 goza 唯一午餐的 磯人）：tabelog-reviews browser_batch 4 次、google-reviews 4 次（＋確認休業的 2 次），截圖 0、逾時 0。重點寫 `t9d-4/notes/` → `notes-to-json.mjs` → `dossier-merge.mjs`；回填 `patch-r-src.mjs` → `patch-r.json` → `apply-patch.mjs`（`recordOld: false`，先 `--dry-run`）。
7. 結束：www.google.com、tabelog.com 的 `__th_*` localStorage 都 removeItem（確認 0 筆），關掉分頁。沒有遇到驗證碼、登入、封鎖、對話框。

### 口コミ・評論的讀法
- 食べログ：最新 20＋「中止」「冬」，依缺口加「子供」（田中、しまや、ひでちゃん）、「団体」「座敷」（田中、ひでちゃん）、「予約」（ひでちゃん）；口コミ 3 則以下的（槙之木、火場、庄助）只讀全部——全部是 2009～2020，5 年以上不採用。大万 食べログ 0 則。
- Google：低分順 10 則（7 家）；大万（9 則）`extract`＋`lowest` 都跑；槙之木 是飯店本體，只搜「ランチ」「料理」；Cafe.C.C 加 `newest`（官網過期，確認營業）；磯人 只跑 `newest`。
- 發現：ひでちゃん 刺身定食每天限量、預約客優先；火場 2026-01-14 冬季平日有營業；田中料理店 中午滿席、沒預約被拒；Cafe.C.C 週日營業時間三種說法；槙之木 路窄。

### WebSearch
- 主 session 0 次；讀文 subagent 10 次（A 1、B 0、C 2、D 3、E 4）。搜尋都有回應（十次郎 找到ホットペッパー、庄助 找到ヒトサラ；縁、どんぐり、きゅう、ひでちゃん、鮨裕禅、磯人、海女の庭 沒找到新事實），沒有額度用完的跡象。

### 給下一批
- 第 5 批（hamajima＋sakko 13＋pending 4：ニュー浜島、大江戸温泉 伊勢志摩、アマネム、志摩地中海村）照這批的步驟；`t9d-4/judgement-src.mjs`、`patch-r-src.mjs`、`dp-add.mjs` 可以照抄改內容。
- Google `closed` 出現時用 JS 讀面板開頭、跑 `newest` 看最新評論日期，再看官網（這批 3 家都是這樣確認的）。

## 第 5 批：shima-hamajima＋sakko 13 家（2026-10-19）

### 結果
- 收錄 **9 筆**（hamajima 6、sakko 3）：網元の店八代、味幸、磯料理ヨット、西口屋、坂のうえ、大江戸 伊勢志摩（`shima-oedo-iseshima-dining`）、RIAS by Kokotxa、タベルナ・アスール、アマネムダイニング。
- **pending 4**：大江戸 收錄（F3，官網 入浴付ディナーバイキング）；ニュー浜島（官網只有住宿附晚餐）、志摩地中海村 本體（村的總條目，和 RIAS・カフェ アミーゴ 重複）、アマネム 本體（インルームダイニング）排除。
- **included → excluded 1**：里海（NEMU，官網沒有非住客用餐）。アマネムダイニング 以一休レストラン的公開預約頁當 F3（主 session 用 Chrome 讀，讀文 subagent 的 WebFetch 403）。
- fit15：yes 2（坂のうえ、アスール）、split 2（味幸、アマネムダイニング）、no 1（西口屋）、unknown 4（八代、ヨット、RIAS、大江戸）。照片：官網 4 張（photo-check 6 張全部 200）＋Google 主圖。

### 步驟
1. `candidates.mjs export --keys … --ids …` → `t9d-5/batch.json`（13 家）；排除的 4 家從 batch 拿掉後才 draft（原檔 `batch.all.json`）。
2. **食べログ（Chrome）**：`tabelog-info --store`，店家頁 13＝browser_batch 3 次（コース頁 0：沒有 party 分頁）。沒有 Cloudflare 畫面。
3. **讀文 subagent 5 個**（背景，`t9d-5/prompt-common.md`：重點是住宿附設的非住客用餐、hamajima 2/3・2/4・2/10 的營業、sakko 的晚餐）：3＋3＋2＋3＋2 家，13 份筆記。
4. **Google Maps**：`google-place --google --store`，browser_batch 2 次＋アマネム 列表 JS 點選 1 次（「アマネムダイニング／アマネム」4.5／15、「アマネム」4.5／461）。里海 搜到 NEMU 本體。
5. 一休レストラン アマネムダイニング 店頁 用 Chrome navigate＋JS 讀文字 3 次（營業時間、席數、年齡限制、預約注意）。
6. `candidates.mjs set`（`cand-status.json`）→ `photo-check` → `build-restaurants draft` → `judgement-src.mjs` → `build --candidates`（先 `--dry-run`）。validate 第一次 1 個錯誤（西口屋 `price.lunch` 寫 [null, 999]）→ 改 null 重 build。commit。
7. **口コミ・評論**（`review-targets.mjs shima` → 6 家＋hamajima 週三唯一午餐的 ヨット）：tabelog-reviews browser_batch 3 次（一次 7～9 頁）、google-reviews 3 次（open＋lowest 2～3 家一批；アマネムダイニング 15 則 `extract`＋`lowest` 都跑），截圖 0、逾時 0。重點寫 `t9d-5/notes/` → **新的 `scripts/dossier-merge.mjs`**；回填 `patch-r-src.mjs` → `patch-r.json` → `apply-patch.mjs`（`recordOld: false`，先 `--dry-run`）。アマネムダイニング 的 `contexts` 改只有 lunch（judgement 改後重 build，在 apply-patch 之前）。
8. 結束：www.google.com、tabelog.com 的 `__th_*` localStorage 都 removeItem（確認 0 筆），關掉分頁。沒有遇到驗證碼、登入、封鎖、對話框。清 google.com 時回傳的主機名被擋成「[BLOCKED: JWT token]」（只是確認用，0 筆已確認）。

### 口コミ・評論的讀法
- 食べログ：最新 20＋「中止」「冬」，依缺口加「待ち」（八代、ヨット）、「団体」（八代、RIAS）、「平日」（坂のうえ：營業日衝突）、「ランチ」（アスール、アマネム：非住客午餐）、「子供」（アスール、アマネム）、「階段」（RIAS、アスール）；味幸 只有 9 則全讀。
- Google：低分順 10 則（6 家）；アマネムダイニング 全 15 則。
- 發現：**坂のうえ 午餐只有週六日**（食べログ店舗情報＋口コミ 3 則，觀光協會「月休」是舊的）→ hamajima 平日的備案少一家；八代 假日等 1～3 小時；ヨット「伊勢海老 已經不做」1 則（要確認）；アマネム 住客帶小孩的口コミ vs 一休 12 歲以上；RIAS 冬季午晚都有營業。

### WebSearch
- 主 session 0 次；讀文 subagent 9 次（A 2、B 3、C 2、D 0、E 2）。搜尋都有回應（坂のうえ、西口屋、ニュー浜島 沒找到新事實），沒有額度用完的跡象。

## 總結（T9d 完成，2026-10-19）

| 批 | 子地區 | 家數（含 pending） | 收錄 | pending 收錄／排除 | included→excluded | 口コミ・評論 | WebSearch（subagent） |
|---|---|---|---|---|---|---|---|
| 1 | kashikojima＋yokoyama | 16（7） | 13 | 4／3 | 0 | 12 | 6 |
| 2 | ugata | 25（2） | 24 | 1／1 | 0 | 18 | 9 |
| 3 | isobe＋matoya＋anori＋kokufu | 21（5） | 19 | 4／1 | 1 | 13 | 9 |
| 4 | daio＋tomoyama＋goza＋wagu＋other | 17（2） | 13 | 1／1 | 3 | 9 | 10 |
| 5 | hamajima＋sakko | 13（4） | 9 | 1／3 | 1 | 7 | 9 |
| **合計** | | **92（20）** | **78** | **11／9** | **5** | **59** | **43**（主 session 0） |

- fit15（78 筆）：yes 28、split 18、no 5、unknown 27。`detailPending` 0、validate 錯誤 0・警告 0、npm test 全過。
- Chrome（各批步驟的合計）：tabelog-info browser_batch 20 次（4＋5＋5＋3＋3）、google-place 17 次（4＋4＋4＋3＋2）＋列表重搜・點選 5 次、口コミ・評論 約 59 次（13＋18＋12＋10＋6）；截圖點選 2 次（第 1、2 批）；驗證碼・登入・封鎖 0。
- 工具的修改：第 3 批 `google-place.js` 的 closed 判斷（只看面板開頭）；第 5 批 `scripts/dossier-merge.mjs`（＋lib、測試）取代各批複製的 notes-to-json／dossier-merge。CONVENTIONS「口コミ、Google 評論」加了 JWT 誤擋、來源清單格式的「已確認」。
- 結論在 README「餐廳」的 T9d 各節（全員能吃的店、每天的家數、0 家的日子、第一晚、各區重點、給 T9e・T9f 的提醒）。
