// 對話框（T15m）：進入編輯的確認、快照、排進行程、移到別天（卡片、自己加的候選）、修改紀錄、拿掉別人加的候選、刪除自己加的點、怎麼用、引導彈窗（T46）；展開中的交通卡、地圖那側的班次表。
// 一次只開一個；從哪裡打開都走這裡（詳情面板、時間軸、編輯藍條），App 底下的 <Dialogs /> 負責畫。

import { createStore } from 'zustand/vanilla';
import { appStore } from './store.ts';

export type DialogState =
  | { kind: 'planning'; note?: string }
  | { kind: 'snapshots' }
  | { kind: 'add'; placeId: string; day?: string }
  | { kind: 'move'; itemId: string }
  | { kind: 'move-candidate'; candidateId: number }
  | { kind: 'reject'; candidateId: number }
  | { kind: 'history'; placeId: string; field?: string }
  | { kind: 'delete-user-place'; placeId: string }
  | { kind: 'how-to' }
  | { kind: 'guide' };

/** 地圖區的視窗：預約筆記；scope 是這天或整趟（討論是另一個彈窗，DiscussionState） */
export interface MapPanelState {
  kind: 'reservations';
  scope: 'day' | 'trip';
  /** 從時間軸的預約 tag 進來：捲到那一列 */
  focus?: { date: string; placeId: string };
}

/** 討論彈窗（T33）：篩選（all、trip 或日期）、展開的對象（留言的 target） */
export interface DiscussionState {
  chip: string;
  open: string | null;
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
  discussion: DiscussionState | null;
  /** 編輯閒置多久自動結束編輯（分鐘）；dev 選單可以改短 */
  idleMinutes: number;
  /** 展開中的交通細列（日期:項目 ID 或 lodging）；一次只展開一段 */
  legOpen: string | null;
  /** 網頁版時間軸原地展開的那張卡（項目 ID；出發、回住宿是 start、lodging）；一次一張，手機版用 mobileStore.expanded */
  expandedItem: string | null;
  /** 地圖那側的班次表（第五輪 §4）：哪天、哪段交通（legKey 和交通卡的 key 同格式）、第幾程 */
  timetable: TimetableState | null;
  /** 網頁：提議顯示時看差異還是原本的行程（看原本時地圖的虛線也收起來） */
  proposalView: 'diff' | 'original';
  /** 又按了一次「看提議」（同一張提議卡）：時間軸再捲到提議的卡一次 */
  proposalReveal: number;
}

export const uiStore = createStore<UiState>()(() => ({ dialog: null, mapPanel: null, discussion: null, idleMinutes: 10, legOpen: null, expandedItem: null, timetable: null, proposalView: 'diff', proposalReveal: 0 }));

// 換天、離開行程分頁：展開的卡收起來。看 store 不看 DayPanel 卸載：轉向回網頁版時（和 dev 的 StrictMode 重跑 effect）才不會把剛帶過來的展開清掉
let lastView = { day: appStore.getState().day, mode: appStore.getState().mode };
appStore.subscribe((s) => {
  if (s.day === lastView.day && s.mode === lastView.mode) return;
  const left = s.day !== lastView.day || s.mode !== 'map';
  lastView = { day: s.day, mode: s.mode };
  if (left && uiStore.getState().expandedItem) uiStore.setState({ expandedItem: null });
});

// 進入編輯：收起開著的交通。編輯中點開就是編輯器，手機的編輯器是底部面板，不收的話一按「編輯」面板就跳出來
let wasPlanning = appStore.getState().planning;
appStore.subscribe((s) => {
  if (s.planning === wasPlanning) return;
  wasPlanning = s.planning;
  if (s.planning && uiStore.getState().legOpen) uiStore.setState({ legOpen: null });
});

/** 點時間軸的卡：展開那張，點同一張收起（網頁版） */
export const toggleExpandedItem = (key: string) => uiStore.setState((s) => ({ expandedItem: s.expandedItem === key ? null : key }));

export const openDialog = (dialog: DialogState) => uiStore.setState({ dialog });
export const closeDialog = () => uiStore.setState({ dialog: null });

/** 打開地圖那側的班次表（交通卡步驟裡搭車那一行的「› 班次」）；和討論、預約的視窗同一個位置，一次開一個 */
export const openTimetable = (timetable: TimetableState) => uiStore.setState({ timetable, mapPanel: null, discussion: null });
export const closeTimetable = () => uiStore.setState({ timetable: null });


/** 打開地圖區的視窗；範圍照目前選的天（選「全部」或 focus 的那列不在這天時是整趟） */
export const openMapPanel = (kind: MapPanelState['kind'], opts?: { focus: { date: string; placeId: string } }) => {
  const day = appStore.getState().day;
  const scope = day === 'all' || (opts && opts.focus.date !== day) ? 'trip' : 'day';
  uiStore.setState({ mapPanel: { kind, scope, ...(opts ? { focus: opts.focus } : {}) }, timetable: null, discussion: null });
};
export const closeMapPanel = () => uiStore.setState({ mapPanel: null });
/** 視窗裡切換「這天／整趟」 */
export const setMapPanelScope = (scope: MapPanelState['scope']) => uiStore.setState((s) => (s.mapPanel ? { mapPanel: { ...s.mapPanel, scope } } : s));

/** 打開討論彈窗：行程選了某天就開那天，選整趟就開「全部」 */
export const openDiscussion = (chip?: string) => {
  const day = appStore.getState().day;
  const c = chip ?? (day === 'all' ? 'all' : day);
  uiStore.setState({ discussion: { chip: c, open: c === 'trip' ? 'trip' : null }, mapPanel: null, timetable: null });
};
export const closeDiscussion = () => uiStore.setState({ discussion: null });
/** 換篩選：展開的收起來；整趟只有一個對象，直接展開 */
export const setDiscussionChip = (chip: string) => uiStore.setState((s) => (s.discussion ? { discussion: { chip, open: chip === 'trip' ? 'trip' : null } } : s));
export const setDiscussionOpen = (open: string | null) => uiStore.setState((s) => (s.discussion ? { discussion: { ...s.discussion, open } } : s));

/** 從詳情「問 AI」帶進聊天的一句話；seq 每次加 1，手機的 store 看 seq 變了就切到聊天 */
