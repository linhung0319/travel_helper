// 手機版「想去」分頁（第六輪 §3.4、第七輪 §5.3；T77 照 interaction-design §35.8 改版）：只列有人 ❤️ 的點。
// 頂端和探索同一套（FeedFilters.tsx 的 useWishModel → shared/ui/FilterBar，stage 'area'）：搜尋＋篩選（面板最前面「誰想去：只看我按的」）、
// 地區分頁（第一顆「全部」）、子地區晶片、主題列（數字是有人按想去的）。條件列（FilterConds）在內容最上面。
// 內容是 shared/ui/WishSectionList：還沒排／已是候選／已排進行程三個收合區段（展開狀態在 mobileStore.wishOpen），最下面一行說明；列可以左滑露出「加到某天」。
// 點列 → 整頁詳情（openPlace(id, 'wish')，返回鈕「回到 想去 › 吃」）；點最新留言 → 整頁詳情的留言分頁。清單的計算和網頁版共用 shared/placeLists.ts（useWishList）。

import { useMemo } from 'react';
import { useWishList } from '../shared/placeLists.ts';
import { RegionChips } from '../shared/ui/ExploreHome.tsx';
import { FilterBar, FilterConds } from '../shared/ui/FilterBar.tsx';
import { WishSectionList } from '../shared/ui/WishList.tsx';
import { pickWishArea, pickWishRegion, useThemeScopeCounts, useWishModel } from './FeedFilters.tsx';
import { AreaChips } from '../shared/ui/AreaChips.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { askList, askWishEmpty } from './mobileAi.ts';
import { WishEmpty } from '../shared/ui/EmptyStates.tsx';
import { isTheme, THEMES, THEME_LABELS, themeCounts, type Theme } from '../lib/shelves.ts';
import { useLiked } from '../shared/placeLists.ts';
import { useData } from '../hooks.ts';
import { wishFilter } from '../lib/explore.ts';
import type { SectionId } from '../shared/wishSections.ts';

/** 想去分頁 */
export function WishlistPage() {
  const wish = useMobile((s) => s.wish);
  const openIds = useMobile((s) => s.wishOpen);
  const { setTab } = mobileStore.getState();
  const fromChat = useMobile((s) => s.fromChat);
  const places = useData((s) => s.places);
  const liked = useLiked();
  const regionId = wish.quick.find((t) => t.startsWith('regions:'))?.slice('regions:'.length) ?? null;
  const scope = useMemo(() => wishFilter('all', wish.area, regionId ? [`regions:${regionId}`] : []), [wish.area, regionId]);
  // 主題列的數字：有人按想去的、目前地區（子地區）那一類有幾個
  const likedPlaces = useMemo(() => places.filter((p) => liked.has(p.id)), [places, liked]);
  const tCounts = useMemo(() => themeCounts(likedPlaces, scope), [likedPlaces, scope]);
  // 主題：沒選過（'all'）時挑第一個有東西的那類
  const theme: Theme = isTheme(wish.type) ? wish.type : (THEMES.find((t) => tCounts[t] > 0) ?? 'spot');
  const base = useWishModel(theme);
  const { pool, list } = useWishList(base.filter, wish.query, wish.sort);
  const counts = useThemeScopeCounts(pool, base.filter, wish.query);
  // 子地區晶片的「全部 N」和其他晶片一樣不看篩選
  const regionCounts = useMemo(() => (wish.area ? new Map(counts).set(wish.area, themeCounts(likedPlaces, { areas: [wish.area], regions: [] })[theme]) : counts), [counts, wish.area, likedPlaces, theme]);
  const model = { ...base, onAsk: () => void askList('wish', base.filter, wish.query, list.length), ...(fromChat ? { onBack: () => mobileStore.getState().returnToChat() } : {}) };
  const backTo = `想去 › ${THEME_LABELS[theme].tab}`;

  return (
    <div className="m-wish" data-testid="m-wish" data-theme={theme}>
      <FilterBar
        source="wish"
        surface="mobile"
        model={model}
        count={list.length}
        stage="area"
        themeCounts={tCounts}
        typeRow={<AreaChips value={wish.area} onPick={pickWishArea} firstLabel="全部" prefix="m-wish" counts={counts} />}
        subRow={wish.area ? <RegionChips areaId={wish.area} regionId={regionId} onPick={pickWishRegion} counts={regionCounts} /> : undefined}
      />
      <FilterConds model={model} count={list.length} />
      <WishSectionList
        surface="mobile"
        places={list}
        openIds={openIds as SectionId[]}
        onToggle={(id) => mobileStore.getState().toggleOpen('wish', id)}
        onOpen={(id) => mobileStore.getState().openPlace(id, 'wish', undefined, backTo)}
        onOpenComments={(id) => mobileStore.getState().openPlace(id, 'wish', 'comments', backTo)}
        scroller=".m-page"
        theme={theme}
      />
      {pool.length === 0 && <WishEmpty onExplore={() => setTab('explore')} onAsk={askWishEmpty} />}
      {list.length === 0 && pool.length > 0 && (
        <p className="muted m-empty" data-testid="wish-theme-empty">
          這裡還沒有人按想去的{THEME_LABELS[theme].noun}，換主題、地區或取消篩選看看。
        </p>
      )}
    </div>
  );
}
