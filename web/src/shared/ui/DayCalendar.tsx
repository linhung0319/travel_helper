// 網頁右欄的日期：兩週月曆（第八輪 §13.2）。7 欄（日～六），2/2 是週二，12 天剛好排成兩週，「整趟」佔第一列前面的空格；不用橫捲。
// 選中的那天芥子黃；週末、國定假日紅字（isRedDay，和手機的日期列一樣；表頭的日、六也紅）；有警告的那天格子下面一個紅色小點。格子高 44px（§1 平板）。
// testid、data-day 和日期列（DayStrip）一樣：m-day-{date}、m-day-all。手機面板頂端照舊用 DayStrip。
import { commands } from '../../appCommands.ts';
import { useApp, usePlan } from '../../hooks.ts';
import { dayPlanOf } from '../../planStore.ts';
import { daySummary } from '../../lib/planView.ts';
import { dayLabel, isRedDay, shortDayLabel, tripDates, weekdayIndex } from '../../lib/trip.ts';

const DATES = tripDates();
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
/** 第一天前面空幾格（2/2 週二：2 格，給「整趟」） */
const LEAD = weekdayIndex(DATES[0]);

export function DayCalendar() {
  const day = useApp((s) => s.day);
  const plan = usePlan((s) => s.plan);
  const warned = (d: string) => {
    const dp = dayPlanOf(plan, d);
    return !!dp && daySummary(dp).warnings > 0;
  };
  return (
    <div className="ui-cal" data-testid="m-day-strip" role="tablist" aria-label="天數">
      {WEEK.map((w, i) => (
        <span key={w} className={`ui-cal-wd ${i === 0 || i === 6 ? 'red-day' : ''}`} aria-hidden>
          {w}
        </span>
      ))}
      <button
        type="button"
        role="tab"
        className="ui-cal-day all"
        style={LEAD > 0 ? { gridColumn: `span ${LEAD}` } : { gridColumn: '1 / -1' }}
        aria-current={day === 'all' ? 'true' : undefined}
        aria-selected={day === 'all'}
        onClick={() => commands.selectDay('all')}
        data-testid="m-day-all"
      >
        整趟
      </button>
      {DATES.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          className={`ui-cal-day ${isRedDay(d) ? 'red-day' : ''}`}
          aria-current={day === d ? 'true' : undefined}
          aria-selected={day === d}
          aria-label={`${dayLabel(d)}${warned(d) ? '，有警告' : ''}`}
          onClick={() => commands.selectDay(d)}
          data-day={d}
          data-testid={`m-day-${d}`}
        >
          {shortDayLabel(d)}
          {warned(d) && <i className="ui-cal-warn" data-testid="day-warn-dot" />}
        </button>
      ))}
    </div>
  );
}
