// 後端的介面（T15m）：確定的行程、快照、建議、投票、修改紀錄、成員。
// 形狀照 T24 的資料 API（architecture §4「資料 API」、worker/src/api/）：T15m 先用假後端（mock.ts），
// T15 換成呼叫 API 的實作，畫面的程式不改。

import type { Itinerary } from '@travel-helper/engine/types';

export interface Member {
  id: string;
  displayName: string;
  pictureUrl: string | null;
}

/** GET /api/itinerary：還沒有行程時 version 0、data null */
export interface ItineraryDoc {
  version: number;
  data: Itinerary | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface SnapshotMeta {
  id: number;
  /** 存快照時那份行程的 version */
  version: number;
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Snapshot extends SnapshotMeta {
  data: Itinerary;
}

export type SuggestionStatus = 'pending' | 'adopted' | 'declined';

export interface Suggestion {
  id: number;
  /** 日期（YYYY-MM-DD）或 'trip'（整趟） */
  day: string;
  placeIds: string[];
  text: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  status: SuggestionStatus;
  statusNote: string | null;
  statusBy: string | null;
  statusAt: string | null;
  /** 採用時對應的行程項目 */
  adoptedItemIds: string[] | null;
  deletedAt: string | null;
}

export type VoteValue = 'like' | 'dislike';

export interface Vote {
  placeId: string;
  memberId: string;
  value: VoteValue;
  note: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

/** 資料點的一筆修改（GET /api/edits） */
export interface PlaceEdit {
  id: number;
  placeId: string;
  /** `hours`、`group.maxSeats` */
  fieldPath: string;
  value: unknown;
  /** 修改時的預設值；baseMissing＝預設資料沒有這個欄位 */
  baseValue: unknown;
  baseMissing: boolean;
  note: string | null;
  author: string;
  createdAt: string;
  updatedAt: string;
  revertedAt: string | null;
  revertedBy: string | null;
  closedAt: string | null;
}

/** GET /api/sync：各種資料的版本，變了才重抓那一種 */
export interface SyncState {
  itinerary: number;
  suggestions: string | null;
  votes: string | null;
  edits: string | null;
}

/** API 的錯誤：`{ error, message, details? }` 加上 HTTP 狀態 */
export class BackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 行程的 version 和資料庫的不一樣（別人先改過了） */
export const isVersionConflict = (e: unknown): e is BackendError => e instanceof BackendError && e.status === 409;

export interface Backend {
  /** 目前登入的人 */
  me(): Promise<Member>;
  members(): Promise<Member[]>;
  sync(): Promise<SyncState>;

  getItinerary(): Promise<ItineraryDoc>;
  /** version 要和資料庫的一樣，否則丟 409；改之前自動存快照 */
  putItinerary(version: number, data: Itinerary, reason?: string | null): Promise<ItineraryDoc>;
  listSnapshots(): Promise<SnapshotMeta[]>;
  getSnapshot(id: number): Promise<Snapshot>;
  /** 復原也是一次修改，會再存快照 */
  restoreSnapshot(id: number, version: number): Promise<ItineraryDoc>;

  /** 沒刪除的建議 */
  listSuggestions(): Promise<Suggestion[]>;
  createSuggestion(input: { day: string; text: string; placeIds?: string[] }): Promise<Suggestion>;
  /** 只有寫的人能改（403） */
  updateSuggestion(id: number, patch: { day?: string; text?: string; placeIds?: string[] }): Promise<Suggestion>;
  /** 只有寫的人能刪（403） */
  deleteSuggestion(id: number): Promise<void>;
  setSuggestionStatus(id: number, input: { status: SuggestionStatus; note?: string | null; adoptedItemIds?: string[] }): Promise<Suggestion>;

  /** 沒收回的票 */
  listVotes(): Promise<Vote[]>;
  putVote(placeId: string, value: VoteValue, note?: string | null): Promise<Vote>;
  deleteVote(placeId: string): Promise<void>;

  /** 修改紀錄（含已復原的） */
  listEdits(): Promise<PlaceEdit[]>;
  /** 只有改的人自己能復原（403） */
  revertEdit(id: number): Promise<PlaceEdit>;
}
