// 清單列、照片牆的「重點膠囊」（第七輪 §5.1、T44b §18.1）：最多兩個。
// 順序：已排 N/N（good）→ 候選 N/N（indigo）→ 這團在乎的標章（長輩、小孩、室內、二月休，lib/placeSummary 的 fitBadges：最好的 good、最差的 warn）。
// 15 人、預約、週休這些移到詳情的四格和一行時間。

import type { Place } from '../data/types.ts';
import { fitBadges } from '../lib/placeSummary.ts';
import { shortDayLabel } from '../lib/trip.ts';

export interface RowHighlight {
  label: string;
  tone: 'good' | 'indigo' | 'warn';
}

/** 已排、候選（日期 YYYY-MM-DD，由早到晚） */
export function statusHighlights(status: { candidate: string[]; scheduled: string[] }): RowHighlight[] {
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  const out: RowHighlight[] = [];
  if (status.scheduled.length) out.push({ label: `已排 ${days(status.scheduled)}`, tone: 'good' });
  if (status.candidate.length) out.push({ label: `候選 ${days(status.candidate)}`, tone: 'indigo' });
  return out;
}

/** status 是 placeDayStatus 的結果 */
export function rowHighlights(p: Place, status: { candidate: string[]; scheduled: string[] }, max = 2): RowHighlight[] {
  const out = statusHighlights(status).slice(0, max);
  for (const b of fitBadges(p, max - out.length)) out.push({ label: b.label, tone: b.tone });
  return out;
}
