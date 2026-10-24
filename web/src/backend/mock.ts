// 假後端（T15m）：規則照 T24 的 Worker（worker/src/api/；留言、候選是新的，T15 再同步過去），資料存在記憶體，有 storage 時也存進 localStorage。
// 只在 dev server 用（backend/index.ts）；Node 的測試不給 storage、不延遲。

import type { Itinerary } from '@travel-helper/engine/types';
import { DEFAULT_CONFIG } from '@travel-helper/engine';
import {
  BackendError,
  type Backend,
  type Candidate,
  type Comment,
  type CommentKind,
  type ItineraryDoc,
  type Member,
  type PlaceEdit,
  type Snapshot,
  type Vote,
  type VoteValue,
} from './types.ts';

/** 假後端的種子資料（dev-fixtures/seed.ts） */
export interface MockSeed {
  members: Member[];
  /** 一開始登入的人 */
  me: string;
  itinerary: Itinerary | null;
  /** updatedAt 不給時用建立假後端的時間 */
  votes?: (Omit<Vote, 'updatedAt' | 'deletedAt'> & { updatedAt?: string })[];
  comments?: Omit<Comment, 'id' | 'updatedAt' | 'deletedAt'>[];
  candidates?: Omit<Candidate, 'id' | 'updatedAt' | 'deletedAt'>[];
  edits?: Omit<PlaceEdit, 'id' | 'updatedAt' | 'revertedAt' | 'revertedBy' | 'closedAt'>[];
}

interface MockState {
  members: Member[];
  me: string;
  itinerary: ItineraryDoc;
  snapshots: Snapshot[];
  votes: Vote[];
  comments: Comment[];
  candidates: Candidate[];
  edits: PlaceEdit[];
  seq: { snapshot: number; comment: number; candidate: number; edit: number };
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

const MAX_TEXT = 500;
const KINDS: CommentKind[] = ['normal', 'planner', 'decline'];
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

/** 旅程裡的日期 */
function checkDay(day: unknown): string {
  const { from, to } = DEFAULT_CONFIG.trip;
  if (typeof day === 'string' && DATE.test(day) && day >= from && day <= to) return day;
  return badRequest(`day 要是 ${from}～${to} 的日期`);
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
    votes: (seed.votes ?? []).map((v) => ({ ...clone(v), updatedAt: v.updatedAt ?? now, deletedAt: null })),
    comments: (seed.comments ?? []).map((x, i) => ({ ...clone(x), id: i + 1, updatedAt: x.createdAt, deletedAt: null })),
    candidates: (seed.candidates ?? []).map((x, i) => ({ ...clone(x), id: i + 1, updatedAt: x.createdAt, deletedAt: null })),
    edits: (seed.edits ?? []).map((e, i) => ({ ...clone(e), id: i + 1, updatedAt: e.createdAt, revertedAt: null, revertedBy: null, closedAt: null })),
    seq: { snapshot: 0, comment: seed.comments?.length ?? 0, candidate: seed.candidates?.length ?? 0, edit: seed.edits?.length ?? 0 },
  };
}

export function createMockBackend(seed: MockSeed, opts: MockOptions = {}): MockBackend {
  const storage = opts.storage ?? null;
  // v3：2026-10-24 建議換成留言、候選，舊的存檔讀不進來
  const key = opts.storageKey ?? 'travel-helper:mockBackend:v3';
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

  function findComment(id: number): Comment {
    const x = state.comments.find((c) => c.id === id);
    if (!x || x.deletedAt) notFound(`沒有留言 #${id}`);
    return x;
  }
  function mine<T extends { author: string }>(x: T, what: string): T {
    if (x.author !== member()) forbidden(`只有寫的人能${what}`);
    return x;
  }

  const maxUpdated = (rows: { updatedAt: string }[]) => rows.reduce<string | null>((m, r) => (m === null || r.updatedAt > m ? r.updatedAt : m), null);

  return {
    me: () => call(() => state.members.find((m) => m.id === member()) ?? { id: member(), displayName: member(), pictureUrl: null }),
    members: () => call(() => state.members),
    sync: () =>
      call(() => ({
        itinerary: state.itinerary.version,
        votes: maxUpdated(state.votes),
        comments: maxUpdated(state.comments),
        candidates: maxUpdated(state.candidates),
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

    listVotes: () => call(() => state.votes.filter((v) => !v.deletedAt)),
    putVote: (placeId, value: VoteValue) =>
      call(() => {
        if (value !== 'like' && value !== 'dislike') badRequest("value 要是 'like'（❤️）或 'dislike'（👎）");
        const at = now();
        let v = state.votes.find((x) => x.placeId === placeId && x.memberId === member());
        if (!v) {
          v = { placeId, memberId: member(), value, updatedAt: at, deletedAt: null };
          state.votes.push(v);
        } else Object.assign(v, { value, updatedAt: at, deletedAt: null });
        return v;
      }),
    deleteVote: (placeId) =>
      call(() => {
        const v = state.votes.find((x) => x.placeId === placeId && x.memberId === member() && !x.deletedAt);
        if (v) v.deletedAt = v.updatedAt = now();
      }),

    listComments: () => call(() => state.comments.filter((x) => !x.deletedAt)),
    createComment: ({ target, text, kind = 'normal' }) =>
      call(() => {
        if (typeof target !== 'string' || !target) badRequest('target 不能是空的');
        if (!KINDS.includes(kind)) badRequest(`kind 要是 ${KINDS.join('、')} 其中之一`);
        const at = now();
        const x: Comment = { id: ++state.seq.comment, target, text: checkText(text), kind, author: member(), createdAt: at, updatedAt: at, deletedAt: null };
        state.comments.push(x);
        return x;
      }),
    updateComment: (id, text) =>
      call(() => {
        const x = mine(findComment(id), '改');
        x.text = checkText(text);
        x.updatedAt = now();
        return x;
      }),
    deleteComment: (id) =>
      call(() => {
        const x = mine(findComment(id), '刪');
        x.deletedAt = x.updatedAt = now();
      }),

    listCandidates: () => call(() => state.candidates.filter((x) => !x.deletedAt)),
    createCandidate: ({ placeId, day }) =>
      call(() => {
        if (typeof placeId !== 'string' || !placeId) badRequest('placeId 不能是空的');
        const d = checkDay(day);
        const old = state.candidates.find((x) => !x.deletedAt && x.placeId === placeId && x.day === d);
        if (old) return old;
        const at = now();
        const x: Candidate = { id: ++state.seq.candidate, placeId, day: d, addedBy: member(), createdAt: at, updatedAt: at, deletedAt: null };
        state.candidates.push(x);
        return x;
      }),
    deleteCandidate: (id) =>
      call(() => {
        const x = state.candidates.find((c) => c.id === id);
        if (!x || x.deletedAt) notFound(`沒有候選 #${id}`);
        x.deletedAt = x.updatedAt = now();
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
