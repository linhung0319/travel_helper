// 這天的標題（第七輪 §6.1，網頁、手機共用）：大日期「2/5」，旁邊「週五 · 鳥羽」（T33 拿掉第 N 天，留位置給討論按鈕）。
// 地區＝這天經過的點（不含機場、車站以外沒有地區的）最常出現的地區；平手取先出現的；沒有就不寫。

import type { Area, Place } from '../data/types.ts';
import type { Itinerary } from '@travel-helper/engine/types';
import { stopsOn, type DayStop } from './itinerary.ts';
import { placeAreaOf, whereLabel } from './tripSkeleton.ts';
import { shortDayLabel, weekdayZh } from './trip.ts';

export interface DayTitle {
  /** 「2/5」 */
  date: string;
  /** 「週五」 */
  week: string;
  /** 地區；沒有是 null。手機放不下時整段省略，星期不會被截斷 */
  area: string | null;
  /** 「週五 · 鳥羽」 */
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
export function dayTitle(date: string, areaName: string | null): DayTitle {
  const week = `週${weekdayZh(date)}`;
  return { date: shortDayLabel(date), week, area: areaName, short: [week, areaName].filter(Boolean).join(' · ') };
}

/**
 * 標題用的地區（T45b）：先照每晚住哪一區推（「鳥羽」「志摩 → 鳥羽」「鳥羽（去伊勢一日）」），
 * 還沒決定才照這天排了的點（dayAreaName）
 */
export function dayAreaTitle(it: Itinerary | null, date: string, byId: Map<string, Place>, areas: Area[]): string | null {
  if (!it) return null;
  return whereLabel(it, date, areas, placeAreaOf(byId)) ?? dayAreaName(stopsOn(it, date), byId, areas);
}
