// Cloudflare Worker（T24：資料 API；T25：登入、部署；T16：Claude 代理）。
// API 的一覽見 architecture.md §4。除了登入和 LINE 的通知（T25），所有 API 都要先登入。
import { currentMember } from './auth.ts';
import type { Ctx, Env } from './env.ts';
import { errorResponse, json, Router } from './lib/http.ts';
import { createEdit, getPlace, listEdits, listPlaces, revertEdit } from './api/places.ts';
import { createUserPlace, deleteUserPlace, listUserPlaces, updateUserPlace } from './api/user-places.ts';
import { getItinerary, getSnapshot, listSnapshots, putItinerary, restoreSnapshot } from './api/itinerary.ts';
import {
  appendMessage,
  createSuggestion,
  deleteConversation,
  deleteSuggestion,
  deleteVote,
  getConversation,
  listConversations,
  listMembers,
  listSuggestions,
  listVotes,
  me,
  putVote,
  setSuggestionStatus,
  sync,
  updateSuggestion,
} from './api/social.ts';

export const api = new Router<Ctx>()
  .on('GET', '/api/me', me)
  .on('GET', '/api/members', listMembers)
  .on('GET', '/api/sync', sync)
  .on('GET', '/api/places', listPlaces)
  .on('GET', '/api/places/:id', getPlace)
  .on('GET', '/api/edits', listEdits)
  .on('POST', '/api/edits', createEdit)
  .on('POST', '/api/edits/:id/revert', revertEdit)
  .on('GET', '/api/user-places', listUserPlaces)
  .on('POST', '/api/user-places', createUserPlace)
  .on('PATCH', '/api/user-places/:id', updateUserPlace)
  .on('DELETE', '/api/user-places/:id', deleteUserPlace)
  .on('GET', '/api/itinerary', getItinerary)
  .on('PUT', '/api/itinerary', putItinerary)
  .on('GET', '/api/itinerary/snapshots', listSnapshots)
  .on('GET', '/api/itinerary/snapshots/:id', getSnapshot)
  .on('POST', '/api/itinerary/snapshots/:id/restore', restoreSnapshot)
  .on('GET', '/api/suggestions', listSuggestions)
  .on('POST', '/api/suggestions', createSuggestion)
  .on('PATCH', '/api/suggestions/:id', updateSuggestion)
  .on('DELETE', '/api/suggestions/:id', deleteSuggestion)
  .on('PATCH', '/api/suggestions/:id/status', setSuggestionStatus)
  .on('GET', '/api/votes', listVotes)
  .on('PUT', '/api/votes/:placeId', putVote)
  .on('DELETE', '/api/votes/:placeId', deleteVote)
  .on('GET', '/api/chats', listConversations)
  .on('GET', '/api/chats/:conversationId', getConversation)
  .on('POST', '/api/chats/:conversationId', appendMessage)
  .on('DELETE', '/api/chats/:conversationId', deleteConversation);

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (!url.pathname.startsWith('/api/')) return json({ error: 'not-found', message: '找不到' }, { status: 404 });
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
  fetch: (req: Request, env: Env) => handle(req, env),
} satisfies ExportedHandler<Env>;
