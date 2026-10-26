// 探索的清單：符合篩選和搜尋的點，依推薦、評分或 ❤️ 排好。電腦版可以只列地圖畫面裡的（bounds）；手機版不看範圍（bounds 給 null）。
// 參考 Google Maps 的搜尋結果、食べログ的排行：一列一個點，點了地圖移過去。手機探索自己的篩選（Feed）也在這裡換成 Filter。

import { EMPTY_FILTER, matchesFilter, matchesQuery, type Filter, type FilterKey } from './filter.ts';
import { inBbox } from './areas.ts';
import { wallPlaces } from './visual.ts';
import type { Bbox, Place, PlaceType } from '../data/types.ts';

/** 探索分成這三類（車站不列） */
export const EXPLORE_TYPES = ['restaurant', 'lodging', 'spot'] as const satisfies readonly PlaceType[];
export type ExploreType = (typeof EXPLORE_TYPES)[number];

export const EXPLORE_SORTS = ['recommend', 'rating', 'likes'] as const;
export type ExploreSort = (typeof EXPLORE_SORTS)[number];
export const EXPLORE_SORT_LABELS: Record<ExploreSort, string> = { recommend: '推薦', rating: '評分', likes: '想去多' };

const WORLD: Bbox = [-180, -90, 180, 90];

/** Google 的星數；沒有時用食べログ（3.5 分 ≈ 4 星，大約換算） */
export function ratingOf(p: Place): number | null {
  const r = (p.raw.ratings ?? {}) as Record<string, unknown>;
  if (typeof r.google === 'number') return r.google;
  if (typeof r.tabelog === 'number') return r.tabelog + 0.5;
  return null;
}

export function explorePlaces(places: Place[], filter: Filter, bounds: Bbox | null, sort: ExploreSort, likes: (id: string) => number, query = ''): Place[] {
  // 推薦：S → A → B，同級依評論數（和原本的圖片牆一樣）
  const list = wallPlaces(places, bounds ?? WORLD, filter, query).filter((p) => p.type !== 'station');
  if (sort === 'recommend') return list;
  const key = sort === 'rating' ? (p: Place) => ratingOf(p) ?? -1 : (p: Place) => likes(p.id);
  // 穩定排序：同分時保留推薦的順序
  return list
    .map((p, i) => ({ p, i, k: key(p) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.p);
}

/** 每一類各有幾個（區域、其他篩選照目前的，不看類型） */
export function typeCounts(places: Place[], filter: Filter, bounds: Bbox | null, query = ''): Record<ExploreType, number> {
  const out = { restaurant: 0, lodging: 0, spot: 0 };
  for (const p of places) {
    if (p.type === 'station' || (bounds && !inBbox(p.coords, bounds))) continue;
    if (matchesFilter(p, { ...filter, types: [] }) && matchesQuery(p, query)) out[p.type] += 1;
  }
  return out;
}

/**
 * 手機探索的篩選（mobileStore 的 feed，第六輪 §3.2）：手機自己一份，不看地圖範圍、不動 store 的 filter。
 * quick 是篩選面板（FilterSheet）選的條件，只由面板寫入，寫成 "欄位:值"（例如 "fit15:yes"），欄位是 Filter 的欄位。
 */
export interface Feed {
  type: 'all' | PlaceType;
  area: string | null;
  quick: string[];
  sort: ExploreSort;
  query: string;
  /** 照片牆或清單（mobileStore 記在 localStorage） */
  view: 'photo' | 'list';
}

export const EMPTY_FEED: Feed = { type: 'all', area: null, quick: [], sort: 'recommend', query: '', view: 'photo' };

/** feed.quick 裡的一個條件 */
export const feedToken = (key: FilterKey, value: string) => `${key}:${value}`;

/** 把 "欄位:值" 的條件加進 Filter；類型、地區另外存（types、areas），認不得的略過 */
function addTokens(f: Filter, tokens: string[]): Filter {
  const lists = f as unknown as Record<string, string[]>;
  for (const t of tokens) {
    const i = t.indexOf(':');
    const key = t.slice(0, i);
    if (i <= 0 || key === 'types' || key === 'areas' || !(key in EMPTY_FILTER)) continue;
    lists[key] = [...lists[key], t.slice(i + 1)];
  }
  return f;
}

/** 手機探索的篩選換成 Filter（explorePlaces 用）；認不得的條件略過 */
export function feedFilter(feed: Pick<Feed, 'type' | 'area' | 'quick'>): Filter {
  return addTokens({ ...EMPTY_FILTER, types: feed.type === 'all' ? [] : [feed.type], areas: feed.area ? [feed.area] : [] }, feed.quick);
}

/** 想去的篩選：一次一類，加上地區和面板選的條件 */
export function wishFilter(type: ExploreType | 'all', area: string | null, quick: string[] = []): Filter {
  return addTokens({ ...EMPTY_FILTER, types: type === 'all' ? [] : [type], areas: area ? [area] : [] }, quick);
}
