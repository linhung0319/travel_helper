// 留言、候選、預約筆記、投票、聊天紀錄、成員、同步。architecture §3.6、§3.8、§6。規則和假後端（web/src/backend/mock.ts）一樣，改了要一起改。
//
// 留言（comments）：target 是地點 ID、某一天 day:<日期>，或整趟 trip
//   GET    /api/comments                    沒刪除的
//   POST   /api/comments                    { target, text, kind? }
//   PATCH  /api/comments/:id                { text }：只有作者能改
//   DELETE /api/comments/:id                軟刪除：只有作者能刪
// 候選（candidates）：某天想排的點
//   GET    /api/candidates                  沒刪除的
//   POST   /api/candidates                  { placeId, day }：同一天同一個點已經有了就回傳那一筆
//   DELETE /api/candidates/:id              軟刪除：誰都能拿掉（拿掉別人加的要理由，由畫面另外留一則 decline 留言）
// 預約筆記（reservations）：同一個 (date, placeId) 只有一筆
//   GET    /api/reservations                全部
//   PUT    /api/reservations                { date, placeId, status, note?, nights? }：整筆取代
// 投票（votes）：一人對一個點一筆（❤️ 就是想去），沒有備註
//   GET    /api/votes?place=&since=         沒收回的（since 時連收回的也回傳）
//   PUT    /api/votes/:placeId              { value: 'like' | 'dislike' }：只能投自己的
//   DELETE /api/votes/:placeId              收回自己的票（軟刪除）
// 其他
//   GET    /api/me、GET /api/members
//   GET    /api/sync                        各種資料最後更新的時間：前端每 30 秒只打這一支，有變才重抓

import { DEFAULT_CONFIG } from '@travel-helper/engine';
import { isAdmin } from '../auth.ts';
import type { Ctx } from '../env.ts';
import { badRequest, forbidden, json, notFound, nowIso, readBody } from '../lib/http.ts';
import { resolveId } from './places.ts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;
const KINDS = new Set(['normal', 'planner', 'decline']);
const RESERVATION_STATUSES = new Set(['pending', 'booked', 'skip']);

function checkText(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) throw badRequest('text 不能是空的');
  if (text.length > MAX_TEXT) throw badRequest(`text 太長（上限 ${MAX_TEXT} 字）`);
  return text;
}

function checkPlaceId(id: unknown): string {
  if (typeof id !== 'string' || !id) throw badRequest('placeId 不能是空的');
  return id;
}

/** 旅程裡的日期 */
function checkTripDay(day: unknown): string {
  const { from, to } = DEFAULT_CONFIG.trip;
  if (typeof day === 'string' && DATE.test(day) && day >= from && day <= to) return day;
  throw badRequest(`day 要是 ${from}～${to} 的日期`);
}

function intParam(text: string, what: string): number {
  const id = Number(text);
  if (!Number.isInteger(id)) throw badRequest(`${what}的 ID 要是整數`);
  return id;
}

// ---- 留言 ----

