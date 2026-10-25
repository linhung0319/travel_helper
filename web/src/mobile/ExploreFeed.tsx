// 手機版「探索」分頁（第六輪 §3.2）：沒有地圖，像 Pinterest 的兩欄圖片牆（CSS columns），往下滑一直出現。
// 每張：左上角類型色塊（景、餐、宿），右下角 🤍／❤️、👎 直接按（castVote，不開詳情），下面是名稱、地區、❤️ 數。點圖片 → 整頁詳情（openPlace）。
// 上方是搜尋和篩選（FeedFilters）；往下滑到篩選看不到時，最上面黏一行摘要（m-feed-compact），點了捲回最上面。
// 清單的計算和網頁版共用 shared/placeLists.ts（useExploreList），篩選用 mobileStore 的 feed，不看地圖範圍。探索不放「加到某天」。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useData, useShared } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { voteCounts } from '../sharedStore.ts';
import { feedFilter } from '../lib/explore.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import { photoCandidates } from '../lib/photos.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { castVote } from '../components/Votes.tsx';
import { TierBadge } from '../components/TierBadge.tsx';
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

/** 圖片上的 🤍／❤️、👎：按的是自己的票，再按一次收回；不開詳情 */
export function FeedVotes({ placeId, votes }: { placeId: string; votes: VoteState }) {
  const toggle = (e: React.MouseEvent, value: VoteValue) => {
    e.stopPropagation();
    void castVote(placeId, votes.mine === value ? null : value);
  };
  const likeOn = votes.mine === 'like';
  const dislikeOn = votes.mine === 'dislike';
  return (
    <span className="m-votes">
      <button type="button" className={`m-vote ${likeOn ? 'on' : ''}`} aria-pressed={likeOn} aria-label={likeOn ? '收回 ❤️' : '按 ❤️ 想去'} onClick={(e) => toggle(e, 'like')} data-testid="m-feed-like">
        {likeOn ? '❤️' : '🤍'}
        <span className="m-vote-count" data-testid="m-feed-like-count">
          {votes.like || ''}
        </span>
      </button>
      <button type="button" className={`m-vote ${dislikeOn ? 'on' : ''}`} aria-pressed={dislikeOn} aria-label={dislikeOn ? '收回 👎' : '按 👎 不想去'} onClick={(e) => toggle(e, 'dislike')} data-testid="m-feed-dislike">
        👎
        <span className="m-vote-count">{votes.dislike || ''}</span>
      </button>
    </span>
  );
}

/** 圖片牆的一張：整張可以點（開詳情），票的按鈕自己擋掉 */
function FeedItem({ place, votes, areas }: { place: Place; votes: VoteState; areas: Area[] }) {
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
        <FeedVotes placeId={place.id} votes={votes} />
      </span>
      <span className="m-feed-text">
        <span className="m-feed-name m-ellipsis">
          <TierBadge tier={place.tier} />
          {name}
        </span>
        <span className="m-feed-meta m-ellipsis">
          {[area, votes.like ? `❤️ ${votes.like}` : ''].filter(Boolean).join(' ・ ')}
        </span>
      </span>
    </div>
  );
}

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
            <span aria-hidden>🔍</span>
            <span className="m-ellipsis">{summary}</span>
            <span className="m-feed-compact-count">{list.length} 個</span>
            <span aria-hidden>▴</span>
          </button>
        )}
      </div>
      <FeedFilters />
      <div ref={sentinelRef} aria-hidden />
      <div className="m-feed-wall">
        {list.map((p) => (
          <FeedItem key={p.id} place={p} votes={voteOf(p.id)} areas={areas} />
        ))}
      </div>
      {list.length === 0 && <p className="muted m-empty">沒有符合的地點，取消一些篩選看看。</p>}
    </div>
  );
}
