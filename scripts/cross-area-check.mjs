#!/usr/bin/env node
// 跨區整理檢查（T13）：把五個區域的資料點放在一起看，輸出給人看的報告。除了 --write-tags，不改資料檔。
//
// 用法：node scripts/cross-area-check.mjs [--stdout] [--write-tags]
// 輸出：data/derived/cross-area-check.json（給程式）和 .md（給人看）；--stdout 只印 Markdown、不寫檔。
// --write-tags：把第 3 項「可以從結構化欄位補」的 tags 寫回 data/areas/（只加不刪），其他項目照樣不改資料檔。
//
// 檢查的項目：
//   1. 重複候選：同類型而且 Google 連結（cid）、食べログ連結、楽天施設番号或日文名稱相同；
//      或同類型、直線 30 m 內而且名稱有一邊包含另一邊。住宿和它的 `-dining`（extra.lodgingId）不算重複。
//   2. ID：kebab-case、以區域 ID 開頭；`-dining` 結尾的要有 extra.lodgingId 或對得到住宿。
//   3. 標籤：tags、cuisine 不在固定清單（CONVENTIONS §5.3）；照「判斷細則」可以從結構化欄位補、但還沒補的 tags
//      （景點：indoor、stairs 多、kids.friendly high；住宿：group.wholeRental → 包棟，extra.onsen 寫天然溫泉、源泉或泉質 → 溫泉）。
//   4. 分級分布：各區、各類型的 S／A／B 和 A 以上的比例（§5.1：超過約 25% 要看門檻）。
//   5. 車站：每個車站（stations.json）步行圈內的餐廳（anchors）有幾家午餐、晚餐、fit15 yes；
//      景點、住宿的 nearestStation 指到它的有幾筆。
//   6. 子地區：每個子地區的景點、住宿、餐廳筆數。
//   7. 可信度：S、A 但 confidence low；營業狀態或 2 月營業沒確認的景點（winterFit 的理由）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tripDays, isLunch as isLunchOn, isDinner as isDinnerOn } from './lib/trip-hours.mjs';
import { readJson, writeJson } from './lib/json-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toStdout = process.argv.includes('--stdout');
const writeTags = process.argv.includes('--write-tags');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));

const AREAS = ['shima', 'toba', 'futami', 'ise', 'kix', 'osaka'];
const FILES = { spot: 'spots', lodging: 'lodging', restaurant: 'restaurants' };
const TAGS = ['室內', '雨天備案', '親子', '長輩友善', '長階梯', '展望', '神社寺院', '海邊', '體驗', '溫泉', '包棟', '無障礙'];
const CUISINE = ['海鮮丼', '壽司', '浜焼き・貝', '牡蠣', '伊勢海老・高級海鮮', '定食・食堂', '和食・割烹', '烏龍麵・蕎麥', '燒肉・肉料理', '洋食・義式', '咖啡・甜點', '居酒屋', '其他'];

const areasJson = read('data/areas.json');
const stations = read('data/stations.json');
const points = [];
for (const area of AREAS) {
  for (const [type, file] of Object.entries(FILES)) {
    const p = `data/areas/${area}/${file}.json`;
    if (fs.existsSync(path.join(ROOT, p))) for (const x of read(p)) points.push({ ...x, type });
  }
}
const byId = new Map(points.map((x) => [x.id, x]));
const days = tripDays('2027-02-02', '2027-02-13', ['2027-02-11']);

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const norm = (s) => (s ?? '').normalize('NFKC').replace(/[\s・()（）「」『』〜～]/g, '').toLowerCase();
const isPair = (a, b) => [a, b].some((x) => x.extra?.lodgingId === (x === a ? b : a).id || x.id === `${(x === a ? b : a).id}-dining`);

// 1. 重複候選
const dups = [];
const keyOf = {
  gm: (x) => x.links?.googleMaps?.match(/cid=\d+/)?.[0],
  tabelog: (x) => x.links?.tabelog?.replace(/\/+$/, ''),
  rakuten: (x) => x.rakutenHotelNo ?? undefined,
  name: (x) => norm(x.name?.ja) || undefined,
};
for (let i = 0; i < points.length; i++) {
  for (let j = i + 1; j < points.length; j++) {
    const a = points[i];
    const b = points[j];
    if (a.type !== b.type || isPair(a, b)) continue;
    const why = Object.entries(keyOf).filter(([, f]) => f(a) !== undefined && f(a) === f(b)).map(([k]) => k);
    if (a.coords && b.coords) {
      const d = dist(a.coords, b.coords);
      const na = norm(a.name?.ja);
      const nb = norm(b.name?.ja);
      if (d < 30 && na && nb && (na.includes(nb) || nb.includes(na))) why.push(`近 ${Math.round(d)} m`);
    }
    if (why.length) dups.push({ a: a.id, b: b.id, why, crossArea: a.area !== b.area });
  }
}

