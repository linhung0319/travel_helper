// 探索的概覽、選了一區之後的頂端和書架（T42，interaction-design §20）。手機、網頁共用；開詳情、換地區這些動作由呼叫的畫面給。
// 概覽（T52 §26、T63 §28）：一區一張卡（那區的代表照片、區名和日文名、住幾晚、子地區一行、簡介、二月注意第一則、代表的點），
// 點子地區在卡片裡換成那個子地區的簡介、二月注意、代表點（overviewStore 記每張卡選了哪個；網頁的地圖跟著框，onFocus）；
// 代表的點是文字加類型圓章，點了開詳情；「看志摩 ›」「看賢島 ›」進那一區（選了子地區時再選好那個子地區）。
// 選了一區（T50）：「2 月注意（N）」收合；下面幾排書架（lib/shelves.ts），每排 3 張小卡（右上角類型圓章）、「全部 ›」套那組條件。
// 書架兩級（T66，§32）：第一級 0 個退到第二級，標題旁的小字換成芥子黃的那句；小卡第二行寫這排在意的事（15 人坐不坐得下、住法和餐食）。
// 兩級都 0 個的那排不藏（T64）：標題照樣在，下面虛線框寫「賢島沒有 S、A 級的景點」和下一步（NextSteps，lib/listConditions.ts 的 emptyHelp；照片牆、清單篩到 0 個也用）。
// 子地區列（RegionChips）由呼叫的畫面放進篩選列（FilterBar 的 subRow），緊接在地區列下面。
// 樣式在 ui.css（.xo-*、.xa-*、.xs-*）。
//
// T76（interaction-design §35.6、35.4）：概覽卡由上往下是照片（點了進那區，沒有「看志摩 ›」）→ 主題列（點了直接進那區那個主題）→
// 子地區一行 → 一句特色 → 「● 2 月注意 N 則 ›」收合 → 代表地點；住幾晚、作者授權照舊。
// 選了一區的新內容是 AreaThemeHome：「2 月注意」一行收合＋目前主題的區段（Section.tsx；一定要去、其他景點…），
// 地區頁最下面「問 AI 幫我挑」「找不到？自己加一個」兩行小字。舊的 AreaHome、ShelfCard 留到 T77、T78 接上新的再刪（T79）。

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appStore } from '../../store.ts';
import { useData } from '../../hooks.ts';
import { displayName } from '../../data/normalize.ts';
import { SECTIONS, sectionCounts, sectionPlaces, shelfRows, themeCounts, type Theme } from '../../lib/shelves.ts';
import { sectionEmptyHelp, shelfEmptyHelp, type EmptyHelp } from '../../lib/listConditions.ts';
import { allRegionsLabel, areaSubName, overviewContent } from '../../lib/overview.ts';
import { overviewStore, useOverview } from '../overviewStore.ts';
import { areaStayLine } from '../../lib/tripSkeleton.ts';
import { whenNearViewport } from '../../lib/nearViewport.ts';
import type { Filter } from '../../lib/filter.ts';
import type { Area, Bbox, Photo as PhotoData, Place } from '../../data/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { Photo } from '../../components/Photo.tsx';
import { Chip } from './Chip.tsx';
import { ChipScroller } from './ChipScroller.tsx';
import { ScopeCount } from './AreaChips.tsx';
import { TierMark } from './TierMark.tsx';
import { TypeSeal } from './TypeLabel.tsx';
import { ThemeRow } from './ThemeRow.tsx';
import { Section, SectionRows } from './Section.tsx';
import { PlaceRow, useDayStatus } from './PlaceRow.tsx';

export type HomeSurface = 'desktop' | 'mobile';

const placeName = (p: Place) => p.name.zh || p.name.ja;

/** 網頁：滑鼠移上去指到地圖上的點 */
const hoverProps = (surface: HomeSurface, id: string) =>
  surface === 'desktop' ? { onMouseEnter: () => appStore.getState().hover(id), onMouseLeave: () => appStore.getState().hover(null) } : {};

