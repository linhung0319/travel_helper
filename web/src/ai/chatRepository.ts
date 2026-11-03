// 聊天紀錄的 localStorage 實作（T16m）：每個人一份，切換假使用者看到的是那個人自己的對話（規格 §11）。
// T16 換成 /api/chats 的實作，介面在 types.ts 的 ChatRepository。

import type { ChatMessage, ChatRepository, ConversationSummary } from './types.ts';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

interface Saved {
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
}

export interface LocalChatOptions {
  storage: StorageLike | null;
  /** 目前登入的人：key 含使用者 ID */
  memberId(): string;
  now?: () => string;
  newId?: () => string;
}

export function createLocalChatRepository(opts: LocalChatOptions): ChatRepository {
  const now = opts.now ?? (() => new Date().toISOString());
  const newId = opts.newId ?? (() => crypto.randomUUID());
  // 無痕模式等情況存不了：只留在記憶體
  const memory = new Map<string, Saved>();
  const key = () => `travel-helper:chat:v1:${opts.memberId()}`;

  function read(): Saved {
    const k = key();
    const hit = memory.get(k);
    if (hit) return hit;
    let saved: Saved = { conversations: [], messages: {} };
    try {
      const text = opts.storage?.getItem(k);
      if (text) saved = JSON.parse(text) as Saved;
    } catch {
      // 壞掉的存檔當作沒有
    }
    memory.set(k, saved);
    return saved;
  }

  function write(s: Saved) {
    const k = key();
    memory.set(k, s);
    try {
      opts.storage?.setItem(k, JSON.stringify(s));
    } catch {
      // 存不了就只留在記憶體
    }
  }

  const touch = (s: Saved, id: string): ConversationSummary[] => s.conversations.map((c) => (c.id === id ? { ...c, updatedAt: now() } : c));

  return {
    async listConversations() {
      return [...read().conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async loadMessages(id) {
      return read().messages[id] ?? [];
    },
    async createConversation(title, id) {
      const s = read();
      const c: ConversationSummary = { id: id ?? newId(), title, updatedAt: now(), usage: 'ok' };
      write({ conversations: [...s.conversations, c], messages: { ...s.messages, [c.id]: [] } });
      return c;
    },
    async updateConversation(id, patch) {
      const s = read();
      write({ ...s, conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    },
    async appendMessages(id, messages) {
      const s = read();
      write({ conversations: touch(s, id), messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), ...messages] } });
    },
    async updateMessage(id, message) {
      const s = read();
      write({ ...s, messages: { ...s.messages, [id]: (s.messages[id] ?? []).map((m) => (m.id === message.id ? message : m)) } });
    },
    async removeTurn(id, turn) {
      const s = read();
      write({ ...s, messages: { ...s.messages, [id]: (s.messages[id] ?? []).filter((m) => m.turn !== turn) } });
    },
  };
}
