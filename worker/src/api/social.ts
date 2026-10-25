// 建議、投票、聊天紀錄、成員、同步。architecture §3.6、§3.8、§6；interaction-design §6、§9。
//
// 建議（suggestions）
//   GET    /api/suggestions?day=&since=     沒刪除的（since 時連刪除的也回傳，前端才知道要拿掉）
//   POST   /api/suggestions                 { day, text, placeIds? }
//   PATCH  /api/suggestions/:id             { day?, text?, placeIds? }：只有寫的人能改
//   DELETE /api/suggestions/:id             軟刪除：只有寫的人能刪
//   PATCH  /api/suggestions/:id/status      { status, note?, adoptedItemIds? }：規劃模式的人標狀態（Worker 只檢查有登入）
// 投票（votes）：一人對一個點一筆
//   GET    /api/votes?place=&since=         沒收回的（since 時連收回的也回傳）
//   PUT    /api/votes/:placeId              { value: 'like' | 'dislike', note? }：只能投自己的
//   DELETE /api/votes/:placeId              收回自己的票（軟刪除）
// 聊天紀錄（chat_messages）：只回傳自己的
//   GET    /api/chats                       自己的對話清單
//   GET    /api/chats/:conversationId       一個對話的訊息
//   POST   /api/chats/:conversationId       { role, content }
//   DELETE /api/chats/:conversationId
// 其他
//   GET    /api/me、GET /api/members
//   GET    /api/sync                        各種資料最後更新的時間：前端每 30 秒只打這一支，有變才重抓

import { isAdmin } from '../auth.ts';
import type { Ctx } from '../env.ts';
import { badRequest, forbidden, json, notFound, nowIso, readBody } from '../lib/http.ts';
import { resolveId } from './places.ts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 4000;

// ---- 建議 ----

interface SuggestionRow {
  id: number;
  day: string;
  place_ids: string;
  text: string;
  author: string;
  created_at: string;
  updated_at: string;
  status: string;
  status_note: string | null;
  status_by: string | null;
  status_at: string | null;
  adopted_item_ids: string | null;
  deleted_at: string | null;
}

const suggestionJson = (r: SuggestionRow) => ({
  id: r.id,
  day: r.day,
  placeIds: JSON.parse(r.place_ids),
  text: r.text,
  author: r.author,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  status: r.status,
  statusNote: r.status_note,
  statusBy: r.status_by,
  statusAt: r.status_at,
  adoptedItemIds: r.adopted_item_ids === null ? null : JSON.parse(r.adopted_item_ids),
  deletedAt: r.deleted_at,
});

function checkDay(day: unknown): string {
  if (day === 'trip' || (typeof day === 'string' && DATE.test(day))) return day as string;
  throw badRequest("day 要是 'YYYY-MM-DD' 或 'trip'（整趟）");
}

function checkText(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) throw badRequest('text 不能是空的');
  if (text.length > MAX_TEXT) throw badRequest(`text 太長（上限 ${MAX_TEXT} 字）`);
  return text;
}

function checkIdList(x: unknown, name: string): string[] {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x) || !x.every((s) => typeof s === 'string') || x.length > 50) throw badRequest(`${name} 要是字串陣列`);
  return x as string[];
}

export async function listSuggestions({ db, url }: Ctx): Promise<Response> {
  const where: string[] = [];
  const args: unknown[] = [];
  const day = url.searchParams.get('day');
  const since = url.searchParams.get('since');
  if (day) (where.push('day = ?'), args.push(day));
  if (since) (where.push('updated_at >= ?'), args.push(since));
  else where.push('deleted_at IS NULL');
  const r = await db.prepare(`SELECT * FROM suggestions WHERE ${where.join(' AND ')} ORDER BY id`).bind(...args).all<SuggestionRow>();
  return json({ suggestions: r.results.map(suggestionJson), now: nowIso() });
}

