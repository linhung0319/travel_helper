// 把口コミ、Google 評論的重點（主 session 寫的 notes/<id>.md）併進 dossiers/<id>.md。
// T8e、T9d 每批都在工作目錄複製 notes-to-json.mjs＋dossier-merge.mjs，這裡整理成共用的純函式（T9d 第 5 批）。
//
// notes/<id>.md 的格式（一家一檔）：
//   - 來源：
//     - [tabelog] 食べログ口コミ（…；2026-10-19 讀）https://…/dtlrvwlst/
//   - [推薦] …                         ← 接在哪個來源後面，就引用那個來源
//     - [google-maps] Google 評論（…）https://maps.google.com/?cid=…
//   - [缺點] …
//   - 待確認：…                         ← 放進「## 衝突、待確認」
//   - 資料量：心得 N 則（食べログ口コミ a、Google 評論 b）
//
// dossier 的來源清單可以是「- 來源：」或「## 來源」開頭，項目是「  1. 」（縮排不拘，也接受「1) 」）。

const SRC_ITEM = /^\s*(\d+)[.)]\s/;
const NOTE_SRC = /^\s+- (\[(?:tabelog|google-maps)\].*)$/;
export const READ_MARK = /\[(tabelog|google-maps)\] (食べログ口コミ|Google 評論)（/;

/** notes/<id>.md → { sources, points:[{text, src}], pending, amount } */
export function parseNote(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const sources = [];
  const points = [];
  const pending = [];
  let amount = null;
  for (const l of lines) {
    const m = l.match(NOTE_SRC);
    if (m) {
      sources.push(m[1]);
      continue;
    }
    if (/^- 資料量：/.test(l)) amount = l.replace(/^- 資料量：/, '').trim();
    else if (/^- 待確認：/.test(l)) pending.push({ text: l, src: sources.length });
    else if (/^- \[/.test(l)) points.push({ text: l, src: sources.length });
  }
  if (!sources.length) throw new Error('notes 沒有 [tabelog]／[google-maps] 來源行（要縮排的「  - [tabelog] …」）');
  if (points.some((p) => p.src === 0)) throw new Error('有重點寫在第一個來源行之前，不知道引用哪個來源');
  return { sources, points, pending, amount };
}

/** 找 dossier 的來源清單：回傳 { last（最後一個項目的行號）, maxN } */
export function findSourceList(lines) {
  const start = lines.findIndex((l) => /^(- )?來源[：:]?\s*$|^#+\s*來源/.test(l.trim()) || /^- 來源/.test(l));
  if (start < 0) throw new Error('找不到來源清單（「- 來源：」或「## 來源」）');
  let last = -1;
  let maxN = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(SRC_ITEM);
    if (m) {
      last = i;
      maxN = Math.max(maxN, Number(m[1]));
      continue;
    }
    if (last < 0 && (lines[i].trim() === '' || /^\s+\S/.test(lines[i]))) continue; // 標題和第一項之間的空行、說明（例如「官網讀不到」，T9d 第 4 批 磯人）
    if (/^\s{2,}\S/.test(lines[i]) && last >= 0) continue; // 上一項的續行
    break;
  }
  if (last < 0) throw new Error('來源清單裡沒有「1. 」這種編號項目');
  return { last, maxN };
}

/** 併進 dossier；已經有口コミ／評論來源的回傳 null（跳過） */
export function mergeDossier(raw, note) {
  const crlf = raw.includes('\r\n');
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines.some((l) => READ_MARK.test(l))) return null;
  const { last, maxN } = findSourceList(lines);
  const indent = lines[last].match(/^\s*/)[0];
  lines.splice(last + 1, 0, ...note.sources.map((s, i) => `${indent}${maxN + i + 1}. ${s}`));
  const ref = (k) => `（${maxN + k}）`;
  const sec = (h) => lines.findIndex((l) => l.startsWith(h));
  const endOf = (start) => {
    let i = start + 1;
    while (i < lines.length && !lines[i].startsWith('## ')) i++;
    while (i > start + 1 && lines[i - 1].trim() === '') i--;
    return i;
  };
  const pts = sec('## 重點');
  if (pts < 0) throw new Error('找不到「## 重點」');
  lines.splice(endOf(pts), 0, ...note.points.map((p) => p.text + ref(p.src)));
  if (note.pending.length) {
    let c = sec('## 衝突');
    const add = note.pending.map((p) => p.text + ref(p.src));
    if (c < 0) {
      const a = sec('## 資料量');
      lines.splice(a < 0 ? lines.length : a, 0, '## 衝突、待確認', '', ...add, '');
    } else lines.splice(endOf(c), 0, ...add);
  }
  if (note.amount) {
    const a = sec('## 資料量');
    const amt = `- ${note.amount}；部落格心得：未查（深入調查）`;
    if (a < 0) lines.push('', '## 資料量', amt);
    else {
      const e = endOf(a);
      lines.splice(a + 1, e - a - 1, amt);
    }
  }
  let out = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  if (crlf) out = out.replace(/\n/g, '\r\n');
  return out;
}
