// 電腦版右側的「探索」分頁：最上面是篩選列（shared/ui/FilterBar：搜尋、篩選、排序、照片牆／清單，套用的條件變成小晶片），一直黏在上面；
// 「篩選」打開的抽屜蓋住整個右欄（FilterSheet），類型、團體、天氣、情境、想去、等級、只看地圖畫面裡的都在裡面。
// 篩選列下面一列是地區（T42，interaction-design §20）：探索沒選地區、沒搜尋、沒其他條件時是概覽（ExploreOverview），選了一區是子地區列（篩選列裡）加書架（AreaHome），
// 其他時候才是照片牆或清單。目前地區就是 filter.areas（只有一區時），換到想去時跟著走（store 的 setMode），地圖飛過去。
// 清單可以切換照片牆（兩欄，PlaceTile）或清單列（PlaceRow，88px），都是兩邊共用的元件；滑鼠移上去呼叫 appStore.hover（地圖的指到），
// 點了原地展開（第八輪 §13.3：照片牆橫跨兩欄、清單在原地，介紹、優缺點、「詳細資料 ›」）並選中（地圖的水滴），再點一次收起；按「詳細資料」才開詳情。想去一樣。
// 反過來，在探索、想去分頁點地圖上的點（mapPick.ts）：詳情彈窗蓋住整個右欄，不再捲到卡片（第八輪 §13.3）；revealInExplore（AI、測試用）才捲到那張卡。
// 清單標出的卡：選中的點、和滑鼠在地圖上指到的點（卡片自己被指到時不回頭標自己）。
// 「想去」分頁是同一個元件（source="wish"）：只列有人按想去的點，清單換成 shared/ui/WishList（分成還沒排、已是候選、已排三段，列右邊有 ❤ 和日曆鈕「加到某天」）；
// 探索只有愛心，流程是先按想去再到想去加到某天。想去的顯示方式（清單、照片牆）記在 shared/wishPrefs.ts（手機也用），和探索各自記。
// 篩選、搜尋：探索、想去各自一份（appStore.filter／query 是現在這頁的，另一頁的收在 filterStash，第七輪最終 review #3）。
// 卡片照片右下角是想去的愛心（VoteHeart），左上角是類型；重點膠囊（已排、候選、15 人、預約）在名稱下面。探索的照片牆是兩欄。
// 清單的計算（篩選、排序、數量、想去的範圍）在 shared/placeLists.ts 的 usePlaceList，手機版也用。

