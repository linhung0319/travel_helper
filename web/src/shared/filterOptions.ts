// 篩選的選項（手機、網頁共用一份）：篩選面板有哪幾段、每段哪幾組、每組的字和值，以及「套用的條件」晶片。
// 純資料、純函式，沒有畫面：FilterSheet（面板內容）、FilterBar（「現在看」的條件列）、兩邊的 store 轉接都讀這裡。
// 地區、子地區在外面的地區列和選區後的子地區列（T42，interaction-design §20），面板裡沒有；類型在面板第一列。
// T67（interaction-design §32）照類型分段：選了類型只畫那幾類的組（第一題在最上面）；沒選類型時三類各收成一列，點了＝選那個類型。
// 等級、地圖（網頁）、想去的「只看我按的」（只有想去分頁）三類共用，放最下面。
// T75（§35.5）：主題分頁之後的面板只畫目前主題的組（THEME_GROUPS、themePanel），書架區段切過的條件不進面板；
// T67 的類型列、FILTER_SECTIONS、COMMON_GROUPS、panelLayout 是舊面板在用的，T79 刪。

import { TIERS, type Area } from '../data/types.ts';
import { THEME_LABELS, type Theme } from '../lib/shelves.ts';
import {
  AMENITY_LABELS,
  AMENITY_VALUES,
  CONTEXT_LABELS,
  DINNER_LABELS,
  DINNER_VALUES,
  KIDS_LABELS,
  MEAL_VALUES,
  RAIN_OK,
  REACH_LABELS,
  STAY_LABELS,
  STAY_PANEL,
  SUIT_LABELS,
  TYPE_LABELS,
  VOTE_FILTER_LABELS,
  WEATHER_FILTER_LABELS,
  WHO_LABELS,
  WHO_PANEL,
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
  /** 面板裡唯一（data-group、testid 用）；同一個欄位在兩段時 ID 不同（例如 reach、spot-reach） */
  id: string;
  title: string;
  /** Filter 的欄位；地圖畫面（只列地圖畫面裡的）不是 Filter 的欄位 */
  key: FilterKey | 'bounds';
  /** 沒有選項的組不畫（探索沒有「想去」） */
  options(areas: Area[], source: FilterSource): FilterOption[];
  /** 只有網頁有（手機沒有跟著畫面動的地圖） */
  desktopOnly?: boolean;
  /** 這組變淡（還是能點）：餐廳的「帶小孩」在選了全員 15 人時（全員已經排掉不收小孩的店） */
  dimmed?(filter: Filter): boolean;
}

export type SectionType = 'spot' | 'restaurant' | 'lodging';

/** 三類的順序（同類型列） */
export const SECTION_ORDER: readonly SectionType[] = ['spot', 'restaurant', 'lodging'];

const opts =
  <V extends string>(values: readonly V[], labels: Record<V, string>) =>
  () =>
    values.map((v) => ({ value: v, label: labels[v] }));
const suits = (values: readonly SuitFilter[]) => opts(values, SUIT_LABELS);

/** 類型那一列（面板最上面） */
export const TYPE_GROUP: FilterGroup = { id: 'type', title: '類型', key: 'types', options: () => SECTION_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] })) };

