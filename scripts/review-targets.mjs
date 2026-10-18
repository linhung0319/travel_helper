#!/usr/bin/env node
// 補心得（口コミ、Google 評論）的對象清單（T8e 加入；T9e、T7h 也可以用）。規則見 CONVENTIONS §4「口コミ、Google 評論」。
//
// 用法：
//   node scripts/review-targets.mjs <area>... [--max 50] [--batch-size 20] [--extra id1,id2,...] [--out <檔案>]
//
// 餐廳：對象是 fit15 yes／split，或食べログ 3.40 以上，或 Google 4.3 以上（評論 100 則以上）。
//   優先順序：① fit15 yes／split（食べログ分數高的先）② 食べログ 3.40 以上（分數高的先）③ Google 4.3／100 則以上（評論數多的先），
//   取前 --max 家。筆記裡已經有口コミ、Google 評論來源（「[tabelog] 食べログ口コミ（」「[google-maps] Google 評論（」）的不算。
// 景點、住宿：筆記「資料量」的寫法不一（「心得 1 處（楽天 1,291 則）」這種），程式判斷不了「心得不到 2 篇」，
//   由 Claude 讀過後用 --extra 給 id（餐廳 id 也可以用 --extra 強制加入）。
// 關鍵字：照資料檔還是 null／unknown 的欄位決定（keywordsFor）。
// 分批：依 areas.json 的子地區順序，同一子地區放同一批；一批超過 batch-size × 1.25 就開新的一批，
//   子地區本身太大才拆開。輸出 [{ batch, id, type, region, keywords, tier }]。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const READ_MARK = /\[(tabelog|google-maps)\] (食べログ口コミ|Google 評論)（/;

export function restaurantTier(r) {
  const fit = r.group?.fit15;
  const t = r.ratings ?? {};
  if (fit === 'yes' || fit === 'split') return 1;
  if ((t.tabelog ?? 0) >= 3.4) return 2;
  if ((t.google ?? 0) >= 4.3 && (t.googleReviews ?? 0) >= 100) return 3;
  return null;
}

const isNull = (v) => v === null || v === undefined || v === 'unknown';

export function keywordsFor(type, x) {
  const k = ['冬'];
  if (type === 'restaurant') {
    k.unshift('中止');
    if (isNull(x.kids?.allowed)) k.push('子供', '子連れ');
    if (x.group?.fit15 === 'split' || isNull(x.group?.fit15)) k.push('団体', '予約');
    const twoF = /2\s*[階F樓]|二階/.test(JSON.stringify([x.accessibility ?? null, x.group?.source ?? null]));
    if (!x.seating?.length || isNull(x.accessibility?.barrierFree) && !x.accessibility?.note || twoF) k.push('階段', '2階', '座敷');
  } else if (type === 'spot') {
    if (isNull(x.kids?.friendly)) k.push('子供');
    if (isNull(x.accessibility?.stairs)) k.push('階段');
  } else if (type === 'lodging') {
    if (isNull(x.accessibility?.kids)) k.push('子供');
    if (isNull(x.accessibility?.elevator) || isNull(x.accessibility?.stairs)) k.push('階段');
  }
  return k;
}

export function makeBatches(items, regionOrder, size = 20) {
  const byRegion = new Map();
  for (const it of items) {
    if (!byRegion.has(it.region)) byRegion.set(it.region, []);
    byRegion.get(it.region).push(it);
  }
  const regions = [...byRegion.keys()].sort((a, b) => (regionOrder.indexOf(a) + 1 || 999) - (regionOrder.indexOf(b) + 1 || 999));
  const batches = [];
  let cur = [];
  for (const reg of regions) {
    const list = byRegion.get(reg);
    if (list.length > size * 1.25) {
      if (cur.length) batches.push(cur), (cur = []);
      const n = Math.ceil(list.length / size);
      const per = Math.ceil(list.length / n);
      for (let i = 0; i < list.length; i += per) batches.push(list.slice(i, i + per));
      continue;
    }
    if (cur.length + list.length > size * 1.25) batches.push(cur), (cur = []);
    cur.push(...list);
  }
  if (cur.length) batches.push(cur);
  return batches.flatMap((b, i) => b.map((it) => ({ batch: i + 1, ...it })));
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const areas = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!areas.length) {
    console.error('用法：node scripts/review-targets.mjs <area>... [--max 50] [--batch-size 20] [--extra id,...] [--out 檔案]');
    process.exit(2);
  }
  const max = Number(opt('max', 50));
  const size = Number(opt('batch-size', 20));
  const extra = new Set((opt('extra', '') ?? '').split(',').filter(Boolean));
  const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
  const areaDefs = read('data/areas.json');
  const regionOrder = areas.flatMap((a) => (areaDefs.find((x) => x.id === a)?.regions ?? []).map((r) => r.id));
  const dossierRead = (area, id) => {
    const f = path.join(ROOT, `data/raw/${area}/dossiers/${id}.md`);
    return fs.existsSync(f) && READ_MARK.test(fs.readFileSync(f, 'utf8'));
  };

  const rest = [];
  const skipped = [];
  const others = [];
  for (const area of areas) {
    for (const r of read(`data/areas/${area}/restaurants.json`)) {
      const tier = extra.has(r.id) ? 0 : restaurantTier(r);
      if (tier === null) continue;
      if (dossierRead(area, r.id)) { skipped.push(r.id); continue; }
      rest.push({ id: r.id, type: 'restaurant', region: r.region, keywords: keywordsFor('restaurant', r), tier, _r: r });
    }
    for (const [file, type] of [['spots', 'spot'], ['lodging', 'lodging']]) {
      for (const x of read(`data/areas/${area}/${file}.json`)) {
        if (!extra.has(x.id)) continue;
        others.push({ id: x.id, type, region: x.region, keywords: keywordsFor(type, x), tier: null });
      }
    }
  }
  const score = (x) => {
    const t = x._r.ratings ?? {};
    return x.tier === 3 ? t.googleReviews ?? 0 : t.tabelog ?? 0;
  };
  rest.sort((a, b) => a.tier - b.tier || score(b) - score(a));
  const picked = rest.slice(0, max);
  const cut = rest.slice(max);
  const items = [...picked, ...others].map(({ _r, ...x }) => x);
  const out = makeBatches(items, regionOrder, size);

  const tiers = (l) => [0, 1, 2, 3].map((t) => l.filter((x) => x.tier === t).length);
  console.log(`餐廳 符合 ${rest.length + skipped.length}（已讀過 ${skipped.length}：${skipped.join('、') || '無'}）；取 ${picked.length}（extra／①／②／③ = ${tiers(picked).join('／')}），沒取 ${cut.length}（${tiers(cut).join('／')}）`);
  console.log(`景點、住宿（--extra）${others.length}`);
  const nb = Math.max(...out.map((x) => x.batch));
  for (let b = 1; b <= nb; b++) {
    const l = out.filter((x) => x.batch === b);
    const regs = [...new Set(l.map((x) => x.region))];
    console.log(`第 ${b} 批 ${l.length} 筆：${regs.map((r) => `${r} ${l.filter((x) => x.region === r).length}`).join('、')}`);
  }
  const file = opt('out', null);
  if (file) {
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    console.log(`寫入 ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
