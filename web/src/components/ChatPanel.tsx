// 網頁版左欄的聊天（T16m-b，interaction-design §16.1）：頂端（對話清單、新對話）加共用的 ChatBody；卡片是 ChatCards.tsx。

import { useEffect, useRef, useState } from 'react';
import { ai } from '../appAi.ts';
import { useApp } from '../hooks.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { ChatBody } from './ChatBody.tsx';
import { ChatCard } from './ChatCards.tsx';
import { usePlaceName } from './ChatRich.tsx';
import { Icon } from './Icon.tsx';
import { registerChatInput } from './webAi.ts';

/** 「正在看：」後面的字：詳情、選中的點、這天、探索、想去 */
function useScreenLabel(): string {
  const mode = useApp((s) => s.mode);
  const day = useApp((s) => s.day);
  const detail = useApp((s) => s.detailId);
  const selected = useApp((s) => s.selectedId);
  const id = detail ?? (mode === 'map' ? null : selected);
  const name = usePlaceName(id ?? '');
  return id ? name : mode === 'map' ? (day === 'all' ? '整趟' : shortDayLabel(day)) : mode === 'wish' ? '想去' : '探索';
}

export function ChatPanel() {
  const [listOpen, setListOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const screenLabel = useScreenLabel();

  useEffect(() => {
    registerChatInput(() => input.current?.focus());
    return () => registerChatInput(null);
  }, []);

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
      <ChatBody
        card={(use, version) => <ChatCard use={use} version={version} />}
        empty={
          <p className="ac-empty" data-testid="chat-empty">
            選下面的問題，或自己打。
            <br />
            也可以把卡片拖到這裡。
          </p>
        }
        screenLabel={screenLabel}
        listOpen={listOpen}
        closeList={() => setListOpen(false)}
        onNewChat={newChat}
        inputRef={input}
      />
    </div>
  );
}
