import { useEffect, useMemo, useRef, useState } from 'react';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { sharedStore } from '../appShared.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, usePlan, useShared } from '../hooks.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import { noteRows } from '../lib/reservations.ts';
import { exportFileName } from '../lib/planView.ts';
import { openMapPanel } from '../uiStore.ts';
import { useCommentCount } from './Wishlist.tsx';
import { filterChips, isFilterEmpty, matchesFilter, matchesQuery } from '../lib/filter.ts';
import { shortDayLabel, tripDates, weekdayZh, JP_HOLIDAYS } from '../lib/trip.ts';
import { ConflictBar, PlanningBar } from './Planning.tsx';
import { MeMenu } from './MeMenu.tsx';
import { FilterPanel } from './FilterPanel.tsx';
import { showItinerary } from './Explore.tsx';

const DATES = tripDates();

/** 下載目前的行程 JSON（原本行程分頁的「匯出 JSON」） */
function exportJson() {
  const itinerary = dataStore.getState().itinerary;
  if (!itinerary) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(itinerary, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(sharedStore.getState().version);
  a.click();
  URL.revokeObjectURL(url);
}

/** 右上角的整趟工具：💬 討論、📋 預約筆記（數字是選的那天，選「全部」是整趟）、⬇ 下載行程 JSON */
function TripTools() {
  const day = useApp((s) => s.day);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  const comments = useCommentCount(day === 'all' ? TRIP_TARGET : dayTarget(day));
  const pending = noteRows(itinerary, plan, byId, reservations).filter((r) => r.status === 'pending' && (day === 'all' || r.date === day)).length;
  return (
    <div className="trip-tools">
      <button type="button" className="day-tool" onClick={() => openMapPanel('comments')} aria-label="討論" data-testid="toolbar-comments">
        💬 <span className="day-tool-text">討論</span>
        {comments > 0 && <span className="day-tool-n">{comments}</span>}
      </button>
      <button type="button" className="day-tool" onClick={() => openMapPanel('reservations')} aria-label="預約筆記" data-testid="toolbar-reservations">
        📋 <span className="day-tool-text">預約</span>
        {pending > 0 && <span className="day-tool-n warn">{pending}</span>}
      </button>
      <span className="day-tool-menu" data-testid="toolbar-more">
        <button type="button" className="day-tool" aria-label="下載行程 JSON" title="下載行程 JSON" disabled={!itinerary} onClick={exportJson} data-testid="export-json">
          ⬇
        </button>
      </span>
    </div>
  );
}

/** 右上角：整趟工具和帳號放一起（電腦、手機各一處） */
function AccountBar() {
  return (
    <div className="account-bar">
      <TripTools />
      <MeMenu />
    </div>
  );
}

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
    <div className="day-bar-wrap">
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
        <AccountBar />
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
  const ref = useRef<HTMLDivElement>(null);
  // 規劃列、衝突提示、篩選 chips 會讓浮動列變高：量出它的下緣，讓討論／預約彈窗的標題永遠在它下面（--bar-bottom）
  useEffect(() => {
    const el = ref.current;
    const column = el?.parentElement;
    if (!el || !column) return;
    const measure = () => column.style.setProperty('--bar-bottom', `${el.offsetTop + el.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      column.style.removeProperty('--bar-bottom');
    };
  }, []);
  return (
    <div className="map-top" ref={ref}>
      <div className="map-top-row">
        <div className="float-bar day-float">
          <DayTabs onSelect={showItinerary} />
        </div>
        <div className="float-bar me-float">
          <AccountBar />
        </div>
      </div>
      <PlanningBar />
      <ConflictBar />
      {/* 探索分頁裡已經看得到篩選，不重複 */}
      {mode !== 'explore' && <FilterChips />}
    </div>
  );
}
