// 日期格（4 欄 × 3 列，12 天）的資料：網頁版、手機版的「加到某天」「移到第幾天」共用 DayGrid12 元件，這裡是算格子的純函式。

import { isRedDay, weekdayZh } from '../lib/trip.ts';

export type DayCellState = 'picked' | 'scheduled' | 'current' | 'free';

export interface DayCell {
  date: string;
  /** 例如 `2/2` */
  label: string;
  /** 例如 `二` */
  weekday: string;
  /** 週六、週日、國定假日 */
  red: boolean;
  state: DayCellState;
}

/** 每一天一格；現在那天（current）最優先，其次已排（scheduled，不能取消）、選中（picked），其他是 free */
export function dayGridCells(dates: string[], opts: { picked: string[]; scheduled: string[]; current?: string }): DayCell[] {
  return dates.map((date) => {
    const [, mo, d] = date.split('-');
    const state: DayCellState = date === opts.current ? 'current' : opts.scheduled.includes(date) ? 'scheduled' : opts.picked.includes(date) ? 'picked' : 'free';
    return { date, label: `${Number(mo)}/${Number(d)}`, weekday: weekdayZh(date), red: isRedDay(date), state };
  });
}
