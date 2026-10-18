#!/usr/bin/env node
// 餐廳候選（CONVENTIONS §4 步驟 7）：把一批的食べログ列表（scripts/chrome/tabelog-list.js 抽的 lists/*.txt）照 A～F 組成候選（T9c 新增）。
//
// 用法：
//   node scripts/restaurant-candidates.mjs build --work <工作目錄> --rules <rules.json> [--out <工作目錄>/new.json]
//       讀 <工作目錄>/lists/*.txt。檔名是 <町>-<rt|room|kashikiri>-<頁>.txt：rt 是評分排序的町名列表，room 是個室（含半個室）篩選，
//       kashikiri 是貸切可篩選（C 的「在篩選結果裡」）。同一家出現在多個檔案時合併。
//       輸出 candidates 格式的陣列（key 是 tabelog-<店家 ID>，pointId null），之後用 `candidates.mjs add` 加進候選檔。
//   rules.json（Claude 寫的判斷；規則能判斷的不用寫）：
//     {
//       "minScore": 3.1,                       // 低於這個分數、又沒有 override 的店不記（T8c 第 2 批起看到 3.10 為止）
//       "regions": [{ "re": "阿児町神明(6[89]\\d|7[0-5]\\d)", "region": "shima-kashikojima" }, …],  // 依住所，第一個符合的
//       "thresholds": { "shima-ugata": { "aScore": 3.4 } },   // 數量控制（沒寫的照 A 3.30／10 則、C 3.10／15 則）
//       "regionDefaults": { "shima-spain": { "status": "excluded", "reason": "…" } },   // 整個子地區共用（店家的 override 優先）
//       "overrides": { "<店家 ID>": { "status", "criteria": ["D2"], "reason", "region", "note", "contexts" } },
//       "mentions": { "<店家 ID>": [{ "type", "url", "title", "highlight", "retrieved" }] }
//     }
//   B（2 種以上來源）由 mentions 的 type 種類自動算（tourism、media、blog-ja 算「日文媒體」一種，blog-zh 一種）。
//   同類型上限：每個子地區、每個類型 12 家，依 A → F → B → C、同條件內口コミ數排序，超過的標 over-limit。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLines, tabelogUrl } from './lib/tabelog-list.mjs';
import { typeOf, contextsOf, autoExclusion, criteriaAC, roomMax } from './lib/restaurant-cand.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);

// 來源種類（CONVENTIONS「B」：觀光協會、觀光三重、日文部落格與媒體、中文部落格，同一種算一個）
const SOURCE_KIND = { tourism: null, media: 'ja', 'blog-ja': 'ja', 'blog-zh': 'zh', official: null };
export function sourceKinds(mentions) {
  const kinds = new Set();
  for (const m of mentions ?? []) {
    // tourism 要分觀光協會和觀光三重：看網域
    if (m.type === 'tourism') kinds.add(/kankomie\.or\.jp/.test(m.url) ? 'kankomie' : 'kyokai');
    else if (SOURCE_KIND[m.type]) kinds.add(SOURCE_KIND[m.type]);
  }
  return kinds;
}

export function mergeLists(files) {
  const shops = new Map();
  const pages = [];
  for (const { name, text } of files) {
    const filter = name.match(/-(rt|room|kashikiri)-\d+\.txt$/)?.[1];
    if (!filter) throw new Error(`檔名要是 <町>-<rt|room|kashikiri>-<頁>.txt：${name}`);
    const r = parseLines(text);
    if (!r.complete) throw new Error(`${name} 沒有讀完（少了 #END，段落接漏了？）`);
    if (r.warnings.length) throw new Error(`${name}：${r.warnings.join('；')}`);
    for (const p of r.pages) {
      pages.push({ file: name, ...p, shops: p.shops.length });
      for (const s of p.shops) {
        const cur = shops.get(s.id) ?? { ...s, filters: new Set() };
        cur.filters.add(filter);
        if (s.room) cur.room = s.room;
        shops.set(s.id, cur);
      }
    }
  }
  return { shops, pages };
}

const ORDER = ['A', 'F', 'B', 'C'];
const rank = (c) => {
  const i = ORDER.findIndex((k) => (c.criteria ?? []).some((x) => x.startsWith(k)));
  return i < 0 ? ORDER.length : i;
};

