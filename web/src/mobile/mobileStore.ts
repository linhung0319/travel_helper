// 手機版自己的畫面狀態（第六輪 §3、§6）：現在在哪個分頁、行程面板停在哪、行程選到的卡（focusItem，不改面板高度）、原地展開的卡（expanded、expandItem）、編輯中打開的「⋯」動作面板（actions）、
// 整頁詳情、聊天（半屏、拉滿、清單或加地點面板、從聊天跳來的、回覆好了的小點）、整頁的預約、探索的篩選與顯示方式（feed.view 記在 localStorage）、想去的篩選、搜尋、排序（清單／照片牆、三段收合在 shared/wishPrefs.ts，網頁也用）。
// 不放進 store.ts（地圖指令那層）；網頁版用不到。
// 返回鍵（interaction-design §16.2）：每一層（整頁、加地點、討論彈窗、半屏、對話清單或加地點面板、從聊天跳走）都佔一筆 history，syncHistory 照畫面狀態對齊筆數；手機的返回鍵一次關最上面一層。LINE 裡沒有 history 就離開網站了。
// 整頁的東西一次只有一層（§3.0）：開詳情會關掉預約，開預約會關掉詳情；互換時共用同一筆 history。
// 聊天：半屏只在行程分頁出現，換分頁就收起來；關掉半屏、換分頁都不清提議和結果集（規格 §3.4）。結果集出現時探索的篩選收起來，清掉時還原（§3.1）。
// 班次表（uiStore.timetable，T29c §8.8）浮在地圖那塊：行程拉到最高時打開，行程降到中間讓出地圖（snapForTimetable）；關掉不拉回去。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { DayPlan, TimelineEntry } from '@travel-helper/engine';
import type { ActionId, CardActionContext } from '../shared/cardActions.ts';
import type { ActionTarget } from '../components/cardActionRun.ts';
import { uiStore } from '../uiStore.ts';
import { appStore } from '../store.ts';
import type { DetailTabId } from '../store.ts';
import { EMPTY_FEED, type ExploreSort, type ExploreType, type Feed } from '../lib/explore.ts';

export type MobileTab = 'explore' | 'wish' | 'trip' | 'ai' | 'me';
export type TripSnap = 'low' | 'mid' | 'high';

/** 打開班次表時行程面板停在哪：最高（地圖只露一條）降到中間，讓出地圖給班次表；低、中不動 */
export function snapForTimetable(snap: TripSnap): TripSnap {
  return snap === 'high' ? 'mid' : snap;
}

/** 動作面板裡的子畫面（list＝動作清單） */
export type ActionView = 'list' | 'tags' | 'move' | 'lodging-plan' | 'stay' | 'reorder';

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

/** 想去分頁的設定：哪一類（null＝還沒選，打開時挑有東西的那類）、地區、面板選的條件（quick，寫法同 Feed.quick）、搜尋、排序。清單或照片牆、三段的收合在 shared/wishPrefs.ts（網頁版也用） */
export interface WishView {
  type: ExploreType | 'all';
  area: string | null;
  quick: string[];
  query: string;
  sort: ExploreSort;
}

export interface MobileState {
  tab: MobileTab;
  /** 行程頁的時間軸面板停在哪（低：多看地圖；中；高：只看清單） */
  tripSnap: TripSnap;
  /** 整頁詳情：哪個點、從哪個分頁打開（返回時回到那裡） */
  detail: { placeId: string; from: MobileTab; /** 一打開就選哪個分頁（想去列點最新留言：comments） */ tab?: DetailTabId } | null;
  /** 行程頁上的半屏聊天（ChatSheet）；只在行程分頁有效，換分頁就變回 false */
  chatSheet: boolean;
  /** 半屏拉滿（不切分頁，編輯中也一樣） */
  chatFull: boolean;
  /** 聊天裡蓋著的東西：對話清單、加地點面板 */
  chatOverlay: 'list' | 'picker' | null;
  /** 這一頁是從聊天跳過來的（在地圖上看、在探索看、在行程上看、採用）：要有「‹ 回 AI」，返回鍵也回聊天 */
  fromChat: boolean;
  /** 回覆在別的畫面時回好了：「AI」分頁上一個小點 */
  chatUnread: boolean;
  /** 最後看的內容分頁：在 AI、我分頁時，「正在看」指的是它 */
  lastTab: 'trip' | 'explore' | 'wish';
  /** 行程頁選到的那張卡（focusKeyOf 的 key；地圖飛過去、清單捲到那張） */
  focused: string | null;
  /** 原地展開的那張卡（同一個 key；一次只展開一張） */
  expanded: string | null;
  /** 編輯中「⋯」打開的底部動作面板；null＝關著 */
  actions: ActionSheetSpec | null;
  /** 整頁打開的預約（討論是彈窗，uiStore.discussion） */
  page: 'reservations' | null;
  /** 探索的篩選（§3.2）：手機自己一份，不看地圖範圍 */
  feed: Feed;
  /** 想去的設定（§3.4） */
  wish: WishView;
}

