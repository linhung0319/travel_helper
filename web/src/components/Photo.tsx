import { useMemo, useState } from 'react';
import { photoCandidates } from '../lib/photos.ts';
import { TYPE_ICON_NAMES, typeSwatch } from '../lib/typeStyle.ts';
import { Icon } from './Icon.tsx';
import type { Place } from '../data/types.ts';

interface Props {
  place: Place;
  /** 要從第幾張照片開始（詳情面板的輪播用） */
  index?: number;
  width?: number;
  className?: string;
  /** 替代圖上要不要寫名稱（照片牆要，小卡片已經有名稱了） */
  showName?: boolean;
  /** 只試 photos[index] 這一張（輪播的每一格），不往後換 */
  only?: boolean;
}

/**
 * 代表照片：photos[index] 打不開時依序換下一張，全部打不開就顯示類別的顏色、圖示（和名稱）。
 * 外站的照片可能擋外連，所以不送 referrer（interaction-design §7）。
 */
export function Photo({ place, index = 0, width = 800, className, showName, only }: Props) {
  const candidates = useMemo(
    () => photoCandidates(place.photos.slice(index, only ? index + 1 : undefined), width),
    [place, index, width, only],
  );
  const [failed, setFailed] = useState(0);
  const url = candidates[failed];
  if (!url) {
    return (
      <div className={`photo photo-fallback ${className ?? ''}`} style={typeSwatch(place.type)} data-testid="photo-fallback">
        <span className="photo-fallback-icon">
          <Icon name={TYPE_ICON_NAMES[place.type]} size={24} />
        </span>
        {showName && <span className="photo-fallback-name">{place.name.zh || place.name.ja}</span>}
      </div>
    );
  }
  return (
    <img
      key={url}
      className={`photo ${className ?? ''}`}
      src={url}
      alt={place.name.zh || place.name.ja}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed((n) => n + 1)}
    />
  );
}
