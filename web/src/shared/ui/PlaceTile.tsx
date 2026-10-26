// 照片牆的一張卡（兩邊共用）：照片高度照原圖比例（限制在範圍內），左上類型（白底膠囊）、右下 ❤＋數字；
// 照片下面：名稱＋等級、地區・★、一行重點（已排、候選優先）。整張可以點；❤ 自己擋掉不開詳情。
// 網頁：滑鼠移上去呼叫 appStore.hover(id)，移開 hover(null)。樣式在 ui.css。

import type { HTMLAttributes } from 'react';
import { appStore } from '../../store.ts';
import { useData } from '../../hooks.ts';
import { Photo } from '../../components/Photo.tsx';
import { photoCandidates } from '../../lib/photos.ts';
import { cardTypeLetter } from '../../lib/planView.ts';
import { TYPE_COLORS } from '../../lib/typeStyle.ts';
import type { Place } from '../../data/types.ts';
import { rowHighlights } from '../rowHighlights.ts';
import { Highlights, placeMetaText, type DayStatus } from './PlaceRow.tsx';
import { TierMark } from './TierMark.tsx';
import { TypeLabel } from './TypeLabel.tsx';
import { VoteHeart } from './VoteHeart.tsx';

export interface PlaceTileProps {
  place: Place;
  status?: DayStatus;
  onOpen: () => void;
  testId?: string;
  rank?: number;
  hot?: boolean;
  rootProps?: HTMLAttributes<HTMLDivElement>;
}

export function PlaceTile({ place, status, onOpen, testId, rank, hot, rootProps }: PlaceTileProps) {
  const areas = useData((s) => s.areas);
  const name = place.name.zh || place.name.ja;
  const meta = placeMetaText(place, areas);
  return (
    <div
      {...rootProps}
      className={`pt type-${place.type} ${hot ? 'flash' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={name}
      data-testid={testId}
      data-id={place.id}
      data-type={place.type}
      data-rank={rank}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onOpen();
      }}
      onMouseEnter={() => appStore.getState().hover(place.id)}
      onMouseLeave={() => appStore.getState().hover(null)}
    >
      <span className="pt-photo">
        {photoCandidates(place.photos).length ? (
          <Photo place={place} width={500} />
        ) : (
          <span className="pt-fallback" style={{ background: TYPE_COLORS[place.type] }} data-testid="m-thumb-fallback" aria-hidden>
            {cardTypeLetter(place.type)}
          </span>
        )}
        <span className="pt-type">
          <TypeLabel type={place.type} onPhoto />
        </span>
        <span className="pt-heart">
          <VoteHeart placeId={place.id} />
        </span>
      </span>
      <span className="pt-text">
        <span className="pt-name">
          <span className="pt-name-text">{name}</span>
          <TierMark tier={place.tier} />
        </span>
        {meta && <span className="pt-meta">{meta}</span>}
        <Highlights list={rowHighlights(place, status ?? { candidate: [], scheduled: [] }, 1)} />
      </span>
    </div>
  );
}
