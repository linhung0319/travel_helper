// 手機探索、想去上方的篩選列（第七輪）：shared/ui/FilterBar（搜尋、篩選、排序）加上它下面一列的地區（T42 從類型換成地區，類型收進面板）。
// 狀態放在 mobileStore 的 feed／wish（手機自己一份，不看地圖範圍、不動地圖的篩選）。
// 這裡把 feed／wish 接成 FilterModel；篩選面板（FilterSheet）和網頁是同一份，條件寫進 feed.quick／wish.quick（"欄位:值"，只由面板寫入）。

import { useMemo } from 'react';
import { feedFilter, feedToken, filterToFeed, wishFilter, type ExploreType, type Feed } from '../lib/explore.ts';
import { rescopeFilter } from '../lib/shelves.ts';
import { dataStore } from '../dataStore.ts';
import { hasLens, lensLabel, lensUndo } from '../exploreArea.ts';
import type { FilterKey } from '../lib/filter.ts';
import { FilterBar, type FilterBack, type FilterModel } from '../shared/ui/FilterBar.tsx';
import type { ReactNode } from 'react';
import { AreaChips } from '../shared/ui/AreaChips.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { useWishPrefs, wishPrefs } from '../shared/wishPrefs.ts';
import { overviewStore } from '../shared/overviewStore.ts';

/** 換地區時，舊地區的小區域拿掉 */
export const withoutRegions = (quick: string[]) => quick.filter((t) => !t.startsWith('regions:'));
/** 只留子地區（「全部清除」、回到書架：地區、子地區在外面，不跟著清） */
export const onlyRegions = (quick: string[]) => quick.filter((t) => t.startsWith('regions:'));

/** 換範圍（T69）：篩選照網頁的規則跟著走（書架帶來的照新範圍重挑級數，lib/shelves.ts 的 rescopeFilter） */
function setFeedScope(areas: string[], regions: string[]) {
  const { feed, setFeed } = mobileStore.getState();
  const next = rescopeFilter(feedFilter(feed), { areas, regions }, dataStore.getState().places);
  setFeed({ ...filterToFeed(next), area: areas[0] ?? null });
}

/**
 * 地區列（含「概覽」）。T69（interaction-design §33）：換地區只換範圍，篩選、搜尋留著；
 * 「概覽」只有一層：有篩選時離開篩選，留一份復原（exploreArea.ts 的 lensUndo），概覽的卡全部換回全區（T63 §28）
 */
export function pickFeedArea(area: string | null) {
  lensUndo.getState().set(null);
  if (area) {
    setFeedScope([area], []);
    return;
  }
  const before = mobileStore.getState().feed;
  const filter = feedFilter(before);
  if (hasLens(filter, before.query)) {
    const snap = { type: before.type, area: before.area, quick: before.quick, query: before.query };
    lensUndo.getState().set({ label: lensLabel(filter, before.query, dataStore.getState().areas), restore: () => mobileStore.getState().setFeed(snap) });
  }
  overviewStore.getState().reset();
  mobileStore.getState().setFeed({ area: null, type: 'all', quick: [], query: '' });
}

/** 想去的地區列（含「全部」）：換範圍，條件、搜尋、自己加、現在看的那一排都留著（T69） */
export function pickWishArea(area: string | null) {
  const { wish, setWish } = mobileStore.getState();
  setWish({ area, quick: withoutRegions(wish.quick) });
}

/** 想去的子地區列（T69 補上，同探索）：一次一個；null 是整區 */
export function pickWishRegion(region: string | null) {
  const { wish, setWish } = mobileStore.getState();
  setWish({ quick: [...withoutRegions(wish.quick), ...(region ? [feedToken('regions', region)] : [])] });
}

/** 選區後的子地區列：一次一個；null 是整區。篩選留著（T69） */
export function pickFeedRegion(region: string | null) {
  const { feed } = mobileStore.getState();
  setFeedScope(feed.area ? [feed.area] : [], region ? [region] : []);
}

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
    // 地區、子地區在外面一列，不跟著清掉
    clear: () => mobileStore.getState().setFeed({ type: 'all', quick: onlyRegions(feed.quick) }),
  };
}

/** 想去的篩選列資料：wish 接成 FilterModel（類型在面板裡，一次一類） */
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
      else if (key === 'types') setWish({ type: wish.type === value ? 'all' : (value as ExploreType) });
      else toggleWishQuick(feedToken(key, value));
    },
    clear: () => mobileStore.getState().setWish({ type: 'all', quick: onlyRegions(wish.quick) }),
  };
}

/** 探索上方的篩選列：搜尋和工具（黏在上面），下面一列地區（概覽、志摩、鳥羽…）；選了一區接子地區列（subRow），照片牆／清單那層有「看什麼」帶子（T50、T69） */
export function FeedFilters({ count, extra, subRow, back, showView, counts }: { count: number; extra?: Partial<FilterModel>; subRow?: ReactNode; back?: FilterBack | null; showView?: boolean; counts?: Map<string, number> | null }) {
  const feed = useMobile((s) => s.feed);
  const model = { ...useFeedModel(), ...extra };
  const typeRow = <AreaChips value={feed.area} onPick={pickFeedArea} firstLabel="概覽" prefix="m-feed" testId="m-feed-filters" counts={counts} />;
  return <FilterBar source="explore" surface="mobile" model={model} count={count} typeRow={typeRow} subRow={subRow} back={back} showView={showView} />;
}
