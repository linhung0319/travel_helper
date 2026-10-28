// 點地圖上的點（T15m 第七輪 §8.3、第八輪 §13.3；網頁滑鼠移上去出的小卡片點了也一樣）：
// - 網頁、詳情彈窗開著：同一個彈窗原地換成這個點（位置不變，原本的記進「‹」）；點空白處關掉彈窗（右欄、選中、展開的卡都不動）
// - 網頁、沒有彈窗：探索、想去分頁＝彈窗蓋住整個右欄（不再捲到卡片）；行程分頁見下面
// - 行程分頁、這天行程裡的點＝選中那張卡（網頁：時間軸展開、捲到它，浮在地圖上的別的點的詳情關掉；手機：mobileStore 的 focusItem、展開，清單捲到它）
// - 行程分頁的其他點＝選中、開詳情（網頁蓋住整個右欄、手機整頁），不改類型和篩選
// - 點空白處（null）：取消選中、收起展開的卡
// 地圖照 selectCamera 動（commands.focus 一個點：能不動就不動）。

import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { DESKTOP_QUERY } from '../hooks.ts';
import { dayPlanOf, planStore } from '../planStore.ts';
import { uiStore } from '../uiStore.ts';
import { focusKeyForPlace, mobileStore } from '../mobile/mobileStore.ts';

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
    if (desktop && s.detailId) {
      s.closeDetail();
      return;
    }
    s.select(null);
    if (desktop) {
      s.openPreview(null);
      uiStore.setState({ expandedItem: null });
    } else {
      const m = mobileStore.getState();
      m.focusItem(null);
      if (m.expanded) m.expandItem(null);
    }
    return;
  }
  s.openPreview(null);
  if (desktop && s.detailId) {
    s.openDetail(id);
    commands.focus(id);
    return;
  }
  if (desktop && (s.mode === 'explore' || s.mode === 'wish')) {
    s.openDetail(id, s.mode, undefined, 'side');
    commands.focus(id);
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
  // 不在這天的點：選中（openDetail 會選）、開詳情；網頁蓋住整個右欄（地圖不被擋）
  s.openDetail(id, desktop ? 'map' : undefined, undefined, 'side');
  if (desktop) commands.focus(id);
}