/** 概覽的動作：開詳情、進那一區、進那一區再選那個子地區；onFocus（網頁）是點了卡片的子地區一行，地圖框到那裡 */
export interface OverviewActions {
  onOpen: (id: string) => void;
  onPickArea: (area: string) => void;
  onPickRegion: (area: string, region: string) => void;
  onFocus?: (area: string, region: string | null) => void;
  /** 卡片的主題列（T76）：進那一區（卡片選了子地區時連子地區）再選那個主題；沒給就只進那一區 */
  onPickTheme?: (area: string, region: string | null, theme: Theme) => void;
}

/** 概覽：一區一張卡 */
export function ExploreOverview({ surface, ...actions }: { surface: HomeSurface } & OverviewActions) {
  const areas = useData((s) => s.areas);
  return (
    <div className={`xo xo-${surface}`} data-testid="explore-overview">
      {areas.map((a) => (
        <AreaCard key={a.id} area={a} surface={surface} {...actions} />
      ))}
    </div>
  );
}

/** 照片右下的一行：作者 · 授權（資料裡的「Wikimedia: 」拿掉） */
const creditOf = (p: PhotoData | undefined) => (p ? [p.credit?.replace(/^Wikimedia:s*/, ''), p.license].filter(Boolean).join(' · ') : '');

/**
 * 概覽的一張卡（T52、T63）：上半是那區的代表照片（區名和日文名壓在左下、住幾晚在右上、作者和授權在右下），
 * 下面子地區一行（「志摩全區」加全部的子地區，點了在卡片裡換內容）、簡介、二月注意一則，最後是代表點（有小標題）和「看志摩 ›」。
 */
