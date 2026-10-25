#!/usr/bin/env node
// 從近鐵官網的時刻表頁面（eki.kintetsu.co.jp/norikae/T5、T7）抓目標區間 21 站的時刻表，
// 寫成 data/timetables/kintetsu/<station-id>.json 和 _travel-times.json。
//
//   T5：某站某方向的發車時刻表（平日 dw=0、土休日 dw=1）
//   T7：某班列車從該站之後的停站與到發時刻；tx 是列車編號，各站共用
//
// 只抓一般看得到的網頁，請求之間有間隔；抓過的頁面快取在 --cache 目錄，重跑不會再抓。
//
// 用法：node scripts/kintetsu-timetable.mjs [--cache <dir>] [--delay <ms>] [--retrieved YYYY-MM-DD]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data/timetables/kintetsu');
const EKI = 'https://eki.kintetsu.co.jp/norikae/';

const opts = {
  cache: path.join(os.tmpdir(), 'travel_helper-kintetsu-cache'),
  delay: 1500,
  retrieved: new Date().toISOString().slice(0, 10),
};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--cache') opts.cache = path.resolve(process.argv[++i]);
  else if (a === '--delay') opts.delay = Number(process.argv[++i]);
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}
fs.mkdirSync(opts.cache, { recursive: true });

