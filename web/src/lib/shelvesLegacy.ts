// T75 起舊的：舊畫面（ShelfCard、AreaHome、清單層）還在用，T77、T78 接上 shelves.ts 的區段後，T79 整個檔案刪掉。新的程式不要用這裡的東西。
// 探索選了一區之後的書架（T42、T50、T66，interaction-design §20、§32）、探索這時要畫哪一種畫面、清單的返回鈕。純函式，沒有畫面。
// 每排書架有兩級條件（T66）：第一級一個都沒有才退到第二級，兩級都沒有才是 0（T64 的虛線框）。
// 每一級就是一組篩選條件：「全部 ›」把那一級的條件套上去，回到照片牆或清單；書架上先放推薦順序的前 3 個。
// AI 要問同樣的事（「一定要去」「全員吃飯」「住在這裡」「下雨也行」）時也用這幾組條件（set_filter 的欄位一樣）。

import { displayName } from '../data/normalize.ts';
import type { Area, Place } from '../data/types.ts';
import { EMPTY_FILTER, RAIN_OK, isFilterEmpty, placeFit15, placeStayKind, type Filter, type FilterKey } from './filter.ts';
import { fit15Caption, mealsCaption, stayCaption } from './badges.ts';
import { explorePlaces } from './explore.ts';

/** 書架的一級 */
export interface ShelfTier {
  /** 套在目前地區上面的條件 */
  filter: Partial<Filter>;
  /** 不管子地區（下雨也行的第二級是全區：下雨是「那天去哪」的全區問題） */
  wide?: boolean;
}

/** 小字要用的地名：where 是最小的那層（「賢島」，沒選子地區是「志摩」），area 是整區（「志摩」） */
export interface ShelfWhere {
  where: string;
  area: string;
}

export interface Shelf {
  id: 'must' | 'fit15' | 'stay' | 'rain';
  title: string;
  /** 第一級、第二級 */
  tiers: readonly [ShelfTier, ShelfTier];
  /** 這排第一級的條件，一行小字（「S、A 級景點」） */
  rule: string;
  /** 第一級的小字改寫分布（「能坐一起 6 · 要分桌 2」）；items 是第一級的全部。沒有、或是空字串時寫 rule */
  note?: (items: Place[]) => string;
  /** 退到第二級的小字（換色）：「賢島沒有 S、A 級，這是 B 級」 */
  fallback: (w: ShelfWhere) => string;
  /** 小卡第二行：這排在意的那件事（「15 人能坐一起」「包棟 · 16 人 · 一泊二食」）；沒有就照舊只有名稱、等級 */
  caption?: (p: Place) => string | null;
  /** 兩級都 0 個時的那句（T64）：「賢島沒有 S、A 級的景點」的「S、A 級的景點」 */
  empty: string;
  /** 0 個時問 AI 的那句（T64，放進輸入框） */
  ask: (where: string) => string;
}

/** 分布的小字：「能坐一起 6 · 要分桌 2」，0 的那段不寫 */
export const dist = (parts: [string, number][]) =>
  parts
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(' · ');

/** 順序（T50）：一定要去、全員吃飯、住在這裡、下雨也行；之後加的排在後面 */
export const SHELVES: readonly Shelf[] = [
  {
    id: 'must',
    title: '一定要去',
    tiers: [{ filter: { types: ['spot'], tiers: ['S', 'A'] } }, { filter: { types: ['spot'], tiers: ['B'] } }],
    rule: 'S、A 級景點',
    fallback: ({ where }) => `${where}沒有 S、A 級，這是 B 級`,
    empty: 'S、A、B 級的景點',
    ask: (w) => `${w}有什麼值得去的景點？`,
  },
  {
    id: 'fit15',
    title: '全員吃飯',
    // 第一級：一家容納得下 15 人（能坐一起、要分桌），排掉不收小孩、有年齡限制的店；第二級：還沒查、坐不下（要分組去不同家）
    tiers: [{ filter: { types: ['restaurant'], who: ['all'] } }, { filter: { types: ['restaurant'], who: ['apart'] } }],
    rule: '15 人能一起吃的店',
    note: (items) =>
      dist([
        ['能坐一起', items.filter((p) => placeFit15(p) === 'yes').length],
        ['要分桌', items.filter((p) => placeFit15(p) === 'split').length],
      ]),
    fallback: ({ where }) => `${where}沒有容納得下 15 人的店，這些要分組去`,
    caption: (p) => fit15Caption(p)?.label ?? null,
    empty: '餐廳',
    ask: (w) => `${w}有哪裡可以 15 人一起吃飯？`,
  },
  {
    id: 'stay',
    title: '住在這裡',
    // 第一級：一間住得下全團（包棟 maxGuests ≥ 15、旅館飯店 5 間房以上）；第二級：其他（要分開住）
    tiers: [{ filter: { types: ['lodging'], stay: ['fits'] } }, { filter: { types: ['lodging'], stay: ['apart'] } }],
    rule: '一間住得下全團',
    note: (items) =>
      dist([
        ['包棟', items.filter((p) => placeStayKind(p) === 'whole').length],
        ['旅館飯店', items.filter((p) => placeStayKind(p) === 'hotel').length],
      ]),
    fallback: ({ where }) => `${where}沒有一間住得下全團的，這些要分開住`,
    caption: (p) => {
      const stay = stayCaption(p)?.label;
      const meals = mealsCaption(p);
      return stay ? (meals ? `${stay} · ${meals}` : stay) : null;
    },
    empty: '住宿',
    ask: (w) => `${w}附近有哪裡適合 15 人住？`,
  },
  // 只放景點：餐廳、住宿本來就在室內（weather 不篩它們），另外兩排就是。室內、有遮蔽都算（T58）
  {
    id: 'rain',
    title: '下雨也行',
    tiers: [{ filter: { types: ['spot'], weather: RAIN_OK } }, { filter: { types: ['spot'], weather: RAIN_OK }, wide: true }],
    rule: '室內或有遮蔽的景點',
    fallback: ({ where, area }) => `${where}沒有，這是${area}全區的`,
    empty: '室內或有遮蔽的景點',
    ask: (w) => `${w}下雨天可以去哪裡？`,
  },
];

