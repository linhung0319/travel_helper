#!/usr/bin/env node
// 評分一致性檢查（T7g；T8f、T9f、T19 也用）：把 assessment.scores.recommend 和評分數字明顯矛盾的資料點列出來，
// 給人確認理由是否合理（CONVENTIONS §5.1「一致性」）。不改資料檔。
//
// 用法：node scripts/assessment-check.mjs <area> [<area> ...] [--types spot,lodging,restaurant] [--stdout]
//   例：node scripts/assessment-check.mjs toba
//       node scripts/assessment-check.mjs ise futami
// 輸出：data/derived/assessment-check-<area>.json（給程式）和 .md（給人看）；--stdout 只印 Markdown、不寫檔。
//
// 檢查的規則（門檻在下面的 RULES，改門檻就改這裡；判斷標準見 data/raw/toba/assessment-notes.md）：
//   共通：tier 和 recommend 對不上（5＝S、4＝A、1～3＝B）；confidence high 但評論數很少。
//   餐廳：高星但食べログ或 Google 偏低；低星但食べログ或 Google 很高；4 星以上但評論很少。
//   景點：只有 Google：高星但 Google 偏低或評論少；低星但 Google 很高而且評論多。
//   住宿：「訂房網分數」＝楽天、じゃらん、Airbnb、Booking.com÷2 裡評論數最多的；高星但訂房網或 Google 偏低；
//         低星但兩邊都很高；4 星以上但兩邊評論都很少。
// 被列出來不代表打錯：體驗型、評論數上限、心得負評等理由寫在 rationale.recommend，人工看過後在 docs/decisions-pending.md 記處理。
// 沒有 assessment 的資料點（例如港口）只計數、不檢查。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const optIdx = args.indexOf('--types');
const types = optIdx >= 0 ? args[optIdx + 1].split(',') : ['spot', 'lodging', 'restaurant'];
const toStdout = args.includes('--stdout');
const areas = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--types');
if (areas.length === 0) {
  console.error('用法：node scripts/assessment-check.mjs <area> [<area> ...] [--types spot,lodging,restaurant] [--stdout]');
  process.exit(2);
}

const FILES = { spot: 'spots.json', lodging: 'lodging.json', restaurant: 'restaurants.json' };
const TIER = (rec) => (rec === 5 ? 'S' : rec === 4 ? 'A' : rec == null ? null : 'B');

// 門檻。數字是「明顯矛盾」的界線，比 assessment-notes.md 的打分門檻寬一級，只抓差很多的。
const RULES = {
  restaurant: {
    star5: { tabelogMin: 3.5, googleMin: 4.0 }, // 5 星但任一邊低於這個
    star4: { tabelogMin: 3.3, googleMin: 3.8 }, // 4 星但任一邊低於這個
    low: { maxStar: 2, tabelogHigh: 3.5, googleHigh: 4.4, googleReviewsMin: 100 }, // 2 星以下但任一邊很高
    few: { minStar: 4, tabelogReviewsMax: 100, googleReviewsMax: 300 }, // 4 星以上但兩邊評論都少
  },
  spot: {
    star5: { googleMin: 4.2, googleReviewsMin: 500 },
    star4: { googleMin: 4.0 },
    low: { maxStar: 2, googleHigh: 4.4, googleReviewsMin: 200 },
    few: { minStar: 4, googleReviewsMax: 100 },
  },
  lodging: {
    star5: { siteMin: 4.5, googleMin: 4.2 },
    star4: { siteMin: 4.2, googleMin: 3.9 },
    low: { maxStar: 2, siteHigh: 4.5, googleHigh: 4.3 },
    few: { minStar: 4, siteReviewsMax: 100, googleReviewsMax: 100 },
  },
  common: { highConfidenceReviewsMin: 300 },
};

const fmt = (v, n) => (v == null ? '—' : n == null ? `${v}` : `${v}（${n ?? '?'} 則）`);

// 住宿的訂房網分數（assessment-notes.md「主要訂房網」）：楽天、じゃらん、Airbnb、Booking.com（10 分制換成 5 分制）
// 裡評論數最多的那個；評論數都沒記時取這個順序第一個有分數的
function lodgingSite(r) {
  const sites = [
    { name: '楽天', score: r.rakuten, reviews: r.rakutenReviews },
    { name: 'じゃらん', score: r.jalan, reviews: r.jalanReviews },
    { name: 'Airbnb', score: r.airbnb, reviews: r.airbnbReviews },
    { name: 'Booking÷2', score: r.booking == null ? null : Math.round((r.booking / 2) * 100) / 100, reviews: r.bookingReviews },
  ].filter((s) => s.score != null);
  if (sites.length === 0) return null;
  const best = sites.reduce((a, b) => ((b.reviews ?? -1) > (a.reviews ?? -1) ? b : a));
  return { ...best, reviews: best.reviews ?? null };
}

