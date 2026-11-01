import { useMemo, useState, type SyntheticEvent } from 'react';
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

/** 載入過的照片的比例：卡片重新掛上時（照片牆展開的卡換位置）照片先佔好高度，不會縮成一條再撐開，看起來像收合又打開 */
const RATIOS = new Map<string, number>();

function remember(url: string, e: SyntheticEvent<HTMLImageElement>) {
  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
  if (w > 0 && h > 0) RATIOS.set(url, w / h);
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
  const ratio = RATIOS.get(url);
  return (
    <img
      key={url}
      className={`photo ${className ?? ''}`}
      src={url}
      alt={place.name.zh || place.name.ja}
      // 看過的照片：同一格畫面就畫好，不留白一下
      loading={ratio ? 'eager' : 'lazy'}
      decoding={ratio ? 'sync' : 'async'}
      style={ratio ? { aspectRatio: String(ratio) } : undefined}
      referrerPolicy="no-referrer"
      onLoad={(e) => remember(url, e)}
      onError={() => setFailed((n) => n + 1)}
    />
  );
}
