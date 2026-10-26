// 手機版「想去」分頁（第六輪 §3.4、第七輪 §5.3）：網頁版右欄的「想去」整個搬進來，只列有人 ❤️ 的點。
// 最上面是篩選列（搜尋、篩選、排序（預設依想去多）；FeedFilters.tsx 的 useWishModel → shared/ui/FilterBar），下面是餐廳／住宿／景點的分段（數字是這一類有幾個），照片牆／清單兩種檢視在分段右邊（記在 localStorage）。
// 清單是 shared/ui/WishList：分成還沒排、已是候選、已排三段，有跳轉晶片、收合、每段 8 個；列可以左滑露出「加到某天」。
// 點列 → 整頁詳情（openPlace(id, 'wish')）；點最新留言 → 整頁詳情的留言分頁。清單的計算和網頁版共用 shared/placeLists.ts（useWishList）。

import { useEffect } from 'react';
import { TYPE_LABELS } from '../lib/filter.ts';
import { EXPLORE_TYPES } from '../lib/explore.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { useWishList } from '../shared/placeLists.ts';
import { FilterBar } from '../shared/ui/FilterBar.tsx';
import { WishList } from '../shared/ui/WishList.tsx';
import { useWishModel } from './FeedFilters.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';

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
      <WishList
        surface="mobile"
        places={list}
        view={wish.view}
        onOpen={(id) => mobileStore.getState().openPlace(id, 'wish')}
        onOpenComments={(id) => mobileStore.getState().openPlace(id, 'wish', 'comments')}
      />
      {list.length === 0 && <p className="muted m-empty">{pool.length === 0 ? '還沒有人按想去。在探索或詳情按想去，就會出現在這裡。' : '這一類還沒有人按想去，換一類或換地區看看。'}</p>}
    </div>
  );
}
