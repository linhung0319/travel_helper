#!/usr/bin/env node
// 地理工具 CLI（T6）。邏輯在 web/src/lib/geo/，這裡只負責讀 data/、解析參數、輸出。
//
// 用法：
//   node scripts/geo.mjs nearest <點> [--n 3] [--operator kintetsu|jr]
//   node scripts/geo.mjs walk <起點> <終點> [--refresh] [--offline]
//   node scripts/geo.mjs distance <點> <點>
// <點> 可以是座標「經度,緯度」（例如 136.8456,34.4818），或 data/ 裡的資料點 ID（例如 toba）。
// 共用選項：--group <團體步行係數>（預設 1）、--speed <公尺/分>（預設 80）、--detour <繞路係數>（預設 1.3）、--json

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// Node 22.18 之前要加旗標才能直接 import .ts；沒有的話用旗標重新執行自己
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

const USAGE = `用法：
  node scripts/geo.mjs nearest <點> [--n 3] [--operator kintetsu|jr]
  node scripts/geo.mjs walk <起點> <終點> [--refresh] [--offline]
  node scripts/geo.mjs distance <點> <點>
<點>：座標「經度,緯度」或 data/ 的資料點 ID
選項：--group <團體步行係數，預設 1> --speed <公尺/分，預設 80> --detour <繞路係數，預設 1.3> --json`;

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  const flags = new Set(['refresh', 'offline', 'json', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') opt.help = true;
    else if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      if (flags.has(k)) opt[k] = true;
      else if (['n', 'operator', 'group', 'speed', 'detour'].includes(k)) {
        const v = inline ?? argv[++i];
        if (v == null) fail(`--${k} 需要一個值`);
        opt[k] = v;
      } else fail(`未知的選項：${a}\n\n${USAGE}`);
    } else pos.push(a);
  }
  return { pos, opt };
}

function num(v, name) {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) fail(`--${name} 必須是正數：${v}`);
  return n;
}

// data/ 裡有座標的資料點：stations.json 和 areas/*/{spots,lodging,restaurants}.json
function loadPoints() {
  const files = [path.join(ROOT, 'data/stations.json')];
  const areasDir = path.join(ROOT, 'data/areas');
  for (const area of fs.existsSync(areasDir) ? fs.readdirSync(areasDir) : []) {
    for (const f of ['spots', 'lodging', 'restaurants']) {
      const p = path.join(areasDir, area, `${f}.json`);
      if (fs.existsSync(p)) files.push(p);
    }
  }
  const points = new Map();
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
    for (const rec of Array.isArray(data) ? data : []) {
      if (rec?.id) points.set(rec.id, rec);
    }
  }
  return points;
}

function resolvePoint(arg, points) {
  const m = arg.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) {
    const c = [Number(m[1]), Number(m[2])];
    if (geo.looksSwapped(c)) fail(`「${arg}」看起來是「緯度,經度」；請寫成「經度,緯度」，例如 ${c[1]},${c[0]}`);
    if (!geo.isLonLat(c)) fail(`「${arg}」不是合法的座標`);
    return { id: null, label: c.map((v) => v.toFixed(5)).join(','), coords: c };
  }
  const rec = points.get(arg);
  if (!rec) fail(`找不到資料點「${arg}」（可以用座標「經度,緯度」，或 data/ 裡的 ID）`);
  if (!geo.isLonLat(rec.coords)) fail(`資料點「${arg}」沒有座標`);
  return { id: rec.id, label: `${rec.id}（${rec.name?.zh ?? rec.name?.ja ?? ''}）`, coords: rec.coords, record: rec };
}

const m = (v) => `${Math.round(v).toLocaleString('en-US')} m`;
const min = (v) => `${geo.displayMinutes(v)} 分`;

