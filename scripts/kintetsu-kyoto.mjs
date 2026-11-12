#!/usr/bin/env node
// 把近鐵 京都 ↔ 伊勢志摩 的特急加進 data/timetables/kintetsu/_travel-times.json（T87）。
// 京都側的站：近鉄京都（kyoto）、近鉄丹波橋（kintetsu-tambabashi）、大和西大寺（yamato-saidaiji）、大和八木（yamato-yagi）。
//
//   直達（京都 ↔ 賢島、鳥羽，含しまかぜ京都發著）：_travel-times.json 已經有伊勢志摩區間的那一段，
//     這支補上京都側的停站。南下從近鉄京都的 T7 讀，北上從伊勢市的 T7 讀。
//   大和八木換車：
//     - 往返大阪的特急、しまかぜ（大阪線）在大和八木的到發時刻補進去（南下讀大和八木 大阪線的 T5、T7；
//       北上從伊勢市的 T7 讀）。
//     - 京都 ↔ 大和八木（橿原線）的特急另外加成新的班次（stops 只有京都側的站），引擎在大和八木接起來。
//   平日、土休日、兩個方向都做。急行、往名古屋的車在伊勢中川轉的組合不收（同 kintetsu-osaka.mjs）。
//
// 執行順序：kintetsu-timetable.mjs（T1）→ kintetsu-osaka.mjs（T28）→ 這支。前兩支任何一支重跑後，這支都要再跑。
// 重跑不會重複加：先拿掉既有的京都側停站、京都 ↔ 八木的班次再補。
// 只抓一般看得到的網頁，請求之間有間隔；抓過的頁面快取在 --cache 目錄（和另外兩支共用）。
//
// 用法：node scripts/kintetsu-kyoto.mjs [--cache <dir>] [--delay <ms>] [--retrieved YYYY-MM-DD] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EKI, DEFAULT_CACHE, makeGet, parseT5, parseT7, t5url as t5 } from './lib/kintetsu-eki.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/timetables/kintetsu/_travel-times.json');

// 京都側的站：T7 的站名 → 車站 ID（南下順）
const KYOTO = [
  ['京都', 'kyoto'],
  ['近鉄丹波橋', 'kintetsu-tambabashi'],
  ['大和西大寺', 'yamato-saidaiji'],
  ['大和八木', 'yamato-yagi'],
];
const KYOTO_IDS = KYOTO.map(([, id]) => id);
const idByJa = new Map(KYOTO);
const OSAKA_IDS = ['osaka-namba', 'osaka-uehommachi', 'tsuruhashi'];
const ISESHI_SF = '3853'; // 伊勢市（山田線）的 T7
// T5：slCode,d（站別頁 www.kintetsu.co.jp/station/station_info/station05005.html、station02030.html 的連結）
const PAGES = {
  kyotoSouth: { slCode: '360-0', d: 1, label: '近鉄京都 京都線 近鉄奈良・天理・橿原神宮前・賢島方面' },
  yagiOsakaSouth: { slCode: '356-25', d: 2, label: '大和八木 大阪線 名張・五十鈴川・賢島・近鉄名古屋方面' },
  yagiKashiharaNorth: { slCode: '361-13', d: 1, label: '大和八木 橿原線 大和西大寺・京都方面' },
};
const t5url = (p, dw) => t5(p.slCode, p.d, dw);
const EXPRESS = new Set(['特急', 'しまかぜ']);
const DAYS = [
  ['weekday', 0],
  ['holiday', 1],
];
// 京都 ↔ 八木 的新班次：終點站名 → ID（區間外的照 kintetsu-timetable.mjs 的 OUTSIDE）
const DEST = { 京都: 'kyoto', 橿原神宮前: 'kashiharajingu-mae', 大和八木: 'yamato-yagi', 大和西大寺: 'yamato-saidaiji', 近鉄奈良: 'kintetsu-nara', 奈良: 'kintetsu-nara', 天理: 'tenri' };
const KASHIHARA_NOTE = '京都線・橿原線（京都 ↔ 大和八木），在大和八木換大阪線往返伊勢志摩的特急';

