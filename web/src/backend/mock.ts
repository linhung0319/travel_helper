// 假後端（T15m）：規則照 T24 的 Worker（worker/src/api/），資料存在記憶體，有 storage 時也存進 localStorage。
// 只在 dev server 用（backend/index.ts）；Node 的測試不給 storage、不延遲。

import type { Itinerary } from '@travel-helper/engine/types';
import {
  BackendError,
  type Backend,
  type ItineraryDoc,
  type Member,
  type PlaceEdit,
  type Snapshot,
  type Suggestion,
  type SuggestionStatus,
  type Vote,
  type VoteValue,
} from './types.ts';

/** 假後端的種子資料（dev-fixtures/seed.ts） */
export interface MockSeed {
  members: Member[];
  /** 一開始登入的人 */
  me: string;
  itinerary: Itinerary | null;
  suggestions?: Omit<Suggestion, 'id' | 'updatedAt' | 'deletedAt'>[];
  votes?: Omit<Vote, 'updatedAt' | 'deletedAt'>[];
  edits?: Omit<PlaceEdit, 'id' | 'updatedAt' | 'revertedAt' | 'revertedBy' | 'closedAt'>[];
}

interface MockState {
  members: Member[];
  me: string;
  itinerary: ItineraryDoc;
  snapshots: Snapshot[];
  suggestions: Suggestion[];
  votes: Vote[];
  edits: PlaceEdit[];
  seq: { snapshot: number; suggestion: number; edit: number };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface MockOptions {
  storage?: StorageLike | null;
  storageKey?: string;
  /** 每次呼叫延遲幾毫秒，才看得到「儲存中」 */
  latencyMs?: number;
  /** 測試用：固定的時間 */
  now?: () => string;
}

/** 開發用的操作：dev 選單、Playwright 用 */
export interface MockBackend extends Backend {
  /** 假登入：換成另一個人 */
  setMe(memberId: string): void;
  currentMemberId(): string;
  /** 回到種子資料 */
  reset(seed?: MockSeed): void;
  /** 假裝別人改了行程（version 加一），用來看「別人改過了」 */
  simulateOtherEdit(memberId?: string): void;
}

const MAX_TEXT = 4000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clone = <T>(x: T): T => structuredClone(x);

function badRequest(message: string): never {
  throw new BackendError(400, 'bad-request', message);
}
function forbidden(message: string): never {
  throw new BackendError(403, 'forbidden', message);
}
function notFound(message: string): never {
  throw new BackendError(404, 'not-found', message);
}

function checkDay(day: unknown): string {
  if (day === 'trip' || (typeof day === 'string' && DATE.test(day))) return day as string;
  return badRequest("day 要是 'YYYY-MM-DD' 或 'trip'（整趟）");
}

function checkText(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) badRequest('text 不能是空的');
  if (text.length > MAX_TEXT) badRequest(`text 太長（上限 ${MAX_TEXT} 字）`);
  return text;
}

function fromSeed(seed: MockSeed, now: string): MockState {
  return {
    members: clone(seed.members),
    me: seed.me,
    itinerary: seed.itinerary
      ? { version: 1, data: clone(seed.itinerary), updatedBy: seed.me, updatedAt: now }
      : { version: 0, data: null, updatedBy: null, updatedAt: null },
    snapshots: [],
    suggestions: (seed.suggestions ?? []).map((s, i) => ({ ...clone(s), id: i + 1, updatedAt: s.statusAt ?? s.createdAt, deletedAt: null })),
    votes: (seed.votes ?? []).map((v) => ({ ...clone(v), updatedAt: now, deletedAt: null })),
    edits: (seed.edits ?? []).map((e, i) => ({ ...clone(e), id: i + 1, updatedAt: e.createdAt, revertedAt: null, revertedBy: null, closedAt: null })),
    seq: { snapshot: 0, suggestion: seed.suggestions?.length ?? 0, edit: seed.edits?.length ?? 0 },
  };
}

