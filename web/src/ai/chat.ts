// 聊天的主體（規格 §5、§7、§11）：對話的生命週期、呼叫模型和工具、卡片、呈現。不做版面：T16m-b、T16m-c 讀 store、呼叫這裡的動作。
// 一輪回覆：模型回文字和工具呼叫 → 瀏覽器執行工具 → 把結果送回去，直到模型不再呼叫工具。
// 呈現（show_places…）一輪結束才生效；使用者這段時間動過畫面就不搶，訊息改顯示「看結果」（規格 §3.4）。

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Filter } from '../lib/filter.ts';
import { createProposals, type ProposalDeps, type Proposals } from './proposals.ts';
import { buildTurnContext } from './context.ts';
import { promptsFor } from './prompts.ts';
import { SYSTEM_PROMPT } from './systemPrompt.ts';
import { createReadTools } from './readTools.ts';
import { createTools, type Presentation, type ToolDef } from './tools.ts';
import { incompleteTurn, textOf, titleFrom, toApiMessages } from './transcript.ts';
import type { Op } from './ops.ts';
import type { Stage } from './stage.ts';
import { ModelError, type CardState, type ChatContext, type ChatMessage, type ChatRepository, type ConversationSummary, type ModelClient, type ModelErrorCode, type ToolResultBlock, type ToolUseBlock, type TurnContext } from './types.ts';

/** 一輪最多幾次來回：防止模型一直呼叫工具 */
const MAX_ROUNDS = 12;

export interface ChatState {
  conversations: ConversationSummary[];
  /** null＝新對話，第一句話送出才建立（清單裡不會有空的對話） */
  currentId: string | null;
  messages: ChatMessage[];
  /** idle；thinking＝等模型；streaming＝文字進來中；tools＝工具執行中 */
  status: 'idle' | 'thinking' | 'streaming' | 'tools';
  /** 正在進來的文字 */
  streamingText: string;
  /** 這輪出錯（可以重試）；quota＝超過每天上限 */
  error: { code: ModelErrorCode; message: string } | null;
  /** 輸入框上面的脈絡晶片 */
  contexts: ChatContext[];
  /** 「正在看」被按 ✕ 拿掉 */
  screenOff: boolean;
  /** 問 AI 的建議問題 */
  suggestions: string[];
  /** 上次送出之後使用者對卡片的決定，下一次送出帶給 AI */
  decisions: TurnContext['decisions'];
}

export type ChatResult = { ok: true } | { ok: false; error: string };

export interface CreateChatDeps extends Omit<ProposalDeps, 'onCardChange'> {
  repo: ChatRepository;
  model: ModelClient;
  stage: Stage;
  now?: () => string;
  newId?: () => string;
}

export interface Chat {
  store: StoreApi<ChatState>;
  tools: ToolDef[];
  proposals: Proposals;
  /** 載入這個人的對話，回到最近的那段（打開網站、換人） */
  init(): Promise<void>;
  newConversation(): Promise<void>;
  switchTo(id: string): Promise<void>;
  send(text: string): Promise<ChatResult>;
  /** 重試沒有回完的那輪 */
  retry(): Promise<ChatResult>;
  /** 問 AI：帶入晶片和建議問題，不送出；對話滿了自動開新對話 */
  ask(contexts: ChatContext[]): Promise<void>;
  removeContext(index: number): void;
  setScreenOff(off: boolean): void;
  /** 這段對話還能不能問 */
  isFull(): boolean;
  /** 最後一輪沒有回完時回傳它的 ID */
  incomplete(): string | null;
  /** 卡片的「採用」「送出」「確認」「加入」；text：草稿卡改過的字 */
  confirmCard(toolUseId: string, opts?: { text?: string }): Promise<ChatResult>;
  rejectCard(toolUseId: string): Promise<ChatResult>;
  /** 想去的「復原」 */
  undoCard(toolUseId: string): Promise<ChatResult>;
  /** 「再看一次」「看結果」「在地圖上看」：用相同的參數再呈現一次 */
  present(toolUseId: string): ChatResult;
  dispose(): void;
}

const sameContext = (a: ChatContext, b: ChatContext) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'place') return a.id === (b as typeof a).id;
  if (a.kind === 'day') return a.date === (b as typeof a).date;
  return true;
};

const INITIAL: ChatState = { conversations: [], currentId: null, messages: [], status: 'idle', streamingText: '', error: null, contexts: [], screenOff: false, suggestions: [], decisions: [] };

