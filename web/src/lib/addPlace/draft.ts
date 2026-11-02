// 自己加地點（T31、T33）的草稿：清單標題列的「＋ 加地點」、搜尋比不到的提示、地圖上指位置、詳情的「✎ 修改」都從這裡開始；彈窗（AddPlaceDialog）畫 entry、draft。
// 用 createAddPlaceStore 做，依賴（資料點、自己加的點、存檔動作）從外面給，Node 的測試才不用接整個網站；網站共用的一份在 addPlaceStore.ts。

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AddedVia, UserPlace, UserPlaceData, UserPlaceType } from '../../backend/types.ts';
import type { LonLat, Place } from '../../data/types.ts';
import type { UserPlaceResult } from '../../sharedStore.ts';

export interface AddPlaceDraft {
  mode: 'new' | 'edit';
  editId: string | null;
  via: AddedVia;
  /** null＝還沒有位置，畫面用地圖目前的中心 */
  coords: LonLat | null;
  name: string;
  jaName: string | null;
  type: UserPlaceType | null;
  note: string;
  link: string | null;
}

export interface EntryDefaults {
  name?: string;
  type?: UserPlaceType | null;
  note?: string;
}

export interface AddPlaceState {
  /** 彈窗的第一步（輸入連結或地址，T33）：要帶入的文字；null＝不在第一步 */
  entry: { text: string } | null;
  /** AI 打開的：加好要告訴聊天室（§17.8） */
  fromAi: boolean;
  /** AI 給的名稱、類型、備註：第一步展開短網址後帶進確認畫面 */
  entryDefaults: EntryDefaults | null;
  /** 彈窗的第二步（確認畫面）：null＝沒開 */
  draft: AddPlaceDraft | null;
  saving: boolean;
  error: string | null;
  /** 打開第一步（清單標題列的「＋ 加地點」、搜尋比不到時的提示） */
  openEntry(text?: string, opts?: { fromAi?: boolean; defaults?: EntryDefaults }): void;
  start(init: Partial<AddPlaceDraft> & { via: AddedVia }): void;
  /** 修改自己加的點：從資料點和自己加的清單預填 */
  startEdit(placeId: string): void;
  patch(p: Partial<AddPlaceDraft>): void;
  cancel(): void;
  save(): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}

export interface AddPlaceDeps {
  place(id: string): Place | undefined;
  userPlace(id: string): UserPlace | undefined;
  createUserPlace(type: UserPlaceType, data: UserPlaceData): Promise<UserPlaceResult>;
  updateUserPlace(id: string, data: UserPlaceData, type?: UserPlaceType): Promise<UserPlaceResult>;
  /** 新加的點存好了（幫加的人按 ♡，§17.7）；修改不算 */
  onCreated?(id: string): void;
}

const BLANK: AddPlaceDraft = { mode: 'new', editId: null, via: 'search', coords: null, name: '', jaName: null, type: null, note: '', link: null };

export function createAddPlaceStore(deps: AddPlaceDeps): StoreApi<AddPlaceState> {
  return createStore<AddPlaceState>()((set, get) => {
    const fail = (error: string): { ok: false; error: string } => {
      set({ error });
      return { ok: false, error };
    };
    return {
    entry: null,
    fromAi: false,
    entryDefaults: null,
    draft: null,
    saving: false,
    error: null,
    openEntry: (text = '', opts = {}) => set({ entry: { text }, fromAi: !!opts.fromAi, entryDefaults: opts.defaults ?? null, draft: null, saving: false, error: null }),
    start: (init) => {
      const s = get();
      const carried = s.entry ? s.entryDefaults : null;
      const draft: AddPlaceDraft = { ...BLANK, ...init, mode: 'new', editId: null };
      if (carried?.name && !draft.name) draft.name = carried.name;
      if (carried?.type) draft.type = carried.type;
      if (carried?.note) draft.note = carried.note;
      set({ entry: null, entryDefaults: null, fromAi: init.via === 'ai' || (!!s.entry && s.fromAi), draft, saving: false, error: null });
    },
    startEdit: (placeId) => {
      const place = deps.place(placeId);
      const up = deps.userPlace(placeId);
      if (!place || !up || up.deletedAt) return;
      const zh = up.data.name.zh;
      set({
        entry: null,
        fromAi: false,
        entryDefaults: null,
        draft: {
          mode: 'edit',
          editId: placeId,
          via: up.data.addedVia,
          coords: up.data.coords,
          name: zh,
          jaName: up.data.name.ja ?? null,
          type: up.type,
          note: up.data.note ?? '',
          link: up.data.links?.googleMaps ?? null,
        },
        saving: false,
        error: null,
      });
    },
    patch: (p) => set((s) => (s.draft ? { draft: { ...s.draft, ...p } } : s)),
    cancel: () => set({ entry: null, fromAi: false, entryDefaults: null, draft: null, saving: false, error: null }),
    save: async () => {
      const { draft, saving } = get();
      if (!draft || saving) return { ok: false, error: '沒有要存的地點' };
      const name = draft.name.trim();
      if (!name) return fail('名稱不能空白');
      if (!draft.type) return fail('要選一個類型');
      if (!draft.coords) return fail('還沒有位置');
      const ja = draft.jaName?.trim();
      const note = draft.note.trim();
      const data: UserPlaceData = {
        name: ja && ja !== name ? { zh: name, ja } : { zh: name },
        coords: draft.coords,
        note: note || null,
        links: { googleMaps: draft.link },
        addedVia: draft.via,
      };
      set({ saving: true, error: null });
      const r = draft.mode === 'edit' && draft.editId ? await deps.updateUserPlace(draft.editId, data, draft.type) : await deps.createUserPlace(draft.type, data);
      if (!r.ok) {
        set({ saving: false, error: r.error });
        return { ok: false, error: r.error };
      }
      set({ draft: null, saving: false, error: null, fromAi: false });
      if (draft.mode === 'new') deps.onCreated?.(r.place.id);
      return { ok: true, id: r.place.id };
    },
    };
  });
}

