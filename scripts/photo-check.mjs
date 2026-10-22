#!/usr/bin/env node
// 照片網址檢查：能不能打開、是不是圖片（CONVENTIONS §4「照片」：每張都先確認能打開）。
//
// 用法：
//   node scripts/photo-check.mjs <網址>...
//   node scripts/photo-check.mjs --file <網址清單.txt>        一行一個網址
//   node scripts/photo-check.mjs --data <資料檔.json>         檢查資料檔裡每筆 photos 的網址
//   加 --out <photos.json>：結果寫成 { 網址: { status, type, ok } }（build-restaurants.mjs 會讀）
// ok＝HTTP 200 而且 Content-Type 是 image/*。同一個網站之間隔 0.5 秒（Wikimedia 2 秒）。
// User-Agent 不能假裝成瀏覽器：Wikimedia 會對「Mozilla/5.0 …」這種 UA 回 429（T21 實測）。

import fs from 'node:fs';
import { readJson } from './lib/json-file.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
let urls = args.filter((a, i) => /^https?:\/\//.test(a) && !['--out'].includes(args[i - 1]));
if (opt('file')) urls.push(...fs.readFileSync(opt('file'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)));
const owner = new Map();
if (opt('data')) {
  for (const p of readJson(opt('data')).data) for (const ph of p.photos ?? []) {
    urls.push(ph.url);
    owner.set(ph.url, p.id);
  }
}
urls = [...new Set(urls)];
if (!urls.length) {
  console.error('用法：node scripts/photo-check.mjs [<網址>... | --file 清單 | --data 資料檔] [--out photos.json]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map();
const result = {};
for (const url of urls) {
  const host = new URL(url).host;
  const wait = (host.endsWith('wikimedia.org') ? 2000 : 500) - (Date.now() - (lastHit.get(host) ?? 0));
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  let status = null;
  let type = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'travel_helper photo-check (personal trip planning)' } });
    clearTimeout(timer);
    status = res.status;
    type = res.headers.get('content-type');
    await res.body?.cancel(); // 只看標頭，不下載圖片
  } catch (e) {
    type = `錯誤：${e.name === 'AbortError' ? '逾時' : e.message}`;
  }
  const ok = status === 200 && /^image\//.test(type ?? '');
  result[url] = { status, type, ok };
  console.log(`${ok ? 'ok ' : 'NG '} ${status ?? '-'} ${type ?? '-'} ${owner.get(url) ? owner.get(url) + ' ' : ''}${url}`);
}
const bad = Object.values(result).filter((r) => !r.ok).length;
console.error(`${urls.length} 張，打不開或不是圖片 ${bad} 張`);
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(result, null, 1) + '\n');
