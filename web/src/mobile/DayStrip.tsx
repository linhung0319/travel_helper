// 手機版行程面板最上面的天數列（第六輪 §3.5）：獨佔一整行，左右滑。第一格「全部」，後面每天一格（兩行：大字 2/3，下面「三・2」＝星期・第幾天）。
// 選到的那天塗黑，週六、週日、國定假日紅字（isRedDay）；選了某天，那格自己捲到看得到的位置。換天用 commands.selectDay（地圖框住那天）。

import { useEffect, useRef } from 'react';
import { commands } from '../appCommands.ts';
import { useApp } from '../hooks.ts';
import { isRedDay, shortDayLabel, tripDates, weekdayZh } from '../lib/trip.ts';

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
    <div className="m-day-strip" ref={ref} data-testid="m-day-strip" role="tablist" aria-label="天數">
      <button type="button" role="tab" className="m-day m-day-all" aria-current={day === 'all' ? 'true' : undefined} aria-selected={day === 'all'} onClick={() => commands.selectDay('all')} data-testid="m-day-all">
        全部
      </button>
      {DATES.map((d, i) => (
        <button
          key={d}
          type="button"
          role="tab"
          className={`m-day ${isRedDay(d) ? 'red-day' : ''}`}
          aria-current={day === d ? 'true' : undefined}
          aria-selected={day === d}
          onClick={() => commands.selectDay(d)}
          data-testid={`m-day-${d}`}
        >
          <b>{shortDayLabel(d)}</b>
          <small>
            {weekdayZh(d)}・{i + 1}
          </small>
        </button>
      ))}
    </div>
  );
}
