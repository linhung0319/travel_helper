// 大家共用的資料（T15m）：行程的 version、快照、建議、投票、修改紀錄、成員。全部經過 backend/（T15m 是假後端）。
// 行程本身放在 dataStore（地圖、時間軸都讀那一份），修改紀錄合併進 dataStore 的資料點。
// 同步照 architecture §3.8：每 30 秒、切回分頁時問一次 sync，變了才重抓那一種。
// 這裡是純邏輯（Node 的測試也能用）；網站共用的一份在 appShared.ts。

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Itinerary } from '@travel-helper/engine/types';
import { ItineraryError } from '@travel-helper/engine';
import {
  isVersionConflict,
  type Backend,
  type Member,
  type PlaceEdit,
  type SnapshotMeta,
  type Suggestion,
  type SuggestionStatus,
  type SyncState,
  type Vote,
  type VoteValue,
} from './backend/types.ts';
import type { DataState } from './dataStore.ts';
import { mergePlaceEdits } from './data/merge.ts';
import { placeDays } from './lib/itinerary.ts';

export interface Toast {
  seq: number;
  kind: 'ok' | 'error';
  text: string;
}

export interface SharedState {
  me: Member | null;
  members: Member[];
  /** 手上這份行程的 version（存檔時送出） */
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
  snapshots: SnapshotMeta[];
  suggestions: Suggestion[];
  votes: Vote[];
  edits: PlaceEdit[];
  /** 存檔中（畫面顯示「儲存中…」） */
  saving: boolean;
  /** 別人改過了（存檔回 409）：重新載入後才能再改（architecture §3.6） */
  conflict: { version: number } | null;
  /** 存檔、錯誤的提示，畫面顯示幾秒 */
  toast: Toast | null;
  lastSync: SyncState | null;
}

const initial: SharedState = {
  me: null,
  members: [],
  version: 0,
  updatedBy: null,
  updatedAt: null,
  snapshots: [],
  suggestions: [],
  votes: [],
  edits: [],
  saving: false,
  conflict: null,
  toast: null,
  lastSync: null,
};

