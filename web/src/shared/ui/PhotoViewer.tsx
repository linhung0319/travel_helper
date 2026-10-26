// 點詳情的照片放大看：全螢幕蓋在最上面，左右鈕（或方向鍵）換張、Esc 或 ✕ 關。兩邊共用，樣式在 ui.css。
// Esc 在 window 的捕獲階段先處理並攔下來，只關放大，不會連詳情一起關掉（App.tsx 的 Esc 在冒泡階段）。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Photo } from '../../components/Photo.tsx';
import { Icon } from '../../components/Icon.tsx';
import { photoCredit } from '../../lib/photos.ts';
import type { Place } from '../../data/types.ts';

/** 放大看照片；start 是從第幾張開始，onClose 關掉 */
export function PhotoViewer({ place, start = 0, onClose }: { place: Place; start?: number; onClose: () => void }) {
  const count = place.photos.length;
  const [at, setAt] = useState(Math.min(Math.max(0, start), Math.max(0, count - 1)));
  const go = (d: number) => setAt((n) => (n + d + count) % count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, onClose]);

  const credit = photoCredit(place.photos[at]);
  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={`${place.name.zh || place.name.ja} 的照片`} data-testid="photo-viewer" onClick={onClose}>
      <div className="pv-stage" onClick={(e) => e.stopPropagation()}>
        <Photo key={at} place={place} index={at} only width={1600} className="pv-img" showName />
      </div>
      <button type="button" className="ui-btn ui-btn-icon pv-close" aria-label="關閉" data-testid="photo-viewer-close" onClick={onClose}>
        <Icon name="close" />
      </button>
      {count > 1 && (
        <>
          <button type="button" className="ui-btn ui-btn-icon pv-nav pv-prev" aria-label="上一張" data-testid="photo-viewer-prev" onClick={(e) => (e.stopPropagation(), go(-1))}>
            <Icon name="chevron" />
          </button>
          <button type="button" className="ui-btn ui-btn-icon pv-nav pv-next" aria-label="下一張" data-testid="photo-viewer-next" onClick={(e) => (e.stopPropagation(), go(1))}>
            <Icon name="chevron" />
          </button>
        </>
      )}
      <p className="pv-foot" onClick={(e) => e.stopPropagation()}>
        <span data-testid="photo-viewer-count">
          {at + 1} / {count}
        </span>
        {credit && <span className="pv-credit">{credit}</span>}
      </p>
    </div>,
    document.body,
  );
}
