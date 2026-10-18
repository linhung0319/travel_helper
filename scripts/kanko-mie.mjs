#!/usr/bin/env node
// 觀光三重（kankomie.or.jp）的景點列表（T7i）：當景點候選的母體（T9a），或檢查已做完的區有沒有漏掉（伊勢 T8a 沒看這個列表）。
//
// 用法：
//   node scripts/kanko-mie.mjs fetch <ise|toba|shima> [--no-details]
//       抓「見る・遊ぶ」的列表（名稱、網址）和各類別的篩選結果（類別），再逐筆讀詳細頁的住所、座標，
//       寫到 data/derived/kanko-mie-<市>.json。--no-details 只抓列表（不讀詳細頁，沒有住所、座標）。
//   node scripts/kanko-mie.mjs missing <ise|toba|shima>
//       和這個市各區的 data/raw/<area>/candidates/spots.json、data/areas/<area>/spots.json 比對，
//       沒在候選裡的寫到 data/derived/kanko-mie-missing-<市>.json（只產生清單，不改候選檔）。
//       伊勢市的二見町歸 futami，其他歸 ise。
//
// robots.txt（2026-10-18）只禁止 /banner_click；呼叫間隔 1.1 秒；403、429 就停（CONVENTIONS §4「必須遵守」）。
// 只存名稱、網址、類別、住所、座標這些事實，不存介紹文（著作權屬網站）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.kankomie.or.jp';
const CITY = { ise: { id: 3, name: '伊勢市', areas: ['ise', 'futami'] }, toba: { id: 11, name: '鳥羽市', areas: ['toba'] }, shima: { id: 62, name: '志摩市', areas: ['shima'] } };
// 「見る・遊ぶ」（m_spot_kinds_id 1）底下的類別（2026-10-18 的篩選選項）
const CATEGORIES = {
  2: '伊勢神宮関連', 3: '歴史・文化に触れる', 4: '自然・花を愛でる', 5: 'テーマパークで遊ぶ', 6: 'キャンプ・スポーツを満喫', 7: 'フルーツ狩り・収穫',
  8: '日帰り入浴で極楽', 9: '体験プランで思い出作り', 10: '雨の日もOK', 11: '絶景スポット', 12: '海水浴・釣り', 13: '島',
};
const UA = 'Mozilla/5.0 (compatible; travel-helper personal trip planning; 1 req/s)';

