// 探索的概覽（T63，interaction-design §28）：每張卡選了哪個子地區、網頁地圖框著哪一張卡。手機、網頁共用一份，不記住（重新打開回到全區）。
// 選子地區只在卡片裡換內容，不進那區；地區列的「概覽」鈕、地圖的「看全部地區」呼叫 reset 全部換回全區。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export interface OverviewFocus {
  area: string;
  /** null＝那區全區 */
  region: string | null;
}

export interface OverviewState {
  /** 地區 → 那張卡選的子地區（沒有或 null＝全區） */
  picks: Record<string, string | null>;
  /** 網頁地圖框著的（最後點的那張卡）；null＝一進概覽時的範圍 */
  focus: OverviewFocus | null;
  /** 點了一張卡的子地區一行（region null＝「志摩全區」）：換那張卡的內容、地圖框到那裡 */
  pick(area: string, region: string | null): void;
  /** 全部換回全區、地圖的框拿掉 */
  reset(): void;
  /** 離開概覽：地圖的框拿掉，卡片選的子地區留著 */
  clearFocus(): void;
}

export const createOverviewStore = () =>
  createStore<OverviewState>()((set) => ({
    picks: {},
    focus: null,
    pick: (area, region) => set((s) => ({ picks: { ...s.picks, [area]: region }, focus: { area, region } })),
    reset: () => set({ picks: {}, focus: null }),
    clearFocus: () => set((s) => (s.focus ? { focus: null } : s)),
  }));

export const overviewStore = createOverviewStore();

/** React 裡讀概覽的狀態 */
export function useOverview<T>(selector: (s: OverviewState) => T): T {
  return useStore(overviewStore, selector);
}