const opts = {
  cache: DEFAULT_CACHE,
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

const get = makeGet({ cache: opts.cache, delay: opts.delay });

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const at = (s) => toMin(s[2] ?? s[1]);
/** 把新的停站併進去、照時刻排 */
function merge(train, add) {
  train.stops.push(...add);
  train.stops.sort((a, b) => toMin(a[1] ?? a[2]) - toMin(b[1] ?? b[2]));
  // 起點沒有到站、終點沒有發車
  const first = train.stops[0];
  const last = train.stops.at(-1);
  for (const s of train.stops) {
    if (s !== first && s[1] == null) s[1] = s[2];
    if (s !== last && s[2] == null) s[2] = s[1];
  }
  first[1] = null;
  last[2] = null;
}
const pick = (stops) => stops.filter((s) => idByJa.has(s.name)).map((s) => [idByJa.get(s.name), s.arr, s.dep]);

// ---------- 主流程 ----------
const tt = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const problems = [];
const count = {};
const bump = (k) => (count[k] = (count[k] ?? 0) + 1);

// 先拿掉上次加的：京都側停站、京都 ↔ 八木 的班次
for (const day of Object.values(tt.trains)) {
  for (const [no, t] of Object.entries(day)) {
    if (t.note === KASHIHARA_NOTE || t.note?.startsWith(KASHIHARA_NOTE)) {
      delete day[no];
      continue;
    }
    // 拿掉後新的頭尾會留著到發時刻（上次 merge 補的），下面 merge 時再整理
    t.stops = t.stops.filter(([id]) => !KYOTO_IDS.includes(id));
  }
}

const validFroms = new Set();
for (const [day, dw] of DAYS) {
  const trains = tt.trains[day];

  // 1. 南下：近鉄京都發的特急
  const kyotoT5 = parseT5(await get(t5url(PAGES.kyotoSouth, dw)));
  if (kyotoT5.validFrom) validFroms.add(kyotoT5.validFrom);
  for (const d of kyotoT5.deps) {
    if (!EXPRESS.has(d.type)) continue;
    const stops = parseT7(await get(d.t7));
    const add = pick(stops);
    if (add[0]?.[0] !== 'kyoto' || add[0][2] !== d.dep) {
      problems.push(`${day} ${d.trainNo}：近鉄京都的發車時刻對不上（T5 ${d.dep}，T7 ${JSON.stringify(add[0])}）`);
      continue;
    }
    const t = trains[d.trainNo];
    if (t) {
      // 直達伊勢志摩：伊勢市的時刻要對得上
      const ise = stops.find((s) => s.name === '伊勢市');
      const mine = t.stops.find(([id]) => id === 'iseshi');
      if (!ise || !mine || ise.dep !== mine[2]) {
        problems.push(`${day} ${d.trainNo}：伊勢市的發車時刻對不上（T7 ${ise?.dep}，_travel-times ${mine?.[2]}）`);
        continue;
      }
      merge(t, add);
      mine[1] = ise.arr; // 伊勢市原本是區間內的第一站，到站時刻是 null
      bump(`${day} 南下直達`);
    } else if (add.some(([id]) => id === 'yamato-yagi')) {
      trains[d.trainNo] = {
        type: d.type,
        to: DEST[d.toJa] ?? DEST[stops.at(-1)?.name] ?? 'kashiharajingu-mae',
        dir: 'for-kashikojima',
        note: KASHIHARA_NOTE,
        stops: add.map((s, i) => [s[0], i === 0 ? null : s[1], i === add.length - 1 ? null : s[2]]),
      };
      bump(`${day} 南下 京都→八木`);
    }
  }

  // 2. 南下：大阪線 大和八木 → 伊勢志摩的特急（大阪發），補大和八木的時刻
  const yagiT5 = parseT5(await get(t5url(PAGES.yagiOsakaSouth, dw)));
  for (const d of yagiT5.deps) {
    const t = trains[d.trainNo];
    if (!t || t.dir !== 'for-kashikojima' || !EXPRESS.has(t.type)) continue;
    if (t.stops.some(([id]) => id === 'yamato-yagi')) continue; // 京都發的直達已經補過
    const stops = parseT7(await get(d.t7));
    const yagi = stops.find((s) => s.name === '大和八木');
    const ise = stops.find((s) => s.name === '伊勢市');
    const mine = t.stops.find(([id]) => id === 'iseshi');
    if (!yagi || yagi.dep !== d.dep || !ise || !mine || ise.dep !== mine[2]) {
      problems.push(`${day} ${d.trainNo}：大和八木 ${yagi?.dep}（T5 ${d.dep}）或伊勢市 ${ise?.dep}／${mine?.[2]} 對不上`);
      continue;
    }
    merge(t, [['yamato-yagi', yagi.arr, yagi.dep]]);
    bump(`${day} 南下 大阪發補八木`);
  }

  // 3. 北上：伊勢志摩 → 京都、大阪的特急，從伊勢市的 T7 讀京都側（往京都）或大和八木（往大阪）
  for (const [no, t] of Object.entries(trains)) {
    if (t.dir !== 'for-ise-nakagawa' || !EXPRESS.has(t.type)) continue;
    if (t.to !== 'kyoto' && !OSAKA_IDS.includes(t.to)) continue;
    const mine = t.stops.find(([id]) => id === 'iseshi');
    if (!mine) {
      problems.push(`${day} ${no}（往 ${t.to}）：沒有停伊勢市，讀不到 T7`);
      continue;
    }
    const stops = parseT7(await get(`${EKI}T7?sf=${ISESHI_SF}&tx=${no}&dw=${dw}`));
    const ise = stops.find((s) => s.name === '伊勢市');
    if (!ise || ise.dep !== mine[2]) {
      problems.push(`${day} ${no}：伊勢市的發車時刻對不上（T7 ${ise?.dep}，_travel-times ${mine[2]}）`);
      continue;
    }
    const add = pick(stops);
    if (t.to === 'kyoto' && add.at(-1)?.[0] !== 'kyoto') problems.push(`${day} ${no}：終點不是近鉄京都（${JSON.stringify(add)}）`);
    if (!add.length) {
      problems.push(`${day} ${no}（往 ${t.to}）：沒有停大和八木`);
      continue;
    }
    merge(t, add);
    bump(`${day} 北上${t.to === 'kyoto' ? '直達京都' : '往大阪補八木'}`);
  }

  // 4. 北上：大和八木（橿原線）→ 京都的特急，加成新的班次
  const yagiNorth = parseT5(await get(t5url(PAGES.yagiKashiharaNorth, dw)));
  for (const d of yagiNorth.deps) {
    if (!EXPRESS.has(d.type) || trains[d.trainNo]) continue;
    const stops = parseT7(await get(d.t7));
    const add = pick(stops);
    if (add[0]?.[0] !== 'yamato-yagi' || add[0][2] !== d.dep || add.at(-1)[0] !== 'kyoto') continue; // 往奈良等不到京都的不要
    trains[d.trainNo] = {
      type: d.type,
      to: 'kyoto',
      dir: 'for-ise-nakagawa',
      note: KASHIHARA_NOTE,
      stops: add.map((s, i) => [s[0], i === 0 ? null : s[1], i === add.length - 1 ? null : s[2]]),
    };
    bump(`${day} 北上 八木→京都`);
  }
}

// stationOrder（南下順）：京都側放在大阪側的前後，大和八木接在鶴橋之後、伊勢市之前
{
  const rest = tt.stationOrder.filter((id) => !KYOTO_IDS.includes(id));
  const i = rest.indexOf('iseshi');
  tt.stationOrder = ['kyoto', 'kintetsu-tambabashi', 'yamato-saidaiji', ...rest.slice(0, i), 'yamato-yagi', ...rest.slice(i)];
}
const order = tt.stationOrder;

// segments：照 kintetsu-timetable.mjs 的算法全部重算
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
  '京都側（T87，scripts/kintetsu-kyoto.mjs）：京都 ↔ 伊勢志摩的直達特急、しまかぜ補上近鉄京都、近鉄丹波橋、大和西大寺、大和八木的停站；' +
  '往返大阪的特急補上大和八木；京都 ↔ 大和八木（橿原線）的特急另外加成班次（note 寫「京都線・橿原線…」），在大和八木換車。平日、土休日、兩個方向都有。' +
  '大和八木的大阪線、橿原線月台不同（換車要上下樓，見 urban/_transfers.json）。執行順序：kintetsu-timetable.mjs → kintetsu-osaka.mjs → kintetsu-kyoto.mjs。';
const notes = (Array.isArray(tt.notes) ? tt.notes.join('') : tt.notes ?? '').replace(/京都側（T87[\s\S]*?kintetsu-kyoto\.mjs。/, '');
tt.notes = notes + NOTE;
tt.sources = tt.sources.filter((s) => !/^T87/.test(s.note ?? ''));
tt.sources.push(
  ...DAYS.map(([day, dw]) => ({ type: 'official', url: t5url(PAGES.kyotoSouth, dw), retrieved: opts.retrieved, note: `T87：${PAGES.kyotoSouth.label}（${day}），各班再讀 T7` })),
  ...DAYS.map(([day, dw]) => ({ type: 'official', url: t5url(PAGES.yagiOsakaSouth, dw), retrieved: opts.retrieved, note: `T87：${PAGES.yagiOsakaSouth.label}（${day}），各班再讀 T7` })),
  ...DAYS.map(([day, dw]) => ({ type: 'official', url: t5url(PAGES.yagiKashiharaNorth, dw), retrieved: opts.retrieved, note: `T87：${PAGES.yagiKashiharaNorth.label}（${day}），各班再讀 T7` })),
  { type: 'official', url: `${EKI}T7?sf=${ISESHI_SF}&tx=1-4268&dw=0`, retrieved: opts.retrieved, note: 'T87：北上往京都、大阪的特急，從伊勢市的列車停站頁（T7，tx 換成各班的列車編號）讀京都側、大和八木的停站' },
);

console.log(Object.entries(count).map(([k, v]) => `${k} ${v}`).join('\n'));
console.log(`近鉄京都時刻表 validFrom ${[...validFroms].join('、') || '不明'}（_travel-times 是 ${tt.validFrom}）`);
if (problems.length) {
  console.log(`⚠️ 問題 ${problems.length} 筆：`);
  for (const p of problems) console.log('  ' + p);
}
if (!opts.dryRun) {
  fs.writeFileSync(FILE, JSON.stringify(tt, null, 1) + '\n');
  console.log(`寫入 ${path.relative(ROOT, FILE)}`);
}