// ---------- 抓網頁（含快取、間隔） ----------
let lastFetch = 0;
async function get(url) {
  const file = path.join(opts.cache, crypto.createHash('sha1').update(url).digest('hex') + '.html');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const wait = lastFetch + opts.delay - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (travel_helper personal trip planning)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // eki.kintetsu.co.jp 是 Shift_JIS，www.kintetsu.co.jp 是 UTF-8
  const charset = /charset=["']?shift_jis/i.test(buf.subarray(0, 2000).toString('latin1')) ? 'shift_jis' : 'utf-8';
  const html = new TextDecoder(charset).decode(buf);
  fs.writeFileSync(file, html);
  return html;
}

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();

// ---------- 站名、終點站對照 ----------
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'))
  // 大阪的近鐵站（T28）不是目標區間，往返大阪的特急由 kintetsu-osaka.mjs 另外補（這支重跑後要再跑那支）
  .filter((s) => s.operator === 'kintetsu' && s.area !== 'osaka')
  .sort((a, b) => a.stationNumber.localeCompare(b.stationNumber)); // M73 伊勢市 → M93 賢島（南下順）
const order = stations.map((s) => s.id);
const idByJa = new Map(stations.map((s) => [s.name.ja, s.id]));

// 目標區間外的終點站：kebab-case 羅馬字
const OUTSIDE = {
  伊勢中川: 'ise-nakagawa',
  白塚: 'shiratsuka',
  名古屋: 'kintetsu-nagoya',
  近鉄名古屋: 'kintetsu-nagoya',
  大阪難波: 'osaka-namba',
  大阪上本町: 'osaka-uehommachi',
  京都: 'kyoto',
  松阪: 'matsusaka',
  明星: 'myojo',
  明野: 'akeno',
  宮町: 'miyamachi',
  近鉄四日市: 'kintetsu-yokkaichi',
  津: 'tsu',
  名張: 'nabari',
  大和八木: 'yamato-yagi',
  奈良: 'kintetsu-nara',
  近鉄奈良: 'kintetsu-nara',
};
function destId(ja) {
  const id = idByJa.get(ja) ?? OUTSIDE[ja];
  if (!id) throw new Error(`不認得的終點站「${ja}」，請加進 OUTSIDE`);
  return id;
}

// 特急車種代號（時刻表格子裡接在終點站簡稱後面）
const CAR_TYPES = { UL: 'アーバンライナー', ISL: '伊勢志摩ライナー', V: 'ビスタカー', H: 'ひのとり', AL: 'ACE' };

function normalizeType(label) {
  if (label.includes('しまかぜ')) return 'しまかぜ';
  return label.replace(/\s+/g, '');
}

// ---------- T5：一站一方向的時刻表 ----------
function parseT5(html) {
  const validFrom = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日現在/);
  const heading = html.match(/<b>([^<]*?方面)&nbsp;(?:&nbsp;)*(平日|土休日)のダイヤ<\/b>/);
  const remarks = html.match(/<div class="remarks">([\s\S]*?)<\/div>\s*<\/td>/)?.[1] ?? '';

  // 凡例：<div class="K_1911"><div class=min>10<span class="note">A</span></div>観光特急しまかぜ（大阪難波発着）</div>
  const typeByClass = {};
  const noteText = {};
  for (const m of remarks.matchAll(/<div class="(K_\d+)"><div class=min>\d+(?:<span class="note">([^<]*)<\/span>)?<\/div>([^<]*)<\/div>/g)) {
    typeByClass[m[1]] ??= normalizeType(decode(m[3]));
    if (m[2]) noteText[m[2]] = decode(m[3]);
  }
  // 終點站簡稱：中＝伊勢中川
  const abbr = {};
  for (const m of decode(remarks.replace(/<div[\s\S]*?<\/div>\s*<\/div>/g, '')).matchAll(/([^\s＝]+)＝([^\s＝]+)/g)) {
    if (!/^(UL|ISL|V|■|●)$/.test(m[1])) abbr[m[1]] = m[2];
  }
  // 其他注意事項（例如「◆＝土曜日運休」）
  const extraNotes = [...remarks.matchAll(/([^\s>]+)＝([^<&]+)/g)].map((m) => `${m[1]}＝${m[2].trim()}`);

  const abbrKeys = Object.keys(abbr).sort((a, b) => b.length - a.length);
  const deps = [];
  let hour = null;
  const re =
    /<td align="center" style="width:40px[^"]*"[^>]*><b>(\d+)<\/b><\/td>|<A HREF="(T7\?sf=(\d+)&tx=([^&]+)&dw=(\d)&time=\d+)"><div class="(K_\d+)">([^<]*)((?:<font[^>]*>[^<]*<\/font>)?)\s*<br>\s*<DIV class=min>(\d+)(?:<span class="note">([^<]*)<\/span>)?/g;
  let prevHour = -1;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      hour = Number(m[1]);
      if (hour < prevHour) hour += 24; // 過了午夜
      prevHour = hour;
      continue;
    }
    const [, , href, sf, tx, dw, cls, cell, mark, min, note] = m;
    const label = cell.trim();
    const key = abbrKeys.find((k) => label.startsWith(k));
    if (!key) throw new Error(`時刻表格子「${label}」的終點站簡稱不在凡例裡`);
    const suffix = label.slice(key.length);
    const type = typeByClass[cls];
    if (!type) throw new Error(`列車種別 ${cls} 不在凡例裡`);
    const notes = [];
    if (suffix) notes.push(CAR_TYPES[suffix] ?? `車種代號 ${suffix}`);
    // しまかぜ的備註是「観光特急しまかぜ（大阪難波発着）」：留下「大阪難波発着」，用來判斷停駛的星期
    if (note && noteText[note]?.includes('しまかぜ')) notes.push(noteText[note].match(/（(.+)）/)?.[1] ?? noteText[note]);
    else if (note && noteText[note]) notes.push(noteText[note]);
    else if (note && !noteText[note]) notes.push(`備註記號 ${note}`);
    if (/[●■]/.test(mark)) notes.push('車いす対応車両');
    deps.push({
      dep: `${String(hour).padStart(2, '0')}:${min}`,
      type,
      toJa: abbr[key],
      trainNo: tx,
      note: notes.length ? notes.join('；') : null,
      t7: EKI + href,
      sf,
      dw: Number(dw),
    });
  }
  return {
    validFrom: validFrom ? `${validFrom[1]}-${validFrom[2].padStart(2, '0')}-${validFrom[3].padStart(2, '0')}` : null,
    direction: heading?.[1] ?? null,
    day: heading?.[2] ?? null,
    deps,
    extraNotes,
  };
}

// 方向選單：<option value="454-14,1" selected>志摩線 伊勢中川・…方面</option>
function parseDirections(html) {
  return [...html.matchAll(/<option value="([\d-]+),(\d+)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({
    slCode: m[1],
    d: Number(m[2]),
    label: m[3].trim(),
  }));
}

function directionKey(label) {
  // 南下（往鳥羽、賢島）統一叫 for-kashikojima，北上統一叫 for-ise-nakagawa；實際終點看 to
  return /賢島|鳥羽|宇治山田方面|五十鈴川/.test(label) && !/伊勢中川/.test(label) ? 'for-kashikojima' : 'for-ise-nakagawa';
}