export interface CommentRow {
  id: number;
  target: string;
  text: string;
  kind: string;
  author: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const commentJson = (r: CommentRow) => ({
  id: r.id,
  target: r.target,
  text: r.text,
  kind: r.kind,
  author: r.author,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export const LIVE_COMMENTS = 'SELECT * FROM comments WHERE deleted_at IS NULL ORDER BY id';

export async function listComments({ db }: Ctx): Promise<Response> {
  const r = await db.prepare(LIVE_COMMENTS).all<CommentRow>();
  return json({ comments: r.results.map(commentJson), now: nowIso() });
}

/** 地點的留言跟著轉址；某一天、整趟不是資料點 */
const resolveTarget = (db: D1Database, target: string) => (target === 'trip' || target.startsWith('day:') ? target : resolveId(db, target));

export async function createComment({ db, req, member }: Ctx): Promise<Response> {
  const b = await readBody(req);
  if (typeof b.target !== 'string' || !b.target) throw badRequest('target 不能是空的');
  const kind = b.kind ?? 'normal';
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw badRequest('kind 要是 normal、planner、decline 其中之一');
  const text = checkText(b.text);
  const now = nowIso();
  const row = await db
    .prepare('INSERT INTO comments (target, text, kind, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(await resolveTarget(db, b.target), text, kind, member.id, now, now)
    .first<CommentRow>();
  return json({ comment: commentJson(row!) }, { status: 201 });
}

async function loadComment(db: D1Database, idText: string): Promise<CommentRow> {
  const id = intParam(idText, '留言');
  const row = await db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first<CommentRow>();
  if (!row || row.deleted_at) throw notFound(`沒有留言 #${id}`);
  return row;
}

export async function updateComment({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await loadComment(db, params.id);
  if (row.author !== member.id) throw forbidden('只有寫的人能改');
  const b = await readBody(req);
  const updated = await db.prepare('UPDATE comments SET text = ?, updated_at = ? WHERE id = ? RETURNING *').bind(checkText(b.text), nowIso(), row.id).first<CommentRow>();
  return json({ comment: commentJson(updated!) });
}

export async function deleteComment({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await loadComment(db, params.id);
  if (row.author !== member.id) throw forbidden('只有寫的人能刪');
  const now = nowIso();
  await db.prepare('UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, row.id).run();
  return json({ ok: true });
}

// ---- 候選 ----

export interface CandidateRow {
  id: number;
  place_id: string;
  day: string;
  added_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const candidateJson = (r: CandidateRow) => ({
  id: r.id,
  placeId: r.place_id,
  day: r.day,
  addedBy: r.added_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export const LIVE_CANDIDATES = 'SELECT * FROM candidates WHERE deleted_at IS NULL ORDER BY id';

export async function listCandidates({ db }: Ctx): Promise<Response> {
  const r = await db.prepare(LIVE_CANDIDATES).all<CandidateRow>();
  return json({ candidates: r.results.map(candidateJson), now: nowIso() });
}

export async function createCandidate({ db, req, member }: Ctx): Promise<Response> {
  const b = await readBody(req);
  const placeId = await resolveId(db, checkPlaceId(b.placeId));
  const day = checkTripDay(b.day);
  const now = nowIso();
  // 同一天同一個點已經有了（包括兩個人同時加）就回傳那一筆
  const added = await db
    .prepare(
      `INSERT INTO candidates (place_id, day, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (place_id, day) WHERE deleted_at IS NULL DO NOTHING RETURNING *`,
    )
    .bind(placeId, day, member.id, now, now)
    .first<CandidateRow>();
  if (added) return json({ candidate: candidateJson(added) }, { status: 201 });
  const old = await db.prepare('SELECT * FROM candidates WHERE place_id = ? AND day = ? AND deleted_at IS NULL').bind(placeId, day).first<CandidateRow>();
  return json({ candidate: candidateJson(old!) });
}

export async function deleteCandidate({ db }: Ctx, params: Record<string, string>): Promise<Response> {
  const id = intParam(params.id, '候選');
  const now = nowIso();
  const r = await db.prepare('UPDATE candidates SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, id).run();
  if (!r.meta.changes) throw notFound(`沒有候選 #${id}`);
  return json({ ok: true });
}

// ---- 預約筆記 ----

export interface ReservationRow {
  date: string;
  place_id: string;
  status: string;
  note: string | null;
  nights: number | null;
  updated_by: string;
  updated_at: string;
}

export const reservationJson = (r: ReservationRow) => ({
  date: r.date,
  placeId: r.place_id,
  status: r.status,
  note: r.note,
  nights: r.nights,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

export const ALL_RESERVATIONS = 'SELECT * FROM reservations ORDER BY date, place_id';

export async function listReservations({ db }: Ctx): Promise<Response> {
  const r = await db.prepare(ALL_RESERVATIONS).all<ReservationRow>();
  return json({ reservations: r.results.map(reservationJson), now: nowIso() });
}

export async function putReservation({ db, req, member }: Ctx): Promise<Response> {
  const b = await readBody(req);
  if (typeof b.date !== 'string' || !DATE.test(b.date)) throw badRequest('date 要是 YYYY-MM-DD');
  const placeId = await resolveId(db, checkPlaceId(b.placeId));
  if (typeof b.status !== 'string' || !RESERVATION_STATUSES.has(b.status)) throw badRequest('status 要是 pending、booked、skip 其中之一');
  const note = b.note ?? null;
  if (note !== null && (typeof note !== 'string' || note.length > MAX_TEXT)) throw badRequest(`note 要是 ${MAX_TEXT} 字以內的文字`);
  const nights = b.nights ?? null;
  if (nights !== null && !(typeof nights === 'number' && Number.isInteger(nights) && nights >= 0)) throw badRequest('nights 要是 0 以上的整數');
  const row = await db
    .prepare(
      `INSERT INTO reservations (date, place_id, status, note, nights, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (date, place_id) DO UPDATE SET status = excluded.status, note = excluded.note, nights = excluded.nights, updated_by = excluded.updated_by, updated_at = excluded.updated_at
       RETURNING *`,
    )
    .bind(b.date, placeId, b.status, (note as string | null)?.trim() || null, nights, member.id, nowIso())
    .first<ReservationRow>();
  return json({ reservation: reservationJson(row!) });
}

// ---- 投票 ----

export interface VoteRow {
  place_id: string;
  member_id: string;
  value: string;
  updated_at: string;
  deleted_at: string | null;
}

export const voteJson = (r: VoteRow) => ({
  placeId: r.place_id,
  memberId: r.member_id,
  value: r.value,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export const LIVE_VOTES = 'SELECT * FROM votes WHERE deleted_at IS NULL ORDER BY updated_at';

export async function listVotes({ db, url }: Ctx): Promise<Response> {
  const where: string[] = [];
  const args: unknown[] = [];
  const place = url.searchParams.get('place');
  const since = url.searchParams.get('since');
  if (place) (where.push('place_id = ?'), args.push(await resolveId(db, place)));
  if (since) (where.push('updated_at >= ?'), args.push(since));
  else where.push('deleted_at IS NULL');
  const r = await db.prepare(`SELECT * FROM votes WHERE ${where.join(' AND ')} ORDER BY updated_at`).bind(...args).all<VoteRow>();
  return json({ votes: r.results.map(voteJson), now: nowIso() });
}

export async function putVote({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const b = await readBody(req);
  if (b.value !== 'like' && b.value !== 'dislike') throw badRequest("value 要是 'like'（❤️）或 'dislike'（👎）");
  const placeId = await resolveId(db, params.placeId);
  const row = await db
    .prepare(
      `INSERT INTO votes (place_id, member_id, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (place_id, member_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL
       RETURNING *`,
    )
    .bind(placeId, member.id, b.value, nowIso())
    .first<VoteRow>();
  return json({ vote: voteJson(row!) });
}

export async function deleteVote({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const placeId = await resolveId(db, params.placeId);
  const now = nowIso();
  await db
    .prepare('UPDATE votes SET deleted_at = ?, updated_at = ? WHERE place_id = ? AND member_id = ? AND deleted_at IS NULL')
    .bind(now, now, placeId, member.id)
    .run();
  return json({ ok: true });
}

// ---- 成員、同步 ----

export async function me({ member, env }: Ctx): Promise<Response> {
  return json({ member, isAdmin: isAdmin(env, member) });
}

export interface MemberRow {
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
}

export const memberJson = (m: MemberRow) => ({ id: m.line_user_id, displayName: m.display_name, pictureUrl: m.picture_url });
export const LIVE_MEMBERS = 'SELECT line_user_id, display_name, picture_url FROM members WHERE disabled_at IS NULL ORDER BY display_name';

export async function listMembers({ db }: Ctx): Promise<Response> {
  const r = await db.prepare(LIVE_MEMBERS).all<MemberRow>();
  return json({ members: r.results.map(memberJson) });
}

/** 同步的查詢：bootstrap 也用同一組 */
export const SYNC_QUERIES = [
  'SELECT MAX(id) AS v FROM imports',
  'SELECT MAX(updated_at) AS v FROM place_edits',
  'SELECT MAX(updated_at) AS v FROM user_places',
  'SELECT version AS v FROM itinerary WHERE id = 1',
  'SELECT MAX(updated_at) AS v FROM votes',
  'SELECT MAX(updated_at) AS v FROM comments',
  'SELECT MAX(updated_at) AS v FROM candidates',
  'SELECT MAX(updated_at) AS v FROM reservations',
];

export function syncState(results: D1Result<Record<string, unknown>>[]) {
  const [imp, edits, users, itin, votes, comments, candidates, reservations] = results;
  const one = (r: D1Result<Record<string, unknown>>) => r.results[0] ?? {};
  const tag = (r: D1Result<Record<string, unknown>>) => (one(r).v as string | null | undefined) ?? null;
  return {
    places: one(imp).v ?? 0,
    edits: tag(edits),
    userPlaces: tag(users),
    itinerary: one(itin).v ?? 0,
    votes: tag(votes),
    comments: tag(comments),
    candidates: tag(candidates),
    reservations: tag(reservations),
    now: nowIso(),
  };
}

/**
 * 前端輪詢用：一次回傳各種資料的「版本」。和上次不一樣才去抓那一種資料。
 * - 只打一支 API：15 人每 30 秒輪詢，全部分開打的話一天會超過 Workers 免費方案的 10 萬次請求（architecture §4）。
 * - 只用 MAX(updated_at)（有索引，每個只讀 1 列）；不用 COUNT(*)：D1 照掃過的列數算額度，每次輪詢都會掃整張表。
 *   所以刪除一律是軟刪除（deleted_at ＋ 更新 updated_at）；預約筆記不刪，只會整筆取代。
 */
export async function sync({ db }: Ctx): Promise<Response> {
  return json(syncState(await db.batch<Record<string, unknown>>(SYNC_QUERIES.map((q) => db.prepare(q)))));
}
