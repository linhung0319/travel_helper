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
  // maplibre-gl 本身就超過 1 MB，不用警告
  build: { chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  server: {
    fs: {
      // 允許讀取 web/ 外面的 ../data/
      allow: [webRoot, dataDir],
    },
  },
});
