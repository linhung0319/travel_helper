// 手機版「行程」分頁（第六輪 §3.5）：上面是地圖（MobileApp 一直掛著的 MapView），下面是可以拉的面板（DaySheet）。
// 地圖上只有右下角的「放大地圖」（⛶，把面板放到低的位置）；討論、預約在「我」分頁，縮放用兩指（MapView 手機不加 NavigationControl）。
// 選了一張卡（mobileStore.focusItem，點卡片或地圖上的點）：選中那個點（appStore.select，地圖的數字水滴），地圖能不動就不動（被面板蓋住才移，第七輪 §8.2）；
// 換天時取消（mobileStore 聽 appStore 的 day）。網頁版的照片彈窗、小卡片在手機版不出現（MapView）。
// 編輯中「⋯」打開的底部動作面板（ActionSheet）也掛在這裡，蓋在地圖和面板上面。
// 這天的 ✦ 打開的半屏聊天（ChatSheet，portal 到 body，蓋在分頁列上面）也掛在這裡；它開著時行程面板藏起來（DaySheet，高度不變），關掉就回來。

import { useEffect } from 'react';
import { Icon } from '../components/Icon.tsx';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { dayCandidates } from '../lib/wishlist.ts';
import { resizeMap } from '../components/MapView.tsx';
import { uiStore } from '../uiStore.ts';
import { findFocusEntry, mobileStore, useMobile } from './mobileStore.ts';
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

/** 選到的卡：選中那個點、地圖照移動規則（看得到就不動） */
function useFocusOnMap() {
  const placeId = useFocusedPlace();
  useEffect(() => {
    if (!placeId) return;
    // 面板高度變了，地圖先重新算大小再看看得到沒有
    resizeMap();
    if (uiStore.getState().legOpen || uiStore.getState().legEdit) uiStore.setState({ legOpen: null, legEdit: null });
    appStore.getState().select(placeId);
    commands.focus(placeId);
  }, [placeId]);
}

/** 地圖上的小圖示：只有「放大地圖」（面板在中間高度時才出現；班次表開著時不出現，免得蓋住彈窗的角） */
function MapButtons() {
  const snap = useMobile((s) => s.tripSnap);
  const timetable = useUi((s) => s.timetable);
  if (snap !== 'mid' || timetable) return null;
  return (
    <button type="button" className="m-map-button m-map-full" onClick={() => mobileStore.getState().setSnap('low')} aria-label="放大地圖" data-testid="m-trip-full">
      <Icon name="expand" size={20} />
    </button>
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
