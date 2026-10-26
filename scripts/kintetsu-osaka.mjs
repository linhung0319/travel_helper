#!/usr/bin/env node
// 把往返大阪的近鐵特急加上大阪側的停站（大阪難波、大阪上本町、鶴橋），寫回
// data/timetables/kintetsu/_travel-times.json（T28）。格式不變：大阪的站加進各班的 stops 和 stationOrder。
//
//   北上（伊勢市、宇治山田、五十鈴川、鳥羽 → 大阪）：_travel-times.json 裡終點是大阪難波、大阪上本町的
//     特急、しまかぜ，平日、土休日都做。每班從伊勢市的 T7（列車停站頁）讀之後的停站。
//   南下（大阪 → 伊勢志摩）：只做平日（第一天 2027-02-02 是週二）。大阪難波、大阪上本町（地上月台）
//     平日的 T5（發車時刻表）裡，在 _travel-times.json 已經有的特急、しまかぜ，從大阪那站的 T7 讀停站。
//
// _travel-times.json 是 scripts/kintetsu-timetable.mjs（T1）產生的；那支重跑之後要再跑這支。
// 重跑這支不會重複加：先拿掉既有的大阪停站再補。
// 只抓一般看得到的網頁，請求之間有間隔；抓過的頁面快取在 --cache 目錄。
//
// 用法：node scripts/kintetsu-osaka.mjs [--cache <dir>] [--delay <ms>] [--retrieved YYYY-MM-DD] [--dry-run]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/timetables/kintetsu/_travel-times.json');
const KIX = path.join(ROOT, 'data/access/kix.json');
const EKI = 'https://eki.kintetsu.co.jp/norikae/';

// 大阪側的站：T7 的站名 → 車站 ID（南下順）
const OSAKA = [
  ['大阪難波', 'osaka-namba'],
  ['大阪上本町', 'osaka-uehommachi'],
  ['鶴橋', 'tsuruhashi'],
];
const OSAKA_IDS = OSAKA.map(([, id]) => id);
const idByJa = new Map(OSAKA);
// 北上從伊勢市（sf=3853）讀；南下讀大阪難波（T5 slCode 350-0）、大阪上本町 地上月台（356-0）
const ISESHI_SF = '3853';
const SOUTH_PAGES = [
  { station: 'osaka-namba', url: `${EKI}T5?USR=PC&slCode=350-0&d=1&dw=0` },
  { station: 'osaka-uehommachi', url: `${EKI}T5?USR=PC&slCode=356-0&d=1&dw=0` },
];
const EXPRESS = new Set(['特急', 'しまかぜ']);

const opts = {
  cache: path.join(os.tmpdir(), 'travel_helper-kintetsu-cache'),
  delay: 1500,
  retrieved: new Date().toISOString().slice(0, 10),
  dryRun: false,
};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--cache') opts.cache = path.resolve(process.argv[++i]);
  else if (a === '--delay') opts.delay = Number(process.argv[++i]);
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else if (a === '--dry-run') opts.dryRun = true;
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}
fs.mkdirSync(opts.cache, { recursive: true });

// ---------- 抓網頁（含快取、間隔；同 kintetsu-timetable.mjs） ----------
let lastFetch = 0;
async function get(url) {
  const file = path.join(opts.cache, crypto.createHash('sha1').update(url).digest('hex') + '.html');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const wait = lastFetch + opts.delay - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (travel_helper personal trip planning)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const html = new TextDecoder('shift_jis').decode(Buffer.from(await res.arrayBuffer()));
  fs.writeFileSync(file, html);
  return html;
}

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();

// ---------- T5：只取每班的列車編號、發車時刻、T7 連結 ----------
function parseT5(html) {
  const validFrom = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日現在/);
  const deps = [];
  let hour = null;
  let prevHour = -1;
  const re =
    /<td align="center" style="width:40px[^"]*"[^>]*><b>(\d+)<\/b><\/td>|<A HREF="(T7\?sf=(\d+)&tx=([^&]+)&dw=(\d)&time=\d+)"><div class="K_\d+">[^<]*(?:<font[^>]*>[^<]*<\/font>)?\s*<br>\s*<DIV class=min>(\d+)/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      hour = Number(m[1]);
      if (hour < prevHour) hour += 24;
      prevHour = hour;
      continue;
    }
    deps.push({ trainNo: m[4], dep: `${String(hour).padStart(2, '0')}:${m[6]}`, t7: EKI + m[2] });
  }
  return {
    validFrom: validFrom ? `${validFrom[1]}-${validFrom[2].padStart(2, '0')}-${validFrom[3].padStart(2, '0')}` : null,
    deps,
  };
}

