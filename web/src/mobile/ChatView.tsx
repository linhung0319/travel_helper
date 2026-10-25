// 手機版聊天的內容（第六輪 §3.6）：AI 分頁（ChatPage）和行程頁的半屏聊天（ChatSheet）共用。
// 上面是訊息列表（chatDemo 的佔位對話：照片卡左右滑、提議卡），下面是輸入框，輸入框上面是上下文小標：
// 有 chatDraft.placeId 時「📍 關於：{名稱}」，否則「📍 正在看：{這天}」；✕ 清掉（clearChatContext）。
// 手機鍵盤打開時（visualViewport 變矮），輸入框往上推到鍵盤上面：半屏聊天整塊往上（ChatSheet 讀 useKeyboardInset），AI 分頁只推輸入框。

import { useEffect, useRef, useState } from 'react';
import { useApp, useData, useUi } from '../hooks.ts';
import { dayLabel } from '../lib/trip.ts';
import type { Place } from '../data/types.ts';
import { castVote } from '../components/Votes.tsx';
import { placeAreaLabel, useVoteIndex } from './ExploreFeed.tsx';
import { Thumb } from './Thumb.tsx';
import { mobileStore } from './mobileStore.ts';
import { clearChatContext, proposalTodo, sendChat, useChatDemo, viewDemoProposal, type ChatMessage } from './chatDemo.ts';
import './chat.css';

/** 手機鍵盤蓋住的高度（px）：visualViewport 比版面矮的那一段；沒有鍵盤是 0 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** 照片卡：照片、名稱、地區，下面 🤍／❤️ 和「詳情」 */
function PlaceCard({ place, like }: { place: Place; like: { mine: string | null; like: number } }) {
  const areas = useData((s) => s.areas);
  const on = like.mine === 'like';
  const name = place.name.zh || place.name.ja;
  return (
    <div className="m-chat-place" data-testid="m-chat-place" data-id={place.id}>
      <span className="m-chat-place-photo">
        <Thumb place={place} size="fill" />
      </span>
      <span className="m-chat-place-name m-ellipsis">{name}</span>
      <span className="m-chat-place-meta m-ellipsis">{placeAreaLabel(place, areas)}</span>
      <span className="m-chat-place-actions">
        <button
          type="button"
          className={`m-chat-place-like ${on ? 'on' : ''}`}
          aria-pressed={on}
          aria-label={on ? `收回 ❤️ ${name}` : `按 ❤️ 想去 ${name}`}
          onClick={() => void castVote(place.id, on ? null : 'like')}
          data-testid="m-chat-place-like"
        >
          {on ? '❤️' : '🤍'}
          {like.like > 0 && <span className="m-vote-count">{like.like}</span>}
        </button>
        <button type="button" className="m-chat-place-detail" onClick={() => mobileStore.getState().openPlace(place.id, 'ai')} data-testid="m-chat-place-detail">
          詳情
        </button>
      </span>
    </div>
  );
}

/** 照片卡輪播（左右滑） */
function PlaceCarousel({ ids }: { ids: string[] }) {
  const byId = useData((s) => s.byId);
  const voteOf = useVoteIndex();
  const places = ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
  if (!places.length) return null;
  return (
    <div className="m-chat-carousel" data-testid="m-chat-carousel">
      {places.map((p) => (
        <PlaceCard key={p.id} place={p} like={voteOf(p.id)} />
      ))}
    </div>
  );
}

/** 提議卡：哪天、＋／－ 的點，下面「🗺 在行程上看」「套用」「不要」 */
function ProposalCard({ proposal }: { proposal: NonNullable<ChatMessage['proposal']> }) {
  const byId = useData((s) => s.byId);
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? p.name.zh || p.name.ja : id;
  };
  return (
    <div className="m-chat-proposal" data-testid="m-chat-proposal">
      <b>提議：{dayLabel(proposal.date)}</b>
      {proposal.lines.map((l) => (
        <div key={`${l.op}-${l.placeId}`} className={`m-chat-proposal-line ${l.op}`}>
          {l.op === 'add' ? '＋' : '－'} {nameOf(l.placeId)}
          {l.note && `（${l.note}）`}
        </div>
      ))}
      <div className="m-chat-proposal-actions">
        <button type="button" className="m-chat-button" onClick={viewDemoProposal} data-testid="m-chat-proposal-view">
          🗺 在行程上看
        </button>
        <button type="button" className="m-chat-button primary" onClick={proposalTodo} data-testid="m-chat-proposal-apply">
          套用
        </button>
        <button type="button" className="m-chat-button" onClick={proposalTodo} data-testid="m-chat-proposal-reject">
          不要
        </button>
      </div>
    </div>
  );
}

/** 上下文小標：📍 關於：地點／📍 正在看：這天，✕ 拿掉 */
function ContextChip() {
  const placeId = useUi((s) => s.chatDraft?.placeId ?? null);
  const day = useApp((s) => s.day);
  const byId = useData((s) => s.byId);
  const off = useChatDemo((s) => s.contextOff);
  if (!placeId && off) return null;
  const place = placeId ? byId.get(placeId) : undefined;
  const text = placeId ? `📍 關於：${place ? place.name.zh || place.name.ja : placeId}` : `📍 正在看：${day === 'all' ? '整趟' : dayLabel(day)}`;
  return (
    <div className="m-chat-context" data-testid="m-chat-context">
      <span className="m-ellipsis">{text}</span>
      <button type="button" className="m-chat-context-clear" onClick={clearChatContext} aria-label="拿掉上下文" data-testid="m-chat-context-clear">
        ✕
      </button>
    </div>
  );
}

/** 聊天：訊息列表＋上下文小標＋輸入框。variant：page＝AI 分頁（鍵盤時輸入框自己往上推）、sheet＝半屏（整塊由 ChatSheet 推） */
export function ChatView({ variant }: { variant: 'page' | 'sheet' }) {
  const messages = useChatDemo((s) => s.messages);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset();

  // 有新訊息：捲到最下面
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = () => {
    if (!text.trim()) return;
    sendChat(text);
    setText('');
  };

  return (
    <div className="m-chat" data-variant={variant}>
      <div className="m-chat-list" ref={listRef} data-testid="m-chat-list">
        <p className="m-chat-note muted small">AI 聊天（T16 接上）：下面是示範的樣子</p>
        {messages.map((m) => (
          <div key={m.id} className={`m-chat-row ${m.who}`}>
            <div className={`m-chat-msg ${m.who}`} data-testid="m-chat-msg" data-who={m.who}>
              {m.text}
            </div>
            {m.places && <PlaceCarousel ids={m.places} />}
            {m.proposal && <ProposalCard proposal={m.proposal} />}
          </div>
        ))}
      </div>
      {/* AI 分頁：鍵盤蓋住的是分頁列以下那段，扣掉分頁列的高度 */}
      <div className="m-chat-composer" style={variant === 'page' && keyboard > 0 ? { paddingBottom: `max(8px, calc(${keyboard}px - var(--m-tabbar-h)))` } : undefined}>
        <ContextChip />
        <form
          className="m-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className="m-chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="問 AI…"
            enterKeyHint="send"
            aria-label="問 AI"
            data-testid="m-chat-input"
          />
          <button type="submit" className="m-chat-send" aria-label="送出" disabled={!text.trim()} data-testid="m-chat-send">
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
