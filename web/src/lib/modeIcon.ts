// 交通方式的圖示資料（線條圖示 lib/icons.ts，--wash 底墨色線）；給 ModeIcon 元件和地圖的 DOM 標記共用。
// 純 .ts（不含 JSX），測試才讀得到。

import type { Leg, TransitRide } from '@travel-helper/engine';
import { ICON_PATHS, type IconName } from './icons.ts';

export interface ModeIconSpec {
  /** 底色（--wash） */
  bg: string;
  /** 線條色（墨色） */
  fg: string;
  icon: IconName;
  /** 線條圖示的 path（ICON_PATHS） */
  path: string;
}

/** 搭車的那條細線的顏色（所有交通方式同一個，不再一種方式一種顏色） */
export const MODE_LINE_COLOR = 'var(--ink-3)';

const spec = (icon: IconName): ModeIconSpec => ({ bg: 'var(--wash)', fg: 'var(--ink)', icon, path: ICON_PATHS[icon] });

/** 每種交通方式的線條圖示：--wash 底、墨色線（第七輪）；計程車、自駕、包車都用車；交通未定是問號 */
export const MODE_ICON: Record<'walk' | 'taxi' | 'bus' | 'train' | 'ferry' | 'car' | 'unknown', ModeIconSpec> = {
  walk: spec('walk'),
  taxi: spec('car'),
  bus: spec('bus'),
  train: spec('train'),
  ferry: spec('ferry'),
  car: spec('car'),
  unknown: spec('help'),
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

/** l＝30px 圓、20px 圖；s＝20px、14px 圖 */
export const MODE_ICON_SIZE = { l: { box: 30, glyph: 20 }, s: { box: 20, glyph: 14 } } as const;
export type ModeIconSize = keyof typeof MODE_ICON_SIZE;

/** 給 MapLibre 的 DOM 標記用的 HTML 字串（同一份 MODE_ICON） */
export function modeIconHtml(key: ModeIconKey, size: ModeIconSize): string {
  const { bg, fg, path } = MODE_ICON[key];
  const { box, glyph } = MODE_ICON_SIZE[size];
  return (
    `<span class="mode-icon mode-icon-${size}" role="img" aria-label="${MODE_NAME[key]}" style="width:${box}px;height:${box}px;background:${bg};color:${fg}">` +
    `<svg viewBox="0 0 24 24" width="${glyph}" height="${glyph}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg></span>`
  );
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** 地圖路線標籤的內容：小圖示＋字（字會跳脫） */
export function routeLabelHtml(mode: Leg['mode'], text: string): string {
  return `${modeIconHtml(modeIconKey(mode), 's')}<span class="route-label-text">${text.replace(/[&<>"]/g, (c) => ESC[c])}</span>`;
}
