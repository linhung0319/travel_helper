#!/usr/bin/env node
// 餐廳 anchors 的步行時間（T4c）：依地區規則選 anchors，用 OSRM 算步行時間，寫回 restaurants.json。
//
// 用法：
//   node scripts/restaurant-anchors.mjs <area> [--write] [--offline] [--report <檔案>]
//   不加 --write 只印結果，不改檔案。路線快取在 data/cache/routes/（同一段只查一次）。
//
// anchors 的選法（地區看 region；T7b 之前的資料是 extra.region 的地區名）。哪些算步行圈見 scripts/lib/anchor-rules.mjs
//   （鳥羽照手寫清單；其他區域照 areas.json 的 needsCar，T8e 加）：
//   步行圈（鳥羽站周邊、中之郷、相差、離島）：最近的車站（OSRM 30 分內），加上 15 分內最近的景點 3 個、住宿 2 個。
//     15 分內一個景點都沒有時，改放最近的景點和住宿（照實算）。
//   需搭車（浦村、國崎・パールロード、外圍）：最近的車站（OSRM 30 分內才放），加上最近的景點、最近的住宿，照實算；
//     有車站 anchor 時，超過 30 分的景點、住宿不放。
//   共同：contexts 有 dinner 的店，不含晚餐的住宿在 20 分內就加進 anchors。
//   T4b 已放、但不符合上面規則的「不含晚餐的住宿」anchor（例如 D 晚餐缺口的店）保留，重算步行時間。
// OSRM 結果明顯不合理（吸附距離太大、繞路倍數太高）時保留直線估算（walkSource: "estimate"）。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

const geo = await import('../web/src/lib/geo/index.ts');
const { fileRouteCache } = await import('./lib/route-cache.mjs');

const { isWalkRegion, needsCarMap } = await import('./lib/anchor-rules.mjs');
const STATION_MAX = 30; // 車站 anchor 的上限（分）
const NEARBY_MAX = 15; // 步行圈內景點、住宿的上限（分）
const DINNER_LODGING_MAX = 20; // 不含晚餐的住宿 → 晚上營業的店（分）
const MAX_SPOTS = 3;
const MAX_LODGING = 2;
const CANDIDATES = { spots: 4, lodging: 3 }; // 步行圈每類先用直線距離取最近幾個，再查 OSRM
// 不合理的判斷
const SNAP_MAX = 150; // 起訖點離道路超過這個距離（公尺）
const DETOUR_MAX = 3; // 路線距離 ÷ 直線距離超過這個倍數（直線 300 m 以上才看）
// 繞路倍數超過、但人工看過地圖確定是真的要繞（中間隔著海灣、河口）的組合：照 OSRM（T4c，2026-10-17）
const REAL_DETOURS = new Set([
  // 浦村：三ノ浦、今浦一帶和海の博物館之間隔著浦村灣，要沿灣繞
  'toba-motokaki>toba-sea-folk-museum',
  'toba-yoshiyu-suisan>toba-sea-folk-museum',
  'toba-marugen-suisan>toba-sea-folk-museum',
  // 中之郷站一帶和安楽島的鳥羽シーサイドホテル、亀の井ホテル之間隔著鳥羽灣的入江，要繞約 3 km
  'toba-nishikiya>toba-seaside-hotel',
  'toba-cafeterrace-orange>toba-seaside-hotel',
  'toba-nishikiya>toba-kamenoi-hotel',
  'toba-cafeterrace-orange>toba-kamenoi-hotel',
]);

const args = process.argv.slice(2);
const area = args.find((a) => !a.startsWith('--'));
const write = args.includes('--write');
const offline = args.includes('--offline');
const reportIdx = args.indexOf('--report');
const reportFile = reportIdx >= 0 ? args[reportIdx + 1] : null;
if (!area) {
  console.error('用法：node scripts/restaurant-anchors.mjs <area> [--write] [--offline] [--report <檔案>]');
  process.exit(2);
}

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const restaurantsPath = `data/areas/${area}/restaurants.json`;
const restaurants = read(restaurantsPath);
const spots = read(`data/areas/${area}/spots.json`);
const lodging = read(`data/areas/${area}/lodging.json`);
const needsCar = needsCarMap(read('data/areas.json'));
const stations = read('data/stations.json').filter((s) => s.operator === 'kintetsu' || s.operator === 'jr');
const noDinner = lodging.filter((l) => l.meals === 'none' || l.meals === 'breakfast');
const noDinnerIds = new Set(noDinner.map((l) => l.id));

const client = geo.createRouteClient({
  cache: fileRouteCache(),
  minIntervalMs: 1500,
  userAgent: 'travel_helper (personal trip planner; scripts/restaurant-anchors.mjs)',
});

async function walk(from, to) {
  const r = await client.walkRoute(from.coords, to.coords, { offline });
  const issues = [];
  if (r.source === 'osrm') {
    if (Math.max(...r.snapMeters) > SNAP_MAX) issues.push(`吸附 ${r.snapMeters.map((v) => Math.round(v)).join('/')} m`);
    if (r.straightMeters >= 300 && r.meters / r.straightMeters > DETOUR_MAX && !REAL_DETOURS.has(`${from.id}>${to.id}`)) {
      issues.push(`繞路 ${(r.meters / r.straightMeters).toFixed(1)} 倍（直線 ${Math.round(r.straightMeters)} m、路線 ${Math.round(r.meters)} m）`);
    }
  } else {
    issues.push(r.error ?? 'OSRM 沒有結果');
  }
  const ok = r.source === 'osrm' && issues.length === 0;
  const est = geo.estimateWalk(from.coords, to.coords);
  return {
    id: to.id,
    walkMinutes: geo.displayMinutes(ok ? r.minutes : est.minutes),
    walkSource: ok ? 'osrm' : 'estimate',
    osrmMinutes: r.source === 'osrm' ? geo.displayMinutes(r.minutes) : null,
    meters: Math.round(ok ? r.meters : est.meters),
    straight: Math.round(r.straightMeters),
    issues,
  };
}

