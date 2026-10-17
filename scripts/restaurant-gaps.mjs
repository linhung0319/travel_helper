#!/usr/bin/env node
// 餐廳缺漏檢查（T4c）：各地區的午餐、不含晚餐住宿附近的晚餐、各地區能接 15 人的店。輸出 Markdown。
//
// 用法：node scripts/restaurant-gaps.mjs <area> [--from 2027-02-02 --to 2027-02-13] [--holidays 2027-02-11]
//
// 判斷方式：
//   午餐：contexts 有 lunch，而且某天有時段和 11:30～13:30 重疊（hours 為 null 的算「營業時間不明」）。
//   晚餐：contexts 有 dinner，而且某天有時段和 18:00～19:00 重疊。
//   旅程日數：旅程每天對到星期幾（國定假日用 holiday，沒有就用星期幾），算有營業的天數；那天 null 算不明。
//   住宿附近的晚餐：anchors 裡有該住宿的晚餐店（restaurant-anchors.mjs 只在 20 分內才加），
//     加上直線最近的 3 家晚餐店（標成「需搭車」與否看步行時間）。
//   每天中午的家數：旅程每一天中午（11:30～13:30）有營業的店數，1 家以下用粗體標出。
//   地區看 extra.region。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const area = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
if (!area) {
  console.error('用法：node scripts/restaurant-gaps.mjs <area> [--from YYYY-MM-DD --to YYYY-MM-DD] [--holidays d1,d2]');
  process.exit(2);
}
const from = opt('from', '2027-02-02');
const to = opt('to', '2027-02-13');
const holidays = new Set(opt('holidays', '2027-02-11').split(','));

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const restaurants = read(`data/areas/${area}/restaurants.json`);
const lodging = read(`data/areas/${area}/lodging.json`);

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const tripDays = [];
for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10);
  tripDays.push({ iso, dow: DAYS[d.getUTCDay()], holiday: holidays.has(iso) });
}

const mins = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const overlaps = (slots, a, b) => slots.some(([s, e]) => mins(s) < mins(b) && mins(e) > mins(a));

// 回傳 { open, unknown }：旅程中這個時段有營業的天數、不明的天數；hours 為 null 時 null
function tripCount(r, a, b) {
  if (!r.hours) return null;
  let open = 0;
  let unknown = 0;
  for (const d of tripDays) {
    let slots = d.holiday && r.hours.holiday !== undefined && r.hours.holiday !== null ? r.hours.holiday : r.hours[d.dow];
    if (slots == null) unknown++;
    else if (overlaps(slots, a, b)) open++;
  }
  return { open, unknown };
}
const isLunch = (r) => (r.contexts ?? []).includes('lunch') && (r.hours == null || (tripCount(r, '11:30', '13:30')?.open ?? 0) + (tripCount(r, '11:30', '13:30')?.unknown ?? 0) > 0);
const isDinner = (r) => (r.contexts ?? []).includes('dinner') && r.hours != null && (tripCount(r, '18:00', '19:00')?.open ?? 0) > 0;
const fmtCount = (c) => (c == null ? '營業時間不明' : `${c.open}/${tripDays.length} 天${c.unknown ? `（${c.unknown} 天不明）` : ''}`);

const hav = (p, q) => {
  const R = 6371008.8;
  const t = Math.PI / 180;
  const dl = (q[1] - p[1]) * t;
  const dn = (q[0] - p[0]) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(p[1] * t) * Math.cos(q[1] * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const regions = [...new Set(restaurants.map((r) => r.extra?.region ?? '（無）'))];
const out = [];
out.push(`旅程 ${from}～${to}（${tripDays.length} 天；國定假日 ${[...holidays].join('、')}）`);

out.push('', '#### 各地區的午餐', '', '| 地區 | 午餐家數 | 店（旅程中午有營業的天數） |', '|---|---|---|');
for (const reg of regions) {
  const list = restaurants.filter((r) => (r.extra?.region ?? '（無）') === reg && isLunch(r));
  out.push(`| ${reg} | ${list.length} | ${list.map((r) => `${r.name.ja}（${fmtCount(tripCount(r, '11:30', '13:30'))}）`).join('、') || '**無**'} |`);
}

out.push('', '#### 各地區每天中午有營業的家數（hours 為 null 的不算）', '', `| 地區 | ${tripDays.map((d) => `${d.iso.slice(5)} ${d.holiday ? 'hol' : d.dow}`).join(' | ')} |`, `|---|${tripDays.map(() => '---').join('|')}|`);
for (const reg of regions) {
  const list = restaurants.filter((r) => (r.extra?.region ?? '（無）') === reg && (r.contexts ?? []).includes('lunch') && r.hours);
  const cells = tripDays.map((d) => {
    const n = list.filter((r) => {
      const slots = d.holiday && r.hours.holiday != null ? r.hours.holiday : r.hours[d.dow];
      return slots && overlaps(slots, '11:30', '13:30');
    }).length;
    return n <= 1 ? `**${n}**` : String(n);
  });
  out.push(`| ${reg} | ${cells.join(' | ')} |`);
}

out.push('', '#### 不含晚餐的住宿附近的晚餐', '', '| 住宿 | anchors 有這間住宿的晚餐店（步行） | 直線最近的晚餐店 |', '|---|---|---|');
const dinners = restaurants.filter(isDinner);
for (const l of lodging.filter((x) => x.meals === 'none' || x.meals === 'breakfast')) {
  const anchored = dinners
    .map((r) => ({ r, a: (r.anchors ?? []).find((a) => a.id === l.id) }))
    .filter((x) => x.a)
    .sort((x, y) => (x.a.walkMinutes ?? 999) - (y.a.walkMinutes ?? 999));
  const nearest = dinners
    .map((r) => ({ r, d: hav(r.coords, l.coords) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 3);
  out.push(
    `| ${l.name.ja}（\`${l.id}\`） | ${anchored.map((x) => `${x.r.name.ja} ${x.a.walkMinutes} 分（${x.a.walkSource}；晚上 ${fmtCount(tripCount(x.r, '18:00', '19:00'))}）`).join('、') || '**無**'} | ${nearest.map((x) => `${x.r.name.ja} 直線 ${(x.d / 1000).toFixed(1)} km`).join('、')} |`,
  );
}

out.push('', '#### 各地區能接 15 人（fit15: yes）的店', '', '| 地區 | yes | split | 店（yes） |', '|---|---|---|---|');
for (const reg of regions) {
  const list = restaurants.filter((r) => (r.extra?.region ?? '（無）') === reg);
  const yes = list.filter((r) => r.group?.fit15 === 'yes');
  const split = list.filter((r) => r.group?.fit15 === 'split');
  out.push(`| ${reg} | ${yes.length} | ${split.length} | ${yes.map((r) => `${r.name.ja}（${(r.contexts ?? []).join('・')}）`).join('、') || '**無**'} |`);
}

console.log(out.join('\n'));
