import { appStore } from '../store.ts';
import { placeBadges } from '../lib/badges.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import type { Place } from '../data/types.ts';
import { Photo } from './Photo.tsx';
import { TierBadge } from './TierBadge.tsx';

interface Props {
  place: Place;
  /** 電腦：貼在點的上方（地圖上的像素座標）；手機：null，固定在地圖下方 */
  anchor: { x: number; y: number } | null;
  onEnter(): void;
  onLeave(): void;
}

/** 第一句（摘要通常 2～3 句） */
export function firstSentence(text: string): string {
  const m = /^.+?[。！？]/.exec(text);
  return m ? m[0] : text;
}

/** 小卡片（interaction-design §4）：照片、名稱、分級、一句摘要、1～2 個標章。點一下開詳情 */
export function PreviewCard({ place, anchor, onEnter, onLeave }: Props) {
  const open = () => appStore.getState().openDetail(place.id);
  const style = anchor ? { left: anchor.x, top: anchor.y } : undefined;
  return (
    <div
      className={`preview-card ${anchor ? 'anchored' : 'docked'}`}
      style={style}
      data-testid="preview-card"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button type="button" className="preview-body" onClick={open} aria-label={`打開 ${place.name.zh || place.name.ja} 的詳情`}>
        <Photo place={place} width={400} className="preview-photo" />
        <span className="preview-text">
          <span className="preview-title">
            <TierBadge tier={place.tier} />
            <strong>{place.name.zh || place.name.ja}</strong>
          </span>
          <span className="preview-sub">
            {TYPE_LABELS[place.type]}
            {place.name.zh && place.name.ja !== place.name.zh ? `・${place.name.ja}` : ''}
          </span>
          {place.summary && <span className="preview-summary">{firstSentence(place.summary.text)}</span>}
          <span className="badges">
            {placeBadges(place).map((b) => (
              <span key={b.label} className={`badge badge-${b.tone}`}>
                {b.label}
              </span>
            ))}
          </span>
        </span>
      </button>
      <button type="button" className="icon-button preview-close" aria-label="關閉小卡片" onClick={() => appStore.getState().openPreview(null)}>
        ✕
      </button>
    </div>
  );
}