export function build(shops, rules) {
  const out = [];
  for (const s of shops.values()) {
    const own = rules.overrides?.[s.id] ?? {};
    if ((s.score ?? 0) < (rules.minScore ?? 0) && !rules.overrides?.[s.id]) continue;
    const region = own.region ?? rules.regions?.find((r) => new RegExp(r.re).test(s.address ?? ''))?.region ?? null;
    // regionDefaults：整個子地區共用的判斷（例如スペイン村休園 → 全部 excluded）；店家自己的 override 優先
    const ov = { ...(rules.regionDefaults?.[region] ?? {}), ...own };
    const th = rules.thresholds?.[region] ?? {};
    const inFilter = s.filters.has('room') || s.filters.has('kashikiri');
    const max = roomMax(s.room);
    const ac = criteriaAC(s, { ...th, inFilter, big15: max != null && max >= 15 });
    const mentions = rules.mentions?.[s.id] ?? [];
    const b = sourceKinds(mentions).size >= 2 ? ['B'] : [];
    const criteria = [...new Set([...ac, ...b, ...(ov.criteria ?? [])])].sort((x, y) => ORDER.indexOf(x[0]) - ORDER.indexOf(y[0]) || x.localeCompare(y));
    const excl = autoExclusion(s);
    const status = ov.status ?? (excl ? 'excluded' : criteria.length ? 'included' : 'not-included');
    let reason = ov.reason ?? (status === 'excluded' ? excl : null);
    if (!reason && status === 'not-included') {
      const why = [];
      if (inFilter && (s.score ?? 0) >= 3.1 && (s.reviews ?? 0) < 15) why.push(`在${s.filters.has('room') ? '個室' : '貸切'}篩選裡但口コミ ${s.reviews ?? 0} 則（C 要 15 則）`);
      if (th.aScore && (s.score ?? 0) >= 3.3 && (s.score ?? 0) < th.aScore && (s.reviews ?? 0) >= 10) why.push(`A 因數量控制（${th.aScore.toFixed(2)}）取消`);
      if (th.cScore && inFilter && (s.score ?? 0) >= 3.1 && (s.score ?? 0) < th.cScore && (s.reviews ?? 0) >= 15) why.push(`C 因數量控制（${th.cScore.toFixed(2)}）取消（個室／貸切）`);
      reason = why.length ? why.join('；') : '未符合 A～F';
    }
    const note = [
      `類型：${typeOf(s.genre)}`,
      s.address && `地址：${s.address}`,
      s.holiday && `定休（食べログ列表）：${s.holiday}`,
      s.room && `個室（食べログ列表）：${s.room}`,
      s.filters.has('kashikiri') && '貸切可（食べログ列表）',
      (s.dinner || s.lunch) && `預算（食べログ列表）：夜 ${s.dinner ?? '-'}／昼 ${s.lunch ?? '-'}`,
      ov.note,
    ].filter(Boolean).join('；');
    out.push({
      key: `tabelog-${s.id}`,
      name: { ja: s.name },
      region,
      category: s.genre,
      status,
      criteria,
      reason,
      pointId: null,
      ratings: { tabelog: s.score, tabelogReviews: s.reviews },
      links: { tabelog: tabelogUrl(s) },
      contexts: ov.contexts ?? contextsOf(s),
      mentions,
      note,
    });
  }
  // 同類型上限（每個子地區、每個類型 12 家）
  const groups = new Map();
  for (const c of out.filter((c) => c.status === 'included')) {
    const k = `${c.region}|${c.note.match(/類型：([^；]+)/)[1]}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => rank(a) - rank(b) || (b.ratings.tabelogReviews ?? 0) - (a.ratings.tabelogReviews ?? 0));
    for (const c of list.slice(12)) {
      c.status = 'over-limit';
      c.reason = '同類型上限（12 家）外';
    }
  }
  return out;
}

async function main() {
  if (args[0] !== 'build' || !opt('work') || !opt('rules')) {
    console.error('用法：node scripts/restaurant-candidates.mjs build --work <工作目錄> --rules <rules.json> [--out <檔案>]（說明見檔案開頭）');
    process.exit(2);
  }
  const dir = path.join(opt('work'), 'lists');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
  const rules = JSON.parse(fs.readFileSync(opt('rules'), 'utf8'));
  const { shops, pages } = mergeLists(files);
  const out = build(shops, rules);
  const unknownIds = Object.keys({ ...rules.overrides, ...rules.mentions }).filter((id) => !shops.has(id));
  if (unknownIds.length) console.error(`警告：rules 裡這些店家 ID 不在列表裡：${unknownIds.join(', ')}`);
  const noRegion = out.filter((c) => !c.region);
  if (noRegion.length) console.error(`警告：${noRegion.length} 家沒有對到子地區：${noRegion.map((c) => c.name.ja).join('、')}`);
  const count = {};
  for (const c of out) count[`${c.region} ${c.status}`] = (count[`${c.region} ${c.status}`] ?? 0) + 1;
  console.error(`列表 ${pages.length} 頁、店 ${shops.size} 家 → 候選 ${out.length} 家`);
  for (const [k, v] of Object.entries(count).sort()) console.error(`  ${k}：${v}`);
  const json = JSON.stringify(out, null, 2) + '\n';
  if (opt('out')) fs.writeFileSync(opt('out'), json);
  else process.stdout.write(json);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
