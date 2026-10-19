// scripts/chrome/tabelog-list.js 回傳的壓縮文字行 → 物件（T9c 新增）。
// 每頁的各段（[1/3]…、第 2～3 段）原樣接起來存成一個 .txt；這裡把段落標記拿掉再解析。

const FIELDS = ['id', 'name', 'genre', 'score', 'reviews', 'holiday', 'dinner', 'lunch', 'address', 'room', 'status', 'area', 'pr'];

// 一頁（或多頁接在一起）的文字 → { pages: [{ title, from, to, total, skipped, shops }], warnings, complete }
export function parseLines(raw) {
  const text = String(raw).replace(/\r/g, '').replace(/\[\d+(?:\/\d+)?\]/g, '');
  const pages = [];
  const warnings = [];
  let cur = null;
  let ends = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('#P|')) {
      const [, title, range, skipped] = line.split('|');
      const m = (range ?? '').match(/(\d+)-(\d+)\/(\d+)/);
      cur = { title, from: m ? +m[1] : null, to: m ? +m[2] : null, total: m ? +m[3] : null, skipped: Number(skipped) || 0, shops: [] };
      pages.push(cur);
    } else if (line.startsWith('#WARN')) warnings.push(line.slice(6));
    else if (line.startsWith('#END')) ends++;
    else {
      if (!cur) throw new Error(`第一行不是 #P：${line.slice(0, 40)}`);
      const v = line.split('|');
      if (v.length !== FIELDS.length) throw new Error(`欄位數 ${v.length}（要 ${FIELDS.length}）：${line.slice(0, 60)}（段落接漏了？）`);
      const o = Object.fromEntries(FIELDS.map((f, i) => [f, v[i] === '' ? null : v[i]]));
      o.score = o.score == null ? null : Number(o.score);
      o.reviews = o.reviews == null ? null : Number(o.reviews);
      cur.shops.push(o);
    }
  }
  for (const p of pages) {
    // 0 件（「0-0/0」）是正常的空結果
    if (p.from != null && p.total !== 0 && p.to - p.from + 1 !== p.shops.length) {
      warnings.push(`${p.title} ${p.from}-${p.to}：件數 ${p.to - p.from + 1}，讀到 ${p.shops.length} 家`);
    }
  }
  return { pages, warnings, complete: ends === pages.length };
}

// 食べログ店家網址（列表只回傳 ID 和 area 代碼）。縣名由 area 代碼的前 2 碼決定（A24 三重、A27 大阪；T19 加）
const PREF = { 24: 'mie', 27: 'osaka' };
export const tabelogUrl = (s) => `https://tabelog.com/${PREF[s.area.slice(1, 3)] ?? 'mie'}/${s.area.split('-').join('/')}/${s.id}/`;
