// 對話框（T15m）：寫建議、進入規劃模式的確認、快照、排進行程、移到別天、採用／不採用、投票備註、修改紀錄、需要預約。
// 一次只開一個；從哪裡打開都走這裡（詳情面板、時間軸、規劃列），App 底下的 <Dialogs /> 負責畫。

import { createStore } from 'zustand/vanilla';
import type { Suggestion } from './backend/types.ts';

export type DialogState =
  | { kind: 'suggest'; day?: string; placeIds?: string[]; editing?: Suggestion }
  | { kind: 'planning' }
  | { kind: 'snapshots' }
  | { kind: 'pending' }
  | { kind: 'reservations' }
  | { kind: 'add'; placeId: string; day?: string }
  | { kind: 'move'; itemId: string }
  | { kind: 'adopt'; suggestionId: number }
  | { kind: 'decline'; suggestionId: number }
  | { kind: 'history'; placeId: string; field?: string };

export interface UiState {
  dialog: DialogState | null;
  /** 規劃模式閒置多久自動退出（分鐘）；dev 選單可以改短 */
  idleMinutes: number;
}

export const uiStore = createStore<UiState>()(() => ({ dialog: null, idleMinutes: 10 }));

export const openDialog = (dialog: DialogState) => uiStore.setState({ dialog });
export const closeDialog = () => uiStore.setState({ dialog: null });