// ---------- T7：列車停站（同 kintetsu-timetable.mjs） ----------
function parseT7(html) {
  const stops = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const row of body.split(/<tr[\s>]/i).slice(1)) {
    const m = [null, ...[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1])];
    if (m.length !== 4) continue;
    const name = decode(m[1]);
    const t = (s) => {
      const x = decode(s).replace('：', ':');
      return /^\d{1,2}:\d{2}$/.test(x) ? x.padStart(5, '0') : null;
    };
    if (!name || name === '停車駅') continue;
    const arr = t(m[2]);
    const dep = t(m[3]);
    if (!arr && !dep) continue;
    stops.push({ name, arr, dep });
  }
  const wrap = (x) => (x && Number(x.slice(0, 2)) < 3 ? `${String(Number(x.slice(0, 2)) + 24)}${x.slice(2)}` : x);
  for (const s of stops) {
    s.arr = wrap(s.arr);
    s.dep = wrap(s.dep);
  }
  return stops;
}

// ---------- 主流程 ----------
const tt = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const problems = [];
const stripOsaka = (t) => (t.stops = t.stops.filter(([id]) => !OSAKA_IDS.includes(id)));
for (const day of Object.values(tt.trains)) for (const t of Object.values(day)) stripOsaka(t);

// 北上
const north = { weekday: 0, holiday: 0 };
for (const [day, dw] of [['weekday', 0], ['holiday', 1]]) {
  for (const [no, t] of Object.entries(tt.trains[day])) {
    if (t.dir !== 'for-ise-nakagawa' || !EXPRESS.has(t.type) || !OSAKA_IDS.includes(t.to)) continue;
    const stops = parseT7(await get(`${EKI}T7?sf=${ISESHI_SF}&tx=${no}&dw=${dw}`));
    const ise = stops.find((s) => s.name === '伊勢市');
    const mine = t.stops.find(([id]) => id === 'iseshi');
    if (!ise || !mine || ise.dep !== mine[2]) {
      problems.push(`${day} ${no}：伊勢市的發車時刻對不上（T7 ${ise?.dep}，_travel-times ${mine?.[2]}）`);
      continue;
    }
    const add = stops.filter((s) => idByJa.has(s.name)).map((s) => [idByJa.get(s.name), s.arr, s.dep]);
    if (!add.length || add.at(-1)[0] !== t.to) problems.push(`${day} ${no}：大阪側的終點不是 ${t.to}（${JSON.stringify(add)}）`);
    t.stops.push(...add);
    north[day]++;
  }
}

// 南下（平日）
let south = 0;
const validFroms = new Set();
const southPages = [];
for (const page of SOUTH_PAGES) {
  const p = parseT5(await get(page.url));
  if (p.validFrom) validFroms.add(p.validFrom);
  southPages.push({ ...page, n: p.deps.length });
  for (const d of p.deps) {
    const t = tt.trains.weekday[d.trainNo];
    if (!t || t.dir !== 'for-kashikojima' || !EXPRESS.has(t.type)) continue;
    if (t.stops.some(([id]) => OSAKA_IDS.includes(id))) continue; // 難波發的已經補過（上本町的地下月台也停）
    const stops = parseT7(await get(d.t7));
    const add = stops.filter((s) => idByJa.has(s.name)).map((s) => [idByJa.get(s.name), s.arr, s.dep]);
    if (!add.length || add[0][0] !== page.station || add[0][2] !== d.dep) {
      problems.push(`weekday ${d.trainNo}：${page.station} 的發車時刻對不上（T5 ${d.dep}，T7 ${JSON.stringify(add[0])}）`);
      continue;
    }
    const ise = stops.find((s) => s.name === '伊勢市');
    const first = t.stops[0];
    if (first[0] !== 'iseshi' || !ise || ise.dep !== first[2]) {
      problems.push(`weekday ${d.trainNo}：伊勢市的發車時刻對不上（T7 ${ise?.dep}，_travel-times ${JSON.stringify(first)}）`);
      continue;
    }
    if (first[1] == null) first[1] = ise.arr; // 原本是區間內的第一站，到站時刻是 null
    add[0][1] = null; // 起點站沒有到站時刻
    t.stops.unshift(...add);
    south++;
  }
}

// stationOrder：大阪側放在最前面（南下順：大阪難波 → 大阪上本町 → 鶴橋 → 伊勢市 → … → 賢島）
tt.stationOrder = [...OSAKA_IDS, ...tt.stationOrder.filter((id) => !OSAKA_IDS.includes(id))];
const order = tt.stationOrder;

