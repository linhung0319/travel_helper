// 右側「探索」分頁的清單：符合篩選的點，依推薦、評分或 ❤️ 排好；可以只列地圖畫面裡的。
// 參考 Google Maps 的搜尋結果、食べログ的排行：一列一個點，點了地圖移過去。

import { matchesFilter, type Filter } from './filter.ts';
import { inBbox } from './areas.ts';
import { wallPlaces } from './visual.ts';
import type { Bbox, Place, PlaceType } from '../data/types.ts';

/** 探索分成這三類（車站不列） */
export const EXPLORE_TYPES = ['restaurant', 'lodging', 'spot'] as const satisfies readonly PlaceType[];
export type ExploreType = (typeof EXPLORE_TYPES)[number];

export const EXPLORE_SORTS = ['recommend', 'rating', 'likes'] as const;
export type ExploreSort = (typeof EXPLORE_SORTS)[number];
export const EXPLORE_SORT_LABELS: Record<ExploreSort, string> = { recommend: '推薦', rating: '評分', likes: '❤️ 多' };

const WORLD: Bbox = [-180, -90, 180, 90];

/** Google 的星數；沒有時用食べログ（3.5 分 ≈ 4 星，大約換算） */
export function ratingOf(p: Place): number | null {
  const r = (p.raw.ratings ?? {}) as Record<string, unknown>;
  if (typeof r.google === 'number') return r.google;
  if (typeof r.tabelog === 'number') return r.tabelog + 0.5;
  return null;
}

export function explorePlaces(places: Place[], filter: Filter, bounds: Bbox | null, sort: ExploreSort, likes: (id: string) => number): Place[] {
  // 推薦：S → A → B，同級依評論數（和原本的圖片牆一樣）
  const list = wallPlaces(places, bounds ?? WORLD, filter).filter((p) => p.type !== 'station');
  if (sort === 'recommend') return list;
  const key = sort === 'rating' ? (p: Place) => ratingOf(p) ?? -1 : (p: Place) => likes(p.id);
  // 穩定排序：同分時保留推薦的順序
  return list
    .map((p, i) => ({ p, i, k: key(p) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.p);
}

/** 每一類各有幾個（區域、其他篩選照目前的，不看類型） */
export function typeCounts(places: Place[], filter: Filter, bounds: Bbox | null): Record<ExploreType, number> {
  const out = { restaurant: 0, lodging: 0, spot: 0 };
  for (const p of places) {
    if (p.type === 'station' || (bounds && !inBbox(p.coords, bounds))) continue;
    if (matchesFilter(p, { ...filter, types: [] })) out[p.type] += 1;
  }
  return out;
}
