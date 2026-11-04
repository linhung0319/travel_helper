// 想去的顯示設定（手機、網頁共用一份，第七輪最終 review #14）：清單或照片牆（記在 localStorage，讀寫失敗就當沒存過）、
// 現在看的是三排書架還是某一排的全部（T53，不記住）。篩選、搜尋、排序不在這裡：手機在 mobileStore.wish，網頁在 appStore（探索、想去各一份）。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { SectionId } from './wishSections.ts';

export type WishViewMode = 'photo' | 'list';

export interface WishPrefs {
  view: WishViewMode;
  /** 「全部 ›」進了哪一排（還沒排、已是候選、已排）；null＝三排書架。不記住 */
  section: SectionId | null;
  /** 只看自己加的（§17.7）；不記住，下次打開回到全部 */
  userOnly: boolean;
  setUserOnly(on: boolean): void;
  setView(view: WishViewMode): void;
  setSection(section: SectionId | null): void;
}

const VIEW_KEY = 'travel-helper:wishView';

/** 上次的顯示方式；讀不到就是清單（列有誰想去、最新留言，預設用清單） */
function loadView(): WishViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'photo' ? 'photo' : 'list';
  } catch {
    return 'list';
  }
}

/** 存一個設定；私密視窗等存不了：只是下次回到預設 */
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 存不了就算了
  }
}

export const wishPrefs = createStore<WishPrefs>()((set) => ({
  view: loadView(),
  section: null,
  userOnly: false,
  // 換地區、按「自己加」都回到三排書架（地區列的鈕回第一頁，T49）
  setUserOnly: (userOnly) => set({ userOnly, section: null }),
  setView: (view) => {
    set({ view });
    save(VIEW_KEY, view);
  },
  setSection: (section) => set({ section }),
}));

/** React 裡讀想去的顯示設定 */
export function useWishPrefs<T>(selector: (s: WishPrefs) => T): T {
  return useStore(wishPrefs, selector);
}
