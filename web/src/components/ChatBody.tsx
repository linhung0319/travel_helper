// 聊天的內容，網頁（ChatPanel）、手機（mobile/ChatView）共用：訊息、對話清單、輸入框上面的建議問題和晶片、輸入框。
// 只讀 ai.store、呼叫 ai 的動作；一輪怎麼畫在 ai/transcript.ts 的 turnsOf；頂端、卡片、版面各平台自己給。

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useStore } from 'zustand';
import { ai } from '../appAi.ts';
import { useData, usePlan, useShared } from '../hooks.ts';
import { dayLabel } from '../lib/trip.ts';
import { filterChips } from '../lib/filter.ts';
import { streamingView, toolLabel, turnsOf, type ChatToolUse, type ChatTurn } from '../ai/transcript.ts';
import { blankCards, type StarterCard } from '../ai/prompts.ts';
import type { ChatContext, ConversationSummary } from '../ai/types.ts';
import { RichText, TypeStamp, usePlaceName } from './ChatRich.tsx';
import { Icon } from './Icon.tsx';
import './chat.css';

const useAi = <T,>(selector: (s: ReturnType<typeof ai.store.getState>) => T) => useStore(ai.store, selector);

const READ_TOOLS = new Set(ai.tools.filter((t) => t.kind === 'read').map((t) => t.name));

/** 對話的時間：剛剛、今天 10:32、昨天 21:05、10/29 */
function stampOf(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (now.getTime() - d.getTime() < 60_000) return '剛剛';
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function ContextChip({ context, onRemove }: { context: ChatContext; onRemove?: () => void }) {
  const placeId = context.kind === 'place' ? context.id : '';
  const name = usePlaceName(placeId);
  const type = useData((s) => (placeId ? s.byId.get(placeId)?.type : undefined));
  const areas = useData((s) => s.areas);
  let label: string;
  if (context.kind === 'place') label = name;
  else if (context.kind === 'day') label = dayLabel(context.date);
  else if (context.kind === 'trip') label = '整趟';
  else {
    const labels = filterChips(context.filter, areas).map((c) => c.label);
    label = `${context.source === 'wish' ? '想去' : '探索'}${labels.length ? `：${labels.join('、')}` : ''} · ${context.count} 個`;
  }
  return (
    <span className="ac-chip" data-testid="chat-context" data-kind={context.kind}>
      {context.kind === 'place' && <TypeStamp type={type} />}
      <span className="ac-chip-text">{label}</span>
      {onRemove && (
        <button type="button" aria-label={`拿掉 ${label}`} onClick={onRemove}>
          <Icon name="close" size={16} />
        </button>
      )}
    </span>
  );
}

/** 「正在看」：沒有晶片時的灰色提示，也會帶給 AI，可以 ✕；✕ 之後留一顆拿得回來 */
function ScreenHint({ label }: { label: string }) {
  const off = useAi((s) => s.screenOff);
  if (off) {
    return (
      <button type="button" className="ac-chip add" onClick={() => ai.setScreenOff(false)} data-testid="chat-screen-restore">
        <span className="ac-chip-text">＋ 正在看</span>
      </button>
    );
  }
  return (
    <span className="ac-chip see" data-testid="chat-screen-hint">
      <span className="ac-chip-text">正在看：{label}</span>
      <button type="button" aria-label="不要帶正在看的畫面" onClick={() => ai.setScreenOff(true)}>
        <Icon name="close" size={16} />
      </button>
    </span>
  );
}

function ConversationList({ list, current, onClose, onNew }: { list: ConversationSummary[]; current: string | null; onClose: () => void; onNew?: () => void }) {
  return (
    <div className="ac-drawer" data-testid="chat-conversations">
      {onNew && (
        <button type="button" className="ac-conv-new" onClick={onNew} data-testid="chat-list-new">
          <Icon name="plus" size={20} /> 開新對話
        </button>
      )}
      {list.length === 0 && <p className="ac-empty">還沒有對話。</p>}
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`ac-conv ${c.id === current ? 'on' : ''}`}
          aria-current={c.id === current ? 'true' : undefined}
          data-testid="chat-conversation"
          onClick={() => {
            onClose();
            void ai.switchTo(c.id);
          }}
        >
          <span className="ac-conv-title">{c.title}</span>
          <small>
            {stampOf(c.updatedAt)}
            {c.usage === 'full' && <span className="ac-conv-full"> · 滿了</span>}
          </small>
        </button>
      ))}
    </div>
  );
}

