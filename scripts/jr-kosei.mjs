#!/usr/bin/env node
// JR 湖西線（大阪・京都 ～ 山科 ～ 大津京 ～ おごと温泉 ～ 堅田 ～ 志賀 ～ 近江高島）的時刻表（T87）。
// 湖西線往近江高島的車一小時 1～2 班、新快速不停おごと温泉，錯過差很多，所以用時刻表、不用班距。
//
// 來源：JR おでかけネット（timetable.jr-odekake.net，robots.txt 全部允許）。
//   1. 站別時刻表（station-timetable/<站碼><線碼 014><方向 001|002>?date=YYYYMMDD）：おごと温泉、堅田、近江高島的兩個方向，
//      收集經過這三站的所有列車（各站停的車不同：新快速不停おごと温泉，往堅田、近江舞子為止的車不到近江高島）。
//   2. 列車時刻表（train-timetable/<id>?date=…）：每班車在各站的到發時刻。從大阪直通湖西線的班次，停站從大阪列起
//      （同一班車穿過京都站，不要在京都拆開：拆開引擎會在京都多算一次換車）。
//
// 產出（格式同 scripts/jr-timetable.mjs 的參宮線）：
//   data/timetables/jr/jr-kosei.json        路線格式（和 bus、ferry 相同）
//   data/timetables/jr/<station-id>.json    湖西線各站的發車時刻表（近鐵時刻表的格式，方向 for-omi-imazu 北上、for-kyoto 南下）
//
// 網站只查得到約 6 週內的日期：旅程日期查不到時，往前每次退 7 天找同星期幾、不是國定假日或年末年始的日子（國定假日用星期日）。
// 檔案的 dayTypeBasis 寫明每一天是用哪一天推算的；2027 年 1 月要重跑。
//
// 用法：node scripts/jr-kosei.mjs [--cache <dir>] [--retrieved YYYY-MM-DD] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, DEFAULT_CACHE, makeGet, parseStationPage, parseTrainPage, referenceDays, stationRel, ymd } from './lib/jr-odekake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/timetables/jr');
// 收集班次用的站別時刻表：站碼（JR おでかけネット）、方向碼 → 方向
const COLLECT = [
  { name: 'おごと温泉', code: '2920', dirs: { '001': 'up', '002': 'down' } },
  { name: '堅田', code: '2921', dirs: { '001': 'up', '002': 'down' } },
  { name: '近江高島', code: '2928', dirs: { '001': 'down', '002': 'up' } },
];
const LINE = '014'; // 湖西線
// 列出的站（下り順，大阪 → 近江高島）。山科是琵琶湖線和湖西線分岔的站
export const STATIONS = [
  ['大阪', 'jr-osaka'],
  ['京都', 'jr-kyoto'],
  ['山科', 'jr-yamashina'],
  ['大津京', 'jr-otsukyo'],
  ['比叡山坂本', 'jr-hieizan-sakamoto'],
  ['おごと温泉', 'jr-ogotoonsen'],
  ['堅田', 'jr-katata'],
  ['志賀', 'jr-shiga'],
  ['近江高島', 'jr-omi-takashima'],
];
const ID = Object.fromEntries(STATIONS);
// 湖西線上的站（各站時刻表只做這些；大阪、京都、山科是別的線的大站，不做站別時刻表）
const KOSEI = ['jr-otsukyo', 'jr-hieizan-sakamoto', 'jr-ogotoonsen', 'jr-katata', 'jr-shiga', 'jr-omi-takashima'];
// 票價（大人，円）。查證後填；來源寫在 data/raw/access/kyoto.md §3，路線檔的 sources 也列
const FARES_ADULT = {
  'jr-kyoto': { 'jr-otsukyo': 240, 'jr-hieizan-sakamoto': 320, 'jr-ogotoonsen': 320, 'jr-katata': 410, 'jr-shiga': 590, 'jr-omi-takashima': 860 },
  'jr-osaka': { 'jr-kyoto': 580, 'jr-ogotoonsen': 1120, 'jr-katata': 1120, 'jr-shiga': 1340, 'jr-omi-takashima': 1520 },
  'jr-yamashina': { 'jr-otsukyo': 180, 'jr-ogotoonsen': 240, 'jr-katata': 320 },
};
const FARES_NOTE = '駅探（非官方；JR 西日本官方的運賃檢索是動態網頁，讀不到逐段的官方票價）。IC 卡同價';
const EK = (sf, st, note) => ({ type: 'other', url: `https://ekitan.com/transit/fare/sf-${sf}/st-${st}`, retrieved: '2026-11-12', note: `駅探（非官方）：${note}` });
const FARE_SOURCES = [
  EK(5198, 5740, '京都 ↔ 大津京 240'), EK(5198, 5846, '京都 ↔ 比叡山坂本 320'), EK(5198, 5036, '京都 ↔ おごと温泉 320'), EK(5198, 5073, '京都 ↔ 堅田 410'),
  EK(5198, 5368, '京都 ↔ 志賀 590'), EK(5198, 4988, '京都 ↔ 近江高島 860'), EK(5006, 5036, '大阪 ↔ おごと温泉 1,120'), EK(5006, 5073, '大阪 ↔ 堅田 1,120'),
  EK(5006, 5368, '大阪 ↔ 志賀 1,340'), EK(5006, 4988, '大阪 ↔ 近江高島 1,520'), EK(6112, 5740, '山科 ↔ 大津京 180'), EK(6112, 5036, '山科 ↔ おごと温泉 240'), EK(6112, 5073, '山科 ↔ 堅田 320'),
  { type: 'official', url: 'https://www.jr-odekake.net/ticket/guide/assets/pdf/stipulation/2026/covenant2-03.pdf', retrieved: '2026-11-12', note: 'JR 西日本 旅客営業規則第 74 條：兒童半價、10 円未滿捨去' },
];
const END_ID = { ...ID, 近江今津: 'jr-omi-imazu', 敦賀: 'jr-tsuruga', 近江舞子: 'jr-omi-maiko', 近江塩津: 'jr-omi-shiozu', 永原: 'jr-nagahara', 姫路: 'jr-himeji', 網干: 'jr-aboshi', 播州赤穂: 'jr-banshu-ako', 上郡: 'jr-kamigori', 西明石: 'jr-nishi-akashi', 加古川: 'jr-kakogawa', 野洲: 'jr-yasu', 米原: 'jr-maibara', 長浜: 'jr-nagahama', 高槻: 'jr-takatsuki', 新大阪: 'jr-shin-osaka', 尼崎: 'jr-amagasaki', 宝塚: 'jr-takarazuka', 草津: 'jr-kusatsu' };

