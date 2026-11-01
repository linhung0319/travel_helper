// GET /api/bootstrap：啟動時一次拿齊共用資料（T15，architecture §4）。
// 一個 db.batch 就好，不用打 11 支 API（每支都要查一次登入）。行程直接接字串，不在 Worker 裡解開。

import type { Ctx } from '../env.ts';
import { isAdmin } from '../auth.ts';
import { rawJson } from '../lib/http.ts';
import { EDIT_COLUMNS, editToJson, type FullEditRow } from './places.ts';
import { itineraryMeta, SNAPSHOT_LIST, snapshotMetaJson, type ItinRow, type SnapshotMetaRow } from './itinerary.ts';
import {
  ALL_RESERVATIONS,
  candidateJson,
  commentJson,
  LIVE_CANDIDATES,
  LIVE_COMMENTS,
  LIVE_MEMBERS,
  LIVE_VOTES,
  memberJson,
  reservationJson,
  SYNC_QUERIES,
  syncState,
  voteJson,
  type CandidateRow,
  type CommentRow,
  type MemberRow,
  type ReservationRow,
  type VoteRow,
} from './social.ts';
import { ALL_USER_PLACES, userPlaceJson, type UserPlaceRow } from './user-places.ts';

export async function bootstrap({ db, member, env }: Ctx): Promise<Response> {
  const q = (sql: string) => db.prepare(sql);
  const results = await db.batch<Record<string, unknown>>([
    q(LIVE_MEMBERS),
    q('SELECT data, version, updated_by, updated_at FROM itinerary WHERE id = 1'),
    q(SNAPSHOT_LIST),
    q(LIVE_VOTES),
    q(LIVE_COMMENTS),
    q(LIVE_CANDIDATES),
    q(ALL_RESERVATIONS),
    q(`SELECT ${EDIT_COLUMNS} FROM place_edits ORDER BY id`),
    q(ALL_USER_PLACES),
    ...SYNC_QUERIES.map(q),
  ]);
  const rows = <T>(i: number) => results[i].results as unknown as T[];
  const itin = rows<ItinRow>(1)[0] ?? null;
  const rest = {
    me: member,
    isAdmin: isAdmin(env, member),
    members: rows<MemberRow>(0).map(memberJson),
    snapshots: rows<SnapshotMetaRow>(2).map(snapshotMetaJson),
    votes: rows<VoteRow>(3).map(voteJson),
    comments: rows<CommentRow>(4).map(commentJson),
    candidates: rows<CandidateRow>(5).map(candidateJson),
    reservations: rows<ReservationRow>(6).map(reservationJson),
    edits: rows<FullEditRow>(7).map(editToJson),
    userPlaces: rows<UserPlaceRow>(8).map(userPlaceJson),
    sync: syncState(results.slice(9)),
  };
  const body = `{"itinerary":{${itineraryMeta(itin)},"data":${itin?.data ?? 'null'}},${JSON.stringify(rest).slice(1)}`;
  return rawJson(body, { headers: { 'cache-control': 'no-store' } });
}
