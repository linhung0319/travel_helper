// 自己加地點（T31）的草稿：搜尋框的提示、地圖上指位置、詳情的「✎ 修改」都從這裡開始；確認畫面（Task 6、7）畫 draft。
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

export interface AddPlaceState {
  /** null＝確認畫面沒開 */
  draft: AddPlaceDraft | null;
  saving: boolean;
  error: string | null;
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
}

const BLANK: AddPlaceDraft = { mode: 'new', editId: null, via: 'search', coords: null, name: '', jaName: null, type: null, note: '', link: null };

export function createAddPlaceStore(deps: AddPlaceDeps): StoreApi<AddPlaceState> {
  return createStore<AddPlaceState>()((set, get) => {
    const fail = (error: string): { ok: false; error: string } => {
      set({ error });
      return { ok: false, error };
    };
    return {
    draft: null,
    saving: false,
    error: null,
    start: (init) => set({ draft: { ...BLANK, ...init, mode: 'new', editId: null }, saving: false, error: null }),
    startEdit: (placeId) => {
      const place = deps.place(placeId);
      const up = deps.userPlace(placeId);
      if (!place || !up || up.deletedAt) return;
      const zh = up.data.name.zh;
      set({
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
    cancel: () => set({ draft: null, saving: false, error: null }),
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
      set({ draft: null, saving: false, error: null });
      return { ok: true, id: r.place.id };
    },
    };
  });
}