const opts = { cache: DEFAULT_CACHE, retrieved: new Date().toISOString().slice(0, 10), dryRun: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--cache') opts.cache = path.resolve(process.argv[++i]);
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else if (a === '--dry-run') opts.dryRun = true;
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}

const get = makeGet({ cache: opts.cache });
const code = (c, dir) => `${c.code}${LINE}${dir}`;

// ---------- 主程式 ----------
{
  const { basis, refs } = await referenceDays(get, code(COLLECT[0], Object.keys(COLLECT[0].dirs)[0]));

  const order = STATIONS.map(([n]) => n);
  const allBy = { weekday: [], saturday: [], holiday: [] };
  const problems = [];
  for (const [type, ref] of refs) {
    const seen = new Map(); // train-timetable id → 方向
    for (const c of COLLECT) {
      for (const [dirCode, dir] of Object.entries(c.dirs)) {
        const ids = parseStationPage(await get(stationRel(code(c, dirCode), ref)), ref)?.map((x) => x.trainId);
        if (!ids) {
          problems.push(`${c.name} ${dirCode} ${ref}：站別時刻表讀不到`);
          continue;
        }
        for (const id of ids) seen.set(id, dir);
      }
    }
    for (const [tid, dir] of seen) {
      const t = parseTrainPage(await get(`train-timetable/${tid}?date=${ymd(ref)}`));
      const stops = t.stops
        .filter((s) => ID[s.name])
        .map((s) => [ID[s.name], s.arr, s.dep]);
      // 下り：照 order；上り：反過來。網站的停站本來就是行駛順序，這裡只檢查
      const idx = stops.map(([id]) => STATIONS.findIndex(([, x]) => x === id));
      const sorted = idx.every((v, i) => i === 0 || (dir === 'down' ? v > idx[i - 1] : v < idx[i - 1]));
      if (!sorted) problems.push(`${type} ${tid}（${t.type} 往${t.end}）：停站順序和方向 ${dir} 不合 ${JSON.stringify(stops.map((s) => s[0]))}`);
      if (stops.length < 1) continue;
      // 列出的站之內：第一站沒有到站、最後一站沒有發車（照網站；區間外還有停站的保留）
      allBy[type].push({
        id: t.numbers.join('/') || tid,
        headsign: t.end,
        dir: dir === 'down' ? 0 : 1,
        type: t.type ?? '普通',
        stops,
      });
    }
    const first = (x) => x.stops[0][2] ?? x.stops[0][1];
    allBy[type].sort((a, b) => a.dir - b.dir || first(a).localeCompare(first(b)));
  }
  const tripsBy = Object.fromEntries(Object.entries(allBy).map(([k, v]) => [k, v.filter((t) => t.stops.length >= 2)]));

  const stationsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'));
  const coordsOf = (id) => stationsJson.find((s) => s.id === id)?.coords ?? null;
  const refNote = [...refs].map(([k, v]) => `${k} ${v}`).join('、');
  const sources = (extra = []) => [
    ...COLLECT.map((c) => ({
      type: 'official',
      url: `${BASE}station-timetable/${c.code}${LINE}${Object.keys(c.dirs)[0]}`,
      retrieved: opts.retrieved,
      note: `JR おでかけネット 駅時刻表 ${c.name}（湖西線，兩個方向 001／002）；各班再讀 train-timetable 的停站。推算用的日子：${refNote}`,
    })),
    ...extra,
  ];

  // 票價：查到的寫在 FARES_ADULT（見 data/raw/access/kyoto.md §3 的來源）；沒查到的區間不寫
  const FARES = {
    currency: 'JPY',
    adult: FARES_ADULT,
    child: '兒童半價，10 円未滿捨去（JR 西日本 旅客営業規則第 74 條）',
    note: FARES_NOTE,
  };
  const NOTES =
    '新快速不停おごと温泉（停堅田、比叡山坂本、大津京、山科）。往近江高島（近江今津、敦賀）的車白天一小時約 1～2 班；往堅田、近江舞子為止的車到不了志賀以北。' +
    '從大阪直通湖西線的新快速，停站從大阪列起（同一班車穿過京都站）。湖西線高架、靠湖，強風時常常停駛或改走琵琶湖線（米原經由），2 月也會因為下雪誤點。' +
    'JR 不能用 KINTETSU RAIL PASS，車資另付；ICOCA 可用。';

  const route = {
    id: 'jr-kosei',
    mode: 'jr',
    operator: 'JR 西日本',
    name: { ja: 'JR湖西線（大阪・京都～近江高島）', zh: 'JR 湖西線（大阪・京都～近江高島）' },
    validFrom: null,
    validTo: null,
    retrieved: opts.retrieved,
    dayTypeBasis: basis,
    stops: STATIONS.map(([name, id]) => ({ id, name, coords: coordsOf(id), near: [{ id, meters: 0 }] })),
    trips: tripsBy,
    fares: FARES,
    notes: NOTES,
    passes: { 'kintetsu-rail-pass-5day': false, 'kintetsu-rail-pass-5day-plus': false },
    sources: sources([
      ...FARE_SOURCES,
    ]),
  };

  function format(doc) {
    const kept = [];
    const mark = (v) => {
      kept.push(JSON.stringify(v));
      return `@@${kept.length - 1}@@`;
    };
    const d = structuredClone(doc);
    if (d.dayTypeBasis) d.dayTypeBasis = d.dayTypeBasis.map(mark);
    if (d.stops) d.stops = d.stops.map(mark);
    if (d.trips) for (const k of Object.keys(d.trips)) d.trips[k] = d.trips[k].map(mark);
    if (d.directions) for (const dir of Object.values(d.directions)) for (const k of Object.keys(dir)) dir[k] = dir[k].map(mark);
    return JSON.stringify(d, null, 2).replace(/"@@(\d+)@@"/g, (_, i) => kept[i]) + '\n';
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const files = [['jr-kosei.json', format(route)]];
  const lines = [];
  for (const id of KOSEI) {
    const name = STATIONS.find(([, x]) => x === id)[0];
    const deps = (type, dir) =>
      allBy[type]
        .filter((t) => t.dir === dir)
        .map((t) => ({ t, s: t.stops.find((s) => s[0] === id) }))
        .filter(({ s }) => s && s[2])
        .map(({ t, s }) => ({ dep: s[2], type: t.type, to: END_ID[t.headsign] ?? t.headsign ?? '', trainNo: t.id }))
        .sort((a, b) => a.dep.localeCompare(b.dep));
    const directions = {};
    const satDiff = {};
    for (const [key, dir] of Object.entries({ 'for-omi-imazu': 0, 'for-kyoto': 1 })) {
      const w = deps('weekday', dir);
      const s = deps('saturday', dir);
      const h = deps('holiday', dir);
      if (!w.length && !h.length) continue;
      directions[key] = { weekday: w, holiday: h };
      if (!same(s, h)) satDiff[key] = s;
    }
    const doc = {
      station: id,
      validFrom: null,
      validTo: null,
      retrieved: opts.retrieved,
      source: `${BASE}station-timetable/${COLLECT[0].code}${LINE}001`,
      sources: sources(),
      directions,
      notes:
        `JR 湖西線${name}站。方向 for-omi-imazu 是往近江今津・敦賀（北上），for-kyoto 是往京都・大阪（南下）；to 是終點站 ID（區間外的站用 jr-<羅馬字>），trainNo 是 JR 的列車番號（直通時兩個番號用 / 連起來）；各站之間的到發時刻見 jr-kosei.json。` +
        (Object.keys(satDiff).length ? '土曜和日祝的班次不同，土曜放在 extra.saturday。' : '土曜和日祝的班次相同，holiday 是土休日。'),
    };
    if (Object.keys(satDiff).length) doc.extra = { saturday: satDiff };
    files.push([`${id}.json`, format(doc)]);
    lines.push(`${id}：${Object.entries(directions).map(([k, v]) => `${k} 平日 ${v.weekday.length}／日祝 ${v.holiday.length}`).join('、')}`);
  }
  console.log(`推算用的日子：${[...refs].map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`jr-kosei：平日 ${tripsBy.weekday.length}／土曜 ${tripsBy.saturday.length}／日祝 ${tripsBy.holiday.length} 班`);
  console.log(lines.join('\n'));
  if (problems.length) {
    console.log(`⚠️ 問題 ${problems.length} 筆：`);
    for (const p of problems) console.log('  ' + p);
  }
  if (!opts.dryRun) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [f, body] of files) fs.writeFileSync(path.join(OUT, f), body);
    console.log(`寫入 ${files.length} 個檔案到 data/timetables/jr/`);
  }
}
