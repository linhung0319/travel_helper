// 清單列、照片牆的「重點膠囊」（第七輪 §5.1）：最多兩個。
// 順序：已排 N/N（good）→ 候選 N/N（indigo）→ 和 15 人、預約有關的（plain：可坐 15 人、15 人要分桌、要預約、可預約、不能預約、週 X 休）。

import type { Place } from '../data/types.ts';
import { closedDaysLabel } from '../lib/hours.ts';
import { shortDayLabel } from '../lib/trip.ts';

export interface RowHighlight {
  label: string;
  tone: 'good' | 'indigo' | 'plain';
}

function get(obj: unknown, ...path: string[]): unknown {
  let v: unknown = obj;
  for (const k of path) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

/** status 是 placeDayStatus 的結果（日期 YYYY-MM-DD，由早到晚） */
export function rowHighlights(p: Place, status: { candidate: string[]; scheduled: string[] }, max = 2): RowHighlight[] {
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  const out: RowHighlight[] = [];
  if (status.scheduled.length) out.push({ label: `已排 ${days(status.scheduled)}`, tone: 'good' });
  if (status.candidate.length) out.push({ label: `候選 ${days(status.candidate)}`, tone: 'indigo' });
  const fit15 = get(p.raw, 'group', 'fit15');
  if (fit15 === 'yes') out.push({ label: '可坐 15 人', tone: 'plain' });
  else if (fit15 === 'split') out.push({ label: '15 人要分桌', tone: 'plain' });
  const accepted = get(p.raw, 'reservation', 'accepted');
  if (get(p.raw, 'reservation', 'required') === true) out.push({ label: '要預約', tone: 'plain' });
  else if (accepted === 'no') out.push({ label: '不能預約', tone: 'plain' });
  else if (accepted === 'yes' || accepted === 'groups-only') out.push({ label: '可預約', tone: 'plain' });
  const closed = closedDaysLabel(p.hours);
  if (closed) out.push({ label: closed, tone: 'plain' });
  return out.slice(0, max);
}
