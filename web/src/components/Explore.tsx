// 電腦版右側的「探索」分頁：最上面是篩選列（shared/ui/FilterBar：搜尋、篩選、排序、照片牆／清單，套用的條件變成小晶片），一直黏在上面；
// 「篩選」打開的抽屜蓋住整個右欄（FilterSheet），類型、地區、團體、情境、想去、等級、只看地圖畫面裡的都在裡面。
// 清單可以切換照片牆（兩欄，PlaceTile）或清單列（PlaceRow，88px），都是兩邊共用的元件；滑鼠移上去呼叫 appStore.hover（地圖的指到），點了地圖移過去、打開詳情。
// 反過來，點地圖上的點：切到探索、捲到那張卡片（showInExplore），再點卡片才開詳情（手機沒有 hover，所以用點的）。
// 探索的類型寫在篩選裡（地圖跟著變淡），回到「行程」時拿掉（showItinerary）。
// 「想去」分頁是同一個元件（source="wish"）：只列有人按想去的點，清單換成 shared/ui/WishList（分成還沒排、已是候選、已排三段，列右邊有 ❤ 和日曆鈕「加到某天」）；
// 探索只有愛心，流程是先按想去再到想去加到某天。想去的顯示方式（清單、照片牆）記在 mobileStore.wish.view，和探索各自記。
// 卡片照片右下角是想去的愛心（VoteHeart），左上角是類型；重點膠囊（已排、候選、15 人、預約）在名稱下面。探索的照片牆是兩欄。
// 清單的計算（篩選、排序、數量、想去的範圍）在 shared/placeLists.ts 的 usePlaceList，手機版也用。

import { useEffect, useRef, useState } from 'react';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { shared } from '../appShared.ts';
import { likedPlaces } from '../lib/wishlist.ts';
import { commands } from '../appCommands.ts';
import { useApp } from '../hooks.ts';
import { EMPTY_FILTER, matchesFilter, matchesQuery, type FilterKey } from '../lib/filter.ts';
import { EXPLORE_TYPES, type ExploreSort } from '../lib/explore.ts';
import type { Place } from '../data/types.ts';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { dragPlaceProps } from './askAi.ts';
import { usePlaceList } from '../shared/placeLists.ts';
import { PlaceRow, useDayStatus, type DayStatus } from '../shared/ui/PlaceRow.tsx';
import { PlaceTile } from '../shared/ui/PlaceTile.tsx';
import { PlaceWall } from '../shared/ui/PlaceWall.tsx';
import { WishList } from '../shared/ui/WishList.tsx';
import { mobileStore, useMobile } from '../mobile/mobileStore.ts';

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

/** 探索的一張卡片（照片牆）或一列（清單）；想去分頁的列在 shared/ui/WishList */
function Item({ place, rank, view, hot, status }: { place: Place; rank: number; view: View; hot: boolean; status: DayStatus }) {
  const props = {
    place,
    status,
    rank,
    hot,
    testId: 'explore-item',
    onOpen: () => open(place.id),
    // 拖到左邊的聊天室＝問 AI
    rootProps: { ...dragPlaceProps(place.id), title: '點了看詳情；拖到左邊的聊天室可以問 AI' },
  };
  return view === 'list' ? <PlaceRow {...props} /> : <PlaceTile {...props} />;
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
  const [exploreView, setExploreView] = useState<View>(loadView);
  const wishView = useMobile((s) => s.wish.view);
  const wish = source === 'wish';
  // 探索、想去各自記住上次的顯示方式
  const view: View = wish ? wishView : exploreView;
  // 想去預設依 ❤️ 多排
  const [sort, setSort] = useState<ExploreSort>(source === 'wish' ? 'likes' : 'recommend');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const statusOf = useDayStatus();

  // 清單的計算在 shared/placeLists.ts（手機版也用）；沒選類型就是三類都列
  const { pool, list } = usePlaceList(source, filter, query, sort, inView ? bounds : null);

  // 地圖上點了某個點：清單直接跳到那張卡片（清單可能很長，平滑捲動會在半路被照片載入打斷）
  useEffect(() => {
    if (!target) return;
    // 想去的清單要先把它那段展開、多顯示到它（WishList 的 revealId），等畫完再捲
    const id = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const model: FilterModel = {
    filter,
    query,
    setQuery: (q) => appStore.getState().setQuery(q),
    sort,
    setSort,
    view,
    setView: (v) => {
      if (wish) {
        mobileStore.getState().setWish({ view: v });
        return;
      }
      setExploreView(v);
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
      <div className={`ex-list view-${view} source-${source}`} ref={ref}>
        {wish ? (
          <WishList
            surface="desktop"
            places={list}
            view={view}
            onOpen={open}
            // 詳情的留言分頁在 Task 7 才有；現在先開詳情
            onOpenComments={open}
            hotId={hoveredId ?? target?.id ?? null}
            revealId={target?.id ?? null}
            revealSeq={target?.seq}
          />
        ) : view === 'photo' ? (
          <PlaceWall items={list} render={(p, i) => <Item place={p} rank={i + 1} view={view} hot={hoveredId === p.id || target?.id === p.id} status={statusOf(p.id)} />} />
        ) : (
          <ol className="ex-items">
            {list.map((p, i) => (
              <li key={p.id}>
                <Item place={p} rank={i + 1} view={view} hot={hoveredId === p.id || target?.id === p.id} status={statusOf(p.id)} />
              </li>
            ))}
          </ol>
        )}
        {list.length === 0 && (
          <p className="muted ex-empty">{source === 'wish' && pool.length === 0 ? '還沒有人按想去。在探索或詳情按想去，就會出現在這裡。' : '沒有符合的地點，取消一些篩選看看。'}</p>
        )}
      </div>
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
