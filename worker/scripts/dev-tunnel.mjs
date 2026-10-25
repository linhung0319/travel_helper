#!/usr/bin/env node
// 本機接 LINE（architecture §4「本機接 LINE」）：啟動 wrangler dev，再用 ngrok 的固定網域開通道。
//   npm run dev:tunnel
// - 讀 worker/.env 的 NGROK_AUTHTOKEN、NGROK_DOMAIN
// - PUBLIC_BASE_URL 自動帶 https://<NGROK_DOMAIN>（.env 裡的不用改）
// - DEV_AUTH 固定傳 "0"：通道是公開的網址，一律要 LINE 登入
// - 在 terminal 印出要貼到 LINE Developers 的 Webhook URL、Callback URL
// 不開通道就用 npm run dev:worker。

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ngrok from '@ngrok/ngrok';

const WORKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8787);

const envFile = path.join(WORKER, '.env');
if (!fs.existsSync(envFile)) fail('沒有 worker/.env：照 worker/.env.example 建一個');
process.loadEnvFile(envFile);
const { NGROK_AUTHTOKEN, NGROK_DOMAIN } = process.env;
if (!NGROK_AUTHTOKEN || !NGROK_DOMAIN) fail('worker/.env 要填 NGROK_AUTHTOKEN、NGROK_DOMAIN（ngrok 後台）');
const base = `https://${NGROK_DOMAIN.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

spawnSync(process.execPath, [path.join(WORKER, 'scripts/build-site.mjs'), '--ensure'], { stdio: 'inherit' });

const wranglerBin = path.join(WORKER, '../node_modules/wrangler/bin/wrangler.js');
const child = spawn(
  process.execPath,
  [wranglerBin, 'dev', '--port', String(PORT), '--var', `PUBLIC_BASE_URL:${base}`, '--var', 'DEV_AUTH:0'],
  { cwd: WORKER, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 0));
const stop = () => {
  child.kill();
  ngrok.disconnect().finally(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// 等 wrangler dev 開好再開通道
for (let i = 0; ; i++) {
  try {
    await fetch(`http://localhost:${PORT}/api/me`);
    break;
  } catch {
    if (i > 120) fail('wrangler dev 一直沒有開好');
    await new Promise((r) => setTimeout(r, 500));
  }
}

const listener = await ngrok.forward({ addr: PORT, authtoken: NGROK_AUTHTOKEN, domain: base.slice('https://'.length) });
console.log(`
通道已開：${listener.url()}
  貼到 LINE Developers（只要貼一次）：
    Messaging API channel → Webhook URL：${base}/line/webhook
    LINE Login channel → Callback URL：  ${base}/auth/line/callback
  網站：${base}/（ngrok 免費版第一次打開會先出現警告頁，按 Visit Site）
  管理頁：${base}/admin
Ctrl+C 結束。`);
