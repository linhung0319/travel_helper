// 右欄的篩選小晶片（第七輪 Task 3：浮在地圖上的日期列、討論／預約／下載工具列都拿掉了）。
// 日期列是 shared/ui/DayStrip.tsx，討論、預約、下載收進 MeMenu.tsx 的頭像選單；SidePanel 把它們排在右欄頂端。

import { useMemo } from 'react';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { filterChips, matchesFilter, matchesQuery } from '../lib/filter.ts';

/** 套用中的篩選條件（點一個取消一個）；沒有條件時不畫 */
export function FilterChips() {
  const filter = useApp((s) => s.filter);
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const chips = filterChips(filter, areas);
  const query = useApp((s) => s.query);
  const count = useMemo(() => places.filter((p) => matchesFilter(p, filter) && matchesQuery(p, query)).length, [places, filter, query]);
  if (chips.length === 0) return null;
  return (
    <div className="chips" data-testid="filter-chips">
      <span className="chips-label">篩選（{count}）</span>
      {chips.map((c) => (
        <button
          key={`${c.key}:${c.value}`}
          type="button"
          className="chip"
          aria-label={`取消篩選 ${c.label}`}
          onClick={() => commands.setFilter({ [c.key]: (filter[c.key] as string[]).filter((v) => v !== c.value) })}
        >
          {c.label} ✕
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" className="chip chip-clear" onClick={() => commands.clearFilter()}>
          全部取消
        </button>
      )}
    </div>
  );
}
