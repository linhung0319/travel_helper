#!/usr/bin/env node
// 產生 Claude in Chrome browser_batch 的 actions（JSON），把輸出整段當成 browser_batch 的 actions 傳進去。
// 每一頁：navigate → （等待）→ javascript_tool 跑 scripts/chrome/ 的抽取程式。一次 4～5 頁，回傳太長會被截斷。
//
// 用法：
//   node scripts/chrome-actions.mjs --tab <tabId> --script tabelog-info <網址>...
//   node scripts/chrome-actions.mjs --tab <tabId> --script tabelog-info --batch <batch.json> <key>[:party/]...
//       （從 candidates.mjs export 的 batch.json 取食べログ網址；key 後面加 :party/ 是コース頁）
//   node scripts/chrome-actions.mjs --tab <tabId> --script google-place --google "<店名 地名>"...
//   node scripts/chrome-actions.mjs --tab <tabId> --script tabelog-reviews --batch <batch.json> --keywords 子供,団体 <key>
//       （{店家頁}dtlrvwlst/ 最新 20 則＋每個關鍵字的 dtlrvwlst/?sw=<關鍵字>；網址也可以直接給食べログ店家頁）
//   node scripts/chrome-actions.mjs --tab <tabId> --script google-reviews --keywords 子供,団体 [--steps open,lowest] <links.googleMaps>
//       （navigate {網址}&hl=ja → open → lowest → 每個關鍵字 search → computer type → Return → extract）
//
// --wait <秒>：navigate 後先等幾秒（google-place、tabelog-info 自己會等，不用加）。
// --store：程式本體只傳一次（第一頁存進該網站的 localStorage，之後每頁只傳一行 eval），每頁省約 3k 字的 token。
//          同一網站之後的 batch 加 --stored（不再存）；最後一個 batch 加 --cleanup（結束時 removeItem）。
//          只讀自己存的那一格，不碰網站的其他資料（T8d 第 1 批起用過）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VALUED = ['--tab', '--script', '--wait', '--batch', '--keywords', '--steps'];
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const flag = (k) => args.includes(`--${k}`);
const tab = Number(opt('tab'));
const script = (opt('script') ?? '').replace(/\.js$/, '');
const wait = Number(opt('wait') ?? 0);
const batchFile = opt('batch');
const google = flag('google');
const keywords = (opt('keywords') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const targets = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));

if (!tab || !script || !targets.length) {
  console.error('用法：node scripts/chrome-actions.mjs --tab <tabId> --script <tabelog-info|google-place|tabelog-reviews|google-reviews> [--wait 秒] [--batch batch.json | --google] [--keywords a,b] [--store|--stored] [--cleanup] <網址、key 或查詢>...（說明見檔案開頭）');
  process.exit(2);
}

const file = path.join(ROOT, 'scripts/chrome', `${script}.js`);
// 開頭的說明註解拿掉，省 token（程式本身不變）
const js = fs.readFileSync(file, 'utf8').replace(/^(\/\/.*\r?\n)+/, '').trim();
const batch = batchFile ? JSON.parse(fs.readFileSync(batchFile, 'utf8')) : null;
const isGoogleReviews = script === 'google-reviews';

// 存進 localStorage 的是「運算式」：IIFE（tabelog-*、google-place）或函式（google-reviews，呼叫時給步驟名稱）
// 存進 localStorage 時，程式中間整行的註解也拿掉（只影響傳給瀏覽器的字串；T8e 第 3 批，google-reviews 少約 1/4）
const stripComments = (code) => code.replace(/^[ \t]*\/\/.*\r?\n/gm, '');
const body = isGoogleReviews
  ? stripComments(js).replace(/^await\s+/, '').replace(/\)\('open'\);?.*$/s, ')')
  : stripComments(js).replace(/^await\s+/, '').replace(/;\s*$/, '');
const KEY = `__th_${script}`;
let stored = flag('stored');
const store = flag('store');
const runJs = (step) => {
  const call = isGoogleReviews ? `(${'%E%'})(${JSON.stringify(step)})` : '%E%';
  if (!store && !stored) return isGoogleReviews ? `await ${call.replace('%E%', () => body)};` : js;
  const ev = `eval(localStorage.getItem(${JSON.stringify(KEY)}))`;
  const pre = stored ? '' : `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(body)});\n`;
  stored = true;
  return `${pre}await ${call.replace('%E%', () => ev)};`;
};
const js1 = (step) => ({ name: 'javascript_tool', input: { action: 'javascript_exec', tabId: tab, text: runJs(step) } });

const storeUrl = (t) => {
  if (!batch || /^https?:/.test(t)) return { url: t };
  const [key, suffix = ''] = t.split(':');
  const b = batch.find((x) => x.key === key);
  if (!b?.tabelog) throw new Error(`batch.json 裡沒有 ${key} 的食べログ網址`);
  return { url: b.tabelog + suffix };
};
const urlOf = (t) => (google ? `https://www.google.com/maps/search/${encodeURIComponent(t)}?hl=ja` : storeUrl(t).url);

const actions = [];
const nav = (url) => {
  actions.push({ name: 'navigate', input: { tabId: tab, url } });
  if (wait) actions.push({ name: 'computer', input: { action: 'wait', duration: wait, tabId: tab } });
};

if (script === 'tabelog-reviews') {
  for (const t of targets) {
    const base = urlOf(t).replace(/dtlrvwlst\/.*$/, '');
    nav(`${base}dtlrvwlst/`);
    actions.push(js1());
    for (const k of keywords) {
      nav(`${base}dtlrvwlst/?sw=${encodeURIComponent(k)}`);
      actions.push(js1());
    }
  }
} else if (isGoogleReviews) {
  if (targets.length !== 1) {
    console.error('google-reviews 一次只做一家（給一個 Google Maps 網址）');
    process.exit(2);
  }
  const u = targets[0];
  nav(/[?&]hl=/.test(u) ? u : `${u}${u.includes('?') ? '&' : '?'}hl=ja`);
  for (const s of (opt('steps') ?? 'open,lowest').split(',')) actions.push(js1(s));
  for (const k of keywords) {
    actions.push(js1('search'));
    actions.push({ name: 'computer', input: { action: 'type', text: k, tabId: tab, action_summary: `在 Google 評論搜尋框輸入「${k}」` } });
    actions.push({ name: 'computer', input: { action: 'key', text: 'Return', tabId: tab, action_summary: '送出評論搜尋' } });
    actions.push(js1('extract'));
  }
} else {
  for (const t of targets) {
    nav(urlOf(t));
    actions.push(js1());
  }
}
if (flag('cleanup')) {
  actions.push({ name: 'javascript_tool', input: { action: 'javascript_exec', tabId: tab, text: `localStorage.removeItem(${JSON.stringify(KEY)}); 'removed'` } });
}
console.log(JSON.stringify(actions));
