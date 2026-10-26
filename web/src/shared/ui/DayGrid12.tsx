// 12 天的日期格（4 欄 × 3 列）：「加到某天」（多選）和「移到第幾天」（單選）共用，網頁版彈窗和手機底部面板都用這個。
// 已排（scheduled）的格子寫「已排」、不能取消；現在那天（current）灰掉、寫「現在」；週末、國定假日紅字。樣式在 ui.css。

import { tripDates } from '../../lib/trip.ts';
import { dayGridCells } from '../dayGrid.ts';

const DATES = tripDates();

/** multi：點了加入或取消選中（onChange 給新的整份）；single：點了就 onChange([那天])；locked：選著但不能取消的日期（例如別人加的候選） */
export function DayGrid12({ mode, picked, scheduled = [], current, onChange, disabled = false, locked = [], testId }: { mode: 'multi' | 'single'; picked: string[]; scheduled?: string[]; current?: string; onChange: (dates: string[]) => void; disabled?: boolean; locked?: string[]; testId?: (date: string) => string }) {
  const cells = dayGridCells(DATES, { picked, scheduled, current });
  const click = (date: string) => onChange(mode === 'single' ? [date] : picked.includes(date) ? picked.filter((d) => d !== date) : [...picked, date].sort());
  return (
    <div className="ui-dg" role="group" aria-label="選日期" data-testid="day-grid">
      {cells.map((c) => (
        <button
          key={c.date}
          type="button"
          className={`ui-dg-cell ${c.state} ${c.red ? 'red-day' : ''}`}
          aria-pressed={mode === 'multi' ? c.state === 'picked' || c.state === 'scheduled' : undefined}
          disabled={disabled || locked.includes(c.date) || c.state === 'current' || c.state === 'scheduled'}
          onClick={() => click(c.date)}
          data-pick-day={c.date}
          data-testid={testId ? testId(c.date) : 'move-day'}
        >
          <span className="ui-dg-date">{c.label}</span>
          <span className="ui-dg-wd">{c.state === 'current' ? '現在' : c.state === 'scheduled' ? '已排' : c.weekday}</span>
        </button>
      ))}
    </div>
  );
}
