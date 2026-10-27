// 手機面板頂端的日期列（第七輪 Task 3）：「整趟」加 12 天，每格兩行（日期用圓體數字、下面只寫星期），實心白底，選到的塗芥子黃（§12.4），週末、國定假日紅字（isRedDay）。
// 每格至少 52px，左右滑；選到的那格自己捲進畫面。網頁右欄第八輪改成兩週月曆（DayCalendar.tsx，§13.2）。
// 換天用 commands.selectDay（地圖框住那天）。testid 兩邊都是 m-day-{date}、m-day-all，另外有 data-day 給 e2e 用。

import { useEffect, useRef } from 'react';
import { commands } from '../../appCommands.ts';
import { useApp } from '../../hooks.ts';
import { isRedDay, shortDayLabel, tripDates, weekdayZh } from '../../lib/trip.ts';

const DATES = tripDates();

export function DayStrip() {
  const day = useApp((s) => s.day);
  const ref = useRef<HTMLDivElement>(null);

  // 選到的那格捲進畫面（只捲這一列，不動外面）
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !el) return;
    const pad = 8;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left - pad < strip.scrollLeft) strip.scrollTo({ left: Math.max(0, left - pad), behavior: 'smooth' });
    else if (right + pad > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: right + pad - strip.clientWidth, behavior: 'smooth' });
  }, [day]);

  return (
    <div className="ui-days sheet" ref={ref} data-testid="m-day-strip" role="tablist" aria-label="天數">
      <button type="button" role="tab" className="ui-day all" aria-current={day === 'all' ? 'true' : undefined} aria-selected={day === 'all'} onClick={() => commands.selectDay('all')} data-testid="m-day-all">
        整趟
      </button>
      {DATES.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          className={`ui-day ${isRedDay(d) ? 'red-day' : ''}`}
          aria-current={day === d ? 'true' : undefined}
          aria-selected={day === d}
          onClick={() => commands.selectDay(d)}
          data-day={d}
          data-testid={`m-day-${d}`}
        >
          <b>{shortDayLabel(d)}</b>
          <small>{weekdayZh(d)}</small>
        </button>
      ))}
    </div>
  );
}