function ratingText(type, r) {
  if (!r) return '沒有評分';
  if (type === 'restaurant') return `食べログ ${fmt(r.tabelog, r.tabelogReviews)}、Google ${fmt(r.google, r.googleReviews)}`;
  if (type === 'spot') return `Google ${fmt(r.google, r.googleReviews)}`;
  const s = lodgingSite(r);
  return `${s ? `${s.name} ${fmt(s.score, s.reviews)}` : '訂房網 —'}、Google ${fmt(r.google, r.googleReviews)}`;
}

function totalReviews(type, r) {
  if (!r) return 0;
  const n = (v) => v ?? 0;
  if (type === 'restaurant') return n(r.tabelogReviews) + n(r.googleReviews);
  if (type === 'spot') return n(r.googleReviews);
  return n(r.rakutenReviews) + n(r.jalanReviews) + n(r.googleReviews);
}

// 回傳 [{ rule, message }]
function check(type, x) {
  const out = [];
  const rec = x.assessment.scores.recommend;
  const r = x.ratings ?? {};
  const R = RULES[type];
  const push = (rule, message) => out.push({ rule, message });

  if (x.tier !== TIER(rec)) push('tier-mismatch', `tier ${x.tier} 和 recommend ${rec} 對不上（應為 ${TIER(rec)}）`);
  if (x.assessment.confidence === 'high' && totalReviews(type, r) < RULES.common.highConfidenceReviewsMin)
    push('confidence-high-few', `confidence high 但評論合計只有 ${totalReviews(type, r)} 則`);
  if (rec == null) return out;

  if (type === 'restaurant') {
    const lowTb = (min) => r.tabelog != null && r.tabelog < min;
    const lowG = (min) => r.google != null && r.google < min;
    if (rec === 5 && (lowTb(R.star5.tabelogMin) || lowG(R.star5.googleMin)))
      push('high-star-low-rating', `5 星但食べログ或 Google 偏低（門檻 ${R.star5.tabelogMin}／${R.star5.googleMin}）`);
    if (rec === 4 && (lowTb(R.star4.tabelogMin) || lowG(R.star4.googleMin)))
      push('high-star-low-rating', `4 星但食べログ或 Google 偏低（門檻 ${R.star4.tabelogMin}／${R.star4.googleMin}）`);
    if (rec <= R.low.maxStar && ((r.tabelog ?? 0) >= R.low.tabelogHigh || ((r.google ?? 0) >= R.low.googleHigh && (r.googleReviews ?? 0) >= R.low.googleReviewsMin)))
      push('low-star-high-rating', `${rec} 星但食べログ ${R.low.tabelogHigh} 以上或 Google ${R.low.googleHigh} 以上（${R.low.googleReviewsMin} 則以上）`);
    if (rec >= R.few.minStar && (r.tabelogReviews ?? 0) < R.few.tabelogReviewsMax && (r.googleReviews ?? 0) < R.few.googleReviewsMax)
      push('high-star-few-reviews', `${rec} 星但食べログ不到 ${R.few.tabelogReviewsMax} 則、Google 不到 ${R.few.googleReviewsMax} 則`);
  } else if (type === 'spot') {
    const g = r.google;
    const n = r.googleReviews ?? 0;
    if (rec === 5 && (g == null || g < R.star5.googleMin || n < R.star5.googleReviewsMin))
      push('high-star-low-rating', `5 星但 Google 不到 ${R.star5.googleMin} 或不到 ${R.star5.googleReviewsMin} 則`);
    if (rec === 4 && g != null && g < R.star4.googleMin) push('high-star-low-rating', `4 星但 Google 不到 ${R.star4.googleMin}`);
    if (rec <= R.low.maxStar && (g ?? 0) >= R.low.googleHigh && n >= R.low.googleReviewsMin)
      push('low-star-high-rating', `${rec} 星但 Google ${R.low.googleHigh} 以上而且 ${R.low.googleReviewsMin} 則以上`);
    if (rec >= R.few.minStar && n < R.few.googleReviewsMax) push('high-star-few-reviews', `${rec} 星但 Google 不到 ${R.few.googleReviewsMax} 則`);
  } else {
    const s = lodgingSite(r);
    const g = r.google;
    const lowS = (min) => s != null && s.score < min;
    const lowG = (min) => g != null && g < min;
    if (rec === 5 && (lowS(R.star5.siteMin) || lowG(R.star5.googleMin)))
      push('high-star-low-rating', `5 星但訂房網或 Google 偏低（門檻 ${R.star5.siteMin}／${R.star5.googleMin}）`);
    if (rec === 4 && (lowS(R.star4.siteMin) || lowG(R.star4.googleMin)))
      push('high-star-low-rating', `4 星但訂房網或 Google 偏低（門檻 ${R.star4.siteMin}／${R.star4.googleMin}）`);
    if (rec <= R.low.maxStar && s != null && s.score >= R.low.siteHigh && (g ?? 0) >= R.low.googleHigh)
      push('low-star-high-rating', `${rec} 星但訂房網 ${R.low.siteHigh} 以上而且 Google ${R.low.googleHigh} 以上`);
    if (rec >= R.few.minStar && (s?.reviews ?? 0) < R.few.siteReviewsMax && (r.googleReviews ?? 0) < R.few.googleReviewsMax)
      push('high-star-few-reviews', `${rec} 星但訂房網、Google 都不到 ${R.few.googleReviewsMax} 則（訂房網評論數沒記的當 0）`);
  }
  return out;
}

