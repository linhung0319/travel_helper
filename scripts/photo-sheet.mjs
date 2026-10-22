#!/usr/bin/env node
// 代表照片（T21）：下載資料點的 photos，拼成對照表（contact sheet）給 Claude 讀圖挑選。
//
// 用法：
//   node scripts/photo-sheet.mjs --out <工作目錄> [--rows 5] [--check <photo-check 結果.json>...] <資料檔.json>...
// 產出：
//   <工作目錄>/img/      下載的原圖（檔名是網址的 hash）
//   <工作目錄>/sheets/   sheet-001.jpg …：2 張以上的資料點一列一點、一欄一張照片；0～1 張的一格一點。
//                        格子左上角標「編號.第幾張 kind」，第 1 張另標資料點 ID
//   <工作目錄>/sheets.json  每張對照表的資料點 ID 和照片網址（順序同圖）
// 需要 ffmpeg（PATH 上）。已經下載過的圖不重抓；--check 給了 photo-check.mjs 的結果時，ok 不是 true 的不下載、格子標 NG。
// 同一個網站之間隔 0.5 秒（Wikimedia 2 秒）；User-Agent 不要假裝成瀏覽器（見 photo-check.mjs）。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readJson } from './lib/json-file.mjs';

const args = process.argv.slice(2);
const opts = {};
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const k = args[i].slice(2);
    if (k === 'check') (opts.check ??= []).push(args[++i]);
    else opts[k] = args[++i];
  } else files.push(args[i]);
}
if (!opts.out || !files.length) {
  console.error('用法：node scripts/photo-sheet.mjs --out <工作目錄> [--rows 5] [--check 結果.json] <資料檔.json>...');
  process.exit(2);
}
const rows = Number(opts.rows ?? 5);
const COLS = 3;
const W = 360;
const H = 270;
const imgDir = path.join(opts.out, 'img');
const sheetDir = path.join(opts.out, 'sheets');
fs.mkdirSync(imgDir, { recursive: true });
fs.mkdirSync(sheetDir, { recursive: true });

const check = {};
for (const f of opts.check ?? []) Object.assign(check, JSON.parse(fs.readFileSync(f, 'utf8')));

const points = files.flatMap((f) => readJson(f).data.map((p) => ({ id: p.id, photos: p.photos ?? [] })));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map();
const hash = (u) => crypto.createHash('sha1').update(u).digest('hex').slice(0, 16);

async function download(url) {
  if (check[url] && !check[url].ok) return null;
  const file = path.join(imgDir, hash(url));
  if (fs.existsSync(file)) return fs.statSync(file).size ? file : null;
  const host = new URL(url).host;
  const wait = (host.endsWith('wikimedia.org') ? 2000 : 500) - (Date.now() - (lastHit.get(host) ?? 0));
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'travel_helper photo-sheet (personal trip planning)' } });
    const buf = res.ok && /^image\//.test(res.headers.get('content-type') ?? '') ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
    clearTimeout(timer);
    fs.writeFileSync(file, buf); // 失敗也寫空檔，重跑時不再抓
    return buf.length ? file : null;
  } catch {
    fs.writeFileSync(file, '');
    return null;
  }
}

// drawtext 的文字要跳脫 : ' \ %
const esc = (s) => s.replace(/[\\:'%]/g, (c) => `\\${c}`);
const FONT = process.platform === 'win32' ? 'C\\:/Windows/Fonts/arial.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

function makeSheet(out, cells) {
  // cells：[{ file | null, label }]，長度 rows*COLS，依列排
  const inputs = [];
  const filters = [];
  cells.forEach((c, i) => {
    const text = `drawtext=fontfile='${FONT}':text='${esc(c.label)}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.7`;
    if (c.file) {
      inputs.push('-i', c.file);
      const n = inputs.filter((x) => x === '-i').length - 1;
      filters.push(`[${n}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=gray,format=yuv420p,${text}[c${i}]`);
    } else {
      filters.push(`color=c=${c.label ? 'darkred' : 'black'}:s=${W}x${H}:d=1,format=yuv420p${c.label ? ',' + text : ''}[c${i}]`);
    }
  });
  const layout = cells.map((_, i) => `${(i % COLS) * W}_${Math.floor(i / COLS) * H}`).join('|');
  filters.push(`${cells.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${cells.length}:layout=${layout}[out]`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '4', out]);
}

// 有 2 張以上的資料點一列一點（第 1～3 欄是第 1～3 張）；只有 0～1 張的一格一點，另外排（不用挑，只看合不合適）
async function cellOf(p, c, tag) {
  const ph = p.photos[c];
  if (!ph) return { file: null, label: `${tag} ${p.id} (no photo)` };
  let file = await download(ph.url);
  // ffmpeg 讀不了的格式（svg 等）當成 NG
  if (file) {
    try {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-frames:v', '1', '-f', 'null', '-'], { stdio: 'ignore' });
    } catch {
      file = null;
    }
  }
  return { file, label: `${tag}.${c + 1} ${ph.kind}${file ? '' : ' NG'}${c === 0 ? ' ' + p.id : ''}` };
}

const multi = points.filter((p) => p.photos.length >= 2);
const single = points.filter((p) => p.photos.length < 2);
const perSheet = rows * COLS;
const manifest = [];
let n = 0;
async function emit(group, cells) {
  while (cells.length < perSheet) cells.push({ file: null, label: '' });
  const name = `sheet-${String(++n).padStart(3, '0')}.jpg`;
  makeSheet(path.join(sheetDir, name), cells);
  manifest.push({ sheet: name, points: group.map((p, i) => ({ tag: i + 1, id: p.id, photos: p.photos.map((ph) => ph.url) })) });
  console.log(`${name}：${group.map((p) => p.id).join(', ')}`);
}
for (let s = 0; s * rows < multi.length; s++) {
  const group = multi.slice(s * rows, (s + 1) * rows);
  const cells = [];
  for (const [r, p] of group.entries()) for (let c = 0; c < COLS; c++) cells.push(p.photos[c] ? await cellOf(p, c, r + 1) : { file: null, label: '' });
  await emit(group, cells);
}
for (let s = 0; s * perSheet < single.length; s++) {
  const group = single.slice(s * perSheet, (s + 1) * perSheet);
  const cells = [];
  for (const [i, p] of group.entries()) cells.push(await cellOf(p, 0, i + 1));
  await emit(group, cells);
}
fs.writeFileSync(path.join(opts.out, 'sheets.json'), JSON.stringify(manifest, null, 1) + '\n');
