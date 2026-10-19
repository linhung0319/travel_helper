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
| 25 | shima-amagoya-hiba-hironohama | 餐廳 | B | groupFit 5（平衡版補回） |
