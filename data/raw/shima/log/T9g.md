# T9g 志摩：檢討待確認的決定、深入調查、補丁式重新打分

subagent 共用指令放在 `data/cache/work/t9g/prompt-common.md`（不進 git；內容照 `data/raw/ise/log/T8g.md` 的做法，重點：只追加、保留換行、用 Edit 追加、5 年以上不寫、搜尋摘要不算來源、推論不寫成事實、每筆 WebSearch 2～3 次）。

## 2026-10-20 檢討（Claude 照建議，👤 授權）
「👤 建議先看」志摩 67 項全部打勾，決定記在 `docs/decisions-pending.md` 表格最後 43 列（T9g）。
- **照 T7j、T8g 的各區共用規則**：
  - 空值：不完整的值只有 1 則來源的改回（とばり `seating` counter、鯛 去掉 horigotatsu）；とばり elderFit 4 → 3。
  - 吸菸：志摩本來就沒扣，不用改。
  - 負評往下調一級：78 家的 [缺點] 全部檢查，照伊勢實際的判法（同一主題、近 3 年明確 3 則以上）→ 長太屋、的矢かきテラス 4 → 3；大家族、まぶしのいちや、川うめ 3 → 2。鯛、八代、ミラドール 的「多則」期間從 2021 年起，不算。
  - 介紹來源：觀光協會「食べる」是會員名錄 → 中六 第 2 條不成立再負評往下調 4 → 2；京城 3 → 2。
  - F③ fit15：いかだ荘 山上、橘 yes → unknown、groupFit 5 → 3。
  - 住宿 groupFit 4 不要求宴會場：11 間 3 → 4。電梯來源：志摩的 2 間都有原文，維持。
  - 景點 kidsFit：サミエール、Entrada、伊雑宮 null → 3，大王美術ギャラリー null → 2。
  - 餐廳 localFlavor、elderFit（車椅子で入店可）：不用改。
- **其他項目**：維持 T9a～T9f 的決定（理由各列）；改的只有：景點 winterFit「2 月營業沒明寫 → 2」改成和鳥羽一致（4 筆 2 → 3／4）、とばり groupFit 5 → 4。
- **新規則**：CONVENTIONS「判斷細則」3 條（2 月營業沒來源先收、小孩不能住的住宿排除、F③ 的依據來源）、§5.1 4 條（負評往下調的認定、景點 winterFit、景點 accessEase 計程車、住宿 accessEase 步行分鐘）；assessment-notes 同步，另補 宝生苑 團體頁、楽天施設情報的電梯、F③ confidence。
- 結果：餐廳 A 以上 14 → 11／78＝14%（長太屋、的矢かきテラス、中六 降 B），照原門檻、不放寬。`node scripts/assessment-check.mjs shima` 列出 5 項（ベイサイドテラス F③、大家族、まぶしのいちや、中六 負評往下調、丸定 缺口保底），理由都寫在 rationale，維持。

## 深入調查名單（平衡版，👤 授權由 Claude 判斷）
照任務卡條件（住宿 S・A 而且 groupFit 4 以上；餐廳 S・A 加上 groupFit 5；景點 S 加上 confidence low 的 A；筆記都沒有 `[blog]`）共 29 筆：住宿 5、餐廳 23、景點 1（A 的 4 個景點 confidence 都是 medium）。
- **照規則版**（recommend → groupFit 取前 25）：1～17 名（S、A）全收，groupFit 5 的 B 10 家（recommend 3）只排得進 8 家，同分的 福寿荘、火場 広の浜 和 recommend 2 的 おとや、川うめ 排不到。
- **平衡版**（採用）：換掉 **ラ・メール ザ クラシック**（2027-01-23～03-04 改裝休業，整段旅程不能用）和 **ミラドール志摩**（外帶咖啡，口コミ說是為了景色；横山展望台 已在名單、讀到的心得會一起涵蓋），補回 groupFit 5 的 **福寿荘**（渡鹿野島 團體午餐、接送＋渡船）、**火場 広の浜**（和具 唯一能包場 24 人的海女小屋）。換掉的 2 家和 おとや、川うめ 留給第二輪。
- 結果 25 筆：住宿 5、景點 1、餐廳 19（A 9、groupFit 5 的 B 10）。

