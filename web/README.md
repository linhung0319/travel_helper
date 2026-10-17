# 地圖檢視器（T5，v0）

用來**檢查 `data/` 的資料**：分布、缺漏、座標錯誤。不是給旅客用的正式介面（那是 T11）。

技術：Vite + React + TypeScript + MapLibre GL，圖磚用 [OpenFreeMap](https://openfreemap.org/)（免費、不需要 key）。

## 啟動

需要 Node 22。

```sh
cd web
npm install
npm run dev        # 開發伺服器，網址會印在終端機（預設 http://localhost:5173）
```

其他指令：

```sh
npm run typecheck  # 只跑 tsc
npm run build      # tsc + vite build，輸出到 web/dist/
npm run preview    # 預覽 build 的結果
```

手機上看：`npm run dev -- --host`，再用手機開終端機印出的區網網址。

## 資料從哪裡來

- `src/data.ts` 用 `import.meta.glob` 讀 `data/**/*.json`（排除 `data/cache/`），**新增的資料檔會自動出現，不用改程式**；開發伺服器開著時，新增或修改資料檔會自動重新載入。
- 最外層是陣列、元素有 `type`（`station`、`spot`、`lodging`、`restaurant`）的檔案當成資料點；時刻表等其他檔案略過。
- 區域框線來自 `data/areas.json` 的 `bbox`。
- `vite.config.ts` 用 `server.fs.allow` 允許讀取 `web/` 外面的 `data/`。

## 畫面

- **圖層**：依類別開關（車站藍、景點綠、住宿紫、餐廳橘），括號是筆數。放大到 zoom 11 以上會顯示名稱。
- **區域 bbox 框線**：虛線框，用來看座標有沒有落在對的區域。
- **跳到區域**：伊勢志摩全區，或 `areas.json` 的各區域。
- **點資料點**：面板最上面顯示 ID、區域、座標（附 Google 地圖連結）、所在檔案、來源連結，以及可以摺疊的原始 JSON（裡面的網址可以點）。好幾個點重疊時會列出來讓你選。
- **檢查**：列出座標錯誤（缺座標、經緯度顛倒）、超出伊勢志摩、不在所屬區域的 bbox 內、ID 重複、沒有來源的資料點；有問題的點在地圖上加紅框。點清單會跳到該點。bbox 只是大致範圍，不在框內只是提醒（和 `scripts/validate` 一樣）。
- **各區筆數**：區域 × 類別的筆數，0 用紅字標出，方便看哪裡還缺資料。
- 手機寬度下，面板在地圖下方，可以收起。

## 假資料（`src/dev-fixtures/`）

目前 `data/` 只有車站。開發時要看景點、住宿、餐廳，打開面板上的「顯示假資料」（記在瀏覽器的 localStorage）。

- 假資料**只放在 `web/src/dev-fixtures/`，不要放進 `data/`**。ID 都以 `fixture-` 開頭，名稱前面有「（假）」。
- 裡面故意放了幾筆錯誤資料（經緯度顛倒、area 和座標不符、ID 重複），用來確認「檢查」功能有作用。

## 目錄

```
web/
├─ src/
│  ├─ main.tsx           進入點
│  ├─ App.tsx            面板（圖層、區域、選取、檢查、筆數）
│  ├─ MapView.tsx        MapLibre 地圖與圖層
│  ├─ data.ts            讀取 data/、整理資料點、找問題
│  ├─ types.ts           地圖用到的型別
│  ├─ styles.css
│  ├─ dev-fixtures/      假資料
│  └─ lib/geo/           地理工具（T6 負責，T5 不改）
└─ vite.config.ts
```

## 備註

- maplibre-gl v6 的 worker 是另一個檔案，`MapView.tsx` 用 `?worker&url` 讓 Vite 打包，再用 `setWorkerUrl` 指定；少了這一步地圖會出現「Worker failed to load」。
- 瀏覽器 console 裡 `highway-shield…filter` 的警告來自 OpenFreeMap 的樣式本身，不影響使用。
