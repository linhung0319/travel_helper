// 手機版「探索」分頁（第七輪 §5）：沒有地圖。顯示方式有兩種（feed.view，記在 localStorage）：
// 照片牆＝兩欄瀑布（shared/ui/PlaceWall、PlaceTile），清單＝88px 的列（shared/ui/PlaceRow）；兩種都是往下滑一批一批（60 張）出現。
// 想去的愛心（VoteHeart）直接按、不開詳情；點卡片或列 → 整頁詳情（openPlace）。
// 上方是篩選列（FeedFilters → shared/ui/FilterBar）：搜尋、篩選、排序，下面一列地區；選了一區接子地區列，清單層的地點數那列有返回鈕和照片牆／清單切換（T50）。
// 沒選地區、沒搜尋、沒其他條件時是概覽，選了一區是書架（shared/ui/ExploreHome，T42，interaction-design §20），其他時候才是照片牆或清單。
// 清單的計算和網頁版共用 shared/placeLists.ts（useExploreList），篩選用 mobileStore 的 feed，不看地圖範圍。探索不放「加到某天」。
// 這個檔也留著手機其他頁用的 useVoteIndex、placeAreaLabel、FeedVotes。

import { useDeferredValue, useMemo } from 'react';
import { useShared } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { voteCounts } from '../sharedStore.ts';
import { feedFilter, filterToFeed } from '../lib/explore.ts';
import { backLabel, exploreStage } from '../lib/shelves.ts';
import { AreaHome, ExploreOverview, RegionChips } from '../shared/ui/ExploreHome.tsx';
import { useData } from '../hooks.ts';
import { AddPlaceSuggest, useSuggestOwnsEmpty } from '../shared/ui/AddPlaceSuggest.tsx';
import { addPlaceStore } from '../addPlaceStore.ts';
import { VoteHeart } from '../shared/ui/VoteHeart.tsx';
import { useAiPicked, useExploreList } from '../shared/placeLists.ts';
import { PlaceRow, useDayStatus } from '../shared/ui/PlaceRow.tsx';
import { PlaceTile } from '../shared/ui/PlaceTile.tsx';
import { PlaceWall } from '../shared/ui/PlaceWall.tsx';
import type { VoteValue } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import { commands } from '../appCommands.ts';
import { FeedFilters, onlyRegions, pickFeedArea, pickFeedRegion } from './FeedFilters.tsx';
import { askList } from './mobileAi.ts';
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

/** 一次多畫幾張（往下滑到底再畫下一批） */
const BATCH = 60;

/** 已經畫了幾張：問完 AI 回來，捲動位置才接得上（§16.2） */
const shownBefore = { current: BATCH };

/** 點一張：整頁詳情 */
const open = (id: string) => mobileStore.getState().openPlace(id, 'explore');

/** 探索分頁 */
export function ExploreFeed() {
  const feed = useMobile((s) => s.feed);
  // 顯示方式（view）換了不用重算清單
  const filter = useMemo(() => feedFilter(feed), [feed.type, feed.area, feed.quick]); // eslint-disable-line react-hooks/exhaustive-deps
  // 打字時輸入框先跟上，清單晚一點算（T32）
  const listQuery = useDeferredValue(feed.query);
  const { list: all } = useExploreList(filter, listQuery, feed.sort);
  // AI 挑的（規格 §3.1）：取交集、照 AI 的順序、卡片多一行理由
  const { aiResult, list, sortByAi, setSortByAi, aiProps } = useAiPicked(all, true);
  const fromChat = useMobile((s) => s.fromChat);
  const back = () => mobileStore.getState().returnToChat();
  const statusOf = useDayStatus();
  const ownsEmpty = useSuggestOwnsEmpty(feed.query);
  // 換了篩選、搜尋、排序：從第一批重新開始（按票不算，不然滑到下面按一下就縮回去）
  const { shown, moreRef, hasMore } = useBatch({ total: list.length, batch: BATCH, resetOn: [filter, listQuery, feed.sort], scroller: '.m-page', memory: shownBefore });
  const shownList = useMemo(() => list.slice(0, shown), [list, shown]);
  const stage = exploreStage(filter, listQuery, !!aiResult);
  const regionId = filter.regions.length === 1 ? filter.regions[0] : null;
  const areaName = useData((s) => {
    const a = feed.area ? s.areas.find((x) => x.id === feed.area) : undefined;
    return a ? displayName(a.name, a.id) : null;
  });

  return (
    <div className="m-feed" data-testid="m-feed">
      <FeedFilters
        count={list.length}
        extra={{
          onAsk: () => askList('explore', filter, feed.query, list.length),
          onAdd: () => addPlaceStore.getState().openEntry(),
          ...(fromChat || aiResult ? { onBack: back } : {}),
          ...(aiResult ? { ai: { title: aiResult.title, total: aiResult.ids.length, sortByAi, setSortByAi, onClear: () => commands.clearResult() } } : {}),
        }}
        subRow={stage === 'area' && feed.area ? <RegionChips areaId={feed.area} regionId={regionId} onPick={pickFeedRegion} /> : undefined}
        back={stage === 'list' && !aiResult && areaName ? { label: backLabel(filter, feed.query, areaName), onClick: () => mobileStore.getState().setFeed({ type: 'all', quick: onlyRegions(feed.quick), query: '' }) } : null}
        showView={stage === 'list'}
      />
      <AddPlaceSuggest query={feed.query} surface="mobile" />
      {stage === 'overview' ? (
        <ExploreOverview
          surface="mobile"
          onOpen={open}
          onPickArea={pickFeedArea}
          onShelf={(area, f) => {
            pickFeedArea(area);
            mobileStore.getState().setFeed(filterToFeed(f));
          }}
          onPickRegion={(area, region) => {
            pickFeedArea(area);
            pickFeedRegion(region);
          }}
        />
      ) : stage === 'area' && feed.area ? (
        <AreaHome areaId={feed.area} regionId={regionId} surface="mobile" onOpen={open} onShelfAll={(f) => mobileStore.getState().setFeed(filterToFeed(f))} />
      ) : feed.view === 'list' ? (
        <div className="m-feed-list" data-count={list.length} data-testid="m-feed-wall">
          {shownList.map((place, i) => (
            <PlaceRow key={place.id} place={place} rank={i + 1} status={statusOf(place.id)} onOpen={() => open(place.id)} testId="place-row" {...aiProps(place.id)} />
          ))}
        </div>
      ) : (
        <div className="m-feed-wall">
          <PlaceWall
            items={shownList}
            total={list.length}
            testId="m-feed-wall"
            render={(place, i) => <PlaceTile place={place} rank={i + 1} status={statusOf(place.id)} onOpen={() => open(place.id)} testId="m-feed-item" {...aiProps(place.id)} />}
          />
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
      {stage === 'list' && list.length === 0 && !aiResult && !ownsEmpty && <p className="muted m-empty">沒有符合的地點，取消一些篩選看看。</p>}
    </div>
  );
}