/** 書架上先放幾個 */
export const SHELF_SIZE = 3;

export type TierNo = 1 | 2;

/** 目前的地區、子地區加上書架那一級的條件（「全部 ›」套用的就是這個）；第二級是全區的（下雨也行）不留子地區 */
export function shelfFilter(shelf: Shelf, base: Pick<Filter, 'areas' | 'regions'>, tier: TierNo = 1): Filter {
  const t = shelf.tiers[tier - 1];
  return { ...EMPTY_FILTER, areas: base.areas, regions: t.wide ? [] : base.regions, ...t.filter };
}

export interface ShelfRow {
  shelf: Shelf;
  /** 現在用的是第幾級（第一級 0 個才用第二級；兩級都 0 是 1） */
  tier: TierNo;
  /** 這一級的條件（「全部 ›」） */
  filter: Filter;
  /** 標題旁的小字 */
  note: string;
  /** 小字是退到第二級的那句（換色） */
  fallback: boolean;
  /** 推薦順序的前幾個 */
  items: Place[];
  /** 這一級一共幾個 */
  total: number;
}

const rank = (places: Place[], filter: Filter) => explorePlaces(places, filter, null, 'recommend', () => 0);

/** 小字的地名：「賢島」（沒選子地區是「志摩」）、「志摩」；找不到地區時寫「這裡」 */
export function shelfWhere(base: Pick<Filter, 'areas' | 'regions'>, areas: Area[]): ShelfWhere {
  const area = base.areas.length === 1 ? areas.find((a) => a.id === base.areas[0]) : undefined;
  const areaName = area ? displayName(area.name, area.id) : '這裡';
  const region = area && base.regions.length === 1 ? area.regions?.find((r) => r.id === base.regions[0]) : undefined;
  return { where: region ? displayName(region.name, region.id) : areaName, area: areaName };
}

/** 一排書架：第一級 0 個才退到第二級 */
export function shelfRow(places: Place[], shelf: Shelf, base: Pick<Filter, 'areas' | 'regions'>, areas: Area[] = [], size = SHELF_SIZE): ShelfRow {
  const first = shelfFilter(shelf, base, 1);
  const firstAll = rank(places, first);
  if (firstAll.length === 0) {
    const second = shelfFilter(shelf, base, 2);
    const secondAll = rank(places, second);
    if (secondAll.length > 0) return { shelf, tier: 2, filter: second, note: shelf.fallback(shelfWhere(base, areas)), fallback: true, items: secondAll.slice(0, size), total: secondAll.length };
  }
  return { shelf, tier: 1, filter: first, note: shelf.note?.(firstAll) || shelf.rule, fallback: false, items: firstAll.slice(0, size), total: firstAll.length };
}

/** 每排書架的內容；0 個的那排也列（T64：畫面寫「這裡沒有」和下一步，不藏）。areas：退到第二級的小字要地名 */
export function shelfRows(places: Place[], base: Pick<Filter, 'areas' | 'regions'>, areas: Area[] = [], size = SHELF_SIZE): ShelfRow[] {
  return SHELVES.map((shelf) => shelfRow(places, shelf, base, areas, size));
}

/** 概覽的四格數字（T52）：每排書架在這區一共幾個（第一級 0 個時是第二級的）；0 的也列（畫面灰掉、不能點），順序同 SHELVES */
export function shelfCounts(places: Place[], base: Pick<Filter, 'areas' | 'regions'>): { shelf: Shelf; tier: TierNo; total: number }[] {
  return SHELVES.map((shelf) => {
    const { tier, total } = shelfRow(places, shelf, base, [], 0);
    return { shelf, tier, total };
  });
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v) => b.includes(v));

/** 書架那一級的條件是哪幾個欄位（地區、子地區之外） */
export const shelfKeys = (shelf: Shelf, tier: TierNo = 1) => Object.keys(shelf.tiers[tier - 1].filter) as FilterKey[];

