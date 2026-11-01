// 聊天紀錄存 D1（T16，規格 §11）：呼叫 Worker 的 /api/chats，只讀寫得到自己的對話。介面在 types.ts 的 ChatRepository。

import { api } from '../backend/http.ts';
import type { ChatMessage, ChatRepository, ConversationSummary } from './types.ts';

const path = (id: string) => `/api/chats/${encodeURIComponent(id)}`;

export function createApiChatRepository(): ChatRepository {
  return {
    listConversations: async () => (await api<{ conversations: ConversationSummary[] }>('GET', '/api/chats')).conversations,
    loadMessages: async (id) => (await api<{ messages: ChatMessage[] }>('GET', `${path(id)}/messages`)).messages,
    createConversation: async (title) => (await api<{ conversation: ConversationSummary }>('POST', '/api/chats', { title })).conversation,
    updateConversation: async (id, patch) => void (await api('PATCH', path(id), patch)),
    appendMessages: async (id, messages) => void (await api('POST', `${path(id)}/messages`, { messages })),
    updateMessage: async (id, message) => void (await api('PUT', `${path(id)}/messages/${encodeURIComponent(message.id)}`, { message })),
    removeTurn: async (id, turn) => void (await api('DELETE', `${path(id)}/turns/${encodeURIComponent(turn)}`)),
  };
}
