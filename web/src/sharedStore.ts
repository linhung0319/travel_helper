// 大家共用的資料（T15m）：行程的 version、快照、投票（❤️ 就是想去）、留言、候選、修改紀錄、成員。全部經過 backend/（T15m 是假後端）。
// 行程本身放在 dataStore（地圖、時間軸都讀那一份），修改紀錄合併進 dataStore 的資料點。
// 同步照 architecture §3.8：每 30 秒、切回分頁時問一次 sync，變了才重抓那一種。
// 這裡是純邏輯（Node 的測試也能用）；網站共用的一份在 appShared.ts。

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Itinerary } from '@travel-helper/engine/types';
import { ItineraryError, removeItem } from '@travel-helper/engine';
import {
  isVersionConflict,
  type Backend,
  type Candidate,
  type Comment,
  type CommentKind,
  type Member,
  type PlaceEdit,
  type Reservation,
  type ReservationStatus,
  type SnapshotMeta,
  type SyncState,
  type UserPlace,
  type UserPlaceData,
  type UserPlaceType,
  type Vote,
  type VoteValue,
} from './backend/types.ts';
import type { DataState } from './dataStore.ts';
import { mergePlaceEdits } from './data/merge.ts';
import { userPlaceToPlace } from './lib/addPlace/userPlace.ts';
import { placeDays } from './lib/itinerary.ts';
import { findItemRef } from './lib/planView.ts';
import { shortDayLabel } from './lib/trip.ts';

export interface Toast {
  seq: number;
  kind: 'ok' | 'error';
  text: string;
  /** 提示上的按鈕（例如「復原」） */
  action?: { label: string; run: () => void | Promise<void> };
}

export interface SharedState {
  me: Member | null;
  members: Member[];
  /** 手上這份行程的 version（存檔時送出） */
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
  snapshots: SnapshotMeta[];
  votes: Vote[];
  comments: Comment[];
  /** 某天的候選（想去的「加到某天」） */
  candidates: Candidate[];
  /** 預約筆記 */
  reservations: Reservation[];
  edits: PlaceEdit[];
  /** 自己加的點（含已刪除的） */
  userPlaces: UserPlace[];
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
  votes: [],
  comments: [],
  candidates: [],
  reservations: [],
  edits: [],
  userPlaces: [],
  saving: false,
  conflict: null,
  toast: null,
  lastSync: null,
};

export type Result<T = void> = ({ ok: true } & (T extends void ? object : { value: T })) | { ok: false; error: string };

