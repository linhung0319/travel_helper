// 列（探索的區段、想去、搜尋結果、AI 挑的結果集共用，兩邊一樣）。T76（interaction-design §35.7）照片牆和清單合成這一種：
// 左邊大照片 136×112（圓角、類型圓章在左上），右邊名稱（最多兩行）＋等級、第二行（景點：子地區；餐廳：子地區・價位第一段；
// 住宿：住法那句・每人價下限）、重點膠囊（已排、主辦考慮放、長輩 ◎ 很適合、二月休，最多兩顆）、「誰想去」一行（頭像＋人名，自己在前寫「你」）。
// 右上角愛心只有自己按過才實心紅（VoteHeart；別人按的寫在「誰想去」那行）。
// extra 有給就換掉第二行以下（舊的想去清單用，T79 刪）；meta、caps、foot 是想去的新列用的（第二行換成「2/7 候選」、最下面加最新留言）。
// 網頁：滑鼠移上去呼叫 appStore.hover(id)，移開 hover(null)（地圖的「指到」）；原地展開（below）接在列下面（§13.3 的 PlaceOpen）。樣式在 ui.css（.pr-）。

import { useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { appStore } from '../../store.ts';
import { useData, useShared } from '../../hooks.ts';
import { Photo } from '../../components/Photo.tsx';
import { Avatar } from '../../components/common.tsx';
import { photoCandidates } from '../../lib/photos.ts';
import { memberName } from '../../sharedStore.ts';
import { TypeArt } from './TypeArt.tsx';
import { placeDayStatus } from '../../lib/wishlist.ts';
import { isUserPlace, placeMetaText, userSubtitle } from '../../lib/addPlace/view.ts';
import { PlaceTags } from './PlaceTags.tsx';
import type { Area, Place } from '../../data/types.ts';
import { rowHighlights, type RowHighlight } from '../rowHighlights.ts';
import { TierMark } from './TierMark.tsx';
import { stayCaption } from '../../lib/badges.ts';
import { rowPrice } from '../../lib/placeSummary.ts';
import { TypeSeal } from './TypeLabel.tsx';
import { VoteHeart } from './VoteHeart.tsx';
import { meFirst, whoText } from '../whoLine.ts';

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
export function Highlights({ list, testId = 'place-caps' }: { list: RowHighlight[]; testId?: string }) {
  if (!list.length) return null;
  return (
    <span className="pr-caps" data-testid={testId}>
      {list.map((h) => (
        <span key={h.label} className={`pr-cap pr-cap-${h.tone}`}>
          {h.label}
        </span>
      ))}
    </span>
  );
}

/** 列的第二行（§35.7）：景點是子地區；餐廳是子地區・價位第一段；住宿是住法那句・每人價下限 */
export function rowMeta(place: Place, areas: Area[]): string {
  const where = placeMetaText(place, areas);
  if (place.type === 'lodging') return [stayCaption(place)?.label ?? where, rowPrice(place)].filter(Boolean).join('・');
  if (place.type === 'restaurant') return [where, rowPrice(place)].filter(Boolean).join('・');
  return where;
}

/** 想去這個點的人（不含收回的），照按的順序 */
function useLikers(placeId: string): string[] {
  const votes = useShared((s) => s.votes);
  return useMemo(() => votes.filter((v) => v.placeId === placeId && !v.deletedAt && v.value === 'like').map((v) => v.memberId), [votes, placeId]);
}

/** 「誰想去」一行：頭像（最多三個）＋人名；沒人按不畫 */
export function WhoLine({ placeId }: { placeId: string }) {
  const ids = useLikers(placeId);
  const me = useShared((s) => s.me?.id);
  const members = useShared((s) => s.members);
  if (!ids.length) return null;
  return (
    <span className="pr-who" data-testid="row-who">
      <span className="pr-avatars">
        {meFirst(ids, me)
          .slice(0, 3)
          .map((id) => (
            <Avatar key={id} id={id} />
          ))}
      </span>
      <span className="pr-who-text">{whoText(ids, me, (id) => memberName(members, id))}</span>
    </span>
  );
}

/** 大照片：有照片用照片（打不開自己換下一張），沒有就是 TypeArt；類型圓章在左上 */
function RowPhoto({ place, letter }: { place: Place; letter?: string }) {
  return (
    <span className="pr-photo">
      {photoCandidates(place.photos).length ? <Photo place={place} width={320} /> : <TypeArt type={place.type} className="pr-photo-fallback" testId="m-thumb-fallback" />}
      <span className="pr-seal">
        <TypeSeal type={place.type} size="lg" label />
      </span>
      {letter && (
        <span className="ai-letter" data-testid="ai-letter">
          {letter}
        </span>
      )}
    </span>
  );
}

export interface PlaceRowProps {
  place: Place;
  status?: DayStatus;
  /** 換掉第二行以下（舊的想去清單，T79 刪） */
  extra?: ReactNode;
  /** 換掉第二行（想去：「2/7 候選」膠囊） */
  meta?: ReactNode;
  /** 換掉重點膠囊 */
  caps?: RowHighlight[];
  /** 最下面多一行（想去：最新留言） */
  foot?: ReactNode;
  /** 「誰想去」那行；預設畫 */
  who?: boolean;
  /** 右上角；預設是 VoteHeart */
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
  /** AI 挑的：一行理由（結果集，規格 §3.1） */
  aiNote?: string;
  /** AI 比較時的 A、B、C */
  letter?: string;
}

export function PlaceRow({ place, status, extra, meta, caps, foot, who = true, right, onOpen, testId, rank, hot, rootProps, open = false, below, aiNote, letter }: PlaceRowProps) {
  const areas = useData((s) => s.areas);
  const name = place.name.zh || place.name.ja;
  const members = useShared((s) => s.members);
  const user = isUserPlace(place);
  const metaText = [rowMeta(place, areas), user ? userSubtitle(place, members) : ''].filter(Boolean).join('・');
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
      <RowPhoto place={place} letter={letter} />
      <span className="pr-text">
        <span className="pr-name">
          <span className="pr-name-text">{name}</span>
          {!user && <TierMark tier={place.tier} />}
          <PlaceTags place={place} />
        </span>
        {extra ?? (
          <>
            {meta ??
              (metaText && (
                <span className="pr-meta" data-testid="row-meta">
                  {metaText}
                </span>
              ))}
            {aiNote ? (
              <span className="ai-note" data-testid="ai-note">
                ✦ {aiNote}
              </span>
            ) : (
              <Highlights list={caps ?? rowHighlights(place, status ?? { candidate: [], scheduled: [] })} />
            )}
            {who && <WhoLine placeId={place.id} />}
            {foot}
          </>
        )}
      </span>
      <span className="pr-right">{right ?? <VoteHeart placeId={place.id} />}</span>
    </div>
  );
  // 原地展開（網頁第八輪 §13.3）：列的下面接 below。可以展開的列外面一直包一層，展開、收合時列不會重建（照片才不會閃）
  if (below === undefined) return row;
  return (
    <div className={open ? 'pr-open' : 'pr-closed'}>
      {row}
      {open && below}
    </div>
  );
}
