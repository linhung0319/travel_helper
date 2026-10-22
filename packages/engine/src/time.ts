// 日期、時間的字串運算。一律是日本時間的 "YYYY-MM-DD"、"HH:MM"，不用 Date（architecture §3.8）。

import type { DateString, TimeString } from './types.ts';

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isTime(v: unknown): v is TimeString {
  const m = typeof v === 'string' ? TIME_RE.exec(v) : null;
  return !!m && Number(m[2]) < 60;
}

export function isDate(v: unknown): v is DateString {
  const m = typeof v === 'string' ? DATE_RE.exec(v) : null;
  if (!m) return false;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(Number(m[1]), mo);
}

/** "HH:MM" → 從 00:00 起的分鐘（25:00 → 1500） */
export function toMinutes(t: TimeString): number {
  const m = TIME_RE.exec(t);
  if (!m) throw new RangeError(`不是 HH:MM：${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 分鐘 → "HH:MM"（過了午夜寫 24:30、25:00） */
export function fromMinutes(min: number): TimeString {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** 星期幾：0＝日、6＝六（Sakamoto 的算法，不經過 Date） */
export function dayOfWeek(date: DateString): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`不是 YYYY-MM-DD：${date}`);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (mo < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[mo - 1] + d) % 7;
}

export function addDays(date: DateString, n: number): DateString {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`不是 YYYY-MM-DD：${date}`);
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]) + n;
  while (d > daysInMonth(y, mo)) {
    d -= daysInMonth(y, mo);
    if (++mo > 12) [mo, y] = [1, y + 1];
  }
  while (d < 1) {
    if (--mo < 1) [mo, y] = [12, y - 1];
    d += daysInMonth(y, mo);
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** from～to（含兩端）的每一天 */
export function dateRange(from: DateString, to: DateString): DateString[] {
  const out: DateString[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** 近鐵的ダイヤ：週六日、國定假日是土休日（next-train.mjs） */
export function kintetsuDayType(date: DateString, holidays: readonly DateString[]): 'weekday' | 'holiday' {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6 || holidays.includes(date) ? 'holiday' : 'weekday';
}

/** 巴士、定期船的ダイヤ：國定假日、週日是日祝，週六是土曜（scripts/lib/gtfs.mjs 的 dayType） */
export function busDayType(date: DateString, holidays: readonly DateString[]): 'weekday' | 'saturday' | 'holiday' {
  if (holidays.includes(date)) return 'holiday';
  const dow = dayOfWeek(date);
  return dow === 0 ? 'holiday' : dow === 6 ? 'saturday' : 'weekday';
}
