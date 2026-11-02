// 自己加地點（T31）網站共用的草稿 store；邏輯在 lib/addPlace/draft.ts。
// 清單標題列的「＋ 加地點」、搜尋比不到的提示、地圖上指位置、詳情的「✎ 修改」都從這裡開始；彈窗（AddPlaceDialog）畫 entry、draft。

import { useStore } from 'zustand';
import { dataStore } from './dataStore.ts';
import { shared, sharedStore } from './appShared.ts';
import { createAddPlaceStore, type AddPlaceState } from './lib/addPlace/draft.ts';

export type { AddPlaceDraft, AddPlaceState } from './lib/addPlace/draft.ts';

export const addPlaceStore = createAddPlaceStore({
  place: (id) => dataStore.getState().byId.get(id),
  userPlace: (id) => sharedStore.getState().userPlaces.find((u) => u.id === id),
  createUserPlace: (t, d) => shared.createUserPlace(t, d),
  updateUserPlace: (id, d, t) => shared.updateUserPlace(id, d, t),
  // 自己加的點一加就出現在想去（可以取消，§17.7）
  onCreated: (id) => void shared.vote(id, 'like'),
});

export function useAddPlace<T>(selector: (s: AddPlaceState) => T): T {
  return useStore(addPlaceStore, selector);
}