// 2. ID
const idIssues = [];
for (const x of points) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x.id)) idIssues.push({ id: x.id, issue: '不是 kebab-case' });
  if (!x.id.startsWith(`${x.area}-`)) idIssues.push({ id: x.id, issue: `沒有以區域 ${x.area} 開頭` });
  if (x.type === 'restaurant' && x.id.endsWith('-dining') && !x.extra?.lodgingId && !byId.has(x.id.replace(/-dining$/, ''))) {
    idIssues.push({ id: x.id, issue: '-dining 但沒有 extra.lodgingId，也對不到住宿（住宿沒收錄的館內餐廳）' });
  }
}

// 3. 標籤
const tagIssues = [];
const tagMissing = [];
// 天然溫泉：寫了天然溫泉、源泉、泉質或溫泉名；人工溫泉、非溫泉、停止使用的不算
const ONSEN_YES = /天然|源泉|単純泉|單純泉|塩化物|氯化物|鹼性泉|アルカリ性?単純|[^工]温泉「|[^工]溫泉「|美里温泉|浜島溫泉|伊勢志摩溫泉/;
const ONSEN_NO = /人工|非溫泉|非温泉|無溫泉|不是天然|停止使用/;
const isNaturalOnsen = (s) => typeof s === 'string' && ONSEN_YES.test(s) && !ONSEN_NO.test(s);
const derivedTags = (x) => {
  const t = [];
  if (x.type === 'spot') {
    if (x.indoor === true) t.push('室內', '雨天備案');
    if (x.accessibility?.stairs === '多') t.push('長階梯');
    if (x.kids?.friendly === 'high') t.push('親子');
  }
  if (x.type === 'lodging' && x.group?.wholeRental === true) t.push('包棟');
  if (x.type === 'lodging' && isNaturalOnsen(x.extra?.onsen)) t.push('溫泉');
  return t;
};
for (const x of points) {
  for (const t of x.tags ?? []) if (!TAGS.includes(t)) tagIssues.push({ id: x.id, field: 'tags', value: t });
  for (const c of x.cuisine ?? []) if (!CUISINE.includes(c)) tagIssues.push({ id: x.id, field: 'cuisine', value: c });
  const miss = derivedTags(x).filter((t) => !(x.tags ?? []).includes(t));
  if (miss.length) tagMissing.push({ id: x.id, add: miss });
}

// 4. 分級分布
const tiers = [];
for (const area of AREAS) {
  for (const type of Object.keys(FILES)) {
    const xs = points.filter((x) => x.area === area && x.type === type);
    if (!xs.length) continue;
    const c = { S: 0, A: 0, B: 0, none: 0 };
    for (const x of xs) c[x.tier ?? 'none']++;
    const rated = xs.length - c.none;
    tiers.push({ area, type, total: xs.length, ...c, aOrAbove: rated ? Math.round(((c.S + c.A) / rated) * 100) : null });
  }
}

// 5. 車站
const restaurants = points.filter((x) => x.type === 'restaurant');
const stationRows = stations.map((s) => {
  const rs = restaurants.filter((r) => (r.anchors ?? []).some((a) => a.id === s.id));
  return {
    id: s.id,
    name: s.name?.ja,
    area: s.area,
    restaurants: rs.length,
    lunch: rs.filter((r) => r.hours && isLunchOn(r, days)).length,
    dinner: rs.filter((r) => r.hours && isDinnerOn(r, days)).length,
    fit15: rs.filter((r) => r.group?.fit15 === 'yes').length,
    spots: points.filter((x) => x.type === 'spot' && x.nearestStation?.id === s.id).length,
    lodging: points.filter((x) => x.type === 'lodging' && x.nearestStation?.id === s.id).length,
  };
});

// 6. 子地區
const regionRows = [];
for (const a of areasJson) {
  for (const r of a.regions ?? []) {
    const xs = points.filter((x) => x.region === r.id);
    regionRows.push({
      area: a.id,
      region: r.id,
      name: r.name?.ja ?? r.name,
      needsCar: r.needsCar ?? null,
      spot: xs.filter((x) => x.type === 'spot').length,
      lodging: xs.filter((x) => x.type === 'lodging').length,
      restaurant: xs.filter((x) => x.type === 'restaurant').length,
    });
  }
}

// 7. 可信度
const lowConfTop = points
  .filter((x) => ['S', 'A'].includes(x.tier) && x.assessment?.confidence === 'low')
  .map((x) => ({ id: x.id, name: x.name?.ja, tier: x.tier, why: x.assessment?.rationale?.recommend ?? null }));
const winterUnsure = points
  .filter((x) => x.type === 'spot' && /未確認|沒明寫|沒有來源|不明|很可能停航|可能休業/.test(x.assessment?.rationale?.winterFit ?? ''))
  .map((x) => ({ id: x.id, name: x.name?.ja, tier: x.tier, winterFit: x.assessment.scores.winterFit, why: x.assessment.rationale.winterFit }));

