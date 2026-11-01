// 行程頁的半屏聊天（interaction-design §16.2）：從下面升到可視高度的 55%，上面還看得到地圖（MobileApp 的 data-chat 讓地圖縮到聊天上面，提議、路線畫在看得到的地方）。
// 蓋在分頁列和行程面板上面：portal 到 body、position: fixed（.m-page 有自己的 z-index，裡面的東西蓋不過分頁列）；整頁詳情還是蓋在它上面。編輯中也打得開。
// 把手往上拉（或按 ⤢）＝拉滿，還是同一個半屏，不切分頁；往下拉：拉滿的收回半屏，半屏的關掉。✕ 關掉：提議、結果集都留著（§3.4）。

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../hooks.ts';
import { dayLabel } from '../lib/trip.ts';
import { Icon } from '../components/Icon.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';
import { ChatView } from './ChatView.tsx';

/** 拉多少（px）才算 */
const DRAG = 40;

export function ChatSheet() {
  const open = useMobile((s) => s.chatSheet && s.tab === 'trip');
  const full = useMobile((s) => s.chatFull);
  const overlay = useMobile((s) => s.chatOverlay);
  const day = useApp((s) => s.day);
  const startY = useRef<number | null>(null);
  if (!open) return null;
  const { closeChatSheet, setChatFull, setChatOverlay } = mobileStore.getState();
  return createPortal(
    <section className="m-chat-sheet" role="dialog" aria-label="AI 聊天" data-testid="m-chat-sheet" data-full={full || undefined}>
      <div
        className="m-chat-sheet-grab"
        onPointerDown={(e) => {
          // 按鈕（☰、⤢、✕）自己處理；抓住指標的話 click 會跑到把手上
          if ((e.target as Element).closest('button')) return;
          startY.current = e.clientY;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (startY.current === null) return;
          const dy = e.clientY - startY.current;
          if (dy < -DRAG) {
            startY.current = null;
            setChatFull(true);
          } else if (dy > DRAG) {
            startY.current = null;
            if (full) setChatFull(false);
            else closeChatSheet();
          }
        }}
        onPointerUp={() => (startY.current = null)}
        onPointerCancel={() => (startY.current = null)}
        data-testid="m-chat-sheet-grab"
      >
        <span className="m-chat-sheet-handle" aria-hidden />
        <div className="m-chat-sheet-head">
          <b className="m-ellipsis ic-text">
            <Icon name="spark" size={16} /> AI ・ {day === 'all' ? '整趟' : dayLabel(day)}
          </b>
          <button type="button" className="m-icon-button" aria-label="對話清單" aria-expanded={overlay === 'list'} onClick={() => setChatOverlay(overlay === 'list' ? null : 'list')} data-testid="chat-list-toggle">
            <Icon name="list" size={20} />
          </button>
          <button type="button" className="m-icon-button" onClick={() => setChatFull(!full)} aria-label={full ? '收回半屏' : '拉滿'} data-testid="m-chat-sheet-expand">
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
