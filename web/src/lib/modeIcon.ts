// 交通方式的圖示資料（Material Icons 的 SVG path，24×24）和顏色；給 ModeIcon 元件和地圖的 DOM 標記共用。
// 純 .ts（不含 JSX），測試才讀得到。

import type { Leg, TransitRide } from '@travel-helper/engine';

export interface ModeIconSpec {
  bg: string;
  fg: string;
  path: string;
}

/** 色塊（bg）、圖（fg）、path；船、自駕的顏色避開類型色（景點綠、住宿紫、餐廳橘、車站藍）和其他交通色 */
export const MODE_ICON: Record<'walk' | 'taxi' | 'bus' | 'train' | 'ferry' | 'car' | 'unknown', ModeIconSpec> = {
  walk: {
    bg: '#5f6b7a',
    fg: '#ffffff',
    path: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
  },
  taxi: {
    bg: '#2b2b2b',
    fg: '#ffd400',
    path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5H15V3H9v2H6.5c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  },
  bus: {
    bg: '#00838f',
    fg: '#ffffff',
    path: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  },
  train: {
    bg: '#c62828',
    fg: '#ffffff',
    path: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  },
  ferry: {
    bg: '#283593',
    fg: '#ffffff',
    path: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
  },
  car: {
    bg: '#9e9d24',
    fg: '#ffffff',
    path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  },
  // 交通未定：灰底問號（Material help_outline），不要讓人以為是開車
  unknown: {
    bg: '#9e9e9e',
    fg: '#ffffff',
    path: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
  },
};

export type ModeIconKey = keyof typeof MODE_ICON;

/** 圖示 aria-label 用的方式中文名 */
export const MODE_NAME: Record<ModeIconKey, string> = { walk: '步行', taxi: '計程車', bus: '巴士', train: '電車', ferry: '船', car: '車', unknown: '交通未定' };

/** 方式 → 圖示；交通未定（unknown）用灰色問號；包車、自駕、其他用 car；transit 沒給第一程的方式就用 bus（呼叫的人要把 transit 換成第一程的方式） */
export function modeIconKey(mode: Leg['mode'] | TransitRide['mode'] | 'transit'): ModeIconKey {
  switch (mode) {
    case 'walk':
    case 'taxi':
    case 'bus':
    case 'train':
    case 'ferry':
      return mode;
    case 'transit':
      return 'bus';
    case 'unknown':
      return 'unknown';
    default:
      return 'car';
  }
}

/** l＝30px 方塊、20px 圖；s＝20px、14px 圖 */
export const MODE_ICON_SIZE = { l: { box: 30, glyph: 20 }, s: { box: 20, glyph: 14 } } as const;
export type ModeIconSize = keyof typeof MODE_ICON_SIZE;

/** 給 MapLibre 的 DOM 標記用的 HTML 字串（同一份 MODE_ICON） */
export function modeIconHtml(key: ModeIconKey, size: ModeIconSize): string {
  const { bg, fg, path } = MODE_ICON[key];
  const { box, glyph } = MODE_ICON_SIZE[size];
  return (
    `<span class="mode-icon mode-icon-${size}" role="img" aria-label="${MODE_NAME[key]}" style="width:${box}px;height:${box}px;background:${bg}">` +
    `<svg viewBox="0 0 24 24" width="${glyph}" height="${glyph}" fill="${fg}" aria-hidden="true"><path d="${path}"/></svg></span>`
  );
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** 地圖路線標籤的內容：小圖示＋字（字會跳脫） */
export function routeLabelHtml(mode: Leg['mode'], text: string): string {
  return `${modeIconHtml(modeIconKey(mode), 's')}<span class="route-label-text">${text.replace(/[&<>"]/g, (c) => ESC[c])}</span>`;
}
