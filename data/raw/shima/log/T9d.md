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
