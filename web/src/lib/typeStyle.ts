import type { PlaceType } from '../data/types.ts';
import type { IconName } from './icons.ts';

/** 類型色（interaction-design §12.2 類型圓章，和 styles.css 的 --t-spot／--t-food／--t-stay／--t-station 一樣）：類型圓章、地圖的點、沒有照片時的縮圖底色 */
export const TYPE_COLORS: Record<PlaceType, string> = {
  station: '#24468a',
  spot: '#5f8a3e',
  lodging: '#c8604f',
  restaurant: '#e3a92b',
};

/** 類型色上的字色：芥子黃（餐廳）底上用墨色，其他白字 */
export const TYPE_INK: Record<PlaceType, string> = {
  station: '#ffffff',
  spot: '#ffffff',
  lodging: '#ffffff',
  restaurant: '#1c2840',
};

/** 類型圓章裡的字（§12.2；地圖的點、選中的水滴也用） */
export const TYPE_GLYPHS: Record<PlaceType, string> = {
  station: '駅',
  spot: '景',
  lodging: '宿',
  restaurant: '食',
};

/** 類型的線條圖示（沒有照片的替代圖、拖曳的小標籤用；其他地方用類型圓章，見 TypeLabel） */
export const TYPE_ICON_NAMES: Record<PlaceType, IconName> = {
  station: 'train',
  spot: 'pin',
  lodging: 'bed',
  restaurant: 'fork',
};

/** 類型色當底、上面寫字的樣式（沒有照片的縮圖、類型色塊）：餐廳的字是墨色 */
export function typeSwatch(type: PlaceType): { background: string; color: string } {
  return { background: TYPE_COLORS[type], color: TYPE_INK[type] };
}
