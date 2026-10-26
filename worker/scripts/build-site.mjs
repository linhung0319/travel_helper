#!/usr/bin/env node
// 組出要部署的網站（wrangler.jsonc 的 assets.directory = build/site/，T25）：
//   web/dist/      → build/site/          （npm run build）
//   build/static/  → build/site/static/   （npm run build:static：時刻表、areas.json 等，architecture §3.7）
//
// 用法：
//   node worker/scripts/build-site.mjs            重新組一次（先跑過 npm run build、npm run build:static）
//   node worker/scripts/build-site.mjs --ensure   build/site/ 不存在時放一頁說明（wrangler dev 沒有這個資料夾會啟動失敗）
// 根目錄的 `npm run build:site` 會先 build 再組。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'build/site');
const WEB_DIST = path.join(ROOT, 'web/dist');
const STATIC = path.join(ROOT, 'build/static');

if (process.argv.includes('--ensure')) {
  if (!fs.existsSync(SITE)) {
    fs.mkdirSync(SITE, { recursive: true });
    fs.writeFileSync(
      path.join(SITE, 'index.html'),
      '<!doctype html><meta charset="utf-8"><title>還沒 build</title><p>網站還沒 build：在根目錄跑 <code>npm run build:site</code>。API（/api/*）不受影響。</p>\n',
    );
    console.log('build/site/ 不存在：先放一頁說明（要看網站請跑 npm run build:site）');
  }
  process.exit(0);
}

if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
  console.error('❌ 沒有 web/dist/index.html：先跑 npm run build');
  process.exit(1);
}
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(WEB_DIST, SITE, { recursive: true });
if (fs.existsSync(STATIC)) fs.cpSync(STATIC, path.join(SITE, 'static'), { recursive: true });
else console.warn('⚠️ 沒有 build/static/：先跑 npm run build:static（時刻表等靜態資料不會部署）');

let files = 0;
let bytes = 0;
for (const f of fs.readdirSync(SITE, { recursive: true, withFileTypes: true })) {
  if (!f.isFile()) continue;
  files++;
  bytes += fs.statSync(path.join(f.parentPath, f.name)).size;
}
console.log(`✅ build/site/：${files} 個檔案、${(bytes / 1024 / 1024).toFixed(1)} MB`);
