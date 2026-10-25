// 手機版聊天的佔位對話（第六輪 §3.6）：AI 分頁和行程頁的半屏聊天共用同一份，只放在記憶體裡（重新整理就回到預設）。
// 預設兩則假訊息，展示樣子：一則是可以左右滑的照片卡（3 家鳥羽的餐廳），一則是對 2/5 的提議（加大阪屋、減漣）。
// 送出只把「我」的訊息加進來，再加一則佔位回覆；詳情的「問 AI」（uiStore.chatDraft 的 seq 變了）也一樣。真的對話是 T16m 的事。
// 提議卡的「🗺 在行程上看」：切到行程分頁、打開半屏聊天，用 commands.showProposal（T12）把提議畫到地圖上。「套用」「不要」先只跳 toast。

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Itinerary, TagId } from '@travel-helper/engine/types';
import { uiStore } from '../uiStore.ts';
import { dataStore } from '../dataStore.ts';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { resizeMap } from '../components/MapView.tsx';
import { mobileStore } from './mobileStore.ts';

/** 提議卡上的一行：＋ 加、－ 減哪個點 */
export interface DemoProposalLine {
  op: 'add' | 'remove';
  placeId: string;
  /** 括號裡的說明（午餐・全員） */
  note?: string;
}

export interface ChatMessage {
  id: number;
  who: 'me' | 'ai';
  text: string;
  /** 照片卡輪播：資料點 ID */
  places?: string[];
  /** 提議卡 */
  proposal?: { date: string; lines: DemoProposalLine[] };
}

export interface ChatDemoState {
  messages: ChatMessage[];
  /** 上下文小標按了 ✕ 拿掉（下一次從詳情問時再出現） */
  contextOff: boolean;
}

/** 提議的那天、加的點、減的點（減的是那天時間軸上的漣） */
export const DEMO_DATE = '2027-02-05';
const DEMO_ADD = 'toba-osakaya';
const DEMO_REMOVE = 'toba-sazanami';
/** 照片卡的 3 家（真的餐廳 ID） */
export const DEMO_PLACES = ['toba-osakaya', 'toba-sazanami', 'toba-kazuei'];
/** 佔位回覆 */
export const PLACEHOLDER_REPLY = '（T16 接上後回答）';
const SUMMARY = '2/5 的午餐換成大阪屋（能預約、坐得下 15 人）';

const DEFAULT_MESSAGES: ChatMessage[] = [
  { id: 1, who: 'ai', text: '（示範）鳥羽附近能坐 15 人、長輩方便的午餐，找到這 3 家：', places: DEMO_PLACES },
  {
    id: 2,
    who: 'ai',
    text: '（示範）要不要把大阪屋排進 2/5 的午餐？',
    proposal: {
      date: DEMO_DATE,
      lines: [
        { op: 'add', placeId: DEMO_ADD, note: '午餐・全員' },
        { op: 'remove', placeId: DEMO_REMOVE },
      ],
    },
  },
];

export const chatDemoStore = createStore<ChatDemoState>()(() => ({ messages: DEFAULT_MESSAGES, contextOff: false }));

let nextId = DEFAULT_MESSAGES.length + 1;

/** 送出：「我」的訊息加進對話，再一則佔位回覆 */
export function sendChat(text: string) {
  const t = text.trim();
  if (!t) return;
  const messages = chatDemoStore.getState().messages;
  chatDemoStore.setState({
    messages: [...messages, { id: nextId++, who: 'me', text: t }, { id: nextId++, who: 'ai', text: PLACEHOLDER_REPLY }],
  });
}

/** 上下文小標的 ✕：有地點時拿掉地點（變成「正在看：這天」），只剩這天時整個拿掉 */
export function clearChatContext() {
  const d = uiStore.getState().chatDraft;
  if (d?.placeId) {
    commands.unselect(d.placeId);
    uiStore.setState({ chatDraft: { ...d, placeId: null } });
  } else chatDemoStore.setState({ contextOff: true });
}

/** 用確定的行程做出示範的提議：2/5 的漣換成大阪屋（午餐・全員）；找不到漣時只加 */
export function buildDemoProposal(current: Itinerary): Itinerary | null {
  const it = structuredClone(current);
  const day = it.days.find((d) => d.date === DEMO_DATE);
  if (!day) return null;
  const add = { id: 'i-ai-demo', type: 'visit' as const, options: [{ place: DEMO_ADD }], selected: 0, tags: ['lunch', 'all'] as TagId[] };
  const at = day.items.findIndex((i) => i.type === 'visit' && i.options[i.selected]?.place === DEMO_REMOVE);
  if (at >= 0) day.items.splice(at, 1, add);
  else day.items.push(add);
  return it;
}

/** 「🗺 在行程上看」：切到行程、半屏聊天，等版面變好（地圖縮到聊天上面）再畫提議、框住提議的點 */
export function viewDemoProposal() {
  mobileStore.getState().openChatSheet();
  requestAnimationFrame(() => {
    resizeMap();
    const current = dataStore.getState().itinerary;
    const proposal = current && buildDemoProposal(current);
    const r = proposal ? commands.showProposal(proposal, { summary: SUMMARY }) : null;
    if (!r?.ok) shared.notifyError(r ? r.error : '還沒有行程，看不了提議');
  });
}

/** 「套用」「不要」：T16m 才接上 */
export const proposalTodo = () => shared.notify('（T16 接上）');

// 詳情的「問 AI」：問的問題變成「我」的訊息，加一則佔位回覆；上下文小標重新出現
let lastSeq = uiStore.getState().chatDraft?.seq ?? 0;
uiStore.subscribe((s) => {
  const d = s.chatDraft;
  if (!d || d.seq === lastSeq) return;
  lastSeq = d.seq;
  chatDemoStore.setState({ contextOff: false });
  sendChat(d.text);
});

export function useChatDemo<T>(selector: (s: ChatDemoState) => T): T {
  return useStore(chatDemoStore, selector);
}