function ToolLine({ turn }: { turn: ChatTurn }) {
  const [open, setOpen] = useState(false);
  if (!turn.reads.length) return null;
  return (
    <>
      <button type="button" className="ac-tool" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="chat-tools">
        <Icon name="check" size={16} /> 查了 {turn.reads.length} 項資料
        <span className={`chev ${open ? 'up' : ''}`}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <ul className="ac-tool-list" data-testid="chat-tools-list">
          {turn.reads.map((u) => (
            <li key={u.id}>{toolLabel(u.name, u.input)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * 一輪的版面（T39）：順序固定是 查了什麼 → 字 → 卡片 → 快速選項。字進來的時候就在字該在的位置（live），
 * 卡片等這輪回完才放到字的下面，和地圖、右欄同時變；一路往下長，不會有東西跳到別的位置。
 */
function Turn({ turn, last, versionOf, busy, incomplete, card, onQuick, live }: { turn: ChatTurn; last: boolean; versionOf: (id: string) => number; busy: boolean; incomplete: boolean; card: ChatBodyProps['card']; onQuick: (text: string) => void; live: ReactNode }) {
  const running = last && busy;
  return (
    <>
      {turn.user && (
        <div className="ac-me" data-testid="chat-msg-me">
          {!!turn.contexts.length && (
            <div className="ac-me-chips">
              {turn.contexts.map((c, i) => (
                <ContextChip key={i} context={c} />
              ))}
            </div>
          )}
          <div className="ac-bubble">{turn.user}</div>
        </div>
      )}
      <div className="ac-ai" data-testid="chat-msg-ai">
        <ToolLine turn={turn} />
        {turn.texts.map((t, i) => (
          <RichText key={i} text={t} />
        ))}
        {running && live}
        {!running &&
          turn.uses.map((u) => (
            <div key={u.block.id} className={`ac-use ${last ? 'new' : ''}`} data-card={u.block.id}>
              {card(u, versionOf(u.block.id))}
            </div>
          ))}
        {incomplete && (
          <div className="ac-broken" data-testid="chat-incomplete">
            <Icon name="warn" size={16} /> 沒有回完
            <button type="button" className="button small" onClick={() => void ai.retry()} data-testid="chat-retry">
              重試
            </button>
          </div>
        )}
        {last && !busy && !!turn.replies.length && !ai.isFull() && (
          <div className="ac-quick">
            {turn.replies.map((r) => (
              <button key={r} type="button" className="ac-quick-btn" onClick={() => onQuick(r)} data-testid="chat-quick">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** 訊息區矮於這個高度（手機的半屏、鍵盤開著）放不下三張：只放第一張，其他縮成一行膠囊 */
const CARDS_COMPACT_BELOW = 250;

/** 空白的新對話的卡片（§17.2）：第一張靛藍實心、橫跨兩欄，其他白底；按了就是送出那句話 */
function StarterCards({ cards, onPick }: { cards: StarterCard[]; onPick: (q: string) => void }) {
  const [compact, setCompact] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // 量訊息區：外層的 ref 這時還沒接上（子元件的 layout effect 先跑），從 DOM 找
  useLayoutEffect(() => {
    const el = root.current?.closest<HTMLElement>('.ac-msgs');
    if (!el) return;
    const check = () => setCompact(el.clientHeight < CARDS_COMPACT_BELOW);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={root} className={`ac-cards ${compact ? 'compact' : ''}`} data-testid="chat-cards" data-compact={compact}>
      {cards.map((c, i) => (
        <button key={c.q} type="button" className={`ac-card ${i === 0 ? 'first' : ''}`} onClick={() => onPick(c.q)} data-testid={c.source === 'chip' ? 'chat-suggestion' : 'chat-starter'} data-first={i === 0}>
          <b>{c.q}</b>
          {c.why && <small>{c.why}</small>}
        </button>
      ))}
    </div>
  );
}

export interface ChatBodyProps {
  /** 一個工具呼叫的卡片（每個平台自己畫，或共用 ChatCard） */
  card: (use: ChatToolUse, version: number) => ReactNode;
  /** 還沒有訊息時 */
  empty: ReactNode;
  /** 「正在看：」後面的字 */
  screenLabel: string;
  listOpen: boolean;
  closeList: () => void;
  /** 新對話 */
  onNewChat: () => void;
  /** 對話清單最上面要不要有「開新對話」（手機：半屏頂端放不下 ＋） */
  listNewRow?: boolean;
  /** 輸入框 */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** 晶片列最後多放的東西（手機的「＋ 加地點」） */
  chipsExtra?: ReactNode;
  /** 打開時要不要捲到別的地方（手機：從聊天跳走再回來）；回傳 true 表示捲過了，不用捲到底 */
  initialScroll?: (scroller: HTMLDivElement) => boolean;
  /** 捲動位置變了（手機記下來，回來時還原） */
  onScrollPos?: (scroller: HTMLDivElement, atEnd: boolean) => void;
  /** 輸入框隨字數長高（手機：語音輸入常常一長串） */
  growInput?: boolean;
}

export function ChatBody({ card, empty, screenLabel, listOpen, closeList, onNewChat, listNewRow, inputRef, chipsExtra, initialScroll, onScrollPos, growInput }: ChatBodyProps) {
  const messages = useAi((s) => s.messages);
  const status = useAi((s) => s.status);
  const streaming = useAi((s) => s.streamingText);
  const error = useAi((s) => s.error);
  const contexts = useAi((s) => s.contexts);
  const suggestions = useAi((s) => s.suggestions);
  const lead = useAi((s) => s.lead);
  const plan = usePlan((s) => s.plan);
  const itinerary = useData((s) => s.itinerary);
  const votes = useShared((s) => s.votes);
  const conversations = useAi((s) => s.conversations);
  const currentId = useAi((s) => s.currentId);
  const text = useAi((s) => s.draftText);
  const [down, setDown] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const ownInput = useRef<HTMLTextAreaElement>(null);
  const input = inputRef ?? ownInput;
  const busy = status !== 'idle';
  const usage = conversations.find((c) => c.id === currentId)?.usage ?? 'ok';
  const full = usage === 'full';
  const quota = error?.code === 'quota';
  const turns = useMemo(() => turnsOf(messages, READ_TOOLS), [messages]);
  // 第幾版：照這段對話裡提議出現的順序
  const versions = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of turns) for (const u of t.uses) if (u.block.name === 'propose_changes') m.set(u.block.id, m.size + 1);
    return m;
  }, [turns]);
  const incomplete = busy || error ? null : ai.incomplete();
  // 空白的新對話：卡片照現在的行程和畫面算（換到別天 screenLabel 會變）；按了問 AI 就用那邊帶的建議問題。不呼叫 AI（§17）
  const loaded = useAi((s) => s.loaded);
  const blank = turns.length === 0 && !busy;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 只有這些變了才重算
  const starters = useMemo(() => (blank && loaded ? ai.starters() : []), [blank, loaded, screenLabel, plan, itinerary, votes]);
  const cards = blank && !quota && loaded ? blankCards(lead, suggestions, starters, contexts.length > 0) : [];
  // 對話進行中按問 AI：建議問題放在輸入框上面
  const inlineSuggestions = blank ? [] : [...new Set([...(lead ? [lead.q] : []), ...suggestions])];

  // 打開時：平台要捲到別的地方就不捲到底
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const el = scroller.current;
    if (el && initialScroll?.(el)) {
      const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      stick.current = atEnd;
      setDown(!atEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只有打開時
  }, []);

  // 換對話：捲到最新的
  const lastConv = useRef(currentId);
  useEffect(() => {
    if (lastConv.current !== currentId) stick.current = true;
    lastConv.current = currentId;
  }, [currentId]);

  // 往上看舊訊息時不強制捲到底（§16.1）
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, status, error, currentId, listOpen]);

  // 訊息區變矮（鍵盤、晶片多一行）：本來在最下面的留在最下面
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 輸入框隨字數長高（CSS 的 max-height 擋著）
  useLayoutEffect(() => {
    const el = input.current;
    if (!growInput || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [growInput, text, input]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stick.current = atEnd;
    setDown(!atEnd);
    onScrollPos?.(el, atEnd);
  };

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setDown(false);
  };

  const send = (value: string) => {
    if (busy || !loaded || !value.trim()) return;
    ai.setDraftText('');
    stick.current = true;
    void ai.send(value);
  };

  // 這輪進行中要畫的：放在 Turn 裡字的位置
  const live = busy ? (
    <div data-testid="chat-busy" data-status={status}>
      {status === 'streaming' ? (
        <div className="ac-streaming">
          <RichText text={streamingView(streaming)} />
          <i className="ac-caret" />
        </div>
      ) : (
        <div className="ac-thinking">
          {status === 'tools' ? '查資料中' : '想一下'}
          <span className="ac-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
    </div>
  ) : null;

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 輸入法選字中的 Enter 不算送出
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send(text);
  };

  return (
    <>
      <div className="ac-body">
        {listOpen && <ConversationList list={conversations} current={currentId} onClose={closeList} onNew={listNewRow ? onNewChat : undefined} />}
        <div className="ac-msgs" ref={scroller} onScroll={onScroll} data-testid="chat-messages">
          {blank && (
            <div className="ac-blank">
              {empty}
              {!loaded && (
                <div className="ac-cards-loading" data-testid="chat-loading" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {!!cards.length && <StarterCards cards={cards} onPick={send} />}
            </div>
          )}
          {turns.map((t, i) => (
            <Turn key={t.id} turn={t} last={i === turns.length - 1} versionOf={(id) => versions.get(id) ?? 1} busy={busy} incomplete={t.id === incomplete} card={card} onQuick={send} live={live} />
          ))}
          {error && !quota && (
            <div className="ac-strip err" data-testid="chat-error">
              <span>{error.message}</span>
              <button type="button" className="button small" onClick={() => void ai.retry()} data-testid="chat-retry">
                重試
              </button>
            </div>
          )}
        </div>
        {down && (
          <button type="button" className="ac-down" onClick={toBottom} data-testid="chat-to-bottom">
            回到底部
          </button>
        )}
      </div>
      <div className="ac-foot">
        {usage === 'near' && !full && (
          <div className="ac-strip warn" data-testid="chat-near-full">
            <span>這段對話快滿了</span>
            <button type="button" className="link-button" onClick={onNewChat} data-testid="chat-near-new">
              開新對話
            </button>
          </div>
        )}
        {full ? (
          <>
            <div className="ac-strip warn" data-testid="chat-full">
              <span>這段對話滿了，接著問要開新對話</span>
            </div>
            <button type="button" className="button primary ac-full-new" onClick={onNewChat} data-testid="chat-full-new">
              開新對話
            </button>
          </>
        ) : (
          <>
            {!!inlineSuggestions.length && !busy && !quota && (
              <div className="ac-sugs">
                {inlineSuggestions.map((q) => (
                  <button key={q} type="button" className="ac-sug" onClick={() => send(q)} data-testid="chat-suggestion">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="ac-chips">
              {contexts.map((c, i) => (
                <ContextChip key={c.kind === 'place' ? c.id : c.kind === 'day' ? c.date : `${c.kind}${i}`} context={c} onRemove={() => ai.removeContext(i)} />
              ))}
              {!contexts.length && <ScreenHint label={screenLabel} />}
              {chipsExtra}
            </div>
            {quota && (
              <div className="ac-strip err" data-testid="chat-quota">
                {error.message}
              </div>
            )}
            <div className={`ac-input ${quota ? 'off' : ''}`}>
              <textarea
                ref={input}
                rows={1}
                value={text}
                disabled={quota}
                placeholder={quota ? '今天不能再問了' : '問 AI…'}
                aria-label="問 AI"
                enterKeyHint="send"
                onChange={(e) => ai.setDraftText(e.target.value)}
                onKeyDown={onKey}
                data-testid="chat-input"
              />
              {busy ? (
                <button type="button" className="ac-send stop" aria-label="停止" title="停止" onClick={() => void ai.stop()} data-testid="chat-stop">
                  <i />
                </button>
              ) : (
                <button type="button" className="ac-send" aria-label="送出" disabled={quota || !loaded || !text.trim()} onClick={() => send(text)} data-testid="chat-send">
                  <Icon name="send" size={20} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
