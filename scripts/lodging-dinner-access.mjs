#!/usr/bin/env node
// 住宿的 dinnerAccess（T8e 加入；T7f 是在 scratchpad 寫臨時腳本，這裡把同樣的做法放進 repo）。
// 規則見 CONVENTIONS §4「判斷細則」住宿：不含晚餐（meals: none／breakfast）或方案不同（varies）的住宿，
// 選素泊時步行 20 分內（OSRM、係數 1）有沒有晚餐店 → walk／car。
//   晚餐店＝contexts 有 dinner，而且旅程中有一天 18:00～19:00 營業（scripts/lib/trip-hours.mjs 的 isDinner）；
//   住宿附設的 `-dining` 不算；hours 不明的不算。
//   每間取直線 MAX_STRAIGHT 內最近 CANDIDATES 家查 OSRM；吸附超過 150 m 或繞路 3 倍以上用直線估算（同 restaurant-anchors.mjs）。
//   分鐘數和店名寫進 extra.dinnerAccessNote。
//
// 用法：node scripts/lodging-dinner-access.mjs <area> [--restaurants <area>,<area>] [--write] [--overwrite] [--offline]
//   --restaurants：晚餐店從哪幾區找（預設只有同區；伊勢、二見相鄰時給 ise,futami）
//   不加 --write 只印結果。已經有 dinnerAccess 的不動（--overwrite 才重算）。meals 是 dinner+breakfast 的不動。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tripDays, isDinner } from './lib/trip-hours.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// geo 是 TypeScript：沒有 --experimental-strip-types 時用它重跑自己（同 restaurant-anchors.mjs）
if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

const geo = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/geo/index.ts')).href);
const { fileRouteCache } = await import('./lib/route-cache.mjs');
const { readJson, writeJson } = await import('./lib/json-file.mjs');
// 確認過的組合（anchor-rules.mjs 的 pairRule，key 是「餐廳>住宿」）：'osrm' 真的要繞（隔著海灣）照 OSRM；'skip' 離島沒有步行路線（T9e）
const { pairRule } = await import('./lib/anchor-rules.mjs');

const WALK_MAX = 20;
const MAX_STRAIGHT = WALK_MAX * 80; // 1.6 km：OSRM 不會比直線短
const CANDIDATES = 8;
const SNAP_MAX = 150;
const DETOUR_MAX = 3;

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const area = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!area) {
  console.error('用法：node scripts/lodging-dinner-access.mjs <area> [--restaurants a,b] [--write] [--overwrite] [--offline]');
  process.exit(2);
}
const write = args.includes('--write');
const overwrite = args.includes('--overwrite');
const offline = args.includes('--offline');
const restAreas = opt('restaurants', area).split(',');
const days = tripDays(opt('from', '2027-02-02'), opt('to', '2027-02-13'), opt('holidays', '2027-02-11').split(','));
// 本地日期（toISOString 是 UTC，日本上午 9 點前會變成前一天；T9e 修）
const today = new Date().toLocaleDateString('sv-SE');

const lodgingFile = path.join(ROOT, `data/areas/${area}/lodging.json`);
const { data: lodging, eol } = readJson(lodgingFile);
// 餐廳還沒蒐集的區域（例如 T9b 時的志摩）：不能判斷 walk／car，全部留 null，不要當成「附近沒有店」（T9b 加）
const missingRest = restAreas.filter((a) => !fs.existsSync(path.join(ROOT, `data/areas/${a}/restaurants.json`)));
if (missingRest.length) {
  console.error(`沒有 ${missingRest.map((a) => `data/areas/${a}/restaurants.json`).join('、')}：餐廳資料還沒建立，dinnerAccess 維持 null（等餐廳任務後再跑）`);
  process.exit(0);
}
const dinners = restAreas
  .flatMap((a) => readJson(path.join(ROOT, `data/areas/${a}/restaurants.json`)).data)
  .filter((r) => !r.id.endsWith('-dining') && isDinner(r, days));

