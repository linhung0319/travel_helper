// 篩選列（手機、網頁同一個元件，探索和想去共用；interaction-design §35.3，T76 起）。呼叫的畫面給 stage（lib/shelves.ts 的 exploreLayer；想去給 'area'）：
// - 工具列：搜尋＋篩選圓鈕（有條件時白底、芥子黃小點）；stage 是 overview 時是搜尋＋問 AI＋加地點。排序、照片牆／清單切換、
//   「看什麼」淡藍帶、「‹ 書架」「‹ 三排」T79 刪了（§35.10）。
// - 地區分頁（typeRow，數字由呼叫的畫面給、永遠寫）、子地區晶片（subRow，RegionChips）、主題列（model.theme＋themeCounts，stage 是 area 時）由上往下，整組黏頂。
//   網頁：整組黏在右欄上面。手機：整組黏在最上面；螢幕太矮或鍵盤開著時（ui.css 的 .fb-stick）只留工具列，其他的跟著內容捲走。
// - 條件列不在這裡（會捲走）：呼叫的畫面在內容最上面放 FilterConds；AI 套的篩選給 ai，畫成「✦ AI 幫你套了」（T85 §37）。
// - 篩選面板（FilterSheet）：有主題只畫目前主題的組，沒有主題（搜尋、AI 結果集）畫類型晶片＋那幾類的組。
// - 量好黏住的高度寫在捲動容器的 --sec-top（區段標題黏在它下面，Section.tsx）。
// 資料來自 FilterModel：網頁接 appStore 的 filter，手機接 mobileStore 的 feed／wish，這裡不認得是哪一個 store。

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useData } from '../../hooks.ts';
import type { Area } from '../../data/types.ts';
import { Icon } from '../../components/Icon.tsx';
import type { Filter, FilterKey } from '../../lib/filter.ts';
import { themeApplied, type FilterSource } from '../filterOptions.ts';
import { conditionChips } from '../../lib/listConditions.ts';
import type { ExploreLayer, Theme } from '../../lib/shelves.ts';
import { FilterSheet, type FilterSurface } from './FilterSheet.tsx';
import { scrollerOf } from './scroller.ts';
import { ThemeRow } from './ThemeRow.tsx';

/** 篩選列要的資料和動作（網頁、手機各自接自己的 store） */
export interface FilterModel {
  /** 目前套用的條件（地區在外面一列，這裡仍然帶著，appliedChips 決定要不要算） */
  filter: Filter;
  query: string;
  setQuery(q: string): void;
  /** 只看地圖畫面裡的（只有網頁；手機一律 false） */
  inView: boolean;
  setInView(v: boolean): void;
  /** 點面板裡的選項：地區一次一個（再點取消），其他是開關 */
  pick(key: FilterKey, value: string): void;
  /** 全部清除 */
  clear(): void;
  /** AI 挑的（規格 §3.1）：只有一組；total 是 AI 挑了幾家（清單照 AI 的順序） */
  ai?: { title: string; total: number; onClear(): void };
  /** 工具列的問 AI（§16.1、§16.2） */
  onAsk?(): void;
  /** 「‹ 回 AI」（手機從聊天跳過來或有結果集，§16.2）；點 AI 晶片也做這件事 */
  onBack?(): void;
  /** 工具列的加地點（只有探索，T33） */
  onAdd?(): void;
  /** 目前的主題（T76：主題列、面板只畫這個主題的組）；概覽、搜尋、AI 結果集是 null */
  theme?: Theme | null;
  /** 換主題（主題列） */
  setTheme?(theme: Theme): void;
}

/** 工具列的圓鈕（問 AI、加地點） */
function Tool({ icon, label, onClick, testId, className }: { icon: 'spark' | 'plus'; label: string; onClick(): void; testId: string; className: string }) {
  return (
    <button type="button" className={`fb-tool ${className}`} onClick={onClick} aria-label={label} title={label} data-testid={testId}>
      <Icon name={icon} size={20} />
    </button>
  );
}

export interface FilterBarProps {
  source: FilterSource;
  surface: FilterSurface;
  model: FilterModel;
  /** 符合的數量（面板的「看 N 個」） */
  count: number;
  /** 地區分頁（AreaChips） */
  typeRow?: ReactNode;
  /** 子地區晶片（RegionChips） */
  subRow?: ReactNode;
  /** 探索的層（exploreLayer）；想去給 'area' */
  stage: ExploreLayer;
  /** 主題列的三格數字（lib/shelves.ts 的 themeCounts） */
  themeCounts?: Record<Theme, number>;
}

