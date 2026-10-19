#!/usr/bin/env node
// 查巴士、定期船、JR「某天某時從 A 到 B 的下一班」（T10）。
// 資料：data/timetables/bus|ferry|jr/*.json 的 stops（附近的資料點 near）和 trips。
//
// 用法：node scripts/next-bus.mjs <A> <B> <YYYY-MM-DD> <HH:MM> [--count N]
//   <A>、<B> 可以是資料點 ID（車站、景點：用停留所的 near 找，500 m 內）或停留所名稱（例如「内宮前」）
// 例如：node scripts/next-bus.mjs isuzugawa ise-naiku 2027-02-11 09:00
//       node scripts/next-bus.mjs toba-sadahama-marine-terminal toba-port-kamishima 2027-02-06 08:00
//
// 只找直達（同一班車先經過 A 再經過 B）；轉乘請分兩段查。步行到停留所的時間沒有算進去（near 有直線距離）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayType } from './lib/gtfs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 和 next-train.mjs 相同的國定假日
const HOLIDAYS = new Set(['2026-11-03', '2026-11-23', '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22']);

const args = process.argv.slice(2);
const ci = args.indexOf('--count');
const count = ci >= 0 ? Number(args.splice(ci, 2)[1]) : 5;
const [from, to, date, time] = args;
if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{1,2}:\d{2}$/.test(time ?? '')) {
  console.error('用法：node scripts/next-bus.mjs <A> <B> <YYYY-MM-DD> <HH:MM> [--count N]');
  process.exit(2);
}

const docs = [];
for (const mode of ['bus', 'ferry', 'jr']) {
  const dir = path.join(ROOT, 'data/timetables', mode);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (doc.stops && doc.trips) docs.push(doc); // jr/ 的各站時刻表（近鐵格式）不用
  }
}

// 某個路線檔裡，符合 <A> 的停留所：ID → 直線距離（停留所名稱完全相同算 0）
const matchStops = (doc, q) => {
  const m = new Map();
  for (const s of doc.stops) {
    if (s.name === q || s.id === q) m.set(s.id, 0);
    const n = s.near?.find((x) => x.id === q);
    if (n) m.set(s.id, n.meters);
  }
  return m;
};
const pad = (t) => t.padStart(5, '0');
const type = dayType(date, HOLIDAYS);
const results = [];
for (const doc of docs) {
  const A = matchStops(doc, from);
  const B = matchStops(doc, to);
  if (!A.size || !B.size) continue;
  if (date < doc.validFrom) continue;
  const name = (id) => doc.stops.find((s) => s.id === id)?.name ?? id;
  for (const trip of doc.trips[type] ?? []) {
    if (trip.dates && !trip.dates.includes(date)) continue;
    // A：時刻之後離 A 最近的停留所；B：A 之後離 B 最近的停留所（同距離取先到的）
    const best = (cands, dist) => cands.reduce((m, i) => (m < 0 || dist(i) < dist(m) ? i : m), -1);
    const idx = trip.stops.map((_, i) => i);
    const ia = best(idx.filter((i) => A.has(trip.stops[i][0]) && trip.stops[i][2] && pad(trip.stops[i][2]) >= pad(time)), (i) => A.get(trip.stops[i][0]));
    if (ia < 0) continue;
    const ib = best(idx.filter((i) => i > ia && B.has(trip.stops[i][0]) && (trip.stops[i][1] ?? trip.stops[i][2])), (i) => B.get(trip.stops[i][0]));
    if (ib < 0) continue;
    const [aId, , dep] = trip.stops[ia];
    // 中間站只有發車時刻時（JR 的時刻表只寫発）用發車時刻當到站
    const [bId, bArr, bDep] = trip.stops[ib];
    const arr = bArr ?? bDep;
    results.push({
      route: `${doc.name.ja}（${doc.operator}）`,
      headsign: trip.headsign,
      dep,
      arr,
      from: `${name(aId)}${A.get(aId) ? `（距 ${from} ${A.get(aId)} m）` : ''}`,
      to: `${name(bId)}${B.get(bId) ? `（距 ${to} ${B.get(bId)} m）` : ''}`,
      fare: doc.fares?.adult?.[aId]?.[bId] ?? null,
      estimated: (() => { const b = doc.dayTypeBasis?.find((x) => x[0] === date); return b ? b[2] !== date : date > doc.validTo; })(),
    });
  }
}
results.sort((a, b) => pad(a.dep).localeCompare(pad(b.dep)) || pad(a.arr).localeCompare(pad(b.arr)));
// 繞遠路的班次（有別班比它晚出發、早到）不列：例如外宮內宮線從五十鈴川先繞到伊勢市站再回內宮
const shown = results.filter((r) => !results.some((o) => o !== r && pad(o.dep) >= pad(r.dep) && pad(o.arr) < pad(r.arr)));
const label = { weekday: '平日', saturday: '土曜', holiday: '日祝' }[type];
console.log(`${date}（${label}ダイヤ）${time} 以後 ${from} → ${to}`);
if (!shown.length) {
  console.log('沒有直達班次（或沒有路線同時經過兩地）。');
  process.exit(0);
}
for (const r of shown.slice(0, count)) {
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  console.log(
    `  ${r.dep} → ${r.arr}（${min(r.arr) - min(r.dep)} 分）${r.route} 往 ${r.headsign}：${r.from} → ${r.to}` +
      (r.fare != null ? `，大人 ${r.fare} 円` : '') +
      (r.estimated ? ' ※依同星期幾的其他日子推算（資料還沒涵蓋這天）' : ''),
  );
}