/** 每一類的組，第一題在最上面（interaction-design §32） */
export const FILTER_SECTIONS: Record<SectionType, FilterGroup[]> = {
  restaurant: [
    { id: 'group', title: '誰吃', key: 'who', options: opts(WHO_PANEL, WHO_LABELS) },
    { id: 'context', title: '哪一餐', key: 'contexts', options: opts(MEAL_VALUES, CONTEXT_LABELS) },
    { id: 'kids', title: '帶小孩', key: 'kids', options: () => [{ value: 'ok', label: KIDS_LABELS.ok }], dimmed: (f) => f.who.includes('all') },
    {
      id: 'reach',
      title: '怎麼去',
      key: 'reach',
      options: () => [
        { value: 'station', label: REACH_LABELS.station, note: '主要車站走路 5 分內' },
        { value: 'easy', label: REACH_LABELS.easy, note: '車站走路 10 分內' },
      ],
    },
  ],
  lodging: [
    { id: 'lodging', title: '住法', key: 'stay', options: opts(STAY_PANEL, STAY_LABELS) },
    { id: 'dinner', title: '晚餐', key: 'dinner', options: opts(DINNER_VALUES, DINNER_LABELS) },
    { id: 'lodging-suits', title: '適合', key: 'suits', options: suits(['elderly', 'kids']) },
    { id: 'amenity', title: '其他', key: 'amenity', options: opts(AMENITY_VALUES, AMENITY_LABELS) },
  ],
  spot: [
    { id: 'suits', title: '適合', key: 'suits', options: suits(['elderly', 'kids', 'winter']) },
    { id: 'weather', title: '天氣', key: 'weather', options: opts(RAIN_OK, WEATHER_FILTER_LABELS) },
    { id: 'spot-reach', title: '怎麼去', key: 'reach', options: () => [{ value: 'easy', label: REACH_LABELS.easy }] },
  ],
};

/** 三類共用、放最下面的組 */
export const COMMON_GROUPS: FilterGroup[] = [
  { id: 'tier', title: '等級', key: 'tiers', options: () => TIERS.map((t) => ({ value: t, label: `${t} 級` })) },
  { id: 'map', title: '地圖', key: 'bounds', options: () => [{ value: 'inView', label: '只看地圖畫面裡的' }], desktopOnly: true },
  { id: 'wish', title: '想去', key: 'votes', options: (_areas, source) => (source === 'wish' ? [{ value: 'mine', label: VOTE_FILTER_LABELS.mine }] : []) },
];

/** 所有的組（類型、三類、共用），測試、找組名用 */
export const FILTER_GROUPS: FilterGroup[] = [TYPE_GROUP, ...SECTION_ORDER.flatMap((t) => FILTER_SECTIONS[t]), ...COMMON_GROUPS];

/**
 * 面板要畫什麼：選了類型的那幾類展開（照 SECTION_ORDER），沒選的不畫；沒選類型時三類都收著
 */
export function panelLayout(types: readonly string[]): { open: SectionType[]; collapsed: SectionType[] } {
  const open = SECTION_ORDER.filter((t) => types.includes(t));
  return { open, collapsed: open.length ? [] : [...SECTION_ORDER] };
}

/** 收著的那一列的小字：那類的組名（「誰吃 · 哪一餐 · 帶小孩 · 怎麼去」） */
export const sectionSummary = (t: SectionType) => FILTER_SECTIONS[t].map((g) => g.title).join(' · ');

/** 這類的組套了幾個條件（收著的那一列標數字；同一個欄位兩類共用時兩邊都算，例如適合） */
export function sectionApplied(t: SectionType, f: Filter): number {
  const keys = new Set(FILTER_SECTIONS[t].map((g) => g.key).filter((k): k is FilterKey => k !== 'bounds'));
  return [...keys].reduce((n, k) => n + f[k].length, 0);
}

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
 * 每個主題自己的組（§35.5），書架區段切過的不進面板：玩沒有天氣、等級；吃沒有「全員 15 人」（只留分組 4～6 人）；住沒有住法。
 * 吃、住各自有等級（三類共用的等級組拿掉）。
 */
export const THEME_GROUPS: Record<Theme, FilterGroup[]> = {
  spot: [
    { id: 'suits', title: '適合', key: 'suits', options: suits(['elderly', 'kids', 'winter']) },
    { id: 'spot-reach', title: '怎麼去', key: 'reach', options: () => [{ value: 'easy', label: REACH_LABELS.easy }] },
  ],
  restaurant: [
    { id: 'group', title: '分組去', key: 'who', options: opts(['sub'] as const, WHO_LABELS) },
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
