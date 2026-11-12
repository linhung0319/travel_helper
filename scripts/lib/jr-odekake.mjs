// JR おでかけネット（timetable.jr-odekake.net，robots.txt 全部允許）的抓取和解析（T87）。
//   駅時刻表：station-timetable/<站碼 4 位><線碼 3 位><方向 3 位>?date=YYYYMMDD（只查得到約 6 週內）
//   列車時刻表：train-timetable/<id>?date=YYYYMMDD（每班車在各站的到發時刻；直通時列車番號會換，同一頁兩欄）
// 站碼、線碼查法見 data/raw/access/kyoto.md §2。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dayType } from './gtfs.mjs';
import { tripDays } from './trip-hours.mjs';

export const BASE = 'https://timetable.jr-odekake.net/';
export const DEFAULT_CACHE = path.join(os.tmpdir(), 'travel_helper-jr-cache');
export const TRIP = { from: '2027-02-02', to: '2027-02-13', holidays: ['2027-02-11'] };
// 推算用的日子要避開的國定假日、年末年始
const AVOID = new Set(['2026-11-23', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-11']);

export function makeGet({ cache = DEFAULT_CACHE, delay = 1500 } = {}) {
  let last = 0;
  return async function get(rel) {
    const file = path.join(cache, rel.replace(/[^a-z0-9]+/gi, '_') + '.html');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    const wait = last + delay - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(BASE + rel, { headers: { 'User-Agent': 'travel_helper (personal trip planning)' } });
    if (!res.ok) throw new Error(`${rel}：HTTP ${res.status}`);
    const html = await res.text();
    if (!/表示条件の連携に失敗/.test(html)) {
      fs.mkdirSync(cache, { recursive: true });
      fs.writeFileSync(file, html);
    }
    return html;
  };
}

const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export const ymd = (iso) => iso.replaceAll('-', '');
export const stationRel = (code, date) => `station-timetable/${code}?date=${ymd(date)}`;

/** 駅時刻表：顯示的日期對不上（查不到的日期網站會改顯示別天）回傳 null；否則回傳每班 { trainId, dep, type, dest }（type 是凡例的簡稱，普通是 ''） */
export function parseStationPage(html, date) {
  const shown = html.match(/(\d{4})年(\d{2})月(\d{2})日\([^)]*\)(?:<\/span>)? の時刻を表示/);
  if (!shown || `${shown[1]}-${shown[2]}-${shown[3]}` !== date) return null;
  const deps = [];
  for (const row of html.matchAll(/<td class="hour">(\d+)<\/td>([\s\S]*?)<\/tr>/g)) {
    const hour = Number(row[1]) < 4 ? Number(row[1]) + 24 : Number(row[1]);
    for (const a of row[2].matchAll(/<a href="\/train-timetable\/(\d+)\?date=\d+">([\s\S]*?)<\/a>/g)) {
      const type = text(a[2].match(/<span class="train-type">([\s\S]*?)<\/span><\/div>/)?.[1] ?? '');
      const min = a[2].match(/minute[^"]*">(\d+)</)?.[1];
      const dest = text(a[2].match(/<span class="destination">([\s\S]*?)<\/span>/)?.[1] ?? '');
      if (min == null) continue;
      deps.push({ trainId: a[1], dep: `${String(hour).padStart(2, '0')}:${min.padStart(2, '0')}`, type, dest });
    }
  }
  return deps;
}

/** 駅時刻表的凡例：簡稱 → 全名（「新＝新快速」「今＝近江今津」…） */
export function parseLegend(html) {
  const out = {};
  for (const m of text(html).matchAll(/(\S{1,3})[＝=](\S+)/g)) out[m[1]] ??= m[2];
  return out;
}

/** 列車時刻表：車種、終點、列車番號、各站到發（通過的站不列） */
export function parseTrainPage(html) {
  const title = text(html.match(/<div class="route-name"><p>([\s\S]*?)<\/p>/)?.[1] ?? '');
  const [type, endRaw] = title.split(/[\s　]+/);
  const numbers = text(html.match(/列車番号<\/t[hd]>([\s\S]*?)<\/tr>/)?.[1] ?? '').split(' ').filter(Boolean);
  const stops = [];
  for (const row of html.matchAll(/<tr><td class="cell-fixed">([^<]+)<\/td>([\s\S]*?)<\/tr>/g)) {
    const arr = row[2].match(/(\d{1,2}:\d{2})<span class="destination">着/)?.[1] ?? null;
    const deps = [...row[2].matchAll(/(\d{1,2}:\d{2})<span class="destination">発/g)];
    const dep = deps.at(-1)?.[1] ?? null;
    if (!arr && !dep) continue; // 通過（レ）
    stops.push({ name: row[1].trim(), arr: arr?.padStart(5, '0') ?? null, dep: dep?.padStart(5, '0') ?? null });
  }
  // 過了午夜寫 24:xx：同一班車的時刻比前面小就加 24 小時（00:07 → 24:07），引擎才不會把隔天當成更早
  let prev = -1;
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const fix = (t) => {
    if (!t) return t;
    let m = mins(t);
    while (m < prev) m += 24 * 60;
    prev = m;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  for (const s of stops) {
    s.arr = fix(s.arr);
    s.dep = fix(s.dep);
  }
  return { type: type || null, end: endRaw?.replace(/行$/, '') ?? stops.at(-1)?.name ?? null, numbers, stops };
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * 旅程每天 → 網站查得到、同星期幾、不是國定假日或年末年始的日子（國定假日用星期日）。
 * probeCode 是用來試日期的駅時刻表（站碼＋線碼＋方向）。回傳 { basis: [[iso, dayType, ref]], refs: Map(dayType → ref) }
 */
export async function referenceDays(get, probeCode) {
  const holidays = new Set(TRIP.holidays);
  const basis = [];
  const refs = new Map();
  for (const { iso } of tripDays(TRIP.from, TRIP.to, TRIP.holidays)) {
    let d = iso;
    if (holidays.has(iso)) while (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) d = addDays(d, 1);
    let ref = null;
    for (let n = 0; n < 20 && !ref; n++, d = addDays(d, -7)) {
      if (AVOID.has(d)) continue;
      if (parseStationPage(await get(stationRel(probeCode, d)), d)) ref = d;
    }
    const type = dayType(iso, holidays);
    basis.push([iso, type, ref]);
    if (!refs.has(type) && ref) refs.set(type, ref);
  }
  return { basis, refs };
}