// segments：照 kintetsu-timetable.mjs 的算法全部重算（伊勢志摩區間的值不變，只多了大阪側的區間）
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const seg = {};
for (const day of Object.values(tt.trains)) {
  for (const t of Object.values(day)) {
    const cat = t.type === '普通' ? '普通' : t.type;
    for (let i = 0; i + 1 < t.stops.length; i++) {
      const [a, , ad] = t.stops[i];
      const [b, ba, bd] = t.stops[i + 1];
      const key = `${a}>${b}`;
      seg[key] ??= {};
      (seg[key][cat] ??= []).push(toMin(ba ?? bd) - toMin(ad));
    }
  }
}
tt.segments = Object.fromEntries(
  Object.entries(seg)
    .sort(([a], [b]) => {
      const [a1, a2] = a.split('>');
      const [b1, b2] = b.split('>');
      return order.indexOf(a1) - order.indexOf(b1) || order.indexOf(a2) - order.indexOf(b2);
    })
    .map(([k, cats]) => [
      k,
      Object.fromEntries(
        Object.entries(cats).map(([c, xs]) => {
          xs.sort((x, y) => x - y);
          return [c, { min: xs[0], max: xs.at(-1), median: xs[Math.floor(xs.length / 2)], n: xs.length }];
        }),
      ),
    ]),
);

const NOTE =
  '大阪側（T28，scripts/kintetsu-osaka.mjs）：往返大阪的特急、しまかぜ的 stops 加上大阪難波、大阪上本町、鶴橋（stationOrder 排在伊勢市前面）。' +
  '北上（終點大阪難波、大阪上本町）平日、土休日都有；南下（大阪發往伊勢志摩）只有平日（第一天 2/2 週二）。' +
  '伊勢中川、名張等中間站不列（不是資料點），所以會有 tsuruhashi>iseshi 這種跨站的區間。往名古屋的車在伊勢中川轉往大阪的組合、急行都沒有收。' +
  'kintetsu-timetable.mjs 重跑後要再跑 kintetsu-osaka.mjs。';
const notes = (Array.isArray(tt.notes) ? tt.notes.join('') : tt.notes ?? '').replace(/大阪側（T28[\s\S]*$/, '');
tt.notes = notes + NOTE;
tt.sources = tt.sources.filter((s) => !/T28/.test(s.note ?? ''));
tt.sources.push(
  { type: 'official', url: `${EKI}T7?sf=${ISESHI_SF}&tx=1-9080&dw=1`, retrieved: opts.retrieved, note: 'T28：北上往大阪的特急，從伊勢市的列車停站頁（T7，tx 換成各班的列車編號）讀大阪側的停站' },
  ...SOUTH_PAGES.map((p) => ({ type: 'official', url: p.url, retrieved: opts.retrieved, note: `T28：${p.station} 平日發車時刻表（南下往伊勢志摩的特急），各班再讀 T7` })),
);

console.log(`北上：平日 ${north.weekday} 班、土休日 ${north.holiday} 班；南下（平日）：${south} 班`);
console.log(`南下的時刻表頁：${southPages.map((p) => `${p.station} ${p.n} 班`).join('、')}；validFrom ${[...validFroms].join('、') || '不明'}（_travel-times 是 ${tt.validFrom}）`);

// 和 data/access/kix.json 的第一天 6 班對照（trainNo、大阪難波發、鶴橋發、伊勢市、鳥羽、鵜方、賢島）
const kix = JSON.parse(fs.readFileSync(KIX, 'utf8'));
for (const k of kix.day1.southboundTrains.trains) {
  const t = tt.trains.weekday[k.trainNo];
  const at = (id, i) => t?.stops.find((s) => s[0] === id)?.[i] ?? null;
  const pairs = [
    ['osakaNamba', at('osaka-namba', 2)],
    ['tsuruhashi', at('tsuruhashi', 2)],
    ['iseshi', at('iseshi', 2)],
    ['toba', at('toba', 1)],
    ['ugata', at('ugata', 1)],
    ['kashikojima', at('kashikojima', 1)],
  ];
  const diff = pairs.filter(([k2, v]) => k[k2] !== v).map(([k2, v]) => `${k2} kix ${k[k2]} / 時刻表 ${v}`);
  console.log(`  kix.json ${k.trainNo}：${t ? (diff.length ? '⚠️ ' + diff.join('、') : '一致') : '⚠️ _travel-times 沒有這班'}`);
}

if (problems.length) {
  console.log(`⚠️ 問題 ${problems.length} 筆：`);
  for (const p of problems) console.log('  ' + p);
}
if (!opts.dryRun) {
  fs.writeFileSync(FILE, JSON.stringify(tt, null, 1) + '\n');
  console.log(`寫入 ${path.relative(ROOT, FILE)}`);
}
