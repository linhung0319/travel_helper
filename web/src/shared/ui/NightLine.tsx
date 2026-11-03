// 單天頂端的一行（T45b，interaction-design §19.3）：「● 鳥羽・第 2 晚／3 · 鳥羽國際飯店」；
// 這晚還沒決定區時，先問「這天晚上住哪一區？」加地區按鈕（AreaPicker）。最後一天沒有晚上，不畫。網頁、手機共用。

import type { CSSProperties } from 'react';
import { useData } from '../../hooks.ts';
import { areaColor } from '../../lib/areas.ts';
import { hasNight, nightLine } from '../../lib/tripSkeleton.ts';
import { AreaPicker } from './TripSkeleton.tsx';

export function NightLine({ date }: { date: string }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  if (!itinerary || !hasNight(itinerary, date)) return null;
  const n = nightLine(itinerary, date, areas, byId);
  if (!n) {
    return (
      <div className="ui-night-ask" data-testid="night-ask">
        <b>這天晚上住哪一區？</b>
        <AreaPicker date={date} current={null} />
      </div>
    );
  }
  const lodging = n.lodging ? byId.get(n.lodging) : undefined;
  return (
    <p className="ui-night-line" style={{ '--area': areaColor(areas, n.area) } as CSSProperties} data-testid="night-line">
      <i aria-hidden />
      <b>
        {n.areaName}・第 {n.index} 晚／{n.total}
      </b>
      <span>{lodging ? lodging.name.zh || lodging.name.ja : '還沒選住宿'}</span>
    </p>
  );
}