/**
 * 現在的條件裡有沒有一整排書架的某一級（T64、T66）：那一級的欄位剛好是那一級的值（順序不管），其他欄位隨便（自己在面板加的、搜尋）。
 * 拿掉書架帶來的任何一個條件、或在同一個欄位多選（例如多選一個類型，變成放寬）就不是了。不是就 null；兩級都對得上時算第一級
 */
export function shelfTierOf(filter: Filter): { shelf: Shelf; tier: TierNo } | null {
  for (const shelf of SHELVES) {
    for (const tier of [1, 2] as const) {
      const want = shelf.tiers[tier - 1].filter;
      if (shelfKeys(shelf, tier).every((k) => sameSet(filter[k], want[k] ?? []))) return { shelf, tier };
    }
  }
  return null;
}

/** 現在的條件裡有沒有一整排書架（哪一級都算）；不是就 null */
export function shelfOf(filter: Filter): Shelf | null {
  return shelfTierOf(filter)?.shelf ?? null;
}

/** 條件剛好是哪一排書架的某一級（地區、子地區之外的條件一樣；順序不管）；不是就 null */
export function matchShelf(filter: Filter): Shelf | null {
  const hit = shelfTierOf(filter);
  if (!hit) return null;
  const want = shelfFilter(hit.shelf, filter, hit.tier);
  const keys = (Object.keys(EMPTY_FILTER) as FilterKey[]).filter((k) => k !== 'areas' && k !== 'regions');
  return keys.every((k) => sameSet(filter[k], want[k])) ? hit.shelf : null;
}

/**
 * 清單層的返回鈕（T50、T64）：條件裡還有一整排書架寫書架名（「全員吃飯」，自己多加的條件、搜尋不影響），
 * 拿掉了書架帶來的條件、或本來就是自己在面板篩的寫「自己篩選」。畫面在前面加「‹ 」、後面接「· 志摩・賢島 · N 個地點」。
 */
export function backLabel(filter: Filter): string {
  const hit = shelfTierOf(filter);
  if (!hit) return '自己篩選';
  // 書架之外自己多加了幾個條件（T69）：「一定要去＋1」；換地區時照字面套用（rescopeFilter）
  const own = new Set<FilterKey>(['areas', 'regions', ...shelfKeys(hit.shelf, hit.tier)]);
  const extra = (Object.keys(EMPTY_FILTER) as FilterKey[]).filter((k) => !own.has(k)).reduce((n, k) => n + filter[k].length, 0);
  return extra ? `${hit.shelf.title}＋${extra}` : hit.shelf.title;
}

/**
 * 換地區、子地區時「看什麼」跟著走（T69，interaction-design §33）：地區、子地區換成 base，其他條件不動。
 * 條件剛好是一排書架的某一級（沒自己加東西，matchShelf）時照新的範圍重挑那排的級數：第一級 0 個退第二級，跟書架同一個規則。
 * 第二級是全區的（下雨也行）不退：選了子地區就照第一級（0 個時畫面給下一步），不然子地區會被清掉。
 */
export function rescopeFilter(filter: Filter, base: Pick<Filter, 'areas' | 'regions'>, places: Place[]): Filter {
  const next = { ...filter, areas: [...base.areas], regions: [...base.regions] };
  const shelf = matchShelf(filter);
  if (!shelf) return next;
  const row = shelfRow(places, shelf, base, [], 0);
  return row.filter.regions.length === base.regions.length ? row.filter : shelfFilter(shelf, base, 1);
}

/**
 * 有「看什麼」時，每個地區（和目前地區的每個子地區）照同一個篩選有幾個（T69）：地區分頁、子地區晶片後面的小數字。
 * 每個範圍各自 rescopeFilter（書架照那裡的級數），所以數字和點進去看到的一樣。pool：探索是全部、想去是有人按想去的（已經照那一排篩好）；places 是全部的點（書架挑級數用）
 */
export function scopeCounts(pool: Place[], filter: Filter, query: string, areas: Area[], places: Place[]): Map<string, number> {
  const out = new Map<string, number>();
  const count = (base: Pick<Filter, 'areas' | 'regions'>) => explorePlaces(pool, rescopeFilter(filter, base, places), null, 'recommend', () => 0, query).length;
  for (const a of areas) out.set(a.id, count({ areas: [a.id], regions: [] }));
  const cur = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  for (const r of cur?.regions ?? []) out.set(r.id, count({ areas: [cur!.id], regions: [r.id] }));
  return out;
}

/** 清單層的書架退到第二級時那句（「賢島沒有 S、A 級，這是 B 級」）；不是書架、或是第一級是 null */
export function fallbackNote(filter: Filter, areas: Area[]): string | null {
  const hit = shelfTierOf(filter);
  if (!hit || hit.tier !== 2 || !matchShelf(filter)) return null;
  return hit.shelf.fallback(shelfWhere(filter, areas));
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

/** 回到書架：清掉地區、子地區以外的條件 */
export function areaOnly(filter: Filter): Filter {
  return { ...EMPTY_FILTER, areas: filter.areas, regions: filter.regions };
}
