// 手機版行程的「全部」（第六輪 §3.5、草圖 B5）：一天一列。左邊日期和星期（紅字規則照 §2.5），
// 中間是這天的標題（去的地區，照順序），下面一行是點數、⚠ 數、住哪裡；右邊一兩張小縮圖。點一列就跳到那天。
// 地圖畫整趟的路線（第五輪，appStore.day＝'all' 時 MapView 自己畫）。

import { lodgingOn } from '@travel-helper/engine';
import { commands } from '../appCommands.ts';
import { useData, usePlan, useShared } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { isRedDay, shortDayLabel, tripDates, weekdayZh } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { Button } from '../shared/ui/Button.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { areaNameIn, describeChanges } from '../lib/overlays.ts';
import { dayCandidates } from '../lib/wishlist.ts';
import { flightCount, overviewRows } from '../lib/tripStart.ts';
import { Icon } from '../components/Icon.tsx';
import { StartCard } from '../shared/ui/StartCard.tsx';
import { mobileStore } from './mobileStore.ts';
import { useApp } from '../hooks.ts';
import { askStart, askTrip } from './mobileAi.ts';
import { Thumb } from './Thumb.tsx';

const DATES = tripDates();

const nameOf = (p: Place | undefined) => (p ? p.name.zh || p.name.ja : '');

export function TripOverview() {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const plan = usePlan((s) => s.plan);
  const proposal = useApp((s) => s.proposal);
  const candidates = useShared((s) => s.candidates);
  // 有提議時那幾天變色、列出變動（§16.1）
  const changes = new Map(proposal ? describeChanges(proposal.changes, (id) => nameOf(byId.get(id)) || id, areaNameIn(areas)).map((l) => [l.date, l.text.split('：').slice(1).join('：')]) : []);
  const warnsOn = (d: string) => dayPlanOf(plan, d)?.warnings.filter((w) => w.level !== 'info').length ?? 0;
  const rows = overviewRows(DATES, (d) => ({
    stops: stopsOn(itinerary, d).some((s) => s.kind !== 'lodging' && s.kind !== 'flight'),
    lodging: !!lodgingOn(itinerary, d),
    flights: flightCount(itinerary, d),
    candidates: dayCandidates(candidates, d, itinerary, byId).length,
    warnings: warnsOn(d),
    proposed: changes.has(d),
  }));
  return (
    <>
    {!proposal && <StartCard onExplore={() => mobileStore.getState().setTab('explore')} onAsk={askStart} />}
    <div className="m-overview-ask">
      <Button kind="secondary" size="sm" icon="spark" onClick={askTrip} data-testid="trip-ask-ai">
        問 AI 整趟
      </Button>
      <DiscussButton variant="white" />
    </div>
    <ol className="m-overview" data-testid="m-overview">
      {rows.map((r) => {
        if (r.kind === 'empty') {
          return (
            <li key={r.from}>
              <button type="button" className="m-overview-day m-overview-empty" onClick={() => commands.selectDay(r.from)} data-testid="m-overview-day" data-date={r.from}>
                {shortDayLabel(r.from)}～{shortDayLabel(r.to)} 還沒排 · {r.count} 天
              </button>
            </li>
          );
        }
        const d = r.date;
        const stops = stopsOn(itinerary, d)
          .filter((s) => s.kind !== 'lodging' && s.kind !== 'flight')
          .map((s) => byId.get(s.place))
          .filter((p): p is Place => !!p);
        const warn = warnsOn(d);
        const flights = flightCount(itinerary, d);
        const lodging = byId.get(lodgingOn(itinerary, d) ?? '');
        // 標題：去的地區（照順序、不重複）
        const regions = [...new Set(stops.map((p) => areas.find((a) => a.id === p.area)?.name.zh).filter((x): x is string => !!x))];
        const thumbs = stops.filter((p) => p.type === 'spot' || p.type === 'restaurant').slice(0, 2);
        return (
          <li key={d}>
            <button type="button" className={`m-overview-day ${changes.has(d) ? 'proposed' : ''}`} onClick={() => commands.selectDay(d)} data-testid="m-overview-day" data-date={d}>
              <span className={`m-ov-date ${isRedDay(d) ? 'red-day' : ''}`}>
                <b>{shortDayLabel(d)}</b>
                <small>{weekdayZh(d)}</small>
              </span>
              <span className="m-ov-mid">
                <b className="m-ellipsis">{regions.length ? regions.join(' → ') : stops.length ? stops.map(nameOf).join(' → ') : flights ? <span className="ic-text"><Icon name="plane" size={16} /> 航班 {flights} 筆</span> : '還沒排'}</b>
                <span className="m-ov-sub m-ellipsis">
                  {[stops.length > 0 && `${stops.length} 個點`, warn > 0 && `提醒 ${warn}`, lodging && `住 ${nameOf(lodging)}`].filter(Boolean).join('・')}
                </span>
                {changes.has(d) && <span className="overview-change">{changes.get(d)}</span>}
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
    </>
  );
}
