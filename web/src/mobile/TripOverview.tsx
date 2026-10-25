// 手機版行程的「全部」（第六輪 §3.5、草圖 B5）：一天一列。左邊日期和星期（紅字規則照 §2.5），
// 中間是這天的標題（去的地區，照順序），下面一行是點數、⚠ 數、住哪裡；右邊一兩張小縮圖。點一列就跳到那天。
// 地圖畫整趟的路線（第五輪，appStore.day＝'all' 時 MapView 自己畫）。

import { commands } from '../appCommands.ts';
import { useData, usePlan } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { isRedDay, shortDayLabel, tripDates, weekdayZh } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { Thumb } from './Thumb.tsx';

const DATES = tripDates();

const nameOf = (p: Place | undefined) => (p ? p.name.zh || p.name.ja : '');

export function TripOverview() {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const plan = usePlan((s) => s.plan);
  return (
    <ol className="m-overview" data-testid="m-overview">
      {DATES.map((d) => {
        const stops = stopsOn(itinerary, d)
          .filter((s) => s.kind !== 'lodging' && s.kind !== 'flight')
          .map((s) => byId.get(s.place))
          .filter((p): p is Place => !!p);
        const dp = dayPlanOf(plan, d);
        const warn = dp?.warnings.filter((w) => w.level !== 'info').length ?? 0;
        const lodging = byId.get(itinerary?.days.find((x) => x.date === d)?.lodging ?? '');
        // 標題：去的地區（照順序、不重複）
        const regions = [...new Set(stops.map((p) => areas.find((a) => a.id === p.area)?.name.zh).filter((x): x is string => !!x))];
        const thumbs = stops.filter((p) => p.type === 'spot' || p.type === 'restaurant').slice(0, 2);
        return (
          <li key={d}>
            <button type="button" className="m-overview-day" onClick={() => commands.selectDay(d)} data-testid="m-overview-day" data-date={d}>
              <span className={`m-ov-date ${isRedDay(d) ? 'red-day' : ''}`}>
                <b>{shortDayLabel(d)}</b>
                <small>{weekdayZh(d)}</small>
              </span>
              <span className="m-ov-mid">
                <b className="m-ellipsis">{regions.length ? regions.join(' → ') : stops.length ? stops.map(nameOf).join(' → ') : '還沒排'}</b>
                <span className="m-ov-sub m-ellipsis">
                  {[`${stops.length} 個點`, warn > 0 && `⚠ ${warn}`, lodging && `住 ${nameOf(lodging)}`].filter(Boolean).join('・')}
                </span>
              </span>
              <span className="m-ov-thumbs">
                {thumbs.map((p) => (
                  <Thumb key={p.id} place={p} size={36} />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
