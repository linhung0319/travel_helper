#!/usr/bin/env node
// T7b：把 BASE（d7e6c6f）的舊筆記 spots.md、lodging.md、restaurants.md 切成 data/raw/toba/log/<任務>.md。
// 用法：node scripts/split-toba-notes-t7b.mjs .
// keep 範圍原文照搬（只修正相對連結），cut 範圍換成一行指引（候選 → candidates/，要問的事 → questions.md，
// T4c 貼上的 restaurant-gaps.mjs 輸出刪掉）。行號是 BASE 版本的行號，所以可以重跑。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = process.argv[2];
const show = (p) => execFileSync('git', ['show', `d7e6c6f:${p}`], { cwd: root, encoding: 'utf8' }).split(/\r?\n/);
const C = '→ 移到 [candidates/%s](../candidates/%s)（T7b）';
const Q = '→ 移到 [questions.md](../questions.md)（T7b）';
const plan = {
  T2: { src: 'spots.md', ranges: [[1, 14], ['cut', 15, 20, `### 排行程前要先確認的事\n${Q}；結論寫在 [README.md](../README.md)`], [21, 86], ['cut', 87, 99, `### 被排除的候選與原因\n${C.replaceAll('%s', 'spots.json')}`], [100, 146], ['cut', 147, 156, `### 被排除的候選與原因\n${C.replaceAll('%s', 'spots.json')}`], [157, 200], ['cut', 201, 207, `### 被排除的候選與原因\n${C.replaceAll('%s', 'spots.json')}`], [208, 231], ['cut', 232, 247, `### 其他候選（給主控合併參考）\n${C.replaceAll('%s', 'spots.json')}（沒收錄的體驗類；已收錄的景點不重列）`]] },
  T3: { src: 'lodging.md', ranges: [[1, 23], ['cut', 24, 30, `### 跨組共通的缺漏（打電話要問）\n${Q}`], [31, 74], ['cut', 75, 90, `### 被排除的候選、範圍內但沒有收錄\n${C.replaceAll('%s', 'lodging.json')}`], [91, 188], ['cut', 189, 206, `### 被排除／沒有收錄的候選\n${C.replaceAll('%s', 'lodging.json')}`], [207, 300], ['cut', 301, 312, `### 被排除的候選\n${C.replaceAll('%s', 'lodging.json')}`], [313, 382], ['cut', 383, 394, `### 被排除的候選與原因\n${C.replaceAll('%s', 'lodging.json')}`], [395, 409]] },
  T4a: { src: 'restaurants.md', ranges: [[1, 161], ['cut', 162, 415, `## 候選表\n${C.replaceAll('%s', 'restaurants.json')}（205 家；欄位說明見 schema/candidate.schema.json，轉換規則見 scripts/migrate-toba-t7b.mjs）\n`]] },
  T4b: { src: 'restaurants.md', ranges: [[416, 480]] },
  T4c: { src: 'restaurants.md', ranges: [[481, 568], ['cut', 569, 622, '（貼上的 `node scripts/restaurant-gaps.mjs toba` 輸出已刪掉，要看就重跑；結論在下面的「缺口」。T7b）\n'], [623, 679]] },
};
const header = (src) => `> T7b（2026-10-18）：原文搬自 \`data/raw/toba/${src}\`，內容沒有改寫；被排除、沒收錄的候選移到 \`candidates/\`，要打電話、人工確認的事移到 \`questions.md\`，貼上的腳本輸出刪掉。\n`;
for (const [task, { src, ranges }] of Object.entries(plan)) {
  const lines = show(`data/raw/toba/${src}`);
  const out = [];
  let covered = 0;
  for (const r of ranges) {
    if (r[0] === 'cut') { out.push(...r[3].split('\n')); covered += r[2] - r[1] + 1; }
    else { out.push(...lines.slice(r[0] - 1, r[1])); covered += r[1] - r[0] + 1; }
  }
  let text = out.join('\n')
    .replace('](../../../docs/CONVENTIONS.md)', '](../../../../docs/CONVENTIONS.md)')
    .replace('[transport.md](transport.md)', '[transport.md](../transport.md)');
  // 第一行標題之後插入說明
  const [first, ...rest] = text.split('\n');
  while (rest[0] === '') rest.shift();
  text = [first, '', header(src).trimEnd(), '', ...rest].join('\n').replace(/\n+$/, '\n');
  fs.mkdirSync(`${root}/data/raw/toba/log`, { recursive: true });
  fs.writeFileSync(`${root}/data/raw/toba/log/${task}.md`, text);
  console.log(task, src, 'lines', text.split('\n').length);
}
