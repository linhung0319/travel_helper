// 電腦版右側的「探索」「想去」分頁（T78，interaction-design §35）。最上面是篩選列（shared/ui/FilterBar 的新長相：給了 stage），一直黏在右欄上面：
// 工具列（搜尋＋篩選；概覽是搜尋＋問 AI＋加地點）、地區分頁（每顆後面是目前主題＋篩選的數字）、子地區晶片、主題列「玩／吃／住」。
// 「篩選」打開的抽屜蓋住整個右欄（FilterSheet，只畫目前主題的組；網頁多「地圖：只看地圖畫面裡的」）。
// 內容照 lib/shelves.ts 的 exploreLayer 分三種：
// - overview：概覽（ExploreOverview），卡片的主題列直接進那區那個主題（exploreArea.ts 的 overviewTheme）；
// - area：條件列（FilterConds，有條件才有）＋「2 月注意」一行＋目前主題的書架區段（AreaThemeHome，預設收合，展開狀態在 appStore.sectionsOpen）；
// - list：搜尋、AI 挑的結果集，一份平的清單（同一種列，分批畫）。在一區裡搜尋時主題列還在（搜的是那個主題）。
// 列（shared/ui/PlaceRow）滑鼠移上去呼叫 appStore.hover（地圖的指到），點了原地展開（§13.3：介紹、優缺點、「詳細資料 ›」）並選中，再點一次收起；
// 按「詳細資料」才開詳情彈窗。清單標出的列：選中的點、和滑鼠在地圖上指到的點（列自己被指到時不回頭標自己）。
// 在探索、想去分頁點地圖上的點（mapPick.ts）：詳情彈窗蓋住整個右欄（§13.3，不動清單）；revealInExplore（AI、測試用）才切到那個點的主題、
// 展開它所在的第一個區段、捲到那列。
// 「想去」分頁是同一個元件（source="wish"）：只列有人按想去的點，地區列第一顆是「全部」，區段是還沒排／已是候選／已排進行程（shared/ui/WishList 的 WishSectionList，
// 列右邊有日曆鈕「加到某天」）；面板最前面多「誰想去：只看我按的」（filter.votes 的 mine）。
// 篩選、搜尋、展開的區段：探索、想去各自一份（appStore 的 filterStash、sectionsOpen）；右欄捲到哪裡也各記一份（換分頁回來還在原位）。
// 清單的計算（篩選、數量、想去的範圍）在 shared/placeLists.ts 的 usePlaceList，手機版也用。

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { appStore, type DetailTabId } from '../store.ts';
import { commands } from '../appCommands.ts';
import { dataStore } from '../dataStore.ts';
import { useApp, useData } from '../hooks.ts';
import type { ExploreSort } from '../lib/explore.ts';
import type { Bbox, Place } from '../data/types.ts';
import { AddPlaceSuggest, useSuggestOwnsEmpty } from '../shared/ui/AddPlaceSuggest.tsx';
import { AreaChips } from '../shared/ui/AreaChips.tsx';
import { AreaThemeHome, ExploreOverview, NextSteps, RegionChips } from '../shared/ui/ExploreHome.tsx';
import { SECTIONS, THEME_LABELS, currentArea, exploreLayer, isTheme, scopeCountsByTheme, sectionPlaces, themeCounts, themeOf, type Theme } from '../lib/shelves.ts';
import { emptyHelp, listDraft } from '../lib/listConditions.ts';
import { EMPTY_FILTER, isFilterEmpty, type Filter, type FilterKey } from '../lib/filter.ts';
import { focusOverview, lensUndo, overviewRegion, overviewTheme, pickArea, pickAreaChip, pickRegion, setTheme, undoLeave, useLensUndo } from '../exploreArea.ts';
import { overviewStore } from '../shared/overviewStore.ts';
import { addPlaceStore } from '../addPlaceStore.ts';
import { FilterBar, FilterConds, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { dragPlaceProps } from './askAi.ts';
import { askDraft, askList, askPlace, askWishEmpty } from './webAi.ts';
import { WishEmpty } from '../shared/ui/EmptyStates.tsx';
import { useAiPicked, usePlaceList } from '../shared/placeLists.ts';
import { UndoToast } from '../shared/ui/UndoToast.tsx';
import { PlaceRow, useDayStatus, type DayStatus } from '../shared/ui/PlaceRow.tsx';
import { WishSectionList, useWishSections } from '../shared/ui/WishList.tsx';
import type { SectionId, WishSection } from '../shared/wishSections.ts';
import { useBatch } from '../shared/useBatch.ts';
import { PlaceOpenBody, useRevealOpen } from '../shared/ui/PlaceOpen.tsx';

export type ListSource = 'explore' | 'wish';

/** 右欄的捲動容器 */
const SCROLLER = '.side-body';

/** 開詳情（「詳細資料」、想去列的最新留言）：彈窗蓋在地圖右側、貼著右欄（§13.3 第 1 點），選中（openDetail 會選）、地圖照移動規則（tab＝一打開就選的分頁，例如最新留言開留言分頁） */
function open(id: string, tab?: DetailTabId) {
  const s = appStore.getState();
  s.openDetail(id, s.mode === 'wish' ? 'wish' : 'explore', tab, 'map');
  commands.focus(id);
}

/** 點清單的一列：原地展開、選中（地圖的水滴，照移動規則）；已經展開的再點一次收起、取消選中 */
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

/** 搜尋、AI 結果集那層一批畫幾個（T32）：捲到底再畫下一批 */
const BATCH = 60;

/**
 * 探索的一列（區段裡、搜尋和 AI 結果集）；想去的列在 shared/ui/WishList。
 * memo：選中、地圖上指到一個點時，只重畫有變的那一兩列。props 都要是穩定的值（statusOf、onToggle 不能每次換）
 */
const Item = memo(function Item({ place, rank, hot, statusOf, isOpen, onToggle, aiNote, letter }: { place: Place; rank: number; hot: boolean; statusOf: (id: string) => DayStatus; isOpen: boolean; onToggle: (id: string) => void; aiNote?: string; letter?: string }) {
  return (
    <PlaceRow
      place={place}
      status={statusOf(place.id)}
      rank={rank}
      hot={hot}
      testId="explore-item"
      onOpen={() => onToggle(place.id)}
      open={isOpen}
      below={<PlaceOpenBody place={place} onDetail={() => open(place.id)} onAsk={() => askPlace(place.id)} />}
      aiNote={aiNote}
      letter={letter}
      // 拖到左邊的聊天室＝問 AI
      rootProps={{ ...dragPlaceProps(place.id), title: '點了展開；拖到左邊的聊天室可以問 AI' }}
    />
  );
});

/** 0 個時的下一步（看全區、清除篩選）：套那組條件（和搜尋）；子地區換了，地圖跟著框 */
function applyHelp(filter: Filter, query?: string) {
  const s = appStore.getState();
  const regionChanged = s.filter.regions.join() !== filter.regions.join();
  s.setFilter(filter);
  if (query !== undefined) s.setQuery(query);
  const area = currentArea(filter);
  if (regionChanged && area) commands.focus(filter.regions.length === 1 ? { region: filter.regions[0] } : { area });
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

/** 換分頁時右欄捲到哪裡（探索、想去各一份；ExplorePanel 換分頁時重新掛上） */
const scrollMemo: Record<ListSource, number> = { explore: 0, wish: 0 };

/** 掛上時捲回上次的位置，捲動時記住 */
function useScrollMemo(ref: RefObject<HTMLElement | null>, source: ListSource) {
  useLayoutEffect(() => {
    const body = ref.current?.closest<HTMLElement>(SCROLLER);
    if (!body) return;
    body.scrollTop = scrollMemo[source];
    const save = () => {
      scrollMemo[source] = body.scrollTop;
    };
    body.addEventListener('scroll', save, { passive: true });
    return () => body.removeEventListener('scroll', save);
  }, [ref, source]);
}

/** revealInExplore 要捲到的那列：哪一段、在段裡第幾個 */
interface Reveal {
  section: string;
  index: number;
}

/** 想去的空清單（同一個陣列，不重算） */
const EMPTY: Place[] = [];

const placeById = (id: string) => dataStore.getState().places.find((p) => p.id === id);

export function ExplorePanel({ source = 'explore' }: { source?: ListSource }) {
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);
  const wish = source === 'wish';
  const [inView, setInView] = useState(false);
  // 沒開「只列地圖畫面裡的」就不看地圖範圍：移動地圖時整個清單不用重畫
  const bounds = useApp((s) => (inView ? (s.view?.bounds ?? null) : null));
  // 標出的列：選中的點、地圖上指到的點
  const selectedId = useApp((s) => s.selectedId);
  const mapHovered = useApp((s) => (s.hoverFromMap ? s.hoveredId : null));
  const hotId = mapHovered ?? selectedId ?? null;
  const target = useApp((s) => s.exploreTarget);
  const openIds = useApp((s) => s.sectionsOpen[source]);
  // 排序鈕拿掉了（§35.3）：探索固定推薦順序；想去「想去多的排前面」（還沒排那段）
  const sort: ExploreSort = wish ? 'likes' : 'recommend';
  const ref = useRef<HTMLDivElement>(null);
  useScrollMemo(ref, source);
  const statusOf = useDayStatus();
  const ownsEmpty = useSuggestOwnsEmpty(query);
  // 原地展開的那列（一次一列；換分頁時 ExplorePanel 換一個，自然收起）
  const [openId, setOpenId] = useState<string | null>(null);
  const hold = useRevealOpen(ref, openId);
  // 給列的是同一個函式（memo 才有用），裡面讀最新的 openId
  const latest = useRef({ hold, openId });
  latest.current = { hold, openId };
  const toggle = useCallback((id: string) => {
    latest.current.hold(id);
    toggleOpen(id, latest.current.openId, setOpenId);
  }, []);

  // 打字時輸入框先跟上，清單晚一點算（T32）
  const listQuery = useDeferredValue(query);
  const { pool, list: every } = usePlaceList(source, filter, listQuery, sort, bounds);
  const { aiResult, list, sortByAi, setSortByAi, aiProps } = useAiPicked(every, !wish);
  // 探索這時畫哪一種；想去一律是區段
  const stage = wish ? 'area' : exploreLayer(filter, listQuery, !!aiResult);
  const area = currentArea(filter);
  const regionId = filter.regions.length === 1 ? filter.regions[0] : null;
  const theme: Theme = themeOf(filter) ?? 'spot';
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);

  // 選了一區（想去一律）時一定有一個主題：AI 的 set_filter、復原可能沒給或給了好幾類，換成第一個（沒有就「玩」）
  const needTheme = (wish || stage === 'area') && filter.types.length !== 1;
  useEffect(() => {
    if (!needTheme) return;
    const first = filter.types.find(isTheme);
    appStore.getState().setFilter({ types: [first ?? 'spot'] });
  }, [needTheme, filter.types]);

  // 搜尋、AI 結果集那層的分批
  const flat = stage === 'list';
  const { shown, moreRef, reveal: revealBatch, hasMore } = useBatch({ total: flat ? list.length : 0, batch: BATCH, resetOn: [filter, listQuery, aiResult], scroller: SCROLLER });
  const shownList = flat ? list.slice(0, shown) : EMPTY;

  // 想去的三段（revealInExplore 找它在哪一段）
  const wishSections = useWishSections(wish ? list : EMPTY);

  // revealInExplore：先切到那個點的地區、主題（探索），再展開它所在的第一個區段、多畫到它、捲過去
  const [pending, setPending] = useState<{ id: string; seq: number } | null>(null);
  const [minShown, setMinShown] = useState<Partial<Record<string, number>>>({});
  const [scrollTo, setScrollTo] = useState<{ id: string; seq: number } | null>(null);
  // 掛上之前就留在 store 的那個不算（換分頁回來不要又跳一次）
  const staleSeq = useRef(target?.seq);
  useEffect(() => {
    if (!target || target.seq === staleSeq.current) return;
    const s = appStore.getState();
    const p = placeById(target.id);
    if (!p) return;
    // 搜尋、AI 結果集：平的清單，直接捲過去
    if (!wish && exploreLayer(s.filter, s.query, !!s.aiResult) === 'list') {
      setScrollTo(target);
      return;
    }
    if (!wish && p.area && currentArea(s.filter) !== p.area) pickArea(p.area);
    else if (s.filter.regions.length && !(p.region && s.filter.regions.includes(p.region))) pickRegion(null);
    if (isTheme(p.type)) setTheme(p.type);
    setPending(target);
    // 只看 target：其他的變化不要重來
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useEffect(() => {
    if (!pending) return;
    // 等主題換好（setTheme 之後下一輪才是新的 filter）
    if (needTheme || themeOf(filter) !== placeById(pending.id)?.type) return;
    const found = wish ? findWish(wishSections, list, pending.id) : findSection(places, filter, bounds, pending.id);
    setPending(null);
    if (!found) return;
    if (!appStore.getState().sectionsOpen[source].includes(found.section)) appStore.getState().toggleSection(found.section, source);
    setMinShown({ [found.section]: found.index + 1 });
    setScrollTo(pending);
  }, [pending, needTheme, filter, wish, wishSections, list, places, bounds, source]);

  // 搜尋、AI 結果集那層：還沒畫到的先多畫到它
  const targetIndex = scrollTo && flat ? list.findIndex((p) => p.id === scrollTo.id) : -1;
  const waiting = targetIndex >= shown;
  useEffect(() => {
    if (waiting) revealBatch(targetIndex);
  }, [waiting, targetIndex, revealBatch]);
  // 捲到那列（清單可能很長，平滑捲動會在半路被照片載入打斷，直接跳）；區段展開、畫好了才捲
  useEffect(() => {
    if (!scrollTo || waiting) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(scrollTo.id)}"]`)?.scrollIntoView({ block: 'center' }));
    });
    return () => cancelAnimationFrame(id);
  }, [scrollTo, waiting]);

  const model: FilterModel = {
    filter,
    query,
    setQuery: (q) => appStore.getState().setQuery(q),
    sort,
    setSort: () => {},
    inView,
    setInView,
    pick: pickOption,
    // 地區、子地區、主題在上面，不跟著清掉（同手機）
    clear: () => {
      const { areas: a, regions, types } = appStore.getState().filter;
      appStore.getState().setFilter({ ...EMPTY_FILTER, areas: a, regions, types });
      setInView(false);
    },
    ...(wish ? {} : { onAdd: () => addPlaceStore.getState().openEntry() }),
    onAsk: () => void askList(source, filter, query, list.length),
    ...(aiResult ? { ai: { title: aiResult.title, total: aiResult.ids.length, sortByAi, setSortByAi, onClear: () => commands.clearResult() } } : {}),
    // 主題列、面板的組：選了一區（想去一律）；在一區裡搜尋也是（搜的是那個主題）
    theme: aiResult ? null : wish || area ? theme : themeOf(filter),
    setTheme,
  };

  // 在一區裡搜尋：清單是平的，但頂端照樣有主題列（篩選列當成地區頁畫）
  const barStage = stage === 'list' && !aiResult && area ? 'area' : stage;
  // 離開概覽（選了一區、搜尋、篩選）：概覽在地圖上的框拿掉，卡片選的子地區留著（T63 §28）
  useEffect(() => {
    if (!wish && stage !== 'overview') overviewStore.getState().clearFocus();
  }, [wish, stage]);
  // 地區分頁、子地區晶片的小數字（§35.2）：選了一區（或想去）就永遠寫；概覽、AI 結果集不寫
  const counts = useMemo(() => (stage === 'overview' || aiResult ? null : scopeCountsByTheme(pool, filter, listQuery, areas)), [stage, aiResult, pool, filter, listQuery, areas]);
  // 主題列的三格（目前地區、子地區那一類的總數，不看篩選；想去是有人按想去的）
  const tCounts = useMemo(() => themeCounts(pool, filter), [pool, filter]);
  const undo = useLensUndo((s) => s.undo);
  const onToggleSection = useCallback((id: string) => appStore.getState().toggleSection(id, source), [source]);
  const renderRow = useCallback(
    (p: Place, i: number) => <Item place={p} rank={i + 1} hot={p.id === hotId} statusOf={statusOf} isOpen={openId === p.id} onToggle={toggle} />,
    [hotId, statusOf, openId, toggle],
  );
  const conds = <FilterConds model={model} count={list.length} />;
  const applyAndReset = (f: Filter, q: string) => {
    setInView(false);
    applyHelp(f, q);
  };

  return (
    <div className={`explore-panel source-${source}`} data-testid={wish ? 'wish-panel' : 'explore-panel'} data-stage={stage}>
      <FilterBar
        source={source}
        surface="desktop"
        model={model}
        count={list.length}
        stage={barStage}
        themeCounts={tCounts}
        typeRow={
          <AreaChips
            value={area}
            onPick={(a) => {
              setInView(false);
              pickAreaChip(a);
            }}
            firstLabel={wish ? '全部' : '概覽'}
            prefix="ex"
            testId="ex-area-chips"
            counts={counts}
          />
        }
        subRow={area && stage !== 'overview' ? <RegionChips areaId={area} regionId={regionId} onPick={pickRegion} counts={counts} /> : undefined}
      />
      {!wish && stage === 'overview' && undo && <UndoToast label={undo.label} onUndo={undoLeave} onClose={() => lensUndo.getState().set(null)} />}
      {!wish && <AddPlaceSuggest query={query} surface="desktop" />}
      <div className={`ex-list view-${flat ? 'list' : stage} source-${source}`} ref={ref}>
        {stage === 'overview' ? (
          <ExploreOverview surface="desktop" onOpen={(id) => open(id)} onPickArea={pickArea} onPickRegion={overviewRegion} onFocus={focusOverview} onPickTheme={overviewTheme} />
        ) : wish ? (
          <>
            {conds}
            {pool.length === 0 ? (
              <WishEmpty onExplore={() => appStore.getState().setMode('explore')} onAsk={askWishEmpty} />
            ) : list.length === 0 ? (
              <p className="muted ex-empty" data-testid="wish-none">
                {wishNone(filter, query, inView)}
              </p>
            ) : (
              <WishSectionList
                surface="desktop"
                places={list}
                openIds={openIds as SectionId[]}
                onToggle={onToggleSection}
                onOpen={toggle}
                openId={openId}
                onDetail={(id) => open(id)}
                onAsk={askPlace}
                onOpenComments={(id) => open(id, 'comments')}
                hotId={hotId}
                scroller={SCROLLER}
                minShown={minShown}
              />
            )}
          </>
        ) : stage === 'area' && area ? (
          <>
            {conds}
            <AreaThemeHome
              areaId={area}
              regionId={regionId}
              theme={theme}
              filter={filter}
              bounds={bounds}
              surface="desktop"
              openIds={openIds}
              onToggle={onToggleSection}
              onOpen={(id) => open(id)}
              onApply={applyAndReset}
              onAsk={askDraft}
              onAskAi={() => askDraft(listDraft(filter, '', areas) ?? '')}
              onAdd={() => addPlaceStore.getState().openEntry()}
              renderRow={renderRow}
              scroller={SCROLLER}
              minShown={minShown}
            />
          </>
        ) : (
          <>
            {conds}
            <ol className="ex-items">
              {shownList.map((p, i) => (
                <li key={p.id}>
                  <Item place={p} rank={i + 1} hot={p.id === hotId} statusOf={statusOf} isOpen={openId === p.id} onToggle={toggle} {...aiProps(p.id)} />
                </li>
              ))}
            </ol>
            {hasMore && <div ref={moreRef} className="ex-next" aria-hidden />}
            {list.length === 0 && aiResult && (
              <div className="muted ex-empty" data-testid="ai-result-empty">
                <p>AI 挑的 {aiResult.ids.length} 家沒有符合這些篩選的。</p>
                <button
                  type="button"
                  className="button small"
                  onClick={() => {
                    model.clear();
                    model.setQuery('');
                  }}
                  data-testid="ai-result-unfilter"
                >
                  取消篩選，回到 AI 挑的 {aiResult.ids.length} 家
                </button>
              </div>
            )}
            {list.length === 0 && !aiResult && !ownsEmpty && <NextSteps help={emptyHelp(places, filter, query, areas)} onApply={applyAndReset} onAsk={askDraft} />}
          </>
        )}
      </div>
    </div>
  );
}

