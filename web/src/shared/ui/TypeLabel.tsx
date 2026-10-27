// 類型圓章（interaction-design §12.2）：類型色的圓、裡面一個漢字（景、食、宿、駅），取代第七輪的小色點。樣式在 ui.css（.ui-seal，顏色看 data-type）。
// TypeLabel 是圓章＋「景點／餐廳／住宿／車站」；onPhoto 時只放圓章（疊在照片左上角，白框）。

import type { PlaceType } from '../../data/types.ts';
import { TYPE_GLYPHS } from '../../lib/typeStyle.ts';
import { TYPE_LABELS } from '../../lib/filter.ts';

/** 類型圓章；sm 是跟著文字的小章（晶片、分段按鈕裡），md 是清單、詳情，lg 是照片上 */
export function TypeSeal({ type, size = 'md', label = false }: { type: PlaceType; size?: 'sm' | 'md' | 'lg'; label?: boolean }) {
  return (
    <i className={`ui-seal ${size}`} data-type={type} role={label ? 'img' : undefined} aria-label={label ? TYPE_LABELS[type] : undefined} aria-hidden={label ? undefined : true}>
      {TYPE_GLYPHS[type]}
    </i>
  );
}

/** 圓章＋類型字；onPhoto 只放圓章 */
export function TypeLabel({ type, onPhoto = false }: { type: PlaceType; onPhoto?: boolean }) {
  if (onPhoto) {
    return (
      <span className="ui-type on-photo" data-type={type} title={TYPE_LABELS[type]}>
        <TypeSeal type={type} size="lg" label />
      </span>
    );
  }
  return (
    <span className="ui-type" data-type={type}>
      <TypeSeal type={type} />
      {TYPE_LABELS[type]}
    </span>
  );
}
