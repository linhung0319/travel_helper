// 手機版自己的畫面狀態（第六輪 §3、§6）：現在在哪個分頁、行程面板停在哪、行程選到的卡（focusItem）、編輯中打開的「⋯」動作面板（actions）、
// 整頁詳情、聊天面板、整頁的討論／預約、探索的篩選、想去的設定。
// 不放進 store.ts（地圖指令那層）；網頁版用不到。打開整頁（詳情、討論／預約）時推一筆 history，手機的返回鍵（瀏覽器上一頁）就是關掉那一頁；
// 頁面左上角的「‹」（closePlace、setPage(null)）也是把那筆退回去（history.back）。
// history.back() 是非同步的：關掉之後，退回去的 popstate 還沒到之前又開了整頁，要等它到了才推新的那筆（不然 popstate 會把新的關掉）。
// 整頁的東西一次只有一層（§3.0）：開詳情會關掉討論／預約，開討論／預約會關掉詳情；互換時共用同一筆 history，上一頁一次就回到分頁。
// 聊天（§3.6）：行程頁的半屏聊天（chatSheet）只在行程分頁出現，換分頁就收起來。詳情的「問 AI」（uiStore.chatDraft 的 seq 變了）：
// 從行程打開的詳情回到行程、打開半屏聊天，其他地方打開的跳到 AI 分頁；兩種都關掉詳情（只在手機版掛著時：MapView 讓網頁版也載入這個檔）。
// AI 的提議（appStore.proposal）是半屏聊天帶出來的：關掉半屏、離開行程分頁時一起清掉，不會卡在手機的地圖上。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { DayPlan, TimelineEntry } from '@travel-helper/engine';
import type { ActionId, CardActionContext } from '../shared/cardActions.ts';
import type { ActionTarget } from '../components/cardActionRun.ts';
import { uiStore } from '../uiStore.ts';
import { appStore } from '../store.ts';
import { EMPTY_FEED, type ExploreSort, type ExploreType, type Feed } from '../lib/explore.ts';

export type MobileTab = 'explore' | 'wish' | 'trip' | 'ai' | 'me';
export type TripSnap = 'low' | 'mid' | 'high';

/** 動作面板裡的子畫面（list＝動作清單） */
export type ActionView = 'list' | 'tags' | 'move' | 'lodging-plan' | 'stay';

/** 「⋯」打開的動作面板：哪張卡、它的動作（cardActions 的 ctx）、作用在哪、最上面一列的縮圖和名稱、一開始的畫面 */
export interface ActionSheetSpec {
  ctx: CardActionContext;
  target: ActionTarget;
  name: string;
  placeId: string | null;
  /** 不能點的動作（看主卡時的「👑 主要」、看備卡時的「⏱ 改停留時間」） */
  disabled?: ActionId[];
  /** 標籤那一排直接打開標籤子畫面 */
  view?: ActionView;
}

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
  detail: { placeId: string; from: MobileTab } | null;
  /** 行程頁上的半屏聊天（ChatSheet）；只在行程分頁有效，換分頁就變回 false */
  chatSheet: boolean;
  /** 行程頁選到的那張卡（focusKeyOf 的 key；地圖飛過去、清單捲到那張） */
  focused: string | null;
  /** 編輯中「⋯」打開的底部動作面板；null＝關著 */
  actions: ActionSheetSpec | null;
  /** 整頁打開的討論（整趟留言）或預約 */
  page: 'comments' | 'reservations' | null;
  /** 探索的篩選（§3.2）：手機自己一份，不看地圖範圍 */
  feed: Feed;
  /** 想去的設定（§3.4） */
  wish: WishView;
}

export interface MobileActions {
  setTab(tab: MobileTab): void;
  /** 行程面板停在哪 */
  setSnap(snap: TripSnap): void;
  /** 選一張卡（面板到中間，keepSnap 時不動；地圖飛過去、清單捲到那張由 TripPage 做）；null＝取消 */
  focusItem(itemKey: string | null, keepSnap?: boolean): void;
  /** 打開、關掉「⋯」動作面板 */
  openActions(spec: ActionSheetSpec): void;
  closeActions(): void;
  openPlace(placeId: string, from: NonNullable<MobileState['detail']>['from']): void;
  closePlace(): void;
  setPage(page: MobileState['page']): void;
  /** 切到行程分頁、打開半屏聊天 */
  openChatSheet(): void;
  closeChatSheet(): void;
  /** 半屏聊天往上拉：變成全螢幕（AI 分頁，同一份對話） */
  expandChat(): void;
  setFeed(patch: Partial<Feed>): void;
  /** 探索的條件（"欄位:值"）有就拿掉、沒有就加上 */
  toggleFeedQuick(token: string): void;
  setWish(patch: Partial<WishView>): void;
}

export type MobileStore = MobileState & MobileActions;

/** history.state 裡標記「這筆是整頁（詳情、討論／預約）推的」 */
const HISTORY_KEY = 'thMobileDetail';

const hasHistory = () => typeof window !== 'undefined' && typeof window.history !== 'undefined';

/** 關整頁時叫了 history.back()、popstate 還沒到的次數 */
let pendingBacks = 0;
/** 等 popstate 到了才推的那筆（關掉後馬上又開整頁） */
let pushAfterBack = false;

/** 推一筆「整頁」的 history */
function pushLayer() {
  window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: true }, '');
}

/** 整頁開著沒有（詳情或討論／預約） */
const layerOpen = (s: MobileState) => !!s.detail || !!s.page;

/** 要開整頁了（還沒 set）：本來沒有整頁才推一筆；還在等退回去時，先記著，等 popstate 到了再推 */
function beforeOpenLayer(s: MobileState) {
  if (!hasHistory() || layerOpen(s)) return;
  if (pendingBacks > 0) pushAfterBack = true;
  else pushLayer();
}

