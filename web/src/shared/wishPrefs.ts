// 想去的顯示設定（手機、網頁共用一份，第七輪最終 review #14）：清單或照片牆、三段（還沒排、已是候選、已排）哪幾段收起來。
// 都記在 localStorage（讀寫失敗就當沒存過）。篩選、搜尋、排序不在這裡：手機在 mobileStore.wish，網頁在 appStore（探索、想去各一份）。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { SectionId } from './wishSections.ts';

export type WishViewMode = 'photo' | 'list';

export interface WishPrefs {
  view: WishViewMode;
  collapsed: Record<SectionId, boolean>;
  setView(view: WishViewMode): void;
  setCollapsed(id: SectionId, on: boolean): void;
}

const VIEW_KEY = 'travel-helper:wishView';
const COLLAPSED_KEY = 'th.wishCollapsed';

/** 上次的顯示方式；讀不到就是清單（三段的列有誰想去、最新留言，預設用清單） */
function loadView(): WishViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'photo' ? 'photo' : 'list';
  } catch {
    return 'list';
  }
}

/** 三段的收合狀態；沒存過或讀不到：只有「已排」收起來 */
function loadCollapsed(): Record<SectionId, boolean> {
  const base: Record<SectionId, boolean> = { unscheduled: false, candidate: false, scheduled: true };
  try {
    const o = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? 'null') as Partial<Record<SectionId, unknown>> | null;
    if (o) for (const k of Object.keys(base) as SectionId[]) if (typeof o[k] === 'boolean') base[k] = o[k] as boolean;
  } catch {
    // 讀不到：用預設
  }
  return base;
}

/** 存一個設定；私密視窗等存不了：只是下次回到預設 */
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 存不了就算了
  }
}

export const wishPrefs = createStore<WishPrefs>()((set, get) => ({
  view: loadView(),
  collapsed: loadCollapsed(),
  setView: (view) => {
    set({ view });
    save(VIEW_KEY, view);
  },
  setCollapsed: (id, on) => {
    const collapsed = { ...get().collapsed, [id]: on };
    set({ collapsed });
    save(COLLAPSED_KEY, JSON.stringify(collapsed));
  },
}));

/** React 裡讀想去的顯示設定 */
export function useWishPrefs<T>(selector: (s: WishPrefs) => T): T {
  return useStore(wishPrefs, selector);
}
