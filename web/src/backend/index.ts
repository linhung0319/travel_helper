// 目前用的後端（T15m）。dev server 用假後端（mock.ts＋dev-fixtures/seed.ts）；
// 正式 build 不帶假資料，先用「還沒接上」的版本（只能看、不能改），T15 換成呼叫 T24、T25 API 的實作。

import { BackendError, RESOLVE_OFFLINE_MESSAGE, type Backend } from './types.ts';
import type { MockBackend } from './mock.ts';

const offline: Backend = (() => {
  const no = () => Promise.reject(new BackendError(503, 'offline', '還沒接上後端（T15 串接）'));
  return {
    me: async () => ({ id: 'guest', displayName: '訪客', pictureUrl: null }),
    members: async () => [],
    sync: async () => ({ itinerary: 0, votes: null, comments: null, candidates: null, reservations: null, edits: null, userPlaces: null }),
    getItinerary: async () => ({ version: 0, data: null, updatedBy: null, updatedAt: null }),
    putItinerary: no,
    listSnapshots: async () => [],
    getSnapshot: no,
    restoreSnapshot: no,
    listVotes: async () => [],
    putVote: no,
    deleteVote: no,
    listComments: async () => [],
    createComment: no,
    updateComment: no,
    deleteComment: no,
    listCandidates: async () => [],
    createCandidate: no,
    deleteCandidate: no,
    listReservations: async () => [],
    putReservation: no,
    listEdits: async () => [],
    revertEdit: no,
    listUserPlaces: async () => [],
    createUserPlace: no,
    updateUserPlace: no,
    deleteUserPlace: no,
    resolveMapLink: () => Promise.reject(new BackendError(503, 'offline', RESOLVE_OFFLINE_MESSAGE)),
  };
})();

let current: Backend = offline;
let mock: MockBackend | null = null;

/** 啟動時呼叫一次。直接用 import.meta.env.DEV 判斷，build 時整段會被拿掉，假資料不會出現在 dist/ */
export async function initBackend(): Promise<Backend> {
  if (import.meta.env.DEV) {
    const [{ createMockBackend }, { devSeed }] = await Promise.all([import('./mock.ts'), import('../dev-fixtures/seed.ts')]);
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    mock = createMockBackend(devSeed(), { storage, latencyMs: 150 });
    current = mock;
  }
  return current;
}

export function backend(): Backend {
  return current;
}

/** dev 選單用：假後端（正式 build 是 null） */
export function mockBackend(): MockBackend | null {
  return mock;
}

/** 測試用：直接換掉 */
export function setBackend(b: Backend) {
  current = b;
}
