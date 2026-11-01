// 網頁行程分頁的日期晶片（2026-11-01 👤，取代右欄的兩週月曆）：浮在地圖左上，右欄的垂直空間留給時間軸。
// 地圖夠寬（640 以上）一排；窄（iPad 橫放、小筆電）兩排，「整趟」佔兩排高，全部日期都看得到。寬窄看地圖欄自己的寬度（styles.css 的 container query）。
// 編輯中不畫（編輯中不能換天）。
// 選中的那天芥子黃；週末、國定假日紅字；有警告的那天下面一個紅色小點；提議有變動的天虛線框。testid、data-day 和手機的 DayStrip 一樣。
import { commands } from '../appCommands.ts';
import { useApp, usePlan } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { daySummary } from '../lib/planView.ts';
import { dayLabel, isRedDay, shortDayLabel, tripDates, weekdayZh } from '../lib/trip.ts';

const DATES = tripDates();
const NO_DATES: string[] = [];

export function MapDays() {
  const shown = useApp((s) => s.mode === 'map' && !s.planning);
  const proposed = useApp((s) => s.proposal?.dates ?? NO_DATES);
  const day = useApp((s) => s.day);
  const plan = usePlan((s) => s.plan);
  if (!shown) return null;
  const warned = (d: string) => {
    const dp = dayPlanOf(plan, d);
    return !!dp && daySummary(dp).warnings > 0;
  };
  return (
    <div className="map-days-wrap">
      <div className="map-days" data-testid="m-day-strip" role="tablist" aria-label="天數">
        <button type="button" role="tab" className="map-day all" aria-current={day === 'all' ? 'true' : undefined} aria-selected={day === 'all'} onClick={() => commands.selectDay('all')} data-testid="m-day-all">
          整趟
        </button>
        {DATES.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            className={`map-day ${isRedDay(d) ? 'red-day' : ''} ${proposed.includes(d) ? 'proposed' : ''}`}
            data-proposed={proposed.includes(d) || undefined}
            aria-current={day === d ? 'true' : undefined}
            aria-selected={day === d}
            aria-label={`${dayLabel(d)}${warned(d) ? '，有警告' : ''}${proposed.includes(d) ? '，提議有變動' : ''}`}
            onClick={() => commands.selectDay(d)}
            data-day={d}
            data-testid={`m-day-${d}`}
          >
            <b>{shortDayLabel(d)}</b>
            <small>{weekdayZh(d)}</small>
            {warned(d) && <i className="map-day-warn" data-testid="day-warn-dot" />}
          </button>
        ))}
      </div>
    </div>
  );
}
