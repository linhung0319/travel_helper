// 日期列每天下面一條地區色線（T45b，interaction-design §19.2）：這晚住哪一區的顏色，還沒決定是虛線，最後一天（沒有晚上）不畫顏色。
// 手機的 DayStrip、網頁地圖上的日期晶片（MapDays）都用。

import { nightAreaOf } from '@travel-helper/engine';
import type { CSSProperties } from 'react';
import { useData } from '../../hooks.ts';
import { areaColor } from '../../lib/areas.ts';
import { hasNight, placeAreaOf } from '../../lib/tripSkeleton.ts';

export function DayAreaLine({ date }: { date: string }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  if (!itinerary) return null;
  if (!hasNight(itinerary, date)) return <i className="ui-day-area none" aria-hidden />;
  const a = nightAreaOf(itinerary, date, placeAreaOf(byId));
  return <i className={`ui-day-area ${a ? '' : 'undecided'}`} style={a ? ({ '--area': areaColor(areas, a) } as CSSProperties) : undefined} data-area={a ?? ''} data-testid="day-area-line" aria-hidden />;
}
