// 列的「重點膠囊」（第七輪 §5.1、T44b §18.1）：最多兩個。
// 順序：已排 N/N（good）→ 主辦考慮放 N/N（indigo）→ 這團在乎的標章（長輩、小孩、室內、二月休，lib/placeSummary 的 fitBadges：最好的 good、最差的 warn）。
// T76（interaction-design §35.7、35.9）：候選寫成「主辦考慮放 2/4」，長輩、小孩的記號後面加字（「長輩 ◎ 很適合」「小孩 ✕ 不適合」），不用看圖例也懂。
// 15 人、預約、週休這些移到詳情的四格和一行時間。

import type { Place } from '../data/types.ts';
import { fitBadges } from '../lib/placeSummary.ts';
import { shortDayLabel } from '../lib/trip.ts';

export interface RowHighlight {
  label: string;
  tone: 'good' | 'indigo' | 'warn';
}

/** 四格、膠囊的記號 → 字（§35.9 的圖例） */
export const MARK_WORDS: Record<string, string> = { '◎': '很適合', '○': '可以', '△': '要注意', '✕': '不適合', '—': '沒資料' };

/** 詳情四格下面那行圖例 */
export const MARK_LEGEND = Object.entries(MARK_WORDS).map(([m, w]) => `${m} ${w}`).join('　');

/** 已排、候選（日期 YYYY-MM-DD，由早到晚） */
export function statusHighlights(status: { candidate: string[]; scheduled: string[] }): RowHighlight[] {
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  const out: RowHighlight[] = [];
  if (status.scheduled.length) out.push({ label: `已排 ${days(status.scheduled)}`, tone: 'good' });
  if (status.candidate.length) out.push({ label: `主辦考慮放 ${days(status.candidate)}`, tone: 'indigo' });
  return out;
}

/** 「長輩 ◎」→「長輩 ◎ 很適合」（記號在最後才加字） */
const withWord = (label: string) => {
  const mark = label.at(-1) ?? '';
  return MARK_WORDS[mark] ? `${label} ${MARK_WORDS[mark]}` : label;
};

/** status 是 placeDayStatus 的結果 */
export function rowHighlights(p: Place, status: { candidate: string[]; scheduled: string[] }, max = 2): RowHighlight[] {
  const out = statusHighlights(status).slice(0, max);
  for (const b of fitBadges(p, max - out.length)) out.push({ label: withWord(b.label), tone: b.tone });
  return out;
}