function walkNote(w) {
  return `步速 ${w.metersPerMinute} m/分、團體係數 ${w.groupFactor}`;
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const [cmd, ...args] = pos;
  if (opt.help || !cmd) {
    console.log(USAGE);
    return;
  }
  const walkOpts = {
    detourFactor: num(opt.detour, 'detour') ?? geo.DEFAULT_WALK.detourFactor,
    metersPerMinute: num(opt.speed, 'speed') ?? geo.DEFAULT_WALK.metersPerMinute,
    groupFactor: num(opt.group, 'group') ?? geo.DEFAULT_WALK.groupFactor,
  };
  const points = loadPoints();

  if (cmd === 'nearest') {
    if (args.length !== 1) fail(USAGE);
    const p = resolvePoint(args[0], points);
    const stations = [...points.values()].filter((r) => r.type === 'station' && r.id !== p.id);
    const operator = opt.operator?.split(',');
    const res = geo.nearestStations(p.coords, stations, { ...walkOpts, limit: num(opt.n, 'n') ?? 3, operator });
    if (opt.json) {
      console.log(JSON.stringify({ point: p.coords, options: walkOpts, results: res.map((r) => ({ id: r.station.id, operator: r.station.operator, distanceMeters: Math.round(r.distanceMeters), walkMeters: Math.round(r.walk.meters), walkMinutes: r.walk.minutes })) }, null, 2));
      return;
    }
    console.log(`${p.label} 附近的車站${operator ? `（${operator.join('、')}）` : ''}`);
    console.log(`步行為直線估算：繞路係數 ${walkOpts.detourFactor}、${walkNote(walkOpts)}`);
    res.forEach((r, i) => {
      const s = r.station;
      console.log(`  ${i + 1}. ${s.id.padEnd(16)} ${(s.name?.zh ?? '').padEnd(6, '　')} ${s.operator.padEnd(8)} 直線 ${m(r.distanceMeters).padStart(8)}  步行約 ${min(r.walk.minutes)}`);
    });
    if (!res.length) console.log('  （沒有符合的車站）');
    return;
  }

  if (cmd === 'distance') {
    if (args.length !== 2) fail(USAGE);
    const [a, b] = args.map((x) => resolvePoint(x, points));
    const e = geo.estimateWalk(a.coords, b.coords, walkOpts);
    if (opt.json) return console.log(JSON.stringify({ from: a.coords, to: b.coords, options: walkOpts, ...e }, null, 2));
    console.log(`${a.label} → ${b.label}`);
    console.log(`直線 ${m(e.straightMeters)}；估算步行 ${m(e.meters)}，約 ${min(e.minutes)}（繞路係數 ${walkOpts.detourFactor}、${walkNote(walkOpts)}）`);
    return;
  }

  if (cmd === 'walk') {
    if (args.length !== 2) fail(USAGE);
    const [a, b] = args.map((x) => resolvePoint(x, points));
    const cache = fileRouteCache();
    const client = geo.createRouteClient({ cache, userAgent: 'travel_helper (personal trip planner; scripts/geo.mjs)' });
    const r = await client.walkRoute(a.coords, b.coords, { ...walkOpts, refresh: !!opt.refresh, offline: !!opt.offline });
    if (opt.json) return console.log(JSON.stringify({ options: walkOpts, cacheKey: geo.routeCacheKey(a.coords, b.coords), ...r }, null, 2));
    console.log(`${a.label} → ${b.label}`);
    if (r.source === 'osrm') {
      console.log(`來源：OSRM foot（${r.cached ? '快取' : '剛查詢，已存入快取'}，取得日期 ${r.retrieved}）`);
      console.log(`步行 ${m(r.meters)}（直線 ${m(r.straightMeters)}），約 ${min(r.minutes)}（${walkNote(walkOpts)}）；OSRM 原始時間 ${min(r.osrmDurationSeconds / 60)}`);
      if (Math.max(...r.snapMeters) > 50) {
        console.log(`⚠️  起點／終點離最近的道路 ${r.snapMeters.map(m).join('／')}（已計入距離）；座標可能在海上、建物或園區內，結果僅供參考`);
      }
      console.log(`路線點數 ${r.geometry.coordinates.length}；快取檔 data/cache/routes/${geo.routeCacheKey(a.coords, b.coords)}.json`);
    } else {
      console.log(`來源：estimate（${r.error ?? '直線估算'}）`);
      console.log(`直線 ${m(r.straightMeters)}；估算步行 ${m(r.meters)}，約 ${min(r.minutes)}（繞路係數 ${walkOpts.detourFactor}、${walkNote(walkOpts)}）`);
    }
    return;
  }

  fail(`未知的指令：${cmd}\n\n${USAGE}`);
}

await main();
