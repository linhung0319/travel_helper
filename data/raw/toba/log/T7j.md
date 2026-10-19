# T7j 鳥羽：檢討待確認的決定、深入調查、補丁式重新打分

## 2026-10-19 檢討（👤）
「👤 建議先看」鳥羽 9 項全部照建議決定，紀錄在 `docs/decisions-pending.md` 表格最後（T7j 那幾列）。改了的資料：七越茶屋 `extra.conflicts`（舊 seating）、王将 `notes`、みち潮 日帰り夕食 `group`／`groupFit`／summary、はっかい `recommend` 3 → 2。規則寫進 CONVENTIONS（空值的範圍、F③ 的 fit15、餐廳負評往下調一級、吸菸不扣 kidsFit）和 assessment-notes。

## 深入調查名單（👤 選平衡版）
照任務卡條件符合 45 筆（沒有筆記已有 `[blog]` 的）。照 recommend → groupFit 取前 25 會是住宿 15 筆；👤 決定把答志島 3 間小宿（中村屋、やま七、美さき）和 なかよし 換成 A 級人氣餐廳 水沼さざえ店、むつみ、華月、モトかき。名單在 `data/cache/work/t7j/targets.json`，subagent 共用指令在 `data/cache/work/t7j/prompt-common.md`。

## 每筆的搜尋次數和篇數
| # | id | WebSearch | 部落格（日／中） | 影響評分的新資訊 |
|---|---|---|---|---|
| 2 | toba-osatsu-ishigami | 3 | 0（0／0） | 無（co-trip、VELTRA 403；現代ビジネス 2018 不採用） |
| 5 | toba-kokusai-hotel | 3 | 1（1／0，觀光協會宣傳文） | 小：起司蛋糕、下午茶；大浴場（潮路亭 常若の湯）有沒有室內通路衝突 |
| 4 | toba-osatsu-sora-no-kaze | 3 | 0（0／0；改讀 489ban 方案頁 2 篇） | 無；接送「海女シャトル」名額有限（衝突，待電話確認）、價格 |
| 3 | toba-hachiman-kamado | 3 | 0（0／0；GLTJP 中文設施頁 1） | 無；兒童價範圍、Tea Time 價格衝突（以官網為準） |
| 7 | toba-sazanami | 3 | 0（0／0） | 無（只找到已收的媒體、店家頁） |
| 6 | toba-motoura-sun-urashima | 2 | 0（0／0；旅色宿頁 1） | 小：嬰幼兒用品出租、包廂用餐；淋浴椅、無障礙房 3 種但「非完全無障礙」 |
| 9 | toba-todaya | 3 | 1（1／0，ameblo 比較文、業配） | 無 |
| 1 | toba-aquarium | 3 | 5（4／1，中文是 FUN! JAPAN 媒體） | 有：長輩（有頂停車場→電梯到入口、輪椅 16 台＋シニアカー 3 台）↑；冬季／團體（年底擁擠、海獺排 40～70 分、每批 10 人）↓；小孩（國高中生嫌無聊）小幅↓ |
| 11 | toba-seahorse | 3 | 0（0／0） | 無 |
| 8 | toba-nishimura-shokudo | 3 | 0（0／0；Retty、はもに、いこーよ 媒體 3） | 無；停車場有、小座敷（いこーよ 摘要） |
| 10 | toba-seaside-hotel | 3 | 3（3／0，まとめ、比較文） | 小：宴會場有桌椅（團體、長輩↑）；三館分散、走得多（長輩↓，筆記已有）；泳池冬季不開 |
| 13 | toba-niku-matsumura | 3 | 1（1／0，Retty 口コミ 4 則） | 小：網燒煙大要開窗（冬季↓）；誰烤肉衝突 |
| 12 | toba-yakatabune-okita | 3 | 0（0／0；觀光三重、近鐵套裝 3） | 小：4 代家族取材、冬季菜色有小孩能吃的（小孩↑）；近鐵套裝 6 人起 |
| 14 | toba-shiojitei | 3 | 3（3／0，All About 投稿、Retty、Relux 特集） | 有：料理（白石 半個室、會席評價高）↑；subagent 寫的 2019 洗臉台心得超過 5 年，主 session 刪掉 |
| 16 | toba-grand-hotel | 3 | 0（0／0；cocolocala 口コミ彙整 1） | 有：有電梯但要轉乘、等很久（長輩↓，電梯來源補上）；自助餐翻新、2026 夏好評（料理小幅↑，和舊口コミ衝突） |
| 17 | toba-kochoran | 3 | 0（0／0） | 無 |
| 20 | toba-motoura-ginrin | 2 | 0（0／0） | 無 |
| 22 | toba-mizunuma-sazae | 2 | 0（0／0） | 無 |
| 21 | toba-yakigai-iroha | 3 | 0（0／0） | 無 |
| 19 | toba-ijika-kagura | 3 | 1（1／0，All About 媒體整理文） | 無；接送 1 天 3 班（15～17 時，前一天預約，只有 All About 寫） |
| 15 | toba-view-hotel-hanashinju | 3 | 0（0／0；改讀官網 キッズパーク、FAQ） | 小：キッズパーク 要收費（小孩小幅↓）；15 人以上團體取消規定；可借輪椅 |
| 18 | toba-osatsu-michishio | 3 | 0（0／0；補讀官網） | 小：掘りごたつ個室食事處（長輩小幅↑）；戶外泳池冬季不開 |
| 25 | toba-motokaki | 2 | 0（0／0） | 無 |
| 23 | toba-mutsumi | 3 | 2（2／0，aumo 介紹文、Retty 摘錄） | 無；開店前就排隊；晚餐有無衝突（aumo 2023 vs 官網） |
| 24 | toba-kagetsu | 3 | 0（0／0；ぐるなび 店家頁、JeePe 簡介） | 有：ぐるなび 包廂 桌席 10～16 人・座敷 40～56 人、輪椅可、座椅子、兒童椅、免費接送（團體、長輩↑；包廂和食べログ衝突） |

合計 25 筆、WebSearch 71 次；部落格（含彙整、媒體文）合計 17 篇，17 筆 0 篇。同時跑的 subagent 有一段時間是 6 個（神具良、銀鱗 同時開），超過上限 5 個一次。

## 重新打分（2026-10-19）
- 有新資訊而且會動分數的：鳥羽グランドホテル elderFit 3→4（口コミ確認有電梯、要轉乘）、華月 elderFit 4→5（ぐるなび 輪椅可、座椅子）。華月 ぐるなび 寫有 10～16 人的桌席個室，和食べログ「個室無」衝突 → fit15 維持 split、groupFit 3，寫在理由和 summary。
- 只改 summary／理由的：鳥羽水族館、潮路亭、肉料理まつむら、屋形船 おきた。
- 新資訊不影響分數的（維持）：サン浦島（出租用品、非完全無障礙；elderFit 4 不變）、花真珠（キッズパーク 收費；住宿沒有 kidsFit）、みち潮（掘りごたつ食事處；elderFit 看客房和電梯）、シーサイド（三館分散，elderFit 4 已反映）、おきた（小孩正面描述，但「網路訂位限小學生以上」照規則還是 3）、神具良（接送 3 班，accessEase 3 已是這個級距）、蒼空の風（海女シャトル 名額有限的衝突，等電話確認）。
- confidence 都沒變：新的來源多是媒體、彙整文，或評論數不到 high 的門檻（まつむら、むつみ 合計不到 1,000）。
- `node scripts/assessment-check.mjs toba`：4 項，和 T7h 相同，維持。
