// 網頁版左欄的聊天（T16m-b，interaction-design §16.1）：頂端（對話清單、新對話）、訊息、輸入框上面的建議問題和晶片、輸入框。
// 只讀 ai.store、呼叫 ai 的動作；一輪怎麼畫在 ai/transcript.ts 的 turnsOf，卡片在 ChatCards.tsx。

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { ai } from '../appAi.ts';
import { useApp, useData } from '../hooks.ts';
import { dayLabel, shortDayLabel } from '../lib/trip.ts';
import { filterChips } from '../lib/filter.ts';
import { toolLabel, turnsOf, type ChatTurn } from '../ai/transcript.ts';
import type { ChatContext, ConversationSummary } from '../ai/types.ts';
import { ChatCard } from './ChatCards.tsx';
import { RichText, TypeStamp, usePlaceName } from './ChatRich.tsx';
import { Icon } from './Icon.tsx';
import { registerChatInput } from './webAi.ts';
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

/** 「正在看」：沒有晶片時的灰色提示，也會帶給 AI，可以 ✕ */
function ScreenHint() {
  const mode = useApp((s) => s.mode);
  const day = useApp((s) => s.day);
  const detail = useApp((s) => s.detailId);
  const selected = useApp((s) => s.selectedId);
  const off = useAi((s) => s.screenOff);
  const id = detail ?? (mode === 'map' ? null : selected);
  const name = usePlaceName(id ?? '');
  if (off) return null;
  const label = id ? name : mode === 'map' ? (day === 'all' ? '整趟' : shortDayLabel(day)) : mode === 'wish' ? '想去' : '探索';
  return (
    <span className="ac-chip see" data-testid="chat-screen-hint">
      <span className="ac-chip-text">正在看：{label}</span>
      <button type="button" aria-label="不要帶正在看的畫面" onClick={() => ai.setScreenOff(true)}>
        <Icon name="close" size={16} />
      </button>
    </span>
  );
}

function ConversationList({ list, current, onClose }: { list: ConversationSummary[]; current: string | null; onClose: () => void }) {
  return (
    <div className="ac-drawer" data-testid="chat-conversations">
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

function Turn({ turn, last, versionOf, busy, incomplete }: { turn: ChatTurn; last: boolean; versionOf: (id: string) => number; busy: boolean; incomplete: boolean }) {
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
        {turn.uses.map((u) => (
          <ChatCard key={u.block.id} use={u} version={versionOf(u.block.id)} />
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
              <button key={r} type="button" className="ac-quick-btn" onClick={() => void ai.send(r)} data-testid="chat-quick">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function ChatPanel() {
  const messages = useAi((s) => s.messages);
  const status = useAi((s) => s.status);
  const streaming = useAi((s) => s.streamingText);
  const error = useAi((s) => s.error);
  const contexts = useAi((s) => s.contexts);
  const suggestions = useAi((s) => s.suggestions);
  const conversations = useAi((s) => s.conversations);
  const currentId = useAi((s) => s.currentId);
  const [listOpen, setListOpen] = useState(false);
  const [text, setText] = useState('');
  const [down, setDown] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    registerChatInput(() => input.current?.focus());
    return () => registerChatInput(null);
  }, []);

  // 換對話：捲到最新的
  useEffect(() => {
    stick.current = true;
  }, [currentId]);

  // 往上看舊訊息時不強制捲到底（§16.1）
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, status, error, currentId, listOpen]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stick.current = atEnd;
    setDown(!atEnd);
  };

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setDown(false);
  };

  const send = (value: string) => {
    if (busy || !value.trim()) return;
    setText('');
    stick.current = true;
    void ai.send(value);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 輸入法選字中的 Enter 不算送出
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    send(text);
  };

  const newChat = () => {
    setListOpen(false);
    void ai.newConversation();
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <div className="chat-panel" data-testid="chat-panel">
      <header className="chat-head">
        <Icon name="spark" size={20} /> {listOpen ? '對話' : 'AI 助理'}
        <span className="chat-head-end">
          <button type="button" className={`ac-head-btn ${listOpen ? 'on' : ''}`} aria-label="對話清單" aria-expanded={listOpen} title="對話清單" onClick={() => setListOpen(!listOpen)} data-testid="chat-list-toggle">
            <Icon name="list" size={20} />
          </button>
          <button type="button" className="ac-head-btn" aria-label="新對話" title="新對話" onClick={newChat} data-testid="chat-new">
            <Icon name="plus" size={20} />
          </button>
        </span>
      </header>
      <div className="ac-body">
        {listOpen && <ConversationList list={conversations} current={currentId} onClose={() => setListOpen(false)} />}
        <div className="ac-msgs" ref={scroller} onScroll={onScroll} data-testid="chat-messages">
          {turns.length === 0 && !busy && (
            <p className="ac-empty" data-testid="chat-empty">
              選一個問題，或自己打。
              <br />
              也可以把卡片拖到這裡。
            </p>
          )}
          {turns.map((t, i) => (
            <Turn key={t.id} turn={t} last={i === turns.length - 1} versionOf={(id) => versions.get(id) ?? 1} busy={busy} incomplete={t.id === incomplete} />
          ))}
          {busy && (
            <div className="ac-ai" data-testid="chat-busy" data-status={status}>
              {status === 'streaming' ? (
                <div className="ac-streaming">
                  {/* 還沒進來完的地點標籤先不顯示 */}
                  <RichText text={streaming.replace(/\[\[[^\]]*\]?$/, '')} />
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
          )}
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
            <button type="button" className="link-button" onClick={newChat} data-testid="chat-near-new">
              開新對話
            </button>
          </div>
        )}
        {full ? (
          <>
            <div className="ac-strip warn" data-testid="chat-full">
              <span>這段對話滿了，接著問要開新對話</span>
            </div>
            <button type="button" className="button primary" onClick={newChat} data-testid="chat-full-new">
              開新對話
            </button>
          </>
        ) : (
          <>
            {!!suggestions.length && !busy && !quota && (
              <div className="ac-sugs">
                {suggestions.map((q) => (
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
              {!contexts.length && <ScreenHint />}
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
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                data-testid="chat-input"
              />
              {busy ? (
                <button type="button" className="ac-send stop" aria-label="停止" title="停止" onClick={() => void ai.stop()} data-testid="chat-stop">
                  <i />
                </button>
              ) : (
                <button type="button" className="ac-send" aria-label="送出" disabled={quota || !text.trim()} onClick={() => send(text)} data-testid="chat-send">
                  <Icon name="send" size={20} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