// ---------- T7：列車停站 ----------
function parseT7(html) {
  const title = decode(html.match(/■&nbsp;[\s\S]*?<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? '');
  const stops = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // 一列一列切開再取 3 個 td（停車駅、到着時刻、出発時刻）；用單一 regex 會把表頭和第一站黏在一起
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
  // T7 過了午夜寫 0:03，時刻表（T5）寫 24:03；統一成 24:xx（深夜 0～2 點沒有首班車）
  const wrap = (x) => (x && Number(x.slice(0, 2)) < 3 ? `${String(Number(x.slice(0, 2)) + 24)}${x.slice(2)}` : x);
  for (const s of stops) {
    s.arr = wrap(s.arr);
    s.dep = wrap(s.dep);
  }
  return { title, stops };
}

// ---------- 主流程 ----------
const raw = {}; // station → { slCode, pages: [{ url, dw, d, label, parsed }] }

for (const st of stations) {
  const page = st.links.official;
  const html = await get(page);
  const slCode = html.match(/slCode=([\d-]+)/)?.[1];
  if (!slCode) throw new Error(`${st.id}：車站頁找不到 slCode`);
  raw[st.id] = { slCode, page, pages: [] };
  for (const dw of [0, 1]) {
    const first = await get(`${EKI}T5?USR=PC&slCode=${slCode}&d=1&dw=${dw}`);
    for (const dir of parseDirections(first)) {
      const url = `${EKI}T5?USR=PC&slCode=${dir.slCode}&d=${dir.d}&dw=${dw}`;
      const parsed = parseT5(dir.d === 1 && dir.slCode === slCode ? first : await get(url));
      raw[st.id].pages.push({ url, dw, d: dir.d, label: dir.label, parsed });
    }
  }
  console.log(`${st.id}（${st.name.ja}）slCode=${slCode}：${raw[st.id].pages.map((p) => `${p.dw ? '土休' : '平日'}/${p.label} ${p.parsed.deps.length} 班`).join('、')}`);
}

// 每班列車找目標區間內最上游的車站，從那裡抓 T7，就能拿到之後所有停站
const trainsByKey = new Map(); // `${dw}|${tx}` → [{ station, dep, t7, dirKey }]
for (const [sid, r] of Object.entries(raw)) {
  for (const p of r.pages) {
    const dirKey = directionKey(p.label);
    for (const d of p.parsed.deps) {
      const k = `${p.dw}|${d.trainNo}`;
      if (!trainsByKey.has(k)) trainsByKey.set(k, []);
      trainsByKey.get(k).push({ station: sid, dep: d.dep, t7: d.t7, dirKey, type: d.type, toJa: d.toJa, note: d.note });
    }
  }
}

const trains = { weekday: {}, holiday: {} };
const mismatches = [];
let n = 0;
for (const [k, occ] of trainsByKey) {
  const [dw, tx] = k.split('|');
  const south = occ[0].dirKey === 'for-kashikojima';
  occ.sort((a, b) => (order.indexOf(a.station) - order.indexOf(b.station)) * (south ? 1 : -1));
  const head = occ[0];
  const { stops } = parseT7(await get(head.t7));
  if (++n % 25 === 0) console.log(`列車停站：${n}/${trainsByKey.size}`);
  const inRange = stops.filter((s) => idByJa.has(s.name)).map((s) => [idByJa.get(s.name), s.arr, s.dep]);
  if (!inRange.length || inRange[0][0] !== head.station) {
    mismatches.push(`${k}：T7 的第一站不是 ${head.station}（${JSON.stringify(inRange[0])}）`);
  }
  // 各站時刻表的發車時間要和 T7 一致（確認 tx 在各站是同一班車）
  for (const o of occ) {
    const s = inRange.find((x) => x[0] === o.station);
    if (!s || s[2] !== o.dep) mismatches.push(`${k}：${o.station} 時刻表 ${o.dep}，T7 ${s ? s[2] : '沒停'}`);
  }
  trains[dw === '0' ? 'weekday' : 'holiday'][tx] = {
    type: head.type,
    note: head.note,
    to: destId(head.toJa),
    dir: head.dirKey,
    stops: inRange,
  };
}

// ---------- 寫各站檔案 ----------
fs.mkdirSync(OUT_DIR, { recursive: true });
const validFroms = new Set();
for (const st of stations) {
  const r = raw[st.id];
  const directions = {};
  const notes = new Set();
  for (const p of r.pages) {
    const key = directionKey(p.label);
    directions[key] ??= { weekday: [], holiday: [] };
    const list = directions[key][p.dw ? 'holiday' : 'weekday'];
    for (const d of p.parsed.deps) {
      list.push({ dep: d.dep, type: d.type, to: destId(d.toJa), trainNo: d.trainNo, note: d.note });
    }
    list.sort((a, b) => a.dep.localeCompare(b.dep));
    if (p.parsed.validFrom) validFroms.add(p.parsed.validFrom);
    for (const x of p.parsed.extraNotes) notes.add(x);
  }
  const validFrom = r.pages.map((p) => p.parsed.validFrom).find(Boolean) ?? null;
  const doc = {
    station: st.id,
    validFrom,
    validTo: null,
    retrieved: opts.retrieved,
    source: r.pages[0].url,
    sources: [
      ...r.pages.map((p) => ({
        type: 'official',
        url: p.url,
        retrieved: opts.retrieved,
        note: `近鐵時刻表：${p.label}（${p.dw ? '土休日' : '平日'}）`,
      })),
      { type: 'official', url: r.page, retrieved: opts.retrieved, note: '近鐵車站頁（時刻表連結）' },
    ],
    directions,
    notes:
      '方向鍵統一：for-kashikojima＝往鳥羽、賢島方向（南下），for-ise-nakagawa＝往伊勢中川、名古屋、大阪方向（北上）；實際終點看 to。' +
      'trainNo 是近鐵時刻表網站的列車編號（tx），同一班車在各站相同，可以用來對照 _travel-times.json 的停站時刻。' +
      '「holiday」是近鐵的土休日ダイヤ（週六、週日、國定假日）。しまかぜ不是每天行駛（有固定休日、檢修日），搭乘前要查運行日。',
    extra: { slCode: r.slCode },
  };
  fs.writeFileSync(path.join(OUT_DIR, `${st.id}.json`), JSON.stringify(doc, null, 2) + '\n');
}

// ---------- _travel-times.json ----------
// segments：相鄰兩站之間的車程（分鐘），依種別分「各停（普通等）」和「特急」
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const seg = {};
for (const day of Object.values(trains)) {
  for (const t of Object.values(day)) {
    const cat = t.type === '普通' ? '普通' : t.type;
    for (let i = 0; i + 1 < t.stops.length; i++) {
      const [a, , ad] = t.stops[i];
      const [b, ba, bd] = t.stops[i + 1];
      const mins = toMin(ba ?? bd) - toMin(ad);
      const key = `${a}>${b}`;
      seg[key] ??= {};
      (seg[key][cat] ??= []).push(mins);
    }
  }
}
const segments = Object.fromEntries(
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

const tt = {
  validFrom: [...validFroms].sort().at(-1) ?? null,
  retrieved: opts.retrieved,
  stationOrder: order,
  notes:
    '近鐵目標區間（伊勢市 M73 ～ 賢島 M93）的車程。' +
    'trains：每班車在目標區間內的停站時刻，鍵是 weekday（平日）/holiday（土休日）→ trainNo（和各站時刻表的 trainNo 相同）；' +
    'stops 每一項是 [車站 ID, 到站時刻, 發車時刻]，起點站的到站時刻和終點站的發車時刻可能是 null；只列停車的站，通過的站不列。' +
    'dir 是方向（for-kashikojima 南下、for-ise-nakagawa 北上），to 是終點站（可能在區間外），note 是車種（伊勢志摩ライナー等）或しまかぜ的發著站（例如「大阪難波発着」）。' +
    '查「A 站某時之後的下一班到 B 站」：在 trains 裡找 stops 依序含有 A、B 且 A 的發車時刻 ≥ 指定時刻的列車（scripts/next-train.mjs）。' +
    'segments：相鄰兩個停車站之間的車程統計（分鐘，以後一站的到站時刻減前一站的發車時刻），依列車種別分開；' +
    '特急、しまかぜ跳過的站會出現跨站的區間（例如 toba>ugata）。',
  segments,
  trains,
  sources: [
    { type: 'official', url: `${EKI}T5?USR=PC&slCode=${raw.iseshi.slCode}&d=1&dw=0`, retrieved: opts.retrieved, note: '近鐵時刻表（各站 T5 頁面，網址見各站檔案）' },
    { type: 'official', url: `${EKI}T7`, retrieved: opts.retrieved, note: '近鐵時刻表的列車停站頁（T7?sf=…&tx=…&dw=…），每班車取目標區間內最上游的停車站' },
  ],
};
fs.writeFileSync(path.join(OUT_DIR, '_travel-times.json'), JSON.stringify(tt, null, 1) + '\n');

console.log(`\n列車數：平日 ${Object.keys(trains.weekday).length}、土休日 ${Object.keys(trains.holiday).length}；validFrom：${[...validFroms].join('、')}`);
if (mismatches.length) {
  console.log(`⚠️ 不一致 ${mismatches.length} 筆：`);
  for (const m of mismatches.slice(0, 50)) console.log('  ' + m);
}
