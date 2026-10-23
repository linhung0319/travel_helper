// 電腦版右側的「探索」分頁：原本的篩選和圖片牆合併成一份清單。
// 餐廳／住宿／景點是最上層的分頁（一直黏在上面）；底下是地區、常用篩選、「更多篩選」。
// 往下捲時篩選收合成一列摘要（例如「鳥羽・S 級」），點了在原地展開。
// 清單可以切換大照片（像 IG）或只有文字；滑鼠移上去地圖上的點會閃，點了地圖移過去、打開詳情。
// 反過來，點地圖上的點：切到探索、捲到那張卡片（showInExplore），再點卡片才開詳情（手機沒有 hover，所以用點的）。
// 探索的類型寫在篩選裡（地圖跟著變淡），回到「行程」時拿掉（showItinerary）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, useShared } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { CONTEXT_LABELS, EMPTY_FILTER, TYPE_LABELS, VOTE_FILTER_LABELS, filterChips, isFilterEmpty, matchesFilter, type FilterKey } from '../lib/filter.ts';
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, EXPLORE_TYPES, explorePlaces, typeCounts, type ExploreSort, type ExploreType } from '../lib/explore.ts';
import { placeBadges } from '../lib/badges.ts';
import { voteCounts } from '../sharedStore.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { TYPE_COLORS, TYPE_ICONS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { Photo } from './Photo.tsx';
import { TierBadge } from './TierBadge.tsx';
import { WallVote } from './Votes.tsx';
import { FilterPanel } from './FilterPanel.tsx';
import { dragPlaceProps } from './askAi.ts';

type View = 'photo' | 'list';
const VIEW_KEY = 'travel-helper:exploreView';

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'photo';
  } catch {
    return 'photo';
  }
}

function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // 私密視窗等存不了：只是下次回到預設
  }
}

/** 每一類常用的篩選（其他在「更多篩選」） */
const QUICK: Record<ExploreType, { key: FilterKey; value: string; label: string }[]> = {
  restaurant: [
    { key: 'contexts', value: 'lunch', label: CONTEXT_LABELS.lunch },
    { key: 'contexts', value: 'dinner', label: CONTEXT_LABELS.dinner },
    { key: 'fit15', value: 'yes', label: '可坐 15 人' },
    { key: 'votes', value: 'popular', label: VOTE_FILTER_LABELS.popular },
    { key: 'tiers', value: 'S', label: 'S 級' },
  ],
  lodging: [
    { key: 'votes', value: 'popular', label: VOTE_FILTER_LABELS.popular },
    { key: 'tiers', value: 'S', label: 'S 級' },
    { key: 'tiers', value: 'A', label: 'A 級' },
  ],
  spot: [
    { key: 'votes', value: 'popular', label: VOTE_FILTER_LABELS.popular },
    { key: 'tiers', value: 'S', label: 'S 級' },
    { key: 'tiers', value: 'A', label: 'A 級' },
  ],
};

function open(id: string) {
  commands.focus(id);
  appStore.getState().openDetail(id);
}

function Meta({ place }: { place: Place }) {
  const areas = useData((s) => s.areas);
  const days = useData((s) => s.days);
  const r = (place.raw.ratings ?? {}) as Record<string, unknown>;
  const region = areas.find((a) => a.id === place.area)?.regions?.find((x) => x.id === place.region);
  const parts: string[] = [];
  if (typeof r.google === 'number') parts.push(`★ ${r.google}${typeof r.googleReviews === 'number' ? `（${r.googleReviews.toLocaleString('ja-JP')}）` : ''}`);
  if (typeof r.tabelog === 'number') parts.push(`食べログ ${r.tabelog}`);
  if (region) parts.push(displayName(region.name));
  const inTrip = days.get(place.id);
  return (
    <span className="ex-meta small">
      {parts.join('・')}
      {inTrip?.length ? <span className="ex-trip">📅 {inTrip.map((d) => shortDayLabel(d.date)).join('、')}</span> : null}
    </span>
  );
}

