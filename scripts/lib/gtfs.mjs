// 讀 GTFS(-JP) feed：CSV 解析、依日期判斷哪些 service 有行駛。
// T10 用來把三重交通、かもめバス、市営定期船等 feed 轉成 data/timetables/bus|ferry/<route-id>.json。

import fs from 'node:fs';
import { readZip } from './unzip.mjs';

// RFC 4180 的 CSV：雙引號包住的欄位可以有逗號、換行，"" 是一個引號。開頭的 BOM 去掉。
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

export function loadFeed(zipPath) {
  const files = readZip(fs.readFileSync(zipPath));
  const table = (name) => {
    const buf = files.get(name) ?? [...files].find(([k]) => k.endsWith('/' + name))?.[1];
    return buf ? parseCsv(buf.toString('utf8')) : [];
  };
  return {
    agency: table('agency.txt'),
    feedInfo: table('feed_info.txt'),
    stops: table('stops.txt'),
    routes: table('routes.txt'),
    trips: table('trips.txt'),
    stopTimes: table('stop_times.txt'),
    calendar: table('calendar.txt'),
    calendarDates: table('calendar_dates.txt'),
    fareAttributes: table('fare_attributes.txt'),
    fareRules: table('fare_rules.txt'),
  };
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// 某個 service 在某天（YYYY-MM-DD）有沒有行駛：calendar.txt 的星期與期間，再套 calendar_dates.txt 的例外。
export function serviceRunsOn(feed, serviceId, date) {
  const ymd = date.replaceAll('-', '');
  const ex = feed.calendarDates.find((d) => d.service_id === serviceId && d.date === ymd);
  if (ex) return ex.exception_type === '1';
  const cal = feed.calendar.find((c) => c.service_id === serviceId);
  if (!cal || ymd < cal.start_date || ymd > cal.end_date) return false;
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return cal[WEEKDAYS[dow]] === '1';
}

// feed 涵蓋的期間（calendar 的最早開始、最晚結束；只有 calendar_dates 時用它的日期）
export function feedRange(feed) {
  const ds = [
    ...feed.calendar.flatMap((c) => [c.start_date, c.end_date]),
    ...feed.calendarDates.map((d) => d.date),
  ].sort();
  const fmt = (s) => s && `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return { from: fmt(ds[0]), to: fmt(ds.at(-1)) };
}

// "25:10:00" → "25:10"（GTFS 過了午夜寫成 24 以上，和 CONVENTIONS 的 hours 一樣）
export const hhmm = (t) => (t ? t.trim().replace(/^(\d):/, '0$1:').slice(0, 5) : null);

// 日別：weekday（平日）、saturday（土曜）、holiday（日曜・國定假日）
export function dayType(iso, holidays) {
  if (holidays.has(iso)) return 'holiday';
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return dow === 0 ? 'holiday' : dow === 6 ? 'saturday' : 'weekday';
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// 旅程某天要用 feed 的哪一天來算：在 feed 期間內就用當天；
// 不在（例如三重交通的 feed 只到 1 月中，每天自動往後更新）就往回找 feed 期間內「同一種日別、同一個星期幾、沒有特殊行駛日」的最近一天。
// 國定假日用星期日代替（三重交通、かもめバス的國定假日都跑日祝ダイヤ，見 calendar_dates）。
export function referenceDate(feed, iso, holidays) {
  const { from, to } = feedRange(feed);
  if (iso >= from && iso <= to) return iso;
  const type = dayType(iso, holidays);
  const special = new Set(feed.calendarDates.map((d) => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`));
  const wantDow = type === 'holiday' ? 0 : new Date(iso + 'T00:00:00Z').getUTCDay();
  for (let d = to; d >= from; d = addDays(d, -1)) {
    if (new Date(d + 'T00:00:00Z').getUTCDay() !== wantDow) continue;
    if (holidays.has(d) || special.has(d)) continue;
    return d;
  }
  return null;
}

// 旅程各天行駛的 trip，依日別整理。回傳 { weekday: { trips: Map<tripId, 日期[]>, dates: [] }, ... , basis: [{ date, type, ref }] }
export function tripsByDayType(feed, tripIds, dates, holidays) {
  const svcOf = new Map(feed.trips.map((t) => [t.trip_id, t.service_id]));
  const out = { weekday: { trips: new Map(), dates: [] }, saturday: { trips: new Map(), dates: [] }, holiday: { trips: new Map(), dates: [] }, basis: [] };
  const cache = new Map();
  for (const iso of dates) {
    const type = dayType(iso, holidays);
    const ref = referenceDate(feed, iso, holidays);
    out.basis.push({ date: iso, type, ref });
    out[type].dates.push(iso);
    if (!ref) continue;
    for (const id of tripIds) {
      const svc = svcOf.get(id);
      const key = svc + ' ' + ref;
      if (!cache.has(key)) cache.set(key, serviceRunsOn(feed, svc, ref));
      if (!cache.get(key)) continue;
      if (!out[type].trips.has(id)) out[type].trips.set(id, []);
      out[type].trips.get(id).push(iso);
    }
  }
  return out;
}
