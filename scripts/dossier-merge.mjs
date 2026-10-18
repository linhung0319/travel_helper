#!/usr/bin/env node
// 口コミ、Google 評論的重點併進讀文筆記（CONVENTIONS §4「口コミ、Google 評論」的「寫進筆記」）。
// 取代 T8e、T9d 每批複製的 notes-to-json.mjs＋dossier-merge.mjs（格式見 scripts/lib/dossier-merge.mjs）。
//
// 用法：
//   node scripts/dossier-merge.mjs <area> <notes 目錄> [--dry-run] [--only id1,id2]
//       notes 目錄裡每個 <id>.md 併進 data/raw/<area>/dossiers/<id>.md；
//       重點接在哪個來源行後面就引用那個來源的新編號；已經有口コミ／評論來源的筆記跳過。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNote, mergeDossier } from './lib/dossier-merge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [area, dir, ...rest] = process.argv.slice(2);
if (!area || !dir) {
  console.error('用法：node scripts/dossier-merge.mjs <area> <notes 目錄> [--dry-run] [--only id1,id2]');
  process.exit(2);
}
const dry = rest.includes('--dry-run');
const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1].split(',') : null;
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
  const id = f.replace(/\.md$/, '');
  if (only && !only.includes(id)) continue;
  const target = path.join(ROOT, `data/raw/${area}/dossiers/${id}.md`);
  try {
    if (!fs.existsSync(target)) throw new Error('沒有這份 dossier');
    const note = parseNote(fs.readFileSync(path.join(dir, f), 'utf8'));
    const out = mergeDossier(fs.readFileSync(target, 'utf8'), note);
    if (out === null) {
      console.log(`${id}：已經有口コミ／評論來源，跳過`);
      continue;
    }
    if (dry) console.log(`--- ${id}\n${out}`);
    else fs.writeFileSync(target, out);
    console.log(`${id}：來源 +${note.sources.length}、重點 +${note.points.length}、待確認 +${note.pending.length}`);
  } catch (e) {
    bad++;
    console.error(`${id}：${e.message}`);
  }
}
if (bad) process.exit(1);
