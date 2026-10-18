#!/usr/bin/env node
// 餐廳詳細資料（流程步驟 8）的組裝：把一批店的食べログ、Google、讀文 facts、Claude 的判斷合成 restaurants.json 的資料點。
// 取代 T8d 每批在 scratchpad 重寫的 build*.js、cand*.js。
//
// 工作目錄（建議 data/cache/work/<任務>-<批>/，不進 git）：
//   batch.json        node scripts/candidates.mjs export <area> restaurants --keys ... --out <dir>/batch.json
//   tabelog.jsonl     scripts/chrome/tabelog-info.js 的結果，一家一行，前面加 "key"（コース頁也可以放，path 含 /party/）
//   google.jsonl      scripts/chrome/google-place.js 的結果，一家一行，前面加 "key"
//   facts/<key>.json  讀文 subagent 寫的事實（docs/prompts/dossier.md）
//   photos.json       node scripts/photo-check.mjs --file <網址清單> --out <dir>/photos.json（官網照片要 ok 才用）
//   judgement.json    Claude 的判斷（由 draft 產生草稿再改）
//
// 用法：
//   node scripts/build-restaurants.mjs draft <dir>
//       產生 judgement.draft.json：食べログ店舗情報已轉成欄位（scripts/lib/tabelog-parse.mjs，fit15 是建議值），
//       「_」開頭的欄位是給 Claude 看的參考（facts 的原文、警告），build 時忽略。
//       Claude 逐家確認、補 hours、zh、notes、cuisine、contexts、price、access、febNote 等，存成 judgement.json。
//   node scripts/build-restaurants.mjs build <dir> --area <area> [--candidates] [--dry-run]
//       組成資料點寫進 data/areas/<area>/restaurants.json（同 id 就取代，否則加在最後）；
//       --candidates 同時更新候選清單的 pointId、Google 星數、contexts，並拿掉 detailPending。
//
// judgement.json 每家的欄位（key 是 batch 的 key）：
//   id（預設＝key）、region、access、zh、kana、address、hours、closedNote、febNote、closures、contexts、cuisine、
//   priceRange、price、stayMinutes、mustTry、group、reservation、seating、kids、accessibility、smoking、notes、
//   conflicts、official、ig、extraSources、menuPages、inclusion（陣列，預設＝候選的 criteria）、lodgingId（住宿附設的餐廳：Google、座標借住宿）、ratingsNote、extra
//   hours 可以用簡寫：{ "default": [["11:00","15:00"]], "thu": [], "holiday": null, "lastEntry": "14:30", "note": "..." }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, readJsonl } from './lib/json-file.mjs';
import { parseTabelog } from './lib/tabelog-parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const [cmd, dir] = args;
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const flag = (k) => args.includes(`--${k}`);
if (!['draft', 'build'].includes(cmd) || !dir) {
  console.error('用法：node scripts/build-restaurants.mjs <draft|build> <工作目錄> [--area <area>] [--candidates] [--dry-run]');
  process.exit(2);
}

const p = (f) => path.join(dir, f);
const batch = JSON.parse(fs.readFileSync(p('batch.json'), 'utf8'));
const byKey = (rows) => {
  const m = new Map();
  for (const r of rows) {
    if (!r.key) throw new Error(`沒有 key 的一行：${JSON.stringify(r).slice(0, 80)}`);
    m.set(r.key, [...(m.get(r.key) ?? []), r]);
  }
  return m;
};
const tabelog = byKey(readJsonl(p('tabelog.jsonl')));
const google = byKey(readJsonl(p('google.jsonl')));
const factsOf = (key) => (fs.existsSync(p(`facts/${key}.json`)) ? JSON.parse(fs.readFileSync(p(`facts/${key}.json`), 'utf8')) : {});
const storePage = (key) => (tabelog.get(key) ?? []).find((t) => !String(t.path ?? '').includes('/party/'));
const lastGoogle = (key) => (google.get(key) ?? []).filter((g) => g.cid).at(-1);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

