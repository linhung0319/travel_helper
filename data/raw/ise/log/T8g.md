# T8g 伊勢、二見：檢討待確認的決定、深入調查、補丁式重新打分

## 2026-10-19 檢討（👤）
「👤 建議先看」伊勢、二見 18 項全部照建議決定（第 4 組的後 2 項和之後的步驟 👤 授權照建議做），紀錄在 `docs/decisions-pending.md` 表格最後（T8g 那幾列）。
- 照 T7j 規則：空值 8 家維持；吸菸不扣 kidsFit 的 9 家加回一級；負評往下調一級的 5 家維持，另外 ふぐや 3 → 2、松風軒 2 → 1；F③ おく文、海の蝶 日帰り夕食 fit15 yes → unknown、groupFit 4 → 3。
- 新規則（CONVENTIONS、assessment-notes）：營業時間「官網 3 年以上沒更新」的例外；10 筆以下的區域比例只當參考；景點 kidsFit 可以用筆記的小孩描述；住宿 groupFit 4 不要求宴會場；住宿電梯的來源；餐廳介紹來源的認定、localFlavor、elderFit（車椅子で入店可 → 4）。
- 改分數：大石屋 elderFit 4 → 3；伊勢餐廳第 1 條放寬成 3.55／150 則＋Google 4.1，8 家 B → A（A 以上 13 → 21／108）。

## 深入調查名單（平衡版，👤 授權由 Claude 判斷）
照任務卡條件：伊勢 57 筆、二見 7 筆（筆記都沒有 `[blog]`）。二見 7 筆全做。伊勢照 recommend → groupFit 取前 25 會有 6 家甜點・咖啡（赤福 本店、豆腐庵山中、五十鈴茶屋、五十鈴川カフェ、ダンデライオン、モリ）和 9 家 groupFit 1，全員用餐的候選（groupFit 5 的 B）一家都沒有 → 平衡版：甜點・咖啡只留 赤福 本店，換成 groupFit 5、內宮・外宮一帶的 大喜、すし久、海老丸、岩戸屋 本店，加上檢討 ⑩ 提到的 つきよみ食堂（找到真的介紹文就符合第 2 條）。換掉的 5 家和 牡蠣の朋 留給第二輪。名單在 `data/cache/work/t8g/targets.json`，subagent 共用指令在 `data/cache/work/t8g/prompt-common.md`。

