// 真的後端（T15）：呼叫 Worker 的 API（architecture §4）。形狀和規則同假後端（mock.ts），改了要一起改。

import type { Itinerary } from '@travel-helper/engine/types';
import { upgradeItinerary } from '@travel-helper/engine';
import { api } from './http.ts';
import type { Backend, Bootstrap, Candidate, Comment, ItineraryDoc, Member, PlaceEdit, Reservation, Snapshot, SnapshotMeta, SyncState, UserPlace, Vote } from './types.ts';

/** 舊存檔的 meal、dining 轉成 tags（同假後端讀存檔時） */
const upgradeDoc = (doc: ItineraryDoc): ItineraryDoc => (doc.data ? { ...doc, data: upgradeItinerary(doc.data) } : doc);

const putDoc = (version: number, data: Itinerary, reason: string | null) => api<ItineraryDoc>('PUT', '/api/itinerary', { version, data, reason }).then(upgradeDoc);
const seg = encodeURIComponent;

export const apiBackend: Backend = {
  me: () => api<{ member: Member }>('GET', '/api/me').then((r) => r.member),
  members: () => api<{ members: Member[] }>('GET', '/api/members').then((r) => r.members),
  sync: () => api<SyncState>('GET', '/api/sync'),
  bootstrap: () => api<Bootstrap>('GET', '/api/bootstrap').then((d) => ({ ...d, itinerary: upgradeDoc(d.itinerary) })),

  getItinerary: () => api<ItineraryDoc>('GET', '/api/itinerary').then(upgradeDoc),
  putItinerary: (version, data, reason = null) => putDoc(version, data, reason),
  listSnapshots: () => api<{ snapshots: SnapshotMeta[] }>('GET', '/api/itinerary/snapshots').then((r) => r.snapshots),
  getSnapshot: (id) => api<Snapshot>('GET', `/api/itinerary/snapshots/${id}`).then((s) => ({ ...s, data: upgradeItinerary(s.data) })),
  restoreSnapshot: (id, version) => api<ItineraryDoc>('POST', `/api/itinerary/snapshots/${id}/restore`, { version }).then(upgradeDoc),

  listVotes: () => api<{ votes: Vote[] }>('GET', '/api/votes').then((r) => r.votes),
  putVote: (placeId, value) => api<{ vote: Vote }>('PUT', `/api/votes/${seg(placeId)}`, { value }).then((r) => r.vote),
  deleteVote: async (placeId) => {
    await api('DELETE', `/api/votes/${seg(placeId)}`);
  },

  listComments: () => api<{ comments: Comment[] }>('GET', '/api/comments').then((r) => r.comments),
  createComment: (input) => api<{ comment: Comment }>('POST', '/api/comments', input).then((r) => r.comment),
  updateComment: (id, text) => api<{ comment: Comment }>('PATCH', `/api/comments/${id}`, { text }).then((r) => r.comment),
  deleteComment: async (id) => {
    await api('DELETE', `/api/comments/${id}`);
  },

  listCandidates: () => api<{ candidates: Candidate[] }>('GET', '/api/candidates').then((r) => r.candidates),
  createCandidate: (input) => api<{ candidate: Candidate }>('POST', '/api/candidates', input).then((r) => r.candidate),
  deleteCandidate: async (id) => {
    await api('DELETE', `/api/candidates/${id}`);
  },

  listReservations: () => api<{ reservations: Reservation[] }>('GET', '/api/reservations').then((r) => r.reservations),
  putReservation: (input) => api<{ reservation: Reservation }>('PUT', '/api/reservations', input).then((r) => r.reservation),

  listEdits: () => api<{ edits: PlaceEdit[] }>('GET', '/api/edits').then((r) => r.edits),
  // base 只有假後端用：Worker 自己查預設值
  createEdit: (input) => api<{ edit: PlaceEdit }>('POST', '/api/edits', input).then((r) => r.edit),
  revertEdit: (id) => api<{ edit: PlaceEdit }>('POST', `/api/edits/${id}/revert`).then((r) => r.edit),

  listUserPlaces: () => api<{ userPlaces: UserPlace[] }>('GET', '/api/user-places').then((r) => r.userPlaces),
  createUserPlace: (type, data) => api<{ userPlace: UserPlace }>('POST', '/api/user-places', { type, data }).then((r) => r.userPlace),
  updateUserPlace: (id, data, type) => api<{ userPlace: UserPlace }>('PATCH', `/api/user-places/${seg(id)}`, type === undefined ? { data } : { data, type }).then((r) => r.userPlace),
  deleteUserPlace: (id) => api<{ userPlace: UserPlace }>('DELETE', `/api/user-places/${seg(id)}`).then((r) => r.userPlace),
  resolveMapLink: (url) => api<{ url: string }>('GET', `/api/resolve-map-link?url=${seg(url)}`).then((r) => r.url),
};
