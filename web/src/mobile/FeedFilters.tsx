// 手機探索、想去上方的篩選列（第七輪；T77 換成 §35 的長相）：shared/ui/FilterBar 給 stage 就是新的一組——
// 工具列（搜尋＋篩選，概覽是搜尋＋問 AI＋加地點）、地區分頁（AreaChips，數字永遠寫）、子地區晶片（RegionChips）、主題列（玩／吃／住），整組黏頂。
// 狀態放在 mobileStore 的 feed／wish（手機自己一份，不看地圖範圍、不動地圖的篩選）。
// 主題就是 feed.type／wish.type（唯一的那個類型）；不是三類之一（'all'：還沒選、AI 清掉）時當作玩（想去挑有東西的那類，WishlistPage）。
// 篩選面板（FilterSheet）只畫目前主題的組，條件寫進 feed.quick／wish.quick（"欄位:值"）。每個主題共用同一份條件，換主題時用 themeFilter 拿掉新主題面板沒有的。
// 展開的區段（feedOpen／wishOpen）：換主題、換子地區、回概覽收合；換區帶著（§35.2、35.4）。

import { useMemo } from 'react';
import { feedFilter, feedToken, filterToFeed, wishFilter, type Feed } from '../lib/explore.ts';
import { isTheme, scopeCountsByTheme, scopeName, THEME_LABELS, type ExploreLayer, type Theme } from '../lib/shelves.ts';
import { themeFilter } from '../shared/filterOptions.ts';
import { dataStore } from '../dataStore.ts';
import { useData } from '../hooks.ts';
import { hasLens, lensLabel, lensUndo } from '../exploreArea.ts';
import type { Filter, FilterKey } from '../lib/filter.ts';
import type { Place } from '../data/types.ts';
import { FilterBar, type FilterModel } from '../shared/ui/FilterBar.tsx';
import type { ReactNode } from 'react';
import { AreaChips } from '../shared/ui/AreaChips.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { overviewStore } from '../shared/overviewStore.ts';

/** 換地區時，舊地區的小區域拿掉 */
export const withoutRegions = (quick: string[]) => quick.filter((t) => !t.startsWith('regions:'));
/** 只留子地區（「清除」：地區、子地區在外面，不跟著清） */
export const onlyRegions = (quick: string[]) => quick.filter((t) => t.startsWith('regions:'));
const regionsOf = (region: string | null) => (region ? [feedToken('regions', region)] : []);

/** 探索目前的主題：feed.type 不是三類之一時是玩 */
export const feedTheme = (type: Feed['type']): Theme => (isTheme(type) ? type : 'spot');

/** 換範圍時捲到頂（§35.2：換區、換子地區、換主題一律捲到頂；詳情退回時分頁沒卸載，停在原位） */
export function scrollPageTop() {
  const el = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.m-page') : null;
  if (el) el.scrollTop = 0;
}

/**
 * 地區列（含「概覽」）。T69（§33）：換地區只換範圍，主題、篩選、搜尋、展開的區段都帶著，子地區重選；
 * 「概覽」只有一層：有篩選時離開篩選，留一份復原（exploreArea.ts 的 lensUndo），區段全部收合，概覽的卡換回全區（T63 §28）
 */
export function pickFeedArea(area: string | null) {
  lensUndo.getState().set(null);
  const m = mobileStore.getState();
  const before = m.feed;
  if (area) {
    m.setFeed({ area, type: feedTheme(before.type), quick: withoutRegions(before.quick) });
    scrollPageTop();
    return;
  }
  const filter = feedFilter(before);
  // 主題不算「篩選」（跟著回概覽，再進一區還是那個主題）
  if (hasLens({ ...filter, types: [] }, before.query)) {
    const snap = { type: before.type, area: before.area, quick: before.quick, query: before.query };
    lensUndo.getState().set({ label: lensLabel({ ...filter, types: [] }, before.query, dataStore.getState().areas), restore: () => mobileStore.getState().setFeed(snap) });
  }
  overviewStore.getState().reset();
  m.setFeed({ area: null, quick: [], query: '' });
  m.closeAll('feed');
  scrollPageTop();
}

/** 選區後的子地區列：一次一個；null 是整區。篩選留著（T69），區段收合 */
export function pickFeedRegion(region: string | null) {
  const m = mobileStore.getState();
  m.setFeed({ quick: [...withoutRegions(m.feed.quick), ...regionsOf(region)] });
  m.closeAll('feed');
  scrollPageTop();
}

/** 概覽卡的主題列（§35.6）：進那一區（卡片選了子地區時連子地區）再選那個主題；從概覽進來，篩選是空的 */
export function pickFeedTheme(area: string, region: string | null, theme: Theme) {
  lensUndo.getState().set(null);
  const m = mobileStore.getState();
  m.setFeed({ area, type: theme, quick: regionsOf(region), query: '' });
  m.closeAll('feed');
  scrollPageTop();
}