if (cmd === 'draft') {
  const out = {};
  for (const b of batch) {
    const t = storePage(b.key);
    const f = factsOf(b.key);
    const g = lastGoogle(b.key);
    const x = parseTabelog(t);
    const check = [...x.warnings];
    if (!t) check.push('tabelog.jsonl 沒有這家的店家頁');
    if (!g) check.push('google.jsonl 沒有這家（或只有列表、沒有 cid）');
    if (t?.warnings?.length) check.push(...t.warnings.map((w) => `tabelog-info：${w}`));
    if (x.status) check.push(`食べログ標示「${x.status}」：照排除規則處理`);
    // facts 是 subagent 寫的，格式不一定對（例如「@帳號（網址）」）：對不上 schema 的不採用，交給 Claude 看
    let ig = x.instagram ?? f.instagram ?? null;
    if (ig && !/^@[A-Za-z0-9._]+$/.test(ig)) {
      check.push(`IG 帳號格式不對，沒填：「${ig}」`);
      ig = null;
    }
    out[b.key] = {
      id: b.key,
      region: b.region,
      access: null,
      zh: null,
      kana: null,
      address: x.address,
      hours: null,
      closedNote: null,
      febNote: null,
      closures: [],
      contexts: b.contexts,
      cuisine: [],
      priceRange: x.budget,
      price: null,
      mustTry: f.mustTry ?? [],
      group: {
        seats: x.group.seats,
        maxReservation: x.group.maxReservation,
        privateRoom: x.group.privateRoom,
        buyout: x.group.buyout,
        groupMenu: null,
        fit15: x.group.fit15,
        fitSubgroup: null,
        source: x.group.source,
      },
      reservation: {
        accepted: x.reservation.accepted,
        methods: x.reservation.accepted === 'yes' ? ['phone'] : [],
        phone: x.phone,
        url: null,
        language: '日文',
        note: x.reservation.text ? `食べログ：${x.reservation.text}` : null,
        leadDays: null,
      },
      seating: x.seating,
      kids: x.kids,
      accessibility: { barrierFree: x.barrierFree, note: null },
      smoking: x.smoking,
      notes: null,
      conflicts: f.conflicts ?? [],
      official: f.official ?? x.homepage,
      ig,
      extraSources: [],
      menuPages: [],
      _check: check,
      _tabelog: { hours: x.hoursText, closed: x.closedText, parking: x.parking, remarks: x.remarks, genre: x.genre, tabs: x.tabs, rows: t?.rows ?? null },
      _course: (tabelog.get(b.key) ?? []).filter((r) => String(r.path ?? '').includes('/party/')).map((r) => r.course),
      _facts: Object.fromEntries(['hours', 'closed', 'febNote', 'seating', 'kids', 'accessibility', 'price', 'queue', 'access', 'groupMenu', 'reservation'].map((k) => [k, f[k] ?? null])),
      _google: g ? { name: g.name, rating: g.rating, reviews: g.reviews, address: g.address, website: g.website } : null,
    };
  }
  fs.writeFileSync(p('judgement.draft.json'), JSON.stringify(out, null, 1) + '\n');
  const n = Object.values(out).filter((o) => o._check.length).length;
  console.log(`寫了 ${batch.length} 家到 ${p('judgement.draft.json')}；有警告的 ${n} 家（看 _check）。改完存成 judgement.json 再跑 build。`);
  process.exit(0);
}

// ---------- build ----------
const area = opt('area');
if (!area) {
  console.error('build 要給 --area');
  process.exit(2);
}
const judgement = JSON.parse(fs.readFileSync(p('judgement.json'), 'utf8'));
const photoOk = fs.existsSync(p('photos.json')) ? JSON.parse(fs.readFileSync(p('photos.json'), 'utf8')) : null;
const D = opt('date') ?? today();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SOURCE_TYPES = ['official', 'tourism', 'tabelog', 'google-maps', 'osm', 'wikipedia', 'booking-site', 'blog-ja', 'blog-zh', 'media', 'instagram', 'manual', 'other'];

function expandHours(h) {
  if (h == null || !('default' in h)) return h ?? null;
  const o = {};
  for (const d of DAYS) o[d] = d in h ? h[d] : h.default;
  o.holiday = 'holiday' in h ? h.holiday : null;
  if (h.lastEntry) o.lastEntry = h.lastEntry;
  o.note = h.note ?? null;
  return o;
}

