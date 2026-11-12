#!/usr/bin/env node
// Chrome 抽取結果的本機接收器（T86c 新增）：browser_batch 每個動作的回傳約 1,000 字就截斷（T9c、T27c），
// 以前要把 JSON 存在 window.__o 分段讀、再由 Claude 抄進 jsonl。改成頁面上的抽取程式把結果 POST 到這支，
// 直接寫進工作目錄；Claude 只看一行回報（存了幾個字）。chrome-actions.mjs 的 --post 會產生這段 fetch。
//
// 用法：node scripts/chrome-receiver.mjs --work <工作目錄> [--port 8765]     （背景執行，做完關掉）
//   頁面上（javascript_tool）：
//     await fetch('http://127.0.0.1:8765/tabelog.jsonl?key=tabelog-26000873', { method: 'POST', body: JSON.stringify(結果) })
//   → 在 <工作目錄>/tabelog.jsonl 加一行（body 是 JSON 物件而且有 key 參數時，在最前面加 "key"；有 step 參數時再加 "step"，
//     評論的每一步、每個關鍵字各一行）。同一個 key＋step＋path 再送一次會換掉舊的那一行（店家頁和コース頁的 path 不同，各留一行）。
//     檔名是 .txt、.json 時整個覆寫（食べログ列表的 lists/<頁>.txt：/lists/gion-rt-1.txt）。
//
// 只聽 127.0.0.1；只寫工作目錄底下、檔名是 [a-z0-9._-]（可以有一層 lists/、notes/、facts/ 子目錄）的 .jsonl、.txt、.json。
// 只收資料，不轉送、不讀別的網頁。第一次 Chrome 會問「這個網站想連本機網路」，要 👤 按允許（T86c：食べログ、Google 各一次）；
// 網站擋下 fetch（CSP）或沒有允許時頁面會回「POST 失敗」，這時照舊分段讀，不要繞過。

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 路徑檢查（純函式，scripts/test/chrome-receiver.test.ts 有測試）：合法 → 相對路徑，不合法 → null
export function safeName(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  return /^(?:(?:lists|notes|facts)\/)?[a-z0-9][a-z0-9._-]*\.(?:jsonl|txt|json)$/i.test(p) && !p.includes('..') ? p : null;
}

// jsonl：同一筆（key＋step＋path 都一樣）的舊行換掉，沒有就加在最後
const identity = (o) => (o && o.key != null ? [o.key, o.step ?? '', o.path ?? ''].join('|') : null);
const parse = (l) => {
  try {
    return JSON.parse(l);
  } catch {
    return null;
  }
};
export function upsertLine(text, line) {
  const id = identity(parse(line));
  const lines = text.split(/\r?\n/).filter(Boolean);
  const i = id == null ? -1 : lines.findIndex((l) => identity(parse(l)) === id);
  if (i >= 0) lines[i] = line;
  else lines.push(line);
  return lines.join('\n') + '\n';
}

export function handle(work, name, key, body, step = null) {
  const file = path.join(work, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!name.endsWith('.jsonl')) {
    fs.writeFileSync(file, body);
    return `saved ${name} ${body.length}`;
  }
  const obj = parse(body);
  if (obj === null) throw new Error('jsonl 的 body 要是 JSON');
  const line = JSON.stringify(key && typeof obj === 'object' && !Array.isArray(obj) ? { key, ...(step ? { step } : {}), ...obj } : obj);
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  fs.writeFileSync(file, upsertLine(old, line));
  return `saved ${name} ${key ?? ''}${step ? ` ${step}` : ''} ${line.length}`;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
  const work = opt('work');
  const port = Number(opt('port') ?? 8765);
  if (!work || !fs.existsSync(work)) {
    console.error('用法：node scripts/chrome-receiver.mjs --work <工作目錄> [--port 8765]（說明見檔案開頭）');
    process.exit(2);
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Private-Network': 'true' };
  http.createServer((req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    const url = new URL(req.url, 'http://127.0.0.1');
    const name = safeName(url.pathname);
    // GET：把工作目錄裡的檔案給頁面讀（抽取程式的本體放成 .txt，頁面 fetch 後存進 localStorage，Claude 不用把幾千字的程式貼進 javascript_tool）
    if (req.method === 'GET' && name && fs.existsSync(path.join(work, name))) {
      return res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' }).end(fs.readFileSync(path.join(work, name)));
    }
    if (req.method !== 'POST' || !name) return res.writeHead(400, cors).end('bad request');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const msg = handle(work, name, url.searchParams.get('key'), Buffer.concat(chunks).toString('utf8'), url.searchParams.get('step'));
        console.log(msg);
        res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' }).end(msg);
      } catch (e) {
        res.writeHead(400, cors).end(String(e.message));
      }
    });
  }).listen(port, '127.0.0.1', () => console.log(`chrome-receiver：http://127.0.0.1:${port} → ${work}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