const TYPE_ZH = { spot: '景點', lodging: '住宿', restaurant: '餐廳' };
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // 本地日期

for (const area of areas) {
  const items = [];
  const counts = {};
  for (const type of types) {
    const file = path.join(ROOT, 'data/areas', area, FILES[type]);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    const c = { total: data.length, assessed: 0, notAssessed: [], flagged: 0, byStar: {} };
    for (const x of data) {
      if (!x.assessment) {
        c.notAssessed.push(x.id);
        continue;
      }
      c.assessed++;
      const rec = x.assessment.scores.recommend;
      c.byStar[rec ?? 'null'] = (c.byStar[rec ?? 'null'] ?? 0) + 1;
      const found = check(type, x);
      if (found.length) c.flagged++;
      for (const f of found)
        items.push({
          type,
          id: x.id,
          name: x.name?.ja ?? x.name?.zh ?? x.id,
          recommend: rec,
          tier: x.tier,
          confidence: x.assessment.confidence,
          ratings: ratingText(type, x.ratings),
          rule: f.rule,
          message: f.message,
          rationale: x.assessment.rationale?.recommend ?? null,
        });
    }
    counts[type] = c;
  }
  if (Object.keys(counts).length === 0) {
    console.error(`${area}：data/areas/${area}/ 沒有 ${types.map((t) => FILES[t]).join('、')}，跳過`);
    continue;
  }

  const md = [];
  md.push(`# 評分一致性檢查：${area}（${today}）`, '');
  md.push('`node scripts/assessment-check.mjs` 產生，不要手改。列出來的不一定是錯的，人工確認 `rationale.recommend` 的理由；處理寫在 `docs/decisions-pending.md`。', '');
  for (const [type, c] of Object.entries(counts)) {
    const stars = Object.entries(c.byStar)
      .sort()
      .map(([k, v]) => `${k} 星 ${v}`)
      .join('、');
    md.push(`- ${TYPE_ZH[type]}：${c.total} 筆，評分 ${c.assessed}（${stars || '—'}），列出 ${c.flagged} 筆${c.notAssessed.length ? `；沒有 assessment ${c.notAssessed.length} 筆` : ''}`);
  }
  md.push('');
  if (items.length === 0) md.push('沒有列出的項目。');
  else {
    md.push('| 類型 | id | 名稱 | 星 | 評分 | 規則 | 說明 | 推薦度理由 |', '|---|---|---|---|---|---|---|---|');
    for (const it of items)
      md.push(`| ${TYPE_ZH[it.type]} | \`${it.id}\` | ${it.name} | ${it.recommend} | ${it.ratings} | ${it.rule} | ${it.message} | ${(it.rationale ?? '').replace(/\|/g, '｜')} |`);
  }
  const mdText = md.join('\n') + '\n';

  if (toStdout) {
    process.stdout.write(mdText);
    continue;
  }
  const outDir = path.join(ROOT, 'data/derived');
  fs.mkdirSync(outDir, { recursive: true });
  const json = { area, generated: today, script: 'scripts/assessment-check.mjs', rules: RULES, counts, items };
  fs.writeFileSync(path.join(outDir, `assessment-check-${area}.json`), JSON.stringify(json, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, `assessment-check-${area}.md`), mdText);
  console.log(`${area}：列出 ${items.length} 項（${Object.entries(counts).map(([t, c]) => `${TYPE_ZH[t]} ${c.flagged}`).join('、')}）→ data/derived/assessment-check-${area}.{json,md}`);
}