const lodgingCache = {};
const lodgingOf = (id) => {
  for (const a of [area, ...['ise', 'futami', 'toba', 'shima', 'kix'].filter((x) => x !== area)]) {
    const f = path.join(ROOT, `data/areas/${a}/lodging.json`);
    if (!fs.existsSync(f)) continue;
    lodgingCache[a] ??= readJson(f).data;
    const l = lodgingCache[a].find((x) => x.id === id);
    if (l) return l;
  }
  return null;
};

const problems = [];
const built = [];
for (const b of batch) {
  const j = judgement[b.key];
  if (!j) {
    problems.push(`${b.key}：judgement.json 沒有這家（略過）`);
    continue;
  }
  const t = storePage(b.key);
  const f = factsOf(b.key);
  const lod = j.lodgingId ? lodgingOf(j.lodgingId) : null;
  if (j.lodgingId && !lod) problems.push(`${b.key}：找不到住宿 ${j.lodgingId}`);
  let g = lastGoogle(b.key);
  if (lod) {
    g = {
      cid: lod.links.googleMaps?.split('cid=')[1] ?? null,
      lat: lod.coords[1],
      lng: lod.coords[0],
      rating: lod.ratings?.google ?? null,
      reviews: lod.ratings?.googleReviews ?? null,
      name: lod.name.ja,
      img: lod.photos?.find((x) => x.kind === 'google')?.url ?? null,
    };
  }
  if (!g?.cid) {
    problems.push(`${b.key}：沒有 Google 的 cid（google.jsonl），略過`);
    continue;
  }
  const id = j.id ?? b.key;
  const gurl = `https://maps.google.com/?cid=${g.cid}`;
  const tabs = t?.tabs ?? [];

  const photos = [];
  for (const ph of f.photos ?? []) {
    if (photos.length >= 2) break;
    if (!photoOk) {
      problems.push(`${b.key}：沒有 photos.json，官網照片 ${ph.url} 沒檢查，沒用`);
      continue;
    }
    if (photoOk[ph.url]?.ok) photos.push({ url: ph.url, page: ph.page ?? j.official ?? null, kind: 'official', credit: b.name, license: null });
  }
  if (lod) for (const ph of (lod.photos ?? []).filter((x) => x.kind === 'official')) photos.push({ ...ph, credit: b.name });
  if (!photos.length && g.img) photos.push({ url: g.img, page: gurl, kind: 'google', credit: 'Google マップ', license: null });

  const sources = [];
  const seen = new Set();
  const add = (s) => {
    if (!s?.url || seen.has(s.url)) return;
    seen.add(s.url);
    sources.push({ type: SOURCE_TYPES.includes(s.type) ? s.type : 'other', url: s.url, retrieved: s.retrieved ?? D, note: s.note ?? null });
  };
  add({ type: 'tabelog', url: b.tabelog, note: `店舗情報：分數、席數、預約、個室、貸切、營業時間、お子様連れ${t?.owner ? '（店舗会員）' : ''}` });
  add({ type: 'google-maps', url: gurl, note: lod ? '住宿本體的星數、評論數、座標、照片' : '星數、評論數、座標、照片' });
  if (tabs.includes('party/')) add({ type: 'tabelog', url: b.tabelog + 'party/', note: 'コース一覧：套餐名稱、價格、人數' });
  for (const s of j.extraSources ?? []) add(s);
  for (const s of f.sources ?? []) add(s);
  for (const m of b.mentions ?? []) add({ type: m.type ?? 'media', url: m.url, retrieved: m.retrieved, note: [m.title, m.highlight].filter(Boolean).join('：') || null });

  const menu = (j.menuPages ?? []).map((u) => ({ url: u, source: 'official', retrieved: D }));
  for (const tab of tabs) if (tab !== 'dtlmenu/drink/') menu.push({ url: b.tabelog + tab, source: 'tabelog', retrieved: D });
  if (!menu.length && b.tabelog) menu.push({ url: b.tabelog + 'dtlmenu/photo/', source: 'tabelog', retrieved: D });

  const extra = { ...(j.extra ?? {}) };
  if (j.conflicts?.length) extra.conflicts = j.conflicts;
  if (j.lodgingId) extra.lodgingId = j.lodgingId;

  for (const k of ['hours', 'contexts', 'cuisine', 'group', 'reservation', 'kids']) if (j[k] === undefined) problems.push(`${b.key}：judgement 沒有 ${k}`);
  if (!j.access) problems.push(`${b.key}：access 沒填（walk｜car｜ferry）`);

  built.push({
    id,
    type: 'restaurant',
    name: { ja: b.name, kana: j.kana ?? null, zh: j.zh ?? null, en: null },
    area,
    region: j.region ?? b.region,
    coords: [g.lng, g.lat],
    coordsSource: 'google-maps-url',
    address: j.address ?? null,
    hours: expandHours(j.hours),
    closedNote: j.closedNote ?? null,
    febNote: j.febNote ?? null,
    closures: j.closures ?? [],
    photos,
    links: { official: j.official ?? null, googleMaps: gurl, tabelog: b.tabelog ?? null, instagram: j.ig ?? null },
    tags: [],
    tier: null,
    sources,
    verified: false,
    anchors: [],
    contexts: j.contexts ?? b.contexts ?? [],
    access: j.access ?? null,
    cuisine: j.cuisine ?? [],
    priceRange: j.priceRange ?? null,
    price: j.price ?? null,
    stayMinutes: j.stayMinutes ?? null,
    mustTry: j.mustTry ?? [],
    menu,
    ratings: {
      tabelog: t?.score ?? b.ratings?.tabelog ?? null,
      tabelogReviews: t?.reviews ?? b.ratings?.tabelogReviews ?? null,
      google: g.rating ?? null,
      googleReviews: g.reviews ?? null,
      note: j.ratingsNote ?? (lod ? `Google 是住宿本體「${lod.name.ja}」的評分` : null),
    },
    inclusion: j.inclusion ?? b.criteria ?? [],
    tabelogOwner: t?.owner ?? null,
    googleName: g.name && g.name !== b.name ? g.name : null,
    notes: j.notes ?? null,
    group: j.group,
    reservation: j.reservation,
    seating: j.seating ?? [],
    kids: j.kids ?? null,
    accessibility: j.accessibility ?? null,
    smoking: j.smoking ?? null,
    extra,
  });
}