const client = geo.createRouteClient({
  cache: fileRouteCache(),
  minIntervalMs: 1500,
  userAgent: 'travel_helper (personal trip planner; scripts/lodging-dinner-access.mjs)',
});

async function walk(from, to) {
  const r = await client.walkRoute(from.coords, to.coords, { offline });
  const issues = [];
  if (r.source !== 'osrm') issues.push(r.error ?? 'OSRM 沒有結果');
  else {
    if (Math.max(...r.snapMeters) > SNAP_MAX) issues.push(`吸附 ${r.snapMeters.map((v) => Math.round(v)).join('/')} m`);
    if (r.straightMeters >= 300 && r.meters / r.straightMeters > DETOUR_MAX) issues.push(`繞路 ${(r.meters / r.straightMeters).toFixed(1)} 倍（路線 ${Math.round(r.meters)} m）`);
  }
  const bad = issues.length > 0 && !(r.source === 'osrm' && pairRule(to.id, from.id, { from: to.region, to: from.region }) === 'osrm');
  const est = geo.estimateWalk(from.coords, to.coords);
  return { r: to, minutes: geo.displayMinutes(bad ? est.minutes : r.minutes), source: bad ? 'estimate' : 'osrm', issues };
}

let changed = 0;
for (const l of lodging) {
  if (!['none', 'breakfast', 'varies'].includes(l.meals)) continue;
  if (l.dinnerAccess != null && !overwrite) {
    console.log(`－ ${l.id}：已經是 ${l.dinnerAccess}，不動`);
    continue;
  }
  const near = dinners
    .map((r) => ({ r, d: geo.haversineMeters(l.coords, r.coords) }))
    .filter((x) => x.d <= MAX_STRAIGHT && pairRule(x.r.id, l.id) !== 'skip')
    .sort((a, b) => a.d - b.d)
    .slice(0, CANDIDATES);
  const walks = [];
  for (const { r } of near) walks.push(await walk(l, r));
  walks.sort((a, b) => a.minutes - b.minutes);
  const ok = walks.filter((w) => w.minutes <= WALK_MAX);
  const access = ok.length ? 'walk' : 'car';
  const fmt = (w) => `${w.r.name.ja} ${w.minutes} 分${w.source === 'osrm' ? '' : '（直線估算）'}`;
  const note = ok.length
    ? `步行 ${WALK_MAX} 分內的晚餐店 ${ok.length}${ok.length === CANDIDATES ? ' 家以上（只查最近 ' + CANDIDATES + ' 家）' : ' 家'}：${ok.slice(0, 3).map(fmt).join('、')}${ok.length > 3 ? ' 等' : ''}（${l.meals === 'varies' ? '選素泊、朝食付方案時；' : ''}OSRM，scripts/lodging-dinner-access.mjs，${today}）`
    : `步行 ${WALK_MAX} 分內沒有晚餐店${walks[0] ? `（最近：${fmt(walks[0])}）` : `（直線 ${MAX_STRAIGHT / 1000} km 內沒有）`}，要搭車（scripts/lodging-dinner-access.mjs，${today}）`;
  console.log(`${access === 'walk' ? '○' : '×'} ${l.id}［${l.meals}］ ${access}：${note}`);
  // 直線估算的原因（只印，不寫進資料）：繞路的要人工確認是不是真的隔著海灣，是的話加進 anchor-rules.mjs 的 REAL_DETOURS
  for (const w of walks) if (w.issues.length) console.log(`    ${w.source === 'osrm' ? '照 OSRM' : '估算'} ${w.r.id} ${w.minutes} 分：${w.issues.join('；')}`);
  l.dinnerAccess = access;
  l.extra = { ...(l.extra ?? {}), dinnerAccessNote: note };
  changed++;
}
console.log(`\n${changed} 間；這次呼叫 OSRM ${client.apiCalls} 次${write ? '' : '（沒有寫檔，加 --write 才寫）'}`);
if (write && changed) writeJson(lodgingFile, lodging, eol);