/** 主題列：換主題，條件留下新主題面板有的（themeFilter），區段收合 */
export function setFeedTheme(theme: Theme) {
  const m = mobileStore.getState();
  const next = themeFilter(feedFilter(m.feed), theme, 'explore');
  m.setFeed(filterToFeed(next));
  m.closeAll('feed');
  scrollPageTop();
}

/** 想去的地區列（含「全部」）：換範圍，主題、條件、搜尋、展開的區段留著（T69） */
export function pickWishArea(area: string | null) {
  const { wish, setWish } = mobileStore.getState();
  setWish({ area, quick: withoutRegions(wish.quick) });
  scrollPageTop();
}

/** 想去的子地區列（同探索）：一次一個；null 是整區，區段收合 */
export function pickWishRegion(region: string | null) {
  const m = mobileStore.getState();
  m.setWish({ quick: [...withoutRegions(m.wish.quick), ...regionsOf(region)] });
  m.closeAll('wish');
  scrollPageTop();
}

/** 想去換主題 */
export function setWishTheme(theme: Theme) {
  const m = mobileStore.getState();
  const next = themeFilter(wishFilter(theme, m.wish.area, m.wish.quick), theme, 'wish');
  m.setWish({ type: theme, quick: filterToFeed(next).quick });
  m.closeAll('wish');
  scrollPageTop();
}

/** 詳情的返回字（§35.2）：「賢島 › 玩」 */
export function scopeBackLabel(filter: Pick<Filter, 'areas' | 'regions'>, theme: Theme): string {
  return `${scopeName(filter, dataStore.getState().areas)} › ${THEME_LABELS[theme].tab}`;
}

/** 探索的篩選列資料：feed 接成 FilterModel（主題＝feed.type） */
export function useFeedModel(): FilterModel {
  const feed = useMobile((s) => s.feed);
  const filter = useMemo(() => feedFilter(feed), [feed]);
  return {
    filter,
    query: feed.query,
    setQuery: (query) => mobileStore.getState().setFeed({ query }),
    inView: false,
    setInView: () => {},
    pick: (key: FilterKey, value: string) => {
      const { setFeed, toggleFeedQuick } = mobileStore.getState();
      // AI 一次套多個類型、地區時條件在 quick（filterToFeed）：拿掉的是那一個
      if (feed.quick.includes(feedToken(key, value))) toggleFeedQuick(feedToken(key, value));
      else if (key === 'areas') setFeed({ area: feed.area === value ? null : value, quick: withoutRegions(feed.quick) });
      else if (key === 'types' && isTheme(value)) setFeedTheme(value);
      else toggleFeedQuick(feedToken(key, value));
    },
    // 地區、子地區、主題在外面，不跟著清掉
    clear: () => mobileStore.getState().setFeed({ quick: onlyRegions(feed.quick) }),
    theme: feedTheme(feed.type),
    setTheme: setFeedTheme,
  };
}

/** 想去的篩選列資料：wish 接成 FilterModel（主題由 WishlistPage 決定，沒選過時挑有東西的那類） */
export function useWishModel(theme: Theme): FilterModel {
  const wish = useMobile((s) => s.wish);
  const filter = useMemo(() => wishFilter(theme, wish.area, wish.quick), [theme, wish.area, wish.quick]);
  return {
    filter,
    query: wish.query,
    setQuery: (query) => mobileStore.getState().setWish({ query }),
    inView: false,
    setInView: () => {},
    pick: (key: FilterKey, value: string) => {
      const { setWish, toggleWishQuick } = mobileStore.getState();
      if (key === 'areas') setWish({ area: wish.area === value ? null : value, quick: withoutRegions(wish.quick) });
      else if (key === 'types' && isTheme(value)) setWishTheme(value);
      else toggleWishQuick(feedToken(key, value));
    },
    clear: () => mobileStore.getState().setWish({ quick: onlyRegions(wish.quick) }),
    theme,
    setTheme: setWishTheme,
  };
}

/** 地區分頁、子地區晶片的小數字（§35.2、35.3，永遠寫）：pool 探索是全部、想去是有人按想去的 */
export function useThemeScopeCounts(pool: Place[], filter: Filter, query: string): Map<string, number> {
  const areas = useData((s) => s.areas);
  return useMemo(() => scopeCountsByTheme(pool, filter, query, areas), [pool, filter, query, areas]);
}

/** 探索上方的篩選列：工具列、地區分頁、選了一區時的子地區晶片（subRow）和主題列 */
export function FeedFilters({ count, extra, subRow, stage, counts, themeCounts }: { count: number; extra?: Partial<FilterModel>; subRow?: ReactNode; stage: ExploreLayer; counts: Map<string, number> | null; themeCounts?: Record<Theme, number> }) {
  const feed = useMobile((s) => s.feed);
  const model = { ...useFeedModel(), ...extra };
  const typeRow = <AreaChips value={feed.area} onPick={pickFeedArea} firstLabel="概覽" prefix="m-feed" testId="m-feed-filters" counts={counts} />;
  return <FilterBar source="explore" surface="mobile" model={model} count={count} typeRow={typeRow} subRow={subRow} stage={stage} themeCounts={themeCounts} />;
}
