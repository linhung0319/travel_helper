// Cloudflare Worker（T24：資料 API；T25：登入、部署；T16：Claude 代理）。
// API 的一覽見 architecture.md §4。除了登入（/auth/*）和 LINE 的通知（/line/webhook），所有 API 都要先登入；
// 網站本身也要先登入，沒登入就回登入頁；只有打包好的程式（/assets/*）不經過 Worker（wrangler.jsonc 的 assets.run_worker_first）。
import { handleAdmin } from './admin.ts';
import { currentMember, handleAuth } from './auth.ts';
import type { Ctx, Env } from './env.ts';
import { errorResponse, HttpError, json, Router } from './lib/http.ts';
import { blockedPage, loginPage } from './pages.ts';
import { handleWebhook, type WaitUntil } from './webhook.ts';
import { bootstrap } from './api/bootstrap.ts';
import { createEdit, getPlace, listEdits, listPlaceDetails, listPlaces, revertEdit } from './api/places.ts';
import { createUserPlace, deleteUserPlace, listUserPlaces, updateUserPlace } from './api/user-places.ts';
import { resolveMapLink } from './api/map-link.ts';
import { getItinerary, getSnapshot, listSnapshots, putItinerary, putSummary, restoreSnapshot } from './api/itinerary.ts';
import { claudeMessages } from './api/claude.ts';
import { appendMessages, createConversation, deleteConversation, listConversations, listMessages, removeTurn, updateConversation, updateMessage } from './api/chats.ts';
import {
  createCandidate,
  createComment,
  deleteCandidate,
  deleteComment,
  deleteVote,
  listCandidates,
  listComments,
  listMembers,
  listReservations,
  listVotes,
  me,
  putReservation,
  putVote,
  sync,
  updateComment,
} from './api/social.ts';

export const api = new Router<Ctx>()
  .on('GET', '/api/me', me)
  .on('GET', '/api/members', listMembers)
  .on('GET', '/api/sync', sync)
  .on('GET', '/api/bootstrap', bootstrap)
  .on('GET', '/api/places', listPlaces)
  .on('GET', '/api/places/details', listPlaceDetails)
  .on('GET', '/api/places/:id', getPlace)
  .on('GET', '/api/edits', listEdits)
  .on('POST', '/api/edits', createEdit)
  .on('POST', '/api/edits/:id/revert', revertEdit)
  .on('GET', '/api/user-places', listUserPlaces)
  .on('POST', '/api/user-places', createUserPlace)
  .on('PATCH', '/api/user-places/:id', updateUserPlace)
  .on('DELETE', '/api/user-places/:id', deleteUserPlace)
  .on('GET', '/api/resolve-map-link', resolveMapLink)
  .on('GET', '/api/itinerary', getItinerary)
  .on('PUT', '/api/itinerary', putItinerary)
  .on('PUT', '/api/itinerary/summary', putSummary)
  .on('GET', '/api/itinerary/snapshots', listSnapshots)
  .on('GET', '/api/itinerary/snapshots/:id', getSnapshot)
  .on('POST', '/api/itinerary/snapshots/:id/restore', restoreSnapshot)
  .on('GET', '/api/comments', listComments)
  .on('POST', '/api/comments', createComment)
  .on('PATCH', '/api/comments/:id', updateComment)
  .on('DELETE', '/api/comments/:id', deleteComment)
  .on('GET', '/api/candidates', listCandidates)
  .on('POST', '/api/candidates', createCandidate)
  .on('DELETE', '/api/candidates/:id', deleteCandidate)
  .on('GET', '/api/reservations', listReservations)
  .on('PUT', '/api/reservations', putReservation)
  .on('GET', '/api/votes', listVotes)
  .on('PUT', '/api/votes/:placeId', putVote)
  .on('DELETE', '/api/votes/:placeId', deleteVote)
  .on('GET', '/api/chats', listConversations)
  .on('POST', '/api/chats', createConversation)
  .on('PATCH', '/api/chats/:conversationId', updateConversation)
  .on('DELETE', '/api/chats/:conversationId', deleteConversation)
  .on('GET', '/api/chats/:conversationId/messages', listMessages)
  .on('POST', '/api/chats/:conversationId/messages', appendMessages)
  .on('PUT', '/api/chats/:conversationId/messages/:messageId', updateMessage)
  .on('DELETE', '/api/chats/:conversationId/turns/:turn', removeTurn)
  .on('POST', '/api/claude/messages', claudeMessages);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 會改東西的請求，Origin 要是自己的網站（cookie 是 SameSite=Lax，這裡再擋一層）。
 * 沒有 Origin header 的（curl、測試）照常處理：沒有 cookie 的請求本來就過不了登入。
 */
function sameOrigin(req: Request, env: Env, url: URL): boolean {
  const origin = req.headers.get('origin');
  if (!origin || SAFE_METHODS.has(req.method)) return true;
  const allowed = new Set([url.origin]);
  if (env.PUBLIC_BASE_URL) allowed.add(new URL(env.PUBLIC_BASE_URL).origin);
  return allowed.has(origin);
}

/** 網站的靜態檔案：登入了才給 */
async function serveSite(req: Request, env: Env, url: URL): Promise<Response> {
  try {
    await currentMember(req, env);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status === 403) return blockedPage({ reason: 'disabled' });
    return loginPage(url.pathname + url.search);
  }
  if (!env.ASSETS) return json({ error: 'not-found', message: '找不到' }, { status: 404 });
  return env.ASSETS.fetch(req);
}

export async function handle(req: Request, env: Env, waitUntil?: WaitUntil): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (!sameOrigin(req, env, url)) return json({ error: 'bad-origin', message: '不接受從別的網站送來的請求' }, { status: 403 });
    if (url.pathname.startsWith('/auth/')) return await handleAuth(req, env, url);
    if (url.pathname === '/line/webhook') return await handleWebhook(req, env, waitUntil);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, env, url);
    if (!url.pathname.startsWith('/api/')) return await serveSite(req, env, url);
    const m = api.match(req.method, url.pathname);
    if (m === null) return json({ error: 'not-found', message: `沒有這個 API：${url.pathname}` }, { status: 404 });
    if (m === 'method-not-allowed') return json({ error: 'method-not-allowed', message: `${url.pathname} 不支援 ${req.method}` }, { status: 405 });
    const member = await currentMember(req, env);
    return await m.handler({ req, url, env, db: env.DB, member }, m.params);
  } catch (e) {
    return errorResponse(e);
  }
}

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => handle(req, env, (p) => ctx.waitUntil(p)),
} satisfies ExportedHandler<Env>;