| # | id | 類型 | tier | 選入的條件 |
|---|---|---|---|---|
| 1 | shima-yokoyama-observatory | 景點 | S | S |
| 2 | shima-kanko-classic | 住宿 | S | S、groupFit 4 |
| 3 | shima-haifu | 住宿 | S | S、groupFit 4（T9g 改） |
| 4 | shima-kanko-bay-suites | 住宿 | S | S、groupFit 4（T9g 改） |
| 5 | shima-miyako-bayside-terrace | 住宿 | A | A、groupFit 4 |
| 6 | shima-nemu-resort | 住宿 | A | A、groupFit 4 |
| 7 | shima-la-mer | 餐廳 | A | A、groupFit 5 |
| 8 | shima-miyako-bayside-terrace-dining | 餐廳 | A | A、groupFit 5 |
| 9 | shima-tai | 餐廳 | A | A、groupFit 5 |
| 10 | shima-iwajin-kissa | 餐廳 | A | A |
| 11 | shima-hoseien-dining | 餐廳 | A | A |
| 12 | shima-ikadaso-sanjo-dining | 餐廳 | A | A |
| 13 | shima-miyamoto | 餐廳 | A | A |
| 14 | shima-higashiyama-bussan | 餐廳 | A | A |
| 15 | shima-amimoto-yashiro | 餐廳 | A | A |
| 16 | shima-hamayu | 餐廳 | B | groupFit 5 |
| 17 | shima-kashikojima-cc-restaurant | 餐廳 | B | groupFit 5 |
| 18 | shima-marena-french | 餐廳 | B | groupFit 5 |
| 19 | shima-isokko | 餐廳 | B | groupFit 5 |
| 20 | shima-la-pizzica | 餐廳 | B | groupFit 5 |
| 21 | shima-roppongi | 餐廳 | B | groupFit 5 |
| 22 | shima-yakiniku-uemura | 餐廳 | B | groupFit 5 |
| 23 | shima-marusei | 餐廳 | B | groupFit 5 |
| 24 | shima-fukujuso-dining | 餐廳 | B | groupFit 5（平衡版補回） |
| 23 | shima-marusei | 3 | 0（0／0；Retty 店舗頁 1（口コミ 11 則都在 2020 以前，不寫）；ANA travel&life ECONNRESET） | 小：Retty「個室：無」vs 官網 18 名宴會（衝突） |
| 24 | shima-fukujuso-dining | 3 | 0（0／0；伊勢志摩観光ナビ 英文頁 1（日期不明）；4travel 2015/01 不寫） | 無（午餐時段、電話號碼衝突；渡船 大人 150／兒童 80 円） |
| 25 | shima-amagoya-hiba-hironohama | 餐廳 | B | groupFit 5（平衡版補回） |

## 每筆的搜尋次數和篇數（2026-10-20）
同時跑的 subagent 最多 5 個，一個完成才開下一個（一次收回幾筆就補開幾筆，不超過 5 個）。「篇數」是寫進筆記、近 5 年、讀到原文的部落格和口コミ站（媒體、觀光網站另外寫在括號）。

