// 聊天紀錄（T16，規格 §11）：每個人只能讀寫自己的對話；別人的對話一律當作不存在（404）。
//   GET    /api/chats                                自己的對話清單，新的在前面
//   POST   /api/chats                                { title } 開一段對話
//   PATCH  /api/chats/:conversationId                { title?, usage? }
//   DELETE /api/chats/:conversationId
//   GET    /api/chats/:conversationId/messages       這段對話的訊息
//   POST   /api/chats/:conversationId/messages       { messages: ChatMessage[] } 接在後面
//   PUT    /api/chats/:conversationId/messages/:id   { message: ChatMessage } 卡片按了之後更新那則
//   DELETE /api/chats/:conversationId/turns/:turn    重試前拿掉沒回完的一輪

import type { Ctx } from '../env.ts';
import { badRequest, isPlainObject, json, notFound, nowIso, readBody, rawJson } from '../lib/http.ts';

const MAX_TITLE = 100;
const MAX_MESSAGE_CHARS = 512 * 1024;
const MAX_MESSAGES = 20;
const USAGES = new Set(['ok', 'near', 'full']);

interface ConversationRow {
  id: string;
  title: string;
  usage: string;
  updated_at: string;
}

const summary = (r: ConversationRow) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, usage: r.usage });

function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim()) throw badRequest('title 不能是空的');
  if (title.length > MAX_TITLE) throw badRequest(`title 太長（上限 ${MAX_TITLE} 字）`);
  return title;
}

/** 這段對話是不是本人的；不是就和不存在一樣 */
async function ownConversation({ db, member }: Ctx, id: string): Promise<void> {
  const row = await db.prepare('SELECT 1 AS ok FROM chat_conversations WHERE id = ? AND member_id = ?').bind(id, member.id).first();
  if (!row) throw notFound('找不到這段對話');
}

function checkMessage(m: unknown): { id: string; turn: string; data: string } {
  if (!isPlainObject(m)) throw badRequest('訊息要是物件');
  if (typeof m.id !== 'string' || !m.id || m.id.length > 64) throw badRequest('訊息缺少 id');
  if (typeof m.turn !== 'string' || !m.turn || m.turn.length > 64) throw badRequest('訊息缺少 turn');
  if (m.role !== 'user' && m.role !== 'assistant') throw badRequest("role 要是 'user' 或 'assistant'");
  if (!Array.isArray(m.content)) throw badRequest('content 要是陣列');
  const data = JSON.stringify(m);
  if (data.length > MAX_MESSAGE_CHARS) throw badRequest('訊息太大');
  return { id: m.id, turn: m.turn, data };
}

export async function listConversations({ db, member }: Ctx): Promise<Response> {
  const r = await db.prepare('SELECT id, title, usage, updated_at FROM chat_conversations WHERE member_id = ? ORDER BY updated_at DESC').bind(member.id).all<ConversationRow>();
  return json({ conversations: r.results.map(summary) });
}

export async function createConversation({ db, req, member }: Ctx): Promise<Response> {
  const title = checkTitle((await readBody(req)).title);
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.prepare('INSERT INTO chat_conversations (id, member_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, member.id, title, now, now).run();
  return json({ conversation: summary({ id, title, usage: 'ok', updated_at: now }) }, { status: 201 });
}

export async function updateConversation(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const id = params.conversationId;
  await ownConversation(ctx, id);
  const b = await readBody(ctx.req);
  if (b.title !== undefined) await ctx.db.prepare('UPDATE chat_conversations SET title = ? WHERE id = ?').bind(checkTitle(b.title), id).run();
  if (b.usage !== undefined) {
    if (typeof b.usage !== 'string' || !USAGES.has(b.usage)) throw badRequest('usage 要是 ok、near 或 full');
    await ctx.db.prepare('UPDATE chat_conversations SET usage = ? WHERE id = ?').bind(b.usage, id).run();
  }
  return json({ ok: true });
}

export async function deleteConversation(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const id = params.conversationId;
  await ownConversation(ctx, id);
  await ctx.db.prepare('DELETE FROM chat_conversations WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

/** data 已經是 JSON 文字，直接接起來，不在 Worker 裡解開再序列化（省 CPU 時間，同資料點的做法） */
export async function listMessages(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const id = params.conversationId;
  await ownConversation(ctx, id);
  const r = await ctx.db.prepare('SELECT data FROM chat_messages WHERE conversation_id = ? ORDER BY seq').bind(id).all<{ data: string }>();
  return rawJson(`{"messages":[${r.results.map((m) => m.data).join(',')}]}`);
}

export async function appendMessages(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const id = params.conversationId;
  await ownConversation(ctx, id);
  const b = await readBody(ctx.req, 2 * MAX_MESSAGE_CHARS);
  if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > MAX_MESSAGES) throw badRequest(`messages 要是 1～${MAX_MESSAGES} 則訊息的陣列`);
  const now = nowIso();
  const rows = b.messages.map(checkMessage);
  await ctx.db.batch([
    ...rows.map((m) => ctx.db.prepare('INSERT INTO chat_messages (id, conversation_id, turn, data, created_at) VALUES (?, ?, ?, ?, ?)').bind(m.id, id, m.turn, m.data, now)),
    ctx.db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').bind(now, id),
  ]);
  return json({ ok: true }, { status: 201 });
}

export async function updateMessage(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const id = params.conversationId;
  await ownConversation(ctx, id);
  const m = checkMessage((await readBody(ctx.req, 2 * MAX_MESSAGE_CHARS)).message);
  if (m.id !== params.messageId) throw badRequest('訊息 ID 和網址不同');
  const r = await ctx.db.prepare('UPDATE chat_messages SET data = ? WHERE conversation_id = ? AND id = ?').bind(m.data, id, m.id).run();
  if (!r.meta.changes) throw notFound('找不到這則訊息');
  return json({ ok: true });
}

export async function removeTurn(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const id = params.conversationId;
  await ownConversation(ctx, id);
  await ctx.db.prepare('DELETE FROM chat_messages WHERE conversation_id = ? AND turn = ?').bind(id, params.turn).run();
  return json({ ok: true });
}
