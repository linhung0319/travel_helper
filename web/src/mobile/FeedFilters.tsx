// 手機探索、想去上方的篩選列（第七輪）：shared/ui/FilterBar（搜尋、篩選、排序）加上它下面一列的類型。
// 狀態放在 mobileStore 的 feed／wish（手機自己一份，不看地圖範圍、不動地圖的篩選）。
// 這裡把 feed／wish 接成 FilterModel；篩選面板（FilterSheet）和網頁是同一份，條件寫進 feed.quick／wish.quick（"欄位:值"，只由面板寫入）。

import { useMemo } from 'react';
import { feedFilter, feedToken, wishFilter, type ExploreType, type Feed } from '../lib/explore.ts';
import type { FilterKey } from '../lib/filter.ts';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import { TypeChips } from '../shared/ui/TypeChips.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { useWishPrefs, wishPrefs } from '../shared/wishPrefs.ts';

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
    view: feed.view,
    setView: (view) => mobileStore.getState().setFeed({ view }),
    inView: false,
    setInView: () => {},
    pick: (key: FilterKey, value: string) => {
      const { setFeed, toggleFeedQuick } = mobileStore.getState();
      // AI 一次套多個類型、地區時條件在 quick（filterToFeed）：拿掉的是那一個
      if (feed.quick.includes(feedToken(key, value))) toggleFeedQuick(feedToken(key, value));
      else if (key === 'areas') setFeed({ area: feed.area === value ? null : value, quick: withoutRegions(feed.quick) });
      else if (key === 'types') setFeed({ type: feed.type === value ? 'all' : (value as Feed['type']) });
      else toggleFeedQuick(feedToken(key, value));
    },
    // 類型在外面一列，不跟著清掉
    clear: () => mobileStore.getState().setFeed({ area: null, quick: [] }),
  };
}

/** 想去的篩選列資料：wish 接成 FilterModel（類型是上面的分段，這裡固定一類） */
export function useWishModel(type: ExploreType | 'all'): FilterModel {
  const wish = useMobile((s) => s.wish);
  const wishView = useWishPrefs((s) => s.view);
  const filter = useMemo(() => wishFilter(type, wish.area, wish.quick), [type, wish.area, wish.quick]);
  return {
    filter,
    query: wish.query,
    setQuery: (query) => mobileStore.getState().setWish({ query }),
    sort: wish.sort,
    setSort: (sort) => mobileStore.getState().setWish({ sort }),
    view: wishView,
    setView: (view) => wishPrefs.getState().setView(view),
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

/** 探索上方的篩選列：搜尋、篩選、排序（黏在上面），下面一列類型（全部、景點、餐廳、住宿） */
export function FeedFilters({ count, extra }: { count: number; extra?: Partial<FilterModel> }) {
  const feed = useMobile((s) => s.feed);
  const model = { ...useFeedModel(), ...extra };
  // AI 一次套多個類型時條件在 quick（filterToFeed）：都標亮；點了就換成只有那一類
  const prefix = feedToken('types', '');
  const aiTypes = feed.quick.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
  const typeRow = <TypeChips value={feed.type} selected={aiTypes} onPick={(type) => mobileStore.getState().setFeed({ type, quick: feed.quick.filter((t) => !t.startsWith(prefix)) })} prefix="m-feed" testId="m-feed-filters" />;
  return <FilterBar source="explore" surface="mobile" model={model} count={count} typeRow={typeRow} />;
}
