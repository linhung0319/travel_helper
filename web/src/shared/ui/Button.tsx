// 按鈕：primary（墨色實心）、secondary（細框）、icon（只有圖示的圓鈕）。樣式在 ui.css。

import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '../../components/Icon.tsx';

/** 按鈕；icon 給了就放在文字前面（kind='icon' 時只有圖示，要給 aria-label） */
export function Button({ kind, size = 'md', icon, className = '', children, ...rest }: { kind: 'primary' | 'secondary' | 'icon'; size?: 'sm' | 'md'; icon?: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`ui-btn ui-btn-${kind} ui-btn-${size} ${className}`}>
      {icon && <Icon name={icon} size={size === 'sm' || kind === 'icon' ? 20 : 20} />}
      {children}
    </button>
  );
}
