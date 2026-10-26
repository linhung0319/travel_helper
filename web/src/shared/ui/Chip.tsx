// 晶片：一般（白底細框）、選中 on（墨色底）、已套用 applied（--indigo-wash，後面有 ✕ 可以拿掉）。樣式在 ui.css。

import type { ReactNode } from 'react';
import { Icon } from '../../components/Icon.tsx';

/** 晶片按鈕；applied＋onRemove 時右邊多一個 ✕（獨立的按鈕，點了只拿掉）；count 是後面的小數字 */
export function Chip({ on = false, applied = false, onRemove, count, onClick, testId, children }: { on?: boolean; applied?: boolean; onRemove?: () => void; count?: number; onClick?: () => void; testId?: string; children: ReactNode }) {
  const cls = `ui-chip ${on ? 'on' : ''} ${applied ? 'applied' : ''}`;
  const main = (
    <button type="button" className={cls} aria-pressed={on} onClick={onClick} data-testid={testId}>
      {children}
      {count != null && <span className="ui-chip-count">{count}</span>}
    </button>
  );
  if (!applied || !onRemove) return main;
  return (
    <span className="ui-chip-wrap">
      <button type="button" className={`${cls} has-x`} onClick={onClick} data-testid={testId}>
        {children}
        {count != null && <span className="ui-chip-count">{count}</span>}
      </button>
      <button type="button" className="ui-chip-x" aria-label="拿掉這個條件" onClick={onRemove}>
        <Icon name="close" size={16} />
      </button>
    </span>
  );
}
