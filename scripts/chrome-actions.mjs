#!/usr/bin/env node
// 產生 Claude in Chrome browser_batch 的 actions（JSON），把輸出整段當成 browser_batch 的 actions 傳進去。
// 每一頁：navigate → （等待）→ javascript_tool 跑 scripts/chrome/ 的抽取程式。一次 4～5 頁，回傳太長會被截斷。
//
// 用法：
//   node scripts/chrome-actions.mjs --tab <tabId> --script tabelog-info <網址>...
//   node scripts/chrome-actions.mjs --tab <tabId> --script tabelog-info --batch <batch.json> <key>[:party/]...
//       （從 candidates.mjs export 的 batch.json 取食べログ網址；key 後面加 :party/ 是コース頁）
//   node scripts/chrome-actions.mjs --tab <tabId> --script google-place --google "<店名 地名>"...
//
// --wait <秒>：navigate 後先等幾秒（google-place 自己會等網址變成 /place/，不用加）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const tab = Number(opt('tab'));
const script = opt('script');
const wait = Number(opt('wait') ?? 0);
const batchFile = opt('batch');
const google = args.includes('--google');
const targets = args.filter((a, i) => !a.startsWith('--') && !['--tab', '--script', '--wait', '--batch'].includes(args[i - 1]));

if (!tab || !script || !targets.length) {
  console.error('用法：node scripts/chrome-actions.mjs --tab <tabId> --script <tabelog-info|google-place|tabelog-reviews> [--wait 秒] [--batch batch.json | --google] <網址、key 或查詢>...');
  process.exit(2);
}

const file = path.join(ROOT, 'scripts/chrome', script.endsWith('.js') ? script : `${script}.js`);
// 開頭的說明註解拿掉，省 token（程式本身不變）
const js = fs.readFileSync(file, 'utf8').replace(/^(\/\/.*\r?\n)+/, '').trim();
const batch = batchFile ? JSON.parse(fs.readFileSync(batchFile, 'utf8')) : null;

const urlOf = (t) => {
  if (google) return `https://www.google.com/maps/search/${encodeURIComponent(t)}?hl=ja`;
  if (!batch) return t;
  const [key, suffix = ''] = t.split(':');
  const b = batch.find((x) => x.key === key);
  if (!b?.tabelog) throw new Error(`batch.json 裡沒有 ${key} 的食べログ網址`);
  return b.tabelog + suffix;
};

const actions = [];
for (const t of targets) {
  actions.push({ name: 'navigate', input: { tabId: tab, url: urlOf(t) } });
  if (wait) actions.push({ name: 'computer', input: { action: 'wait', duration: wait, tabId: tab } });
  actions.push({ name: 'javascript_tool', input: { action: 'javascript_exec', tabId: tab, text: js } });
}
console.log(JSON.stringify(actions));
