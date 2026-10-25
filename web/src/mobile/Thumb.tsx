// 手機版的縮圖（第六輪 §3.2、Review Focus 4）：探索圖片牆、想去、行程卡都用。
// 有照片就用 Photo（打不開時它自己換下一張、最後變成類型色塊）；沒有照片就是類型色塊加一個字（景、餐、宿、站、點），不會是破圖或空白。

import { photoCandidates } from '../lib/photos.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { Photo } from '../components/Photo.tsx';
import type { Place } from '../data/types.ts';

/**
 * size：數字＝正方形（px，行程卡、清單列）；'fill'＝填滿寬度、高度照原圖比例（圖片牆，太高太扁由 CSS 裁到固定範圍）
 */
export function Thumb({ place, size }: { place: Place; size: number | 'fill' }) {
  const square = typeof size === 'number' ? { width: size, height: size } : undefined;
  const cls = `m-thumb ${square ? 'm-thumb-square' : 'm-thumb-fill'}`;
  if (!photoCandidates(place.photos).length) {
    return (
      <span className={`${cls} m-thumb-fallback`} style={{ ...square, background: TYPE_COLORS[place.type] }} data-testid="m-thumb-fallback" aria-hidden>
        {cardTypeLetter(place.type)}
      </span>
    );
  }
  return (
    <span className={cls} style={square}>
      <Photo place={place} width={typeof size === 'number' ? Math.max(200, size * 3) : 500} />
    </span>
  );
}