const [cmd, city] = process.argv.slice(2);
const noDetails = process.argv.includes('--no-details');
if (!['fetch', 'missing'].includes(cmd) || !CITY[city]) {
  console.error('用法：node scripts/kanko-mie.mjs <fetch|missing> <ise|toba|shima> [--no-details]');
  process.exit(2);
}
const outFile = path.join(ROOT, `data/derived/kanko-mie-${city}.json`);
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
    console.error(`被擋（HTTP ${res.status}）：${url}。照規則停下來，不換方法繞過；寫在 README，T9a 改人工。`);
    process.exit(1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`);
  return res.text();
}

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const listUrl = (params, page) => {
  const q = new URLSearchParams();
  q.append('q[m_city_id_in][]', CITY[city].id);
  for (const [k, v] of params) q.append(k, v);
  if (page > 1) q.append('page', page);
  return `${BASE}/spot/index?${q}`;
};

// 列表的每一張卡片：/spot/<id> 和名稱
async function crawlList(params) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const html = await get(listUrl(params, page));
    const cards = [...html.matchAll(/<a class="d-block h-100 card[^"]*" href="\/spot\/(\d+)">[\s\S]*?<p class="card-text fw-bold[^"]*">([\s\S]*?)<\/p>/g)];
    if (!cards.length) break;
    for (const [, id, name] of cards) out.push({ id: Number(id), name: strip(name) });
    if (!new RegExp(`page=${page + 1}\\b`).test(html)) break;
  }
  return out;
}

if (cmd === 'fetch') {
  const spots = new Map();
  const all = await crawlList([['q[m_spot_kinds_id_in][]', 1]]);
  for (const s of all) spots.set(s.id, { ...s, url: `${BASE}/spot/${s.id}`, categories: [] });
  console.error(`列表 ${spots.size} 筆`);
  for (const [cid, cname] of Object.entries(CATEGORIES)) {
    const hits = await crawlList([['q[m_spot_categories_id_in][]', cid]]);
    let n = 0;
    for (const h of hits) {
      if (!spots.has(h.id)) continue; // 類別篩選可能混到其他種類（食べる・泊まる），只留「見る・遊ぶ」
      spots.get(h.id).categories.push(cname);
      n++;
    }
    console.error(`  ${cname}：${n}`);
  }
  if (!noDetails) {
    let i = 0;
    for (const s of spots.values()) {
      const html = await get(s.url);
      const fields = {};
      for (const m of html.matchAll(/bg-light fw-bold[^"]*">([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g)) fields[strip(m[1])] = strip(m[2]);
      s.address = fields['住所']?.replace(/^〒[\d-]+\s*/, '') ?? null;
      const q = html.match(/q=(-?[\d.]+),(-?[\d.]+)/);
      s.coords = q ? [Number(q[2]), Number(q[1])] : null; // [經度, 緯度]
      s.official = fields['公式URL']?.match(/https?:\/\/\S+/)?.[0] ?? null;
      if (++i % 20 === 0) console.error(`  詳細頁 ${i}/${spots.size}`);
    }
  }
  const out = {
    source: `${BASE}/spot/index（${CITY[city].name}、見る・遊ぶ）`,
    retrieved: today(),
    note: '觀光三重的景點列表（scripts/kanko-mie.mjs）。categories 來自各類別的篩選結果；address、coords 來自詳細頁（coords 是詳細頁內嵌地圖的 q=緯度,經度，存成 [經度, 緯度]）。只存事實，不存介紹文',
    count: spots.size,
    spots: [...spots.values()],
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.error(`寫到 ${path.relative(ROOT, outFile)}`);
} else {
  const list = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  // 名稱正規化：去掉空白、括號內容、記號，只比主要的字
  const norm = (s) => (s ?? '').normalize('NFKC').replace(/[（(【\[].*?[）)】\]]/g, '').replace(/[\s・･･「」『』〈〉、。,.\-－ー〜~|｜／/]/g, '').toLowerCase();
  const dist = (a, b) => {
    const r = Math.PI / 180;
    const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r);
    const y = (b[1] - a[1]) * r;
    return Math.sqrt(x * x + y * y) * 6371e3;
  };
  const known = [];
  for (const area of CITY[city].areas) {
    for (const f of [`data/raw/${area}/candidates/spots.json`, `data/areas/${area}/spots.json`]) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) continue;
      for (const x of JSON.parse(fs.readFileSync(p, 'utf8'))) known.push({ area, key: x.key ?? x.id, name: x.name?.ja ?? '', coords: x.coords ?? null, status: x.status ?? 'point' });
    }
  }
  const areaOf = (s) => (city === 'ise' ? (/二見町/.test(s.address ?? '') ? 'futami' : 'ise') : CITY[city].areas[0]);
  // 括號裡的別名也拿來比（「皇大神宮（内宮 伊勢神宮）」）
  const variants = (s) => {
    const raw = (s ?? '').normalize('NFKC');
    const inner = [...raw.matchAll(/[（(【\[]([^）)】\]]+)[）)】\]]/g)].flatMap((m) => m[1].split(/[\s・、]+/));
    return [norm(raw), ...inner.map(norm)].filter((v) => v.length >= 2);
  };
  const sameName = (a, b) => variants(a).some((x) => variants(b).some((y) => x.includes(y) || y.includes(x)));
  // 4 個字以上的共同子字串：名稱寫法不同的同一個地點（河崎のまちなみ／伊勢河崎商人館），只列成「可能是同一個」
  const common = (a, b) => {
    let best = 0;
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (a[i + k] && a[i + k] === b[j + k]) k++;
      best = Math.max(best, k);
    }
    return best;
  };
  const matched = [];
  const possible = [];
  const missing = [];
  for (const s of list.spots) {
    const hit = known.find((k) => sameName(k.name, s.name)) ?? (s.coords ? known.find((k) => k.coords && dist(k.coords, s.coords) < 150) : null);
    if (hit) {
      matched.push({ id: s.id, name: s.name, key: hit.key, status: hit.status });
      continue;
    }
    const near = known.map((k) => ({ k, c: common(norm(k.name), norm(s.name)) })).sort((a, b) => b.c - a.c)[0];
    const item = { id: s.id, name: s.name, url: s.url, area: areaOf(s), categories: s.categories, address: s.address ?? null, coords: s.coords ?? null };
    if (near && near.c >= 4) possible.push({ ...item, maybe: { key: near.k.key, name: near.k.name, status: near.k.status } });
    else missing.push(item);
  }
  const out = {
    from: path.relative(ROOT, outFile).replace(/\\/g, '/'),
    generated: today(),
    note: '觀光三重有、候選清單（含沒收錄、排除的）裡沒有的景點。比對方式：名稱（含括號裡的別名）正規化後互相包含，或座標 150 m 內，算已收；名稱有 4 個字以上相同的列在 possible（可能是同一個，要人看）。只是清單，要不要補由 T13 決定（PLAN T7i）',
    matched: matched.length,
    possibleCount: possible.length,
    missingCount: missing.length,
    possible,
    missing,
  };
  const f = path.join(ROOT, `data/derived/kanko-mie-missing-${city}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 1) + '\n');
  console.log(`對到 ${matched.length} 筆、可能是同一個 ${possible.length} 筆、候選裡沒有的 ${missing.length} 筆 → ${path.relative(ROOT, f)}`);
  for (const m of possible) console.log(`  ?  ${m.area}  ${m.name}  ≈ ${m.maybe.name}（${m.maybe.key}，${m.maybe.status}）`);
  for (const m of missing) console.log(`  ${m.area}  ${m.name}  [${m.categories.join('、')}]  ${m.address ?? ''}`);
}
