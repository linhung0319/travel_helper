// 篩選列（手機、網頁同一個元件，探索和想去共用）：第一列搜尋框、「篩選」（有條件時顯示數字，類型不算）、排序（晶片選單）；
// 第二列類型晶片（typeRow 由呼叫的畫面給）和照片牆／清單切換；第三列幾個地點、「＋ 加地點」（只有探索）、問 AI。
// 套用了什麼條件不列出來（T33）：要看就點「篩選」，打開 FilterSheet（手機底部面板、網頁右欄抽屜）。
// 網頁：整組黏在右欄上面。手機：整組也黏在最上面（2026-11-02 👤，探索、想去是整頁，高度夠）；螢幕太矮或鍵盤開著時（ui.css 的 .fb-stick）只留第一列，其他的跟著內容捲走。
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
  /** AI 挑的（網頁的探索，規格 §3.1）：只有一組；total 是 AI 挑了幾家，sortByAi 是目前照 AI 的順序 */
  ai?: { title: string; total: number; sortByAi: boolean; setSortByAi(on: boolean): void; onClear(): void };
  /** 清單的問 AI（§16.1、§16.2） */
  onAsk?(): void;
  /** 「‹ 回 AI」（手機從聊天跳過來或有結果集，§16.2）；點 AI 晶片也做這件事 */
  onBack?(): void;
  /** 清單標題列的「＋ 加地點」（只有探索，T33） */
  onAdd?(): void;
}

/** 排序：晶片，點了出現選單（不用 <select>，兩邊樣子一樣） */
function SortMenu({ model }: { model: FilterModel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const byAi = !!model.ai?.sortByAi;
  const label = byAi ? 'AI 的順序' : EXPLORE_SORT_LABELS[model.sort];
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
      <Chip on={open} onClick={() => setOpen(!open)} testId="sort-open" title={`排序：${label}`}>
        <Icon name="sort" size={20} />
        <span className="fb-label">{label}</span>
      </Chip>
      {open && (
        <div className="fb-menu" role="menu" aria-label="排序" data-testid="sort-menu">
          {model.ai && (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={byAi}
              className={`fb-menu-item ${byAi ? 'on' : ''}`}
              onClick={() => {
                model.ai?.setSortByAi(true);
                setOpen(false);
              }}
              data-testid="sort-opt-ai"
            >
              AI 的順序
              {byAi && <Icon name="check" size={20} />}
            </button>
          )}
          {EXPLORE_SORTS.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={!byAi && s === model.sort}
              className={`fb-menu-item ${!byAi && s === model.sort ? 'on' : ''}`}
              onClick={() => {
                model.setSort(s);
                model.ai?.setSortByAi(false);
                setOpen(false);
              }}
              data-testid={`sort-opt-${s}`}
            >
              {EXPLORE_SORT_LABELS[s]}
              {!byAi && s === model.sort && <Icon name="check" size={20} />}
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
  // 類型在下面那列晶片，不算進「篩選」的數字；「只看地圖畫面裡的」不是 Filter 的欄位，另外算一個
  const n = appliedChips(model.filter, areas, { includeType: false }).length + (model.inView ? 1 : 0);
  const searchTestId = desktop ? 'search' : source === 'wish' ? 'm-wish-search' : 'm-feed-search';

  const backButton = model.onBack && (
    <button type="button" className="ai-back flat" onClick={model.onBack} data-testid="ai-back">
      ‹ 回 AI
    </button>
  );
  const aiLabel = model.ai && (count === model.ai.total ? `AI 挑的 · ${model.ai.total} 家` : `AI 挑的 ${model.ai.total} 家中的 ${count} 家`);

  const listHead = model.onAsk && (
    <div className="fb-listhead">
      {!desktop && !model.ai && backButton}
      <span data-testid="list-count">{count} 個地點</span>
      {model.onAdd && (
        <button type="button" className="fb-add" onClick={model.onAdd} data-testid="add-place-open">
          <Icon name="plus" size={16} /> 加地點
        </button>
      )}
      <button type="button" className="fb-ask" onClick={model.onAsk} data-testid="list-ask-ai">
        <Icon name="spark" size={16} /> 問 AI
      </button>
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
      </div>
      {desktop && model.ai && (
        <div className="fb-ai">
          <button type="button" className="fb-ai-chip" aria-label="清掉 AI 挑的" onClick={model.ai.onClear} data-testid="ai-result-chip">
            ✦ {aiLabel}
            <Icon name="close" size={16} />
          </button>
          <span className="fb-ai-title" data-testid="ai-result-title">
            {model.ai.title}
          </span>
        </div>
      )}
      {desktop && typeRow && (
        <div className="fb-typerow">
          <div className="fb-types">{typeRow}</div>
          <ViewToggle model={model} />
        </div>
      )}
      {desktop && listHead}
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
      <div className="fb-stick" data-testid="fb-stick">
        {bar}
        <div className="fb-below">
          {model.ai && (
            <div className="fb-ai">
              <div className="fb-ai-row">
                {backButton}
                <span className="ai-pill" data-testid="ai-result-pill">
                  <button type="button" className="ai-pill-body" onClick={model.onBack} data-testid="ai-result-open">
                    ✦ {aiLabel}
                  </button>
                  <button type="button" className="ai-pill-x" aria-label="清掉 AI 挑的" onClick={model.ai.onClear} data-testid="ai-result-chip">
                    <Icon name="close" size={16} />
                  </button>
                </span>
              </div>
              <span className="fb-ai-title" data-testid="ai-result-title">
                {model.ai.title}
              </span>
            </div>
          )}
          <div className="fb-typerow">
            <div className="fb-types">{typeRow}</div>
            <ViewToggle model={model} />
          </div>
          {listHead}
        </div>
      </div>
      {sheet}
    </>
  );
}