function AreaCard({ area, surface, onOpen, onPickArea, onPickRegion, onFocus, onPickTheme }: { area: Area; surface: HomeSurface } & OverviewActions) {
  const byId = useData((s) => s.byId);
  const places = useData((s) => s.places);
  const itinerary = useData((s) => s.itinerary);
  const picked = useOverview((s) => s.picks[area.id] ?? null);
  const content = overviewContent(area, picked);
  const reps = content.highlights.map((id) => byId.get(id)).filter((p): p is Place => !!p);
  const name = displayName(area.name, area.id);
  const sub = areaSubName(area);
  // 進那一區；選了子地區時再選好那個子地區
  const onPick = () => (content.regionId ? onPickRegion(area.id, content.regionId) : onPickArea(area.id));
  const stay = useMemo(() => (itinerary ? areaStayLine(itinerary, area.id, byId) : null), [itinerary, area.id, byId]);
  const photo = area.photos?.[0];
  const credit = creditOf(photo);
  const regions = area.regions ?? [];
  const pickRegion = (region: string | null) => {
    overviewStore.getState().pick(area.id, region);
    onFocus?.(area.id, region);
  };
  // 主題列的數字：那區（卡片選了子地區時是那個子地區）每一類的總數，不看篩選
  const counts = useMemo(() => themeCounts(places, { areas: [area.id], regions: content.regionId ? [content.regionId] : [] }), [places, area.id, content.regionId]);
  const pickTheme = (t: Theme) => (onPickTheme ? onPickTheme(area.id, content.regionId, t) : onPick());
  // 2 月注意：選了子地區是那個子地區的一句，全區是那區全部的
  const region = content.regionId ? regions.find((r) => r.id === content.regionId) : undefined;
  const feb = region ? (region.intro?.febNote ? [region.intro.febNote] : []) : (area.intro?.february ?? []).map((x) => x.text);
  return (
    <article className="xo-card" data-testid="overview-card" data-area={area.id} data-region={content.regionId ?? ''}>
      <div className="xo-cover">
        <button type="button" className="xo-photo" onClick={onPick} aria-label={`看${content.label}`} tabIndex={-1}>
          <AreaPhoto photo={photo} alt={name} />
        </button>
        <h3 className="xo-name">
          <button type="button" onClick={onPick} data-testid="overview-name">
            {name}
            {sub && <small className="xo-name-ja" lang="ja">{sub}</small>}
          </button>
        </h3>
        {stay && (
          <span className="xo-nights" data-testid="overview-nights">
            {stay}
          </span>
        )}
        {credit &&
          (photo?.page ? (
            <a className="xo-credit" href={photo.page} target="_blank" rel="noreferrer" data-testid="overview-credit">
              {credit}
            </a>
          ) : (
            <span className="xo-credit" data-testid="overview-credit">
              {credit}
            </span>
          ))}
      </div>
      <ThemeRow value={null} counts={counts} onPick={pickTheme} className="xo-themes" testId="overview-themes" />
      {regions.length > 1 && (
        <ChipScroller className="m-chips xo-regions" testId="overview-regions" activeKey={content.regionId ?? 'all'}>
          <Chip on={!content.regionId} onClick={() => pickRegion(null)} testId="overview-region-all">
            {allRegionsLabel(area)}
          </Chip>
          {regions.map((r) => (
            <Chip key={r.id} on={content.regionId === r.id} onClick={() => pickRegion(r.id)} testId={`overview-region-${r.id}`}>
              {displayName(r.name, r.id)}
            </Chip>
          ))}
        </ChipScroller>
      )}
      <div className="xo-text">
        {content.summary && (
          <p className="xo-summary" data-testid="overview-summary">
            {content.summary}
          </p>
        )}
        <FebNote items={feb} testId="overview-feb" />
      </div>
      {reps.length > 0 && (
        <div className="xo-reps">
          <h4 className="xo-reps-title" data-testid="overview-reps-title">
            {content.label}的代表地點
          </h4>
          {reps.map((p) => (
            <button key={p.id} type="button" className="xo-rep" onClick={() => onOpen(p.id)} data-testid="overview-rep" data-id={p.id} {...hoverProps(surface, p.id)}>
              <TypeSeal type={p.type} size="sm" />
              {placeName(p)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * 地區的代表照片（T51 的 areas.json photos，已經是 width=960 的縮圖網址）：快進畫面才載（T32 的做法），
 * 載好之前、沒有照片、打不開時是淡底。
 */
function AreaPhoto({ photo, alt }: { photo: PhotoData | undefined; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => {
    if (near || !photo || !ref.current) return;
    return whenNearViewport(ref.current, () => setNear(true));
  }, [near, photo]);
  return (
    <div ref={ref} className={`xo-img xo-img-${photo ? state : 'failed'}`} data-testid="overview-photo">
      {photo && near && state !== 'failed' && (
        <img src={photo.url} alt={alt} referrerPolicy="no-referrer" decoding="async" onLoad={() => setState('ok')} onError={() => setState('failed')} />
      )}
    </div>
  );
}

/**
 * 選了一區的子地區列（T50 起放在篩選列裡、緊接在地區列下面，比地區列小一號；選到的是淡靛藍底）：「全部」加各子地區，一次選一個。
 * 只有一個子地區（或沒有）時不畫。
 */
/**
 * 子地區列（T50）：書架和照片牆／清單都有（T69：換子地區只換範圍，篩選留著）。counts：有「看什麼」時每個子地區有幾個，「全部」寫整區的；0 個的變虛線、字變淡
 */
export function RegionChips({ areaId, regionId, onPick, counts }: { areaId: string; regionId: string | null; onPick: (region: string | null) => void; counts?: Map<string, number> | null }) {
  const area = useData((s) => s.areas.find((a) => a.id === areaId));
  if (!area || (area.regions?.length ?? 0) <= 1) return null;
  const all = counts?.get(area.id);
  return (
    <ChipScroller className="m-chips fb-chips xa-regions" testId="region-chips" activeKey={regionId}>
      <Chip on={!regionId} onClick={() => onPick(null)} testId="region-all">
        全部
        <ScopeCount n={all} />
      </Chip>
      {area.regions!.map((r) => {
        const n = counts?.get(r.id);
        return (
          <Chip key={r.id} on={regionId === r.id} onClick={() => onPick(r.id)} testId={`region-${r.id}`} className={n === 0 ? 'zero' : undefined}>
            {displayName(r.name, r.id)}
            <ScopeCount n={n} />
          </Chip>
        );
      })}
    </ChipScroller>
  );
}

/**
 * 0 個的時候（T64）：虛線框裡一句「賢島沒有 S、A 級的景點」，下面 2～3 個下一步（放大範圍、放寬條件、問 AI）。
 * 書架的一排、照片牆、清單篩到 0 個都用這個；onApply 換成那組條件和搜尋，onAsk 把問題放進輸入框（不送出）。
 */
export function NextSteps({ help, onApply, onAsk, testId = 'empty-help' }: { help: EmptyHelp; onApply: (filter: Filter, query: string) => void; onAsk: (text: string) => void; testId?: string }) {
  return (
    <div className="xe" data-testid={testId}>
      <p className="xe-msg" data-testid="empty-message">
        {help.message}
      </p>
      {help.steps.length > 0 && (
        <div className="xe-steps">
          {help.steps.map((s) =>
            s.kind === 'ask' ? (
              <button key="ask" type="button" className="xe-step ask" onClick={() => onAsk(s.draft)} data-testid="empty-step" data-kind="ask">
                ✦ {s.label}
              </button>
            ) : (
              <button key={s.kind} type="button" className="xe-step" onClick={() => onApply(s.filter, s.query)} data-testid="empty-step" data-kind={s.kind}>
                {s.label}（{s.count}）›
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** 選了一區：「2 月注意（N）」收合、書架（地區的一句特色只在概覽，T50；子地區列在篩選列裡）。onAsk：0 個那排的「問 AI」 */
export function AreaHome({ areaId, regionId, surface, onOpen, onShelfAll, onAsk }: { areaId: string; regionId: string | null; surface: HomeSurface; onOpen: (id: string) => void; onShelfAll: (filter: Filter) => void; onAsk: (text: string) => void }) {
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const area = areas.find((a) => a.id === areaId);
  const region = area?.regions?.find((r) => r.id === regionId);
  const base = useMemo(() => ({ areas: [areaId], regions: regionId ? [regionId] : [] }), [areaId, regionId]);
  const rows = useMemo(() => shelfRows(places, base, areas), [places, base, areas]);
  const [febOpen, setFebOpen] = useState(false);
  if (!area) return null;
  // 二月注意：選了子地區只看那個子地區的一句
  const feb = region ? (region.intro?.febNote ? [region.intro.febNote] : []) : (area.intro?.february ?? []).map((f) => f.text);
  return (
    <div className={`xa xa-${surface}`} data-testid="area-home" data-area={areaId}>
      {feb.length > 0 && (
        <div className="xa-head">
          <div className={`xa-feb ${febOpen ? 'open' : ''}`}>
            <button type="button" className="xa-feb-toggle" aria-expanded={febOpen} onClick={() => setFebOpen(!febOpen)} data-testid="area-feb">
              2 月注意（{feb.length}）<span aria-hidden>{febOpen ? '▴' : '▾'}</span>
            </button>
            {febOpen && (
              <ul className="xa-feb-list">
                {feb.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {rows.map(({ shelf, tier, filter, note, fallback, items, total }) => (
        <section key={shelf.id} className="xs" data-testid="shelf" data-shelf={shelf.id} data-tier={tier}>
          <header className="xs-head">
            <h3 className="xs-title">
              {shelf.title}
              <span className={`xs-note${fallback ? ' fallback' : ''}`} data-testid="shelf-note" data-fallback={fallback || undefined}>
                {note}
              </span>
            </h3>
            {total > 0 && (
              <button type="button" className="xs-all" onClick={() => onShelfAll(filter)} data-testid="shelf-all">
                全部 {total} ›
              </button>
            )}
          </header>
          {total > 0 ? (
            <div className="xs-row">
              {items.map((p) => (
                <ShelfCard key={p.id} place={p} surface={surface} onOpen={onOpen} caption={shelf.caption?.(p)} />
              ))}
            </div>
          ) : (
            <NextSteps help={shelfEmptyHelp(places, shelf, base, areas)} onApply={(f) => onShelfAll(f)} onAsk={onAsk} testId="shelf-empty" />
          )}
        </section>
      ))}
    </div>
  );
}

/** 書架的小卡：照片、名稱、等級；右上角類型圓章（T50 拿掉愛心，愛心留在照片牆、清單、詳情）。想去的書架（T53）在名稱下面多一行 caption（「2/7 候選」） */
export function ShelfCard({ place, surface, onOpen, caption }: { place: Place; surface: HomeSurface; onOpen: (id: string) => void; caption?: ReactNode }) {
  return (
    <div
      className={`xs-card type-${place.type}`}
      role="button"
      tabIndex={0}
      aria-label={placeName(place)}
      data-testid="shelf-card"
      data-id={place.id}
      onClick={() => onOpen(place.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onOpen(place.id);
      }}
      {...hoverProps(surface, place.id)}
    >
      <div className="xs-photo">
        <Photo place={place} width={240} />
        <span className="xs-seal" data-testid="shelf-seal">
          <TypeSeal type={place.type} size="lg" label />
        </span>
      </div>
      <div className="xs-name">
        <span className="xs-name-text">{placeName(place)}</span>
        <TierMark tier={place.tier} />
      </div>
      {caption && (
        <div className="xs-caption" data-testid="shelf-caption">
          {caption}
        </div>
      )}
    </div>
  );
}

/**
 * 「● 2 月注意 N 則 ›」一行灰字加紅點，收合，點了展開全部（T76，§35.4、35.6）：概覽卡、地區頁都用；沒有就不畫
 */
export function FebNote({ items, testId = 'area-feb' }: { items: string[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className={`feb-note${open ? ' open' : ''}`} data-testid={testId}>
      <button type="button" className="feb-toggle" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={`${testId}-toggle`}>
        <i className="feb-dot" aria-hidden />2 月注意 {items.length} 則
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <ul className="feb-list">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface AreaThemeHomeProps {
  areaId: string;
  regionId: string | null;
  /** 目前的主題（主題列選的） */
  theme: Theme;
  /** 目前的篩選（areas、regions 是這一區；types 會換成 theme） */
  filter: Filter;
  /** 搜尋（地區頁通常沒有；有搜尋時是清單層） */
  query?: string;
  /** 只看地圖畫面裡的（網頁） */
  bounds?: Bbox | null;
  surface: HomeSurface;
  /** 展開的區段（呼叫的畫面記，換主題、換子地區時清掉，換區帶著） */
  openIds: readonly string[];
  onToggle: (sectionId: string) => void;
  /** 開詳情（手機：整頁；網頁：預設的列點了也開詳情，要原地展開就給 renderRow） */
  onOpen: (id: string) => void;
  /** 0 個的下一步：看全區、清除篩選換成那組條件；問 AI 放進輸入框 */
  onApply: (filter: Filter, query: string) => void;
  onAsk: (text: string) => void;
  /** 最下面兩行小字：「問 AI 幫我挑」「找不到？自己加一個」 */
  onAskAi?: () => void;
  onAdd?: () => void;
  /** 一列怎麼畫（網頁：原地展開、地圖的指到）；沒給是 PlaceRow 點了開詳情 */
  renderRow?: (place: Place, index: number) => ReactNode;
  /** 捲動容器（分批畫的觀察點用）：手機 '.m-page'、網頁 '.side-body' */
  scroller: string;
  /** 區段裡至少畫到第幾個（地圖點到的點要捲到它）：區段 ID → 個數 */
  minShown?: Partial<Record<string, number>>;
}

/**
 * 選了一區（T76，§35.4）：「2 月注意」一行收合（選了子地區不畫）＋目前主題的區段（預設全部收合，可以同時展開多個），
 * 最下面「問 AI 幫我挑」「找不到？自己加一個」。整個主題 0 個（子地區沒有住宿）時只畫一個虛線框。
 * 條件列（FilterConds）由呼叫的畫面放在這個上面。區段的數字：沒篩選是真實總數，有篩選是符合的數（lib/shelves.ts 的 sectionCounts）
 */
export function AreaThemeHome({ areaId, regionId, theme, filter, query = '', bounds = null, surface, openIds, onToggle, onOpen, onApply, onAsk, onAskAi, onAdd, renderRow, scroller, minShown }: AreaThemeHomeProps) {
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const statusOf = useDayStatus();
  const area = areas.find((a) => a.id === areaId);
  const region = area?.regions?.find((r) => r.id === regionId);
  const scoped = useMemo<Filter>(() => ({ ...filter, areas: [areaId], regions: regionId ? [regionId] : [], types: [theme] }), [filter, areaId, regionId, theme]);
  const opts = useMemo(() => ({ query, bounds }), [query, bounds]);
  const counts = useMemo(() => sectionCounts(places, theme, scoped, opts), [places, theme, scoped, opts]);
  const total = useMemo(() => themeCounts(places, scoped)[theme], [places, scoped, theme]);
  if (!area) return null;
  const feb = region ? [] : (area.intro?.february ?? []).map((f) => f.text);
  const row = renderRow ?? ((p: Place, i: number) => <PlaceRow place={p} rank={i + 1} status={statusOf(p.id)} onOpen={() => onOpen(p.id)} testId={surface === 'mobile' ? 'm-feed-item' : 'ex-item'} />);
  return (
    <div className={`xa xa-${surface} xa-v2`} data-testid="area-home" data-area={areaId} data-theme={theme}>
      <FebNote items={feb} />
      {total === 0 ? (
        <NextSteps help={sectionEmptyHelp(places, scoped, areas, undefined, query)} onApply={onApply} onAsk={onAsk} testId="theme-empty" />
      ) : (
        counts.sections.map(({ section, count }) => {
          const open = openIds.includes(section.id);
          return (
            <Section key={section.id} head={section} kind={theme} count={count} open={open} onToggle={() => onToggle(section.id)}>
              {open && <SectionBody section={section} count={count} places={places} filter={scoped} query={query} bounds={bounds} areas={areas} onApply={onApply} onAsk={onAsk} row={row} scroller={scroller} minShown={minShown?.[section.id]} />}
            </Section>
          );
        })
      )}
      {(onAskAi || onAdd) && (
        <div className="xa-foot">
          {onAskAi && (
            <button type="button" className="xa-foot-link" onClick={onAskAi} data-testid="area-ask-ai">
              <Icon name="spark" size={16} /> 問 AI 幫我挑
            </button>
          )}
          {onAdd && (
            <button type="button" className="xa-foot-link" onClick={onAdd} data-testid="area-add-place">
              <Icon name="plus" size={16} /> 找不到？自己加一個
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 展開的區段的內容：列（分批）或 0 個的虛線框和下一步 */
function SectionBody({ section, count, places, filter, query, bounds, areas, onApply, onAsk, row, scroller, minShown }: { section: (typeof SECTIONS)[Theme][number]; count: number; places: Place[]; filter: Filter; query: string; bounds: Bbox | null; areas: Area[]; onApply: (filter: Filter, query: string) => void; onAsk: (text: string) => void; row: (place: Place, index: number) => ReactNode; scroller: string; minShown?: number }) {
  const items = useMemo(() => (count ? sectionPlaces(places, section, filter, { query, bounds }) : []), [count, places, section, filter, query, bounds]);
  if (!items.length) return <NextSteps help={sectionEmptyHelp(places, filter, areas, section, query)} onApply={onApply} onAsk={onAsk} testId="section-empty" />;
  return <SectionRows items={items} render={row} scroller={scroller} resetOn={[filter, query, bounds]} minShown={minShown} />;
}
