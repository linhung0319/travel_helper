// 探索選了一區之後的書架（T42，interaction-design §20）、探索這時要畫哪一種畫面。純函式，沒有畫面。
// 書架就是一組篩選條件：「全部 ›」把那組條件套上去，回到照片牆或清單；書架上先放推薦順序的前 3 個。
// AI 要問同樣的事（「一定要去」「下雨也行」「15 人吃得下」「住這區」）時也用這幾組條件（set_filter 的欄位一樣）。

import { EMPTY_FILTER, RAIN_OK, isFilterEmpty, type Filter } from './filter.ts';
import { explorePlaces } from './explore.ts';
import type { Place } from '../data/types.ts';

export interface Shelf {
  id: 'must' | 'rain' | 'fit15' | 'stay';
  title: string;
  /** 套在目前地區（子地區）上面的條件 */
  filter: Partial<Filter>;
}

export const SHELVES: readonly Shelf[] = [
  { id: 'must', title: '一定要去', filter: { types: ['spot'], tiers: ['S', 'A'] } },
  // 只放景點：餐廳、住宿本來就在室內（weather 不篩它們），另外兩排就是。室內、有遮蔽都算（T58）
  { id: 'rain', title: '下雨也行', filter: { types: ['spot'], weather: RAIN_OK } },
  { id: 'fit15', title: '15 人吃得下', filter: { types: ['restaurant'], fit15: ['yes'] } },
  { id: 'stay', title: '住這區', filter: { types: ['lodging'] } },
];

/** 書架上先放幾個 */
export const SHELF_SIZE = 3;

/** 目前的地區、子地區加上書架的條件（「全部 ›」套用的就是這個） */
export function shelfFilter(shelf: Shelf, base: Pick<Filter, 'areas' | 'regions'>): Filter {
  return { ...EMPTY_FILTER, areas: base.areas, regions: base.regions, ...shelf.filter };
}

export interface ShelfRow {
  shelf: Shelf;
  /** 推薦順序的前幾個 */
  items: Place[];
  /** 這排一共幾個 */
  total: number;
}

/** 每排書架的內容；沒有東西的那排不列 */
export function shelfRows(places: Place[], base: Pick<Filter, 'areas' | 'regions'>, size = SHELF_SIZE): ShelfRow[] {
  return SHELVES.map((shelf) => {
    const all = explorePlaces(places, shelfFilter(shelf, base), null, 'recommend', () => 0);
    return { shelf, items: all.slice(0, size), total: all.length };
  }).filter((r) => r.total > 0);
}

/**
 * 探索這時畫哪一種：概覽（沒選地區）、選了一區（書架），或照片牆、清單（list）。
 * 有搜尋、AI 的結果集、或面板裡套了條件（地區、子地區以外的）就是清單；一次選了好幾區（AI 給的）也是清單。
 */
export type ExploreStage = 'overview' | 'area' | 'list';

export function exploreStage(filter: Filter, query: string, hasAiResult: boolean): ExploreStage {
  if (hasAiResult || query.trim()) return 'list';
  if (!isFilterEmpty({ ...filter, areas: [], regions: [] })) return 'list';
  if (filter.areas.length === 0) return filter.regions.length ? 'list' : 'overview';
  return filter.areas.length === 1 ? 'area' : 'list';
}

/** 目前的地區：只選了一區時是那一區，其他（概覽、AI 一次給好幾區）是 null */
export function currentArea(filter: Pick<Filter, 'areas'>): string | null {
  return filter.areas.length === 1 ? filter.areas[0] : null;
}

/** 回到書架：清掉地區、子地區以外的條件 */
export function areaOnly(filter: Filter): Filter {
  return { ...EMPTY_FILTER, areas: filter.areas, regions: filter.regions };
}

/** 聊天的「正在看：」（探索、想去）：探索是「概覽」或地區名，想去是「想去」或「想去・鳥羽」 */
export function listScreenLabel(where: 'explore' | 'wish', areaName: string | null): string {
  if (where === 'explore') return areaName ?? '概覽';
  return areaName ? `想去・${areaName}` : '想去';
}
