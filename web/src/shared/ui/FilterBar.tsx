// 篩選列（手機、網頁同一個元件，探索和想去共用）：搜尋框、「篩選」（有條件時顯示數字）、排序（晶片選單）、照片牆／清單切換；
// 下面一排套用的條件（--indigo-wash 小晶片，點 ✕ 取消）。「篩選」打開 FilterSheet（手機底部面板、網頁右欄抽屜）。
// 網頁：整列（含套用的晶片）黏在右欄上面。手機：第一列（搜尋、篩選、排序）黏在最上面；
// 第二列（類型晶片＋照片牆／清單切換，typeRow 由呼叫的畫面給）和套用的晶片跟著內容捲走，往下捲只剩第一列。
// 資料來自 FilterModel：網頁接 appStore 的 filter，手機接 mobileStore 的 feed／wish，這裡不認得是哪一個 store。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../../hooks.ts';
import { Icon } from '../../components/Icon.tsx';
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, type ExploreSort } from '../../lib/explore.ts';
import type { Filter, FilterKey } from '../../lib/filter.ts';
import { appliedChips, type FilterSource } from '../filterOptions.ts';
import { Chip } from './Chip.tsx';
import { FilterSheet, type FilterSurface } from './FilterSheet.tsx';

export type ListView = 'photo' | 'list';

/** 篩選列要的資料和動作（網頁、手機各自接自己的 store） */
export interface FilterModel {
  /** 目前套用的條件（手機的類型在外面一列，這裡仍然帶著，appliedChips 決定要不要列） */
  filter: Filter;
  query: string;
  setQuery(q: string): void;
  sort: ExploreSort;
  setSort(s: ExploreSort): void;
  /** 照片牆／清單；沒給（view 和 setView 都沒有）就不顯示切換 */
  view?: ListView;
  setView?(v: ListView): void;
  /** 只看地圖畫面裡的（只有網頁；手機一律 false） */
  inView: boolean;
  setInView(v: boolean): void;
  /** 點面板裡的選項：地區一次一個（再點取消），其他是開關 */
  pick(key: FilterKey, value: string): void;
  /** 全部清除 */
  clear(): void;
}

/** 排序：晶片，點了出現選單（不用 <select>，兩邊樣子一樣） */
function SortMenu({ model }: { model: FilterModel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Esc 只關排序選單（捕獲階段先攔下）
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <span className="fb-sort" ref={ref}>
      <Chip on={open} onClick={() => setOpen(!open)} testId="sort-open" title={`排序：${EXPLORE_SORT_LABELS[model.sort]}`}>
        <Icon name="sort" size={20} />
        <span className="fb-label">{EXPLORE_SORT_LABELS[model.sort]}</span>
      </Chip>
      {open && (
        <div className="fb-menu" role="menu" aria-label="排序" data-testid="sort-menu">
          {EXPLORE_SORTS.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === model.sort}
              className={`fb-menu-item ${s === model.sort ? 'on' : ''}`}
              onClick={() => {
                model.setSort(s);
                setOpen(false);
              }}
              data-testid={`sort-opt-${s}`}
            >
              {EXPLORE_SORT_LABELS[s]}
              {s === model.sort && <Icon name="check" size={20} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** 照片牆／清單切換 */
function ViewToggle({ model }: { model: FilterModel }) {
  const { view, setView } = model;
  if (!view || !setView) return null;
  return (
    <span className="fb-view" role="group" aria-label="顯示方式">
      <button type="button" aria-pressed={view === 'photo'} aria-label="照片牆" title="照片牆" onClick={() => setView('photo')} data-testid="view-photo">
        <Icon name="grid" size={20} />
      </button>
      <button type="button" aria-pressed={view === 'list'} aria-label="清單" title="清單" onClick={() => setView('list')} data-testid="view-list">
        <Icon name="list" size={20} />
      </button>
    </span>
  );
}

export function FilterBar({ source, surface, model, count, typeRow }: { source: FilterSource; surface: FilterSurface; model: FilterModel; count: number; typeRow?: ReactNode }) {
  const areas = useData((s) => s.areas);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const desktop = surface === 'desktop';
  const chips = appliedChips(model.filter, areas, { includeType: desktop });
  // 「只看地圖畫面裡的」不是 Filter 的欄位，另外多一顆
  const n = chips.length + (model.inView ? 1 : 0);
  const searchTestId = desktop ? 'search' : source === 'wish' ? 'm-wish-search' : 'm-feed-search';

  const applied = n > 0 && (
    <div className="fb-applied" data-testid="filter-applied-row">
      {chips.map((c) => (
        <span key={`${c.key}:${c.value}`} className="fb-applied-item" data-testid="filter-applied">
          <Chip applied onRemove={() => model.pick(c.key, c.value)}>
            {c.label}
          </Chip>
        </span>
      ))}
      {model.inView && (
        <span className="fb-applied-item" data-testid="filter-applied">
          <Chip applied onRemove={() => model.setInView(false)}>
            地圖畫面裡
          </Chip>
        </span>
      )}
    </div>
  );

  const bar = (
    <div className={`fb fb-${surface}`} ref={rootRef} data-testid="filter-bar">
      <div className="fb-row">
        <label className="fb-search">
          <Icon name="search" size={20} />
          <input type="search" value={model.query} placeholder="搜尋名稱" aria-label="搜尋名稱" onChange={(e) => model.setQuery(e.target.value)} data-testid={searchTestId} />
          {model.query && (
            <button type="button" className="fb-search-clear" aria-label="清除搜尋" onClick={() => model.setQuery('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <Chip on={n > 0} onClick={() => setOpen(true)} testId="filter-open" title="篩選">
          <Icon name="sliders" size={20} />
          <span className="fb-label">篩選</span>
          {n > 0 && (
            <span className="fb-n" data-testid="filter-count">
              {n}
            </span>
          )}
        </Chip>
        <SortMenu model={model} />
        {desktop && <ViewToggle model={model} />}
      </div>
      {desktop && applied}
    </div>
  );
  const sheet = open && <FilterSheet source={source} surface={surface} model={model} count={count} host={desktop ? (rootRef.current?.closest('.side-panel') as HTMLElement | null) : null} onClose={() => setOpen(false)} />;
  if (desktop) {
    return (
      <>
        {bar}
        {sheet}
      </>
    );
  }
  return (
    <>
      {bar}
      <div className="fb-below">
        <div className="fb-typerow">
          <div className="fb-types">{typeRow}</div>
          <ViewToggle model={model} />
        </div>
        {applied}
      </div>
      {sheet}
    </>
  );
}
