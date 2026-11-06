import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { whenNearViewport } from '../lib/nearViewport.ts';
import { photoCandidates, underlayUrl } from '../lib/photos.ts';
import { TypeArt } from '../shared/ui/TypeArt.tsx';
import type { Place } from '../data/types.ts';

interface Props {
  place: Place;
  /** 要從第幾張照片開始（詳情面板的輪播用） */
  index?: number;
  /** 畫面要的寬度：Google、楽天、Wikimedia 照這個換小尺寸的網址（lib/photos.ts） */
  width?: number;
  className?: string;
  /** 替代圖上要不要寫名稱（大照片要，小縮圖已經有名稱了） */
  showName?: boolean;
  /** 只試 photos[index] 這一張（輪播的每一格），不往後換 */
  only?: boolean;
}

/** 載入過的照片的比例：卡片重新掛上時（展開的列換位置）照片先佔好高度，不會縮成一條再撐開，看起來像收合又打開 */
const RATIOS = new Map<string, number>();
const seen = (url: string) => RATIOS.has(url);

function remember(url: string, e: SyntheticEvent<HTMLImageElement>) {
  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
  if (w > 0 && h > 0) RATIOS.set(url, w / h);
}

/**
 * 代表照片：photos[index] 打不開時依序換下一張，全部打不開就顯示類別的顏色、圖示（和名稱）。
 * 外站的照片可能擋外連，所以不送 referrer（interaction-design §7）。
 * 快進畫面才開始載（lib/nearViewport.ts），載好之前是骨架；換成大圖時（資料卡展開、詳情）先墊著已經有的小圖（T32）。
 */
export function Photo({ place, index = 0, width = 800, className, showName, only }: Props) {
  const candidates = useMemo(
    () => photoCandidates(place.photos.slice(index, only ? index + 1 : undefined), width),
    [place, index, width, only],
  );
  // 失敗的次數跟著這組網址：卡片展開換成大圖時，候選換了，要從頭試
  const candidatesKey = candidates.join('\n');
  const [failure, setFailure] = useState({ key: candidatesKey, count: 0 });
  const failed = failure.key === candidatesKey ? failure.count : 0;
  const url = candidates[failed];

  const ref = useRef<HTMLImageElement>(null);
  const known = !!url && seen(url);
  const [near, setNear] = useState(known);
  useEffect(() => {
    if (near || !url || !ref.current) return;
    return whenNearViewport(ref.current, () => setNear(true));
  }, [near, url]);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  if (!url) {
    return (
      <TypeArt type={place.type} className={`photo photo-fallback ${className ?? ''}`} testId="photo-fallback">
        {showName && <span className="photo-fallback-name">{place.name.zh || place.name.ja}</span>}
      </TypeArt>
    );
  }
  const loaded = known || loadedUrl === url;
  // 第一張（還沒換到別張）才有小圖可以墊
  const first = failed === 0 ? place.photos[index]?.url : undefined;
  const under = !loaded && near && first ? underlayUrl(first, width, seen) : null;
  const ratio = RATIOS.get(url) ?? (under ? RATIOS.get(under) : undefined);
  const state = loaded ? '' : under ? 'photo-under' : 'photo-loading';
  return (
    <img
      key={url}
      ref={ref}
      className={`photo ${state} ${className ?? ''}`}
      src={near ? url : undefined}
      alt={place.name.zh || place.name.ja}
      // 看過的照片：同一格畫面就畫好，不留白一下
      decoding={known ? 'sync' : 'async'}
      style={{ ...(ratio ? { aspectRatio: String(ratio) } : null), ...(under ? { backgroundImage: `url("${under}")` } : null) }}
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        remember(url, e);
        setLoadedUrl(url);
      }}
      onError={() => setFailure({ key: candidatesKey, count: failed + 1 })}
    />
  );
}