/** 自己加的點的動作：成功時帶回後端存下的那一筆 */
export type UserPlaceResult = { ok: true; place: UserPlace } | { ok: false; error: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 換一份行程（存檔後、重新載入、同步） */
function setItinerary(itinerary: Itinerary | null, data: StoreApi<DataState>) {
  data.setState({ itinerary, days: placeDays(itinerary) });
}

/**
 * 修改紀錄、自己加的點變了：重新合併資料點。
 * places：預設資料套上修改，後面接沒刪除的自己加的點；byId 也含已刪除的（行程裡那一格還要顯示名稱）
 */
export function rebuildPlaces(data: StoreApi<DataState>, edits: PlaceEdit[], userPlaces: UserPlace[]) {
  const { basePlaces, areas } = data.getState();
  const merged = mergePlaceEdits(basePlaces, edits);
  const users = userPlaces.map((u) => ({ deleted: !!u.deletedAt, place: userPlaceToPlace(u, areas) }));
  const places = users.some((u) => !u.deleted) ? [...merged, ...users.filter((u) => !u.deleted).map((u) => u.place)] : merged;
  data.setState({ places, byId: new Map([...merged, ...users.map((u) => u.place)].map((p) => [p.id, p])) });
}

export function createShared(getBackend: () => Backend, data: StoreApi<DataState>) {
  const store = createStore<SharedState>()(() => initial);
  let toastSeq = 0;
  const set = (patch: Partial<SharedState>) => store.setState(patch);
  const toast = (kind: Toast['kind'], text: string, action?: Toast['action']) => set({ toast: { seq: ++toastSeq, kind, text, ...(action ? { action } : {}) } });
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
  const loadVotes = async () => set({ votes: await getBackend().listVotes() });
  const loadComments = async () => set({ comments: await getBackend().listComments() });
  const loadCandidates = async () => set({ candidates: await getBackend().listCandidates() });
  const loadReservations = async () => set({ reservations: await getBackend().listReservations() });
  async function loadEdits() {
    const edits = await getBackend().listEdits();
    set({ edits });
    rebuildPlaces(data, edits, store.getState().userPlaces);
  }
  async function loadUserPlaces() {
    const userPlaces = await getBackend().listUserPlaces();
    set({ userPlaces });
    rebuildPlaces(data, store.getState().edits, userPlaces);
  }

  async function load() {
    const b = getBackend();
    const [me, members, lastSync] = await Promise.all([b.me(), b.members(), b.sync()]);
    set({ me, members, lastSync });
    await Promise.all([loadItinerary(), loadSnapshots(), loadVotes(), loadComments(), loadCandidates(), loadReservations(), loadEdits(), loadUserPlaces()]);
  }

  /**
   * 改行程：先在畫面上改（樂觀更新），再存檔；存不了就退回。
   * fn 用 engine 的操作（ops.ts），丟 ItineraryError 時不存。後端存檔前會自動存快照。
   * settle：存好之後、跳提示之前要做完的事（例如拿掉排進去的候選）；做完才出現「復原」，馬上按復原也不會和它搶。
   * 復原只在行程還是這次改完的樣子時才做；之後又被改過（自己或同步進來別人的）就不復原，免得蓋掉。
   */
  async function changeItinerary(
    fn: (it: Itinerary) => Itinerary,
    reason: string,
    opts: { undo?: { text: string; after?: () => Promise<unknown> }; settle?: () => Promise<unknown> } = {},
  ): Promise<Result<Itinerary>> {
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
      try {
        await opts.settle?.();
      } catch (e) {
        fail(e);
      }
      const undo = opts.undo;
      if (undo) {
        toast('ok', undo.text, {
          label: '復原',
          run: async () => {
            if (data.getState().itinerary !== next) {
              fail(new Error('行程已經被改過，不能復原'));
              return;
            }
            const r = await changeItinerary(() => before, `復原：${reason}`);
            if (!r.ok) return;
            try {
              await undo.after?.();
            } catch (e) {
              fail(e);
            }
          },
        });
      } else toast('ok', `已儲存：${reason}`);
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

  /** 自己的票換成 v（null：收回） */
  function putMyVote(placeId: string, v: Vote | null) {
    const me = store.getState().me?.id;
    const rest = store.getState().votes.filter((x) => !(x.placeId === placeId && x.memberId === me));
    set({ votes: v ? [...rest, v] : rest });
  }

  /** ❤️（想去）／👎：value 是 null 時收回 */
  async function vote(placeId: string, value: VoteValue | null): Promise<Result> {
    try {
      if (value) putMyVote(placeId, await getBackend().putVote(placeId, value));
      else {
        await getBackend().deleteVote(placeId);
        putMyVote(placeId, null);
      }
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  /** 一則留言改了：換掉清單裡那一筆（刪掉的拿掉） */
  const putComment = (x: Comment | null, id: number) =>
    set({ comments: x ? store.getState().comments.map((c) => (c.id === id ? x : c)) : store.getState().comments.filter((c) => c.id !== id) });

  async function comment(target: string, text: string, kind: CommentKind = 'normal'): Promise<Result<Comment>> {
    try {
      const x = await getBackend().createComment({ target, text, kind });
      set({ comments: [...store.getState().comments, x] });
      return { ok: true, value: x } as Result<Comment>;
    } catch (e) {
      return fail(e);
    }
  }

  async function editComment(id: number, text: string): Promise<Result> {
    try {
      putComment(await getBackend().updateComment(id, text), id);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  async function deleteComment(id: number): Promise<Result> {
    try {
      await getBackend().deleteComment(id);
      putComment(null, id);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  /** 加到某天的候選（同一天同一個點只有一筆） */
  async function addCandidate(placeId: string, day: string): Promise<Result<Candidate>> {
    try {
      const c = await getBackend().createCandidate({ placeId, day });
      set({ candidates: [...store.getState().candidates.filter((x) => x.id !== c.id), c] });
      toast('ok', `已加到 ${shortDayLabel(day)} 的候選`);
      return { ok: true, value: c } as Result<Candidate>;
    } catch (e) {
      return fail(e);
    }
  }

  /**
   * 撤下、放回候選用：這天還沒有這個點的候選才用我的名字加。先問後端（本機可能還沒同步到別人加的），
   * created 是「這次加的」：復原時只能刪這種。後端的 createCandidate 是 upsert，回來的不是我加的也不算
   */
  async function ensureCandidate(placeId: string, day: string): Promise<Result<{ id: number; created: boolean }>> {
    let list: Candidate[];
    try {
      list = await getBackend().listCandidates();
    } catch (e) {
      return fail(e);
    }
    set({ candidates: list });
    const old = list.find((x) => x.placeId === placeId && x.day === day && !x.deletedAt);
    if (old) return { ok: true, value: { id: old.id, created: false } } as Result<{ id: number; created: boolean }>;
    const r = await addCandidate(placeId, day);
    if (!r.ok) return r;
    return { ok: true, value: { id: r.value.id, created: r.value.addedBy === store.getState().me?.id } } as Result<{ id: number; created: boolean }>;
  }

  /** 拿掉這次加的候選（撤下、放回候選的復原，或拿不掉卡片時） */
  async function dropCreated(ids: number[]) {
    for (const id of ids) await removeCandidate(id, undefined, true);
  }

  /**
   * 撤下（「⋯」的 ↩ 撤下）：整張卡（所有選項）拿掉，地點用我的名字加成這天的候選，可以復原。
   * 先加候選（ensureCandidate：這天已經有的跳過、不記）、再拿掉卡片；復原時卡片回原位，只刪這次新加的候選。
   * 加不起來或拿不掉卡片時，也刪掉剛加的
   */
  async function withdrawItem(itemId: string, date: string): Promise<Result> {
    const item = findItemRef(data.getState().itinerary, itemId)?.item;
    if (item?.type !== 'visit') return fail(new Error('只有地點的卡片能撤下'));
    const p = data.getState().byId.get(item.options[item.selected]?.place ?? '');
    const label = p ? p.name.zh || p.name.ja : (item.options[item.selected]?.place ?? '項目');
    const created: number[] = [];
    for (const placeId of new Set(item.options.map((o) => o.place))) {
      const r = await ensureCandidate(placeId, date);
      if (!r.ok) {
        await dropCreated(created);
        return r;
      }
      if (r.value.created) created.push(r.value.id);
    }
    const r = await changeItinerary((x) => removeItem(x, itemId), `${label} 撤下（回候選）`, {
      undo: { text: `已撤下・${label}`, after: () => dropCreated(created) },
    });
    if (!r.ok) {
      await dropCreated(created);
      return r;
    }
    return { ok: true };
  }

  /**
   * 從候選拿掉。自己加的直接撤回；別人加的要寫理由（編輯），理由變成那個點的一則不採用留言。
   * 排進行程後也用這個拿掉（自己的操作，不用理由：placed）。
   */
  async function removeCandidate(id: number, reason?: string, placed = false): Promise<Result> {
    const c = store.getState().candidates.find((x) => x.id === id);
    if (!c) return { ok: true };
    const mine = c.addedBy === store.getState().me?.id;
    if (!mine && !placed && !reason?.trim()) return fail(new Error('拿掉別人加的候選要寫理由'));
    try {
      if (!mine && !placed) await getBackend().createComment({ target: c.placeId, text: `（${shortDayLabel(c.day)} 的候選）${reason!.trim()}`, kind: 'decline' }).then((x) => set({ comments: [...store.getState().comments, x] }));
      await getBackend().deleteCandidate(id);
      set({ candidates: store.getState().candidates.filter((x) => x.id !== id) });
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  /** 預約筆記：先改畫面，後端存不了就退回；同一個 (date, placeId) 覆蓋 */
  async function setReservation(input: { date: string; placeId: string; status: ReservationStatus; note?: string | null; nights?: number | null }): Promise<Result<Reservation>> {
    const before = store.getState().reservations;
    const same = (x: Reservation) => x.date === input.date && x.placeId === input.placeId;
    const me = store.getState().me?.id ?? '';
    const guess: Reservation = { note: null, nights: null, ...input, updatedBy: me, updatedAt: new Date().toISOString() } as Reservation;
    set({ reservations: [...before.filter((x) => !same(x)), guess] });
    try {
      const r = await getBackend().putReservation(input);
      set({ reservations: [...store.getState().reservations.filter((x) => !same(x)), r] });
      return { ok: true, value: r } as Result<Reservation>;
    } catch (e) {
      set({ reservations: [...store.getState().reservations.filter((x) => !same(x)), ...before.filter(same)] });
      return fail(e);
    }
  }

  async function revertEdit(id: number): Promise<Result> {
    try {
      const e = await getBackend().revertEdit(id);
      const edits = store.getState().edits.map((x) => (x.id === id ? e : x));
      set({ edits });
      rebuildPlaces(data, edits, store.getState().userPlaces);
      toast('ok', '已復原這筆修改');
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  /** 自己加的點：後端回來的那一筆換進清單，資料點跟著重新合併 */
  function putUserPlace(x: UserPlace) {
    const userPlaces = [...store.getState().userPlaces.filter((u) => u.id !== x.id), x];
    set({ userPlaces });
    rebuildPlaces(data, store.getState().edits, userPlaces);
  }

  async function createUserPlace(type: UserPlaceType, d: UserPlaceData): Promise<UserPlaceResult> {
    try {
      const x = await getBackend().createUserPlace(type, d);
      putUserPlace(x);
      return { ok: true, place: x };
    } catch (e) {
      return fail(e);
    }
  }

  async function updateUserPlace(id: string, d: UserPlaceData, type?: UserPlaceType): Promise<UserPlaceResult> {
    try {
      const x = await getBackend().updateUserPlace(id, d, type);
      putUserPlace(x);
      return { ok: true, place: x };
    } catch (e) {
      return fail(e);
    }
  }

  async function deleteUserPlace(id: string): Promise<UserPlaceResult> {
    try {
      const x = await getBackend().deleteUserPlace(id);
      putUserPlace(x);
      return { ok: true, place: x };
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
    if (next.votes !== prev.votes) jobs.push(loadVotes());
    if (next.comments !== prev.comments) jobs.push(loadComments());
    if (next.candidates !== prev.candidates) jobs.push(loadCandidates());
    if (next.reservations !== prev.reservations) jobs.push(loadReservations());
    if (next.edits !== prev.edits) jobs.push(loadEdits());
    if (next.userPlaces !== prev.userPlaces) jobs.push(loadUserPlaces());
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
    vote,
    comment,
    editComment,
    deleteComment,
    addCandidate,
    removeCandidate,
    ensureCandidate,
    dropCreated,
    withdrawItem,
    setReservation,
    revertEdit,
    createUserPlace,
    updateUserPlace,
    deleteUserPlace,
    syncOnce,
    reloadMe,
    clearToast: () => set({ toast: null }),
    /** 一般的提示（例如「已帶進聊天」） */
    notify: (text: string) => toast('ok', text),
    notifyError: (text: string) => toast('error', text),
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

export function memberName(members: Member[], id: string | null | undefined): string {
  if (!id) return '（不明）';
  return members.find((m) => m.id === id)?.displayName ?? id;
}