| # | id | WebSearch | 篇數（日／中） | 影響評分的新資訊 |
|---|---|---|---|---|
| 1 | shima-yokoyama-observatory | 3 | 0（0／0；媒體 2：JEEPE 中文（日期不明、聯盟連結）、なっぷマガジン（2026-10，AI 輔助）；tabi-mag、co-trip 403） | 無（冬季防風、P1 上坡 15 分，都是一般提醒） |
| 2 | shima-kanko-classic | 3 | 1（1／0：4travel 口コミ 2025/11～2026/03；観光三重 採訪 2021-03 超過 5 年不寫） | 小：浴室是ユニットバス、2025/11 晚餐服務・料理評價偏低（1 則） |
| 3 | shima-haifu | 3 | 0（0／0；4travel 口コミ 1 則 2025/01；長輩上下船、帶嬰兒、冬季、3 室同住的口コミ都在 2014～2017，超過 5 年不寫；gpoint 403） | 小：天花板水漬（cons 參考） |
| 4 | shima-kanko-bay-suites | 3 | 2（2／0：BAILA 宿泊記 2026/07、4travel 口コミ 2023/07～2026/03） | 有：宿泊記寫「部屋までのエレベータ」→ 電梯有來源；到 ザ クラシック 的距離、清潔、晚餐降級的負評 |
| 5 | shima-miyako-bayside-terrace | 3 | 0（0／0；媒體 観光三重 取材レポート 1，日期不明；観光三重 report/803 2021-03 超過 5 年不寫；icotto 403） | 無 |
| 6 | shima-nemu-resort | 3 | 0（0／0；媒體 2：トラベル Watch 改裝發表 2025/11、観光三重 2022/10（改裝前）；icotto 403） | 小：和室 31 室改成有床、2 臥室 Villa、キッズスペース（改裝發表，不是住宿心得）；Villa 面積、接駁預約期限衝突 |
| 7 | shima-la-mer | 3 | 0（0／0；ameblo 朝食 約 2018、precious 2020 是 クラシック 的商品，超過 5 年；co-trip 403、楽天 逾時） | 無 |
| 8 | shima-miyako-bayside-terrace-dining | 3 | 0（0／0；観光三重 report/803 2021-03 超過 5 年、report/1469 是改裝前舊店名的法式晚餐，不寫） | 無 |
| 9 | shima-tai | 3 | 0（0／0；搜尋結果都是別地區的同名店，hamoni 是名古屋的店） | 無（每月休的週二仍沒有來源） |
| 10 | shima-iwajin-kissa | 3 | 1（1／0：4travel 口コミ 2022/01、2022/04（3～5 年前）；Retty 2021/05 以前不寫） | 無（あこや貝柱パスタ「冬季だけ」vs 官網常設，衝突） |
| 11 | shima-hoseien-dining | 3 | 0（0／0；搜尋結果只有訂房頁、PR 文、Retty 店家頁（午餐口コミ 0）） | 無 |
| 12 | shima-ikadaso-sanjo-dining | 3 | 0（0／0；媒體 まっぷる 2023/10 1 篇；其他是ヒトサラ、ホットペッパー 等介紹站） | 無 |
| 13 | shima-miyamoto | 3 | 2（2／0：YAMAP 活動日記 2025/11、Retty 口コミ 2023/07・2025/05；另 なっぷマガジン（AI 生成）；4travel 2013～2018 不寫） | 小：觀光客點咖哩、ドリア，份量大；創業年衝突（AI 文章，不採） |
| 14 | shima-higashiyama-bussan | 3 | 1（1／0：ホットペッパー 口コミ 2026/02～06；媒體 ねとらぼ 排名 2025/02；co-trip 3 篇 403） | 有：最大宴會 25 人、無個室、お子様連れ歓迎（ホットペッパー）；前一天預留鰻魚、當天約 10 分入店（2026/03）；席數衝突 |
| 15 | shima-amimoto-yashiro | 3 | 0（0／0；媒體 るるぶ&more 1（日期不明）；「八代」搜尋多是熊本縣八代市） | 小：巴士「朝日山」站步行 5 分；停車場台數、大漁丼價格衝突 |
| 16 | shima-hamayu | 3 | 0（0／0；媒體 観光三重 伊勢海老づくし会席 頁（期間 2026/10～2027/02）；Retty 2021/04 以前不寫） | 無（預約截止 前日 18:00 vs TableCheck 當天 12:00，衝突） |
| 17 | shima-kashikojima-cc-restaurant | 3 | 1（1／0：じゃらんゴルフ 口コミ 8 則 2022/10～2026/01，都是打球客；GDO 403） | 小：冬季有供餐（2023/12、2026/01）、量偏少、不吃海鮮的選擇少；非打球客、營業時間仍沒有來源 |
| 18 | shima-marena-french | 3 | 0（0／0；媒體 観光三重 取材 1（改名前「アッシュ・ドール」，照片 2023/04）；4travel 2009～2013 不寫；co-trip 403） | 無（ハーモニー 12,000 → 官網 14,000 円，衝突） |
| 19 | shima-isokko | 3 | 0（0／0；結果多是橫濱磯子區等無關內容；jalan 亂碼） | 無 |
| 20 | shima-la-pizzica | 3 | 0（0／0；只有旅色、食べログ列表頁；drivejapan 轉到首頁讀不到） | 無 |
| 21 | shima-roppongi | 3 | 1（1／0：ホットペッパー 店舗頁 2023/06 更新；結果多是東京「鵜の木」等無關） | 有：桌席只有 6 名×2，其他是小上がり座敷、無個室、沒有無障礙設備；お子様連れ歓迎；宴會最大 32 人（官網 40，衝突） |
| 22 | shima-yakiniku-uemura | 3 | 0（0／0；結果是別家燒肉店和食べログ一覽） | 無 |
| 25 | shima-amagoya-hiba-hironohama | 3 | 0（0／0；結果都是鳥羽 はちまんかまど、さとうみ庵 等別的設施） | 無 |

