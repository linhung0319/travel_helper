// 手機版「想去」分頁（第六輪 §3.4、第七輪 §5.3）：網頁版右欄的「想去」整個搬進來，只列有人 ❤️ 的點。
// 最上面是篩選列（搜尋、篩選、排序（預設依想去多）；FeedFilters.tsx 的 useWishModel → shared/ui/FilterBar），下面一列類型晶片，和探索一模一樣（第十輪：拿掉「想去」標題和有數字的分段；數字看段落標題），
// 照片牆／清單兩種檢視在晶片右邊（記在 localStorage）。
// 清單是 shared/ui/WishList：分成還沒排、已是候選、已排三段，段落標題有數字、可以收合、每段 8 個；列可以左滑露出「加到某天」。
// 點列 → 整頁詳情（openPlace(id, 'wish')）；點最新留言 → 整頁詳情的留言分頁。清單的計算和網頁版共用 shared/placeLists.ts（useWishList）。

import { useWishList } from '../shared/placeLists.ts';
import { FilterBar } from '../shared/ui/FilterBar.tsx';
import { WishList } from '../shared/ui/WishList.tsx';
import { TypeChips, useWishModel } from './FeedFilters.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { useWishPrefs } from '../shared/wishPrefs.ts';

/** 想去分頁 */
export function WishlistPage() {
  const wish = useMobile((s) => s.wish);
  const view = useWishPrefs((s) => s.view);
  const { setWish } = mobileStore.getState();
  // 預設「全部」（記住上次選的類型）
  const type = wish.type;
  const model = useWishModel(type);
  const { pool, list } = useWishList(model.filter, wish.query, wish.sort);

  return (
    <div className="m-wish" data-testid="m-wish">
      <FilterBar
        source="wish"
        surface="mobile"
        model={model}
        count={list.length}
        typeRow={<TypeChips value={type} onPick={(t) => setWish({ type: t })} prefix="m-wish" />}
      />
      <WishList
        surface="mobile"
        places={list}
        view={view}
        onOpen={(id) => mobileStore.getState().openPlace(id, 'wish')}
        onOpenComments={(id) => mobileStore.getState().openPlace(id, 'wish', 'comments')}
      />
      {list.length === 0 && <p className="muted m-empty">{pool.length === 0 ? '還沒有人按想去。在探索或詳情按想去，就會出現在這裡。' : '這一類還沒有人按想去，換一類或換地區看看。'}</p>}
    </div>
  );
}
