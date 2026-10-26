// 線條圖示（設計 §2.4）：24×24 viewBox、stroke currentColor、1.7 寬。資料在 lib/icons.ts。

import { ICON_PATHS, type IconName } from '../lib/icons.ts';

export type { IconName } from '../lib/icons.ts';

/** 線條圖示；filled 時填滿 currentColor（例如已按的 ❤）；沒有 title 時對讀屏隱藏 */
export function Icon({ name, size = 20, filled = false, title }: { name: IconName; size?: 16 | 20 | 24; filled?: boolean; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
