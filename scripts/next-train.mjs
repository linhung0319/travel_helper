#!/usr/bin/env node
// 查近鐵目標區間（伊勢市～賢島）「某天某時從 A 站出發，下一班到 B 站的車」。
// 資料：data/timetables/kintetsu/_travel-times.json 的 trains（每班車的停站時刻）。
//
// 用法：node scripts/next-train.mjs <A 站 ID> <B 站 ID> <YYYY-MM-DD> <HH:MM> [--count N] [--no-express]
// 例如：node scripts/next-train.mjs ugata toba 2027-02-05 09:00
//
// 會列出：
//   - 直達車：A 站發車時刻 ≥ 指定時刻的前 N 班（含特急）
//   - 最早抵達：允許轉乘 1 次（轉乘至少 3 分鐘）時最早到 B 站的走法
// --no-express：只用普通、急行等不需要特急券的列車

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/timetables/kintetsu');
const MIN_TRANSFER = 3;
const EXPRESS = new Set(['特急', 'しまかぜ']);

// 日本的國定假日（近鐵在這些日子跑土休日ダイヤ）。
// 來源：內閣府「国民の祝日について」https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
const HOLIDAYS = new Set([
  '2026-11-03', '2026-11-23',
  '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22',
]);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const [, v] = args.splice(i, 2);
  return v ?? true;
};
const count = Number(flag('--count') ?? 5);
const noExpress = (() => {
  const i = args.indexOf('--no-express');
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
})();
const [from, to, date, time] = args;
if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{1,2}:\d{2}$/.test(time ?? '')) {
  console.error('用法：node scripts/next-train.mjs <A 站 ID> <B 站 ID> <YYYY-MM-DD> <HH:MM> [--count N] [--no-express]');
  process.exit(2);
}

const tt = JSON.parse(fs.readFileSync(path.join(DIR, '_travel-times.json'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'));
// 目標區間外的終點站
const OUTSIDE = {
  'ise-nakagawa': '伊勢中川', shiratsuka: '白塚', nabari: '名張', myojo: '明星',
  'kintetsu-nagoya': '近鉄名古屋', 'osaka-namba': '大阪難波', 'osaka-uehommachi': '大阪上本町', kyoto: '京都',
};
const nameOf = (id) => stations.find((s) => s.id === id)?.name.ja ?? OUTSIDE[id] ?? id;
for (const id of [from, to]) {
  if (!tt.stationOrder.includes(id)) {
    console.error(`「${id}」不是目標區間的近鐵車站。可以用：${tt.stationOrder.join('、')}`);
    process.exit(2);
  }
}
if (from === to) {
  console.error('出發站和抵達站相同。');
  process.exit(2);
}

const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
const holiday = dow === 0 || dow === 6 || HOLIDAYS.has(date);
const day = holiday ? 'holiday' : 'weekday';
const toMin = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const start = toMin(time);

// しまかぜ固定停駛的星期（另有檢修停駛日，要查官網運行日曆）
// 來源：https://www.kintetsu.co.jp/senden/shimakaze/ 、https://www.kintetsu.co.jp/foreign/english/shimakaze/
const SHIMAKAZE_OFF = { 大阪難波発着: 2, 京都発着: 3, 近鉄名古屋発着: 4 };
const shimakazeOff = (t) => t.type === 'しまかぜ' && SHIMAKAZE_OFF[t.note?.split('；')[0]] === dow;

// 每班車轉成 [{ station, arr, dep }]（分鐘）
const trains = Object.entries(tt.trains[day])
  .filter(([, t]) => !(noExpress && EXPRESS.has(t.type)))
  .map(([no, t]) => ({
    no,
    ...t,
    stops: t.stops.map(([s, a, d]) => ({ station: s, arr: a ? toMin(a) : null, dep: d ? toMin(d) : null })),
  }));

// 一班車上 A → B 的乘車段
function ride(t, a, b, after) {
  const i = t.stops.findIndex((s) => s.station === a);
  if (i < 0 || t.stops[i].dep == null || t.stops[i].dep < after) return null;
  const j = t.stops.findIndex((s, k) => k > i && s.station === b);
  if (j < 0) return null;
  const arr = t.stops[j].arr ?? t.stops[j].dep;
  return { train: t, from: a, to: b, dep: t.stops[i].dep, arr };
}

const direct = trains
  .map((t) => ride(t, from, to, start))
  .filter(Boolean)
  .sort((x, y) => x.dep - y.dep);

// 轉乘 1 次：A →（車 1）→ X →（車 2）→ B
const runs = direct.filter((r) => !shimakazeOff(r.train));
let best = runs.length ? [runs.reduce((m, r) => (r.arr < m.arr || (r.arr === m.arr && r.dep > m.dep) ? r : m))] : null;
for (const t1 of trains.filter((t) => !shimakazeOff(t))) {
  const i = t1.stops.findIndex((s) => s.station === from);
  if (i < 0 || t1.stops[i].dep == null || t1.stops[i].dep < start) continue;
  for (const x of t1.stops.slice(i + 1)) {
    const leg1 = ride(t1, from, x.station, start);
    if (!leg1) continue;
    for (const t2 of trains.filter((t) => !shimakazeOff(t))) {
      if (t2 === t1) continue;
      const leg2 = ride(t2, x.station, to, leg1.arr + MIN_TRANSFER);
      if (!leg2) continue;
      const bestArr = best ? best.at(-1).arr : Infinity;
      if (leg2.arr < bestArr || (leg2.arr === bestArr && leg1.dep > best[0].dep)) best = [leg1, leg2];
    }
  }
}

const label = (t) => `${t.type}（往${nameOf(t.to)}）${shimakazeOff(t) ? '　⚠️ 這班しまかぜ週' + '日一二三四五六'[dow] + '固定停駛' : ''}`;
const line = (r) =>
  `${fmt(r.dep)} ${nameOf(r.from)} → ${fmt(r.arr)} ${nameOf(r.to)}　${label(r.train)}　${r.arr - r.dep} 分　#${r.train.no}`;

console.log(`${date}（週${'日一二三四五六'[dow]}，${holiday ? '土休日ダイヤ' : '平日ダイヤ'}）${time} 以後 ${nameOf(from)} → ${nameOf(to)}`);
console.log(`時刻表適用：${tt.validFrom} 起（取得 ${tt.retrieved}）${noExpress ? '；不含特急' : ''}\n`);

if (direct.length) {
  console.log(`直達車（前 ${Math.min(count, direct.length)} 班）：`);
  for (const r of direct.slice(0, count)) console.log('  ' + line(r));
} else {
  console.log('當天這個時間以後沒有直達車。');
}

if (best) {
  const total = best.at(-1).arr - best[0].dep;
  console.log(`\n最早抵達：${fmt(best.at(-1).arr)}（${best.length === 1 ? '直達' : `在${nameOf(best[0].to)}轉乘`}，搭車 ${total} 分）`);
  for (const r of best) console.log('  ' + line(r));
}

if (direct.slice(0, count).some((r) => shimakazeOff(r.train))) {
  console.log('\n※ 標 ⚠️ 的しまかぜ這天固定停駛（國定假日是否照常停駛，請查官網運行日曆），「最早抵達」已經排除。');
}
const used = new Set([...direct.slice(0, count), ...(best ?? [])].map((r) => r.train.type));
if (used.has('特急') || used.has('しまかぜ')) {
  console.log('\n※ 特急要另外買特急券（5 日券不含）；しまかぜ還要加特別車廂費，而且不是每天行駛。詳見 data/passes.json。');
}