## 每筆的搜尋次數和篇數
| # | id | WebSearch | 部落格（日／中） | 影響評分的新資訊 |
|---|---|---|---|---|
| 3 | ise-shinsen | 3 | 0（0／0；2020 的 4travel、業配超過 5 年不寫；icotto 403） | 無 |
| 4 | ise-geku | 3 | 1（0／1，jeepe 中文攻略、日期不明、聯盟連結；另記觀光三重 外宮前観光サービスセンター） | 小：神宮外的服務中心借嬰兒車 1 台、寄放行李 400 円；碎石路要好走的鞋 |
| 1 | ise-iku | 3 | 0（0／0；觀光三重特集 2019 超過 5 年不寫） | 無 |
| 2 | ise-jingu-kaikan | 3 | 1（1／0，國學院大學家長會報告書 2024-10） | 小：約 30 人團體（含長輩）住過、一起吃會席（團體正面實例）；電梯仍無來源 |
| 5 | ise-naiku | 3 | 0（0／0；另記伊勢市おもてなしヘルパー手冊 PDF、なっぷ） | 有：正宮前石段 25 段（約 18 cm）、宇治橋～正宮約 800 m 玉砂利（長輩）；付費輪椅協助；嬰兒車難推（小孩）。subagent 推論的「需事前電話預約」主 session 要刪 |
| 9 | ise-mukai-sakenomise | 3 | 0（0／0） | 無（百名店 2025 只有搜尋摘要，不採用） |
| 6 | ise-ichigetsuya | 3 | 0（0／0；電視東京 2013 超過 5 年不寫） | 無 |
| 10 | ise-sakaba-morishita | 2 | 0（0／0） | 無（同市的「森下酒店」是別家） |
| 8 | ise-tofuya | 3 | 1（1／0，aumo 介紹文 2026-06，轉載店家資訊） | 無 |
| 7 | ise-misuzu-gyoza | 2 | 2（2／0，All About 讀者投稿整理 2026-06、foodle.pro 個人食記 2024-08；Walkerplus 2017 不寫） | 小：15:00 開店時最好入座、帶小小孩的家庭也能吃（小孩小幅↑）；營業時間衝突（聚合站，不採） |
| 11 | ise-butasute-wakayanagi | 3 | 0（0／0；Retty 列表頁口コミ 1 則，日期不明） | 無；Retty 價格帶 ～8,000 円 vs 官網 1 萬円以上（衝突） |
| 13 | ise-toramaru | 3 | 0（0／0；co-trip 403、4travel 2007 亂碼） | 無 |
| 14 | ise-asora-no-chaya | 3 | 0（0／0；co-trip 403、oggi 2017 不寫） | 無 |
| 12 | ise-akafuku-honten | 3 | 0（0／0；co-trip 403、funtime 2015 不寫、jalan 亂碼；aumo 頁面藏了要模型照抄的文字，未照做） | 無 |
| 15 | ise-sazanami | 3 | 0（0／0；hotpepper 等是別家、観光三重是鳥羽店） | 無 |
| 17 | ise-chitose | 2 | 1（1／0，4travel 口コミ 2025-01，冬季） | 小：冬天開店 30 分後排約 30 分（排隊，elderFit 參考）；價格一致 |
| 18 | ise-bon-vivant | 2 | 0（0／0；るるぶ&more 店家頁 1，媒體） | 有：メインダイニング 1 日 2 組限定、「夏・冬期休業あり（要問合せ）」→ 2 月可能休業（febNote、questions）；預約期限衝突 |
| 16 | ise-fukusuke | 3 | 2（1／1，4travel 口コミ 2022-10～2023-02（3～5 年前）、Trip.com 遊記彙整 日期不明） | 小：桌席約 4 張＋座敷，座位多在店外縁台（冬季冷）；68 席衝突 |
| 19 | ise-nikawa | 2 | 0（0／0） | 無 |
| 20 | ise-komada | 2 | 1（1／0，foodle.pro 用餐紀錄 2026-02） | 小：2 月的套餐（つまみ 2＋握り約 14 貫）、白木吧台 6 席、安靜 |
| 21 | ise-daiki | 3 | 0（0／0；観光三重 伊勢海老特集 2026-08，媒體） | 無；伊勢海老コース 14,300 円起、夜間營業時間衝突（観光三重 vs 官網） |
| 22 | ise-sushikyu | 3 | 0（0／0；co-trip 2 篇 403、エキテン 空白） | 無 |
| 23 | ise-ebimaru | 3 | 0（0／0；walkerplus 2020 不寫） | 無 |
| 24 | ise-iwatoya-honten | 3 | 0（0／0；観光三重 遊記 2021-02、2017 超過 5 年不寫） | 無 |
| 25 | ise-tsukiyomi-shokudo | 3 | 0（0／0；All About 2016 是唯一的介紹文，超過 5 年不寫） | 無：第 2 條仍不成立，維持 3 |
| 28 | futami-uminocho-dining | 2 | 0（0／0） | 無（非住客用餐的實例仍找不到） |
| 29 | futami-ofukumochi-honke | 3 | 0（0／0；co-trip 403、2024-04 搬遷後沒有心得） | 無 |
| 26 | futami-okitama-jinja | 3 | 2（2／0，banzokubiology 部落格 2026-08～09） | 小：二見浦站約 1.1 km 平坦、巴士「夫婦岩東口」；冬季授與所 16:00 前後關 |
| 30 | futami-asahiya-sakamoto-manju | 2 | 0（0／0；ねとらぼ 和菓子店排名 2025-04，媒體） | 小：上午就可能賣完（cons、行程要排上午）；ねとらぼ 是 Google 評價排名，不算介紹 |
| 27 | futami-uminocho | 2 | 2（2／0，みえやど 2026-10（可能聯盟）、4travel 2022-10（3～5 年前）） | 小：嬰兒休息室、嬰兒澡盆、お子様ランチ；館內大、到大浴場和食事処要走一段（長輩↓）；食事処 有輪椅對應桌；送迎 8 vs 10 分衝突 |
| 32 | futami-ukichi | 2 | 0（0／0；2026-07 開店） | 無 |
| 31 | futami-maruru-cafe | 3 | 0（0／0；ぐるなび 店家頁 1） | 小：晚餐不接學齡前（本團 6～10 歲不受影響）；ぐるなび 28 席・宴會 30 人・包場 20 人起 vs 40 席（衝突） |

合計 32 筆、WebSearch 86 次；有內容的部落格（含媒體、彙整、口コミ站）9 筆共 11 篇，23 筆 0 篇。同時跑的 subagent 最多 5 個，一個完成才開下一個。subagent 自己推論的內容有 2 筆，主 session 改掉了：內宮「需事前電話預約」、こま田「不適合帶小孩」。赤福 本店 讀到的 aumo 頁面藏了要模型照抄的文字，subagent 沒有照做。

## 重新打分（2026-10-19）
- 星數有變的：ふくすけ elderFit 4→3、二見興玉神社 elderFit null→4；confidence：美鈴 medium→high、こま田 low→medium。
- 只改 summary、理由、conflicts 的：內宮、外宮、神宮会館、美鈴、ボン・ヴィヴァン（febNote＋questions）、大喜、海の蝶、maruru cafe。
- 有新資訊但不影響分數的（維持）：神宮会館 groupFit 4（團體實例不是官方方案）、ちとせ（排隊 elderFit 3 已反映）、海の蝶 elderFit 4、こま田（套餐內容）、旭家（上午可能賣完，cons 已有）、つきよみ食堂（介紹文只有 2016 年的，第 2 條仍不成立）。
- 海の蝶、神宮会館 confidence 維持 medium：新的部落格多一種心得，但評分來源互相差 1 分以上（4travel vs 楽天）降一級。
- `node scripts/assessment-check.mjs ise`：2 項（すだく、町家バル），和 T8f 相同，維持；futami 0 項。
