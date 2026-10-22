// 營業時間的顯示（CONVENTIONS §1.5「營業時間」）：整個 null＝不知道、某天 null＝那天不知道、[]＝公休。

import { hoursKeys } from './trip.ts';
import type { Closure, DayKey, Hours } from '../data/types.ts';

export const DAY_ROWS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: '一' },
  { key: 'tue', label: '二' },
  { key: 'wed', label: '三' },
  { key: 'thu', label: '四' },
  { key: 'fri', label: '五' },
  { key: 'sat', label: '六' },
  { key: 'sun', label: '日' },
  { key: 'holiday', label: '假日' },
];

export function formatRanges(v: Hours[DayKey]): string {
  if (v === undefined || v === null) return '不明';
  if (v.length === 0) return '公休';
  return v.map(([a, b]) => `${a}～${b}`).join('、');
}

/** 那一天（YYYY-MM-DD）用的是哪一列：國定假日有 holiday 列就用它，否則用星期 */
export function rowForDate(hours: Hours, date: string): DayKey {
  const keys = hoursKeys(date);
  return keys.find((k) => hours[k] !== undefined) ?? keys[keys.length - 1];
}

/** 那一天碰到的有日期的休業 */
export function closureOn(closures: Closure[], date: string): Closure | null {
  return closures.find((c) => c.from <= date && date <= c.to) ?? null;
}

/** 小卡片用的一個標章：「週二休」這類 */
export function closedDaysLabel(hours: Hours | null): string | null {
  if (!hours) return null;
  const closed = DAY_ROWS.filter((r) => r.key !== 'holiday' && Array.isArray(hours[r.key]) && hours[r.key]!.length === 0);
  if (closed.length === 0 || closed.length === 7) return null;
  return `週${closed.map((r) => r.label).join('、')}休`;
}
