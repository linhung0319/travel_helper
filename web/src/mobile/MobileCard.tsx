// 手機版的資料卡（第六輪 §3.5）：時間軸上的每一張卡（宿、景、餐、航班、自由時間、會合）和這天的候選都用這個。
// 固定四欄：把手欄（編輯中才有把手 ⋮⋮：長按整張卡 0.4 秒後拖，planDrag.ts 的 useLongPressDrag；宿、航班沒有把手但欄位照留）、
// 54px 縮圖（photos 第一張；沒有照片是類型色塊，左上角是編號圓，類型色）、內容（時間：📌 放最前面、停留時間；名稱一行省略；標籤那一排、⚠ 數）、
// 右邊 ⋯ 欄（只在編輯中、這張卡有動作時才有「⋯」，點了打開底部動作面板 ActionSheet；不在編輯中留空）。
// 編輯中時間軸上的卡也是放置區（dropOnCardProps）：放在中間合併、邊緣換順序（第四輪的規則）。
// 卡片底色是類型的淡色（照網頁版）。點卡片＝在地圖上找到它（focusItem；編輯中面板不降到中間）：被選的那張加框（aria-current），多一行「詳細資料 ›」打開整頁詳情。
// 重疊卡（同一時段有備選）：標籤那一排後面是 ‹ n/m ›（按鈕 44px），換著看備卡（縮圖、名稱、時間由 DaySheet 換成那張）。
// 候選卡：虛線框，寫「誰 加的」，沒有編號。

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Place } from '../data/types.ts';
import { useApp } from '../hooks.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import type { DragSource, DropTargetInfo } from '../lib/dropIntent.ts';
import { dropOnCardProps, useLongPressDrag } from '../components/planDrag.ts';
import { cardActions } from '../shared/cardActions.ts';
import { Thumb } from './Thumb.tsx';
import { mobileStore, type ActionSheetSpec } from './mobileStore.ts';

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
  /** 重疊卡的 ‹ n/m ›（放在標籤那一排後面） */
  switcher?: ReactNode;
  /** 編輯中「⋯」打開的動作面板；沒有動作（出發的宿、航班）是 null */
  menu?: ActionSheetSpec | null;
  /** 編輯中可以拖的東西（航班、宿不能拖：null） */
  drag?: DragSource | null;
  /** 編輯中的放置區（時間軸上的卡；候選不是） */
  drop?: Extract<DropTargetInfo, { kind: 'card' }> | null;
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
export function MobileCard({ itemKey, place, fallbackType, mark, time, name, tags, warnings = 0, addedBy, focused, switcher = null, menu = null, drag = null, drop = null }: MobileCardProps) {
  const planning = useApp((s) => s.planning);
  const candidate = addedBy != null;
  const src = planning ? drag : null;
  const pressRef = useLongPressDrag<HTMLLIElement>(src, true);
  const hasMenu = planning && !!menu && cardActions(menu.ctx).length > 0;
  // 編輯中選卡片不把面板降到中間（編輯要看清單）
  const focus = () => mobileStore.getState().focusItem(itemKey, planning);
  // 點標籤那一排（編輯中打開標籤面板）不算點卡片
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.tag-edit, .m-option-switch')) return;
    focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('.tag-edit, .m-option-switch')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      focus();
    }
  };
  return (
    <li
      className={`m-card type-${place?.type ?? 'other'} ${candidate ? 'm-card-cand' : ''} ${focused ? 'focused' : ''} ${planning ? 'editing' : ''}`}
      data-testid={candidate ? 'm-cand' : 'm-card'}
      data-item={itemKey}
      data-place={place?.id ?? ''}
      aria-current={focused ? 'true' : undefined}
      ref={pressRef}
      {...(planning && drop ? dropOnCardProps(drop, true) : {})}
    >
      <span className="m-card-grip" aria-hidden>
        {src && (
          <span className="m-card-handle" data-testid="m-card-handle">
            ⋮⋮
          </span>
        )}
      </span>
      <div className="m-card-main" role="button" tabIndex={0} onClick={onClick} onKeyDown={onKey} aria-label={`在地圖上看 ${name}`}>
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
          {(tags || switcher || warnings > 0 || candidate) && (
            <span className="m-card-meta">
              {tags}
              {switcher}
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
      <span className="m-card-more">
        {hasMenu && (
          <button type="button" className="m-card-menu" aria-label={`${name} 的動作`} aria-haspopup="menu" onClick={() => mobileStore.getState().openActions(menu!)} data-testid="m-card-menu">
            ⋯
          </button>
        )}
      </span>
      {focused && place && (
        <button type="button" className="m-card-detail" onClick={() => mobileStore.getState().openPlace(place.id, 'trip')} data-testid="m-card-detail">
          詳細資料 ›
        </button>
      )}
    </li>
  );
}
