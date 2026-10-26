// 類型標示：小色點＋「景點／餐廳／住宿／車站」。onPhoto 時是疊在照片上的白底小標。樣式在 ui.css。

import type { PlaceType } from '../../data/types.ts';
import { TYPE_COLORS } from '../../lib/typeStyle.ts';
import { TYPE_LABELS } from '../../lib/filter.ts';

/** 小色點＋類型字 */
export function TypeLabel({ type, onPhoto = false }: { type: PlaceType; onPhoto?: boolean }) {
  return (
    <span className={`ui-type ${onPhoto ? 'on-photo' : ''}`} data-type={type}>
      <i className="ui-type-dot" style={{ background: TYPE_COLORS[type] }} aria-hidden="true" />
      {TYPE_LABELS[type]}
    </span>
  );
}
