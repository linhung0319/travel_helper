// 篩選的選項（手機、網頁共用一份）：篩選面板有哪幾組、每組的字和值，以及「套用的條件」晶片。
// 純資料、純函式，沒有畫面：FilterSheet（面板內容）、FilterBar（條件列）、兩邊的 store 轉接都讀這裡。
// 地區、子地區在外面的地區列和子地區晶片（T42，interaction-design §20），面板裡沒有。
// T75（§35.5）：選了主題（地區頁、想去）只畫目前主題的組（THEME_GROUPS、themePanel），書架區段切過的條件不進面板；
// 沒有主題的搜尋、AI 結果集（一次好幾類）用 listPanel：一排類型晶片，選了的那幾類的組接在下面（T79 拿掉 T69 的類型三塊大鈕）。

import { TIERS, type Area } from '../data/types.ts';
import { THEMES, THEME_LABELS, type Theme } from '../lib/shelves.ts';
import {
  AMENITY_LABELS,
  AMENITY_VALUES,
  CONTEXT_LABELS,
  DINNER_LABELS,
  DINNER_VALUES,
  KIDS_LABELS,
  MEAL_VALUES,
  REACH_LABELS,
  SUIT_LABELS,
  TYPE_LABELS,
  VOTE_FILTER_LABELS,
  filterChips,
  type Filter,
  type FilterChip,
  type FilterKey,
  type SuitFilter,
} from '../lib/filter.ts';

export type FilterSource = 'explore' | 'wish';

export interface FilterOption {
  value: string;
  label: string;
  /** 晶片旁的小字 */
  note?: string;
}

export interface FilterGroup {
  /** 面板裡唯一（data-group、testid 用）；同一個欄位在兩個主題時 ID 不同（例如 reach、spot-reach） */
  id: string;
  title: string;
  /** Filter 的欄位；地圖畫面（只列地圖畫面裡的）不是 Filter 的欄位 */
  key: FilterKey | 'bounds';
  /** 沒有選項的組不畫（探索沒有「想去」） */
  options(areas: Area[], source: FilterSource): FilterOption[];
  /** 只有網頁有（手機沒有跟著畫面動的地圖） */
  desktopOnly?: boolean;
}

const opts =
  <V extends string>(values: readonly V[], labels: Record<V, string>) =>
  () =>
    values.map((v) => ({ value: v, label: labels[v] }));
const suits = (values: readonly SuitFilter[]) => opts(values, SUIT_LABELS);

/** 類型那一列（沒有主題的面板最上面） */
export const TYPE_GROUP: FilterGroup = { id: 'type', title: '類型', key: 'types', options: () => THEMES.map((t) => ({ value: t, label: TYPE_LABELS[t] })) };

/**
 * 面板的標題：「篩選 · 志摩・賢島」（沒選子地區「志摩」；概覽、好幾區「全部」）；where 是 placeLabel（或最小那層）的結果。
 * 給了主題（T75）：「篩選 · 志摩的景點」
 */
export const sheetTitle = (where: string | null, theme?: Theme | null) => `篩選 · ${where ?? '全部'}${theme ? `的${THEME_LABELS[theme].noun}` : ''}`;

/** 在外面一列的條件（地區列、子地區列），不算進「篩選」的數字、「全部清除」不動 */
export const OUTSIDE_KEYS: readonly FilterKey[] = ['areas', 'regions'];

/** 套用的條件 → 晶片的順序（類型、餐廳、住宿、景點、共用） */
const CHIP_ORDER: FilterKey[] = ['types', 'who', 'contexts', 'kids', 'stay', 'dinner', 'amenity', 'suits', 'weather', 'reach', 'votes', 'tiers'];

/** 面板裡套用的條件（地區、子地區在外面，不算）；「篩選」上的數字、AI 的說明用 */
export function appliedChips(f: Filter, areas: Area[]): FilterChip[] {
  const chips = filterChips(f, areas).filter((c) => !OUTSIDE_KEYS.includes(c.key));
  return chips.sort((a, b) => CHIP_ORDER.indexOf(a.key) - CHIP_ORDER.indexOf(b.key));
}

// ---- T75：主題分頁的面板（interaction-design §35.5） ----

const tierGroup = (id: string): FilterGroup => ({ id, title: '等級', key: 'tiers', options: () => TIERS.map((t) => ({ value: t, label: `${t} 級` })) });

/**
 * 每個主題自己的組（§35.5），書架區段切過的不進面板：玩沒有天氣、等級；吃沒有「誰吃」（T81 連「分組 4～6 人」那組也拿掉，書架的「要分組去」就是它；who 照舊給 AI、書架、舊的分享條件用）；住沒有住法。
 * 吃、住各自有等級（三類共用的等級組拿掉）。
 */
