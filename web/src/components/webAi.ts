// 網頁版和 AI 核心（appAi.ts）之間的接線：切畫面（ScreenSurface）、問 AI 入口、提議出現時右欄切到行程。手機版由 T16m-c 接自己的。

import { appStore } from '../store.ts';
import { ai, resetScreenSurface, setScreenSurface } from '../appAi.ts';
import { openDialog, openMapPanel, uiStore } from '../uiStore.ts';
import type { Filter } from '../lib/filter.ts';
import type { ScreenSurface } from '../ai/stage.ts';
import type { ChatContext } from '../ai/types.ts';

/** 切到行程分頁（關掉詳情） */
const showTrip = () => {
  const s = appStore.getState();
  s.closeDetail();
  s.setMode('map');
};

const showTab = (mode: 'explore' | 'wish') => {
  const s = appStore.getState();
  s.closeDetail();
  s.setMode(mode);
};

const webSurface: ScreenSurface = {
  showList: () => showTab('explore'),
  showTab: (tab) => (tab === 'trip' ? showTrip() : showTab(tab)),
  showPanel: (panel) => (panel === 'snapshots' ? openDialog({ kind: 'snapshots' }) : openMapPanel(panel)),
  showDay: showTrip,
  // 彈窗蓋在地圖右側、貼著右欄，右欄不動（§13.3）
  openPlace: (id) => appStore.getState().openDetail(id, 'map', undefined, 'map'),
  screenKey: () => {
    const s = appStore.getState();
    return [s.mode, s.detailId ?? '', uiStore.getState().mapPanel?.kind ?? ''].join('|');
  },
  screenName: () => {
    const s = appStore.getState();
    return s.detailId ? 'detail' : s.mode === 'map' ? 'trip' : s.mode;
  },
};

/** 網頁版掛上時呼叫一次；回傳的函式收掉 */
export function connectWebAi(): () => void {
  setScreenSurface(webSurface);
  // 提議顯示（新的一版、看這版）：右欄切到行程、看差異。工具呈現時已經確定使用者沒有動過畫面（不搶畫面）
  const offProposal = ai.proposals.store.subscribe((s, prev) => {
    if (!s.active || s.active.cardId === prev.active?.cardId) return;
    uiStore.setState({ proposalView: 'diff' });
    showTrip();
  });
  // 按了「編輯」：回到真的時間軸才改得到
  const offPlanning = appStore.subscribe((s, prev) => {
    if (s.planning && !prev.planning && s.proposal) uiStore.setState({ proposalView: 'original' });
    if (s.proposal && !prev.proposal) uiStore.setState({ proposalView: s.planning ? 'original' : 'diff' });
  });
  return () => {
    offProposal();
    offPlanning();
    // 手機版沒有看原本：轉向過去時地圖的虛線要回來
    uiStore.setState({ proposalView: 'diff' });
    resetScreenSurface();
  };
}

let focusInput: (() => void) | null = null;
/** 聊天欄把「游標移到輸入框」接上來 */
export const registerChatInput = (fn: (() => void) | null) => {
  focusInput = fn;
};

/** 問 AI：帶晶片和建議問題，游標到輸入框，不送出（規格 §6） */
export async function askWeb(contexts: ChatContext[]) {
  await ai.ask(contexts);
  // 對話滿了會開新對話，輸入框這時才畫出來
  requestAnimationFrame(() => focusInput?.());
}

/** 探索、想去、詳情的一個點：有選天就帶 */
export function askPlace(id: string) {
  const { day } = appStore.getState();
  void askWeb([{ kind: 'place', id, ...(day === 'all' ? {} : { date: day }) }]);
}

/** 行程的一張卡 */
export const askTripCard = (id: string, date: string, itemId?: string | null) => void askWeb([{ kind: 'place', id, date, ...(itemId ? { itemId } : {}) }]);

export const askDay = (date: string) => void askWeb([{ kind: 'day', date }]);

export const askTrip = () => void askWeb([{ kind: 'trip' }]);

/** 探索、想去的整份清單 */
export const askList = (source: 'explore' | 'wish', filter: Filter, query: string, count: number) => void askWeb([{ kind: 'list', source, filter, query, count }]);
