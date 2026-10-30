// 對話框（T15m）：進入編輯的確認、快照、排進行程、移到別天（卡片、自己加的候選）、修改紀錄、拿掉別人加的候選、刪除自己加的點；展開中的交通卡、地圖那側的班次表。
// 一次只開一個；從哪裡打開都走這裡（詳情面板、時間軸、編輯藍條），App 底下的 <Dialogs /> 負責畫。

import { createStore } from 'zustand/vanilla';
import { appStore } from './store.ts';

export type DialogState =
  | { kind: 'planning' }
  | { kind: 'snapshots' }
  | { kind: 'add'; placeId: string; day?: string }
  | { kind: 'move'; itemId: string }
  | { kind: 'move-candidate'; candidateId: number }
  | { kind: 'reject'; candidateId: number }
  | { kind: 'history'; placeId: string; field?: string }
  | { kind: 'delete-user-place'; placeId: string };

/** 地圖區的視窗（日期列的 💬、📋）：留言或預約筆記；scope 是這天或整趟 */
export interface MapPanelState {
  kind: 'comments' | 'reservations';
  scope: 'day' | 'trip';
  /** 從時間軸的預約 tag 進來：捲到那一列 */
  focus?: { date: string; placeId: string };
}

/** 班次表開在哪一程 */
export interface TimetableState {
  date: string;
  legKey: string;
  rideIndex: number;
}

export interface UiState {
  dialog: DialogState | null;
  mapPanel: MapPanelState | null;
  /** 編輯閒置多久自動結束編輯（分鐘）；dev 選單可以改短 */
  idleMinutes: number;
  /** 展開中的交通細列（日期:項目 ID 或 lodging）；一次只展開一段 */
  legOpen: string | null;
  /** 正在編輯的交通（和 legOpen 同格式的 key）；只有按「改」才有值，一次一段 */
  legEdit: string | null;
  /** 網頁版時間軸原地展開的那張卡（項目 ID；出發、回住宿是 start、lodging）；一次一張，手機版用 mobileStore.expanded */
  expandedItem: string | null;
  /** 地圖那側的班次表（第五輪 §4）：哪天、哪段交通（legKey 和交通卡的 key 同格式）、第幾程 */
  timetable: TimetableState | null;
  /** 詳情「問 AI」帶進聊天的草稿（第六輪） */
  chatDraft: ChatDraft | null;
}

export const uiStore = createStore<UiState>()(() => ({ dialog: null, mapPanel: null, idleMinutes: 10, legOpen: null, legEdit: null, expandedItem: null, timetable: null, chatDraft: null }));

// 換天、離開行程分頁：展開的卡收起來。看 store 不看 DayPanel 卸載：轉向回網頁版時（和 dev 的 StrictMode 重跑 effect）才不會把剛帶過來的展開清掉
let lastView = { day: appStore.getState().day, mode: appStore.getState().mode };
appStore.subscribe((s) => {
  if (s.day === lastView.day && s.mode === lastView.mode) return;
  const left = s.day !== lastView.day || s.mode !== 'map';
  lastView = { day: s.day, mode: s.mode };
  if (left && uiStore.getState().expandedItem) uiStore.setState({ expandedItem: null });
});

/** 點時間軸的卡：展開那張，點同一張收起（網頁版） */
export const toggleExpandedItem = (key: string) => uiStore.setState((s) => ({ expandedItem: s.expandedItem === key ? null : key }));

export const openDialog = (dialog: DialogState) => uiStore.setState({ dialog });
export const closeDialog = () => uiStore.setState({ dialog: null });

/** 打開地圖那側的班次表（交通卡步驟裡搭車那一行的「› 班次」）；和討論、預約的視窗同一個位置，一次開一個 */
export const openTimetable = (timetable: TimetableState) => uiStore.setState({ timetable, mapPanel: null });
export const closeTimetable = () => uiStore.setState({ timetable: null });


/** 打開地圖區的視窗；範圍照目前選的天（選「全部」或 focus 的那列不在這天時是整趟） */
export const openMapPanel = (kind: MapPanelState['kind'], opts?: { focus: { date: string; placeId: string } }) => {
  const day = appStore.getState().day;
  const scope = day === 'all' || (opts && opts.focus.date !== day) ? 'trip' : 'day';
  uiStore.setState({ mapPanel: { kind, scope, ...(opts ? { focus: opts.focus } : {}) }, timetable: null });
};
export const closeMapPanel = () => uiStore.setState({ mapPanel: null });
/** 視窗裡切換「這天／整趟」 */
export const setMapPanelScope = (scope: MapPanelState['scope']) => uiStore.setState((s) => (s.mapPanel ? { mapPanel: { ...s.mapPanel, scope } } : s));

/** 從詳情「問 AI」帶進聊天的一句話；seq 每次加 1，手機的 store 看 seq 變了就切到聊天 */
export interface ChatDraft {
  seq: number;
  text: string;
  placeId: string | null;
  /** 問的當下選的那天；選「全部」是 null */
  date: string | null;
  /** 詳情是從行程打開的（trip）還是別處（other） */
  from: 'trip' | 'other';
}

/**
 * 把地點放進選取的做法：askAi.ts 載入時換成 askAi（會檢查資料點、提示「已帶進聊天」）。
 * 這裡不直接 import，因為 askAi.ts 連到 appCommands（Vite 專用），單元測試在 node 底下載不起來。
 */
let addToChat: (id: string) => void = (id) => appStore.getState().addToSelection(id);
export const setAddToChat = (fn: (id: string) => void) => {
  addToChat = fn;
};

/** 問 AI：寫入 chatDraft、把地點放進選取（畫面怎麼切由各平台的 store 監聽 chatDraft.seq） */
export function askAboutPlace(placeId: string, text: string, from: 'trip' | 'other') {
  const day = appStore.getState().day;
  const seq = (uiStore.getState().chatDraft?.seq ?? 0) + 1;
  uiStore.setState({ chatDraft: { seq, text, placeId, date: day === 'all' ? null : day, from } });
  addToChat(placeId);
}
