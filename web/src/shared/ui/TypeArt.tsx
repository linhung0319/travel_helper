// 沒有照片時的預設圖（T39）：類型色底、青海波的細線（和登入頁的浪同一個意象）、中間是類型的線條圖示。
// 自己加的點常常沒有照片，所以它會常常出現：看起來要像一張圖，不是破圖或色塊。網頁、手機所有清單和卡片共用。

import { Icon } from '../../components/Icon.tsx';
import { TYPE_COLORS, TYPE_ICON_NAMES } from '../../lib/typeStyle.ts';
import type { IconName } from '../../lib/icons.ts';
import type { PlaceType } from '../../data/types.ts';

/** 機場、沒有類型的點：中性灰 */
const NEUTRAL_COLOR = '#5d6680';

const memo = new Map<string, string>();

/** 青海波的底圖（一片 40×20 無縫重複）：下面一排蓋住上面一排，所以每個圓要用底色填滿 */
function seigaiha(color: string): string {
  let url = memo.get(color);
  if (!url) {
    const scale = (x: number, y: number) => [20, 13.5, 7].map((r) => `<circle cx='${x}' cy='${y}' r='${r}'/>`).join('');
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20'><g fill='${color}' stroke='white' stroke-opacity='.3' stroke-width='1'>` +
      scale(20, 0) +
      scale(0, 10) +
      scale(40, 10) +
      scale(20, 20) +
      scale(0, 30) +
      scale(40, 30) +
      `</g></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    memo.set(color, url);
  }
  return url;
}

export function typeArtStyle(type: PlaceType | 'airport' | null | undefined) {
  const color = type && type !== 'airport' ? TYPE_COLORS[type] : NEUTRAL_COLOR;
  return { backgroundColor: color, backgroundImage: seigaiha(color), color: '#ffffff' };
}

export function TypeArt({ type, className = '', testId, iconSize = 24, children }: { type: PlaceType | 'airport' | null | undefined; className?: string; testId?: string; iconSize?: 16 | 20 | 24; children?: React.ReactNode }) {
  const icon: IconName = type === 'airport' ? 'plane' : type ? TYPE_ICON_NAMES[type] : 'pin';
  return (
    <span className={`type-art ${className}`} style={typeArtStyle(type)} data-testid={testId} data-type={type ?? undefined} aria-hidden>
      <span className="type-art-icon">
        <Icon name={icon} size={iconSize} />
      </span>
      {children}
    </span>
  );
}
