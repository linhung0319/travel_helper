// 旅程的日期。時間一律是日本時間的字串，不轉成當地時間（architecture §3.8）：
// 這裡只用 Date.UTC 算星期幾，不碰瀏覽器的時區。

import type { DayKey } from '../data/types.ts';

/** 旅程的第一天、最後一天（CLAUDE.md）。T14 的確定的行程定好後，改從行程讀 */
export const TRIP_START = '2027-02-02';
export const TRIP_END = '2027-02-13';

/** 旅程期間的日本國定假日（建国記念の日） */
export const JP_HOLIDAYS = new Set(['2027-02-11']);

const WEEKDAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function parse(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`日期格式要是 YYYY-MM-DD：${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function weekdayIndex(date: string): number {
  const [y, mo, d] = parse(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function addDays(date: string, n: number): string {
  const [y, mo, d] = parse(date);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

export function tripDates(start = TRIP_START, end = TRIP_END): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** hours 的鍵：國定假日回傳 `holiday` 和當天星期（hours 沒有 holiday 時用星期） */
export function hoursKeys(date: string): DayKey[] {
  const wd = WEEKDAY_KEYS[weekdayIndex(date)];
  return JP_HOLIDAYS.has(date) ? ['holiday', wd] : [wd];
}

/** 近鐵、JR 時刻表的日別：週六、週日、國定假日是 holiday（土休日ダイヤ） */
export function timetableDayType(date: string): 'weekday' | 'holiday' {
  const wd = weekdayIndex(date);
  return wd === 0 || wd === 6 || JP_HOLIDAYS.has(date) ? 'holiday' : 'weekday';
}

/** 分頁上的標籤，例如「2/5（五）」 */
export function dayLabel(date: string): string {
  const [, mo, d] = parse(date);
  const holiday = JP_HOLIDAYS.has(date) ? '・假日' : '';
  return `${mo}/${d}（${WEEKDAY_ZH[weekdayIndex(date)]}${holiday}）`;
}

export function shortDayLabel(date: string): string {
  const [, mo, d] = parse(date);
  return `${mo}/${d}`;
}

export function weekdayZh(date: string): string {
  return WEEKDAY_ZH[weekdayIndex(date)];
}
