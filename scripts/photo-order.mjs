#!/usr/bin/env node
// 代表照片（T21）：把挑好的照片排到 photos 第一張，其他照片保持原本的順序（不刪、不改 schema）。
//
// 用法：
//   node scripts/photo-order.mjs <picks.json> <資料檔.json>... [--dry-run] [--log <log.md>]
// picks.json：{ "<資料點 ID>": { "pick": 2, "reason": "外觀，官網" } }
//   pick 是目前 photos 裡的第幾張（從 1 開始）；pick 是 null 表示現有照片都不合適（不改順序，列進 log 的「👤 要補照片」）
// --log：把每筆選了哪張、為什麼寫成 Markdown 表格（只列這些資料檔裡的點）。

import fs from 'node:fs';
import { readJson, writeJson } from './lib/json-file.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const logFile = args.includes('--log') ? args[args.indexOf('--log') + 1] : null;
const [picksFile, ...files] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--log');
if (!picksFile || !files.length) {
  console.error('用法：node scripts/photo-order.mjs <picks.json> <資料檔.json>... [--dry-run] [--log <log.md>]');
  process.exit(2);
}
const picks = JSON.parse(fs.readFileSync(picksFile, 'utf8'));
const host = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '?';
  }
};

const rows = [];
const missing = [];
let moved = 0;
for (const file of files) {
  const { data, eol } = readJson(file);
  for (const p of data) {
    const photos = p.photos ?? [];
    const pk = picks[p.id];
    if (!pk) {
      missing.push(p.id);
      continue;
    }
    if (pk.pick == null) {
      rows.push({ id: p.id, pick: null, photo: photos[0], n: photos.length, reason: pk.reason });
      continue;
    }
    if (!Number.isInteger(pk.pick) || pk.pick < 1 || pk.pick > photos.length) throw new Error(`${p.id}：pick ${pk.pick} 超出範圍（共 ${photos.length} 張）`);
    const chosen = photos[pk.pick - 1];
    if (pk.pick !== 1) {
      p.photos = [chosen, ...photos.filter((_, i) => i !== pk.pick - 1)];
      moved++;
    }
    rows.push({ id: p.id, pick: pk.pick, photo: chosen, n: photos.length, reason: pk.reason });
  }
  if (!dry) writeJson(file, data, eol);
}

if (missing.length) {
  console.error(`picks.json 沒有這些資料點（沒有改）：${missing.join(', ')}`);
  process.exitCode = 1;
}
console.error(`${rows.length} 筆，換了第一張 ${moved} 筆，現有照片都不合適 ${rows.filter((r) => r.pick == null).length} 筆${dry ? '（dry-run，沒有寫入）' : ''}`);

if (logFile) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const line = (r) => `| ${r.id} | ${r.pick == null ? '—' : `${r.pick}／${r.n}`} | ${r.photo ? `${r.photo.kind}（${host(r.photo.url)}）` : '—'} | ${esc(r.reason)} |`;
  const out = [
    '| 資料點 | 選第幾張／共幾張 | 代表照片 | 理由 |',
    '|---|---|---|---|',
    ...rows.filter((r) => r.pick != null).map(line),
  ];
  const none = rows.filter((r) => r.pick == null);
  if (none.length) out.push('', '### 👤 現有照片都不合適（沒有改順序，需要另外找圖）', '', '| 資料點 | | 目前第一張 | 原因 |', '|---|---|---|---|', ...none.map(line));
  fs.writeFileSync(logFile, out.join('\n') + '\n');
}
