// 自己加地點（T31）的狀態：Task 5 在這裡補完（表單、釘選位置、來源解析）。
// 現在只有詳情的「✎ 修改」要呼叫的 startEdit。

import { createStore } from 'zustand/vanilla';

export interface AddPlaceState {
  /** 開始修改一個自己加的點（Task 5 補：打開預填好的確認畫面） */
  startEdit(placeId: string): void;
}

export const addPlaceStore = createStore<AddPlaceState>()(() => ({
  startEdit: () => {
    // Task 5 補完
  },
}));
