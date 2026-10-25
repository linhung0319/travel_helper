// 對話框（T15m）：進入編輯的確認、快照、排進行程、移到別天（卡片、自己加的候選）、修改紀錄、拿掉別人加的候選；展開中的交通卡、地圖那側的班次表。
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
  | { kind: 'history'; placeId: string; field?: string };

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
  /** 地圖那側的班次表（第五輪 §4）：哪天、哪段交通（legKey 和交通卡的 key 同格式）、第幾程 */
  timetable: TimetableState | null;
}

export const uiStore = createStore<UiState>()(() => ({ dialog: null, mapPanel: null, idleMinutes: 10, legOpen: null, timetable: null }));

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
