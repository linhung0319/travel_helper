// 交通方式的圖示：--wash 底的圓＋墨色線條圖。資料在 lib/modeIcon.ts，這裡只是 React 元件。

import { MODE_ICON, MODE_ICON_SIZE, MODE_NAME, modeIconKey, type ModeIconSize } from '../lib/modeIcon.ts';

export { MODE_ICON, modeIconKey, modeIconHtml } from '../lib/modeIcon.ts';

/** 方式圖示；l＝30px 圓、s＝20px */
export function ModeIcon({ mode, size = 'l' }: { mode: Parameters<typeof modeIconKey>[0]; size?: ModeIconSize }) {
  const key = modeIconKey(mode);
  const { bg, fg, path } = MODE_ICON[key];
  const { box, glyph } = MODE_ICON_SIZE[size];
  return (
    <span className={`mode-icon mode-icon-${size}`} role="img" aria-label={MODE_NAME[key]} style={{ width: box, height: box, background: bg, color: fg }}>
      <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </span>
  );
}
