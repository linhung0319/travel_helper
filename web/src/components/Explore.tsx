// 電腦版右側的「探索」分頁：最上面是篩選列（shared/ui/FilterBar：搜尋、篩選、排序、照片牆／清單，套用的條件變成小晶片），一直黏在上面；
// 「篩選」打開的抽屜蓋住整個右欄（FilterSheet），類型、地區、團體、情境、想去、等級、只看地圖畫面裡的都在裡面。
// 清單可以切換照片牆（兩欄，PlaceTile）或清單列（PlaceRow，88px），都是兩邊共用的元件；滑鼠移上去呼叫 appStore.hover（地圖的指到），
// 點了原地展開（第八輪 §13.3：照片牆橫跨兩欄、清單在原地，介紹、優缺點、「詳細資料 ›」）並選中（地圖的水滴），再點一次收起；按「詳細資料」才開詳情。想去一樣。
// 反過來，在探索、想去分頁點地圖上的點（mapPick.ts）：詳情彈窗蓋住整個右欄，不再捲到卡片（第八輪 §13.3）；revealInExplore（AI、測試用）才捲到那張卡。
// 清單標出的卡：選中的點、和滑鼠在地圖上指到的點（卡片自己被指到時不回頭標自己）。
// 「想去」分頁是同一個元件（source="wish"）：只列有人按想去的點，清單換成 shared/ui/WishList（分成還沒排、已是候選、已排三段，列右邊有 ❤ 和日曆鈕「加到某天」）；
// 探索只有愛心，流程是先按想去再到想去加到某天。想去的顯示方式（清單、照片牆）記在 shared/wishPrefs.ts（手機也用），和探索各自記。
// 篩選、搜尋：探索、想去各自一份（appStore.filter／query 是現在這頁的，另一頁的收在 filterStash，第七輪最終 review #3）。
// 卡片照片右下角是想去的愛心（VoteHeart），左上角是類型；重點膠囊（已排、候選、15 人、預約）在名稱下面。探索的照片牆是兩欄。
// 清單的計算（篩選、排序、數量、想去的範圍）在 shared/placeLists.ts 的 usePlaceList，手機版也用。

import { useEffect, useRef, useState } from 'react';
import { appStore, type DetailTabId } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp } from '../hooks.ts';
import type { FilterKey } from '../lib/filter.ts';
import type { ExploreSort } from '../lib/explore.ts';
import type { Place } from '../data/types.ts';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { dragPlaceProps } from './askAi.ts';
import { usePlaceList } from '../shared/placeLists.ts';
import { PlaceRow, useDayStatus, type DayStatus } from '../shared/ui/PlaceRow.tsx';
import { PlaceTile } from '../shared/ui/PlaceTile.tsx';
import { PlaceWall } from '../shared/ui/PlaceWall.tsx';
import { WishList } from '../shared/ui/WishList.tsx';
import { useWishPrefs, wishPrefs } from '../shared/wishPrefs.ts';
import { PlaceOpenBody } from '../shared/ui/PlaceOpen.tsx';

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

/** 開詳情（「詳細資料」、想去列的最新留言）：彈窗蓋在地圖右側、貼著右欄（§13.3 第 1 點），選中（openDetail 會選）、地圖照移動規則（tab＝一打開就選的分頁，例如最新留言開留言分頁） */
function open(id: string, tab?: DetailTabId) {
  const s = appStore.getState();
  s.openDetail(id, s.mode === 'wish' ? 'wish' : 'explore', tab, 'map');
  commands.focus(id);
}

/** 點清單的一張卡：原地展開、選中（地圖的水滴，照移動規則）；已經展開的再點一次收起、取消選中 */
function toggleOpen(id: string, openId: string | null, setOpenId: (id: string | null) => void) {
  const s = appStore.getState();
  if (openId === id) {
    setOpenId(null);
    s.select(null);
    return;
  }
  setOpenId(id);
  s.select(id);
  commands.focus(id);
}

/** 探索的一張卡片（照片牆）或一列（清單）；想去分頁的列在 shared/ui/WishList */
function Item({ place, rank, view, hot, status, isOpen, onToggle }: { place: Place; rank: number; view: View; hot: boolean; status: DayStatus; isOpen: boolean; onToggle: () => void }) {
  const props = {
    place,
    status,
    rank,
    hot,
    testId: 'explore-item',
    onOpen: onToggle,
    open: isOpen,
    below: <PlaceOpenBody place={place} onDetail={() => open(place.id)} />,
    // 拖到左邊的聊天室＝問 AI
    rootProps: { ...dragPlaceProps(place.id), title: '點了展開；拖到左邊的聊天室可以問 AI' },
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
  // 標出的卡：選中的點、地圖上指到的點
  const selectedId = useApp((s) => s.selectedId);
  const mapHovered = useApp((s) => (s.hoverFromMap ? s.hoveredId : null));
  const hotOf = (id: string) => id === selectedId || id === mapHovered;
  const target = useApp((s) => s.exploreTarget);
  const [exploreView, setExploreView] = useState<View>(loadView);
  const wishView = useWishPrefs((s) => s.view);
  const wish = source === 'wish';
  // 探索、想去各自記住上次的顯示方式
  const view: View = wish ? wishView : exploreView;
  // 想去預設依 ❤️ 多排
  const [sort, setSort] = useState<ExploreSort>(source === 'wish' ? 'likes' : 'recommend');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const statusOf = useDayStatus();
  // 原地展開的那張（一次一張；換分頁時 ExplorePanel 換一個，自然收起）
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => toggleOpen(id, openId, setOpenId);

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
        wishPrefs.getState().setView(v);
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
            onOpen={toggle}
            openId={openId}
            onDetail={(id) => open(id)}
            onOpenComments={(id) => open(id, 'comments')}
            hotId={mapHovered ?? selectedId ?? null}
            revealId={target?.id ?? null}
            revealSeq={target?.seq}
          />
        ) : view === 'photo' ? (
          <PlaceWall items={list} openId={openId} render={(p, i) => <Item place={p} rank={i + 1} view={view} hot={hotOf(p.id)} status={statusOf(p.id)} isOpen={openId === p.id} onToggle={() => toggle(p.id)} />} />
        ) : (
          <ol className="ex-items">
            {list.map((p, i) => (
              <li key={p.id}>
                <Item place={p} rank={i + 1} view={view} hot={hotOf(p.id)} status={statusOf(p.id)} isOpen={openId === p.id} onToggle={() => toggle(p.id)} />
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


/** 右側切回「行程」：關掉詳情（篩選留著，行程分頁的地圖本來就不套篩選，第七輪 §8.4） */
export function showItinerary() {
  const s = appStore.getState();
  s.closeDetail();
  s.setMode('map');
}