export function createChat(d: CreateChatDeps): Chat {
  const store = createStore<ChatState>()(() => INITIAL);
  const now = d.now ?? (() => new Date().toISOString());
  const newId = d.newId ?? (() => crypto.randomUUID());
  const read = createReadTools(d);
  const tools = createTools(d);
  const proposals = createProposals({ ...d, onCardChange: (id, status) => void setCard(id, { status }) });
  let abort: AbortController | null = null;
  let openTurn: string | null = null;
  // 卡片處理中：連按兩次不會做兩次
  const busy = new Set<string>();

  function findBlock(toolUseId: string): { message: ChatMessage; block: ToolUseBlock } | null {
    for (const message of store.getState().messages) {
      for (const block of message.content) if (block.type === 'tool_use' && block.id === toolUseId) return { message, block };
    }
    return null;
  }

  async function setCard(toolUseId: string, patch: CardState) {
    const hit = findBlock(toolUseId);
    const id = store.getState().currentId;
    if (!hit || !id) return;
    const message: ChatMessage = { ...hit.message, cards: { ...hit.message.cards, [toolUseId]: { ...hit.message.cards?.[toolUseId], ...patch } } };
    store.setState((s) => ({ messages: s.messages.map((m) => (m.id === message.id ? message : m)) }));
    await d.repo.updateMessage(id, message);
  }

  /** 工具的呈現：用相同的參數再跑一次（都是同步的、不改資料）。提議直接用參數：要用最新的行程重新檢查，套不上才標過期 */
  function presentationOf(block: ToolUseBlock): Presentation | null {
    if (block.name === 'propose_changes') return { kind: 'proposal', ops: block.input.ops as Op[], summary: String(block.input.summary ?? '') };
    const def = tools.find((t) => t.name === block.name);
    if (def?.kind !== 'stage' && block.name !== 'propose_user_place') return null;
    const r = def?.run(block.input);
    return r && !(r instanceof Promise) ? (r.present ?? null) : null;
  }

  /** 真的改畫面；回傳錯誤訊息 */
  function apply(toolUseId: string, p: Presentation): string | null {
    switch (p.kind) {
      case 'places':
        return d.stage.showPlaces(p.input);
      case 'route':
        return d.stage.showRoute(p.input);
      case 'day':
        return d.stage.showDay(p.day);
      case 'place':
        return d.stage.openPlace(p.id);
      case 'map':
        return d.stage.moveMap(p.target);
      case 'filter':
        return d.stage.setFilter(p.patch as Partial<Filter>, p.clear);
      case 'add-place':
        return d.stage.addPlace(p.init);
      case 'clear':
        d.stage.clear();
        return null;
      case 'proposal':
        return proposals.show(toolUseId, p.ops, p.summary);
    }
  }

  async function refreshList() {
    store.setState({ conversations: await d.repo.listConversations() });
  }

  async function append(conversationId: string, messages: ChatMessage[]) {
    store.setState((s) => ({ messages: s.currentId === conversationId ? [...s.messages, ...messages] : s.messages }));
    await d.repo.appendMessages(conversationId, messages);
  }

  /** 跑一輪：這輪的使用者訊息已經存好了 */
  async function runTurn(conversationId: string, turn: string, chips: ChatContext[]): Promise<void> {
    const startKey = d.stage.screenKey();
    const controller = new AbortController();
    abort = controller;
    openTurn = turn;
    const context = buildTurnContext({ d, read, stage: d.stage, chips, screenOff: store.getState().screenOff, decisions: store.getState().decisions });
    store.setState({ decisions: [], error: null });
    const queued: { id: string; present: Presentation }[] = [];
    let partial = '';
    try {
      for (let round = 0; ; round++) {
        if (round >= MAX_ROUNDS) throw new ModelError('other', 'AI 查太多次還沒有答案，請換個問法');
        store.setState({ status: 'thinking', streamingText: '' });
        const uses: ToolUseBlock[] = [];
        let usage: ConversationSummary['usage'] | null = null;
        partial = '';
        const request = { system: SYSTEM_PROMPT, tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })), messages: toApiMessages(store.getState().messages, turn), context };
        for await (const e of d.model.send(request, controller.signal)) {
          if (controller.signal.aborted) return;
          if (e.type === 'text') {
            partial += e.text;
            store.setState({ status: 'streaming', streamingText: partial });
          } else if (e.type === 'tool_use') uses.push({ type: 'tool_use', id: e.id, name: e.name, input: e.input });
          else usage = e.usage;
        }
        if (controller.signal.aborted) return;
        if (usage) {
          await d.repo.updateConversation(conversationId, { usage });
          await refreshList();
        }
        const content = [...(partial ? [{ type: 'text' as const, text: partial }] : []), ...uses];
        const base = { id: newId(), turn, createdAt: now() };
        if (!uses.length) {
          partial = '';
          store.setState({ streamingText: '' });
          await append(conversationId, [{ ...base, role: 'assistant', content, end: true }]);
          break;
        }
        // 工具：查資料馬上跑；呈現先排著，一輪結束才生效
        store.setState({ status: 'tools' });
        const cards: Record<string, CardState> = {};
        const results: ToolResultBlock[] = [];
        for (const use of uses) {
          const def = tools.find((t) => t.name === use.name);
          let output: { ok: boolean } & Record<string, unknown>;
          try {
            if (!def) throw new Error(`沒有工具 ${use.name}`);
            const r = await def.run(use.input);
            output = r.output;
            if (r.card) cards[use.id] = r.card;
            if (r.present) queued.push({ id: use.id, present: r.present });
          } catch (e) {
            output = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(output), ...(output.ok ? {} : { is_error: true }) });
        }
        // 工具呼叫和結果一起存：紀錄裡不會有沒結果的工具呼叫（規格 §11）
        partial = '';
        store.setState({ streamingText: '' });
        await append(conversationId, [
          { ...base, role: 'assistant', content, ...(Object.keys(cards).length ? { cards } : {}) },
          { id: newId(), turn, createdAt: now(), role: 'user', content: results },
        ]);
      }
      // 不搶畫面：使用者動過畫面就等他按「看結果」
      const moved = d.stage.screenKey() !== startKey;
      for (const q of queued) {
        if (moved) {
          await setCard(q.id, { view: 'deferred' });
          continue;
        }
        const err = apply(q.id, q.present);
        if (err && q.present.kind === 'proposal') await setCard(q.id, { status: 'stale' });
        else await setCard(q.id, { view: 'applied' });
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      const error = e instanceof ModelError ? { code: e.code, message: e.message } : { code: 'other' as const, message: e instanceof Error ? e.message : String(e) };
      // 已經進來的文字留給使用者看，標「沒有回完」；這輪不會送給模型（transcript.ts）
      if (partial) await append(conversationId, [{ id: newId(), turn, createdAt: now(), role: 'assistant', content: [{ type: 'text', text: partial }] }]);
      store.setState({ error });
    } finally {
      if (abort === controller) {
        abort = null;
        openTurn = null;
        store.setState({ status: 'idle', streamingText: '' });
      }
    }
  }

  function stop() {
    abort?.abort();
    abort = null;
    openTurn = null;
    store.setState({ status: 'idle', streamingText: '' });
  }

  async function open(id: string | null) {
    stop();
    // 提議卡還在，畫面上清掉（規格 §11）
    proposals.hide();
    store.setState({ currentId: id, messages: id ? await d.repo.loadMessages(id) : [], contexts: [], suggestions: [], error: null, decisions: [] });
  }

  async function startTurn(text: string, chips: ChatContext[]): Promise<ChatResult> {
    let id = store.getState().currentId;
    if (!id) {
      const c = await d.repo.createConversation(titleFrom(text));
      id = c.id;
      store.setState({ currentId: id });
      await refreshList();
    }
    const turn = newId();
    await append(id, [{ id: newId(), turn, createdAt: now(), role: 'user', content: [{ type: 'text', text }], contexts: chips }]);
    await runTurn(id, turn, chips);
    return { ok: true };
  }

  const isFull = () => {
    const s = store.getState();
    return s.conversations.find((c) => c.id === s.currentId)?.usage === 'full';
  };

  const decide = (block: ToolUseBlock, status: string) =>
    store.setState((s) => ({ decisions: [...s.decisions, { tool: block.name, status, summary: String(block.input.summary ?? block.input.text ?? block.input.placeId ?? '') }] }));

  const pendingCard = (toolUseId: string) => {
    const hit = findBlock(toolUseId);
    if (!hit) return null;
    return hit.message.cards?.[toolUseId]?.status === 'pending' ? hit : null;
  };

  // 換人（dev 的假登入、T16 重新登入）：換成那個人自己的對話
  let lastMember = d.shared.store.getState().me?.id;
  const unsubMember = d.shared.store.subscribe((s) => {
    if (s.me?.id === lastMember) return;
    lastMember = s.me?.id;
    void chat.init();
  });

  const chat: Chat = {
    store,
    tools,
    proposals,
    async init() {
      await refreshList();
      await open(store.getState().conversations[0]?.id ?? null);
    },
    newConversation: () => open(null),
    switchTo: (id) => open(id),
    async send(text) {
      const t = text.trim();
      if (!t) return { ok: false, error: '沒有內容' };
      if (store.getState().status !== 'idle') return { ok: false, error: 'AI 還在回覆' };
      if (isFull()) return { ok: false, error: '這段對話滿了，請開新對話' };
      store.setState({ suggestions: [] });
      return startTurn(t, store.getState().contexts);
    },
    async retry() {
      const s = store.getState();
      const turn = incompleteTurn(s.messages, openTurn);
      if (!turn || !s.currentId || s.status !== 'idle') return { ok: false, error: '沒有要重試的訊息' };
      const first = s.messages.find((m) => m.turn === turn && m.role === 'user');
      if (!first) return { ok: false, error: '沒有要重試的訊息' };
      await d.repo.removeTurn(s.currentId, turn);
      store.setState((x) => ({ messages: x.messages.filter((m) => m.turn !== turn), error: null }));
      return startTurn(textOf(first.content), first.contexts ?? []);
    },
    async ask(contexts) {
      if (isFull()) await open(null);
      const s = store.getState();
      const fresh = contexts.filter((c) => !s.contexts.some((x) => sameContext(x, c)));
      const last = contexts.at(-1);
      const place = last?.kind === 'place' ? d.data.getState().byId.get(last.id) : undefined;
      store.setState({ contexts: [...s.contexts, ...fresh], screenOff: false, suggestions: last ? promptsFor(last, place) : [] });
    },
    removeContext: (index) => store.setState((s) => ({ contexts: s.contexts.filter((_, i) => i !== index) })),
    setScreenOff: (screenOff) => store.setState({ screenOff }),
    isFull,
    incomplete: () => incompleteTurn(store.getState().messages, openTurn),
    async confirmCard(toolUseId, opts = {}) {
      const hit = pendingCard(toolUseId);
      if (!hit || busy.has(toolUseId)) return { ok: false, error: '這張卡已經處理過了' };
      const { block } = hit;
      const i = block.input as Record<string, unknown>;
      busy.add(toolUseId);
      try {
        if (block.name === 'propose_changes') {
          const outcome = await proposals.adopt(i.ops as Op[], String(i.summary ?? ''));
          if (outcome === 'cancelled') return { ok: false, error: '取消了' };
          if (outcome === 'failed') return { ok: false, error: '沒有存成功' };
          if (outcome === 'stale') {
            await setCard(toolUseId, { status: 'stale' });
            decide(block, 'stale');
            return { ok: false, error: '行程變了，這個提議已經過期' };
          }
          await setCard(toolUseId, { status: 'confirmed' });
          decide(block, 'confirmed');
          return { ok: true };
        }
        let r: { ok: true } | { ok: false; error: string };
        const text = opts.text ?? (i.text as string | undefined);
        if (block.name === 'draft_comment') r = await d.shared.comment(i.target as string, (text ?? '').trim());
        else if (block.name === 'add_candidate') r = await d.shared.addCandidate(i.placeId as string, i.date as string);
        else if (block.name === 'propose_place_edit') r = await d.shared.createEdit(i.placeId as string, i.fieldPath as string, i.value, (i.note as string | undefined) ?? null);
        else return { ok: false, error: `${block.name} 沒有確認這個動作` };
        if (!r.ok) return r;
        await setCard(toolUseId, { status: 'confirmed', ...(opts.text != null ? { text: opts.text } : {}) });
        decide(block, 'confirmed');
        return { ok: true };
      } finally {
        busy.delete(toolUseId);
      }
    },
    async rejectCard(toolUseId) {
      const hit = pendingCard(toolUseId);
      if (!hit) return { ok: false, error: '這張卡已經處理過了' };
      proposals.reject(toolUseId);
      await setCard(toolUseId, { status: 'rejected' });
      decide(hit.block, 'rejected');
      return { ok: true };
    },
    async undoCard(toolUseId) {
      const hit = findBlock(toolUseId);
      const card = hit?.message.cards?.[toolUseId];
      if (!hit || hit.block.name !== 'vote' || card?.status !== 'confirmed') return { ok: false, error: '沒有要復原的' };
      const r = await d.shared.vote(hit.block.input.placeId as string, card.previous ?? null);
      if (!r.ok) return r;
      await setCard(toolUseId, { status: 'undone' });
      return { ok: true };
    },
    present(toolUseId) {
      const hit = findBlock(toolUseId);
      if (!hit) return { ok: false, error: '找不到這則訊息' };
      const p = presentationOf(hit.block);
      if (!p) return { ok: false, error: '這則訊息沒有可以看的' };
      const status = hit.message.cards?.[toolUseId]?.status;
      if (p.kind === 'proposal' && status !== 'pending') return { ok: false, error: '這個提議已經處理過了' };
      const err = apply(toolUseId, p);
      if (err) {
        if (p.kind === 'proposal') void setCard(toolUseId, { status: 'stale' });
        return { ok: false, error: err };
      }
      void setCard(toolUseId, { view: 'applied' });
      return { ok: true };
    },
    dispose() {
      stop();
      unsubMember();
      proposals.dispose();
    },
  };


  return chat;
}
