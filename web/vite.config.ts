import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(webRoot, '../data');

// Vite 只監看 web/ 底下的檔案；把 data/ 也加進來，新增或修改資料檔時地圖會自動更新
function watchData(): Plugin {
  return {
    name: 'watch-data',
    configureServer(server) {
      server.watcher.add(dataDir);
    },
  };
}

export default defineConfig({
  plugins: [react(), watchData()],
  // 相對路徑，build 出來的檔案放在任何目錄下都能開
  base: './',
  build: {
    // maplibre-gl 本身就超過 1 MB，資料點一包約 4 MB（T15 改從 API 讀之後就不在 bundle 裡），不用警告
    chunkSizeWarningLimit: 5000,
    rolldownOptions: {
      output: {
        // 不常變的分開打包：改程式再部署時，地圖庫和資料不用重新下載。
        // 資料點、時刻表都是動態載入，各併成一個檔案，不是一區一個請求（T32）
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /[\/]node_modules[\/]maplibre-gl[\/]/ },
            { name: 'react', test: /[\/]node_modules[\/](react|react-dom|scheduler)[\/]/ },
            { name: 'places', test: /[\/]data[\/](areas[\/]|areas.json|stations.json)/ },
            { name: 'timetables', test: /[\/]data[\/]timetables[\/](bus|ferry|jr|urban)[\/]|[\/]_travel-times.json/ },
          ],
        },
      },
    },
  },
  worker: { format: 'es' },
  server: {
    fs: {
      // 允許讀取 web/ 外面的 ../data/
      allow: [webRoot, dataDir],
    },
  },
});
