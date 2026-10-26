#!/usr/bin/env node
// 時刻表等靜態資料整理成網站用的 JSON（architecture §3.7）。這些不放進資料庫，和網站一起部署。
//
// 用法：npm run build:static [-- --out <目錄>] [--data <dir>] [--skip-validate]
//       預設輸出到 build/static/（不進 git）。部署時（T25）放進網站的靜態檔案，例如 web/dist/static/。
//
// 輸出：
//   areas.json、passes.json、access/<id>.json      照原樣（去掉縮排）
//   timetables/kintetsu/<車站>.json                各站時刻表；每一班加上 `next`：這班車在這站之後的停站
//                                                  [[車站, 到, 發], ...]（從 _travel-times.json 的 trains），
//                                                  所以查「從這站到哪站要多久」只要載入出發站這一個檔案
//   timetables/kintetsu/_segments.json             各站之間的車程（_travel-times.json 去掉 trains）
//   timetables/jr/<車站或路線>.json、bus/<路線>.json、ferry/<路線>.json   照原樣，一個路線一個檔案
//   timetables/index.json                          每個檔案有什麼：車站、路線名、停留所（給地圖、找附近的班次），
//                                                  以及 byPlace：資料點 ID → 附近有停的路線（停留所的 near）
//   timetables/urban/<路線>.json、_transfers.json  大阪的班距型路線和轉乘表，照原樣；index.json 的 urban 列路線：
//                                                  [{ id, name, mode, stops: 站 ID[], file }]
//   manifest.json                                  產生時間、git commit、每個檔案的 sha256（前 12 碼，快取用）
//
// 用到時才載入：網站先讀 manifest.json、timetables/index.json，選了車站或路線再載入那一個檔案。
// 區域不寫死：areas.json 照原樣輸出，網站從這裡讀區域清單。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { data: path.join(ROOT, 'data'), out: path.join(ROOT, 'build/static'), skipValidate: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') o.out = path.resolve(argv[++i]);
    else if (argv[i] === '--data') o.data = path.resolve(argv[++i]);
    else if (argv[i] === '--skip-validate') o.skipValidate = true;
    else {
      console.error(`未知的參數：${argv[i]}`);
      process.exit(2);
    }
  }
  return o;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const jsonFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);

/** 近鐵各站時刻表：每一班加上這站之後的停站 */
export function withNextStops(station, travelTimes) {
  const out = structuredClone(station);
  for (const days of Object.values(out.directions ?? {})) {
    for (const day of ['weekday', 'holiday']) {
      for (const dep of days?.[day] ?? []) {
        const train = dep.trainNo ? travelTimes?.trains?.[day]?.[dep.trainNo] : null;
        if (!train) {
          dep.next = null;
          continue;
        }
        const i = train.stops.findIndex((s) => s[0] === out.station);
        dep.next = i < 0 ? null : train.stops.slice(i + 1);
      }
    }
  }
  return out;
}

/** 路線格式（巴士、船、JR 參宮線）的摘要：給 index.json */
function routeSummary(r) {
  return {
    id: r.id,
    mode: r.mode,
    operator: r.operator ?? null,
    name: r.name ?? null,
    validFrom: r.validFrom ?? null,
    validTo: r.validTo ?? null,
    credit: r.feed?.credit ?? null,
    stops: (r.stops ?? []).map((s) => ({ id: s.id, name: s.name, coords: s.coords ?? null })),
  };
}

export function build({ data, out }) {
  const files = new Map(); // 輸出的相對路徑 → JSON 文字
  const put = (rel, obj) => files.set(rel, JSON.stringify(obj));

  for (const f of ['areas.json', 'passes.json']) if (fs.existsSync(path.join(data, f))) put(f, readJson(path.join(data, f)));
  for (const f of jsonFiles(path.join(data, 'access'))) put(`access/${f}`, readJson(path.join(data, 'access', f)));

  const index = { kintetsu: [], jr: [], routes: [], urban: [], byPlace: {} };

  const kdir = path.join(data, 'timetables/kintetsu');
  const tt = fs.existsSync(path.join(kdir, '_travel-times.json')) ? readJson(path.join(kdir, '_travel-times.json')) : null;
  if (tt) {
    const { trains: _trains, ...segments } = tt;
    put('timetables/kintetsu/_segments.json', segments);
  }
  for (const f of jsonFiles(kdir)) {
    if (f.startsWith('_')) continue;
    const st = readJson(path.join(kdir, f));
    put(`timetables/kintetsu/${f}`, withNextStops(st, tt));
    index.kintetsu.push({ station: st.station, file: `timetables/kintetsu/${f}`, validFrom: st.validFrom ?? null, validTo: st.validTo ?? null });
  }

  for (const mode of ['jr', 'bus', 'ferry']) {
    for (const f of jsonFiles(path.join(data, 'timetables', mode))) {
      const doc = readJson(path.join(data, 'timetables', mode, f));
      const rel = `timetables/${mode}/${f}`;
      put(rel, doc);
      if (doc.station) {
        index.jr.push({ station: doc.station, file: rel });
        continue;
      }
      index.routes.push({ ...routeSummary(doc), file: rel });
      for (const s of doc.stops ?? []) {
        for (const n of s.near ?? []) {
          const list = (index.byPlace[n.id] ??= []);
          const hit = list.find((x) => x.route === doc.id);
          if (!hit) list.push({ route: doc.id, stop: s.id, meters: n.meters });
          else if (n.meters < hit.meters) Object.assign(hit, { stop: s.id, meters: n.meters });
        }
      }
    }
  }
  // 班距型路線（大阪）：_transfers.json 照原樣輸出，不列進 index.urban
  for (const f of jsonFiles(path.join(data, 'timetables/urban'))) {
    const doc = readJson(path.join(data, 'timetables/urban', f));
    const rel = `timetables/urban/${f}`;
    put(rel, doc);
    if (f.startsWith('_')) continue;
    index.urban.push({ id: doc.id, name: doc.name?.ja ?? null, mode: doc.mode, stops: (doc.stops ?? []).map((s) => s.id), file: rel });
  }
  for (const list of Object.values(index.byPlace)) list.sort((a, b) => a.meters - b.meters);
  put('timetables/index.json', index);

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    // 不在 git 裡（測試）
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    gitCommit: commit,
    files: Object.fromEntries([...files].sort().map(([rel, text]) => [rel, { sha256: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12), bytes: Buffer.byteLength(text) }])),
  };

  fs.rmSync(out, { recursive: true, force: true });
  for (const [rel, text] of files) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), text);
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return manifest;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.skipValidate) {
    const v = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.mjs'), '--data', o.data], { encoding: 'utf8' });
    if (v.status !== 0) {
      console.log(v.stdout);
      console.error('❌ 驗證沒過，不產生');
      process.exit(1);
    }
  }
  const m = build(o);
  const total = Object.values(m.files).reduce((a, f) => a + f.bytes, 0);
  console.log(`寫入 ${path.relative(ROOT, o.out) || o.out}：${Object.keys(m.files).length} 個檔案，共 ${(total / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