export const THEME_GROUPS: Record<Theme, FilterGroup[]> = {
  spot: [
    { id: 'suits', title: '適合', key: 'suits', options: suits(['elderly', 'kids', 'winter']) },
    { id: 'spot-reach', title: '怎麼去', key: 'reach', options: () => [{ value: 'easy', label: REACH_LABELS.easy }] },
  ],
  restaurant: [
    { id: 'context', title: '哪一餐', key: 'contexts', options: opts(MEAL_VALUES, CONTEXT_LABELS) },
    { id: 'kids', title: '帶小孩', key: 'kids', options: () => [{ value: 'ok', label: KIDS_LABELS.ok }] },
    {
      id: 'reach',
      title: '怎麼去',
      key: 'reach',
      options: () => [
        { value: 'station', label: REACH_LABELS.station, note: '主要車站走路 5 分內' },
        { value: 'easy', label: REACH_LABELS.easy, note: '車站走路 10 分內' },
      ],
    },
    tierGroup('restaurant-tier'),
  ],
  lodging: [
    { id: 'dinner', title: '晚餐', key: 'dinner', options: opts(DINNER_VALUES, DINNER_LABELS) },
    { id: 'lodging-suits', title: '適合', key: 'suits', options: suits(['elderly', 'kids']) },
    { id: 'amenity', title: '其他', key: 'amenity', options: opts(AMENITY_VALUES, AMENITY_LABELS) },
    tierGroup('lodging-tier'),
  ],
};

/** 想去的面板最前面那組（取代 §33 的「只看自己加的」開關） */
export const WISH_MINE_GROUP: FilterGroup = { id: 'wish', title: '誰想去', key: 'votes', options: (_areas, source) => (source === 'wish' ? [{ value: 'mine', label: VOTE_FILTER_LABELS.mine }] : []) };
/** 網頁多的那組（放最下面） */
export const MAP_GROUP: FilterGroup = { id: 'map', title: '地圖', key: 'bounds', options: () => [{ value: 'inView', label: '只看地圖畫面裡的' }], desktopOnly: true };

/** 目前主題的面板由上往下的組：想去多「誰想去」在最前面、主題自己的組、網頁的地圖（手機由畫面略過 desktopOnly） */
export function themePanel(theme: Theme, source: FilterSource): FilterGroup[] {
  return [...(source === 'wish' ? [WISH_MINE_GROUP] : []), ...THEME_GROUPS[theme], MAP_GROUP];
}

/**
 * 沒有主題時的面板（搜尋、AI 結果集）：類型一排晶片，選了的那幾類的組照 THEMES 的順序接在下面（同一個欄位只畫第一次出現的那組），
 * 想去多「誰想去」在最前面、網頁的地圖在最後
 */
export function listPanel(types: readonly string[], source: FilterSource): FilterGroup[] {
  const seen = new Set<string>();
  const groups = THEMES.filter((t) => types.includes(t))
    .flatMap((t) => THEME_GROUPS[t])
    .filter((g) => !seen.has(g.key) && !!seen.add(g.key));
  return [...(source === 'wish' ? [WISH_MINE_GROUP] : []), TYPE_GROUP, ...groups, MAP_GROUP];
}

/** 所有的組（類型、三個主題、想去、地圖），測試、找組名用 */
export const FILTER_GROUPS: FilterGroup[] = [TYPE_GROUP, ...THEMES.flatMap((t) => THEME_GROUPS[t]), WISH_MINE_GROUP, MAP_GROUP];

/** 這個主題的面板能選的值（欄位 → 值） */
function themeAllowed(theme: Theme, source: FilterSource): Map<FilterKey, Set<string>> {
  const out = new Map<FilterKey, Set<string>>();
  for (const g of themePanel(theme, source)) {
    if (g.key === 'bounds') continue;
    const set = out.get(g.key) ?? new Set<string>();
    for (const o of g.options([], source)) set.add(o.value);
    out.set(g.key, set);
  }
  return out;
}

/**
 * 換主題時把篩選整理成那個主題用得上的（T75）：types 換成那個主題，面板裡沒有的條件拿掉
 * （例如在住宿選了「一泊二食」再切到玩，不然玩會變 0 個；「長輩」玩、住都有，留著）。地區、子地區不動。
 * store 每個主題各留一份還是共用一份，由接線（T77、T78）決定；這裡只負責「這個主題看得到的那份」。
 */
export function themeFilter(filter: Filter, theme: Theme, source: FilterSource = 'explore'): Filter {
  const allowed = themeAllowed(theme, source);
  const out: Filter = { ...filter, types: [theme] };
  for (const k of Object.keys(filter) as FilterKey[]) {
    if (OUTSIDE_KEYS.includes(k) || k === 'types') continue;
    const ok = allowed.get(k);
    (out[k] as string[]) = ok ? (filter[k] as string[]).filter((v) => ok.has(v)) : [];
  }
  return out;
}

/** 面板裡套了幾個條件（篩選鈕的芥子黃小點、「清除」能不能按）：目前主題的組裡選了的值 */
export function themeApplied(theme: Theme, filter: Filter, source: FilterSource = 'explore'): number {
  return [...themeAllowed(theme, source)].reduce((n, [k, ok]) => n + (filter[k] as string[]).filter((v) => ok.has(v)).length, 0);
}
