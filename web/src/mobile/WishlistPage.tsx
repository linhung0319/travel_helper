// 手機版「想去」分頁（第六輪 §3.4）：網頁版右欄的「想去」整個搬進來，只列有人 ❤️ 的點。
// 最上面是篩選列（搜尋、篩選、排序（預設依想去多）；FeedFilters.tsx 的 useWishModel → shared/ui/FilterBar），下面是餐廳／住宿／景點的分段（數字是這一類有幾個），照片牆／清單兩種檢視在分段右邊。
// 卡片照網頁版：類型、候選或已排的 tag（DayStatusTag）、想去愛心（FeedVotes）、名稱、★、地區、排在哪天、「加到某天」、留言數。
// 點卡片 → 整頁詳情（openPlace(id, 'wish')）；票、加到某天點了不開詳情。清單的計算和網頁版共用 shared/placeLists.ts（useWishList）。

import { useEffect } from 'react';
import { useData } from '../hooks.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import { EXPLORE_TYPES } from '../lib/explore.ts';
import { placeBadges } from '../lib/badges.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { AddToDay, DayStatusTag } from '../components/DayPicker.tsx';
import { TierMark } from '../shared/ui/TierMark.tsx';
import { Icon } from '../components/Icon.tsx';
import { useCommentCount, useWishList } from '../shared/placeLists.ts';
import type { Place } from '../data/types.ts';
import { FilterBar } from '../shared/ui/FilterBar.tsx';
import { FeedVotes, placeAreaLabel } from './ExploreFeed.tsx';
import { useWishModel } from './FeedFilters.tsx';
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
function WishItem({ place, view }: { place: Place; view: WishView['view'] }) {
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
            <FeedVotes placeId={place.id} />
          </span>
        </span>
      ) : (
        <Thumb place={place} size={64} />
      )}
      <span className="m-wish-text">
        <button type="button" className="m-wish-name m-ellipsis">
          <TierMark tier={place.tier} />
          {name}
        </button>
        {place.name.zh && place.name.ja !== place.name.zh && view === 'photo' && <span className="m-wish-ja m-ellipsis muted small">{place.name.ja}</span>}
        {meta && <span className="m-wish-meta m-ellipsis small">{meta}</span>}
        {inTrip?.length ? <span className="m-wish-trip small ic-text">
            <Icon name="calendar" size={16} /> {inTrip.map((d) => shortDayLabel(d.date)).join('、')}
          </span> : null}
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
          <span className="m-wish-comments small ic-text">
            <Icon name="chat" size={16} /> {comments ? `${comments} 則留言` : '留言'}</span>
          {view === 'list' && (
            <span onClick={stop}>
              <FeedVotes placeId={place.id} />
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
  const { setWish } = mobileStore.getState();
  // 還沒選過類型：先用餐廳算數量，再挑有東西的那一類（還沒人 ❤️ 餐廳時先看景點）
  const type = wish.type ?? 'restaurant';
  const model = useWishModel(type);
  const { pool, list, counts } = useWishList(model.filter, wish.query, wish.sort);
  useEffect(() => {
    if (wish.type || !pool.length) return;
    setWish({ type: EXPLORE_TYPES.find((t) => counts[t] > 0) ?? 'restaurant' });
  }, [wish.type, pool.length, counts, setWish]);

  return (
    <div className="m-wish" data-testid="m-wish">
      <h2 className="m-h2 m-wish-title">想去</h2>
      <FilterBar
        source="wish"
        surface="mobile"
        model={model}
        count={list.length}
        typeRow={
          <div className="m-segmented fb-segmented" role="tablist" aria-label="類型">
            {EXPLORE_TYPES.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === type} aria-pressed={t === type} className={t === type ? 'on' : ''} onClick={() => setWish({ type: t })} data-testid={`m-wish-type-${t}`}>
                <i className="ui-type-dot" style={{ background: TYPE_COLORS[t] }} aria-hidden="true" /> {TYPE_LABELS[t]} {counts[t]}
              </button>
            ))}
          </div>
        }
      />
      <ol className={`m-wish-list view-${wish.view}`}>
        {list.map((p) => (
          <WishItem key={p.id} place={p} view={wish.view} />
        ))}
      </ol>
      {list.length === 0 && <p className="muted m-empty">{pool.length === 0 ? '還沒有人按想去。在探索或詳情按想去，就會出現在這裡。' : '這一類還沒有人按想去，換一類或換地區看看。'}</p>}
    </div>
  );
}
