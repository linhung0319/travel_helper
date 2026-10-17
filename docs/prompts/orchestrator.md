# 指揮 session 的指令範本（自動依序執行）

規則見 PLAN.md §3「自動依序執行」。在 Claude Code 新 session 裡先執行 `/chrome`，再貼上下面的 prompt。

---

你是**指揮 session**，照 docs/PLAN.md §3「自動依序執行」把資料任務一個一個交給 subagent 做完，中途不要停下來問我。

開始前先讀：CLAUDE.md、docs/PLAN.md（§2 任務總覽、§3「自動依序執行」、要做的任務卡）、docs/auto-run-log.md（如果有，從上次停下的地方接著做）。docs/CONVENTIONS.md 不用整份讀，任務 subagent 自己會讀。

**執行範圍**：{起點，例如 T7c} 到 T10，順序照 §3「自動依序執行」的清單；已經是 ✅ 的跳過。

每個任務的流程：
1. 確認前置任務都是 ✅、`git status` 是乾淨的，從 master 開分支（任務 ID 小寫，例如 `t7c`）。不用 worktree。
2. 用 Agent 工具開一個 general-purpose subagent 執行任務卡（大任務照 §3 分批，一批一個 subagent，等上一批回報再開下一批）。給 subagent 的 prompt 要包含：
   - 「執行 docs/PLAN.md 的 <任務 ID>（<這一批的範圍>），照 CLAUDE.md、CONVENTIONS.md、任務卡做。你在分支 <分支名稱> 上，直接在主目錄工作，不要開 worktree、不要 merge、不要切換分支。」
   - 「中途不要問問題：需要 👤 決定的地方照規則自己決定，寫進 docs/decisions-pending.md（日期、任務、決定、理由、怎麼改回）。」
   - 用 Chrome 的任務加上：「用 Claude in Chrome 前，先用 ToolSearch 載入工具，再呼叫 tabs_context_mcp(createIfEmpty: true)；結束時關掉自己開的所有分頁。遇到驗證碼、登入、封鎖不要繞過，那一部分跳過、記錄原因、繼續。」
   - 「讀文照 docs/prompts/dossier.md 開讀文 subagent（不用 Chrome，同時最多 5 個）。」
   - 「每完成一個段落跑 scripts/validate，通過才 commit。結束時回報（30 行以內）：commit 清單、驗證結果、跳過或沒做完的部分、寫進 decisions-pending.md 的決定。」
3. subagent 回報後（等完成通知），自己檢查：`git log`、`scripts/validate`。沒通過就請 subagent（或新開一個）修，最多 2 次。
4. 通過後：`git checkout master`、`git merge --no-ff <分支> -m "Merge branch '<分支>'：<一句話>"`、再跑一次 `scripts/validate`、把 PLAN.md §2 該任務改成 ✅ 並 commit、`git branch -d <分支>`。
5. 在 docs/auto-run-log.md 加一行並 commit：`| 任務 | 完成時間 | merge commit | 驗證 | 跳過或要 👤 看的事 |`。

**只有這些情況才停下來**（停的時候在 auto-run-log.md 寫明原因和下一步）：
- 驗證修 2 次還不過；merge 衝突。
- 前置任務失敗或沒做完，後面的任務做不了。
- 楽天 API、Chrome 連續失敗，整個任務做不下去（部分失敗就跳過那部分、繼續）。

**同一時間只有一個 subagent 用 Chrome**；讀文 subagent 不用 Chrome，可以並行。

全部做完後，回報：完成的任務、跳過的部分、decisions-pending.md 裡要我看的決定數量。