/** 面板裡套了條件沒有（篩選鈕的小點）：有主題時只看那個主題的組（T75 的 themeApplied），沒有時看條件晶片 */
function hasConditions(model: FilterModel, source: FilterSource, areas: Area[]): boolean {
  if (model.theme) return themeApplied(model.theme, model.filter, source) > 0 || model.inView;
  return conditionChips(model.filter, '', areas, { inView: model.inView }).length > 0;
}

/**
 * 黏住的篩選列有多高，寫在捲動容器的 --sec-top（展開的區段標題黏在它下面，Section.tsx）。
 * 手機螢幕太矮時 .fb-stick 是 display: contents，只有工具列（靛藍色帶）黏住，量它；網頁量整個 .fb-desktop
 */
function useSectionTop(stick: RefObject<HTMLElement | null>, band: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = stick.current;
    const scroller = el && scrollerOf(el);
    if (!el || !scroller) return;
    const measure = () => {
      const sticky = getComputedStyle(el).display === 'contents' ? band.current : el;
      scroller.style.setProperty('--sec-top', `${sticky?.offsetHeight ?? 0}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const c of [el, band.current, ...Array.from(el.children)]) if (c) ro.observe(c);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      scroller.style.removeProperty('--sec-top');
    };
  }, [stick, band]);
}

/** 工具列的篩選圓鈕（T76）：有條件時白底、右上芥子黃小點 */
function FilterButton({ on, onClick }: { on: boolean; onClick(): void }) {
  return (
    <button type="button" className={`fb-tool fb-filter2${on ? ' on' : ''}`} aria-label={on ? '篩選（有條件）' : '篩選'} title="篩選" aria-pressed={on} onClick={onClick} data-testid="filter-open">
      <Icon name="sliders" size={20} />
      {on && <span className="fb-dot" aria-hidden />}
    </button>
  );
}

/** 篩選列：搜尋＋篩選（概覽是搜尋＋問 AI＋加地點）、地區分頁、子地區、主題列，整組黏頂 */
export function FilterBar({ source, surface, model, count, typeRow, subRow, stage, themeCounts }: FilterBarProps) {
  const areas = useData((s) => s.areas);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const desktop = surface === 'desktop';
  useSectionTop(desktop ? rootRef : stickRef, rootRef);
  const overview = stage === 'overview';
  const searchTestId = desktop ? 'search' : source === 'wish' ? 'm-wish-search' : 'm-feed-search';
  const aiLabel = model.ai && (count === model.ai.total ? `AI 挑的 · ${model.ai.total} 家` : `AI 挑的 ${model.ai.total} 家中的 ${count} 家`);
  const backButton = model.onBack && (
    <button type="button" className="ai-back flat" onClick={model.onBack} data-testid="ai-back">
      ‹ 回 AI
    </button>
  );
  const themeRow = stage === 'area' && model.theme !== undefined && model.setTheme && themeCounts && (
    <div className="fb-themerow">
      <ThemeRow value={model.theme ?? null} counts={themeCounts} onPick={model.setTheme} />
    </div>
  );
  const tools = overview ? (
    <>
      {model.onAsk && <Tool icon="spark" label="問 AI" onClick={model.onAsk} testId="list-ask-ai" className="fb-tool-ai" />}
      {model.onAdd && <Tool icon="plus" label="自己加一個" onClick={model.onAdd} testId="add-place-open" className="fb-tool-add" />}
    </>
  ) : (
    <FilterButton on={hasConditions(model, source, areas)} onClick={() => setOpen(true)} />
  );
  const row = (
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
      {tools}
    </div>
  );
  const ai = model.ai && (
    <div className="fb-ai">
      {desktop ? (
        <button type="button" className="fb-ai-chip" aria-label="清掉 AI 挑的" onClick={model.ai.onClear} data-testid="ai-result-chip">
          ✦ {aiLabel}
          <Icon name="close" size={16} />
        </button>
      ) : (
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
      )}
      <span className="fb-ai-title" data-testid="ai-result-title">
        {model.ai.title}
      </span>
    </div>
  );
  const below = (
    <>
      {ai}
      {!desktop && !model.ai && backButton && <div className="fb-backrow">{backButton}</div>}
      {typeRow && (
        <div className="fb-typerow">
          <div className="fb-types">{typeRow}</div>
        </div>
      )}
      {subRow && <div className="fb-subrow">{subRow}</div>}
      {themeRow}
    </>
  );
  const sheet = open && <FilterSheet source={source} surface={surface} model={model} count={count} theme={model.theme ?? null} host={desktop ? (rootRef.current?.closest('.side-panel') as HTMLElement | null) : null} onClose={() => setOpen(false)} />;
  if (desktop) {
    return (
      <>
        <div className="fb fb-desktop fb-v2" ref={rootRef} data-testid="filter-bar" data-stage={stage}>
          {row}
          {below}
        </div>
        {sheet}
      </>
    );
  }
  return (
    <>
      <div className="fb-stick fb-v2" ref={stickRef} data-testid="fb-stick" data-stage={stage}>
        <div className="fb fb-mobile" ref={rootRef} data-testid="filter-bar">
          {row}
        </div>
        <div className="fb-below">{below}</div>
      </div>
      {sheet}
    </>
  );
}

/**
 * 條件列（T76，§35.5）：有條件時才畫，放在內容最上面（不黏頂，會捲走）：墨色實心膠囊「長輩 ✕」每顆可點掉，右邊小字「符合 N 個」。
 * 主題（類型）、地區、子地區、搜尋不算（都在頂端看得到）；網頁的「只看地圖畫面裡的」算一顆
 */
export function FilterConds({ model, count, ai }: { model: FilterModel; count: number; ai?: AiSetActions }) {
  const areas = useData((s) => s.areas);
  const chips = conditionChips(model.filter, '', areas, { inView: model.inView }).filter((c) => c.key !== 'types');
  const buttons = chips.map((c) => (
    <button
      key={`${c.key}:${c.value}`}
      type="button"
      className="fc-chip"
      aria-label={`拿掉「${c.label}」`}
      title={`拿掉「${c.label}」`}
      onClick={() => (c.key === 'inView' ? model.setInView(false) : c.key === 'query' ? model.setQuery('') : model.pick(c.key, c.value))}
      data-testid="cond-chip"
      data-key={c.key}
      data-value={c.value}
    >
      {c.label}
      <Icon name="close" size={16} />
    </button>
  ));
  if (ai) return <AiSetRow chips={buttons} count={count} ai={ai} />;
  if (!chips.length) return null;
  return (
    <div className="fc-row" data-testid="cond-row">
      {buttons}
      <span className="fc-sum" data-testid="cond-count">
        符合 {count} 個
      </span>
    </div>
  );
}

/** 「AI 幫你套了」的兩個動作：復原（回到 AI 套用之前）、全部收起（只收區段，條件留著；平的清單沒有區段時不給） */
export interface AiSetActions {
  onUndo(): void;
  onCollapse?(): void;
}

/**
 * 「✦ AI 幫你套了」（T85 §37）：AI 套的篩選在內容最上面用這一條取代條件列。靛藍淡底；晶片照條件列的樣子（可以一顆顆點掉，
 * 點了就是使用者自己動了，變回一般的條件列）；下面一行「符合 N 個」，右邊「全部收起」「復原」。沒有晶片（只給了地區、主題）也畫
 */
function AiSetRow({ chips, count, ai }: { chips: ReactNode[]; count: number; ai: AiSetActions }) {
  return (
    <div className="ai-set" data-testid="ai-filter-bar">
      <div className="ai-set-top">
        <span className="ai-set-spark" aria-hidden>
          ✦
        </span>
        AI 幫你套了
      </div>
      {chips.length > 0 && <div className="ai-set-chips">{chips}</div>}
      <div className="ai-set-foot">
        <span className="ai-set-sum" data-testid="cond-count">
          符合 {count} 個
        </span>
        <span className="ai-set-acts">
          {ai.onCollapse && (
            <button type="button" className="ai-set-act" onClick={ai.onCollapse} data-testid="ai-filter-collapse">
              全部收起
            </button>
          )}
          <button type="button" className="ai-set-act" onClick={ai.onUndo} data-testid="ai-filter-undo">
            復原
          </button>
        </span>
      </div>
    </div>
  );
}
