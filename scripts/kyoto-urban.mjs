#!/usr/bin/env node
// 京都、琵琶湖的 JR、近鐵班距型路線（data/timetables/urban/<route-id>.json，T87）。格式見 CONVENTIONS §3「班距型路線」。
//
// 每條路線從官網時刻表算出：
//   - 班距：在「計數站」的發車時刻表數每小時的班數（只數 types 的車種），兩個方向各一張，取較少的一方，60／班數（取到 0.5 分），
//     相鄰同值的小時併成一段。
//   - 首末班：計數站兩個方向的首班取較晚的、末班取較早的（兩個方向的計數站不一定是路線的端點，notes 寫明是哪一站）。
//   - 站間分鐘：白天（12 時左右）一班車的停站時刻，從第一站起算。
//   - 平日、土休日各一天（JR 用 JR おでかけネット 查得到的日子推算，見 dayTypeBasis 的做法；近鐵 dw=0／1）。saturday 一律 null（和 holiday 相同）。
// 票價、5 日券、notes 寫在下面的 ROUTES；改了要重跑，不要手改 JSON。
//
// 來源：JR おでかけネット（timetable.jr-odekake.net，robots.txt 全部允許）、近鐵（eki.kintetsu.co.jp，T5／T7 允許）。
// 用法：node scripts/kyoto-urban.mjs [--only <route-id>] [--retrieved YYYY-MM-DD] [--dry-run]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as jr from './lib/jr-odekake.mjs';
import * as kin from './lib/kintetsu-eki.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/timetables/urban');

const opts = { only: null, retrieved: new Date().toISOString().slice(0, 10), dryRun: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--only') opts.only = process.argv[++i];
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else if (a === '--dry-run') opts.dryRun = true;
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}

// ---------- 路線設定 ----------
// count：兩個方向的計數用時刻表。JR 是駅時刻表的碼（站碼＋線碼＋方向），近鐵是 [slCode, d]。
// types：要數的車種（JR 是駅時刻表凡例的簡稱，普通是 ''；近鐵是 T5 凡例的車種名）。dest：只數這些終點（簡稱或日文站名），null 不限。
// sample：讀站間分鐘用的那一班，從 count.out 的時刻表挑 sampleHour 時之後第一班符合 types（有 sampleTypes 時用它）的車。
import { ROUTES } from './kyoto-urban.config.mjs';

const jrGet = jr.makeGet();
const kinGet = kin.makeGet();

