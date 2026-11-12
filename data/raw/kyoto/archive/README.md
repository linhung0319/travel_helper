# 保存的工作目錄

`data/cache/work/` 不進 git（CONVENTIONS「工具」）。之後可能換電腦重跑的那幾批打包到這裡進 git（壓成一個檔，`validate` 不會把裡面的 JSON 當成資料檔檢查）。和以前的 `handoff/` 不同，這裡的檔案**做完不刪**。

| 檔案 | 內容 | 什麼時候要用 |
|---|---|---|
| `t86b-1.tar.gz`（2026-11-12 打包，T86d 之後） | T86b 住宿的工作目錄：`mk-kyoto.cjs`、`mk-kyoto-hotels.cjs`、`mk-biwako.cjs`（產生 judgement）、`judgement-*.json`、讀文 `facts/`、`notes/`、`google.jsonl`、楽天的 `rk/`（`detail.json`、`kids.json`、原始輸出 `aux/`）、`photos.json`、`add-candidates.mjs`、`add-kyoto-tax.mjs`、町家的 `machiya*.json` | 要重跑 `scripts/build-lodging.mjs kyoto|biwako`（改住宿的欄位、加減住宿）時 |

## 解開
```
mkdir -p data/cache/work && tar xzf data/raw/kyoto/archive/t86b-1.tar.gz -C data/cache/work
```
解開後是 `data/cache/work/t86b-1/`。步驟見 `../log/T86b.md` 的「第二階段・組裝」：`judgement.json` 先換成該區那份，跑 `scripts/build-lodging.mjs <kyoto|biwako> data/cache/work/t86b-1 --candidates --retrieved <日期>`，**之後要再跑 `add-kyoto-tax.mjs`**（住宿稅寫進 prices 的 note）。楽天要重查的話 `.env` 要有金鑰、IP 要在楽天的白名單。

## 重跑 build 之後要補回的（T86d 之後才寫進 `lodging.json`，judgement 裡沒有）
- `summary`、`assessment`、`tier`（T86d 評分）：重跑前先把兩區 `lodging.json` 的這三個欄位存下來，build 完用 `scripts/apply-patch.mjs` 的 overwrite 補回（評分理由裡的數字有變的要重看）。
- `tags` 的「溫泉」（京都 5 間、琵琶湖 5 間）。
- 京都飯店 8 間的 `febNote`：judgement 裡還是放在 `extra.febNote`（網站的白名單不收，`npm test` 會擋），build 後要再移到 `febNote`（文字見 `../log/T86d.md`「順便修的」，或照現在的 `lodging.json`）。
- `dinnerAccess`：build 後跑 `scripts/lodging-dinner-access.mjs kyoto --write --overwrite`。
