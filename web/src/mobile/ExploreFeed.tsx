// 手機版「探索」分頁（第七輪 §5）：沒有地圖。顯示方式有兩種（feed.view，記在 localStorage）：
// 照片牆＝兩欄瀑布（shared/ui/PlaceWall、PlaceTile），清單＝88px 的列（shared/ui/PlaceRow）；兩種都是往下滑一批一批（60 張）出現。
// 想去的愛心（VoteHeart）直接按、不開詳情；點卡片或列 → 整頁詳情（openPlace）。
// 上方是篩選列（FeedFilters → shared/ui/FilterBar）：第一列（搜尋、篩選、排序）黏在最上面，下面的類型、照片牆／清單切換和套用的條件跟著捲走。
// 清單的計算和網頁版共用 shared/placeLists.ts（useExploreList），篩選用 mobileStore 的 feed，不看地圖範圍。探索不放「加到某天」。
// 這個檔也留著手機其他頁用的 useVoteIndex、placeAreaLabel、FeedVotes。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useShared } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { voteCounts } from '../sharedStore.ts';
import { feedFilter } from '../lib/explore.ts';
import { AddPlaceSuggest, useSuggestOwnsEmpty } from '../shared/ui/AddPlaceSuggest.tsx';
import { VoteHeart } from '../shared/ui/VoteHeart.tsx';
import { useExploreList } from '../shared/placeLists.ts';
import { PlaceRow, useDayStatus } from '../shared/ui/PlaceRow.tsx';
import { PlaceTile } from '../shared/ui/PlaceTile.tsx';
import { PlaceWall } from '../shared/ui/PlaceWall.tsx';
import type { VoteValue } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import { FeedFilters } from './FeedFilters.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';

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

/** 點一張：整頁詳情 */
const open = (id: string) => mobileStore.getState().openPlace(id, 'explore');

/** 探索分頁 */
export function ExploreFeed() {
  const feed = useMobile((s) => s.feed);
  // 顯示方式（view）換了不用重算清單
  const filter = useMemo(() => feedFilter(feed), [feed.type, feed.area, feed.quick]); // eslint-disable-line react-hooks/exhaustive-deps
  const { list } = useExploreList(filter, feed.query, feed.sort);
  const statusOf = useDayStatus();
  const ownsEmpty = useSuggestOwnsEmpty(feed.query);
  const rootRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(BATCH);
  const shownList = useMemo(() => list.slice(0, shown), [list, shown]);

  // 換了篩選、搜尋、排序：從第一批重新開始（按票不算，不然滑到下面按一下就縮回去）
  useEffect(() => setShown(BATCH), [filter, feed.query, feed.sort]);

  // 底部的標記快要進畫面時多畫一批
  useEffect(() => {
    const scroller = rootRef.current?.closest('.m-page');
    const mark = moreRef.current;
    if (!scroller || !mark) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + BATCH);
    }, { root: scroller, rootMargin: '800px 0px' });
    io.observe(mark);
    return () => io.disconnect();
  }, [shown, list.length]);

  return (
    <div className="m-feed" ref={rootRef} data-testid="m-feed">
      <FeedFilters count={list.length} />
      <AddPlaceSuggest query={feed.query} surface="mobile" />
      {feed.view === 'list' ? (
        <div className="m-feed-list" data-count={list.length} data-testid="m-feed-wall">
          {shownList.map((place, i) => (
            <PlaceRow key={place.id} place={place} rank={i + 1} status={statusOf(place.id)} onOpen={() => open(place.id)} testId="place-row" />
          ))}
        </div>
      ) : (
        <div className="m-feed-wall">
          <PlaceWall
            items={shownList}
            total={list.length}
            testId="m-feed-wall"
            render={(place, i) => <PlaceTile place={place} rank={i + 1} status={statusOf(place.id)} onOpen={() => open(place.id)} testId="m-feed-item" />}
          />
        </div>
      )}
      {shown < list.length && <div ref={moreRef} className="m-feed-next" aria-hidden />}
      {list.length === 0 && !ownsEmpty && <p className="muted m-empty">沒有符合的地點，取消一些篩選看看。</p>}
    </div>
  );
}
