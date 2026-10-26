// 手機版的資料卡（第六輪 §3.5，第七輪 Task 8 改成共用的 shared/ui/TripCard.tsx）：時間軸上的每一張卡（宿、景、餐、航班、自由時間、會合）和這天的候選都用這個。
// 這裡只準備手機要的東西：縮圖 56px（photos 第一張；沒有照片是類型色底加一個字，左上角是墨色編號圓）、時間（📌 放最前面、停留時間）、
// 名稱、標籤那一排、⚠ 數；編輯中左邊把手欄（44px）有把手（按把手就拖、不用長按，planDrag.ts 的 usePlanDrag；拖的時候面板暫時拉滿、放開回到原本高度；
// 卡片其他地方照常捲動；宿、航班沒有把手但欄位照留）、
// 右邊 ⋯（只在編輯中、這張卡有動作時才有，點了打開底部動作面板 ActionSheet）。編輯中時間軸上的卡也是放置區（dropOnCardProps）。
// 點卡片＝原地展開（mobileStore.expandItem，一次一張，點同一張收起）並選中它（focusItem → TripPage 的 appStore.select，地圖的數字水滴；不改面板高度）：
// 三張照片、介紹前兩句、「詳細資料」（整頁詳情）、「問 AI」（半屏聊天）。被選的那張底色是 --wash（aria-current）。
// 重疊卡（同一時段有備選）：標籤那一排後面是 ‹ n/m ›（按鈕 44px），換著看備卡（縮圖、名稱、時間由 DaySheet 換成那張）。
// 候選卡：虛線框，寫「誰 加的」，沒有編號。

import type { ReactNode } from 'react';
import type { Place } from '../data/types.ts';
import { useApp } from '../hooks.ts';
import type { DragSource, DropTargetInfo } from '../lib/dropIntent.ts';
import { dropOnCardProps, usePlanDrag } from '../components/planDrag.ts';
import { cardActions } from '../shared/cardActions.ts';
import { Icon } from '../components/Icon.tsx';
import { DragHandle, TripCard, askAboutCardPlace } from '../shared/ui/TripCard.tsx';
import { mobileStore, useMobile, type ActionSheetSpec, type TripSnap } from './mobileStore.ts';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';

/** 縮圖邊長（手機 56px） */
const THUMB = 56;

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

/** 拖之前面板停在哪（拖的時候拉滿，放開回到這裡） */
let snapBeforeDrag: TripSnap | null = null;

/** 拖曳開始：面板暫時拉滿 */
const liftSheet = () => {
  const m = mobileStore.getState();
  snapBeforeDrag = m.tripSnap;
  m.setSnap('high');
};

/** 拖完：回到原本的高度 */
const dropSheet = () => {
  if (snapBeforeDrag) mobileStore.getState().setSnap(snapBeforeDrag);
  snapBeforeDrag = null;
};

/** 一張資料卡（時間軸、候選） */
export function MobileCard({ itemKey, place, fallbackType, mark, time, name, tags, warnings = 0, addedBy, focused, switcher = null, menu = null, drag = null, drop = null }: MobileCardProps) {
  const planning = useApp((s) => s.planning);
  const expanded = useMobile((s) => s.expanded) === itemKey;
  const candidate = addedBy != null;
  const src = planning ? drag : null;
  const pressRef = usePlanDrag<HTMLLIElement>(src, true, { onStart: liftSheet, onEnd: dropSheet });
  const hasMenu = planning && !!menu && cardActions(menu.ctx).length > 0;
  // 點卡片：展開（再點收起）；展開時選中它（面板高度不變）。再點一次同一張，地圖的水滴再跳一次
  const toggle = () => {
    const m = mobileStore.getState();
    const open = m.expanded !== itemKey;
    m.expandItem(itemKey);
    // 已經是選到的卡（點同一張）：選中不變，水滴再跳；不然展開時換成選這張（TripPage 選中、移地圖）
    if (m.focused === itemKey) {
      if (place) {
        appStore.getState().select(place.id);
        // 地圖被移開了也照移動規則讓它看得到（§8.2）
        commands.focus(place.id);
      }
    } else if (open) m.focusItem(itemKey);
  };
  return (
    <TripCard
      testId={candidate ? 'm-cand' : 'm-card'}
      itemKey={itemKey}
      place={place}
      fallbackType={fallbackType}
      mark={mark}
      time={
        time && (
          <>
            {time.pinned && (
              <span title="指定的開始時間（訂位、表演）">
                <Icon name="pin" size={16} />
              </span>
            )}
            <span>{time.text}</span>
            {time.stay && <small className="tc-stay">{time.stay}</small>}
          </>
        )
      }
      name={name}
      label={name}
      meta={
        (tags || switcher || warnings > 0 || candidate) && (
          <>
            {tags}
            {switcher}
            {warnings > 0 && (
              <span className="tc-warn" data-testid="m-card-warn">
                <Icon name="warn" size={16} /> {warnings}
              </span>
            )}
            {candidate && <span className="m-card-by muted">{addedBy} 加的</span>}
          </>
        )
      }
      selected={focused}
      expanded={expanded}
      onToggle={toggle}
      onDetail={place ? () => mobileStore.getState().openPlace(place.id, 'trip') : undefined}
      onAsk={place ? () => askAboutCardPlace(place) : undefined}
      thumb={THUMB}
      dashed={candidate}
      movable={!!src}
      className={planning ? 'editing' : ''}
      liRef={pressRef}
      liProps={planning && drop ? dropOnCardProps(drop, true) : undefined}
      handle={
src ? <DragHandle testId="m-card-handle" /> : null
      }
      more={
        hasMenu ? (
          <button type="button" className="m-card-menu" aria-label={`${name} 的動作`} aria-haspopup="menu" onClick={() => mobileStore.getState().openActions(menu!)} data-testid="m-card-menu">
            ⋯
          </button>
        ) : null
      }
    />
  );
}
