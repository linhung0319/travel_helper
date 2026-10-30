// 清單列（探索的清單、想去的列共用，兩邊一樣）：固定 88px。
// 左邊 64px 方形縮圖，中間三行（名稱＋等級；類型色點・類型・地區・★；最多兩個重點膠囊），右邊固定一顆 ❤＋數字（right 可換掉）。
// extra 有給就換掉第二、三行（想去用）。名稱太長就省略，不會推動右邊的 ❤。
// 網頁：滑鼠移上去呼叫 appStore.hover(id)，移開 hover(null)（地圖的「指到」）。樣式在 ui.css。

import { useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { appStore } from '../../store.ts';
import { useData, useShared } from '../../hooks.ts';
import { Photo } from '../../components/Photo.tsx';
import { photoCandidates } from '../../lib/photos.ts';
import { cardTypeLetter } from '../../lib/planView.ts';
import { typeSwatch } from '../../lib/typeStyle.ts';
import { placeDayStatus } from '../../lib/wishlist.ts';
import { isUserPlace, placeMetaText, userSubtitle } from '../../lib/addPlace/view.ts';
import type { Place } from '../../data/types.ts';
import { rowHighlights, type RowHighlight } from '../rowHighlights.ts';
import { TierMark } from './TierMark.tsx';
import { TypeLabel } from './TypeLabel.tsx';
import { VoteHeart } from './VoteHeart.tsx';

export interface DayStatus {
  candidate: string[];
  scheduled: string[];
}

/** 一個點的候選、已排日期（整個清單共用一份候選與行程） */
export function useDayStatus(): (placeId: string) => DayStatus {
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  return useMemo(() => (id: string) => placeDayStatus(id, candidates, itinerary), [candidates, itinerary]);
}

export { placeMetaText };

/** 重點膠囊 */
export function Highlights({ list }: { list: RowHighlight[] }) {
  if (!list.length) return null;
  return (
    <span className="pr-caps" data-testid="place-caps">
      {list.map((h) => (
        <span key={h.label} className={`pr-cap pr-cap-${h.tone}`}>
          {h.label}
        </span>
      ))}
    </span>
  );
}

/** 方形縮圖：有照片用照片（打不開自己換下一張），沒有就是類型色塊加一個字 */
function Square({ place }: { place: Place }) {
  if (!photoCandidates(place.photos).length) {
    return (
      <span className="pr-thumb pr-thumb-fallback" style={typeSwatch(place.type)} data-testid="m-thumb-fallback" aria-hidden>
        {cardTypeLetter(place.type)}
      </span>
    );
  }
  return (
    <span className="pr-thumb">
      <Photo place={place} width={200} />
    </span>
  );
}

export interface PlaceRowProps {
  place: Place;
  status?: DayStatus;
  /** 換掉第二、三行 */
  extra?: ReactNode;
  /** 右邊；預設是 VoteHeart */
  right?: ReactNode;
  onOpen: () => void;
  testId?: string;
  /** 排名（給測試與無障礙用，寫在 data-rank） */
  rank?: number;
  /** 地圖「指到」或被地圖點到：加底色 */
  hot?: boolean;
  /** 其他屬性（例如拖到聊天室的 draggable） */
  rootProps?: HTMLAttributes<HTMLDivElement>;
  /** 原地展開了（網頁）：below 接在列下面 */
  open?: boolean;
  below?: ReactNode;
}

export function PlaceRow({ place, status, extra, right, onOpen, testId, rank, hot, rootProps, open = false, below }: PlaceRowProps) {
  const areas = useData((s) => s.areas);
  const name = place.name.zh || place.name.ja;
  const members = useShared((s) => s.members);
  const user = isUserPlace(place);
  const meta = placeMetaText(place, areas);
  const row = (
    <div
      {...rootProps}
      className={`pr ${user ? 'is-user' : ''} ${hot ? 'flash' : ''} ${open ? 'open' : ''}`}
      aria-expanded={below !== undefined || open ? open : undefined}
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
      <Square place={place} />
      <span className="pr-text">
        <span className="pr-name">
          <span className="pr-name-text">{name}</span>
          {!user && <TierMark tier={place.tier} />}
        </span>
        {extra ?? (
          <>
            <span className="pr-meta">
              <TypeLabel type={place.type} />
              {meta && <span className="pr-meta-text">・{meta}</span>}
            </span>
            {user && <span className="pr-user-by">{userSubtitle(place, members)}</span>}
            <Highlights list={rowHighlights(place, status ?? { candidate: [], scheduled: [] })} />
          </>
        )}
      </span>
      <span className="pr-right">{right ?? <VoteHeart placeId={place.id} />}</span>
    </div>
  );
  // 原地展開（網頁第八輪 §13.3）：列的下面接 below
  if (!open || !below) return row;
  return (
    <div className="pr-open">
      {row}
      {below}
    </div>
  );
}