/** 想去在這個主題、範圍裡一個都沒有：有條件時叫人取消篩選，沒有時寫「這裡還沒有人想去的餐廳」 */
function wishNone(filter: Filter, query: string, inView: boolean): string {
  if (query.trim() || inView || !isFilterEmpty({ ...filter, areas: [], regions: [], types: [] })) return '沒有符合的地點，取消一些篩選看看。';
  return `這裡還沒有人想去的${THEME_LABELS[themeOf(filter) ?? 'spot'].noun}。`;
}

/** 探索：那個點在目前主題的第一個區段（篩選、地圖範圍照現在的）和它在段裡的位置 */
function findSection(places: Place[], filter: Filter, bounds: Bbox | null, id: string): Reveal | null {
  const theme = themeOf(filter);
  if (!theme) return null;
  for (const section of SECTIONS[theme]) {
    const index = sectionPlaces(places, section, filter, { bounds }).findIndex((p) => p.id === id);
    if (index >= 0) return { section: section.id, index };
  }
  return null;
}

/** 想去：那個點在哪一段、段裡第幾個（段裡的順序照 WishSectionList：組照順序攤平，只算清單裡有的） */
function findWish(sections: WishSection[], list: Place[], id: string): Reveal | null {
  const inList = new Set(list.map((p) => p.id));
  for (const sec of sections) {
    const index = sec.groups
      .flatMap((g) => g.ids)
      .filter((x) => inList.has(x))
      .indexOf(id);
    if (index >= 0) return { section: sec.id, index };
  }
  return null;
}

/** 右側切回「行程」：關掉詳情（篩選留著，行程分頁的地圖本來就不套篩選，第七輪 §8.4） */
export function showItinerary() {
  const s = appStore.getState();
  s.closeDetail();
  s.setMode('map');
}
