// 列的「狀態」（第七輪 §5.1、T44b §18.1）：最多兩項。
// 順序：已排（plan）→ 主辦考慮放（indigo）→ 這團在乎的標章（長輩、小孩、室內、二月休，lib/placeSummary 的 fitBadges：最好的一個、最差的一個）。
// T76（§35.7、35.9）：候選寫成「主辦考慮放 2/4」，長輩、小孩的記號後面加字（「長輩 ◎ 很適合」「小孩 ✕ 不適合」），不用看圖例也懂。
// T82（§36.T82）：不用底色膠囊，改成一行彩色字：已排是日曆圖示＋綠「2/3 已排」、✕ 紅、△ 芥子黃深色、◎ 綠，其他（室內、二月休…）灰。
// 15 人、預約、週休這些移到詳情的「適合我們嗎」和一行時間。

import type { Place } from '../data/types.ts';
import { fitBadges } from '../lib/placeSummary.ts';
import { shortDayLabel } from '../lib/trip.ts';

/** plan：已排（前面畫日曆圖示）；indigo：候選；good ◎、warn △、bad ✕；muted：其他 */
export type HighlightTone = 'plan' | 'indigo' | 'good' | 'warn' | 'bad' | 'muted';

export interface RowHighlight {
  label: string;
  tone: HighlightTone;
}

/** 結論的記號 → 字（§35.9） */
export const MARK_WORDS: Record<string, string> = { '◎': '很適合', '○': '可以', '△': '要注意', '✕': '不適合', '—': '沒資料' };

/** 詳情「適合我們嗎」結論膠囊的顏色（T82）：◎ 綠底、○ 灰底、△ 芥子黃底、✕ 紅底、— 虛線框 */
export const VERDICT_CLASS: Record<string, string> = { '◎': 'good', '○': 'ok', '△': 'warn', '✕': 'bad', '—': 'none' };

/** 已排、候選（日期 YYYY-MM-DD，由早到晚） */
export function statusHighlights(status: { candidate: string[]; scheduled: string[] }): RowHighlight[] {
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  const out: RowHighlight[] = [];
  if (status.scheduled.length) out.push({ label: `${days(status.scheduled)} 已排`, tone: 'plan' });
  if (status.candidate.length) out.push({ label: `主辦考慮放 ${days(status.candidate)}`, tone: 'indigo' });
  return out;
}

const MARK_TONE: Record<string, HighlightTone> = { '◎': 'good', '△': 'warn', '✕': 'bad' };

/** 「長輩 ◎」→「長輩 ◎ 很適合」（記號在最後才加字），顏色照記號；沒有記號的（室內、二月休）是灰 */
const fromBadge = (label: string): RowHighlight => {
  const mark = label.at(-1) ?? '';
  return MARK_WORDS[mark] ? { label: `${label} ${MARK_WORDS[mark]}`, tone: MARK_TONE[mark] ?? 'muted' } : { label, tone: 'muted' };
};

/** status 是 placeDayStatus 的結果 */
export function rowHighlights(p: Place, status: { candidate: string[]; scheduled: string[] }, max = 2): RowHighlight[] {
  const out = statusHighlights(status).slice(0, max);
  for (const b of fitBadges(p, max - out.length)) out.push(fromBadge(b.label));
  return out;
}
