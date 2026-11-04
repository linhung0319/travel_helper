// 手機版「想去」分頁（第六輪 §3.4、第七輪 §5.3）：網頁版右欄的「想去」整個搬進來，只列有人 ❤️ 的點。
// 最上面是篩選列（搜尋、篩選、排序（預設依想去多）；FeedFilters.tsx 的 useWishModel → shared/ui/FilterBar），下面一列地區晶片（T42：第一顆是「全部」，類型收進面板），和探索一樣（第十輪：拿掉「想去」標題和有數字的分段；數字看段落標題），
// 清單是 shared/ui/WishList（T53）：還沒排、已是候選、已排三排書架，「全部 ›」進那排的清單層（返回鈕「‹ 還沒排」；照片牆／清單切換只在這層，記在 localStorage）；列可以左滑露出「加到某天」。
// 點列 → 整頁詳情（openPlace(id, 'wish')）；點最新留言 → 整頁詳情的留言分頁。清單的計算和網頁版共用 shared/placeLists.ts（useWishList）。

import { useWishList, useWishUserChip } from '../shared/placeLists.ts';
import { FilterBar } from '../shared/ui/FilterBar.tsx';
import { WishList, useWishBack, useWishSections } from '../shared/ui/WishList.tsx';
import { pickWishArea, useWishModel } from './FeedFilters.tsx';
import { AreaChips } from '../shared/ui/AreaChips.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { askList, askWishEmpty } from './mobileAi.ts';
import { WishEmpty } from '../shared/ui/EmptyStates.tsx';
import { useWishPrefs } from '../shared/wishPrefs.ts';

/** 想去分頁 */
export function WishlistPage() {
  const wish = useMobile((s) => s.wish);
  const view = useWishPrefs((s) => s.view);
  const { setWish, setTab } = mobileStore.getState();
  // 預設「全部」（記住上次選的類型）
  const type = wish.type;
  const fromChat = useMobile((s) => s.fromChat);
  const base = useWishModel(type);
  const { pool, list: all } = useWishList(base.filter, wish.query, wish.sort);
  // 「自己加 N」：選它時類型、地區回到全部
  const { list, chip } = useWishUserChip(pool, all, () => setWish({ type: 'all', area: null, quick: wish.quick.filter((t) => !t.startsWith('regions:')) }));
  // 三排書架；「全部 ›」進某一排的清單層（T53）：返回鈕「‹ 還沒排 · 6 個地點」、地點數寫那排的數字、切換鈕只在這層
  const sections = useWishSections(list);
  const { section, back } = useWishBack();
  const count = section ? (sections.find((x) => x.id === section)?.count ?? 0) : list.length;
  const model = { ...base, onAsk: () => void askList('wish', base.filter, wish.query, list.length), ...(fromChat ? { onBack: () => mobileStore.getState().returnToChat() } : {}) };

  return (
    <div className="m-wish" data-testid="m-wish">
      <FilterBar
        source="wish"
        surface="mobile"
        model={model}
        count={count}
        back={back}
        showView={!!section}
        typeRow={<AreaChips value={wish.area} onPick={pickWishArea} firstLabel="全部" prefix="m-wish" extra={chip} />}
      />
      <WishList
        surface="mobile"
        places={list}
        view={view}
        onOpen={(id) => mobileStore.getState().openPlace(id, 'wish')}
        onOpenComments={(id) => mobileStore.getState().openPlace(id, 'wish', 'comments')}
      />
      {pool.length === 0 && <WishEmpty onExplore={() => setTab('explore')} onAsk={askWishEmpty} />}
      {list.length === 0 && pool.length > 0 && <p className="muted m-empty">這裡還沒有人按想去，換地區或取消篩選看看。</p>}
    </div>
  );
}
