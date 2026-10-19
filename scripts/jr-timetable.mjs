#!/usr/bin/env node
// JR 參宮線（伊勢市～五十鈴ケ丘～二見浦～松下～鳥羽）的時刻表（T10）。
// 來源：JR おでかけネット「区間時刻表」紀勢本線・参宮線(亀山～多気～鳥羽)（timetable.jr-odekake.net/line-timetable/2321 下り、2322 上り；
// robots.txt 全部允許）。每班車在各站的到發時刻都有，用 ?date=YYYYMMDD 指定日期。
//
// 產出：
//   data/timetables/jr/jr-sangu.json        路線格式（和 bus、ferry 相同，scripts/next-bus.mjs 用）
//   data/timetables/jr/<station-id>.json    各站發車時刻表（沿用近鐵時刻表的格式，方向是 for-toba、for-taki）
//
// 網站只能查到約 2 個月內的日期：旅程日期查不到時，往前每次退 7 天找同星期幾、不是國定假日或年末年始的日子（國定假日用星期日）。
// 檔案的 dayTypeBasis 寫明每一天是用哪一天推算的；2027 年 1 月要重跑。
//
// 用法：node scripts/jr-timetable.mjs [--cache <dir>] [--retrieved YYYY-MM-DD]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayType } from './lib/gtfs.mjs';
import { tripDays } from './lib/trip-hours.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/timetables/jr');
const BASE = 'https://timetable.jr-odekake.net/line-timetable/';
const PAGES = { down: '2321', up: '2322' }; // 下り：往鳥羽；上り：往多気、亀山
const TRIP = { from: '2027-02-02', to: '2027-02-13', holidays: ['2027-02-11'] };
// 推算用的日子要避開的國定假日、年末年始（next-train.mjs 的清單＋年末年始）
const AVOID = new Set(['2026-11-03', '2026-11-23', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-11']);
const STATIONS = [
  ['伊勢市', 'jr-iseshi'],
  ['五十鈴ケ丘', 'jr-isuzugaoka'],
  ['二見浦', 'jr-futaminoura'],
  ['松下', 'jr-matsushita'],
  ['鳥羽', 'jr-toba'],
];
const ID = Object.fromEntries(STATIONS);
// 終點站名 → 車站 ID（近鐵格式的 to 要 ID；區間外的站用 jr-<羅馬字>）
const END_ID = { ...ID, 多気: 'jr-taki', 亀山: 'jr-kameyama', 名古屋: 'jr-nagoya', 松阪: 'jr-matsusaka', 津: 'jr-tsu', 新宮: 'jr-shingu', 紀伊勝浦: 'jr-kii-katsuura' };

const opts = { cache: path.join(os.tmpdir(), 'travel_helper-jr-cache'), retrieved: new Date().toISOString().slice(0, 10) };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--cache') opts.cache = path.resolve(process.argv[++i]);
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}
fs.mkdirSync(opts.cache, { recursive: true });

// ---------- 抓網頁（快取、間隔 1.5 秒） ----------
let last = 0;
async function page(dir, date) {
  const file = path.join(opts.cache, `${PAGES[dir]}-${date.replaceAll('-', '')}.html`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const wait = last + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(`${BASE}${PAGES[dir]}?date=${date.replaceAll('-', '')}`, { headers: { 'User-Agent': 'travel_helper (personal trip planning)' } });
  if (!res.ok) throw new Error(`${dir} ${date}：HTTP ${res.status}`);
  const html = await res.text();
  if (html.includes('select-day')) fs.writeFileSync(file, html); // 查不到的日期不快取
  return html;
}

// ---------- 解析區間時刻表 ----------
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export function parseLineTimetable(html) {
  const day = html.match(/class="select-day">(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!day) return null;
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => [...m[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => text(c[1])));
  const head = (label) => rows.find((r) => r[0] === label)?.slice(2) ?? [];
  const numbers = head('列車番号');
  const types = head('列車種別');
  const nameRow = rows.findIndex((r) => r[0] === '列車名');
  const names = nameRow >= 0 ? rows[nameRow].slice(2) : [];
  const nameNos = nameRow >= 0 ? rows[nameRow + 1].slice(2) : [];
  const flags = head('運転日注意');
  const ends = head('終着');
  const trains = numbers.map((no, i) => ({
    no,
    type: types[i] || null,
    name: names[i] ? `${names[i]}${nameNos[i] ? ' ' + nameNos[i] + '号' : ''}` : null,
    flag: flags[i] || null,
    end: ends[i] ? ends[i].replace(/\s*\d{1,2}:\d{2}$/, '') : null,
    times: {},
  }));
  let station = null;
  for (const r of rows) {
    if (r[1] !== '着' && r[1] !== '発') continue;
    if (r[0]) station = r[0];
    r.slice(2).forEach((v, i) => {
      if (!/^\d{1,2}:\d{2}$/.test(v) || !trains[i]) return;
      (trains[i].times[station] ??= {})[r[1] === '着' ? 'arr' : 'dep'] = v.padStart(5, '0');
    });
  }
  // 「終着」列只寫表外的終點（新宮、名古屋…），在表內結束的車（鳥羽、伊勢市、多気…）用最後一站
  for (const t of trains) t.end ??= Object.keys(t.times).at(-1) ?? null;
  return { date: `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`, trains };
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// 旅程某天 → 網站查得到、同星期幾的日子（國定假日用星期日）
async function reference(iso) {
  const holidays = new Set(TRIP.holidays);
  let d = iso;
  if (holidays.has(iso)) while (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) d = addDays(d, 1);
  for (let n = 0; n < 20; n++, d = addDays(d, -7)) {
    if (AVOID.has(d)) continue;
    const html = await page('down', d);
    if (parseLineTimetable(html)) return d;
  }
  return null;
}

// ---------- 主程式 ----------
const holidays = new Set(TRIP.holidays);
const days = tripDays(TRIP.from, TRIP.to, TRIP.holidays).map((d) => d.iso);
const basis = [];
const refs = new Map(); // 日別 → 推算用的日子（同一日別取第一個）
for (const iso of days) {
  const type = dayType(iso, holidays);
  const ref = await reference(iso);
  basis.push([iso, type, ref]);
  if (!refs.has(type) && ref) refs.set(type, ref);
}

const stopOrder = { down: STATIONS.map(([n]) => n), up: STATIONS.map(([n]) => n).reverse() };
// allBy：區間內停 1 站以上的車（各站時刻表用，例如伊勢市始發往多気的車）；tripsBy：停 2 站以上的（路線格式、next-bus 用）。
// 到發時刻照網站：區間外還有停站的車，伊勢市的到站、發車都保留
const allBy = { weekday: [], saturday: [], holiday: [] };
const first = (t) => t.stops[0][2] ?? t.stops[0][1];
for (const [type, ref] of refs) {
  for (const dir of ['down', 'up']) {
    const parsed = parseLineTimetable(await page(dir, ref));
    for (const t of parsed.trains) {
      const stops = stopOrder[dir].filter((s) => t.times[s]).map((s) => [ID[s], t.times[s].arr ?? null, t.times[s].dep ?? null]);
      if (!stops.length) continue;
      allBy[type].push({
        id: t.no,
        headsign: t.end,
        dir: dir === 'down' ? 0 : 1,
        type: [t.type, t.name].filter(Boolean).join(' '),
        stops,
      });
    }
  }
  allBy[type].sort((a, b) => first(a).localeCompare(first(b)));
}
const tripsBy = Object.fromEntries(Object.entries(allBy).map(([k, v]) => [k, v.filter((t) => t.stops.length >= 2)]));

const stationsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'));
const coordsOf = (id) => stationsJson.find((s) => s.id === id)?.coords ?? null;
const sources = (extra = []) => [
  { type: 'official', url: `${BASE}${PAGES.down}`, retrieved: opts.retrieved, note: `JR おでかけネット 区間時刻表 紀勢本線・参宮線(亀山～多気～鳥羽) 下り；推算用的日子：${[...refs].map(([k, v]) => `${k} ${v}`).join('、')}` },
  { type: 'official', url: `${BASE}${PAGES.up}`, retrieved: opts.retrieved, note: '同上 上り' },
  ...extra,
];
const fileFor = (name) => path.join(OUT, name);
const keep = (name) => (fs.existsSync(fileFor(name)) ? JSON.parse(fs.readFileSync(fileFor(name), 'utf8')) : {});

// 票價、注意事項（2026-10-19 查；ekitan 是第三方網站，JR 東海官方的票價沒查到。伊勢市～鳥羽的 JR 票價 ekitan 只顯示近鐵的，不明）
const FARE_SRC = [
  { type: 'other', url: 'https://ekitan.com/transit/fare/sf-3853/st-4604', retrieved: '2026-10-19', note: 'JR 伊勢市～二見浦 大人 210、小孩 100 円（非官方）' },
  { type: 'other', url: 'https://ekitan.com/transit/fare/sf-4404/st-4604', retrieved: '2026-10-19', note: 'JR 二見浦～鳥羽 大人 210、小孩 100 円（非官方）' },
];
const FARES = {
  currency: 'JPY',
  adult: {
    'jr-iseshi': { 'jr-futaminoura': 210 },
    'jr-futaminoura': { 'jr-iseshi': 210, 'jr-toba': 210 },
    'jr-toba': { 'jr-futaminoura': 210 },
  },
  child: '伊勢市～二見浦、二見浦～鳥羽 100 円（ekitan，非官方）；其他區間不明',
  note: '只有 ekitan 查得到的區間；伊勢市～鳥羽的 JR 票價不明',
};
const NOTES =
  'JR 不能用 KINTETSU RAIL PASS（近鐵券只含近鐵、伊賀鐵道；5day plus 另含巴士），車資另付。二見浦站是無人站，快速みえ全部停靠。' +
  '鳥羽站的近鐵、JR 轉乘通道 2020-03-17 起關閉，轉乘要出站再進站（見 stations.json）。單線，五十鈴ケ丘等站會等交會，同一區間車程可能差幾分鐘。';

// 路線格式
const route = {
  id: 'jr-sangu',
  mode: 'jr',
  operator: 'JR 東海',
  name: { ja: 'JR参宮線（伊勢市～鳥羽）', zh: 'JR 參宮線（伊勢市～鳥羽）' },
  validFrom: null,
  validTo: null,
  retrieved: opts.retrieved,
  dayTypeBasis: basis,
  stops: STATIONS.map(([name, id]) => ({ id, name, coords: coordsOf(id), near: [{ id, meters: 0 }] })),
  trips: tripsBy,
  fares: FARES,
  notes: NOTES,
  passes: { 'kintetsu-rail-pass-5day': false, 'kintetsu-rail-pass-5day-plus': false },
  sources: sources(FARE_SRC),
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
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(fileFor('jr-sangu.json'), format(route));

// 各站發車時刻表（近鐵格式只有 weekday、holiday 兩種：土曜和日祝相同時合併成 holiday，不同時土曜放在 extra.saturday）
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lines = [];
for (const [name, id] of STATIONS) {
  const deps = (type, dir) =>
    allBy[type]
      .filter((t) => t.dir === dir)
      .map((t) => ({ t, s: t.stops.find((s) => s[0] === id) }))
      .filter(({ s }) => s && s[2])
      .map(({ t, s }) => ({ dep: s[2], type: t.type || '普通', to: END_ID[t.headsign] ?? t.headsign ?? '', trainNo: t.id }))
      .sort((a, b) => a.dep.localeCompare(b.dep));
  const dirs = { 'for-toba': 0, 'for-taki': 1 };
  const directions = {};
  const satDiff = {};
  for (const [key, dir] of Object.entries(dirs)) {
    const w = deps('weekday', dir);
    const s = deps('saturday', dir);
    const h = deps('holiday', dir);
    if (!w.length && !h.length) continue;
    directions[key] = { weekday: w, holiday: h };
    if (!same(s, h)) satDiff[key] = s;
  }
  const o = keep(`${id}.json`);
  const doc = {
    station: id,
    validFrom: null,
    validTo: null,
    retrieved: opts.retrieved,
    source: `${BASE}${PAGES.down}`,
    sources: sources(),
    directions,
    notes:
      o.notes ??
      `JR 參宮線${name}站。to 是終點站 ID（區間外的站用 jr-<羅馬字>，例如 jr-taki 多気、jr-nagoya 名古屋），trainNo 是 JR 的列車番號；各站之間的到發時刻見 jr-sangu.json。` +
        (Object.keys(satDiff).length ? '土曜和日祝的班次不同，土曜放在 extra.saturday。' : '土曜和日祝的班次相同，holiday 是土休日。'),
  };
  if (Object.keys(satDiff).length) doc.extra = { saturday: satDiff };
  fs.writeFileSync(fileFor(`${id}.json`), format(doc));
  lines.push(`${id}：${Object.entries(directions).map(([k, v]) => `${k} 平日 ${v.weekday.length}／日祝 ${v.holiday.length}`).join('、')}`);
}
console.log(`推算用的日子：${[...refs].map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`jr-sangu：平日 ${tripsBy.weekday.length}／土曜 ${tripsBy.saturday.length}／日祝 ${tripsBy.holiday.length} 班`);
console.log(lines.join('\n'));