const report = { generated: new Date().toISOString().slice(0, 10), counts: Object.fromEntries(Object.keys(FILES).map((t) => [t, points.filter((x) => x.type === t).length])), dups, idIssues, tagIssues, tagMissing, tiers, stations: stationRows, regions: regionRows, lowConfTop, winterUnsure };

// Markdown
const md = [];
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
md.push(`# 跨區整理檢查（T13，scripts/cross-area-check.mjs）\n\n產生：${report.generated}。資料點：景點 ${report.counts.spot}、住宿 ${report.counts.lodging}、餐廳 ${report.counts.restaurant}。`);
md.push(`## 1. 重複候選（${dups.length}）\n\n住宿和它的 \`-dining\` 不算。` + (dups.length ? '\n\n' + table(['A', 'B', '依據', '跨區'], dups.map((d) => [d.a, d.b, d.why.join('、'), d.crossArea ? '是' : ''])) : '\n\n沒有。'));
md.push(`## 2. ID（${idIssues.length}）` + (idIssues.length ? '\n\n' + table(['ID', '問題'], idIssues.map((d) => [d.id, d.issue])) : '\n\n沒有。'));
md.push(`## 3. 標籤\n\n不在固定清單：${tagIssues.length ? tagIssues.map((t) => `${t.id} ${t.field}「${t.value}」`).join('、') : '沒有'}。\n\n可以從結構化欄位補、還沒補（判斷細則「tags 從結構化欄位補」）：${tagMissing.length ? tagMissing.map((t) => `${t.id}（${t.add.join('、')}）`).join('、') : '沒有'}。`);
md.push('## 4. 分級分布\n\nA 以上的比例超過約 25% 要看門檻（§5.1「數字門檻依區調整」；10 筆以下只當參考）。\n\n' + table(['區域', '類型', '筆數', 'S', 'A', 'B', '沒評分', 'A 以上'], tiers.map((t) => [t.area, t.type, t.total, t.S, t.A, t.B, t.none, t.aOrAbove === null ? '—' : `${t.aOrAbove}%${t.aOrAbove > 25 && t.total - t.none > 10 ? ' ⚠️' : ''}`])));
md.push('## 5. 車站\n\n餐廳是 anchors 有這個車站的（步行圈內）；午餐、晚餐是旅程中有一天在 11:30～13:30、18:00～19:00 營業。0 家的用粗體。\n\n' + table(['車站', '區域', '餐廳', '午餐', '晚餐', 'fit15 yes', '景點', '住宿'], stationRows.map((s) => [`${s.id} ${s.name ?? ''}`, s.area, s.restaurants || '**0**', s.lunch || '**0**', s.dinner || '**0**', s.fit15, s.spots, s.lodging])));
md.push('## 6. 子地區\n\n' + table(['區域', '子地區', 'needsCar', '景點', '住宿', '餐廳'], regionRows.map((r) => [r.area, `${r.region} ${r.name ?? ''}`, r.needsCar ? '✓' : '', r.spot, r.lodging, r.restaurant || '**0**'])));
md.push(`## 7. 可信度\n\n### S、A 但 confidence low（${lowConfTop.length}）\n\n` + table(['tier', 'ID', '名稱', '推薦度理由'], lowConfTop.map((x) => [x.tier, x.id, x.name, (x.why ?? '').replace(/\|/g, '／')])) + `\n\n### 2 月營業或營業狀態沒確認的景點（${winterUnsure.length}）\n\n` + table(['tier', 'ID', '名稱', 'winterFit', '理由'], winterUnsure.map((x) => [x.tier, x.id, x.name, x.winterFit, x.why.replace(/\|/g, '／')])));
const out = md.join('\n\n') + '\n';

if (writeTags && tagMissing.length) {
  const add = new Map(tagMissing.map((t) => [t.id, t.add]));
  for (const area of AREAS) {
    for (const file of Object.values(FILES)) {
      const p = path.join(ROOT, `data/areas/${area}/${file}.json`);
      if (!fs.existsSync(p)) continue;
      const { data, eol } = readJson(p);
      let n = 0;
      for (const x of data) {
        if (!add.has(x.id)) continue;
        x.tags = [...(x.tags ?? []), ...add.get(x.id)];
        n++;
      }
      if (n) {
        writeJson(p, data, eol);
        console.log(`${area}/${file}.json：補 tags ${n} 筆`);
      }
    }
  }
}

if (toStdout) {
  process.stdout.write(out);
} else {
  fs.writeFileSync(path.join(ROOT, 'data/derived/cross-area-check.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data/derived/cross-area-check.md'), out);
  console.log(`寫入 data/derived/cross-area-check.{json,md}：重複候選 ${dups.length}、ID ${idIssues.length}、標籤 ${tagIssues.length}／可補 ${tagMissing.length}、S/A low ${lowConfTop.length}、2 月未確認 ${winterUnsure.length}`);
}