export function createMockBackend(seed: MockSeed, opts: MockOptions = {}): MockBackend {
  const storage = opts.storage ?? null;
  const key = opts.storageKey ?? 'travel-helper:mockBackend';
  const now = opts.now ?? (() => new Date().toISOString());
  let currentSeed = seed;

  let state: MockState = load() ?? fromSeed(seed, now());

  function load(): MockState | null {
    try {
      const text = storage?.getItem(key);
      return text ? (JSON.parse(text) as MockState) : null;
    } catch {
      return null;
    }
  }
  function save() {
    try {
      storage?.setItem(key, JSON.stringify(state));
    } catch {
      // 無痕模式等情況存不了：只留在記憶體
    }
  }

  /** 每個 API 都經過這裡：延遲、改完存檔、回傳複本（呼叫的人改了也不影響假資料庫） */
  async function call<T>(fn: () => T): Promise<T> {
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
    const out = fn();
    save();
    return clone(out);
  }

  const member = () => state.me;

  function saveItinerary(version: number, data: Itinerary, reason: string | null, by: string): ItineraryDoc {
    const cur = state.itinerary;
    if (version !== cur.version) {
      throw new BackendError(409, 'version-conflict', '別人改過了，請重新載入再改', { current: cur.version });
    }
    const at = now();
    if (cur.data) {
      state.snapshots.push({ id: ++state.seq.snapshot, version: cur.version, reason, createdBy: by, createdAt: at, data: clone(cur.data) });
    }
    state.itinerary = { version: cur.version + 1, data: clone(data), updatedBy: by, updatedAt: at };
    return state.itinerary;
  }

  function findSuggestion(id: number): Suggestion {
    const s = state.suggestions.find((x) => x.id === id);
    if (!s || s.deletedAt) notFound(`沒有建議 #${id}`);
    return s;
  }

  const maxUpdated = (rows: { updatedAt: string }[]) => rows.reduce<string | null>((m, r) => (m === null || r.updatedAt > m ? r.updatedAt : m), null);

  return {
    me: () => call(() => state.members.find((m) => m.id === member()) ?? { id: member(), displayName: member(), pictureUrl: null }),
    members: () => call(() => state.members),
    sync: () =>
      call(() => ({
        itinerary: state.itinerary.version,
        suggestions: maxUpdated(state.suggestions),
        votes: maxUpdated(state.votes),
        edits: maxUpdated(state.edits),
      })),

    getItinerary: () => call(() => state.itinerary),
    putItinerary: (version, data, reason = null) => call(() => saveItinerary(version, data, reason, member())),
    listSnapshots: () =>
      call(() =>
        [...state.snapshots].reverse().map(({ id, version, reason, createdBy, createdAt }) => ({ id, version, reason, createdBy, createdAt })),
      ),
    getSnapshot: (id) =>
      call(() => {
        const s = state.snapshots.find((x) => x.id === id);
        if (!s) notFound(`沒有快照 #${id}`);
        return s;
      }),
    restoreSnapshot: (id, version) =>
      call(() => {
        const s = state.snapshots.find((x) => x.id === id);
        if (!s) notFound(`沒有快照 #${id}`);
        if (version === 0) badRequest('還沒有行程，不能復原');
        return saveItinerary(version, s.data, `復原到快照 #${s.id}（第 ${s.version} 版）`, member());
      }),

    listSuggestions: () => call(() => state.suggestions.filter((s) => !s.deletedAt)),
    createSuggestion: (input) =>
      call(() => {
        const at = now();
        const s: Suggestion = {
          id: ++state.seq.suggestion,
          day: checkDay(input.day),
          placeIds: [...(input.placeIds ?? [])],
          text: checkText(input.text),
          author: member(),
          createdAt: at,
          updatedAt: at,
          status: 'pending',
          statusNote: null,
          statusBy: null,
          statusAt: null,
          adoptedItemIds: null,
          deletedAt: null,
        };
        state.suggestions.push(s);
        return s;
      }),
    updateSuggestion: (id, patch) =>
      call(() => {
        const s = findSuggestion(id);
        if (s.author !== member()) forbidden('只有寫的人能改');
        if (patch.day !== undefined) s.day = checkDay(patch.day);
        if (patch.text !== undefined) s.text = checkText(patch.text);
        if (patch.placeIds !== undefined) s.placeIds = [...patch.placeIds];
        s.updatedAt = now();
        return s;
      }),
    deleteSuggestion: (id) =>
      call(() => {
        const s = findSuggestion(id);
        if (s.author !== member()) forbidden('只有寫的人能刪');
        s.deletedAt = s.updatedAt = now();
      }),
    setSuggestionStatus: (id, input) =>
      call(() => {
        const s = findSuggestion(id);
        const statuses: SuggestionStatus[] = ['pending', 'adopted', 'declined'];
        if (!statuses.includes(input.status)) badRequest('status 要是 pending、adopted、declined 其中之一');
        if (input.note != null && input.note.length > 200) badRequest('note 要是 200 字以內的字串');
        const pending = input.status === 'pending';
        const at = now();
        s.status = input.status;
        s.statusNote = pending ? null : (input.note ?? null);
        s.statusBy = pending ? null : member();
        s.statusAt = pending ? null : at;
        s.adoptedItemIds = input.status === 'adopted' ? [...(input.adoptedItemIds ?? [])] : null;
        s.updatedAt = at;
        return s;
      }),

    listVotes: () => call(() => state.votes.filter((v) => !v.deletedAt)),
    putVote: (placeId, value: VoteValue, note = null) =>
      call(() => {
        if (value !== 'like' && value !== 'dislike') badRequest("value 要是 'like'（❤️）或 'dislike'（👎）");
        if (note != null && note.length > 500) badRequest('note 要是 500 字以內的字串');
        const at = now();
        let v = state.votes.find((x) => x.placeId === placeId && x.memberId === member());
        if (!v) {
          v = { placeId, memberId: member(), value, note, updatedAt: at, deletedAt: null };
          state.votes.push(v);
        } else Object.assign(v, { value, note, updatedAt: at, deletedAt: null });
        return v;
      }),
    deleteVote: (placeId) =>
      call(() => {
        const v = state.votes.find((x) => x.placeId === placeId && x.memberId === member() && !x.deletedAt);
        if (v) v.deletedAt = v.updatedAt = now();
      }),

    listEdits: () => call(() => state.edits),
    revertEdit: (id) =>
      call(() => {
        const e = state.edits.find((x) => x.id === id);
        if (!e) notFound(`沒有修改 #${id}`);
        if (e.author !== member()) forbidden('只有改的人自己能復原');
        if (e.revertedAt) throw new BackendError(409, 'already-reverted', '已經復原過了');
        e.revertedAt = e.updatedAt = now();
        e.revertedBy = member();
        return e;
      }),

    setMe(memberId) {
      state.me = memberId;
      save();
    },
    currentMemberId: () => state.me,
    reset(next = currentSeed) {
      currentSeed = next;
      // 換人的狀態留著，比較好測
      const me = state.me;
      state = fromSeed(next, now());
      if (state.members.some((m) => m.id === me)) state.me = me;
      save();
    },
    simulateOtherEdit(memberId) {
      const cur = state.itinerary;
      if (!cur.data) return;
      const other = memberId ?? state.members.find((m) => m.id !== state.me)?.id ?? 'someone';
      saveItinerary(cur.version, { ...cur.data }, '（假裝）別人改了行程', other);
      save();
    },
  };
}
