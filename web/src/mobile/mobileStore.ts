// 手機版自己的畫面狀態（第六輪 §3、§6）：現在在哪個分頁、行程面板停在哪、整頁詳情、聊天面板、整頁的討論／預約、探索的篩選、想去的設定。
// 不放進 store.ts（地圖指令那層）；網頁版用不到。打開詳情時推一筆 history，手機的返回鍵（瀏覽器上一頁）就是關掉詳情。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { EMPTY_FEED, type ExploreSort, type ExploreType, type Feed } from '../lib/explore.ts';

export type MobileTab = 'explore' | 'wish' | 'trip' | 'ai' | 'me';
export type TripSnap = 'low' | 'mid' | 'high';

/** 想去分頁的設定：哪一類（null＝還沒選，打開時挑有東西的那類）、地區、排序、大圖或清單 */
export interface WishView {
  type: ExploreType | null;
  area: string | null;
  sort: ExploreSort;
  view: 'photo' | 'list';
}

export interface MobileState {
  tab: MobileTab;
  /** 行程頁的時間軸面板停在哪（低：多看地圖；中；高：只看清單） */
  tripSnap: TripSnap;
  /** 整頁詳情：哪個點、從哪個分頁打開（返回時回到那裡） */
  detail: { placeId: string; from: 'explore' | 'wish' | 'trip' | 'ai' } | null;
  /** 行程頁上的聊天面板（T16m 接上） */
  chatSheet: boolean;
  /** 行程頁選到的那張卡（地圖飛過去、清單捲到那張） */
  focusItem: string | null;
  /** 整頁打開的討論（整趟留言）或預約 */
  page: 'comments' | 'reservations' | null;
  /** 探索的篩選（§3.2）：手機自己一份，不看地圖範圍 */
  feed: Feed;
  /** 想去的設定（§3.4） */
  wish: WishView;
}

export interface MobileActions {
  setTab(tab: MobileTab): void;
  openPlace(placeId: string, from: NonNullable<MobileState['detail']>['from']): void;
  closePlace(): void;
  setPage(page: MobileState['page']): void;
  setFeed(patch: Partial<Feed>): void;
  /** 探索的條件（"欄位:值"）有就拿掉、沒有就加上 */
  toggleFeedQuick(token: string): void;
  setWish(patch: Partial<WishView>): void;
}

export type MobileStore = MobileState & MobileActions;

/** history.state 裡標記「這筆是詳情推的」 */
const HISTORY_KEY = 'thMobileDetail';

const hasHistory = () => typeof window !== 'undefined' && typeof window.history !== 'undefined';

export const mobileStore = createStore<MobileStore>()((set, get) => ({
  // 打開網站先看行程（計畫的決定）
  tab: 'trip',
  tripSnap: 'mid',
  detail: null,
  chatSheet: false,
  focusItem: null,
  page: null,
  feed: EMPTY_FEED,
  wish: { type: null, area: null, sort: 'likes', view: 'photo' },
  // 換分頁：整頁的東西都關掉
  setTab: (tab) => {
    if (get().detail) get().closePlace();
    set({ tab, page: null });
  },
  openPlace: (placeId, from) => {
    // 已經開著詳情時換點不再推一筆，上一頁直接回到分頁
    if (hasHistory() && !get().detail) window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: true }, '');
    set({ detail: { placeId, from } });
  },
  closePlace: () => {
    if (!get().detail) return;
    set({ detail: null });
    // 推過的那筆退回去（popstate 再關一次也沒關係）
    if (hasHistory() && window.history.state?.[HISTORY_KEY]) window.history.back();
  },
  setPage: (page) => set({ page }),
  setFeed: (patch) => set({ feed: { ...get().feed, ...patch } }),
  toggleFeedQuick: (token) => {
    const q = get().feed.quick;
    set({ feed: { ...get().feed, quick: q.includes(token) ? q.filter((t) => t !== token) : [...q, token] } });
  },
  setWish: (patch) => set({ wish: { ...get().wish, ...patch } }),
}));

if (typeof window !== 'undefined') {
  // 手機的返回鍵、瀏覽器上一頁：關掉詳情
  window.addEventListener('popstate', () => {
    if (mobileStore.getState().detail) mobileStore.setState({ detail: null });
  });
  // Playwright 測試、Claude in Chrome 檢查畫面用
  if (import.meta.env?.DEV) (window as unknown as Record<string, unknown>).__thMobile = mobileStore;
}

export function useMobile<T>(selector: (s: MobileStore) => T): T {
  return useStore(mobileStore, selector);
}