const nearestBy = (from, list, n) =>
  list
    .map((p) => ({ p, d: geo.haversineMeters(from.coords, p.coords) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.p);

async function walkAll(from, list) {
  const out = [];
  for (const p of list) out.push(await walk(from, p));
  return out.sort((a, b) => a.walkMinutes - b.walkMinutes);
}

const report = [];

for (const r of restaurants) {
  const region = r.region ?? r.extra?.region ?? '';
  const walkRegion = isWalkRegion(area, region, needsCar);
  const hasDinner = (r.contexts ?? []).includes('dinner');
  const anchors = [];
  const notes = [];

  // 車站：直線最近的 2 站查 OSRM，取近的；直線就超過上限（離島、浦村等）的不查
  const nearSt = nearestBy(r, stations, 2);
  const stStraight = geo.haversineMeters(r.coords, nearSt[0].coords);
  if (stStraight <= STATION_MAX * 80) {
    const st = (await walkAll(r, nearSt))[0];
    if (st.walkMinutes <= STATION_MAX) anchors.push(st);
    else notes.push(`最近車站 ${st.id} ${st.walkMinutes} 分，超過 ${STATION_MAX} 分不放`);
  } else notes.push(`最近車站 ${nearSt[0].id} 直線 ${(stStraight / 1000).toFixed(1)} km，不放`);

  // 步行圈：直線 NEARBY_MAX 分 × 80 m 以內的最近 CANDIDATES 個（OSRM 不會比直線短）；需搭車：最近 2 個
  const cands = (list, n) => {
    const near = nearestBy(r, list, walkRegion ? n : 2);
    const inRange = near.filter((p) => geo.haversineMeters(r.coords, p.coords) <= NEARBY_MAX * 80);
    return walkRegion && inRange.length ? inRange : near.slice(0, 2);
  };
  const spotCands = await walkAll(r, cands(spots, CANDIDATES.spots));
  const lodgCands = await walkAll(r, cands(lodging, CANDIDATES.lodging));
  if (walkRegion) {
    const s = spotCands.filter((a) => a.walkMinutes <= NEARBY_MAX).slice(0, MAX_SPOTS);
    const l = lodgCands.filter((a) => a.walkMinutes <= NEARBY_MAX).slice(0, MAX_LODGING);
    if (s.length) anchors.push(...s);
    else {
      anchors.push(spotCands[0]);
      notes.push(`${NEARBY_MAX} 分內沒有景點，改放最近的景點`);
    }
    if (l.length) anchors.push(...l);
    else if (!s.length) anchors.push(lodgCands[0]);
  } else {
    // 已經有 30 分內的車站時，超過 30 分的景點、住宿沒有參考價值，不放
    const hasStation = anchors.length > 0;
    const far = (a) => hasStation && a.walkMinutes > STATION_MAX;
    for (const a of [spotCands[0], lodgCands[0]]) if (a && !far(a)) anchors.push(a);
    notes.push('需搭車');
  }

  // 不含晚餐的住宿
  const have = new Set(anchors.map((a) => a.id));
  const keepIds = (r.anchors ?? []).map((a) => a.id).filter((id) => noDinnerIds.has(id) && !have.has(id));
  for (const l of noDinner) {
    if (have.has(l.id)) continue;
    const keep = keepIds.includes(l.id);
    if (!keep && (!hasDinner || geo.haversineMeters(r.coords, l.coords) > DINNER_LODGING_MAX * 80)) continue;
    const a = await walk(r, l);
    if (keep || a.walkMinutes <= DINNER_LODGING_MAX) {
      anchors.push(a);
      have.add(l.id);
      if (keep && !(hasDinner && a.walkMinutes <= DINNER_LODGING_MAX)) notes.push(`保留 T4b 的 ${l.id}`);
    }
  }

  const old = (r.anchors ?? []).map((a) => `${a.id}:${a.walkMinutes}`).join(' ');
  report.push({ id: r.id, name: r.name.ja, region, walkRegion, hasDinner, anchors, notes, old });
  r.anchors = anchors.map(({ id, walkMinutes, walkSource }) => ({ id, walkMinutes, walkSource }));
}

for (const x of report) {
  const fmt = x.anchors
    .map((a) => `${a.id}:${a.walkMinutes}${a.walkSource === 'osrm' ? '' : `(est；${a.issues.join('；')})`}`)
    .join(' ');
  console.log(`${x.id}［${x.region}］ ${fmt}${x.notes.length ? `  ※${x.notes.join('；')}` : ''}`);
  console.log(`    舊：${x.old}`);
}
const all = report.flatMap((x) => x.anchors);
console.log(`\nanchors ${all.length} 筆：osrm ${all.filter((a) => a.walkSource === 'osrm').length}、estimate ${all.filter((a) => a.walkSource !== 'osrm').length}；這次呼叫 OSRM ${client.apiCalls} 次`);

if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
if (write) {
  fs.writeFileSync(path.join(ROOT, restaurantsPath), JSON.stringify(restaurants, null, 2) + '\n');
  console.log(`已寫入 ${restaurantsPath}`);
}