// 京都市營地下鐵：交通局官網「ハイパー地下鉄ダイヤ」讀的全列車 CSV（www2.city.kyoto.lg.jp，robots.txt 無限制）
export const SUBWAY_CSV = 'https://www2.city.kyoto.lg.jp/kotsu/tikadia/diadata/';
const csvCache = path.join(os.tmpdir(), 'travel_helper-kyoto-subway-cache');
let csvLast = 0;
async function csvRows(name) {
  const file = path.join(csvCache, name);
  let text;
  if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8');
  else {
    const wait = csvLast + 1500 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    csvLast = Date.now();
    const res = await fetch(SUBWAY_CSV + name, { headers: { 'User-Agent': 'Mozilla/5.0 (travel_helper personal trip planning)' } });
    if (!res.ok) throw new Error(`${res.status} ${name}`);
    text = await res.text();
    fs.mkdirSync(csvCache, { recursive: true });
    fs.writeFileSync(file, text);
  }
  const lines = text.trim().split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '')));
  const head = lines.findIndex((l) => l[0] === '行先（終着）');
  const cols = lines[head];
  const pad = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return `${String(h < 3 ? h + 24 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  return lines.slice(head + 1).map((l) => Object.fromEntries(cols.map((c, i) => [c, i < 2 ? l[i] : pad(l[i])])));
}

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 一個方向一天的發車：[{ dep, type, dest, ref(列車頁) }] */
async function departures(route, side, day) {
  const c = route.count[side];
  if (route.kind === 'subway') {
    // c = { file: 'tn010101_dia_utf8.csv' 的 {day} 換成 01 平日／02 土休日, station: 計數站 }
    const rows = await csvRows(c.file.replace('{day}', day.csvDay));
    const names = route.stops.map(([n]) => n);
    return rows
      .filter((r) => names.every((n) => r[n]) && r[c.station])
      .map((r) => ({ dep: r[c.station], type: null, dest: r['行先（終着）'], row: r, page: SUBWAY_CSV + c.file.replace('{day}', day.csvDay) }))
      .sort((a, b) => toMin(a.dep) - toMin(b.dep));
  }
  if (route.kind === 'jr') {
    const html = await jrGet(jr.stationRel(c, day.ref));
    const deps = jr.parseStationPage(html, day.ref);
    if (!deps) throw new Error(`${route.id} ${side} ${day.ref}：JR 駅時刻表讀不到`);
    return deps.map((d) => ({ dep: d.dep, type: d.type, dest: d.dest, page: `train-timetable/${d.trainId}?date=${jr.ymd(day.ref)}` }));
  }
  const p = kin.parseT5(await kinGet(kin.t5url(c[0], c[1], day.dw)));
  return p.deps.map((d) => ({ dep: d.dep, type: d.type, dest: d.toJa, page: d.t7, validFrom: p.validFrom }));
}

const typeOk = (route, type) => {
  if (!route.types) return true;
  const t = (type ?? '').replace(/[●■\s]/g, '');
  return route.types instanceof RegExp ? route.types.test(t) : route.types.includes(t);
};
const want = (route, side) => (d) => typeOk(route, d.type) && (!route.dest?.[side] || route.dest[side].includes(d.dest));

function bands(outDeps, inDeps) {
  const perHour = (deps) => {
    const m = new Map();
    for (const d of deps) m.set(Math.floor(toMin(d.dep) / 60), (m.get(Math.floor(toMin(d.dep) / 60)) ?? 0) + 1);
    return m;
  };
  const a = perHour(outDeps);
  const b = perHour(inDeps);
  const hours = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  const out = [];
  for (const h of hours) {
    const n = Math.min(a.get(h) ?? 0, b.get(h) ?? 0);
    if (!n) continue;
    const min = Math.round((60 / n) * 2) / 2;
    const last = out.at(-1);
    if (last && last.min === min && last.toH === h) last.toH = h + 1;
    else out.push({ fromH: h, toH: h + 1, min });
  }
  return out.map((x) => ({ from: hhmm(x.fromH * 60), to: hhmm(x.toH * 60), min: x.min }));
}

async function sampleMinutes(route, outDeps) {
  const ok = (d) => !route.sampleTypes || route.sampleTypes.test((d.type ?? '').replace(/[●■s]/g, ''));
  const pick = outDeps.find((d) => ok(d) && toMin(d.dep) >= route.sampleHour * 60) ?? outDeps[0];
  const stops =
    route.kind === 'subway'
      ? route.stops.map(([n]) => ({ name: n, arr: null, dep: pick.row[n] }))
      : route.kind === 'jr'
        ? jr.parseTrainPage(await jrGet(pick.page)).stops
        : kin.parseT7(await kinGet(pick.page));
  const at = (name) => stops.find((s) => s.name === name);
  const first = at(route.stops[0][0]);
  if (!first) throw new Error(`${route.id}：樣本列車沒有停 ${route.stops[0][0]}`);
  const t0 = toMin(first.dep);
  return {
    pick,
    stops: route.stops.map(([name, id, note]) => {
      const s = at(name);
      if (!s) throw new Error(`${route.id}：樣本列車（${pick.dep} 發）沒有停 ${name}`);
      return { id, min: s === first ? 0 : toMin(s.arr ?? s.dep) - t0, note: note ?? null };
    }),
  };
}

let jrDays = null;
const report = [];
for (const route of ROUTES) {
  if (opts.only && route.id !== opts.only) continue;
  if (route.kind === 'manual') {
    // 官網時刻表是圖片或 PDF、程式讀不了的線：分鐘、班距、首末班照研究筆記（data/raw/access/kyoto.md）手寫在 config
    const doc = {
      id: route.id, mode: route.mode, operator: route.operator, name: route.name, serviceType: route.serviceType,
      stops: route.manual.stops, loop: false, loopMin: null, service: route.manual.service,
      fares: route.fares, passes: route.passes, notes: route.notes, validFrom: route.validFrom ?? null,
      retrieved: opts.retrieved, sources: [...route.manual.sources, ...route.fareSources],
    };
    report.push(`${route.id}：（手寫）${doc.stops.map((x) => `${x.id} ${x.min}`).join('、')}`);
    if (!opts.dryRun) fs.writeFileSync(path.join(OUT, `${route.id}.json`), JSON.stringify(doc, null, 2) + '\n');
    continue;
  }
  let days;
  if (route.kind === 'jr') {
    jrDays ??= await jr.referenceDays(jrGet, route.count.out);
    days = { weekday: { ref: jrDays.refs.get('weekday') }, holiday: { ref: jrDays.refs.get('holiday') } };
  } else if (route.kind === 'subway') days = { weekday: { csvDay: '01' }, holiday: { csvDay: '02' } };
  else days = { weekday: { dw: 0 }, holiday: { dw: 1 } };

  const service = { weekday: null, saturday: null, holiday: null };
  let sample = null;
  const validFroms = new Set();
  for (const [key, day] of Object.entries(days)) {
    const out = (await departures(route, 'out', day)).filter(want(route, 'out'));
    const inn = (await departures(route, 'in', day)).filter(want(route, 'in'));
    for (const d of [...out, ...inn]) if (d.validFrom) validFroms.add(d.validFrom);
    if (!out.length || !inn.length) throw new Error(`${route.id} ${key}：計數站沒有符合的車（out ${out.length}、in ${inn.length}）`);
    const first = [out[0].dep, inn[0].dep].sort().at(-1);
    const last = [out.at(-1).dep, inn.at(-1).dep].sort()[0];
    service[key] = {
      first,
      last,
      headway: bands(out, inn),
      note:
        `${route.countNote}；${key === 'weekday' ? '平日' : '土休日'}：往外 ${out.length} 班（首 ${out[0].dep}、末 ${out.at(-1).dep}）、往回 ${inn.length} 班（首 ${inn[0].dep}、末 ${inn.at(-1).dep}）` +
        (day.ref ? `；用 ${day.ref} 的時刻表推算` : ''),
    };
    if (key === 'weekday') sample = await sampleMinutes(route, out);
  }

  const sources = [
    ...route.count.sourceUrls(days).map((u) => ({ type: 'official', url: u.url, retrieved: opts.retrieved, note: u.note })),
    {
      type: 'official',
      url: route.kind === 'jr' ? jr.BASE + sample.pick.page : sample.pick.page,
      retrieved: opts.retrieved,
      note: `站間分鐘：平日 ${sample.pick.dep} 發的那一班的停站時刻`,
    },
    ...route.fareSources,
  ];
  const doc = {
    id: route.id,
    mode: route.mode,
    operator: route.operator,
    name: route.name,
    serviceType: route.serviceType,
    stops: sample.stops,
    loop: false,
    loopMin: null,
    service,
    fares: route.fares,
    passes: route.passes,
    notes: route.notes,
    validFrom: route.validFrom ?? (route.kind === 'jr' ? '2026-03-14' : ([...validFroms][0] ?? null)),
    retrieved: opts.retrieved,
    sources,
  };
  if (route.kind === 'jr') doc.extra = { dayTypeBasis: jrDays.basis };
  report.push(
    `${route.id}：${sample.stops.map((s) => `${s.id} ${s.min}`).join('、')}；平日 ${service.weekday.first}～${service.weekday.last} ` +
      service.weekday.headway.map((h) => `${h.from}-${h.to}/${h.min}`).join(' ') +
      `；土休日 ${service.holiday.first}～${service.holiday.last} ` +
      service.holiday.headway.map((h) => `${h.from}-${h.to}/${h.min}`).join(' '),
  );
  if (!opts.dryRun) fs.writeFileSync(path.join(OUT, `${route.id}.json`), JSON.stringify(doc, null, 2) + '\n');
}
console.log(report.join('\n'));
if (!opts.dryRun) console.log('寫入 data/timetables/urban/');
