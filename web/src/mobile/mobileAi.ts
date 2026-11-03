// 手機版和 AI 核心（appAi.ts）之間的接線（interaction-design §16.2）：切畫面（ScreenSurface）、問 AI 入口、從聊天跳到地圖／探索／行程再回來、點地點。網頁版在 components/webAi.ts。

import { useApp, useData } from '../hooks.ts';
import { ai, resetScreenSurface, setScreenSurface, watchProposalView } from '../appAi.ts';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { openDialog, openDiscussion, uiStore } from '../uiStore.ts';
import { EMPTY_FILTER, type Filter } from '../lib/filter.ts';
import { feedFilter, filterToFeed, wishFilter } from '../lib/explore.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { listScreenLabel } from '../lib/shelves.ts';
import { displayName } from '../data/normalize.ts';
import { resizeMap } from '../components/mapRuntime.ts';
import type { ScreenSurface } from '../ai/stage.ts';
import type { ChatContext } from '../ai/types.ts';
import { emptyDayFollowups, LODGING_FOLLOWUPS, WISH_EMPTY_LEAD, type Starter } from '../ai/prompts.ts';
import type { GuideAsk } from '../lib/tripStart.ts';
import { mobileStore, useMobile, type MobileTab } from './mobileStore.ts';

/** 「正在看」是哪一頁：在 AI、我分頁時是切過來之前那一頁 */
const contentTab = (): 'trip' | 'explore' | 'wish' => {
  const { tab, lastTab } = mobileStore.getState();
  return tab === 'trip' || tab === 'explore' || tab === 'wish' ? tab : lastTab;
};

/** 地圖要等版面變好才框得準（藏著的時候大小是舊的） */
const afterLayout = (fn: () => void) =>
  requestAnimationFrame(() => {
    resizeMap();
    fn();
  });

/** 提議的天（採用時用：adopt 清掉提議之前記下來） */
let lastDates: string[] = [];

const surface: ScreenSurface = {
  // 結果就在訊息的輪播裡，不用切
  showList: () => {},
  showTab: (tab) => mobileStore.getState().setTab(tab),
  showPanel: (panel) => (panel === 'snapshots' ? openDialog({ kind: 'snapshots' }) : panel === 'comments' ? openDiscussion() : mobileStore.getState().setPage(panel)),
  // 在 AI 分頁：切到行程、開半屏，回覆才不會不見
  showDay: () => {
    const m = mobileStore.getState();
    if (m.tab === 'ai') m.openChatSheet();
    else if (m.tab !== 'trip') m.setTab('trip');
    afterLayout(() => {});
  },
  openPlace: (id) => mobileStore.getState().openPlace(id, mobileStore.getState().tab),
  screenKey: () => {
    const m = mobileStore.getState();
    return [m.tab, m.detail?.placeId ?? '', m.page ?? '', uiStore.getState().discussion ? 'comments' : ''].join('|');
  },
  screenName: () => (mobileStore.getState().detail ? 'detail' : contentTab()),
  // AI 給的是 patch：疊在手機自己的篩選上
  filterApplied: (patch, clear) => {
    const m = mobileStore.getState();
    const next: Filter = { ...(clear ? EMPTY_FILTER : feedFilter(m.feed)), ...patch };
    m.setFeed({ ...filterToFeed(next), ...(clear ? { query: '' } : {}) });
  },
  screenFilter: () => {
    const m = mobileStore.getState();
    const tab = contentTab();
    if (tab === 'explore') return feedFilter(m.feed);
    if (tab === 'wish') return wishFilter(m.wish.type, m.wish.area, m.wish.quick);
    return null;
  },
  // 採用後：到行程頁的那一天，收起聊天，留在編輯中（§16.2）
  afterAdopt: () => {
    const { day } = appStore.getState();
    if (lastDates.length && !lastDates.includes(day)) commands.selectDay(lastDates[0]);
    const m = mobileStore.getState();
    m.setTab('trip');
    mobileStore.setState({ fromChat: true });
    afterLayout(() => {
      const d = appStore.getState().day;
      if (d !== 'all') commands.focus({ day: d });
    });
  },
  proposalStale: () => {
    const m = mobileStore.getState();
    // 在聊天裡會看到卡片標過期；在行程頁看著差異時，提議列突然不見要說一聲
    if (m.tab !== 'ai' && !m.chatSheet) shared.notify('行程變了，這個提議過期了，到 AI 看');
  },
};

