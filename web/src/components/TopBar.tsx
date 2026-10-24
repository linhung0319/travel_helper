import { useEffect, useMemo, useRef, useState } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { filterChips, isFilterEmpty, matchesFilter, matchesQuery } from '../lib/filter.ts';
import { shortDayLabel, tripDates, weekdayZh, JP_HOLIDAYS } from '../lib/trip.ts';
import { ConflictBar, PlanningBar } from './Planning.tsx';
import { MeMenu } from './MeMenu.tsx';
import { FilterPanel } from './FilterPanel.tsx';
import { showItinerary } from './Explore.tsx';

const DATES = tripDates();

/** onSelect：電腦版選了某一天，右側切回「行程」 */
function DayTabs({ onSelect }: { onSelect?: () => void }) {
  const day = useApp((s) => s.day);
  const ref = useRef<HTMLDivElement>(null);

  // 和 AI 用同一個指令：選了某一天，地圖移到那天排的點（沒有排東西就不動）
  const select = (d: string) => {
    commands.selectDay(d);
    onSelect?.();
  };

  // 選定的分頁捲到看得到的地方（手機上分頁可以左右滑）
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [day]);

  return (
    <div className="day-tabs" role="tablist" aria-label="天數" ref={ref}>
      <button type="button" role="tab" aria-selected={day === 'all'} className="day-tab" onClick={() => select('all')}>
        全部
      </button>
      {DATES.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={day === d}
          className={`day-tab ${JP_HOLIDAYS.has(d) ? 'holiday' : ''}`}
          data-day={d}
          onClick={() => select(d)}
        >
          {shortDayLabel(d)}
          <span className="day-tab-wd">{weekdayZh(d)}</span>
        </button>
      ))}
    </div>
  );
}

function FilterChips() {
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

export function TopBar() {
  const mode = useApp((s) => s.mode);
  const filter = useApp((s) => s.filter);
  const [filterOpen, setFilterOpen] = useState(false);
  return (
    <div className="top-bar">
      <div className="top-row">
        <DayTabs />
        <MeMenu />
      </div>
      <div className="top-row">
        <button
          type="button"
          className={`toggle filter-toggle ${isFilterEmpty(filter) ? '' : 'on'}`}
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((o) => !o)}
          data-testid="filter-button"
        >
          ⚙ 篩選
        </button>
        <FilterChips />
        <div className="segmented" role="group" aria-label="地圖或探索">
          <button type="button" aria-pressed={mode === 'map'} onClick={() => appStore.getState().setMode('map')}>
            地圖
          </button>
          <button type="button" aria-pressed={mode === 'explore'} onClick={() => appStore.getState().setMode('explore')}>
            探索
          </button>
        </div>
      </div>
      <PlanningBar />
      <ConflictBar />
      {filterOpen && <FilterPanel onClose={() => setFilterOpen(false)} />}
    </div>
  );
}

/**
 * 電腦版：浮在地圖上方（參考 puma.taipei 的版面）。左邊是日期，右邊是我；規劃模式的按鈕在右側的「行程」分頁；
 * 篩選、探索搬到右側的「探索」分頁。
 */
export function MapTopBar() {
  const mode = useApp((s) => s.mode);
  return (
    <div className="map-top">
      <div className="map-top-row">
        <div className="float-bar day-float">
          <DayTabs onSelect={showItinerary} />
        </div>
        <div className="float-bar me-float">
          <MeMenu />
        </div>
      </div>
      <PlanningBar />
      <ConflictBar />
      {/* 探索分頁裡已經看得到篩選，不重複 */}
      {mode !== 'explore' && <FilterChips />}
    </div>
  );
}
