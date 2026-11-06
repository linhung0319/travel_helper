// 手機版「探索」分頁（第七輪 §5；T77 照 interaction-design §35 改版）：沒有地圖。三種畫面（lib/shelves.ts 的 exploreLayer）：
// - overview（沒選地區、沒條件）：概覽卡（shared/ui/ExploreHome 的 ExploreOverview），工具列是搜尋＋問 AI＋加地點；卡片的主題列點了直接進那區那個主題；
// - area（選了一區）：條件列（FilterConds，有條件才有）、「2 月注意」一行、目前主題的收合區段（AreaThemeHome），最下面「問 AI 幫我挑」「找不到？自己加一個」；
// - list：搜尋結果和 AI 挑的結果集，一份平的清單（同一種列 PlaceRow，60 個一批），返回鈕照舊。
// 頂端（FeedFilters → shared/ui/FilterBar）：工具列、地區分頁、子地區晶片、主題列整組黏頂。主題就是 feed.type，展開的區段在 mobileStore.feedOpen。
// 點列 → 整頁詳情（openPlace），返回鈕寫「回到 賢島 › 玩」；詳情蓋在分頁上面、分頁不卸載，退回時捲動位置和展開的區段都不變。
// 換區、換子地區、換主題捲到頂（FeedFilters 的 scrollPageTop）。清單的計算和網頁版共用 shared/placeLists.ts，不看地圖範圍。探索不放「加到某天」。
// 這個檔也留著手機其他頁用的 useVoteIndex、placeAreaLabel、FeedVotes。

import { useDeferredValue, useMemo } from 'react';
import { useApp, useShared } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { voteCounts } from '../sharedStore.ts';
import { feedFilter, filterToFeed } from '../lib/explore.ts';
import { exploreLayer, themeCounts, themePlaces } from '../lib/shelves.ts';
import { emptyHelp, listDraft } from '../lib/listConditions.ts';
import { lensUndo, undoLeave, useLensUndo } from '../exploreArea.ts';
import { UndoToast } from '../shared/ui/UndoToast.tsx';
import type { Filter } from '../lib/filter.ts';
import { AreaThemeHome, ExploreOverview, NextSteps, RegionChips } from '../shared/ui/ExploreHome.tsx';
import { FilterConds } from '../shared/ui/FilterBar.tsx';
import { useData } from '../hooks.ts';
import { AddPlaceSuggest, useSuggestOwnsEmpty } from '../shared/ui/AddPlaceSuggest.tsx';
import { addPlaceStore } from '../addPlaceStore.ts';
import { VoteHeart } from '../shared/ui/VoteHeart.tsx';
import { useAiPicked, useExploreList } from '../shared/placeLists.ts';
import { PlaceRow, useDayStatus } from '../shared/ui/PlaceRow.tsx';
import type { VoteValue } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import { commands } from '../appCommands.ts';
import { FeedFilters, feedTheme, pickFeedArea, pickFeedRegion, pickFeedTheme, scopeBackLabel, useFeedModel, useThemeScopeCounts } from './FeedFilters.tsx';
import { askDraft, askList } from './mobileAi.ts';
import { mobileStore, useMobile } from './mobileStore.ts';
import { useBatch } from '../shared/useBatch.ts';

export interface VoteState {
  like: number;
  dislike: number;
  mine: VoteValue | null;
}

/** 每個點的 ❤️／👎 數和自己按的（整份清單算一次） */
export function useVoteIndex(): (placeId: string) => VoteState {
  const votes = useShared((s) => s.votes);
  const me = useShared((s) => s.me?.id);
  return useMemo(() => {
    const counts = voteCounts(votes);
    const mine = new Map(votes.filter((v) => v.memberId === me).map((v) => [v.placeId, v.value]));
    return (id: string) => ({ like: counts.get(id)?.like ?? 0, dislike: counts.get(id)?.dislike ?? 0, mine: mine.get(id) ?? null });
  }, [votes, me]);
}

/** 地區・小區域的名稱 */
export function placeAreaLabel(place: Place, areas: Area[]): string {
  const area = areas.find((a) => a.id === place.area);
  const region = area?.regions?.find((r) => r.id === place.region);
  return [area && displayName(area.name, area.id), region && displayName(region.name, region.id)].filter(Boolean).join('・');
}

/** 圖片右下角的想去愛心（shared/ui/VoteHeart）：按的是自己的票，再按一次收回；不開詳情 */
export function FeedVotes({ placeId }: { placeId: string }) {
  return (
    <span className="m-votes">
      <VoteHeart placeId={placeId} size="sm" />
    </span>
  );
}

/** 0 個時的下一步（看全區、清除篩選）：換成那組條件（和搜尋）；主題留著 */
const applyFeed = (f: Filter, query?: string) => {
  const { feed, setFeed } = mobileStore.getState();
  const next = filterToFeed(f);
  setFeed({ ...next, type: next.type === 'all' ? feed.type : next.type, ...(query !== undefined ? { query } : {}) });
};

/** 一次多畫幾張（往下滑到底再畫下一批） */
const BATCH = 60;

/** 已經畫了幾張：問完 AI 回來，捲動位置才接得上（§16.2） */
const shownBefore = { current: BATCH };

