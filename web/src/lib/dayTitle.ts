// 這天的標題（第七輪 §6.1，網頁、手機共用）：大日期「2/5」，旁邊「週五 · 第 4 天 · 鳥羽」。
// 地區＝這天經過的點（不含機場、車站以外沒有地區的）最常出現的地區；平手取先出現的；沒有就不寫。

import type { Area, Place } from '../data/types.ts';
import type { DayStop } from './itinerary.ts';
import { shortDayLabel, tripDates, weekdayZh } from './trip.ts';

export interface DayTitle {
  /** 「2/5」 */
  date: string;
  /** 「週五 · 第 4 天 · 鳥羽」 */
  sub: string;
  /** 「週五 · 鳥羽」（手機：要留位置給「問 AI」「編輯」，§16.2） */
  short: string;
}

/** 這天最常出現的地區名稱；找不到是 null */
export function dayAreaName(stops: DayStop[], byId: Map<string, Place>, areas: Area[]): string | null {
  const count = new Map<string, number>();
  for (const s of stops) {
    const a = byId.get(s.place)?.area;
    if (a) count.set(a, (count.get(a) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [id, n] of count) if (best === null || n > count.get(best)!) best = id;
  const area = areas.find((a) => a.id === best);
  return area ? area.name.zh || area.name.ja || null : null;
}

/** 標題的兩段文字 */
export function dayTitle(date: string, areaName: string | null, dates = tripDates()): DayTitle {
  const n = dates.indexOf(date) + 1;
  const week = `週${weekdayZh(date)}`;
  return { date: shortDayLabel(date), sub: [week, n > 0 ? `第 ${n} 天` : null, areaName].filter(Boolean).join(' · '), short: [week, areaName].filter(Boolean).join(' · ') };
}
