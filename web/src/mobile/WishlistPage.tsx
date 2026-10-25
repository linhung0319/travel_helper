// 手機版「想去」分頁（第六輪 §3.4）：網頁版右欄的「想去」整個搬進來，只列有人 ❤️ 的點。
// 最上面是餐廳／住宿／景點的分段（數字是這一類有幾個），下面是地區 ▾、排序 ▾（預設依 ❤️ 多）、大圖／清單兩種檢視。
// 卡片照網頁版：類型、候選或已排的 tag（DayStatusTag）、❤️／👎（FeedVotes）、名稱、★、地區、排在哪天、「📅 加到某天」（小月曆）、留言數。
// 點卡片 → 整頁詳情（openPlace(id, 'wish')）；票、加到某天點了不開詳情。清單的計算和網頁版共用 shared/placeLists.ts（useWishList）。

import { useEffect, useMemo } from 'react';
import { useData } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, EXPLORE_TYPES, wishFilter, type ExploreSort } from '../lib/explore.ts';
import { placeBadges } from '../lib/badges.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import { AddToDay, DayStatusTag } from '../components/DayPicker.tsx';
import { TierBadge } from '../components/TierBadge.tsx';
import { useCommentCount, useWishList } from '../shared/placeLists.ts';
import type { Place } from '../data/types.ts';
import { FeedVotes, placeAreaLabel, useVoteIndex, type VoteState } from './ExploreFeed.tsx';
import { Thumb } from './Thumb.tsx';
import { mobileStore, useMobile, type WishView } from './mobileStore.ts';

/** ★、食べログ（和網頁版卡片一樣） */
function ratingText(place: Place): string {
  const r = (place.raw.ratings ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.google === 'number') parts.push(`★ ${r.google}${typeof r.googleReviews === 'number' ? `（${r.googleReviews.toLocaleString('ja-JP')}）` : ''}`);
  if (typeof r.tabelog === 'number') parts.push(`食べログ ${r.tabelog}`);
  return parts.join('・');
}

/** 點了不開詳情的那一塊（票、加到某天的月曆） */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** 想去的一張卡 */
function WishItem({ place, view, votes }: { place: Place; view: WishView['view']; votes: VoteState }) {
  const areas = useData((s) => s.areas);
  const inTrip = useData((s) => s.days.get(place.id));
  const comments = useCommentCount(place.id);
  const name = place.name.zh || place.name.ja;
  const open = () => mobileStore.getState().openPlace(place.id, 'wish');
  const meta = [ratingText(place), placeAreaLabel(place, areas)].filter(Boolean).join('・');
  const badges = view === 'photo' ? placeBadges(place, 3) : [];
  return (
    <li className={`m-wish-item view-${view} type-${place.type}`} data-testid="m-wish-item" data-id={place.id} data-type={place.type} onClick={open}>
      {view === 'photo' ? (
        <span className="m-wish-photo">
          <Thumb place={place} size="fill" />
          <span className="m-wish-tags">
            <DayStatusTag placeId={place.id} />
          </span>
          <span onClick={stop}>
            <FeedVotes placeId={place.id} votes={votes} />
          </span>
        </span>
      ) : (
        <Thumb place={place} size={64} />
      )}
      <span className="m-wish-text">
        <button type="button" className="m-wish-name m-ellipsis">
          <TierBadge tier={place.tier} />
          {name}
        </button>
        {place.name.zh && place.name.ja !== place.name.zh && view === 'photo' && <span className="m-wish-ja m-ellipsis muted small">{place.name.ja}</span>}
        {meta && <span className="m-wish-meta m-ellipsis small">{meta}</span>}
        {inTrip?.length ? <span className="m-wish-trip small">📅 {inTrip.map((d) => shortDayLabel(d.date)).join('、')}</span> : null}
        {view === 'list' && (
          <span className="m-wish-list-tags">
            <DayStatusTag placeId={place.id} />
          </span>
        )}
        {view === 'photo' && place.summary && <span className="m-wish-summary small">{place.summary.text}</span>}
        {badges.length > 0 && (
          <span className="badges">
            {badges.map((b) => (
              <span key={b.label} className={`badge badge-${b.tone}`}>
                {b.label}
              </span>
            ))}
          </span>
        )}
        <span className="m-wish-foot">
          <span className="m-wish-comments small">💬 {comments ? `${comments} 則留言` : '留言'}</span>
          {view === 'list' && (
            <span onClick={stop}>
              <FeedVotes placeId={place.id} votes={votes} />
            </span>
          )}
        </span>
        <span className="m-wish-add" onClick={stop}>
          <AddToDay placeId={place.id} />
        </span>
      </span>
    </li>
  );
}

