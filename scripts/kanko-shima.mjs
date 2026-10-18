#!/usr/bin/env node
// 志摩市観光協会（kanko-shima.com）的景點列表（T9a）：觀光三重列表的補充。
// 「観る・遊ぶ」（purpose_cate/see）和「体験する」（purpose_cate/experience）的列表，逐筆讀詳細頁的 Information 欄位。
//
// 用法：
//   node scripts/kanko-shima.mjs fetch [--no-details] [--out <檔案>]
//       預設寫到 data/derived/kanko-shima.json（名稱、網址、列表、エリア、タグ；詳細頁的住所、電話、Webサイト、営業時間、定休日、料金）
//
// robots.txt（2026-10-18）只禁止 /cms/wp-admin/；呼叫間隔 1.1 秒；403、429 就停（CONVENTIONS §4「必須遵守」）。
// 只存事實欄位，不存介紹文（著作權屬網站）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.kanko-shima.com';
const LISTS = { see: '観る・遊ぶ', experience: '体験する' };
const UA = 'Mozilla/5.0 (compatible; travel-helper personal trip planning; 1 req/s)';
const KEEP = ['住所', '電話番号', 'Webサイト', '営業時間', '定休日', '料金', '駐車場', 'アクセス'];

export const strip = (s) =>
  s.replace(/<br\s*\/?>/g, ' / ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/(\s\/\s)+$/, '').trim();

// 列表頁：每張卡片 <li> 有 purpose/<id>/、エリア（s_area）、タグ（s_tag）、名稱 <p>
export function parseList(html) {
  const out = [];
  for (const m of html.matchAll(/<li>\s*<!-- サムネイル -->([\s\S]*?)<\/li>/g)) {
    const li = m[1];
    const id = li.match(/\/purpose\/(\d+)\//)?.[1];
    const name = li.match(/<a href="[^"]*\/purpose\/\d+\/">\s*<p>([\s\S]*?)<\/p>/)?.[1];
    if (!id || !name) continue;
    const areas = [...li.matchAll(/s_area\[\]=\d+&s_keywords=">([^<]+)</g)].map((x) => x[1].trim());
    const tags = [...li.matchAll(/s_tag\[\]=\d+&s_keywords=">([^<]+)</g)].map((x) => x[1].trim());
    out.push({ id: Number(id), name: strip(name), areas, tags });
  }
  return out;
}

// 詳細頁：Information 的 <dl><dt>欄位</dt><dd>值</dd></dl>
export function parseDetail(html) {
  const f = {};
  for (const m of html.matchAll(/<dl>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/dl>/g)) {
    const k = strip(m[1]);
    if (KEEP.includes(k) && !(k in f)) f[k] = strip(m[2]);
  }
  if (f['住所']) f['住所'] = f['住所'].replace(/^〒[\d-]+\s*/, '');
  return f;
}

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
  return res.text();
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] !== 'fetch') {
    console.error('用法：node scripts/kanko-shima.mjs fetch [--no-details] [--out <檔案>]');
    process.exit(2);
  }
  const noDetails = argv.includes('--no-details');
  const outFile = argv.includes('--out') ? path.resolve(argv[argv.indexOf('--out') + 1]) : path.join(ROOT, 'data/derived/kanko-shima.json');
  const spots = new Map();
  for (const [slug, label] of Object.entries(LISTS)) {
    let n = 0;
    for (let page = 1; page < 40; page++) {
      const html = await get(`${BASE}/purpose_cate/${slug}/${page > 1 ? `page/${page}/` : ''}`);
      if (!html) break;
      const cards = parseList(html);
      if (!cards.length) break;
      for (const c of cards) {
        const s = spots.get(c.id) ?? { ...c, url: `${BASE}/purpose/${c.id}/`, lists: [] };
        if (!s.lists.includes(label)) s.lists.push(label);
        spots.set(c.id, s);
        n++;
      }
      if (!html.includes(`/page/${page + 1}/`)) break;
    }
    console.error(`${label}：${n} 筆`);
  }
  if (!noDetails) {
    let i = 0;
    for (const s of spots.values()) {
      const html = await get(s.url);
      s.info = html ? parseDetail(html) : null;
      if (++i % 20 === 0) console.error(`  詳細頁 ${i}/${spots.size}`);
    }
  }
  const out = {
    source: `${BASE}/purpose_cate/see/、/purpose_cate/experience/（志摩市観光協会）`,
    retrieved: today(),
    note: '志摩市観光協会的景點、體驗列表（scripts/kanko-shima.mjs）。areas、tags 是列表卡片的エリア、タグ；info 是詳細頁 Information 欄位原文。只存事實，不存介紹文',
    count: spots.size,
    spots: [...spots.values()],
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.error(`寫到 ${path.relative(ROOT, outFile)}（${spots.size} 筆）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
