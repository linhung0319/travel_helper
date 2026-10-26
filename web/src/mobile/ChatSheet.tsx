// 行程頁的半屏聊天（第六輪 §3.6 的 B6-B）：按這天的 ✨（或提議卡的「🗺 在行程上看」、從行程打開的詳情問 AI）從下面升到螢幕高度的 55%，
// 上面還看得到地圖（MobileApp 的 data-chat 讓地圖縮到聊天上面，提議、路線畫在看得到的地方）。
// 蓋在分頁列和行程面板上面：portal 到 body、position: fixed（.m-page 有自己的 z-index，裡面的東西蓋不過分頁列）；整頁詳情還是蓋在它上面。
// 把手往上拉（或按 ⤢）＝全螢幕，就是 AI 分頁（同一份對話）；✕ 關掉。手機鍵盤打開時整塊往上推到鍵盤上面。

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../hooks.ts';
import { dayLabel } from '../lib/trip.ts';
import { Icon } from '../components/Icon.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { ChatView, useKeyboardInset } from './ChatView.tsx';

/** 往上拉多少（px）就變全螢幕 */
const EXPAND_DRAG = 40;

export function ChatSheet() {
  const open = useMobile((s) => s.chatSheet && s.tab === 'trip');
  const planning = useApp((s) => s.planning);
  const day = useApp((s) => s.day);
  const keyboard = useKeyboardInset();
  const startY = useRef<number | null>(null);
  if (!open || planning) return null;
  const { closeChatSheet, expandChat } = mobileStore.getState();
  return createPortal(
    <section
      className="m-chat-sheet"
      role="dialog"
      aria-label="AI 聊天"
      data-testid="m-chat-sheet"
      style={keyboard > 0 ? { bottom: keyboard, height: `min(55dvh, calc(100dvh - ${keyboard}px - 48px))` } : undefined}
    >
      <div
        className="m-chat-sheet-grab"
        onPointerDown={(e) => {
          // 按鈕（⤢、✕）自己處理；抓住指標的話 click 會跑到把手上
          if ((e.target as Element).closest('button')) return;
          startY.current = e.clientY;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (startY.current === null || startY.current - e.clientY < EXPAND_DRAG) return;
          startY.current = null;
          expandChat();
        }}
        onPointerUp={() => (startY.current = null)}
        onPointerCancel={() => (startY.current = null)}
        data-testid="m-chat-sheet-grab"
      >
        <span className="m-chat-sheet-handle" aria-hidden />
        <div className="m-chat-sheet-head">
          <b className="m-ellipsis ic-text">
            <Icon name="spark" size={16} /> AI ・ {day === 'all' ? '整趟' : dayLabel(day)}</b>
          <button type="button" className="m-icon-button" onClick={expandChat} aria-label="全螢幕" data-testid="m-chat-sheet-expand">
            <Icon name="expand" size={20} />
          </button>
          <button type="button" className="m-icon-button" onClick={closeChatSheet} aria-label="關掉聊天" data-testid="m-chat-sheet-close">
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
      <ChatView variant="sheet" />
    </section>,
    document.body,
  );
}
