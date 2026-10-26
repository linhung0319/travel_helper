// 電腦版右側的「探索」分頁：最上面是篩選列（shared/ui/FilterBar：搜尋、篩選、排序、照片牆／清單，套用的條件變成小晶片），一直黏在上面；
// 「篩選」打開的抽屜蓋住整個右欄（FilterSheet），類型、地區、團體、情境、想去、等級、只看地圖畫面裡的都在裡面。
// 清單可以切換大照片（像 IG）或只有文字；滑鼠移上去地圖上的點會閃，點了地圖移過去、打開詳情。
// 反過來，點地圖上的點：切到探索、捲到那張卡片（showInExplore），再點卡片才開詳情（手機沒有 hover，所以用點的）。
// 探索的類型寫在篩選裡（地圖跟著變淡），回到「行程」時拿掉（showItinerary）。
// 「想去」分頁是同一個元件（source="wish"）：只列有人按想去的點，卡片底下多了留言（Wishlist.tsx 的 WishExtras）；只有想去的卡片有「加到某天」（探索只有愛心，流程是先按想去再到想去加到某天）。
// 卡片照片右上角是想去的愛心（VoteHeart），左上角是類型和行程狀態（候選、已排）的 tag。
// 清單的計算（篩選、排序、數量、想去的範圍）在 shared/placeLists.ts 的 usePlaceList，手機版也用。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { shared } from '../appShared.ts';
import { likedPlaces } from '../lib/wishlist.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { EMPTY_FILTER, matchesFilter, matchesQuery, type FilterKey } from '../lib/filter.ts';
import { EXPLORE_TYPES, type ExploreSort } from '../lib/explore.ts';
import { placeBadges } from '../lib/badges.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { TYPE_COLORS, TYPE_ICON_NAMES } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { Photo } from './Photo.tsx';
import { CopyName } from './CopyName.tsx';
import { TierMark } from '../shared/ui/TierMark.tsx';
import { TypeLabel } from '../shared/ui/TypeLabel.tsx';
import { VoteHeart } from '../shared/ui/VoteHeart.tsx';
import { Icon } from './Icon.tsx';
import { DayStatusTag } from './DayPicker.tsx';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { dragPlaceProps } from './askAi.ts';
import { WishExtras } from './Wishlist.tsx';
import { usePlaceList } from '../shared/placeLists.ts';

export type ListSource = 'explore' | 'wish';

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
      {inTrip?.length ? <span className="ex-trip ic-text">
          <Icon name="calendar" size={16} /> {inTrip.map((d) => shortDayLabel(d.date)).join('、')}
        </span> : null}
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
  return <TypeLabel type={place.type} onPhoto />;
}

function Item({ place, rank, view, hot, source }: { place: Place; rank: number; view: View; hot: boolean; source: ListSource }) {
  const name = place.name.zh || place.name.ja;
  const wish = source === 'wish';
  const common = {
    type: 'button' as const,
    'data-id': place.id,
    'data-testid': wish ? 'wish-open' : 'explore-item',
    onMouseEnter: () => appStore.getState().hover(place.id),
    onMouseLeave: () => appStore.getState().hover(null),
    onClick: () => open(place.id),
    // 拖到左邊的聊天室＝問 AI
    ...dragPlaceProps(place.id),
    title: '點了看詳情；拖到左邊的聊天室可以問 AI',
  };
  const li = (body: ReactNode) =>
    wish ? (
      <li className={`wish-card view-${view} type-${place.type} ${hot ? 'flash' : ''}`} data-testid="wish-item" data-id={place.id}>
        {body}
        <WishExtras placeId={place.id} />
      </li>
    ) : (
      <li>{body}</li>
    );
  if (view === 'list') {
    return li(
        <button {...common} className={`ex-row type-${place.type} ${hot ? 'flash' : ''}`}>
          <span className="ex-rank">{rank}</span>
          <span className="ex-dot" style={{ background: TYPE_COLORS[place.type] }} aria-hidden>
            <Icon name={TYPE_ICON_NAMES[place.type]} size={16} />
          </span>
          <span className="ex-text">
            <span className="ex-name">
              <TierMark tier={place.tier} />
              {name}
              <CopyName place={place} />
              <VoteHeart placeId={place.id} size="sm" />
              <DayStatusTag placeId={place.id} />
            </span>
            <Meta place={place} />
          </span>
        </button>,
    );
  }
  return li(
      <button {...common} className={`ex-card type-${place.type} ${hot ? 'flash' : ''}`}>
        <span className="ex-photo">
          <Photo place={place} width={600} />
          <span className="ex-tags">
            <TypeTag place={place} />
            <DayStatusTag placeId={place.id} />
          </span>
          <VoteHeart placeId={place.id} />
          <span className="ex-rank-badge">{rank}</span>
        </span>
        <span className="ex-text">
          <span className="ex-name">
            <TierMark tier={place.tier} />
            {name}
            <CopyName place={place} />
            {place.name.zh && place.name.ja !== place.name.zh && <span className="muted small ex-ja">{place.name.ja}</span>}
          </span>
          <Meta place={place} />
          {place.summary && <span className="ex-summary small">{place.summary.text}</span>}
          <Badges place={place} />
        </span>
      </button>,
  );
}