function Badges({ place }: { place: Place }) {
  const list = placeBadges(place, 3);
  if (!list.length) return null;
  return (
    <span className="badges">
      {list.map((b) => (
        <span key={b.label} className={`badge badge-${b.tone}`}>
          {b.label}
        </span>
      ))}
    </span>
  );
}

function TypeTag({ place }: { place: Place }) {
  return (
    <span className="ex-type" style={{ background: TYPE_COLORS[place.type] }}>
      {TYPE_ICONS[place.type]} {TYPE_LABELS[place.type]}
    </span>
  );
}

function Item({ place, rank, view, hot }: { place: Place; rank: number; view: View; hot: boolean }) {
  const name = place.name.zh || place.name.ja;
  const common = {
    type: 'button' as const,
    'data-id': place.id,
    'data-testid': 'explore-item',
    onMouseEnter: () => appStore.getState().hover(place.id),
    onMouseLeave: () => appStore.getState().hover(null),
    onClick: () => open(place.id),
    // 拖到左邊的聊天室＝問 AI
    ...dragPlaceProps(place.id),
    title: '點了看詳情；拖到左邊的聊天室可以問 AI',
  };
  if (view === 'list') {
    return (
      <li>
        <button {...common} className={`ex-row ${hot ? 'flash' : ''}`}>
          <span className="ex-rank">{rank}</span>
          <span className="ex-dot" style={{ background: TYPE_COLORS[place.type] }} aria-hidden>
            {TYPE_ICONS[place.type]}
          </span>
          <span className="ex-text">
            <span className="ex-name">
              <TierBadge tier={place.tier} />
              {name}
            </span>
            <Meta place={place} />
          </span>
          <WallVote placeId={place.id} />
        </button>
      </li>
    );
  }
  return (
    <li>
      <button {...common} className={`ex-card ${hot ? 'flash' : ''}`}>
        <span className="ex-photo">
          <Photo place={place} width={600} />
          <TypeTag place={place} />
          <span className="ex-rank-badge">{rank}</span>
        </span>
        <span className="ex-text">
          <span className="ex-name">
            <TierBadge tier={place.tier} />
            {name}
            {place.name.zh && place.name.ja !== place.name.zh && <span className="muted small ex-ja">{place.name.ja}</span>}
          </span>
          <Meta place={place} />
          {place.summary && <span className="ex-summary small">{place.summary.text}</span>}
          <Badges place={place} />
        </span>
        <WallVote placeId={place.id} />
      </button>
    </li>
  );
}