export interface MobileActions {
  setTab(tab: MobileTab): void;
  /** 行程面板停在哪 */
  setSnap(snap: TripSnap): void;
  /** 選一張卡（不改面板高度；地圖飛過去、清單捲到那張由 TripPage 做）；null＝取消 */
  focusItem(itemKey: string | null): void;
  /** 展開那張卡（點同一張收起、點別張換過去；null＝收起） */
  expandItem(itemKey: string | null): void;
  /** 打開、關掉「⋯」動作面板 */
  openActions(spec: ActionSheetSpec): void;
  closeActions(): void;
  openPlace(placeId: string, from: NonNullable<MobileState['detail']>['from'], tab?: DetailTabId): void;
  closePlace(): void;
  setPage(page: MobileState['page']): void;
  /** 切到行程分頁、打開半屏聊天 */
  openChatSheet(): void;
  closeChatSheet(): void;
  /** 半屏拉滿、收回 */
  setChatFull(full: boolean): void;
  setChatOverlay(overlay: MobileState['chatOverlay']): void;
  /** 回聊天：行程頁開半屏（地圖還看得到），其他的回 AI 分頁 */
  returnToChat(): void;
  setFeed(patch: Partial<Feed>): void;
  /** 探索的條件（"欄位:值"）有就拿掉、沒有就加上 */
  toggleFeedQuick(token: string): void;
  toggleWishQuick(token: string): void;
  setWish(patch: Partial<WishView>): void;
}

export type MobileStore = MobileState & MobileActions;

/** history.state 裡標記「這筆是我們推的」 */
const HISTORY_KEY = 'thMobileDetail';

const hasHistory = () => typeof window !== 'undefined' && typeof window.history !== 'undefined';

/** 手機版（MobileApp）掛著沒有：聊天的幾層只有手機版才算 */
let mobileActive = false;

/**
 * 加地點的整頁（AddPlacePage，T31）也是一層 history，返回鍵先關它（詳情還在底下）。
 * addPlaceStore 牽著整個網站的資料層（Node 的測試載不了），所以由 AddPlacePage 載入時把它的開關接進來。
 */
let addLayer: { isOpen(): boolean; cancel(): void } | null = null;
export function bindAddLayer(layer: NonNullable<typeof addLayer>, subscribe: (onChange: (open: boolean) => void) => void) {
  addLayer = layer;
  subscribe(() => syncHistory());
}

/** 現在開著幾層 */
function layersOpen(s: MobileState): number {
  let n = (s.detail || s.page ? 1 : 0) + (addLayer?.isOpen() ? 1 : 0);
  if (mobileActive) n += (uiStore.getState().discussion ? 1 : 0) + (s.chatSheet && s.tab === 'trip' ? 1 : 0) + (s.chatOverlay ? 1 : 0) + (s.fromChat ? 1 : 0);
  return n;
}

/** 推過、還沒退掉的筆數 */
let pushed = 0;
/** 叫了 history.go、popstate 還沒到（非同步）：到了才接著對齊 */
let goingBack = false;

/** 讓 history 的筆數和開著的層數一樣 */
function syncHistory() {
  if (!hasHistory() || goingBack) return;
  const want = layersOpen(mobileStore.getState());
  if (want > pushed) {
    for (; pushed < want; pushed++) window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: true }, '');
  } else if (want < pushed) {
    const n = pushed - want;
    pushed = want;
    goingBack = true;
    if (n === 1) window.history.back();
    else window.history.go(-n);
  }
}

/** 返回鍵：關最上面一層 */
function closeTopLayer() {
  const m = mobileStore.getState();
  if (mobileActive && addLayer?.isOpen()) addLayer.cancel();
  else if (mobileActive && uiStore.getState().discussion) uiStore.setState({ discussion: null });
  else if (m.detail || m.page) mobileStore.setState({ detail: null, page: null });
  else if (!mobileActive) return;
  else if (m.chatOverlay) m.setChatOverlay(null);
  else if (m.chatSheet && m.tab === 'trip') m.closeChatSheet();
  else if (m.fromChat) m.returnToChat();
}

/** MobileApp 掛上、卸下時呼叫 */
export function setMobileActive(active: boolean) {
  mobileActive = active;
  syncHistory();
}

const FEED_VIEW_KEY = 'travel-helper:feedView';

/** 探索上次的顯示方式（照片牆或清單）；讀不到就是照片牆 */
function loadFeedView(): Feed['view'] {
  try {
    return localStorage.getItem(FEED_VIEW_KEY) === 'list' ? 'list' : 'photo';
  } catch {
    return 'photo';
  }
}

function saveFeedView(v: Feed['view']) {
  try {
    localStorage.setItem(FEED_VIEW_KEY, v);
  } catch {
    // 私密視窗等存不了：只是下次回到預設
  }
}

