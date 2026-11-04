// 篩選的選項（手機、網頁共用一份）：篩選面板有哪幾組、每組的字和值，以及「套用的條件」晶片。
// 純資料、純函式，沒有畫面：FilterSheet（面板內容）、FilterBar（「篩選」上的數字）、兩邊的 store 轉接都讀這裡。
// 地區、子地區在外面的地區列和選區後的子地區列（T42，interaction-design §20），面板裡沒有；類型收進面板。
// 想去那一組只有想去分頁有（「只看我按的」）；探索的「大家想去的」T57 拿掉（排序已經有大家想去的）。
// 只對某些類型有用的組（人數、天氣、適合、用餐）寫在 forTypes：類型選了別的時面板把它變淡，點了照樣能選（T57）。

import { CONTEXTS, TIERS, type Area } from '../data/types.ts';
import type { PlaceType } from '../data/types.ts';
import {
  CONTEXT_LABELS,
  FIT15_LABELS,
  FIT15_VALUES,
  LODGING_FILTER_LABELS,
  LODGING_FILTER_VALUES,
  SUIT_LABELS,
  SUIT_VALUES,
  TYPE_LABELS,
  VOTE_FILTER_LABELS,
  WEATHER_LABELS,
  WEATHER_VALUES,
  filterChips,
  type Filter,
  type FilterChip,
  type FilterKey,
} from '../lib/filter.ts';

export type FilterSource = 'explore' | 'wish';

export interface FilterOption {
  value: string;
  label: string;
  /** 晶片旁的小字 */
  note?: string;
}

export interface FilterGroup {
  id: 'type' | 'group' | 'lodging' | 'weather' | 'suits' | 'context' | 'wish' | 'tier' | 'map';
  title: string;
  /** Filter 的欄位；地圖畫面（只列地圖畫面裡的）不是 Filter 的欄位 */
  key: FilterKey | 'bounds';
  /** 沒有選項的組不畫（探索沒有「想去」） */
  options(areas: Area[], source: FilterSource): FilterOption[];
  /** 只對這幾類有用（其他類型的點不會符合，或不受影響） */
  forTypes?: readonly PlaceType[];
  /** 只有網頁有（手機沒有跟著畫面動的地圖） */
  desktopOnly?: boolean;
}

/** 面板的順序：類型、人數（餐廳）、人數（住宿）、天氣、適合、用餐、想去、等級、地圖 */
export const FILTER_GROUPS: FilterGroup[] = [
  { id: 'type', title: '類型', key: 'types', options: () => (['spot', 'restaurant', 'lodging'] as const).map((t) => ({ value: t, label: TYPE_LABELS[t] })) },
  { id: 'group', title: '人數（餐廳）', key: 'fit15', forTypes: ['restaurant'], options: () => FIT15_VALUES.map((v) => ({ value: v, label: FIT15_LABELS[v] })) },
  { id: 'lodging', title: '人數（住宿）', key: 'lodging', forTypes: ['lodging'], options: () => LODGING_FILTER_VALUES.map((v) => ({ value: v, label: LODGING_FILTER_LABELS[v] })) },
  { id: 'weather', title: '天氣', key: 'weather', forTypes: ['spot'], options: () => WEATHER_VALUES.map((v) => ({ value: v, label: WEATHER_LABELS[v] })) },
  { id: 'suits', title: '適合', key: 'suits', forTypes: ['spot'], options: () => SUIT_VALUES.map((v) => ({ value: v, label: SUIT_LABELS[v] })) },
  {
    id: 'context',
    title: '用餐',
    key: 'contexts',
    forTypes: ['restaurant'],
    options: () => CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABELS[c], ...(c === 'transit' ? { note: '主要車站走路 5 分內' } : {}) })),
  },
  { id: 'wish', title: '想去', key: 'votes', options: (_areas, source) => (source === 'wish' ? [{ value: 'mine', label: VOTE_FILTER_LABELS.mine }] : []) },
  { id: 'tier', title: '等級', key: 'tiers', options: () => TIERS.map((t) => ({ value: t, label: `${t} 級` })) },
  { id: 'map', title: '地圖', key: 'bounds', options: () => [{ value: 'inView', label: '只看地圖畫面裡的' }], desktopOnly: true },
];

/** 類型選了、而且都不是這組的類型時變淡（沒選類型時都不淡） */
export function groupDimmed(g: Pick<FilterGroup, 'forTypes'>, types: readonly PlaceType[]): boolean {
  return !!g.forTypes && types.length > 0 && !types.some((t) => g.forTypes!.includes(t));
}

/** 在外面一列的條件（地區列、子地區列），不算進「篩選」的數字、「全部清除」不動 */
export const OUTSIDE_KEYS: readonly FilterKey[] = ['areas', 'regions'];

/** 套用的條件 → 晶片的順序（和面板一樣） */
const CHIP_ORDER: FilterKey[] = ['types', 'fit15', 'lodging', 'weather', 'suits', 'contexts', 'votes', 'tiers'];

/** 面板裡套用的條件（地區、子地區在外面，不算）；「篩選」上的數字、AI 的說明用 */
export function appliedChips(f: Filter, areas: Area[]): FilterChip[] {
  const chips = filterChips(f, areas).filter((c) => !OUTSIDE_KEYS.includes(c.key));
  return chips.sort((a, b) => CHIP_ORDER.indexOf(a.key) - CHIP_ORDER.indexOf(b.key));
}