/** 想去分頁 */
export function WishlistPage() {
  const wish = useMobile((s) => s.wish);
  const areas = useData((s) => s.areas);
  const { setWish } = mobileStore.getState();
  // 還沒選過類型：先用餐廳算數量，再挑有東西的那一類（還沒人 ❤️ 餐廳時先看景點）
  const type = wish.type ?? 'restaurant';
  const filter = useMemo(() => wishFilter(type, wish.area), [type, wish.area]);
  const { pool, list, counts } = useWishList(filter, '', wish.sort);
  const voteOf = useVoteIndex();
  useEffect(() => {
    if (wish.type || !pool.length) return;
    setWish({ type: EXPLORE_TYPES.find((t) => counts[t] > 0) ?? 'restaurant' });
  }, [wish.type, pool.length, counts, setWish]);

  return (
    <div className="m-wish" data-testid="m-wish">
      <h2 className="m-h2 m-wish-title">想去</h2>
      <div className="m-segmented" role="tablist" aria-label="類型">
        {EXPLORE_TYPES.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === type} aria-pressed={t === type} className={t === type ? 'on' : ''} onClick={() => setWish({ type: t })} data-testid={`m-wish-type-${t}`}>
            {TYPE_ICONS[t]} {TYPE_LABELS[t]} {counts[t]}
          </button>
        ))}
      </div>
      <div className="m-chips">
        <select className={`m-chip m-select ${wish.area ? 'on' : ''}`} value={wish.area ?? ''} aria-label="地區" onChange={(e) => setWish({ area: e.target.value || null })} data-testid="m-wish-area">
          <option value="">全部地區</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {displayName(a.name, a.id)}
            </option>
          ))}
        </select>
        <select className="m-chip m-select" value={wish.sort} aria-label="排序" onChange={(e) => setWish({ sort: e.target.value as ExploreSort })} data-testid="m-wish-sort">
          {EXPLORE_SORTS.map((s) => (
            <option key={s} value={s}>
              依{EXPLORE_SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="m-view-toggle" role="group" aria-label="顯示方式">
          <button type="button" className={`m-chip ${wish.view === 'photo' ? 'on' : ''}`} aria-pressed={wish.view === 'photo'} aria-label="大圖" onClick={() => setWish({ view: 'photo' })} data-testid="m-wish-view-photo">
            ▦
          </button>
          <button type="button" className={`m-chip ${wish.view === 'list' ? 'on' : ''}`} aria-pressed={wish.view === 'list'} aria-label="清單" onClick={() => setWish({ view: 'list' })} data-testid="m-wish-view-list">
            ☰
          </button>
        </span>
      </div>
      <ol className={`m-wish-list view-${wish.view}`}>
        {list.map((p) => (
          <WishItem key={p.id} place={p} view={wish.view} votes={voteOf(p.id)} />
        ))}
      </ol>
      {list.length === 0 && <p className="muted m-empty">{pool.length === 0 ? '還沒有人按 ❤️。在探索或詳情按 ❤️，就會出現在這裡。' : '這一類還沒有人 ❤️，換一類或換地區看看。'}</p>}
    </div>
  );
}
