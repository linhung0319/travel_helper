// 時間軸的卡片（第七輪 Task 8，網頁、手機共用）：白底，靠縮圖、細線、留白分開；選到的卡用 --wash。
// 一列：左邊「把手欄」（handle：編輯中的拖曳把手，沒有東西也留位置，Task 9 在這裡加）、縮圖（網頁 48px、手機 56px；左上角墨色編號圓，
// 沒有照片是類型色底加一個字）、內容（time、名稱、meta＝標籤／切換備卡／⚠）、右邊 more（編輯中的「⋯」）。
// 點卡片＝原地展開（expanded；一次一張，點同一張收起）：三張照片、介紹的前兩句、「詳細資料」「問 AI」兩顆按鈕。
// 點裡面的按鈕、連結、輸入框（標籤、停留 −／＋、⚠、備卡切換）不算點卡片；展開的區塊裡點空白處也不收（要點上面那一列）。
// 外面的 li 的 testid 由呼叫的人給（網頁 tl-row、手機 m-card），卡片本體固定是 trip-card（data-item）。拖曳的事件、ref 也從呼叫的人傳進來。

import type { KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react';
import { Photo } from '../../components/Photo.tsx';
import { askAboutPlace } from '../../uiStore.ts';
import { askAiPrompts } from '../askAiPrompts.ts';
import { cardTypeLetter } from '../../lib/planView.ts';
import { TYPE_COLORS } from '../../lib/typeStyle.ts';
import { photoCandidates } from '../../lib/photos.ts';
import type { Place } from '../../data/types.ts';
import { Button } from './Button.tsx';

/** 車站、機場、使用者加的點：中性灰 */
const NEUTRAL_COLOR = '#6e7781';

/** 沒有照片時縮圖的底色：景點、住宿、餐廳用類型色，其他中性灰（車站是藍底） */
const fallbackColor = (type: Place['type'] | 'airport' | null | undefined) =>
  type === 'spot' || type === 'lodging' || type === 'restaurant' || type === 'station' ? TYPE_COLORS[type] : NEUTRAL_COLOR;

/** 介紹的前兩句（以。！？切；沒有句號就整段）；沒有介紹是空字串 */
export function firstSentences(text: string | null | undefined, n = 2): string {
  const t = (text ?? '').trim();
  if (!t) return '';
  const parts = t.match(/[^。！？!?]+[。！？!?]?/g) ?? [t];
  return parts.slice(0, n).join('').trim();
}

/** 卡片上的「問 AI」：用這個點的第一個建議問題（行程裡問的）開聊天；網頁、手機各自在 chatDraft 變了時切畫面 */
export function askAboutCardPlace(place: Place) {
  askAboutPlace(place.id, askAiPrompts(place.type, true)[0] ?? `「${place.name.zh || place.name.ja}」有什麼要注意的？`, 'trip');
}

export interface TripCardProps {
  /** 項目 ID（或 start、lodging、cand:ID）：寫在 data-item */
  itemKey: string;
  place?: Place;
  /** 沒有資料點時縮圖上的字（航班的機場是「機」） */
  fallbackType?: Place['type'] | 'airport' | null;
  /** 和地圖同一個編號；沒有（候選）不畫 */
  mark?: string | null;
  /** 時間那一行 */
  time?: ReactNode;
  name: ReactNode;
  /** 名稱的 aria 文字（name 不是純文字時用） */
  label: string;
  /** 標籤、切換備卡、⚠ 那一排 */
  meta?: ReactNode;
  /** 名稱下面的備註、警告清單 */
  below?: ReactNode;
  expanded: boolean;
  /** 點卡片（不是裡面的按鈕） */
  onToggle: () => void;
  /** 展開後的「詳細資料」（沒有資料點不畫） */
  onDetail?: () => void;
  /** 展開後的「問 AI」 */
  onAsk?: () => void;
  /** 選到的卡（--wash 底） */
  selected?: boolean;
  /** 縮圖邊長（網頁 48、手機 56） */
  thumb: number;
  /** 左邊把手欄的內容（編輯中的把手）；null 也留位置 */
  handle?: ReactNode;
  /** 右邊（編輯中的「⋯」） */
  more?: ReactNode;
  /** 候選：虛線框 */
  dashed?: boolean;
  className?: string;
  testId: string;
  liRef?: Ref<HTMLLIElement>;
  liProps?: Record<string, unknown>;
  /** data-place（預設是 place 的 ID；有備卡時是主卡的 ID） */
  dataPlace?: string;
  /** 滑鼠移上去／移開（網頁：地圖的「指到」） */
  onHover?: (over: boolean) => void;
}

/** 點到這些東西不算點卡片 */
const INTERACTIVE = 'button, a, input, select, textarea, .tag-edit, .option-switch, .m-option-switch, .tc-expand';

/** 縮圖（有照片用照片，沒有就是類型色底加一個字）加左上角的編號圓 */
function CardThumb({ place, fallbackType, mark, size }: Pick<TripCardProps, 'place' | 'fallbackType' | 'mark'> & { size: number }) {
  const has = !!place && photoCandidates(place.photos).length > 0;
  const type = place?.type ?? fallbackType ?? null;
  return (
    <span className="tc-thumb" style={{ width: size, height: size }}>
      {has && place ? (
        <Photo place={place} width={Math.max(200, size * 3)} />
      ) : (
        <span className="tc-thumb-fallback" style={{ background: fallbackColor(type) }} data-testid="item-type" aria-hidden>
          {cardTypeLetter(type)}
        </span>
      )}
      {mark != null && (
        <span className="tc-no" data-testid="trip-card-no">
          {mark}
        </span>
      )}
    </span>
  );
}

/** 展開的內容：三張照片、介紹前兩句、兩顆按鈕 */
function Expand({ place, onDetail, onAsk }: Pick<TripCardProps, 'place' | 'onDetail' | 'onAsk'>) {
  const shown = place ? Math.min(3, place.photos.length) : 0;
  const intro = firstSentences(place?.summary?.text);
  return (
    <div className="tc-expand" data-testid="trip-card-expand">
      {place && shown > 0 && (
        <div className="tc-photos" data-testid="trip-card-photos">
          {Array.from({ length: shown }, (_, i) => (
            <span key={i} className="tc-photo">
              <Photo place={place} index={i} only width={400} />
            </span>
          ))}
        </div>
      )}
      {intro && (
        <p className="tc-intro" data-testid="trip-card-intro">
          {intro}
        </p>
      )}
      {place && (
        <div className="tc-actions">
          {onDetail && (
            <Button kind="secondary" size="sm" onClick={onDetail} data-testid="trip-card-detail">
              詳細資料
            </Button>
          )}
          {onAsk && (
            <Button kind="secondary" size="sm" icon="spark" onClick={onAsk} data-testid="trip-card-ask">
              問 AI
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** 一張時間軸的卡（行程、候選） */
export function TripCard({ itemKey, place, fallbackType, mark, time, name, label, meta, below, expanded, onToggle, onDetail, onAsk, selected = false, thumb, handle = null, more = null, dashed = false, className = '', testId, liRef, liProps, dataPlace, onHover }: TripCardProps) {
  const click = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    onToggle();
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <li
      {...liProps}
      ref={liRef}
      className={`tc-li ${selected ? 'selected' : ''} ${dashed ? 'dashed' : ''} ${expanded ? 'expanded' : ''} ${className}`}
      data-testid={testId}
      data-item={itemKey}
      data-place={dataPlace ?? place?.id ?? ''}
      aria-current={selected ? 'true' : undefined}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
    >
      <span className="tc-grip" aria-hidden>
        {handle}
      </span>
      <div className="tc" data-testid="trip-card" data-item={itemKey} tabIndex={0} aria-expanded={expanded} aria-label={`${label}，${expanded ? '收起' : '展開'}`} onClick={click} onKeyDown={key}>
        <div className="tc-row">
          <CardThumb place={place} fallbackType={fallbackType} mark={mark} size={thumb} />
          <span className="tc-body">
            {time && <span className="tc-time">{time}</span>}
            <span className="tc-name" data-testid="trip-card-name">
              {name}
            </span>
            {meta && <span className="tc-meta">{meta}</span>}
            {below}
          </span>
        </div>
        {expanded && <Expand place={place} onDetail={onDetail} onAsk={onAsk} />}
      </div>
      <span className="tc-more">{more}</span>
    </li>
  );
}

