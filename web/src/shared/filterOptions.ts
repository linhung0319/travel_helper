// 篩選的選項（手機、網頁共用一份）：篩選面板有哪幾組、每組的字和值，以及「套用的條件」晶片。
// 純資料、純函式，沒有畫面：FilterSheet（面板內容）、FilterBar（下面一排套用的晶片）、兩邊的 store 轉接都讀這裡。
// 地區的選項從 areas.json 來；想去那一組探索是「大家想去的」、想去分頁是「只看我按的」。

import { CONTEXTS, TIERS, type Area } from '../data/types.ts';
import { displayName } from '../data/normalize.ts';
import { CONTEXT_LABELS, FIT15_LABELS, TYPE_LABELS, VOTE_FILTER_LABELS, filterChips, type Filter, type FilterChip, type FilterKey } from '../lib/filter.ts';

export type FilterSource = 'explore' | 'wish';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  id: 'type' | 'area' | 'group' | 'context' | 'wish' | 'tier' | 'map';
  title: string;
  /** Filter 的欄位；地圖畫面（只列地圖畫面裡的）不是 Filter 的欄位 */
  key: FilterKey | 'bounds';
  options(areas: Area[], source: FilterSource): FilterOption[];
  /** 只有網頁有（手機沒有跟著畫面動的地圖） */
  desktopOnly?: boolean;
}

/** 面板的順序：類型、地區、團體、情境、想去、等級、地圖 */
export const FILTER_GROUPS: FilterGroup[] = [
  { id: 'type', title: '類型', key: 'types', options: () => (['spot', 'restaurant', 'lodging'] as const).map((t) => ({ value: t, label: TYPE_LABELS[t] })) },
  { id: 'area', title: '地區', key: 'areas', options: (areas) => areas.map((a) => ({ value: a.id, label: displayName(a.name, a.id) })) },
  { id: 'group', title: '團體', key: 'fit15', options: () => (['yes', 'split'] as const).map((v) => ({ value: v, label: FIT15_LABELS[v] })) },
  { id: 'context', title: '情境', key: 'contexts', options: () => CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABELS[c] })) },
  {
    id: 'wish',
    title: '想去',
    key: 'votes',
    options: (_areas, source) => (source === 'wish' ? [{ value: 'mine', label: VOTE_FILTER_LABELS.mine }] : [{ value: 'popular', label: VOTE_FILTER_LABELS.popular }]),
  },
  { id: 'tier', title: '等級', key: 'tiers', options: () => TIERS.map((t) => ({ value: t, label: `${t} 級` })) },
  { id: 'map', title: '地圖', key: 'bounds', options: () => [{ value: 'inView', label: '只看地圖畫面裡的' }], desktopOnly: true },
];

/** 套用的條件 → 晶片的順序（和面板一樣：類型、地區、小區域、團體、情境、想去、等級） */
const CHIP_ORDER: FilterKey[] = ['types', 'areas', 'regions', 'fit15', 'contexts', 'votes', 'tiers'];

/**
 * 篩選列下面一排「套用的條件」。網頁類型收在面板裡，也是一顆晶片（includeType: true）；
 * 手機類型晶片在外面一列，這裡不重複（includeType: false）。
 */
export function appliedChips(f: Filter, areas: Area[], opts: { includeType: boolean }): FilterChip[] {
  const chips = filterChips(f, areas).filter((c) => opts.includeType || c.key !== 'types');
  return chips.sort((a, b) => CHIP_ORDER.indexOf(a.key) - CHIP_ORDER.indexOf(b.key));
}
