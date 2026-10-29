// 買票站（T29c spec §8.6）：哪一程上車前要在車站買票（近鐵特急券、JR、船票）。
// 引擎挑班次（raptor/search.ts 留 ticketMargin）和網頁（警告、可以多待）共用。

/** 判斷買票站要的欄位；TransitRide 直接符合（kind 沒寫當 timetable、operator 沒寫當 null） */
export interface TicketRideInfo {
  /** 沒寫當 timetable */
  kind?: 'timetable' | 'headway';
  mode: 'train' | 'bus' | 'ferry';
  /** 路線或車種，例如「特急（往賢島）」 */
  line: string;
  /** 業者；近鐵是 'kintetsu'，沒寫或不知道是 null */
  operator?: string | null;
}

// 近鐵要另買特急券的車種（line 開頭）
const KINTETSU_EXPRESS = ['特急', 'しまかぜ'];

/**
 * 第 i 程的上車站要不要買票：只看有時刻表的那一程；近鐵特急一定要；
 * JR 等近鐵以外的電車、船是從站外走進來的（第一程，或前一程是不同業者）才要。
 * 近鐵特急以外、班距型、巴士（上車付錢）都不算
 */
export function isTicketRide(rides: readonly TicketRideInfo[], i: number): boolean {
  const r = rides[i];
  if (!r || (r.kind ?? 'timetable') !== 'timetable' || r.mode === 'bus') return false;
  const operator = r.operator ?? null;
  if (operator === 'kintetsu') return KINTETSU_EXPRESS.some((p) => r.line.startsWith(p));
  return i === 0 || (rides[i - 1].operator ?? null) !== operator;
}
