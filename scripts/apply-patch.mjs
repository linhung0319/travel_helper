#!/usr/bin/env node
// 把讀文、口コミ、Chrome 查到的事實回填到資料檔（spots／lodging／restaurants.json），規則固定：
//   - set：只填 null（或沒有這個欄位）的地方；已經有值而且不同的不覆蓋，寫進 extra.conflicts
//   - overwrite：照優先順序（官網 > 食べログ店舗会員 > Google …）確定要換的才用；舊值寫進 extra.conflicts
//   - sources：網址沒有出現過才加；conflicts：字串沒有出現過才加
// 取代 T7c～T8d 每批在 scratchpad 重寫的 apply／patch 腳本。
//
// 用法：node scripts/apply-patch.mjs <資料檔> <patch.json> [--dry-run]
// patch.json：
//   [{ "id": "ise-xxx",
//      "from": "官網（2026-10-20）",                 ← 寫進 conflicts 時標示新值的出處
//      "set": { "group.seats": 42, "kids.kidsMenu": true },
//      "overwrite": { "hours": { ... } },
//      "sources": [{ "type": "official", "url": "...", "retrieved": "2026-10-20", "note": "..." }],
//      "conflicts": ["營業時間：官網 11:00～、食べログ 11:30～"] }]
// 路徑用 a.b.c；陣列整個當成一個值（例如 seating、hours.mon）。

import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, getPath, setPath, same } from './lib/json-file.mjs';

const args = process.argv.slice(2);
const [dataFile, patchFile] = args.filter((a) => !a.startsWith('--'));
const dry = args.includes('--dry-run');
if (!dataFile || !patchFile) {
  console.error('用法：node scripts/apply-patch.mjs <資料檔> <patch.json> [--dry-run]');
  process.exit(2);
}

const { data, eol } = readJson(dataFile);
const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
const byId = new Map(data.map((p) => [p.id, p]));
const missing = patch.filter((p) => !byId.has(p.id)).map((p) => p.id);
if (missing.length) {
  console.error(`資料檔裡找不到這些 id，整批不寫：${missing.join(', ')}`);
  process.exit(1);
}

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const total = { set: 0, overwrite: 0, conflict: 0, same: 0, sources: 0 };

for (const p of patch) {
  const point = byId.get(p.id);
  const log = [];
  const conflicts = [];
  const from = p.from ? `（${p.from}）` : '';

  for (const [k, v] of Object.entries(p.set ?? {})) {
    const cur = getPath(point, k);
    if (cur == null) {
      setPath(point, k, v);
      log.push(`填 ${k}`);
      total.set++;
    } else if (same(cur, v)) total.same++;
    else {
      conflicts.push(`${k}：現值 ${show(cur)}；另一個來源 ${show(v)}${from}`);
      log.push(`衝突 ${k}`);
      total.conflict++;
    }
  }
  for (const [k, v] of Object.entries(p.overwrite ?? {})) {
    const cur = getPath(point, k);
    if (same(cur, v)) {
      total.same++;
      continue;
    }
    if (cur != null) conflicts.push(`${k}：原本 ${show(cur)}，改用 ${show(v)}${from}`);
    setPath(point, k, v);
    log.push(`改 ${k}`);
    total.overwrite++;
  }
  conflicts.push(...(p.conflicts ?? []));
  if (conflicts.length) {
    point.extra ??= {};
    const list = (point.extra.conflicts ??= []);
    for (const c of conflicts) if (!list.includes(c)) list.push(c);
  }
  const urls = new Set((point.sources ?? []).map((s) => s.url));
  let added = 0;
  for (const s of p.sources ?? []) {
    if (urls.has(s.url)) continue;
    point.sources.push(s);
    urls.add(s.url);
    added++;
  }
  total.sources += added;
  console.log(`${p.id}：${log.join('、') || '沒有欄位變更'}${added ? `；sources +${added}` : ''}`);
}

console.log(`合計：填 ${total.set}、改 ${total.overwrite}、衝突 ${total.conflict}、相同 ${total.same}、新來源 ${total.sources}`);
if (dry) console.error('（--dry-run，沒有寫檔）');
else {
  writeJson(dataFile, data, eol);
  console.error(`寫回 ${path.normalize(dataFile)}；記得跑 scripts/validate`);
}
