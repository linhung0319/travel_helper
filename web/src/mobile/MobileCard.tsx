// 手機版的資料卡（第六輪 §3.5）：時間軸上的每一張卡（宿、景、餐、航班、自由時間、會合）和這天的候選都用這個。
// 固定四欄：把手欄（編輯中才有把手，Task 11）、54px 縮圖（photos 第一張；沒有照片是類型色塊，左上角是編號圓，類型色）、
// 內容（時間：📌 放最前面、停留時間；名稱一行省略；標籤那一排、⚠ 數）、右邊 ⋯ 欄（Task 11 才接上，現在留空）。
// 卡片底色是類型的淡色（照網頁版）。點卡片＝在地圖上找到它（focusItem）：被選的那張加框（aria-current），多一行「詳細資料 ›」打開整頁詳情。
// 候選卡：虛線框，寫「誰 加的」，沒有編號。

import type { KeyboardEvent, ReactNode } from 'react';
import type { Place } from '../data/types.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { Thumb } from './Thumb.tsx';
import { mobileStore } from './mobileStore.ts';

/** 車站、機場、使用者加的點：中性灰（和網頁版的類型色塊一樣） */
const NEUTRAL_COLOR = '#6e7781';

/** 編號圓的顏色：景點、住宿、餐廳用類型色，其他中性灰 */
const markColor = (type: Place['type'] | null | undefined) => (type === 'spot' || type === 'lodging' || type === 'restaurant' ? TYPE_COLORS[type] : NEUTRAL_COLOR);

const THUMB = 54;

export interface MobileCardProps {
  /** focusItem 用的 key（項目 ID；出發、回住宿是 start、lodging；候選是 cand:ID） */
  itemKey: string;
  place: Place | undefined;
  /** 沒有資料點時色塊上的字（航班的機場是「機」） */
  fallbackType?: Place['type'] | 'airport' | null;
  /** 和地圖同一個編號；候選沒有 */
  mark?: string | null;
  /** 時間那一行：時間文字、有沒有 📌、停留時間的字 */
  time?: { text: string; pinned?: boolean; stay?: string | null } | null;
  name: string;
  /** 標籤那一排（ItemTags、LodgingTags） */
  tags?: ReactNode;
  /** ⚠ 數（0 不顯示） */
  warnings?: number;
  /** 候選卡：誰加的（MemberName） */
  addedBy?: ReactNode;
  focused: boolean;
}

/** 縮圖（左上角是編號圓）；沒有資料點時是類型色塊加一個字 */
function CardThumb({ place, fallbackType, mark }: Pick<MobileCardProps, 'place' | 'fallbackType' | 'mark'>) {
  return (
    <span className="m-card-thumb">
      {place ? (
        <Thumb place={place} size={THUMB} />
      ) : (
        <span className="m-thumb m-thumb-square m-thumb-fallback" style={{ width: THUMB, height: THUMB, background: NEUTRAL_COLOR }} data-testid="m-thumb-fallback" aria-hidden>
          {cardTypeLetter(fallbackType ?? null)}
        </span>
      )}
      {mark != null && (
        <span className="m-card-no" style={{ background: markColor(place?.type) }} data-testid="m-card-no">
          {mark}
        </span>
      )}
    </span>
  );
}

/** 一張資料卡（時間軸、候選） */
export function MobileCard({ itemKey, place, fallbackType, mark, time, name, tags, warnings = 0, addedBy, focused }: MobileCardProps) {
  const candidate = addedBy != null;
  const focus = () => mobileStore.getState().focusItem(itemKey);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      focus();
    }
  };
  return (
    <li
      className={`m-card type-${place?.type ?? 'other'} ${candidate ? 'm-card-cand' : ''} ${focused ? 'focused' : ''}`}
      data-testid={candidate ? 'm-cand' : 'm-card'}
      data-item={itemKey}
      data-place={place?.id ?? ''}
      aria-current={focused ? 'true' : undefined}
    >
      <span className="m-card-grip" aria-hidden />
      <div className="m-card-main" role="button" tabIndex={0} onClick={focus} onKeyDown={onKey} aria-label={`在地圖上看 ${name}`}>
        <CardThumb place={place} fallbackType={fallbackType} mark={mark} />
        <span className="m-card-body">
          {time && (
            <span className="m-card-time">
              {time.pinned && <span title="指定的開始時間（訂位、表演）">📌</span>}
              <span>{time.text}</span>
              {time.stay && <small className="m-card-stay">{time.stay}</small>}
            </span>
          )}
          <span className="m-card-name m-ellipsis" data-testid="m-card-name">
            {name}
          </span>
          {(tags || warnings > 0 || candidate) && (
            <span className="m-card-meta">
              {tags}
              {warnings > 0 && (
                <span className="m-card-warn" data-testid="m-card-warn">
                  ⚠ {warnings}
                </span>
              )}
              {candidate && <span className="m-card-by muted">{addedBy} 加的</span>}
            </span>
          )}
        </span>
      </div>
      {/* ⋯ 欄：編輯中的動作面板（Task 11）；現在留著位置 */}
      <span className="m-card-more" aria-hidden />
      {focused && place && (
        <button type="button" className="m-card-detail" onClick={() => mobileStore.getState().openPlace(place.id, 'trip')} data-testid="m-card-detail">
          詳細資料 ›
        </button>
      )}
    </li>
  );
}