export type Result<T = void> = ({ ok: true } & (T extends void ? object : { value: T })) | { ok: false; error: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 換一份行程（存檔後、重新載入、同步） */
function setItinerary(itinerary: Itinerary | null, data: StoreApi<DataState>) {
  data.setState({ itinerary, days: placeDays(itinerary) });
}

/** 修改紀錄變了：重新合併資料點 */
function setPlaceEdits(edits: PlaceEdit[], data: StoreApi<DataState>) {
  const places = mergePlaceEdits(data.getState().basePlaces, edits);
  data.setState({ places, byId: new Map(places.map((p) => [p.id, p])) });
}

export function createShared(getBackend: () => Backend, data: StoreApi<DataState>) {
  const store = createStore<SharedState>()(() => initial);
  let toastSeq = 0;
  const set = (patch: Partial<SharedState>) => store.setState(patch);
  const toast = (kind: Toast['kind'], text: string) => set({ toast: { seq: ++toastSeq, kind, text } });
  const fail = (e: unknown): { ok: false; error: string } => {
    const text = message(e);
    toast('error', text);
    return { ok: false, error: text };
  };

  async function loadItinerary() {
    const doc = await getBackend().getItinerary();
    setItinerary(doc.data, data);
    set({ version: doc.version, updatedBy: doc.updatedBy, updatedAt: doc.updatedAt, conflict: null });
  }

  const loadSnapshots = async () => set({ snapshots: await getBackend().listSnapshots() });
  const loadSuggestions = async () => set({ suggestions: await getBackend().listSuggestions() });
  const loadVotes = async () => set({ votes: await getBackend().listVotes() });
  async function loadEdits() {
    const edits = await getBackend().listEdits();
    set({ edits });
    setPlaceEdits(edits, data);
  }

  async function load() {
    const b = getBackend();
    const [me, members, lastSync] = await Promise.all([b.me(), b.members(), b.sync()]);
    set({ me, members, lastSync });
    await Promise.all([loadItinerary(), loadSnapshots(), loadSuggestions(), loadVotes(), loadEdits()]);
  }

  /**
   * 改行程：先在畫面上改（樂觀更新），再存檔；存不了就退回。
   * fn 用 engine 的操作（ops.ts），丟 ItineraryError 時不存。後端存檔前會自動存快照。
   */
  async function changeItinerary(fn: (it: Itinerary) => Itinerary, reason: string): Promise<Result<Itinerary>> {
    const s = store.getState();
    if (s.conflict) return fail(new Error('別人改過了，請先重新載入'));
    if (s.saving) return fail(new Error('還在儲存上一個修改，請稍等'));
    const before = data.getState().itinerary;
    if (!before) return fail(new Error('還沒有行程'));
    let next: Itinerary;
    try {
      next = fn(before);
    } catch (e) {
      if (e instanceof ItineraryError) return fail(e);
      throw e;
    }
    setItinerary(next, data);
    set({ saving: true });
    try {
      const doc = await getBackend().putItinerary(s.version, next, reason);
      set({ version: doc.version, updatedBy: doc.updatedBy, updatedAt: doc.updatedAt, saving: false });
      toast('ok', `已儲存：${reason}`);
      void loadSnapshots();
      return { ok: true, value: next } as Result<Itinerary>;
    } catch (e) {
      setItinerary(before, data);
      set({ saving: false });
      if (isVersionConflict(e)) {
        set({ conflict: { version: (e.details as { current?: number } | undefined)?.current ?? s.version } });
        return { ok: false, error: e.message };
      }
      return fail(e);
    }
  }

  async function reloadItinerary(): Promise<void> {
    await Promise.all([loadItinerary(), loadSnapshots()]);
    toast('ok', '已重新載入最新的行程');
  }

  async function restoreSnapshot(id: number): Promise<Result> {
    const s = store.getState();
    if (s.conflict) return fail(new Error('別人改過了，請先重新載入'));
    set({ saving: true });
    try {
      const doc = await getBackend().restoreSnapshot(id, s.version);
      setItinerary(doc.data, data);
      set({ version: doc.version, updatedBy: doc.updatedBy, updatedAt: doc.updatedAt, saving: false });
      toast('ok', `已復原到快照 #${id}`);
      await loadSnapshots();
      return { ok: true };
    } catch (e) {
      set({ saving: false });
      if (isVersionConflict(e)) {
        set({ conflict: { version: s.version } });
        return { ok: false, error: e.message };
      }
      return fail(e);
    }
  }

  /** 一筆建議改了：換掉清單裡那一筆（刪掉的拿掉） */
  const putSuggestion = (sg: Suggestion | null, id: number) =>
    set({ suggestions: sg ? store.getState().suggestions.map((x) => (x.id === id ? sg : x)) : store.getState().suggestions.filter((x) => x.id !== id) });

  async function createSuggestion(input: { day: string; text: string; placeIds?: string[] }): Promise<Result<Suggestion>> {
    try {
      const sg = await getBackend().createSuggestion(input);
      set({ suggestions: [...store.getState().suggestions, sg] });
      toast('ok', '已送出建議');
      return { ok: true, value: sg } as Result<Suggestion>;
    } catch (e) {
      return fail(e);
    }
  }

  async function updateSuggestion(id: number, patch: { day?: string; text?: string; placeIds?: string[] }): Promise<Result> {
    try {
      putSuggestion(await getBackend().updateSuggestion(id, patch), id);
      toast('ok', '已更新建議');
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  async function deleteSuggestion(id: number): Promise<Result> {
    try {
      await getBackend().deleteSuggestion(id);
      putSuggestion(null, id);
      toast('ok', '已刪除建議');
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  async function setSuggestionStatus(id: number, status: SuggestionStatus, opts: { note?: string | null; adoptedItemIds?: string[] } = {}): Promise<Result> {
    try {
      putSuggestion(await getBackend().setSuggestionStatus(id, { status, ...opts }), id);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  /**
   * 採用建議：行程項目記「誰提的」（interaction-design §6），再把建議標成已採用。
   * 項目是手動選單或「排進行程」剛加的，所以這裡只補 proposedBy。
   */
  async function adoptSuggestion(sg: Suggestion, itemIds: string[]): Promise<Result> {
    if (itemIds.length) {
      const r = await changeItinerary((it) => addProposer(it, itemIds, sg.author), `採用建議 #${sg.id}`);
      if (!r.ok) return r;
    }
    const r = await setSuggestionStatus(sg.id, 'adopted', { adoptedItemIds: itemIds });
    if (r.ok) toast('ok', '已標成已採用');
    return r;
  }

  /** ❤️／👎：value 是 null 時收回 */
  async function vote(placeId: string, value: VoteValue | null, note: string | null = null): Promise<Result> {
    const me = store.getState().me?.id;
    try {
      if (value) {
        const v = await getBackend().putVote(placeId, value, note);
        set({ votes: [...store.getState().votes.filter((x) => !(x.placeId === placeId && x.memberId === me)), v] });
      } else {
        await getBackend().deleteVote(placeId);
        set({ votes: store.getState().votes.filter((x) => !(x.placeId === placeId && x.memberId === me)) });
      }
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  async function revertEdit(id: number): Promise<Result> {
    try {
      const e = await getBackend().revertEdit(id);
      const edits = store.getState().edits.map((x) => (x.id === id ? e : x));
      set({ edits });
      setPlaceEdits(edits, data);
      toast('ok', '已復原這筆修改');
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  /** 問後端有沒有新的；行程有別人的新版本時直接換上（存檔中、衝突中不換） */
  async function syncOnce(): Promise<void> {
    const prev = store.getState().lastSync;
    const next = await getBackend().sync();
    set({ lastSync: next });
    if (!prev) return;
    const jobs: Promise<unknown>[] = [];
    const s = store.getState();
    if (next.itinerary !== s.version && !s.saving && !s.conflict) {
      jobs.push(
        loadItinerary().then(() => {
          const by = store.getState().members.find((m) => m.id === store.getState().updatedBy)?.displayName;
          toast('ok', `行程有更新${by ? `（${by} 改的）` : ''}`);
        }),
        loadSnapshots(),
      );
    }
    if (next.suggestions !== prev.suggestions) jobs.push(loadSuggestions());
    if (next.votes !== prev.votes) jobs.push(loadVotes());
    if (next.edits !== prev.edits) jobs.push(loadEdits());
    await Promise.all(jobs);
  }

  /** 換人（dev 的假登入）：身分換了，畫面上「自己的」東西跟著換 */
  async function reloadMe(): Promise<void> {
    set({ me: await getBackend().me() });
  }

  return {
    store,
    load,
    loadItinerary,
    reloadItinerary,
    changeItinerary,
    restoreSnapshot,
    createSuggestion,
    updateSuggestion,
    deleteSuggestion,
    setSuggestionStatus,
    adoptSuggestion,
    vote,
    revertEdit,
    syncOnce,
    reloadMe,
    clearToast: () => set({ toast: null }),
  };
}

/** 行程項目加上「誰提的」（已經有就不重複） */
export function addProposer(it: Itinerary, itemIds: string[], memberId: string): Itinerary {
  const ids = new Set(itemIds);
  const mark = <T extends { id: string; type: string; proposedBy?: string[] }>(x: T): T =>
    ids.has(x.id) && x.type === 'visit' && !(x.proposedBy ?? []).includes(memberId) ? { ...x, proposedBy: [...(x.proposedBy ?? []), memberId] } : x;
  return {
    ...it,
    days: it.days.map((d) => ({
      ...d,
      items: d.items.map((x) => (x.type === 'split' ? { ...x, groups: x.groups.map((g) => ({ ...g, items: g.items.map(mark) })) } : mark(x))),
    })),
  };
}

/** 計數：每個點的 ❤️、👎 */
export function voteCounts(votes: Vote[]): Map<string, { like: number; dislike: number }> {
  const out = new Map<string, { like: number; dislike: number }>();
  for (const v of votes) {
    const c = out.get(v.placeId) ?? { like: 0, dislike: 0 };
    c[v.value] += 1;
    out.set(v.placeId, c);
  }
  return out;
}

/** 每個點有幾則建議（地圖的 💬 數字；沒刪除、不管狀態） */
export function suggestionCounts(suggestions: Suggestion[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of suggestions) for (const id of s.placeIds) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

export const pendingCount = (suggestions: Suggestion[]) => suggestions.filter((s) => s.status === 'pending').length;

export function memberName(members: Member[], id: string | null | undefined): string {
  if (!id) return '（不明）';
  return members.find((m) => m.id === id)?.displayName ?? id;
}