/** 手機版掛上時呼叫一次；回傳的函式收掉 */
export function connectMobileAi(): () => void {
  setScreenSurface(surface);
  const offView = watchProposalView();
  const offDates = appStore.subscribe((s) => {
    if (s.proposal) lastDates = s.proposal.dates;
  });
  // 回覆在別的畫面時回好了：「AI」分頁上一個小點
  const offUnread = ai.store.subscribe((s, prev) => {
    if (prev.status === 'idle' || s.status !== 'idle') return;
    const m = mobileStore.getState();
    if (m.tab !== 'ai' && !(m.tab === 'trip' && m.chatSheet)) mobileStore.setState({ chatUnread: true });
  });
  return () => {
    offView();
    offDates();
    offUnread();
    resetScreenSurface();
  };
}

/** 問 AI：只帶晶片和建議問題，不叫鍵盤、不送出（§16.2）。從行程問的開半屏，其他的到 AI 分頁 */
async function ask(contexts: ChatContext[], from: 'trip' | 'other', lead?: Starter | null, followups?: string[]) {
  await ai.ask(contexts, lead, followups);
  const m = mobileStore.getState();
  m.closePlace();
  if (from === 'trip') m.openChatSheet();
  else m.setTab('ai');
}

const dayOf = () => {
  const { day } = appStore.getState();
  return day === 'all' ? {} : { date: day };
};

/** 詳情 */
export const askFromDetail = (id: string, from: MobileTab) => void ask([{ kind: 'place', id, ...dayOf() }], from === 'trip' ? 'trip' : 'other');

/** 行程的一張卡；itemKey 是項目 ID、start、lodging 或候選 cand:ID */
export function askCard(id: string, itemKey: string) {
  const { day } = appStore.getState();
  const itemId = /^(start|lodging|cand:)/.test(itemKey) ? undefined : itemKey;
  void ask([{ kind: 'place', id, ...(day === 'all' ? {} : { date: day }), ...(itemId ? { itemId } : {}) }], 'trip');
}

export const askDay = (date: string) => void ask([{ kind: 'day', date }], 'trip');
export const askTrip = () => void ask([{ kind: 'trip' }], 'trip');
/** 引導彈窗的「問 AI」：問那一步的事，不帶晶片（§17.1）。③ 選住宿；④ 第一個還沒排的天 */
export function askStart(step: GuideAsk) {
  const date = step === 'day' ? ai.firstEmptyDate() : null;
  if (date) askEmptyDay(date);
  else void ask([], 'trip', ai.lodgingStarter(), LODGING_FOLLOWUPS);
}
/** 空的一天的「問 AI」（§17.4） */
export const askEmptyDay = (date: string) => void ask([], 'trip', ai.dayStarter(date), emptyDayFollowups(date));
/** 想去頁空白時的「問 AI 推薦」（§17.4） */
export const askWishEmpty = () => void ask([], 'other', WISH_EMPTY_LEAD);
export const askList = (source: 'explore' | 'wish', filter: Filter, query: string, count: number) => void ask([{ kind: 'list', source, filter, query, count }], 'other');

// ---------- 從聊天跳走再回來 ----------

/** 回到聊天時要捲到哪一張卡 */
let anchor: string | null = null;
/** 上次離開聊天時的捲動位置（null：在最下面） */
let saved: { conversation: string | null; top: number } | null = null;