export const mobileStore = createStore<MobileStore>()((set, get) => ({
  // 打開網站先看行程（計畫的決定）
  tab: 'trip',
  tripSnap: 'mid',
  detail: null,
  chatSheet: false,
  chatFull: false,
  chatOverlay: null,
  fromChat: false,
  chatUnread: false,
  lastTab: 'trip',
  focused: null,
  expanded: null,
  actions: null,
  page: null,
  feed: { ...EMPTY_FEED, view: loadFeedView() },
  wish: { type: 'all', area: null, quick: [], query: '', sort: 'likes' },
  // 換分頁：整頁的東西、半屏聊天都關掉；提議、結果集留著（規格 §3.4）
  setTab: (tab) => {
    // 換分頁取消選中（第七輪 §8.3）
    if (tab !== get().tab) appStore.getState().select(null);
    const content = tab === 'trip' || tab === 'explore' || tab === 'wish';
    // 換到別的分頁才收起展開的卡（半屏聊天開著時 setTab('trip') 是同一個分頁，卡片留著）
    set({ tab, detail: null, page: null, actions: null, chatSheet: false, chatFull: false, chatOverlay: null, fromChat: false, ...(content ? { lastTab: tab } : {}), ...(tab === 'ai' ? { chatUnread: false } : {}), ...(tab === get().tab ? {} : { expanded: null }) });
  },
  setSnap: (tripSnap) => set({ tripSnap }),
  focusItem: (focused) => set({ focused }),
  expandItem: (key) => set({ expanded: key && key !== get().expanded ? key : null }),
  openActions: (actions) => set({ actions }),
  closeActions: () => set({ actions: null }),
  openPlace: (placeId, from, tab) => set({ detail: tab ? { placeId, from, tab } : { placeId, from }, page: null }),
  closePlace: () => {
    if (get().detail) set({ detail: null });
  },
  setPage: (page) => {
    if (page) set({ page, detail: null });
    else if (get().page) set({ page: null });
  },
  openChatSheet: () => {
    get().setTab('trip');
    set({ chatSheet: true, chatUnread: false });
  },
  closeChatSheet: () => set({ chatSheet: false, chatFull: false, chatOverlay: null }),
  setChatFull: (chatFull) => set({ chatFull }),
  setChatOverlay: (chatOverlay) => set({ chatOverlay }),
  returnToChat: () => {
    if (get().tab === 'trip') get().openChatSheet();
    else get().setTab('ai');
  },
  setFeed: (patch) => {
    if (patch.view) saveFeedView(patch.view);
    set({ feed: { ...get().feed, ...patch } });
  },
  toggleFeedQuick: (token) => {
    const q = get().feed.quick;
    set({ feed: { ...get().feed, quick: q.includes(token) ? q.filter((t) => t !== token) : [...q, token] } });
  },
  toggleWishQuick: (token) => {
    const q = get().wish.quick;
    set({ wish: { ...get().wish, quick: q.includes(token) ? q.filter((t) => t !== token) : [...q, token] } });
  },
  setWish: (patch) => set({ wish: { ...get().wish, ...patch } }),
}));

// 換天：取消選到的卡、收起展開的卡（同步做，「在地圖上看」換天後馬上選卡才不會被清掉）
let lastDay = appStore.getState().day;
appStore.subscribe((s) => {
  if (s.day === lastDay) return;
  lastDay = s.day;
  const m = mobileStore.getState();
  if (m.focused || m.expanded) mobileStore.setState({ focused: null, expanded: null });
});

// 結果集出現：探索的篩選、搜尋收起來（否則取交集可能一個都不剩）；清掉時還原（規格 §3.1）。手機的探索有自己的 feed，appStore 的 stash 管不到
let feedStash: Pick<Feed, 'type' | 'area' | 'quick' | 'query'> | null = null;
appStore.subscribe((s, prev) => {
  if (s.aiResult && !prev.aiResult) {
    const { type, area, quick, query } = mobileStore.getState().feed;
    feedStash = { type, area, quick, query };
    mobileStore.setState((m) => ({ feed: { ...m.feed, type: 'all', area: null, quick: [], query: '' } }));
  } else if (!s.aiResult && prev.aiResult && feedStash) {
    const restored = feedStash;
    feedStash = null;
    mobileStore.setState((m) => ({ feed: { ...m.feed, ...restored } }));
  }
});

mobileStore.subscribe(() => syncHistory());
uiStore.subscribe(() => syncHistory());

if (typeof window !== 'undefined') {
  // 手機的返回鍵、瀏覽器上一頁：關最上面一層；自己退的（畫面已經關了）只要接著對齊
  window.addEventListener('popstate', () => {
    if (goingBack) {
      goingBack = false;
      syncHistory();
      return;
    }
    pushed = Math.max(0, pushed - 1);
    closeTopLayer();
    syncHistory();
  });
  // 打開（或換一程）班次表：行程在最高時降到中間；關掉不動
  let lastTimetable = uiStore.getState().timetable;
  uiStore.subscribe((s) => {
    if (s.timetable === lastTimetable) return;
    lastTimetable = s.timetable;
    if (!s.timetable || !mobileActive) return;
    const m = mobileStore.getState();
    const snap = snapForTimetable(m.tripSnap);
    if (snap !== m.tripSnap) m.setSnap(snap);
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
