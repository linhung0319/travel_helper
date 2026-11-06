// 篩選列（手機、網頁同一個元件，探索和想去共用）。T69（interaction-design §33）照「每一層一種長相」重排：
// 第一列是工具：搜尋框，後面一排同樣大小的圓鈕（篩選、排序、問 AI、加地點（只有探索））；有條件時篩選鈕右上一個小藍點，不再整顆變黑。
// 第二列是地區（typeRow：分頁，由呼叫的畫面給），選了一區時下面接子地區小晶片（subRow）；書架和照片牆／清單都有（換地區、子地區篩選留著）。
// 照片牆／清單那層（showView）最下面是一條淡藍帶＝「看什麼」：「‹ 書架 › 一定要去 · 9 個地點」、照片牆／清單切換，書架退到第二級時一行芥子黃小字，
// 下面是條件晶片（T64，lib/listConditions.ts：每個條件一顆、都有 ✕，藍底是書架帶來的、白底是自己加的，最後「＋ 條件」打開 FilterSheet）。
// 想去的「‹ 三排」回三排書架；想去的「只看自己加的 N」（extraCond）是條件列最前面的一顆開關。
// 書架、概覽那層沒有帶子；有條件時（想去在三排那層也能篩）條件列單獨一列。誰吃、住法兩題的晶片右邊多一段分布小字（T67）。
// 網頁：整組黏在右欄上面。手機：整組也黏在最上面（2026-11-02 👤）；螢幕太矮或鍵盤開著時（ui.css 的 .fb-stick）只留第一列，其他的跟著內容捲走。
// 資料來自 FilterModel：網頁接 appStore 的 filter，手機接 mobileStore 的 feed／wish，這裡不認得是哪一個 store。
//
// T76（interaction-design §35.3、35.5）：呼叫的畫面給了 stage（lib/shelves.ts 的 exploreLayer）就是新的長相：
// - 工具列只剩搜尋＋篩選圓鈕（有條件時芥子黃小點、白底）；stage 是 overview 時是搜尋＋問 AI＋加地點。排序、照片牆／清單切換、「看什麼」淡藍帶、
//   「‹ 書架」「‹ 三排」、extraCond 都不畫（沒給 stage 的舊畫面照舊，T77、T78 接上新的之後 T79 刪）。
// - 地區分頁（typeRow，數字由呼叫的畫面給、永遠寫）、子地區晶片（subRow，RegionChips）、主題列（model.theme＋themeCounts，stage 是 area 時）由上往下，整組黏頂。
// - 條件列不在這裡（會捲走）：呼叫的畫面在內容最上面放 FilterConds。
// - 篩選面板只畫目前主題的組（FilterSheet 的 theme）。
// - 量好黏住的高度寫在捲動容器的 --sec-top（區段標題黏在它下面，Section.tsx）。

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useData } from '../../hooks.ts';
import type { Area } from '../../data/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, type ExploreSort } from '../../lib/explore.ts';
import type { Filter, FilterKey } from '../../lib/filter.ts';
import { themeApplied, type FilterSource } from '../filterOptions.ts';
import { conditionChips, type CondChip } from '../../lib/listConditions.ts';
import type { ExploreLayer, Theme } from '../../lib/shelves.ts';
import { Chip } from './Chip.tsx';
import { FilterSheet, type FilterSurface } from './FilterSheet.tsx';
import { scrollerOf } from './PlaceOpen.tsx';
import { ThemeRow } from './ThemeRow.tsx';

export type ListView = 'photo' | 'list';