/** 探索分頁 */
export function ExploreFeed() {
  const feed = useMobile((s) => s.feed);
  const openIds = useMobile((s) => s.feedOpen);
  const theme = feedTheme(feed.type);
  const filter = useMemo(() => feedFilter(feed), [feed.type, feed.area, feed.quick]); // eslint-disable-line react-hooks/exhaustive-deps
  // 打字時輸入框先跟上，清單晚一點算（T32）
  const listQuery = useDeferredValue(feed.query);
  const fromChat = useMobile((s) => s.fromChat);
  const aiOn = useApp((s) => s.aiResult);
  const stage = exploreLayer(filter, listQuery, !!aiOn);
  // 搜尋不分主題（在志摩搜「海樂園」，餐廳、住宿也找得到）
  const listFilter = useMemo(() => (listQuery.trim() ? { ...filter, types: [] } : filter), [filter, listQuery]);
  const { pool, list: all } = useExploreList(listFilter, listQuery, 'recommend');
  // AI 挑的（規格 §3.1）：取交集、照 AI 的順序、列多一行理由
  const { aiResult, list, sortByAi, setSortByAi, aiProps } = useAiPicked(all, true);
  const back = () => mobileStore.getState().returnToChat();
  const statusOf = useDayStatus();
  const ownsEmpty = useSuggestOwnsEmpty(feed.query);
  const { shown, moreRef, hasMore } = useBatch({ total: list.length, batch: BATCH, resetOn: [listFilter, listQuery], scroller: '.m-page', memory: shownBefore });
  const shownList = useMemo(() => list.slice(0, shown), [list, shown]);
  const regionId = filter.regions.length === 1 ? filter.regions[0] : null;
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const model = useFeedModel();
  // 地區分頁、子地區晶片（永遠寫）、主題列的數字
  const counts = useThemeScopeCounts(pool, stage === 'area' ? filter : listFilter, listQuery);
  const tCounts = useMemo(() => themeCounts(places, filter), [places, filter]);
  // 子地區晶片的「全部 N」和其他晶片一樣不看篩選（＝主題列那格）
  const regionCounts = useMemo(() => (feed.area ? new Map(counts).set(feed.area, themeCounts(places, { areas: [feed.area], regions: [] })[theme]) : counts), [counts, feed.area, places, theme]);
  // 這一區這個主題符合篩選的有幾個（條件列「符合 N 個」、面板的「看 N 個」）
  const areaTotal = useMemo(() => (stage === 'area' ? themePlaces(places, theme, filter).length : 0), [stage, places, theme, filter]);
  const count = stage === 'area' ? areaTotal : list.length;
  const undo = useLensUndo((s) => s.undo);

  // 詳情的返回字（§35.2）
  const backTo = stage === 'area' ? scopeBackLabel(filter, theme) : stage === 'overview' ? '概覽' : aiResult ? 'AI 挑的' : '搜尋結果';
  const open = (id: string) => mobileStore.getState().openPlace(id, 'explore', undefined, backTo);
  const askPick = () => askDraft(listDraft({ ...filter, types: [theme] }, '', areas) ?? '');

  return (
    <div className="m-feed" data-testid="m-feed" data-stage={stage}>
      <FeedFilters
        count={count}
        stage={stage}
        counts={counts}
        themeCounts={tCounts}
        extra={{
          onAsk: () => void askList('explore', filter, feed.query, list.length),
          onAdd: () => addPlaceStore.getState().openEntry(),
          ...(fromChat || aiResult ? { onBack: back } : {}),
          ...(aiResult ? { ai: { title: aiResult.title, total: aiResult.ids.length, sortByAi, setSortByAi, onClear: () => commands.clearResult() } } : {}),
        }}
        subRow={feed.area && stage === 'area' ? <RegionChips areaId={feed.area} regionId={regionId} onPick={pickFeedRegion} counts={regionCounts} /> : undefined}
      />
      {stage === 'overview' && undo && <UndoToast label={undo.label} onUndo={undoLeave} onClose={() => lensUndo.getState().set(null)} />}
      {stage !== 'overview' && !aiResult && <FilterConds model={model} count={count} />}
      <AddPlaceSuggest query={feed.query} surface="mobile" />
      {stage === 'overview' ? (
        <ExploreOverview
          surface="mobile"
          onOpen={open}
          onPickArea={pickFeedArea}
          onPickRegion={(area, region) => {
            pickFeedArea(area);
            pickFeedRegion(region);
          }}
          onPickTheme={pickFeedTheme}
        />
      ) : stage === 'area' && feed.area ? (
        <AreaThemeHome
          areaId={feed.area}
          regionId={regionId}
          theme={theme}
          filter={filter}
          surface="mobile"
          openIds={openIds}
          onToggle={(id) => mobileStore.getState().toggleOpen('feed', id)}
          onOpen={open}
          onApply={applyFeed}
          onAsk={askDraft}
          onAskAi={askPick}
          onAdd={() => addPlaceStore.getState().openEntry()}
          scroller=".m-page"
        />
      ) : (
        <div className="m-feed-list" data-count={list.length} data-testid="m-feed-list">
          {shownList.map((place, i) => (
            <PlaceRow key={place.id} place={place} rank={i + 1} status={statusOf(place.id)} onOpen={() => open(place.id)} testId="m-feed-item" {...aiProps(place.id)} />
          ))}
        </div>
      )}
      {stage === 'list' && hasMore && <div ref={moreRef} className="m-feed-next" aria-hidden />}
      {stage === 'list' && list.length === 0 && aiResult && (
        <div className="m-empty" data-testid="ai-result-empty">
          <p className="muted">AI 挑的 {aiResult.ids.length} 家沒有符合這些篩選的。</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              mobileStore.getState().setFeed({ type: 'all', area: null, quick: [], query: '' });
            }}
            data-testid="ai-result-unfilter"
          >
            取消篩選，回到 AI 挑的 {aiResult.ids.length} 家
          </button>
        </div>
      )}
      {stage === 'list' && list.length === 0 && !aiResult && !ownsEmpty && <NextSteps help={emptyHelp(places, listFilter, feed.query, areas)} onApply={applyFeed} onAsk={askDraft} />}
    </div>
  );
}
