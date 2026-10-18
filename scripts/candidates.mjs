#!/usr/bin/env node
// 候選清單（data/raw/<area>/candidates/<kind>.json）的查詢、匯出與修改。候選檔很大，不要整份讀，用這支過濾。
//
// 用法：
//   node scripts/candidates.mjs list <area> <kind> [--status included] [--region ise-geku] [--criteria C]
//        [--pending] [--keys k1,k2] [--fields key,name,status,ratings]
//       一筆一行印出（預設欄位：key、name、region、status、criteria、ratings、pointId）
//   node scripts/candidates.mjs export <area> <kind> --keys k1,k2 [--out <工作目錄>/batch.json]
//       匯出讀文 subagent、chrome-actions.mjs、build-restaurants.mjs 用的 batch.json
//       （key、candKey、name、region、category、criteria、ratings、tabelog、contexts、note、mentions）
//   node scripts/candidates.mjs set <area> <kind> <patch.json> [--dry-run]
//       patch.json：[{ "key": "...", "set": { "status": "included", "pointId": "...", "ratings.google": 4.2 }, "unset": ["detailPending"] }]
//       找不到 key 就整批不寫；寫回時保留原本的換行和縮排
// kind：spots | lodging | restaurants

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, getPath, setPath } from './lib/json-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, area, kind, ...rest] = process.argv.slice(2);
const opt = (k) => (rest.includes(`--${k}`) ? rest[rest.indexOf(`--${k}`) + 1] : null);
const flag = (k) => rest.includes(`--${k}`);

if (!['list', 'export', 'set'].includes(cmd) || !area || !['spots', 'lodging', 'restaurants'].includes(kind)) {
  console.error('用法：node scripts/candidates.mjs <list|export|set> <area> <spots|lodging|restaurants> [選項]（說明見檔案開頭）');
  process.exit(2);
}

const file = path.join(ROOT, `data/raw/${area}/candidates/${kind}.json`);
const { data: cands, eol } = readJson(file);
const byKey = new Map(cands.map((c) => [c.key, c]));
const keysOpt = opt('keys')?.split(',').map((s) => s.trim()).filter(Boolean);

if (cmd === 'list') {
  const fields = (opt('fields') ?? 'key,name,region,status,criteria,ratings,pointId').split(',');
  let rows = cands;
  if (opt('status')) rows = rows.filter((c) => c.status === opt('status'));
  if (opt('region')) rows = rows.filter((c) => c.region === opt('region'));
  if (opt('criteria')) rows = rows.filter((c) => (c.criteria ?? []).some((x) => x.startsWith(opt('criteria'))));
  if (flag('pending')) rows = rows.filter((c) => c.detailPending);
  if (keysOpt) rows = rows.filter((c) => keysOpt.includes(c.key));
  for (const c of rows) {
    const o = {};
    for (const f of fields) o[f] = f === 'name' ? c.name?.ja : getPath(c, f);
    console.log(JSON.stringify(o));
  }
  console.error(`${rows.length} 筆（全部 ${cands.length}）`);
} else if (cmd === 'export') {
  if (!keysOpt) {
    console.error('export 要給 --keys');
    process.exit(2);
  }
  const missing = keysOpt.filter((k) => !byKey.has(k));
  if (missing.length) {
    console.error(`找不到這些 key：${missing.join(', ')}`);
    process.exit(1);
  }
  const batch = keysOpt.map((k) => {
    const c = byKey.get(k);
    return {
      key: c.pointId ?? c.key,
      candKey: c.key,
      name: c.name?.ja,
      region: c.region ?? null,
      category: c.category ?? null,
      criteria: c.criteria ?? [],
      ratings: c.ratings ?? {},
      tabelog: c.links?.tabelog ?? null,
      contexts: c.contexts ?? [],
      note: c.note ?? null,
      mentions: c.mentions ?? [],
    };
  });
  const out = JSON.stringify(batch, null, 1) + '\n';
  if (opt('out')) {
    fs.mkdirSync(path.dirname(opt('out')), { recursive: true });
    fs.writeFileSync(opt('out'), out);
    console.error(`寫了 ${batch.length} 筆到 ${opt('out')}`);
  } else process.stdout.write(out);
} else {
  const patchFile = rest.find((a) => !a.startsWith('--'));
  if (!patchFile) {
    console.error('set 要給 patch.json');
    process.exit(2);
  }
  const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
  const missing = patch.filter((p) => !byKey.has(p.key)).map((p) => p.key);
  if (missing.length) {
    console.error(`找不到這些 key，整批不寫：${missing.join(', ')}`);
    process.exit(1);
  }
  for (const p of patch) {
    const c = byKey.get(p.key);
    const changes = [];
    for (const [k, v] of Object.entries(p.set ?? {})) {
      const before = getPath(c, k);
      if (JSON.stringify(before) !== JSON.stringify(v)) changes.push(`${k}: ${JSON.stringify(before)} → ${JSON.stringify(v)}`);
      setPath(c, k, v);
    }
    for (const k of p.unset ?? []) {
      const keys = k.split('.');
      const parent = keys.length > 1 ? getPath(c, keys.slice(0, -1).join('.')) : c;
      if (parent && keys.at(-1) in parent) {
        delete parent[keys.at(-1)];
        changes.push(`刪掉 ${k}`);
      }
    }
    console.log(`${p.key}：${changes.join('；') || '沒有變更'}`);
  }
  if (flag('dry-run')) console.error('（--dry-run，沒有寫檔）');
  else {
    writeJson(file, cands, eol);
    console.error(`寫回 ${path.relative(ROOT, file)}；記得跑 scripts/validate`);
  }
}
