#!/usr/bin/env node
// 景點的新資料點組裝（T9a 第 2 批起；CONVENTIONS §4 標準作業流程步驟 2～3）。
// Claude 只寫 judgement.json（事實欄位的判斷），Google 連結、星數、座標 300 m 規則、照片取捨、tags 補齊、
// sources 合併（讀文 facts＋Google）、寫回 spots.json、候選的 pointId 由這支做。
//
// 用法：
//   node scripts/build-spots.mjs <area> <工作目錄> [--candidates] [--dry-run] [--retrieved YYYY-MM-DD]
// 工作目錄裡要有：
//   judgement.json  [{ id, name, region, hours, ..., photos: [{url,page,kind,credit,license}],
//                      googleKey?（google.jsonl 的 key，預設＝id）, origCoords?: [lng,lat], origCoordsSource?,
//                      ratingsNote?, extraSources?: [...], candKey?（候選 key，預設＝id） }]
//   google.jsonl    google-place.js 的結果，一行一筆、前面加 "key"（後面的同 key 行蓋過前面的）
//   photos.json     scripts/photo-check.mjs --out 的結果（沒有就不過濾）
//   facts/<id>.json 讀文 subagent 的 facts（只取 sources）
// --candidates：同時把 data/raw/<area>/candidates/spots.json 的 pointId 填上、拿掉 detailPending（用 candidates.mjs set）

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, readJsonl } from './lib/json-file.mjs';
import { buildSpot, upsert } from './lib/spot-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const flag = (k) => args.includes(`--${k}`);
const [area, dirArg] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--retrieved');
if (!area || !dirArg) {
  console.error('用法：node scripts/build-spots.mjs <area> <工作目錄> [--candidates] [--dry-run] [--retrieved YYYY-MM-DD]');
  process.exit(2);
}
const dir = path.resolve(dirArg);
const retrieved = opt('retrieved') ?? new Date().toISOString().slice(0, 10);
const judgement = JSON.parse(fs.readFileSync(path.join(dir, 'judgement.json'), 'utf8'));
const google = new Map(readJsonl(path.join(dir, 'google.jsonl')).map((g) => [g.key, g]));
const checkedFile = path.join(dir, 'photos.json');
const checked = fs.existsSync(checkedFile) ? JSON.parse(fs.readFileSync(checkedFile, 'utf8')) : null;

const points = [];
for (const j of judgement) {
  const g = google.get(j.googleKey ?? j.id) ?? null;
  if (!g) console.warn(`⚠️  ${j.id}：google.jsonl 沒有 ${j.googleKey ?? j.id}（links.googleMaps 要另外給）`);
  const ff = path.join(dir, 'facts', `${j.id}.json`);
  const facts = fs.existsSync(ff) ? JSON.parse(fs.readFileSync(ff, 'utf8')) : null;
  const { point, dropped } = buildSpot(j, { area, g, facts, checked, retrieved });
  if (dropped.length) console.warn(`⚠️  ${j.id}：照片打不開，拿掉 ${dropped.length} 張`);
  if (!point.photos.length) console.warn(`⚠️  ${j.id}：沒有照片`);
  points.push(point);
  const dist = point.extra.googleDistanceMeters;
  console.log(`${j.id}  ${point.coordsSource}${dist != null ? `（和 Google 差 ${dist} m）` : ''}  ★${point.ratings?.google ?? '-'}（${point.ratings?.googleReviews ?? '-'}）  照片 ${point.photos.length}  tags ${point.tags.join('、') || '-'}`);
}

const file = path.join(ROOT, `data/areas/${area}/spots.json`);
const { data: list, eol } = fs.existsSync(file) ? readJson(file) : { data: [], eol: '\r\n' };
const out = upsert(list, points);
if (flag('dry-run')) {
  console.log(`（dry-run）會寫 ${points.length} 筆到 ${path.relative(ROOT, file)}（合計 ${out.length} 筆）`);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, out, eol);
  console.log(`寫了 ${points.length} 筆到 ${path.relative(ROOT, file)}（合計 ${out.length} 筆）`);
}

if (flag('candidates')) {
  const patch = judgement.map((j) => ({ key: j.candKey ?? j.id, set: { pointId: j.id }, unset: ['detailPending'] }));
  const pf = path.join(dir, 'cand-pointid.json');
  fs.writeFileSync(pf, JSON.stringify(patch, null, 1));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/candidates.mjs'), 'set', area, 'spots', pf, ...(flag('dry-run') ? ['--dry-run'] : [])], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