/** 篩選列要的資料和動作（網頁、手機各自接自己的 store） */
export interface FilterModel {
  /** 目前套用的條件（地區在外面一列，這裡仍然帶著，appliedChips 決定要不要算） */
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

/** 「看什麼」帶子的第一行（T69）：「‹ 書架 › 一定要去」（lib/shelves.ts 的 backLabel），點「‹ 書架」回到目前地區＋子地區的書架；想去是「‹ 三排 › 已是候選」 */
export interface FilterBack {
  label: string;
  /** 書架退到第二級時的那句（「賢島沒有 S、A 級，這是 B 級」） */
  note?: string | null;
  onClick(): void;
}

/** 條件列最前面的一顆開關（想去的「只看自己加的 N」，T69） */
export interface ExtraCond {
  label: string;
  on: boolean;
  testId: string;
  onClick(): void;
}

/** 「現在看」的條件列（T64）：每個條件一顆（點了拿掉），最後「＋ 條件」打開篩選面板 */
function CondRow({ chips, onRemove, onAdd, extra }: { chips: CondChip[]; onRemove(chip: CondChip): void; onAdd(): void; extra?: ExtraCond }) {
  return (
    <div className="fb-conds" data-testid="cond-row">
      {extra && (
        <button type="button" className={`fb-cond fb-cond-toggle${extra.on ? ' on' : ''}`} aria-pressed={extra.on} onClick={extra.onClick} data-testid={extra.testId}>
          {extra.label}
          {extra.on && <Icon name="close" size={16} />}
        </button>
      )}
      {chips.map((c) => (
        <Fragment key={`${c.key}:${c.value}`}>
          <button
            type="button"
            className={`fb-cond${c.preset ? ' preset' : ''}`}
            aria-label={`拿掉「${c.label}」`}
            title={`拿掉「${c.label}」`}
            onClick={() => onRemove(c)}
            data-testid="cond-chip"
            data-key={c.key}
            data-value={c.value}
            data-preset={c.preset || undefined}
          >
            {c.label}
            <Icon name="close" size={16} />
          </button>
          {c.note && (
            <span className="fb-cond-note" data-testid="cond-note" data-key={c.key}>
              {c.note}
            </span>
          )}
        </Fragment>
      ))}
      <button type="button" className="fb-cond fb-cond-add" onClick={onAdd} data-testid="cond-add">
        ＋ 條件
      </button>
    </div>
  );
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
  /** 舊的「看什麼」帶子（T79 刪） */
  back?: FilterBack | null;
  showView?: boolean;
  extraCond?: ExtraCond;
  /** T76：給了就是新的長相（探索的層；想去給 'area'） */
  stage?: ExploreLayer;
  /** T76：主題列的三格數字（lib/shelves.ts 的 themeCounts） */
  themeCounts?: Record<Theme, number>;
}

export function FilterBar(props: FilterBarProps) {
  return props.stage ? <ThemeFilterBar {...props} stage={props.stage} /> : <LegacyFilterBar {...props} />;
}

/** 面板裡套了條件沒有（篩選鈕的小點）：有主題時只看那個主題的組（T75 的 themeApplied），沒有時看條件晶片 */
function hasConditions(model: FilterModel, source: FilterSource, areas: Area[]): boolean {
  if (model.theme) return themeApplied(model.theme, model.filter, source) > 0 || model.inView;
  return conditionChips(model.filter, '', areas, { inView: model.inView, shelves: false }).length > 0;
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

/** 新的篩選列（T76）：搜尋＋篩選（概覽是搜尋＋問 AI＋加地點）、地區分頁、子地區、主題列，整組黏頂 */
function ThemeFilterBar({ source, surface, model, count, typeRow, subRow, stage, themeCounts }: FilterBarProps & { stage: ExploreLayer }) {
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
export function FilterConds({ model, count }: { model: FilterModel; count: number }) {
  const areas = useData((s) => s.areas);
  const chips = conditionChips(model.filter, '', areas, { inView: model.inView, shelves: false }).filter((c) => c.key !== 'types');
  if (!chips.length) return null;
  return (
    <div className="fc-row" data-testid="cond-row">
      {chips.map((c) => (
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
      ))}
      <span className="fc-sum" data-testid="cond-count">
        符合 {count} 個
      </span>
    </div>
  );
}

/** 舊的篩選列（T69）：沒給 stage 的畫面照舊，T79 刪 */
function LegacyFilterBar({ source, surface, model, count, typeRow, subRow, back, showView = true, extraCond }: FilterBarProps) {
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const desktop = surface === 'desktop';
  // 「現在看」的條件（地區、子地區在外面，不算）；探索才有書架帶來的（藍底）
  // 誰吃、住法的分布小字（T67）只在探索、不是 AI 挑的時候算（想去、AI 結果集的範圍不是整區）
  const chips = conditionChips(model.filter, model.query, areas, { inView: model.inView, shelves: source === 'explore', places: source === 'explore' && !model.ai ? places : undefined });
  const removeChip = (c: CondChip) => {
    if (c.key === 'query') model.setQuery('');
    else if (c.key === 'inView') model.setInView(false);
    else model.pick(c.key, c.value);
  };
  const conds = (chips.length > 0 || !!extraCond) && <CondRow chips={chips} onRemove={removeChip} onAdd={() => setOpen(true)} extra={extraCond} />;
  const searchTestId = desktop ? 'search' : source === 'wish' ? 'm-wish-search' : 'm-feed-search';
  const filtered = chips.some((c) => c.key !== 'query') || !!extraCond?.on;

  const backButton = model.onBack && (
    <button type="button" className="ai-back flat" onClick={model.onBack} data-testid="ai-back">
      ‹ 回 AI
    </button>
  );
  const aiLabel = model.ai && (count === model.ai.total ? `AI 挑的 · ${model.ai.total} 家` : `AI 挑的 ${model.ai.total} 家中的 ${count} 家`);

  // 「看什麼」帶子（只在照片牆／清單那層）
  const lens = showView && (
    <div className="fb-lens" data-testid="lens">
      <div className="fb-lens-top">
        {!desktop && !model.ai && backButton}
        {back && (
          <>
            <button type="button" className="fb-crumb" onClick={back.onClick} data-testid="back-to-area" title={source === 'wish' ? '回到三排' : '回到這裡的書架'}>
              ‹ {source === 'wish' ? '三排' : '書架'}
            </button>
            <span className="fb-crumb-sep" aria-hidden>
              ›
            </span>
            <span className="fb-lens-title" data-testid="lens-title">
              {back.label}
            </span>
          </>
        )}
        <span className="fb-lens-n" data-testid="list-count">
          {count} 個地點
        </span>
        <span className="fb-lens-end">
          <ViewToggle model={model} />
        </span>
      </div>
      {back?.note && (
        <p className="fb-lens-note" data-testid="lens-note">
          {back.note}
        </p>
      )}
      {conds}
    </div>
  );
  const what = lens || conds;

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
        <Chip on={filtered} onClick={() => setOpen(true)} testId="filter-open" title="篩選" className="fb-filter">
          <Icon name="sliders" size={20} />
          <span className="fb-label">篩選</span>
        </Chip>
        <SortMenu model={model} />
        {model.onAsk && <Tool icon="spark" label="問 AI" onClick={model.onAsk} testId="list-ask-ai" className="fb-tool-ai" />}
        {model.onAdd && <Tool icon="plus" label="加地點" onClick={model.onAdd} testId="add-place-open" className="fb-tool-add" />}
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
        </div>
      )}
      {desktop && subRow && <div className="fb-subrow">{subRow}</div>}
      {desktop && what}
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
          {!model.ai && !showView && backButton && <div className="fb-backrow">{backButton}</div>}
          <div className="fb-typerow">
            <div className="fb-types">{typeRow}</div>
          </div>
          {subRow && <div className="fb-subrow">{subRow}</div>}
          {what}
        </div>
      </div>
      {sheet}
    </>
  );
}
