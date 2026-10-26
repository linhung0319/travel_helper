// 點地圖上的點（T15m 第七輪 §8.3；網頁滑鼠移上去出的小卡片點了也一樣）：
// - 行程分頁、這天行程裡的點＝選中那張卡（網頁：時間軸展開、捲到它；手機：mobileStore 的 focusItem、展開，清單捲到它）
// - 行程分頁的其他點＝選中、開詳情（網頁浮在地圖上、手機整頁），不改類型和篩選
// - 探索、想去分頁：清單裡有它就捲到那張卡並選中，沒有就直接開詳情（Explore.tsx 的 showInExplore）
// - 點空白處（null）：取消選中
// 地圖照 selectCamera 動（commands.focus 一個點：能不動就不動）。

import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { DESKTOP_QUERY } from '../hooks.ts';
import { dayPlanOf, planStore } from '../planStore.ts';
import { uiStore } from '../uiStore.ts';
import { focusKeyForPlace, mobileStore } from '../mobile/mobileStore.ts';
import { showInExplore } from './Explore.tsx';

/** 網頁時間軸捲到那張卡（展開後的高度畫好了才捲） */
function scrollToCard(key: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-testid="tl-row"][data-item="${CSS.escape(key)}"], [data-testid="tl-start"][data-item="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' }),
  );
}

/** 點了地圖上的點（id）或空白處（null） */
export function pickPlace(id: string | null) {
  const s = appStore.getState();
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  if (!id) {
    s.select(null);
    if (desktop) s.openPreview(null);
    else mobileStore.getState().focusItem(null);
    return;
  }
  s.openPreview(null);
  if (desktop && (s.mode === 'explore' || s.mode === 'wish')) {
    showInExplore(id);
    return;
  }
  const key = s.day === 'all' ? null : focusKeyForPlace(dayPlanOf(planStore.getState().plan, s.day), id);
  if (key) {
    s.select(id);
    if (desktop) {
      uiStore.setState({ expandedItem: key });
      scrollToCard(key);
      commands.focus(id);
    } else {
      const m = mobileStore.getState();
      m.focusItem(key);
      if (m.expanded !== key) m.expandItem(key);
    }
    return;
  }
  // 不在這天的點：選中（openDetail 會選）、開詳情；網頁從行程開的浮在地圖上
  s.openDetail(id, desktop ? 'map' : undefined);
  if (desktop) commands.focus(id);
}