合計 25 筆、**WebSearch 75 次**（每筆 3 次）。有內容的部落格・口コミ站 8 筆共 10 篇（日 10、中 0）：ベイスイート 2、宮本 2、クラシック、イワジン、東山物産、賢島カンツリー、ろっぽん木、はいふう 各 1；17 筆 0 篇。中文心得一篇都沒有（志摩的店名搜中文只有訂房網、攜程的飯店頁）。另外記了媒體、觀光網站 12 篇（観光三重、るるぶ&more、まっぷる、トラベル Watch、JEEPE 中文 等）。
- 5 年以上（2021-10 以前）沒寫的心得很多：はいふう 的長輩上下船・帶嬰兒・3 室同住（2014～2017）、まるせい Retty 11 則（2020 以前）、宮本 4travel（2013～2018）、マレナ 4travel（2009～2013）。
- 讀不到原文的：co-trip（6 篇）、icotto、tabi-mag、gpoint、GDO 403；ANA travel&life ECONNRESET；drivejapan 轉首頁；jalan 亂碼。只有搜尋摘要的內容一律沒寫。
- 抽查：每筆收回後看 `git diff`，全部只有追加（25 檔 +108／−0）、CRLF 保留。subagent 自己的推論寫進筆記的有 1 處，主 session 刪掉：宮本「（伊勢市時期另計？）」。NEMU「Villa 面積可能是室內／含露台的差別」寫在「衝突、待確認」、有標「要確認」，保留。subagent 回覆裡的推測（ベイスイート 客層偏大人、ろっぽん木 長輩要坐座敷、福寿荘 的電話可能是はいふう）沒有寫成事實。
- 網頁裡要模型做事的文字：25 筆都沒有遇到。

## 重新打分（2026-10-20）
只動有新資訊的 6 筆：
- **ベイスイート `elderFit` 3 → 4**：BAILA 宿泊記（2026/07）寫「部屋までのエレベータ」，`accessibility.elevator` null → true（null 才填，source 加 blog-ja）；但餐廳、大浴場在另一棟 ザ クラシック，口コミ說冷天雨天走過去辛苦 → 4 不是 5。cons 加距離、清潔、晚餐的意見。recommend 5、confidence medium 維持（楽天 301 則，不到 high 的 1,000 則）。
- 只改 summary、理由、conflicts：クラシック（ユニットバス、2025/11 晚餐評價 1 則）、NEMU（改裝後和室改成有床、2 臥室 Villa、キッズスペース；elderFit 3 維持，電梯仍沒有來源）、ろっぽん木（ホットペッパー 6 人桌 2 張只有 1 個來源，seating 不補、elderFit 3 維持；席數、宴會人數衝突）、東山物産（最大宴會 25 人但貸切不可、無個室，groupFit 1 維持）、まるせい（Retty「個室：無」vs 官網 18 名宴會，groupFit 5 維持、questions 已有電話確認）。
- 有新資訊但不影響分數的（維持）：宮本（觀光客點咖哩、ドリア；confidence 合計 465 則仍 medium）、賢島カンツリー（冬季有供餐，非打球客、營業時間仍沒有來源）、はいふう（天花板水漬 1 則）、横山展望台（冬季防風、P1 上坡 15 分）、八代（巴士站、停車場衝突）、浜木綿・マレナ・福寿荘・イワジン（價格、預約截止、電話、季節菜單的衝突）。
- `node scripts/assessment-check.mjs shima`：餐廳 5 項，和檢討後相同（ベイサイドテラス F③、大家族・まぶしのいちや・中六 負評往下調、丸定 缺口保底），理由都在 rationale，維持；景點、住宿 0 項。
