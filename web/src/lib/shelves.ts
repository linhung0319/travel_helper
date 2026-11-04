// 探索選了一區之後的書架（T42、T50，interaction-design §20）、探索這時要畫哪一種畫面、清單的返回鈕。純函式，沒有畫面。
// 書架就是一組篩選條件：「全部 ›」把那組條件套上去，回到照片牆或清單；書架上先放推薦順序的前 3 個（「住在這裡」能包棟、可住 15 人的排前面）。
// AI 要問同樣的事（「一定要去」「可坐 15 人」「住在這裡」「下雨也行」）時也用這幾組條件（set_filter 的欄位一樣）。

import { EMPTY_FILTER, RAIN_OK, isFilterEmpty, type Filter, type FilterKey } from './filter.ts';
import { explorePlaces } from './explore.ts';
import type { Place } from '../data/types.ts';

export interface Shelf {
  id: 'must' | 'fit15' | 'stay' | 'rain';
  title: string;
  /** 標題旁一行小字：這排的條件 */
  note: string;
  /** 套在目前地區（子地區）上面的條件 */
  filter: Partial<Filter>;
  /** 0 個時的那句（T64）：「賢島沒有 S、A 級的景點」的「S、A 級的景點」 */
  empty: string;
  /** 0 個時放寬條件的下一步（T64）：換成這組條件（同樣套在目前地區上）；沒有就不放 */
  relax?: { filter: Partial<Filter>; label: (where: string) => string };
  /** 0 個時問 AI 的那句（T64，放進輸入框） */
  ask: (where: string) => string;
}

/** 順序（T50）：一定要去、可坐 15 人、住在這裡、下雨也行；之後加的排在後面 */
export const SHELVES: readonly Shelf[] = [
  {
    id: 'must',
    title: '一定要去',
    note: 'S、A 級景點',
    filter: { types: ['spot'], tiers: ['S', 'A'] },
    empty: 'S、A 級的景點',
    relax: { filter: { types: ['spot'], tiers: ['B'] }, label: (w) => `看${w}的 B 級景點` },
    ask: (w) => `${w}有什麼值得去的景點？`,
  },
  {
    id: 'fit15',
    title: '可坐 15 人',
    note: '全員能坐一起的餐廳',
    filter: { types: ['restaurant'], fit15: ['yes'] },
    empty: '確定能坐 15 人的餐廳',
    // 分組（4～6 人）的 fitSubgroup 不在 Filter 裡；「要分桌」的店（席數夠、可訂位）最接近（T64 自己定的）
    relax: { filter: { types: ['restaurant'], fit15: ['split'] }, label: (w) => `看${w} 15 人要分桌的餐廳` },
    ask: (w) => `${w}有哪裡可以 15 人一起吃飯？`,
  },
  { id: 'stay', title: '住在這裡', note: '包棟、可住 15 人排前面', filter: { types: ['lodging'] }, empty: '住宿的資料', ask: (w) => `${w}附近有哪裡適合 15 人住？` },
  // 只放景點：餐廳、住宿本來就在室內（weather 不篩它們），另外兩排就是。室內、有遮蔽都算（T58）
  {
    id: 'rain',
    title: '下雨也行',
    note: '室內或有遮蔽的景點',
    filter: { types: ['spot'], weather: RAIN_OK },
    empty: '室內或有遮蔽的景點',
    relax: { filter: { types: ['restaurant'] }, label: (w) => `看${w}的餐廳（都在室內）` },
    ask: (w) => `${w}下雨天可以去哪裡？`,
  },
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

const groupOf = (p: Place | null | undefined): Record<string, unknown> => {
  const g = p?.raw.group;
  return g && typeof g === 'object' ? (g as Record<string, unknown>) : {};
};

/**
 * 「住在這裡」排前面的分數：能包棟（清單層有）、可住 15 人以上（group.maxGuests 在詳情層，full 給讀到的完整資料點）各一分。
 * 詳情還沒讀到的只看包棟。
 */
export function stayScore(p: Place, full?: (id: string) => Place | null): number {
  const whole = groupOf(p).wholeRental === true ? 1 : 0;
  const max = groupOf(full?.(p.id) ?? p).maxGuests;
  return whole + (typeof max === 'number' && max >= 15 ? 1 : 0);
}

/** 每排書架的內容；0 個的那排也列（T64：畫面寫「這裡沒有」和下一步，不藏）。full：完整的資料點（住宿的可住人數在詳情層） */
export function shelfRows(places: Place[], base: Pick<Filter, 'areas' | 'regions'>, size = SHELF_SIZE, full?: (id: string) => Place | null): ShelfRow[] {
  return SHELVES.map((shelf) => {
    let all = explorePlaces(places, shelfFilter(shelf, base), null, 'recommend', () => 0);
    // 同分照推薦順序（sort 是穩定的）
    if (shelf.id === 'stay') all = all.map((p) => [p, stayScore(p, full)] as const).sort((a, b) => b[1] - a[1]).map(([p]) => p);
    return { shelf, items: all.slice(0, size), total: all.length };
  });
}

/** 概覽的四格數字（T52）：每排書架在這區一共幾個；0 的也列（畫面灰掉、不能點），順序同 SHELVES */
export function shelfCounts(places: Place[], base: Pick<Filter, 'areas' | 'regions'>): { shelf: Shelf; total: number }[] {
  return SHELVES.map((shelf) => ({ shelf, total: explorePlaces(places, shelfFilter(shelf, base), null, 'recommend', () => 0).length }));
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v) => b.includes(v));

/** 書架自己的條件是哪幾個欄位（地區、子地區之外） */
export const shelfKeys = (shelf: Shelf) => Object.keys(shelf.filter) as FilterKey[];

/**
 * 現在的條件裡有沒有一整排書架（T64）：書架的那幾個欄位剛好是書架的值（順序不管），其他欄位隨便（自己在面板加的、搜尋）。
 * 拿掉書架帶來的任何一個條件、或在同一個欄位多選（例如多選一個類型，變成放寬）就不是了。不是就 null
 */
export function shelfOf(filter: Filter): Shelf | null {
  return SHELVES.find((shelf) => shelfKeys(shelf).every((k) => sameSet(filter[k], shelf.filter[k] ?? []))) ?? null;
}

/** 條件剛好是哪一排書架（地區、子地區之外的條件一樣；順序不管）；不是就 null */
export function matchShelf(filter: Filter): Shelf | null {
  const shelf = shelfOf(filter);
  if (!shelf) return null;
  const want = shelfFilter(shelf, filter);
  return (Object.keys(EMPTY_FILTER) as FilterKey[]).every((k) => sameSet(filter[k], want[k])) ? shelf : null;
}

/**
 * 清單層的返回鈕（T50、T64）：條件裡還有一整排書架寫書架名（「可坐 15 人」，自己多加的條件、搜尋不影響），
 * 拿掉了書架帶來的條件、或本來就是自己在面板篩的寫「自己篩選」。畫面在前面加「‹ 」、後面接「· 志摩・賢島 · N 個地點」。
 */
export function backLabel(filter: Filter): string {
  return shelfOf(filter)?.title ?? '自己篩選';
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