/** 整頁剛關掉（已經 set）：把推過的那筆退回去（退回去的 popstate 由下面的監聽略過） */
function afterCloseLayer() {
  if (pushAfterBack) {
    // 新開的整頁還沒推 history：不用退
    pushAfterBack = false;
    return;
  }
  if (hasHistory() && window.history.state?.[HISTORY_KEY]) {
    pendingBacks++;
    window.history.back();
  }
}

/** 清掉地圖上 AI 的提議（有才清） */
function clearProposal() {
  if (appStore.getState().proposal) appStore.getState().setProposal(null);
}

/** 手機版（MobileApp）掛著沒有：網頁版也會載入這個檔，問 AI 時不動手機的分頁 */
let mobileActive = false;
/** MobileApp 掛上、卸下時呼叫 */
export function setMobileActive(active: boolean) {
  mobileActive = active;
}

export const mobileStore = createStore<MobileStore>()((set, get) => ({
  // 打開網站先看行程（計畫的決定）
  tab: 'trip',
  tripSnap: 'mid',
  detail: null,
  chatSheet: false,
  focused: null,
  actions: null,
  page: null,
  feed: EMPTY_FEED,
  wish: { type: null, area: null, sort: 'likes', view: 'photo' },
  // 換分頁：整頁的東西、半屏聊天都關掉
  setTab: (tab) => {
    const had = layerOpen(get());
    if (tab !== 'trip') clearProposal();
    set({ tab, detail: null, page: null, actions: null, chatSheet: false });
    if (had) afterCloseLayer();
  },
  setSnap: (tripSnap) => set({ tripSnap }),
  focusItem: (focused, keepSnap = false) => set(focused ? { focused, ...(keepSnap ? {} : { tripSnap: 'mid' as const }) } : { focused: null }),
  openActions: (actions) => set({ actions }),
  closeActions: () => set({ actions: null }),
  openPlace: (placeId, from) => {
    // 已經開著詳情（或討論／預約）時換過去不再推一筆，上一頁直接回到分頁
    beforeOpenLayer(get());
    set({ detail: { placeId, from }, page: null });
  },
  closePlace: () => {
    if (!get().detail) return;
    set({ detail: null });
    afterCloseLayer();
  },
  setPage: (page) => {
    if (page) {
      beforeOpenLayer(get());
      set({ page, detail: null });
      return;
    }
    if (!get().page) return;
    set({ page: null });
    afterCloseLayer();
  },
  openChatSheet: () => {
    get().setTab('trip');
    set({ chatSheet: true });
  },
  closeChatSheet: () => {
    clearProposal();
    set({ chatSheet: false });
  },
  expandChat: () => get().setTab('ai'),
  setFeed: (patch) => set({ feed: { ...get().feed, ...patch } }),
  toggleFeedQuick: (token) => {
    const q = get().feed.quick;
    set({ feed: { ...get().feed, quick: q.includes(token) ? q.filter((t) => t !== token) : [...q, token] } });
  },
  setWish: (patch) => set({ wish: { ...get().wish, ...patch } }),
}));

if (typeof window !== 'undefined') {
  // 手機的返回鍵、瀏覽器上一頁：關掉整頁（詳情、討論／預約）
  window.addEventListener('popstate', () => {
    // 自己關的時候退的：整頁已經關了；退完之後才推新開的那筆
    if (pendingBacks > 0) {
      pendingBacks--;
      if (pendingBacks === 0 && pushAfterBack) {
        pushAfterBack = false;
        if (layerOpen(mobileStore.getState())) pushLayer();
      }
      return;
    }
    if (layerOpen(mobileStore.getState())) mobileStore.setState({ detail: null, page: null });
  });
  // 詳情的「問 AI」：看 chatDraft.seq，從行程問的回到行程開半屏聊天，其他的跳到 AI 分頁（setTab 會關掉詳情）
  let lastSeq = uiStore.getState().chatDraft?.seq ?? 0;
  uiStore.subscribe((s) => {
    const d = s.chatDraft;
    if (!d || d.seq === lastSeq) return;
    lastSeq = d.seq;
    if (!mobileActive) return;
    const m = mobileStore.getState();
    m.closePlace();
    if (d.from === 'trip') m.openChatSheet();
    else m.setTab('ai');
  });
  // Playwright 測試、Claude in Chrome 檢查畫面用
  if (import.meta.env?.DEV) (window as unknown as Record<string, unknown>).__thMobile = mobileStore;
}

/** 時間軸上一張卡的 key（focusItem 用）：項目 ID；出發、回住宿沒有項目 ID，是 start、lodging */
export const focusKeyOf = (e: TimelineEntry): string => e.itemId ?? e.kind;

/** 這天的時間軸裡每一張有地點的卡（分組裡的也算），照時間順序 */
function cardEntries(day: DayPlan | null): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const e of day?.entries ?? []) {
    for (const g of e.groups ?? []) out.push(...g.entries.filter((x) => x.kind !== 'meet'));
    out.push(e);
  }
  return out.filter((e) => e.placeId);
}

/** 用 key 找那張卡；找不到是 null */
export function findFocusEntry(day: DayPlan | null, key: string): TimelineEntry | null {
  return cardEntries(day).find((e) => focusKeyOf(e) === key) ?? null;
}

/** 點了地圖上的某個點：這天時間軸上第一張是這個點的卡的 key；不在這天是 null */
export function focusKeyForPlace(day: DayPlan | null, placeId: string): string | null {
  const e = cardEntries(day).find((x) => x.placeId === placeId);
  return e ? focusKeyOf(e) : null;
}

export function useMobile<T>(selector: (s: MobileStore) => T): T {
  return useStore(mobileStore, selector);
}