export function ExplorePanel() {
  const filter = useApp((s) => s.filter);
  const bounds = useApp((s) => s.view?.bounds ?? null);
  const hoveredId = useApp((s) => s.hoveredId);
  const target = useApp((s) => s.exploreTarget);
  const places = useData((s) => s.places);
  const areas = useData((s) => s.areas);
  const votes = useShared((s) => s.votes);
  const [view, setView] = useState<View>(loadView);
  const [sort, setSort] = useState<ExploreSort>('recommend');
  const [inView, setInView] = useState(false);
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLOListElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  // 篩選整個捲到上方那列底下時收合；捲回最上面時展開（收合時打開的下拉也關掉）
  useEffect(() => {
    const scroller = headRef.current?.closest('.side-body');
    if (!scroller) return;
    const check = () => {
      const head = headRef.current?.getBoundingClientRect();
      const mark = sentinelRef.current?.getBoundingClientRect();
      if (!head || !mark) return;
      const c = mark.top < head.bottom;
      setCollapsed(c);
      if (!c) setOpen(false);
    };
    check();
    scroller.addEventListener('scroll', check, { passive: true });
    return () => scroller.removeEventListener('scroll', check);
  }, []);

  // 類型一次看一種；從別處帶來的篩選沒有指定（或指定好幾種）時，先看餐廳
  const type: ExploreType = filter.types.length === 1 && (EXPLORE_TYPES as readonly string[]).includes(filter.types[0]) ? (filter.types[0] as ExploreType) : 'restaurant';
  useEffect(() => {
    if (filter.types.length !== 1 || filter.types[0] !== type) appStore.getState().setFilter({ types: [type] });
  }, [filter.types, type]);

  const likes = useMemo(() => {
    const c = voteCounts(votes);
    return (id: string) => c.get(id)?.like ?? 0;
  }, [votes]);
  const area = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  const list = useMemo(() => explorePlaces(places, filter, inView ? bounds : null, sort, likes), [places, filter, inView, bounds, sort, likes]);
  const counts = useMemo(() => typeCounts(places, filter, inView ? bounds : null), [places, filter, inView, bounds]);

  // 地圖上點了某個點：清單直接跳到那張卡片（清單可能很長，平滑捲動會在半路被照片載入打斷）
  useEffect(() => {
    if (!target) return;
    ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: 'center' });
  }, [target]);

  const pickArea = (id: string | null) => {
    const s = appStore.getState();
    s.setFilter({ areas: id ? [id] : [], regions: [] });
    if (id) commands.focus({ area: id });
  };
  const quickOn = (q: { key: FilterKey; value: string }) => (filter[q.key] as string[]).includes(q.value);
  // 「更多篩選」的 ●：只算外面那排標籤沒有的條件
  const extra = { ...filter, areas: [], regions: [], types: [] };
  for (const q of QUICK[type]) (extra[q.key] as string[]) = (extra[q.key] as string[]).filter((v) => v !== q.value);

  // 往下捲到篩選都看不到時，上方只留類型和一列摘要；點摘要展開篩選
  const toggleQuick = (q: { key: FilterKey; value: string }) => appStore.getState().toggleFilter(q.key, q.value);
  const summary = [...filterChips(filter, areas).filter((c) => c.key !== 'types').map((c) => c.label), ...(inView ? ['地圖畫面裡'] : [])];
  const controls = (
    <>
      <div className="ex-areas" role="group" aria-label="地區">
        <button type="button" className={`pill ${filter.areas.length === 0 ? 'on' : ''}`} onClick={() => pickArea(null)}>
          全部地區
        </button>
        {areas.map((a) => (
          <button key={a.id} type="button" className={`pill ${area?.id === a.id ? 'on' : ''}`} onClick={() => pickArea(a.id)} data-area={a.id}>
            {displayName(a.name, a.id)}
          </button>
        ))}
      </div>
      {area?.regions?.length ? (
        <div className="ex-regions" role="group" aria-label="小區域">
          {area.regions.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`pill small-pill ${filter.regions.includes(r.id) ? 'on' : ''}`}
              aria-pressed={filter.regions.includes(r.id)}
              onClick={() => {
                appStore.getState().toggleFilter('regions', r.id);
                commands.focus({ region: r.id });
              }}
            >
              {displayName(r.name, r.id)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ex-quick">
        {QUICK[type].map((q) => (
          <button key={`${q.key}:${q.value}`} type="button" className={`pill small-pill ${quickOn(q) ? 'on' : ''}`} aria-pressed={quickOn(q)} onClick={() => toggleQuick(q)}>
            {q.label}
          </button>
        ))}
        <button type="button" className={`pill small-pill ${inView ? 'on' : ''}`} aria-pressed={inView} onClick={() => setInView(!inView)} data-testid="ex-inview">
          只列地圖畫面裡的
        </button>
        <button type="button" className={`pill small-pill ${more ? 'on' : ''}`} aria-expanded={more} onClick={() => setMore(!more)} data-testid="filter-button">
          ⚙ 更多篩選{!isFilterEmpty(extra) ? ' ●' : ''}
        </button>
      </div>
      {more && <FilterPanel embedded onClose={() => setMore(false)} />}
    </>
  );
  const bar = (
    <>
      <span className="muted ex-count">{list.length} 個</span>
      <select value={sort} onChange={(e) => setSort(e.target.value as ExploreSort)} aria-label="排序">
        {EXPLORE_SORTS.map((s) => (
          <option key={s} value={s}>
            依{EXPLORE_SORT_LABELS[s]}
          </option>
        ))}
      </select>
      <span className="segmented ex-view" role="group" aria-label="顯示方式">
        <button
          type="button"
          aria-pressed={view === 'photo'}
          title="大照片"
          onClick={() => {
            setView('photo');
            saveView('photo');
          }}
        >
          🖼
        </button>
        <button
          type="button"
          aria-pressed={view === 'list'}
          title="只有文字"
          onClick={() => {
            setView('list');
            saveView('list');
          }}
        >
          ☰
        </button>
      </span>
    </>
  );

  return (
    <div className="explore-panel" data-testid="explore-panel">
      {/* 黏在上面：餐廳／住宿／景點；收合時下面多一列摘要（疊在清單上，不推動清單） */}
      <div className="ex-head" ref={headRef}>
        <div className="segmented big ex-types" role="tablist" aria-label="類型">
          {EXPLORE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === type}
              aria-pressed={t === type}
              onClick={() => appStore.getState().setFilter({ types: [t], contexts: t === 'restaurant' ? filter.contexts : [], fit15: t === 'restaurant' ? filter.fit15 : [] })}
              data-type={t}
            >
              {TYPE_ICONS[t]} {TYPE_LABELS[t]} <span className="pill-count">{counts[t]}</span>
            </button>
          ))}
        </div>
        {collapsed && (
          <div className="ex-compact">
            <div className="ex-bar small">
              <button type="button" className={`ex-filtersum ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="ex-summary">
                <span className="ex-filtersum-icon">⚙</span>
                <span className="ex-filtersum-text">{summary.length ? summary.join('・') : '全部地區'}</span>
                <span aria-hidden>{open ? '▴' : '▾'}</span>
              </button>
              {bar}
            </div>
            {open && <div className="ex-drop">{controls}</div>}
          </div>
        )}
      </div>
      <div className="ex-controls">{controls}</div>
      <div className="ex-bar small">{bar}</div>
      <div ref={sentinelRef} aria-hidden />
      <ol className={`ex-list view-${view}`} ref={ref}>
        {list.map((p, i) => (
          <Item key={p.id} place={p} rank={i + 1} view={view} hot={hoveredId === p.id || target?.id === p.id} />
        ))}
        {list.length === 0 && <li className="muted ex-empty">沒有符合的地點，取消一些篩選看看。</li>}
      </ol>
    </div>
  );
}


/**
 * 電腦版點了地圖上的點：右側切到探索、換成那一類、捲到那張卡片，點會閃。
 * 目前的篩選看不到它時，改成只篩那一類和那個地區。車站不在探索裡，直接開詳情。
 */
export function showInExplore(id: string) {
  const s = appStore.getState();
  const p = dataStore.getState().byId.get(id);
  if (!p) return;
  s.openPreview(null);
  if (!(EXPLORE_TYPES as readonly string[]).includes(p.type)) {
    s.openDetail(id);
    return;
  }
  s.closeDetail();
  s.setMode('explore');
  const keep = { ...s.filter, types: [p.type] };
  s.setFilter(matchesFilter(p, keep) ? keep : { ...EMPTY_FILTER, types: [p.type], areas: p.area ? [p.area] : [] });
  s.hover(id);
  s.revealInExplore(id);
}

/** 右側切回「行程」：關掉詳情；從探索切回來時拿掉探索加上的類型 */
export function showItinerary() {
  const s = appStore.getState();
  const leaving = s.mode === 'explore';
  s.closeDetail();
  s.setMode('map');
  if (leaving && s.filter.types.length) s.setFilter({ types: [] });
}