export async function createSuggestion({ db, req, member }: Ctx): Promise<Response> {
  const b = await readBody(req);
  const now = nowIso();
  const row = await db
    .prepare('INSERT INTO suggestions (day, place_ids, text, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(checkDay(b.day), JSON.stringify(checkIdList(b.placeIds, 'placeIds')), checkText(b.text), member.id, now, now)
    .first<SuggestionRow>();
  return json({ suggestion: suggestionJson(row!) }, { status: 201 });
}

async function loadSuggestion(db: D1Database, idText: string): Promise<SuggestionRow> {
  const id = Number(idText);
  if (!Number.isInteger(id)) throw badRequest('建議的 ID 要是整數');
  const row = await db.prepare('SELECT * FROM suggestions WHERE id = ?').bind(id).first<SuggestionRow>();
  if (!row || row.deleted_at) throw notFound(`沒有建議 #${id}`);
  return row;
}

export async function updateSuggestion({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await loadSuggestion(db, params.id);
  if (row.author !== member.id) throw forbidden('只有寫的人能改');
  const b = await readBody(req);
  const day = b.day === undefined ? row.day : checkDay(b.day);
  const text = b.text === undefined ? row.text : checkText(b.text);
  const placeIds = b.placeIds === undefined ? row.place_ids : JSON.stringify(checkIdList(b.placeIds, 'placeIds'));
  const updated = await db
    .prepare('UPDATE suggestions SET day = ?, text = ?, place_ids = ?, updated_at = ? WHERE id = ? RETURNING *')
    .bind(day, text, placeIds, nowIso(), row.id)
    .first<SuggestionRow>();
  return json({ suggestion: suggestionJson(updated!) });
}

export async function deleteSuggestion({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await loadSuggestion(db, params.id);
  if (row.author !== member.id) throw forbidden('只有寫的人能刪');
  const now = nowIso();
  const updated = await db.prepare('UPDATE suggestions SET deleted_at = ?, updated_at = ? WHERE id = ? RETURNING *').bind(now, now, row.id).first<SuggestionRow>();
  return json({ suggestion: suggestionJson(updated!) });
}

const STATUSES = new Set(['pending', 'adopted', 'declined']);

export async function setSuggestionStatus({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await loadSuggestion(db, params.id);
  const b = await readBody(req);
  if (typeof b.status !== 'string' || !STATUSES.has(b.status)) throw badRequest('status 要是 pending、adopted、declined 其中之一');
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 200)) throw badRequest('note 要是 200 字以內的字串');
  const adopted = b.status === 'adopted' ? JSON.stringify(checkIdList(b.adoptedItemIds, 'adoptedItemIds')) : null;
  const now = nowIso();
  const pending = b.status === 'pending';
  const updated = await db
    .prepare('UPDATE suggestions SET status = ?, status_note = ?, status_by = ?, status_at = ?, adopted_item_ids = ?, updated_at = ? WHERE id = ? RETURNING *')
    .bind(b.status, pending ? null : ((b.note as string | undefined) ?? null), pending ? null : member.id, pending ? null : now, adopted, now, row.id)
    .first<SuggestionRow>();
  return json({ suggestion: suggestionJson(updated!) });
}

// ---- 投票 ----

interface VoteRow {
  place_id: string;
  member_id: string;
  value: string;
  note: string | null;
  updated_at: string;
  deleted_at: string | null;
}

const voteJson = (r: VoteRow) => ({
  placeId: r.place_id,
  memberId: r.member_id,
  value: r.value,
  note: r.note,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

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
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 500)) throw badRequest('note 要是 500 字以內的字串');
  const placeId = await resolveId(db, params.placeId);
  const row = await db
    .prepare(
      `INSERT INTO votes (place_id, member_id, value, note, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (place_id, member_id) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at, deleted_at = NULL
       RETURNING *`,
    )
    .bind(placeId, member.id, b.value, (b.note as string | undefined) ?? null, nowIso())
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

// ---- 聊天紀錄 ----

const CONVERSATION = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_CONTENT = 512 * 1024;

function conversationId(params: Record<string, string>): string {
  if (!CONVERSATION.test(params.conversationId)) throw badRequest('對話 ID 只能用英數字、- 和 _（64 字以內）');
  return params.conversationId;
}

export async function listConversations({ db, member }: Ctx): Promise<Response> {
  const r = await db
    .prepare(
      `SELECT conversation_id, COUNT(*) AS messages, MIN(created_at) AS started_at, MAX(created_at) AS last_at
       FROM chat_messages WHERE member_id = ? GROUP BY conversation_id ORDER BY last_at DESC`,
    )
    .bind(member.id)
    .all<{ conversation_id: string; messages: number; started_at: string; last_at: string }>();
  return json({
    conversations: r.results.map((c) => ({ id: c.conversation_id, messages: c.messages, startedAt: c.started_at, lastAt: c.last_at })),
  });
}

export async function getConversation({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const r = await db
    .prepare('SELECT id, role, content, created_at FROM chat_messages WHERE member_id = ? AND conversation_id = ? ORDER BY id')
    .bind(member.id, conversationId(params))
    .all<{ id: number; role: string; content: string; created_at: string }>();
  return json({ messages: r.results.map((m) => ({ id: m.id, role: m.role, content: JSON.parse(m.content), createdAt: m.created_at })) });
}

export async function appendMessage({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const conv = conversationId(params);
  const b = await readBody(req, MAX_CONTENT * 2);
  if (b.role !== 'user' && b.role !== 'assistant') throw badRequest("role 要是 'user' 或 'assistant'");
  if (b.content === undefined) throw badRequest('缺少 content');
  const content = JSON.stringify(b.content);
  if (content.length > MAX_CONTENT) throw badRequest('content 太大');
  const row = await db
    .prepare('INSERT INTO chat_messages (member_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, created_at')
    .bind(member.id, conv, b.role, content, nowIso())
    .first<{ id: number; created_at: string }>();
  return json({ message: { id: row!.id, role: b.role, content: b.content, createdAt: row!.created_at } }, { status: 201 });
}

export async function deleteConversation({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const r = await db.prepare('DELETE FROM chat_messages WHERE member_id = ? AND conversation_id = ?').bind(member.id, conversationId(params)).run();
  return json({ deleted: r.meta.changes });
}

// ---- 成員、同步 ----

export async function me({ member, env }: Ctx): Promise<Response> {
  return json({ member, isAdmin: isAdmin(env, member) });
}

export async function listMembers({ db }: Ctx): Promise<Response> {
  const r = await db
    .prepare('SELECT line_user_id, display_name, picture_url FROM members WHERE disabled_at IS NULL ORDER BY display_name')
    .all<{ line_user_id: string; display_name: string; picture_url: string | null }>();
  return json({ members: r.results.map((m) => ({ id: m.line_user_id, displayName: m.display_name, pictureUrl: m.picture_url })) });
}

/**
 * 前端輪詢用：一次回傳各種資料的「版本」。和上次不一樣才去抓那一種資料（用 since= 只抓變了的）。
 * - 只打一支 API：15 人每 30 秒輪詢，全部分開打的話一天會超過 Workers 免費方案的 10 萬次請求（architecture §4）。
 * - 只用 MAX(updated_at)（有索引，每個只讀 1 列）；不用 COUNT(*)：D1 照掃過的列數算額度，每次輪詢都會掃整張表。
 *   所以刪除一律是軟刪除（deleted_at ＋ 更新 updated_at）。
 */
export async function sync({ db }: Ctx): Promise<Response> {
  const q = (sql: string) => db.prepare(sql);
  const [imp, edits, users, itin, sugg, votes] = await db.batch<Record<string, unknown>>([
    q('SELECT MAX(id) AS v FROM imports'),
    q('SELECT MAX(updated_at) AS v FROM place_edits'),
    q('SELECT MAX(updated_at) AS v FROM user_places'),
    q('SELECT version AS v FROM itinerary WHERE id = 1'),
    q('SELECT MAX(updated_at) AS v FROM suggestions'),
    q('SELECT MAX(updated_at) AS v FROM votes'),
  ]);
  const one = (r: D1Result<Record<string, unknown>>) => r.results[0] ?? {};
  const tag = (r: D1Result<Record<string, unknown>>) => (one(r).v as string | null | undefined) ?? null;
  return json({
    places: one(imp).v ?? 0,
    edits: tag(edits),
    userPlaces: tag(users),
    itinerary: one(itin).v ?? 0,
    suggestions: tag(sugg),
    votes: tag(votes),
    now: nowIso(),
  });
}
