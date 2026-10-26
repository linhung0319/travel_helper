import { useLayoutEffect, useRef, useState } from 'react';
import { appStore } from '../store.ts';
import { placeBadges } from '../lib/badges.ts';
import { CONTEXT_LABELS, TYPE_LABELS } from '../lib/filter.ts';
import type { Place } from '../data/types.ts';
import { Photo } from './Photo.tsx';
import { TierMark } from '../shared/ui/TierMark.tsx';
import { pickPlace } from './mapPick.ts';
import { CardType } from './Timeline.tsx';
import { Icon } from './Icon.tsx';

interface Props {
  place: Place;
  /** 電腦：貼在點的上方（地圖上的像素座標）；手機：null，固定在地圖下方 */
  anchor: { x: number; y: number } | null;
  onEnter(): void;
  onLeave(): void;
}

/** 卡片和點之間的距離（px）；點上方放不下（卡片會超出地圖上緣）時改放在點的下方 */
const GAP = 18;
const TOP_MARGIN = 4;

/**
 * 地圖彈窗（第五輪 §10）：寬 340 的直式卡片，上面照片（右下 1 / N），下面類型色塊＋名稱、tag 一排、摘要約三行。
 * 在地圖上所有浮動的東西（日期列、工具列、比較列、班次表）上面，靠近上緣時可以蓋在日期列上。
 * 手機點一下開詳情；電腦版和點地圖上的點一樣（mapPick.ts）
 */
export function PreviewCard({ place, anchor, onEnter, onLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  const anchorY = anchor?.y ?? null;
  // 上方放不下（連日期列一起蓋掉也放不下）才翻到點的下面；量得到高度後才知道
  useLayoutEffect(() => {
    if (anchorY == null || !ref.current) return;
    setBelow(anchorY - GAP - ref.current.offsetHeight < TOP_MARGIN);
  }, [anchorY, place.id]);
  const open = () => (anchor ? pickPlace(place.id) : appStore.getState().openDetail(place.id));
  const style = anchor ? { left: anchor.x, top: anchor.y } : undefined;
  const name = place.name.zh || place.name.ja;
  // tag 一排：和詳情一樣的標章、情境、料理（放不下的被切掉）
  const tags: { label: string; tone: string | null }[] = [
    ...placeBadges(place, 4),
    ...place.contexts.map((c) => ({ label: CONTEXT_LABELS[c], tone: null })),
    ...place.cuisine.map((c) => ({ label: c, tone: null })),
  ];
  return (
    <div
      ref={ref}
      className={`preview-card ${anchor ? 'anchored' : 'docked'}${anchor && below ? ' below' : ''}`}
      style={style}
      data-testid="preview-card"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button type="button" className="preview-body" onClick={open} aria-label={anchor ? `在探索裡看 ${name}` : `打開 ${name} 的詳情`}>
        <span className="preview-photo-wrap">
          <Photo place={place} width={680} className="preview-photo" />
          {place.photos.length > 1 && <span className="preview-count">1 / {place.photos.length}</span>}
        </span>
        <span className="preview-text">
          <span className="preview-title">
            <CardType type={place.type} />
            <strong>{name}</strong>
            <TierMark tier={place.tier} />
          </span>
          <span className="preview-sub">
            {TYPE_LABELS[place.type]}
            {place.name.zh && place.name.ja !== place.name.zh ? `・${place.name.ja}` : ''}
          </span>
          {tags.length > 0 && (
            <span className="badges preview-tags">
              {tags.map((t) => (
                <span key={t.label} className={t.tone ? `badge badge-${t.tone}` : 'badge'}>
                  {t.label}
                </span>
              ))}
            </span>
          )}
          {place.summary && <span className="preview-summary">{place.summary.text}</span>}
        </span>
      </button>
      <button type="button" className="icon-button preview-close" aria-label="關閉小卡片" onClick={() => appStore.getState().openPreview(null)}>
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
