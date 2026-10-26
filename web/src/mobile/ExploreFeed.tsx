// 手機版「探索」分頁（第六輪 §3.2）：沒有地圖，像 Pinterest 的兩欄圖片牆（兩個 flex 欄，第 i 張放第 i % 2 欄，每排照排名），往下滑一批一批（60 張）出現。
// 每張：左上角類型色塊（景、餐、宿），右下角 🤍／❤️、👎 直接按（castVote，不開詳情），下面是名稱、地區、❤️ 數。點圖片 → 整頁詳情（openPlace）。
// 上方是搜尋和篩選（FeedFilters）；往下滑到篩選看不到時，最上面黏一行摘要（m-feed-compact），點了捲回最上面。
// 清單的計算和網頁版共用 shared/placeLists.ts（useExploreList），篩選用 mobileStore 的 feed，不看地圖範圍。探索不放「加到某天」。

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useData, useShared } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { voteCounts } from '../sharedStore.ts';
import { feedFilter } from '../lib/explore.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import { photoCandidates } from '../lib/photos.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { TierMark } from '../shared/ui/TierMark.tsx';
import { Icon } from '../components/Icon.tsx';
import { VoteHeart } from '../shared/ui/VoteHeart.tsx';
import { useExploreList } from '../shared/placeLists.ts';
import type { VoteValue } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import { FeedFilters, useFeedSummary } from './FeedFilters.tsx';
import { Thumb } from './Thumb.tsx';
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

/**
 * 圖片牆的一張：整張可以點（開詳情），票的按鈕自己擋掉。
 * memo＋票數用基本型別傳：按一個票、打一個字時，只有變了的那幾張重畫
 */
const FeedItem = memo(function FeedItem({ place, rank, like, areas }: { place: Place; rank: number; areas: Area[]; like: number }) {
  const name = place.name.zh || place.name.ja;
  const open = () => mobileStore.getState().openPlace(place.id, 'explore');
  const area = placeAreaLabel(place, areas);
  return (
    <div
      className={`m-feed-item type-${place.type}`}
      role="button"
      tabIndex={0}
      aria-label={name}
      data-testid="m-feed-item"
      data-id={place.id}
      data-type={place.type}
      data-rank={rank}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        open();
      }}
    >
      <span className="m-feed-photo">
        <Thumb place={place} size="fill" />
        {/* 沒有照片時整塊已經是類型色塊，不再疊一個 */}
        {photoCandidates(place.photos).length > 0 && (
          <span className="m-type-chip" style={{ background: TYPE_COLORS[place.type] }} aria-label={TYPE_LABELS[place.type]}>
            {cardTypeLetter(place.type)}
          </span>
        )}
        <FeedVotes placeId={place.id} />
      </span>
      <span className="m-feed-text">
        <span className="m-feed-name m-ellipsis">
          <TierMark tier={place.tier} />
          {name}
        </span>
        <span className="m-feed-meta m-ellipsis">
          {[area, like ? `想去 ${like}` : ''].filter(Boolean).join(' ・ ')}
        </span>
      </span>
    </div>
  );
});

/** 一次多畫幾張（往下滑到底再畫下一批） */
const BATCH = 60;

/** 探索分頁 */
export function ExploreFeed() {
  const feed = useMobile((s) => s.feed);
  const areas = useData((s) => s.areas);
  const filter = useMemo(() => feedFilter(feed), [feed]);
  const { list } = useExploreList(filter, feed.query, feed.sort);
  const voteOf = useVoteIndex();
  const summary = useFeedSummary();
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(BATCH);

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

  // 兩欄：第 i 張放在第 i % 2 欄，每一排照排名從左到右（CSS columns 會先排滿左欄，順序就亂了）
  const columns = useMemo(() => {
    const out: { place: Place; rank: number }[][] = [[], []];
    list.slice(0, shown).forEach((place, i) => out[i % 2].push({ place, rank: i + 1 }));
    return out;
  }, [list, shown]);

  // 篩選整個捲出畫面時收成一行；捲回來時展開（摘要黏在上面，不推動清單，捲動位置不會跳）
  useEffect(() => {
    const scroller = rootRef.current?.closest('.m-page');
    if (!scroller) return;
    const check = () => {
      const mark = sentinelRef.current?.getBoundingClientRect();
      if (mark) setCollapsed(mark.top < scroller.getBoundingClientRect().top);
    };
    check();
    scroller.addEventListener('scroll', check, { passive: true });
    return () => scroller.removeEventListener('scroll', check);
  }, []);

  const toTop = () => rootRef.current?.closest('.m-page')?.scrollTo({ top: 0 });

  return (
    <div className="m-feed" ref={rootRef} data-testid="m-feed">
      <div className="m-feed-sticky">
        {collapsed && (
          <button type="button" className="m-feed-compact" onClick={toTop} data-testid="m-feed-compact">
            <Icon name="search" size={20} />
            <span className="m-ellipsis">{summary}</span>
            <span className="m-feed-compact-count">{list.length} 個</span>
            <span aria-hidden className="chev up">
              <Icon name="chevron" size={16} />
            </span>
          </button>
        )}
      </div>
      <FeedFilters />
      <div ref={sentinelRef} aria-hidden />
      <div className="m-feed-wall" data-count={list.length} data-testid="m-feed-wall">
        {columns.map((col, c) => (
          <div key={c} className="m-feed-col">
            {col.map(({ place, rank }) => (
              <FeedItem key={place.id} place={place} rank={rank} like={voteOf(place.id).like} areas={areas} />
            ))}
          </div>
        ))}
      </div>
      {shown < list.length && <div ref={moreRef} className="m-feed-next" aria-hidden />}
      {list.length === 0 && <p className="muted m-empty">沒有符合的地點，取消一些篩選看看。</p>}
    </div>
  );
}