/** 面板裡點一個選項：地區一次一個（選了地圖跳過去，小區域也是），其他是開關 */
function pickOption(key: FilterKey, value: string) {
  const s = appStore.getState();
  if (key === 'areas') {
    const on = s.filter.areas.includes(value);
    s.setFilter({ areas: on ? [] : [value], regions: [] });
    if (!on) commands.focus({ area: value });
    return;
  }
  const was = (s.filter[key] as string[]).includes(value);
  s.toggleFilter(key, value);
  if (key === 'regions' && !was) commands.focus({ region: value });
}

export function ExplorePanel({ source = 'explore' }: { source?: ListSource }) {
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);
  const bounds = useApp((s) => s.view?.bounds ?? null);
  const hoveredId = useApp((s) => s.hoveredId);
  const target = useApp((s) => s.exploreTarget);
  const [view, setView] = useState<View>(loadView);
  // 想去預設依 ❤️ 多排
  const [sort, setSort] = useState<ExploreSort>(source === 'wish' ? 'likes' : 'recommend');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLOListElement>(null);

  // 清單的計算在 shared/placeLists.ts（手機版也用）；沒選類型就是三類都列
  const { pool, list } = usePlaceList(source, filter, query, sort, inView ? bounds : null);

  // 地圖上點了某個點：清單直接跳到那張卡片（清單可能很長，平滑捲動會在半路被照片載入打斷）
  useEffect(() => {
    if (!target) return;
    ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: 'center' });
  }, [target]);

  const model: FilterModel = {
    filter,
    query,
    setQuery: (q) => appStore.getState().setQuery(q),
    sort,
    setSort,
    view,
    setView: (v) => {
      setView(v);
      saveView(v);
    },
    inView,
    setInView,
    pick: pickOption,
    clear: () => {
      appStore.getState().clearFilter();
      setInView(false);
    },
  };

  return (
    <div className={`explore-panel source-${source}`} data-testid={source === 'wish' ? 'wish-panel' : 'explore-panel'}>
      <FilterBar source={source} surface="desktop" model={model} count={list.length} />
      <ol className={`ex-list view-${view}`} ref={ref}>
        {list.map((p, i) => (
          <Item key={p.id} place={p} rank={i + 1} view={view} hot={hoveredId === p.id || target?.id === p.id} source={source} />
        ))}
        {list.length === 0 && (
          <li className="muted ex-empty">{source === 'wish' && pool.length === 0 ? '還沒有人按想去。在探索或詳情按想去，就會出現在這裡。' : '沒有符合的地點，取消一些篩選看看。'}</li>
        )}
      </ol>
    </div>
  );
}


/**
 * 電腦版點了地圖上的點：右側切到探索（在想去分頁、而且這個點有人 ❤️ 時留在想去）、換成那一類、捲到那張卡片，點會閃。
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
  s.setMode(s.mode === 'wish' && likedPlaces(shared.store.getState().votes).has(id) ? 'wish' : 'explore');
  const keep = { ...s.filter, types: [p.type] };
  s.setFilter(matchesFilter(p, keep) ? keep : { ...EMPTY_FILTER, types: [p.type], areas: p.area ? [p.area] : [] });
  if (!matchesQuery(p, s.query)) s.setQuery('');
  s.hover(id);
  s.revealInExplore(id);
}

/** 右側切回「行程」：關掉詳情；從探索、想去切回來時拿掉探索加上的類型 */
export function showItinerary() {
  const s = appStore.getState();
  const leaving = s.mode === 'explore' || s.mode === 'wish';
  s.closeDetail();
  s.setMode('map');
  if (leaving && s.filter.types.length) s.setFilter({ types: [] });
}