import { memo, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { appStore, type DetailTabId } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import type { ExploreSort } from '../lib/explore.ts';
import type { Place } from '../data/types.ts';
import { AddPlaceSuggest, useSuggestOwnsEmpty } from '../shared/ui/AddPlaceSuggest.tsx';
import { AreaChips } from '../shared/ui/AreaChips.tsx';
import { AreaHome, ExploreOverview, RegionChips } from '../shared/ui/ExploreHome.tsx';
import { areaOnly, backLabel, currentArea, exploreStage } from '../lib/shelves.ts';
import { EMPTY_FILTER, type Filter, type FilterKey } from '../lib/filter.ts';
import { pickArea, pickAreaChip } from '../exploreArea.ts';
import { displayName } from '../data/normalize.ts';
import { addPlaceStore } from '../addPlaceStore.ts';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { dragPlaceProps } from './askAi.ts';
import { askList, askPlace, askWishEmpty } from './webAi.ts';
import { WishEmpty } from '../shared/ui/EmptyStates.tsx';
import { useAiPicked, usePlaceList, useWishUserChip } from '../shared/placeLists.ts';
import { useWishPrefs, wishPrefs } from '../shared/wishPrefs.ts';
import { PlaceRow, useDayStatus, type DayStatus } from '../shared/ui/PlaceRow.tsx';
import { PlaceTile } from '../shared/ui/PlaceTile.tsx';
import { PlaceWall } from '../shared/ui/PlaceWall.tsx';
import { WishList, useWishBack, useWishSections } from '../shared/ui/WishList.tsx';
import { useBatch } from '../shared/useBatch.ts';
import { PlaceOpenBody, useRevealOpen } from '../shared/ui/PlaceOpen.tsx';

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

/** 網頁探索一批畫幾張（T32）：捲到底再畫下一批 */
const BATCH = 60;
/** 探索時給 useWishSections 的空清單（同一個陣列，不重算） */
const EMPTY_LIST: Place[] = [];

/**
 * 探索的一張卡片（照片牆）或一列（清單）；想去分頁的列在 shared/ui/WishList。
 * memo：選中、地圖上指到一個點時，只重畫有變的那一兩張。props 都要是穩定的值（statusOf、onToggle 不能每次換）
 */
const Item = memo(function Item({ place, rank, view, hot, statusOf, isOpen, onToggle, aiNote, letter }: { place: Place; rank: number; view: View; hot: boolean; statusOf: (id: string) => DayStatus; isOpen: boolean; onToggle: (id: string) => void; aiNote?: string; letter?: string }) {
  const props = {
    place,
    status: statusOf(place.id),
    rank,
    hot,
    testId: 'explore-item',
    onOpen: () => onToggle(place.id),
    open: isOpen,
    below: <PlaceOpenBody place={place} onDetail={() => open(place.id)} onAsk={() => askPlace(place.id)} />,
    aiNote,
    letter,
    // 拖到左邊的聊天室＝問 AI
    rootProps: { ...dragPlaceProps(place.id), title: '點了展開；拖到左邊的聊天室可以問 AI' },
  };
  return view === 'list' ? <PlaceRow {...props} /> : <PlaceTile {...props} />;
});

/** 選區後的子地區列：一次一個；null 是整區 */
function pickRegion(region: string | null) {
  const s = appStore.getState();
  s.setFilter({ regions: region ? [region] : [] });
  const area = currentArea(s.filter);
  if (region) commands.focus({ region });
  else if (area) commands.focus({ area });
}

/** 書架的「全部 ›」：套那組條件 */
function applyShelf(filter: Filter) {
  appStore.getState().setFilter(filter);
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
  const [inView, setInView] = useState(false);
  // 沒開「只列地圖畫面裡的」就不看地圖範圍：移動地圖時整個清單不用重畫
  const bounds = useApp((s) => (inView ? (s.view?.bounds ?? null) : null));
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
  const ref = useRef<HTMLDivElement>(null);
  const statusOf = useDayStatus();
  const ownsEmpty = useSuggestOwnsEmpty(query);
  // 原地展開的那張（一次一張；換分頁時 ExplorePanel 換一個，自然收起）
  const [openId, setOpenId] = useState<string | null>(null);
  const hold = useRevealOpen(ref, openId);
  // 給卡片的是同一個函式（memo 才有用），裡面讀最新的 openId
  const latest = useRef({ hold, openId });
  latest.current = { hold, openId };
  const toggle = useCallback((id: string) => {
    latest.current.hold(id);
    toggleOpen(id, latest.current.openId, setOpenId);
  }, []);

  // 清單的計算在 shared/placeLists.ts（手機版也用）；沒選類型就是三類都列
  // 打字時輸入框先跟上，清單晚一點算（T32）
  const listQuery = useDeferredValue(query);
  const { pool, list: every } = usePlaceList(source, filter, listQuery, sort, bounds);
  // 「自己加 N」：選它時類型、地區回到全部
  const userChip = useWishUserChip(pool, every, () => appStore.getState().setFilter({ types: [], areas: [], regions: [] }));
  const all = wish ? userChip.list : every;
  const { aiResult, list, sortByAi, setSortByAi, aiProps } = useAiPicked(all, source === 'explore');
  const { shown, moreRef, reveal, hasMore } = useBatch({ total: list.length, batch: BATCH, resetOn: [filter, listQuery, sort, aiResult], scroller: '.side-body' });
  // 想去的清單自己分批（WishList）
  const shownList = wish ? list : list.slice(0, shown);

  // 地圖上點了某個點：清單直接跳到那張卡片（清單可能很長，平滑捲動會在半路被照片載入打斷）
  // 還沒畫到的先多畫到它（只捲一次，之後捲下去多畫一批不會跳回來）
  const targetIndex = target && !wish ? list.findIndex((p) => p.id === target.id) : -1;
  const waiting = targetIndex >= shown;
  useEffect(() => {
    if (waiting) reveal(targetIndex);
  }, [waiting, targetIndex, reveal]);
  useEffect(() => {
    if (!target || waiting) return;
    // 想去的清單要先把它那段展開、多顯示到它（WishList 的 revealId），等畫完再捲
    const id = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(id);
  }, [target, waiting]);

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
    // 地區、子地區在外面一列，不跟著清掉（同手機）
    clear: () => {
      const { areas, regions } = appStore.getState().filter;
      appStore.getState().setFilter({ ...EMPTY_FILTER, areas, regions });
      setInView(false);
    },
    ...(wish ? {} : { onAdd: () => addPlaceStore.getState().openEntry() }),
    onAsk: () => askList(source, filter, query, list.length),
    ...(aiResult ? { ai: { title: aiResult.title, total: aiResult.ids.length, sortByAi, setSortByAi, onClear: () => commands.clearResult() } } : {}),
  };

  // 探索這時畫哪一種：概覽、選了一區（書架）、照片牆或清單（想去一律是清單）
  const stage = wish ? 'list' : exploreStage(filter, listQuery, !!aiResult);
  const area = currentArea(filter);
  const areaName = useData((s) => {
    const a = area ? s.areas.find((x) => x.id === area) : undefined;
    return a ? displayName(a.name, a.id) : null;
  });
  // 選了一區、但套了其他條件或搜尋：地點數前面「‹ 一定要去」（還是那排書架的條件）或「‹ 回到鳥羽」，點了回到書架（T50）
  const back =
    !wish && !aiResult && stage === 'list' && areaName
      ? {
          label: backLabel(filter, query, areaName),
          onClick: () => {
            appStore.getState().setFilter(areaOnly(appStore.getState().filter));
            appStore.getState().setQuery('');
            setInView(false);
          },
        }
      : null;
  const regionId = filter.regions.length === 1 ? filter.regions[0] : null;
  // 想去（T53）：三排書架，「全部 ›」進某一排的清單層，返回鈕「‹ 還沒排 · 6 個地點」；地點數寫那排的數字
  const wishSections = useWishSections(wish ? list : EMPTY_LIST);
  const wishBack = useWishBack();
  const wishCount = wishBack.section ? (wishSections.find((x) => x.id === wishBack.section)?.count ?? 0) : list.length;

  return (
    <div className={`explore-panel source-${source}`} data-testid={source === 'wish' ? 'wish-panel' : 'explore-panel'}>
      <FilterBar
        source={source}
        surface="desktop"
        model={model}
        count={wish ? wishCount : list.length}
        typeRow={<AreaChips value={filter.areas.length === 1 ? filter.areas[0] : null} onPick={(a) => {
            setInView(false);
            pickAreaChip(a);
          }} firstLabel={wish ? '全部' : '概覽'} prefix="ex" testId="ex-area-chips" extra={wish ? userChip.chip : undefined} />}
        subRow={stage === 'area' && area ? <RegionChips areaId={area} regionId={regionId} onPick={pickRegion} /> : undefined}
        back={wish ? wishBack.back : back}
        showView={wish ? !!wishBack.section : stage === 'list'}
      />
      {!wish && <AddPlaceSuggest query={query} surface="desktop" />}
      <div className={`ex-list view-${stage === 'list' ? view : stage} source-${source}`} ref={ref}>
        {stage === 'overview' ? (
          <ExploreOverview surface="desktop" onOpen={(id) => open(id)} onPickArea={pickArea} />
        ) : stage === 'area' && area ? (
          <AreaHome areaId={area} regionId={regionId} surface="desktop" onOpen={(id) => open(id)} onShelfAll={applyShelf} />
        ) : wish ? (
          <WishList
            surface="desktop"
            places={list}
            view={view}
            onOpen={toggle}
            openId={openId}
            onDetail={(id) => open(id)}
            onAsk={askPlace}
            onOpenComments={(id) => open(id, 'comments')}
            hotId={mapHovered ?? selectedId ?? null}
            revealId={target?.id ?? null}
            revealSeq={target?.seq}
          />
        ) : view === 'photo' ? (
          <PlaceWall items={shownList} total={list.length} openId={openId} render={(p, i) => <Item place={p} rank={i + 1} view={view} hot={hotOf(p.id)} statusOf={statusOf} isOpen={openId === p.id} onToggle={toggle} {...aiProps(p.id)} />} />
        ) : (
          <ol className="ex-items">
            {shownList.map((p, i) => (
              <li key={p.id}>
                <Item place={p} rank={i + 1} view={view} hot={hotOf(p.id)} statusOf={statusOf} isOpen={openId === p.id} onToggle={toggle} {...aiProps(p.id)} />
              </li>
            ))}
          </ol>
        )}
        {stage === 'list' && !wish && hasMore && <div ref={moreRef} className="ex-next" aria-hidden />}
        {stage === 'list' && list.length === 0 && aiResult && (
          <div className="muted ex-empty" data-testid="ai-result-empty">
            <p>AI 挑的 {aiResult.ids.length} 家沒有符合這些篩選的。</p>
            <button type="button" className="button small" onClick={() => {
                model.clear();
                model.setQuery('');
              }} data-testid="ai-result-unfilter">
              取消篩選，回到 AI 挑的 {aiResult.ids.length} 家
            </button>
          </div>
        )}
        {stage === 'list' && list.length === 0 && !aiResult && wish && pool.length === 0 && <WishEmpty onExplore={() => appStore.getState().setMode('explore')} onAsk={askWishEmpty} />}
        {stage === 'list' && list.length === 0 && !aiResult && (wish || !ownsEmpty) && !(wish && pool.length === 0) && <p className="muted ex-empty">沒有符合的地點，取消一些篩選看看。</p>}
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
