import type { PlaceType } from '../data/types.ts';

/** 類型色（設計 §2.1 的 --t-spot／--t-food／--t-stay／--t-station）：小色點、地圖的點、沒有照片時的縮圖底色 */
export const TYPE_COLORS: Record<PlaceType, string> = {
  station: '#3b6ea8',
  spot: '#3f7a5a',
  lodging: '#6e5ba8',
  restaurant: '#c46a3a',
};

/** @deprecated 類型改用「小色點＋字」（Task 2 的 TypeLabel），之後會刪掉 */
export const TYPE_ICONS: Record<PlaceType, string> = {
  station: '🚉',
  spot: '📷',
  lodging: '🏨',
  restaurant: '🍴',
};
