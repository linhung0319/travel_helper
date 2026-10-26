// 手機探索、想去上方的篩選列（第七輪）：shared/ui/FilterBar（搜尋、篩選、排序、套用的條件）加上它下面一列的類型。
// 狀態放在 mobileStore 的 feed／wish（手機自己一份，不看地圖範圍、不動地圖的篩選）。
// 這裡把 feed／wish 接成 FilterModel；篩選面板（FilterSheet）和網頁是同一份，條件寫進 feed.quick／wish.quick（"欄位:值"，只由面板寫入）。

import { useMemo } from 'react';
import { feedFilter, feedToken, wishFilter, type ExploreType, type Feed } from '../lib/explore.ts';
import { TYPE_LABELS, type FilterKey } from '../lib/filter.ts';
import { Chip } from '../shared/ui/Chip.tsx';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';

const TYPE_CHIPS: { type: Feed['type']; label: string }[] = [
  { type: 'all', label: '全部' },
  ...(['spot', 'restaurant', 'lodging'] as const).map((t) => ({ type: t, label: TYPE_LABELS[t] })),
];

/** 換地區時，舊地區的小區域拿掉 */
const withoutRegions = (quick: string[]) => quick.filter((t) => !t.startsWith('regions:'));

/** 探索的篩選列資料：feed 接成 FilterModel */
export function useFeedModel(): FilterModel {
  const feed = useMobile((s) => s.feed);
  const filter = useMemo(() => feedFilter(feed), [feed]);
  return {
    filter,
    query: feed.query,
    setQuery: (query) => mobileStore.getState().setFeed({ query }),
    sort: feed.sort,
    setSort: (sort) => mobileStore.getState().setFeed({ sort }),
    inView: false,
    setInView: () => {},
    pick: (key: FilterKey, value: string) => {
      const { setFeed, toggleFeedQuick } = mobileStore.getState();
      if (key === 'areas') setFeed({ area: feed.area === value ? null : value, quick: withoutRegions(feed.quick) });
      else if (key === 'types') setFeed({ type: feed.type === value ? 'all' : (value as Feed['type']) });
      else toggleFeedQuick(feedToken(key, value));
    },
    // 類型在外面一列，不跟著清掉
    clear: () => mobileStore.getState().setFeed({ area: null, quick: [] }),
  };
}

/** 想去的篩選列資料：wish 接成 FilterModel（類型是上面的分段，這裡固定一類） */
export function useWishModel(type: ExploreType): FilterModel {
  const wish = useMobile((s) => s.wish);
  const filter = useMemo(() => wishFilter(type, wish.area, wish.quick), [type, wish.area, wish.quick]);
  return {
    filter,
    query: wish.query,
    setQuery: (query) => mobileStore.getState().setWish({ query }),
    sort: wish.sort,
    setSort: (sort) => mobileStore.getState().setWish({ sort }),
    view: wish.view,
    setView: (view) => mobileStore.getState().setWish({ view }),
    inView: false,
    setInView: () => {},
    pick: (key: FilterKey, value: string) => {
      const { setWish, toggleWishQuick } = mobileStore.getState();
      if (key === 'areas') setWish({ area: wish.area === value ? null : value, quick: withoutRegions(wish.quick) });
      else if (key !== 'types') toggleWishQuick(feedToken(key, value));
    },
    clear: () => mobileStore.getState().setWish({ area: null, quick: [] }),
  };
}

/** 探索上方的篩選列：搜尋、篩選、排序（黏在上面），下面一列類型（全部、景點、餐廳、住宿）和套用的條件 */
export function FeedFilters({ count }: { count: number }) {
  const feed = useMobile((s) => s.feed);
  const model = useFeedModel();
  const typeRow = (
    <div className="m-chips fb-chips" data-testid="m-feed-filters">
      {TYPE_CHIPS.map((c) => (
        <Chip key={c.type} on={feed.type === c.type} onClick={() => mobileStore.getState().setFeed({ type: c.type })} testId={`m-feed-type-${c.type}`}>
          {c.label}
        </Chip>
      ))}
    </div>
  );
  return <FilterBar source="explore" surface="mobile" model={model} count={count} typeRow={typeRow} />;
}
