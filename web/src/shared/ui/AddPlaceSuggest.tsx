// 搜尋比不到任何點時的提示（T33）：放在篩選列下面、清單上面，只有探索用（想去不放）。
// 搜尋框只管搜尋，不判斷連結和地址；貼了連結也是比不到，按「＋ 自己加」把打的字帶進加地點的彈窗（AddPlaceDialog），由那裡判斷。

import { addPlaceStore } from '../../addPlaceStore.ts';
import { useData } from '../../hooks.ts';
import { matchesQuery } from '../../lib/filter.ts';
import type { FilterSurface } from './FilterSheet.tsx';

/** 全部的點都比不到（不看篩選、地圖範圍）：這個提示接手，清單不再顯示「沒有符合的地點」 */
export function useSuggestOwnsEmpty(query: string): boolean {
  const places = useData((s) => s.places);
  const q = query.trim();
  return !!q && !places.some((p) => matchesQuery(p, q));
}

export function AddPlaceSuggest({ query, surface }: { query: string; surface: FilterSurface }) {
  const owns = useSuggestOwnsEmpty(query);
  if (!owns) return null;
  return (
    <div className={`aps aps-${surface}`} data-testid="add-suggest">
      <div className="aps-card aps-line">
        <p className="aps-name">找不到「{query.trim()}」</p>
        <button type="button" className="button primary aps-add" data-testid="add-suggest-add" onClick={() => addPlaceStore.getState().openEntry(query.trim())}>
          ＋ 自己加
        </button>
      </div>
    </div>
  );
}
