// 「移到第幾天」的 4 欄 × 3 列格子（12 天）：現在那天灰掉、寫「現在」，週六日、國定假日紅字。
// 只有格子本身（不含彈窗外框），網頁版的 MoveDialog、MoveCandidateDialog 和手機的 MoveDaySheet 共用。
import { tripDates, isRedDay, weekdayZh } from '../lib/trip.ts';

const DATES = tripDates();

/** 12 格日期：current 是現在那天（不能點）；每格兩行：日期、星期（現在那天第二行寫「現在」） */
export function DayGrid({ current, disabled, onPick }: { current?: string; disabled?: boolean; onPick: (date: string) => void }) {
  return (
    <div className="day-grid" data-testid="day-grid">
      {DATES.map((d) => {
        const [, mo, day] = d.split('-');
        const now = d === current;
        return (
          <button
            key={d}
            type="button"
            className={`day-cell ${isRedDay(d) ? 'red-day' : ''} ${now ? 'now' : ''}`}
            disabled={disabled || now}
            onClick={() => onPick(d)}
            data-pick-day={d}
            data-testid="move-day"
          >
            <span className="day-cell-date">
              {Number(mo)}/{Number(day)}
            </span>
            <span className="muted small">{now ? '現在' : weekdayZh(d)}</span>
          </button>
        );
      })}
    </div>
  );
}
