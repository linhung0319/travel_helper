// AI 的共用型別（T16m 規格 §4、§5、§6、§7、§11）。訊息的內容照 Claude API 的 messages（含 tool use），T16 換成真的 API 時不用改。

import type { Filter } from '../lib/filter.ts';

export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  /** 工具結果的 JSON 字串 */
  content: string;
  is_error?: boolean;
}
/** 模型回的其他區塊（思考、換模型的標記）：畫面不用，但下一次要原樣送回去（思考的簽章綁著前面的對話） */
export interface OpaqueBlock {
  type: 'thinking' | 'redacted_thinking' | 'fallback';
  [key: string]: unknown;
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | OpaqueBlock;

/** 送給模型的一則訊息 */
export interface ApiMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

/** 脈絡晶片（規格 §6）：輸入框上面帶給 AI 的東西 */
export type ChatContext =
  | { kind: 'place'; id: string; date?: string; itemId?: string }
  | { kind: 'day'; date: string }
  | { kind: 'trip' }
  | { kind: 'list'; source: 'explore' | 'wish'; filter: Filter; query: string; count: number };

/**
 * 卡片（提議、草稿）和呈現的狀態，跟著訊息存下來。
 * status：pending 等使用者決定；confirmed 已採用／已送出；rejected 不要；superseded 被新的一版取代；stale 提議過期；undone 已復原（想去、提議）；closed 別版被採用了，這版沒有用上
 * 提議的 superseded、rejected、stale、undone 都能重新打開，變回 pending（規格 §3.3）
 * view：呈現有沒有生效：applied 已經在畫面上；deferred 使用者動過畫面，按「看結果」才呈現
 */
export interface CardState {
  status?: 'pending' | 'confirmed' | 'rejected' | 'superseded' | 'stale' | 'undone' | 'closed';
  view?: 'applied' | 'deferred';
  /** 草稿卡改過的字 */
  text?: string;
  /** 想去：每個點按之前的值（復原用） */
  previous?: Record<string, 'like' | 'dislike' | null>;
  /** 加地點：使用者按了加入（§17.8） */
  added?: { id: string; name: string; type: string };
}

/** 存下來、畫在畫面上的一則訊息 */
/** 一輪沒有回完的原因（記在這輪的第一則訊息，查問題用；沒有這個欄位又沒回完＝關掉或重新整理頁面） */
export interface TurnFailure {
  code: ModelErrorCode | 'stopped';
  message: string;
  at: string;
}

export interface ChatMessage extends ApiMessage {
  /** 這輪為什麼沒有回完 */
  failure?: TurnFailure;
  id: string;
  /** 一輪回覆的 ID：使用者的一句話，加上 AI 接著的所有訊息 */
  turn: string;
  createdAt: string;
  /** 使用者的訊息：送出時帶的脈絡晶片 */
  contexts?: ChatContext[];
  /** 使用者的訊息：這輪送給模型的脈絡（JSON 文字）。跟著訊息存下來：歷史只增不改，快取和思考的簽章才接得上 */
  turnContext?: string;
  /** AI 這輪回覆到這則結束；一輪裡沒有這一則就是「沒有回完」 */
  end?: boolean;
  /** tool_use 的 ID → 狀態 */
  cards?: Record<string, CardState>;
}

/** 這段對話的用量：快滿、滿了（ModelClient 回報，規格 §11） */
export type ContextUsage = 'ok' | 'near' | 'full';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  usage: ContextUsage;
}

/** 聊天紀錄的儲存：T16m 是 localStorage（chatRepository.ts）；T16 換成 /api/chats，畫面不改 */
export interface ChatRepository {
  /** 目前這個人的對話，新的在前面 */
  listConversations(): Promise<ConversationSummary[]>;
  loadMessages(conversationId: string): Promise<ChatMessage[]>;
  /** id：瀏覽器先定好，畫面和模型不用等這個請求（T39）；沒給由後端定 */
  createConversation(title: string, id?: string): Promise<ConversationSummary>;
  updateConversation(id: string, patch: Partial<Pick<ConversationSummary, 'title' | 'usage'>>): Promise<void>;
  appendMessages(conversationId: string, messages: ChatMessage[]): Promise<void>;
  /** 卡片按了之後更新那則訊息 */
  updateMessage(conversationId: string, message: ChatMessage): Promise<void>;
  /** 重試前拿掉沒有回完的那一輪 */
  removeTurn(conversationId: string, turn: string): Promise<void>;
}

/** 工具定義（格式同 Claude API 的 tools） */
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** 一輪對話的脈絡：只帶小的東西，其他用工具查（規格 §4.5） */
export interface TurnContext {
  /** 這輪開始時的日本時間，例如「2027-02-05（五）14:32」（T34）；舊的紀錄沒有 */
  now?: string;
  screen: Record<string, unknown>;
  /** 脈絡晶片和它們的精簡內容 */
  chips: Record<string, unknown>[];
  /** 上次送出之後，使用者對卡片的決定（「不要」要讓 AI 看得到） */
  decisions: { tool: string; status: string; summary: string }[];
  /** 目前顯示的提議（規格 §3.3）：要接著改就照這份 ops 給新的一版 */
  draft: { cardId: string; ops: unknown[]; summary: string } | null;
  /** 還沒決定的卡、提議的每一版：decide_card、show_again 用 */
  cards: { id: string; tool: string; status: string; summary: string }[];
}

export interface ModelRequest {
  system: string;
  tools: ToolSchema[];
  messages: ApiMessage[];
  context: TurnContext;
}

export type ModelEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  /** content：模型回的完整內容（含思考）；假 AI 沒有，由文字和 tool_use 事件組 */
  | { type: 'done'; usage: ContextUsage; content?: ContentBlock[] };

export type ModelErrorCode = 'network' | 'quota' | 'other';

/** 模型的錯誤：quota＝超過每天上限 */
export class ModelError extends Error {
  readonly code: ModelErrorCode;
  constructor(code: ModelErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** 模型包在這層介面後面：T16m 是假 AI（dev-fixtures/ai/），T16 換成呼叫 Worker */
export interface ModelClient {
  send(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
}
