# 交接用的工作目錄

`data/cache/work/` 不進 git（CONVENTIONS「工具」）。換一台電腦接著做時，原本的工作目錄不會在，所以把還要接著用的那一批打包到這裡進 git（壓成一個檔，`validate` 不會把裡面的 JSON 當成資料檔檢查）。

| 檔案 | 任務 | 接手時 |
|---|---|---|
| `t86b-1.tar.gz` | T86b 第一階段（2026-11-12）：溫泉旅館 7 間的 `judgement*.json`、`mk-kyoto.cjs`／`mk-biwako.cjs`（產生 judgement 的腳本）、讀文 `facts/`、`google.jsonl`、`photos.json`、町家和溫泉的候選、讀文共用指令 `prompt-common.md`、住宿稅 `tax.md` | 解開到 `data/cache/work/t86b-1/` 再用：`mkdir -p data/cache/work && tar xzf data/raw/kyoto/handoff/t86b-1.tar.gz -C data/cache/work`。第二階段補楽天的欄位時改 `mk-*.cjs` 或 `judgement-*.json`，重跑 `scripts/build-lodging.mjs <kyoto|biwako> data/cache/work/t86b-1 --candidates --retrieved <日期>`（`judgement.json` 要先換成該區那份，見 `log/T86b.md`「組裝」） |

第二階段做完、T86b 標 ✅ 時，把 `t86b-1.tar.gz` 從這裡刪掉（資料已經在 `lodging.json`、`dossiers/`、`log/`）。