for (const x of problems) console.log(`⚠ ${x}`);
const outFile = path.join(ROOT, `data/areas/${area}/restaurants.json`);
const { data: existing, eol } = fs.existsSync(outFile) ? readJson(outFile) : { data: [], eol: '\r\n' };
let replaced = 0;
for (const r of built) {
  const i = existing.findIndex((e) => e.id === r.id);
  if (i >= 0) {
    existing[i] = r;
    replaced++;
  } else existing.push(r);
}
for (const r of built) console.log(`${r.id}  fit15=${r.group?.fit15}  photos=${r.photos.map((x) => x.kind).join('+')}  mustTry=${r.mustTry.length}  sources=${r.sources.length}${r.googleName ? `  Google 名稱：${r.googleName}` : ''}`);
console.log(`組了 ${built.length} 家（取代 ${replaced}、新增 ${built.length - replaced}），restaurants.json 合計 ${existing.length} 筆`);

let cands = null;
if (flag('candidates')) {
  const cf = path.join(ROOT, `data/raw/${area}/candidates/restaurants.json`);
  cands = { file: cf, ...readJson(cf) };
  for (const r of built) {
    const b = batch.find((x) => (judgement[x.key]?.id ?? x.key) === r.id);
    const c = cands.data.find((x) => x.key === (b?.candKey ?? b?.key));
    if (!c) {
      console.log(`⚠ ${r.id}：候選清單找不到 ${b?.candKey}`);
      continue;
    }
    if (c.status !== 'included') console.log(`⚠ ${r.id}：候選 status 是 ${c.status}，沒有改（要改用 candidates.mjs set）`);
    c.pointId = r.id;
    delete c.detailPending;
    c.ratings = { ...c.ratings, google: r.ratings.google, googleReviews: r.ratings.googleReviews };
    c.contexts = r.contexts;
  }
}

if (flag('dry-run')) console.error('（--dry-run，沒有寫檔）');
else {
  writeJson(outFile, existing, eol);
  if (cands) writeJson(cands.file, cands.data, cands.eol);
  console.error(`寫回 ${path.relative(ROOT, outFile)}${cands ? ' 和候選清單' : ''}；記得跑 scripts/validate`);
}
