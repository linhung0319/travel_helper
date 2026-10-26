import type { PlaceType } from '../data/types.ts';
import type { IconName } from './icons.ts';

/** 類型色（設計 §2.1 的 --t-spot／--t-food／--t-stay／--t-station）：小色點、地圖的點、沒有照片時的縮圖底色 */
export const TYPE_COLORS: Record<PlaceType, string> = {
  station: '#3b6ea8',
  spot: '#3f7a5a',
  lodging: '#6e5ba8',
  restaurant: '#c46a3a',
};

/** 類型的線條圖示（沒有照片的替代圖、拖曳的小標籤用；其他地方用小色點＋字，見 TypeLabel） */
export const TYPE_ICON_NAMES: Record<PlaceType, IconName> = {
  station: 'train',
  spot: 'pin',
  lodging: 'bed',
  restaurant: 'fork',
};
