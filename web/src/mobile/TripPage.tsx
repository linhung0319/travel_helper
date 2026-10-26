// 手機版「行程」分頁（第六輪 §3.5）：上面是地圖（MobileApp 一直掛著的 MapView），下面是可以拉的面板（DaySheet）。
// 地圖右上角是 💬 討論、📋 預約兩個小圖示（有數字就顯示，點了是整頁），右下角「⛶」把面板放到低的位置。
// 選了一張卡（mobileStore.focusItem，點卡片或地圖上的圖釘）：地圖飛到那個點，圖釘放大、加黑框（highlight 的 focus 樣式，MapView 畫），
// 這天其他的路線變淡；取消（null）、換天時全部恢復。網頁版的照片彈窗、小卡片在手機版不出現（MapView）。
// 編輯中「⋯」打開的底部動作面板（ActionSheet）也掛在這裡，蓋在地圖和面板上面。
// 這天的 ✨ 打開的半屏聊天（ChatSheet，portal 到 body，蓋在分頁列上面）也掛在這裡。

import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon.tsx';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, usePlan, useShared } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { dayCandidates } from '../lib/wishlist.ts';
import { TRIP_TARGET } from '../backend/types.ts';
import { useCommentCount } from '../shared/placeLists.ts';
import { resizeMap } from '../components/MapView.tsx';
import { uiStore } from '../uiStore.ts';
import { findFocusEntry, mobileStore, useMobile } from './mobileStore.ts';
import { usePendingCount } from './MePage.tsx';
import { DaySheet } from './DaySheet.tsx';
import { ActionSheet } from './ActionSheet.tsx';
import { ChatSheet } from './ChatSheet.tsx';

/** 選到的卡是哪個點（時間軸的卡、或這天的候選 cand:ID）；找不到是 null */
function useFocusedPlace(): string | null {
  const focused = useMobile((s) => s.focused);
  const day = useApp((s) => s.day);
  const plan = usePlan((s) => (day === 'all' ? null : dayPlanOf(s.plan, day)));
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  if (!focused || day === 'all') return null;
  if (focused.startsWith('cand:')) {
    const id = Number(focused.slice(5));
    return dayCandidates(candidates, day, itinerary).find((c) => c.id === id)?.placeId ?? null;
  }
  return findFocusEntry(plan, focused)?.placeId ?? null;
}

/** 選到的卡：地圖飛過去、加黑框、其他路線變淡；換天時取消 */
function useFocusOnMap() {
  const placeId = useFocusedPlace();
  const day = useApp((s) => s.day);
  const firstDay = useRef(day);
  useEffect(() => {
    if (firstDay.current === day) return;
    firstDay.current = day;
    mobileStore.getState().focusItem(null);
  }, [day]);
  useEffect(() => {
    if (!placeId) return;
    // 面板高度變了，地圖先重新算大小再飛（不然飛到的中心會被面板蓋住）
    resizeMap();
    if (uiStore.getState().legOpen) uiStore.setState({ legOpen: null });
    commands.focus(placeId);
    appStore.getState().setHighlight('focus', [placeId]);
    return () => appStore.getState().setHighlight('focus', []);
  }, [placeId]);
}

/** 地圖上的小圖示：💬 討論、📋 預約（右上），⛶ 面板放低（右下） */
function MapButtons() {
  const comments = useCommentCount(TRIP_TARGET);
  const pending = usePendingCount();
  const snap = useMobile((s) => s.tripSnap);
  const open = (page: 'comments' | 'reservations') => mobileStore.getState().setPage(page);
  return (
    <>
      <div className="m-map-buttons">
        <button type="button" className="m-map-button" onClick={() => open('comments')} aria-label="整趟的討論" data-testid="m-trip-comments">
          <Icon name="chat" size={20} />
          {comments > 0 && <span className="m-map-count">{comments}</span>}
        </button>
        <button type="button" className="m-map-button" onClick={() => open('reservations')} aria-label="預約" data-testid="m-trip-reservations">
          <Icon name="clipboard" size={20} />
          {pending > 0 && <span className="m-map-count warn">{pending}</span>}
        </button>
      </div>
      {snap === 'mid' && (
        <button type="button" className="m-map-button m-map-full" onClick={() => mobileStore.getState().setSnap('low')} aria-label="全螢幕地圖" data-testid="m-trip-full">
          ⛶
        </button>
      )}
    </>
  );
}

export function TripPage() {
  useFocusOnMap();
  return (
    <div className="m-trip" data-testid="m-trip">
      <MapButtons />
      <DaySheet />
      <ActionSheet />
      <ChatSheet />
    </div>
  );
}