export function saveChatScroll(top: number, atEnd: boolean) {
  saved = atEnd ? null : { conversation: ai.store.getState().currentId, top };
}

/** 打開聊天時捲到哪裡：剛剛按的那張卡，或上次看到的位置；回傳 true 表示捲過了 */
export function restoreChatScroll(scroller: HTMLElement): boolean {
  const card = anchor;
  anchor = null;
  const el = card ? scroller.querySelector<HTMLElement>(`[data-card="${CSS.escape(card)}"]`) : null;
  if (el) {
    const box = scroller.getBoundingClientRect();
    scroller.scrollTop += el.getBoundingClientRect().top - box.top - 8;
    return true;
  }
  if (saved && saved.conversation === ai.store.getState().currentId) {
    scroller.scrollTop = saved.top;
    return true;
  }
  return false;
}

const fail = (r: { ok: true } | { ok: false; error: string }) => {
  if (r.ok) return false;
  shared.notifyError(r.error);
  return true;
};

/** 「在地圖上看」：到行程、開半屏（已經在半屏就只是呈現）；同「再看一次」 */
export function seeOnMap(cardId: string) {
  const m = mobileStore.getState();
  if (m.tab === 'trip' && m.chatSheet) {
    if (m.chatFull) m.setChatFull(false);
    fail(ai.present(cardId));
    return;
  }
  anchor = cardId;
  m.openChatSheet();
  afterLayout(() => fail(ai.present(cardId)));
}

/** 「在行程上看」：收起聊天，面板顯示提議列和差異；用最新的行程重新檢查（規格 §3.3） */
export function seeOnTrip(cardId: string) {
  if (fail(ai.present(cardId))) return;
  anchor = cardId;
  uiStore.setState((s) => ({ proposalView: 'diff', proposalReveal: s.proposalReveal + 1 }));
  mobileStore.getState().setTab('trip');
  mobileStore.setState({ fromChat: true });
  afterLayout(() => fail(ai.present(cardId)));
}

/** 「在探索看」：手動接手（§3.1） */
export function seeInExplore(cardId: string) {
  if (fail(ai.present(cardId))) return;
  anchor = cardId;
  mobileStore.getState().setTab('explore');
  mobileStore.setState({ fromChat: true });
}

/** 「看探索」：AI 套了篩選（set_filter） */
export function seeFilter(cardId: string) {
  seeInExplore(cardId);
}

/** 點地點（訊息裡的標籤、輪播的卡）：地圖看得到（半屏）時第一下指給你看、第二下開詳情；看不到就直接開詳情 */
export function tapPlace(id: string) {
  const m = mobileStore.getState();
  const mapShown = m.tab === 'trip' && m.chatSheet && !m.chatFull;
  if (!mapShown || appStore.getState().selectedId === id) {
    m.openPlace(id, m.tab);
    return;
  }
  appStore.getState().select(id);
  commands.focus(id);
}

/** 「正在看：」後面的字 */
export function useScreenLabel(): string {
  const tab = useMobile((s) => s.tab);
  const lastTab = useMobile((s) => s.lastTab);
  const day = useApp((s) => s.day);
  const selected = useApp((s) => s.selectedId);
  const place = useData((s) => (selected ? s.byId.get(selected) : undefined));
  const where = tab === 'trip' || tab === 'explore' || tab === 'wish' ? tab : lastTab;
  // 探索、想去寫目前地區（T42）：兩邊共用一份，用探索的就好
  const area = useMobile((s) => s.feed.area);
  const areaName = useData((s) => {
    const a = area ? s.areas.find((x) => x.id === area) : undefined;
    return a ? displayName(a.name, a.id) : null;
  });
  if (where === 'explore' || where === 'wish') return listScreenLabel(where, areaName);
  if (tab === 'trip' && place) return place.name.zh || place.name.ja;
  return day === 'all' ? '整趟' : shortDayLabel(day);
}
