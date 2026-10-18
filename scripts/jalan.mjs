#!/usr/bin/env node
// じゃらん的住宿評分（總評分、評論數）（T7i）。楽天沒有的補充；方案、價格是動態載入，抓不到，照舊用楽天 API。
//
// 用法：
//   node scripts/jalan.mjs list <地區代碼>...
//       讀じゃらん的地區列表（https://www.jalan.net/240000/LRG_<代碼>/pageN.html），存成 data/derived/jalan-list-<代碼>.json
//       （旅館 ID、名稱、評分、評論數），給 apply 對名稱用。三重縣：鳥羽 241100、南鳥羽 241300、伊勢・二見 241000、志摩 241400
//   node scripts/jalan.mjs yad <旅館ID>...
//       讀旅館頁（https://www.jalan.net/yad<ID>/）的評分，一行一筆印出
//   node scripts/jalan.mjs apply <area> --lists 241100,241300 [--map 資料點id=旅館ID,...] [--dry-run]
//       對 data/areas/<area>/lodging.json 每一筆：旅館 ID 先看既有的じゃらん網址，沒有就用名稱對地區列表（--map 可以手動指定）；
//       再讀旅館頁拿評分，寫進 ratings.jalan、ratings.jalanReviews，sources 加旅館頁。
//       已有的值和旅館頁不同時以旅館頁為準，舊值寫進 extra.conflicts（PLAN T7i）。只動 ratings、sources、extra.conflicts。
//
// 頁面是 Shift_JIS：取 arrayBuffer() 再用 TextDecoder('shift_jis') 解碼（res.text()、WebFetch 會亂碼）。
// robots.txt（2026-10-18）沒有禁止 /yad…/ 和地區列表；呼叫間隔 1.1 秒；403、429 就停。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from './lib/json-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (compatible; travel-helper personal trip planning; 1 req/s)';
const args = process.argv.slice(2);
const [cmd, ...rest] = args;
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url) {
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 403 || res.status === 429) {
    console.error(`被擋（HTTP ${res.status}）：${url}。照規則停下來，不換方法繞過。`);
    process.exit(1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`);
  return new TextDecoder('shift_jis').decode(await res.arrayBuffer());
}

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function readList(code) {
  const out = new Map();
  for (let page = 1; page < 40; page++) {
    const html = await get(`https://www.jalan.net/240000/LRG_${code}/${page === 1 ? '' : `page${page}.html`}`);
    if (!html) break;
    // 一間一個 <li id="…yadNo123456" class="p-yadoCassette …">；PR 欄會重複出現同一間，用 ID 去重
    const items = html.split(/<li id="(?:sa_)?yadNo(\d+)"/).slice(1);
    let added = 0;
    for (let i = 0; i < items.length; i += 2) {
      const yadNo = items[i];
      const block = items[i + 1].slice(0, 20000);
      const name = block.match(/facilityName">([^<]+)/)?.[1];
      if (!name || out.has(yadNo)) continue;
      const rating = Number(block.match(/summaryaverage-num">([\d.]+)/)?.[1]) || null;
      const reviews = Number(strip(block.match(/summarykuchikomi__totalNumber">([\s\S]*?)<\/span>\s*<\/span>|summarykuchikomi__totalNumber">([\s\S]*?件)/)?.[0] ?? '').match(/([\d,]+)件/)?.[1]?.replace(/,/g, '')) || null;
      out.set(yadNo, { yadNo: Number(yadNo), name: strip(name), rating, reviews });
      added++;
    }
    if (!added || !html.includes(`selectPage('${page * 30}'`)) break;
  }
  return [...out.values()];
}

async function readYad(yadNo) {
  const url = `https://www.jalan.net/yad${yadNo}/`;
  const html = await get(url);
  if (!html) return { yadNo, url, error: '404' };
  const name = html.match(/"@type"\s*:\s*"(?:Hotel|LodgingBusiness)"[\s\S]{0,300}?"name"\s*:\s*"([^"]+)"/)?.[1] ?? html.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const rating = Number(html.match(/"ratingValue"\s*:\s*"?([\d.]+)/)?.[1]) || null;
  const reviews = Number(html.match(/"reviewCount"\s*:\s*"?(\d+)/)?.[1]) || null;
  return { yadNo, url, name: name && strip(name), rating, reviews };
}

if (cmd === 'list') {
  for (const code of positional) {
    const list = await readList(code);
    const f = path.join(ROOT, `data/derived/jalan-list-${code}.json`);
    fs.writeFileSync(f, JSON.stringify({ source: `https://www.jalan.net/240000/LRG_${code}/`, retrieved: today(), count: list.length, hotels: list }, null, 1) + '\n');
    console.log(`LRG_${code}：${list.length} 間 → ${path.relative(ROOT, f)}`);
  }
} else if (cmd === 'yad') {
  for (const id of positional) console.log(JSON.stringify(await readYad(id)));
} else if (cmd === 'apply') {
  const area = positional[0];
  const lists = (opt('lists') ?? '').split(',').filter(Boolean).flatMap((c) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/derived/jalan-list-${c}.json`), 'utf8')).hotels);
  const manual = Object.fromEntries((opt('map') ?? '').split(',').filter(Boolean).map((p) => p.split('=')));
  const file = path.join(ROOT, `data/areas/${area}/lodging.json`);
  const { data, eol } = readJson(file);
  const norm = (s) => (s ?? '').normalize('NFKC').replace(/[【\[（(「『].*?[】\]）)」』]/g, '').replace(/[\s　・･|｜／/〜~\-－ー、。,.!！]/g, '').toLowerCase();
  const D = today();
  let changed = 0;
  for (const x of data) {
    const known = [x.bookingLinks?.jalan, ...(x.sources ?? []).map((s) => s.url)].find((u) => /jalan\.net\/yad\d+/.test(u ?? ''));
    let yadNo = manual[x.id] ?? known?.match(/yad(\d+)/)?.[1] ?? null;
    let how = manual[x.id] ? '手動' : known ? '既有網址' : null;
    if (!yadNo) {
      const n = norm(x.name.ja);
      const hits = lists.filter((h) => {
        const m = norm(h.name);
        return n.length >= 2 && (m.includes(n) || n.includes(m));
      });
      if (hits.length === 1) [yadNo, how] = [String(hits[0].yadNo), `名稱（${hits[0].name}）`];
      else if (hits.length > 1) {
        console.log(`?  ${x.id}  ${x.name.ja}：列表有 ${hits.length} 間名稱相近，沒有自動對（用 --map 指定）：${hits.map((h) => `${h.yadNo} ${h.name}`).join('／')}`);
        continue;
      }
    }
    if (!yadNo) {
      console.log(`-  ${x.id}  ${x.name.ja}：じゃらん列表找不到（維持 null）`);
      continue;
    }
    const r = await readYad(yadNo);
    if (r.error || r.rating == null) {
      console.log(`-  ${x.id}  yad${yadNo}：${r.error ?? '旅館頁沒有クチコミ総合（じゃらん近一年評論數不足時不顯示分數）'}，維持 null`);
      continue;
    }
    const before = { jalan: x.ratings?.jalan ?? null, jalanReviews: x.ratings?.jalanReviews ?? null };
    const after = { jalan: r.rating, jalanReviews: r.reviews };
    x.ratings ??= {};
    // 只有分數不同才算衝突（評論數每天都會增加，舊資料也常常沒記評論數）
    if (before.jalan != null && before.jalan !== after.jalan) {
      x.extra ??= {};
      (x.extra.conflicts ??= []).push(`じゃらん評分：舊值 ${before.jalan}／${before.jalanReviews ?? '?'} 則，${D} 旅館頁 ${after.jalan}／${after.jalanReviews} 則（scripts/jalan.mjs，以旅館頁為準）`);
    }
    x.ratings.jalan = after.jalan;
    x.ratings.jalanReviews = after.jalanReviews;
    x.sources ??= [];
    const src = x.sources.find((s) => s.url.replace(/\/$/, '') === r.url.replace(/\/$/, ''));
    if (src) src.retrieved = D;
    else x.sources.push({ type: 'booking-site', url: r.url, retrieved: D, note: 'じゃらん クチコミ総合、評論數（scripts/jalan.mjs）' });
    changed++;
    console.log(`ok ${x.id}  yad${yadNo}（${how}）${r.name}：${before.jalan ?? '-'} → ${after.jalan}／${after.jalanReviews} 則`);
  }
  console.log(`寫入 ${changed} 間（${area} 共 ${data.length} 間）`);
  if (args.includes('--dry-run')) console.error('（--dry-run，沒有寫檔）');
  else writeJson(file, data, eol);
} else {
  console.error('用法：node scripts/jalan.mjs <list|yad|apply> …（說明見檔案開頭）');
  process.exit(2);
}
