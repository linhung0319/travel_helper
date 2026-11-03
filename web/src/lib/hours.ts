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

const WEEK = DAY_ROWS.filter((r) => r.key !== 'holiday');

/** 「一～五」「六、日」：連續三天以上用「～」 */
function daysLabel(idx: number[]): string {
  const spans: number[][] = [];
  for (const i of idx) {
    const last = spans[spans.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else spans.push([i]);
  }
  return spans
    .map((s) => (s.length >= 3 ? `${WEEK[s[0]].label}～${WEEK[s[s.length - 1]].label}` : s.map((i) => WEEK[i].label).join('、')))
    .join('、');
}

/**
 * 詳情的一行時間（T44b）：七天一樣寫「每天 09:30–17:00」，有公休寫「週三休，其他 …」，
 * 不一樣的分組寫「週一～五 …；週六、日 …」；最後入場接在後面（餐廳是最後點餐：lastLabel）。假日那列、說明（黃金週這些）收進「更多」的整週表。
 */
export function hoursLine(hours: Hours | null, lastLabel = '最後入場'): string | null {
  if (!hours) return null;
  const last = Array.isArray(hours.lastEntry) ? hours.lastEntry.filter(Boolean).join('、') : hours.lastEntry;
  const tail = last ? `（${lastLabel} ${last}）` : '';
  if (hours.always) return `全天開放${tail}`;
  const vals = WEEK.map((r) => {
    const v = hours[r.key];
    if (v === undefined || v === null) return null;
    return v.length === 0 ? '休' : v.map(([a, b]) => `${a}–${b}`).join('、');
  });
  if (vals.every((v) => v === null)) return null;
  const groups = new Map<string, number[]>();
  vals.forEach((v, i) => {
    const k = v ?? '不明';
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const closed = groups.get('休');
  const open = [...groups].filter(([k]) => k !== '休' && k !== '不明');
  const unknown = groups.get('不明');
  if (!open.length) return '公休';
  if (open.length === 1 && !unknown) {
    const [ranges] = open[0];
    return closed ? `週${daysLabel(closed)}休，其他 ${ranges}${tail}` : `每天 ${ranges}${tail}`;
  }
  const parts = open.map(([ranges, idx]) => `週${daysLabel(idx)} ${ranges}`);
  if (closed) parts.push(`週${daysLabel(closed)}休`);
  if (unknown) parts.push(`週${daysLabel(unknown)}不明`);
  return parts.join('；') + tail;
}
