// 後端的介面（T15m）：確定的行程、快照、投票（❤️ 就是想去）、留言、候選、修改紀錄、成員。
// 形狀照 T24 的資料 API（architecture §4「資料 API」、worker/src/api/）：T15m 先用假後端（mock.ts），
// T15 換成呼叫 API 的實作，畫面的程式不改。留言、候選是 2026-10-24 改的（取代建議），T15 要同步到 Worker。

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

export type VoteValue = 'like' | 'dislike';

/** ❤️ 就是「想去」（進想去分頁），👎 是不想去；一人一點只有一個狀態 */
export interface Vote {
  /** 地點 ID */
  placeId: string;
  memberId: string;
  value: VoteValue;
  updatedAt: string;
  deletedAt: string | null;
}

/** normal：一般留言；planner：編輯中留的（顯示〔規劃〕）；decline：不採用的理由 */
export type CommentKind = 'normal' | 'planner' | 'decline';

/** 地點、某一天或整趟旅程的留言（只有一層，不能回覆留言） */
export interface Comment {
  id: number;
  /** 地點 ID，某一天 `day:<日期>`（dayTarget），或整趟 `trip`（TRIP_TARGET） */
  target: string;
  text: string;
  kind: CommentKind;
  author: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** 某天的候選：在想去按「加到某天」；排進行程或被拿掉後刪除 */
export interface Candidate {
  id: number;
  placeId: string;
  /** YYYY-MM-DD，旅程裡的日期 */
  day: string;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** 某一天的留言的 target */
export const dayTarget = (date: string) => `day:${date}`;

/** 整趟旅程的留言的 target（行程分頁最下面的留言） */
export const TRIP_TARGET = 'trip';

export type ReservationStatus = 'pending' | 'booked' | 'skip';

/** 預約筆記：某天某個點的訂位狀態（同一個 (date, placeId) 只有一筆）；住宿的 date 是入住那晚 */
export interface Reservation {
  date: string;
  placeId: string;
  status: ReservationStatus;
  note: string | null;
  /** 住宿：存下訂時的晚數，用來標「晚數變了」 */
  nights: number | null;
  updatedBy: string;
  updatedAt: string;
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
  votes: string | null;
  comments: string | null;
  candidates: string | null;
  reservations: string | null;
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

  /** 沒收回的票 */
  listVotes(): Promise<Vote[]>;
  putVote(placeId: string, value: VoteValue): Promise<Vote>;
  deleteVote(placeId: string): Promise<void>;

  /** 沒刪除的留言 */
  listComments(): Promise<Comment[]>;
  createComment(input: { target: string; text: string; kind?: CommentKind }): Promise<Comment>;
  /** 只有作者能改、能刪（403） */
  updateComment(id: number, text: string): Promise<Comment>;
  deleteComment(id: number): Promise<void>;

  /** 沒刪除的候選 */
  listCandidates(): Promise<Candidate[]>;
  /** 同一天同一個點已經有了就回傳那一筆；day 要是旅程裡的日期 */
  createCandidate(input: { placeId: string; day: string }): Promise<Candidate>;
  /** 誰都能拿掉（拿掉別人加的要寫理由，由畫面另外留一則不採用的留言） */
  deleteCandidate(id: number): Promise<void>;

  /** 預約筆記 */
  listReservations(): Promise<Reservation[]>;
  /** 同一個 (date, placeId) 覆蓋 */
  putReservation(input: { date: string; placeId: string; status: ReservationStatus; note?: string | null; nights?: number | null }): Promise<Reservation>;

  /** 修改紀錄（含已復原的） */
  listEdits(): Promise<PlaceEdit[]>;
  /** 只有改的人自己能復原（403） */
  revertEdit(id: number): Promise<PlaceEdit>;
}
