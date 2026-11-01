// 手機版「AI」分頁：全螢幕聊天。最上面是標題、對話清單、新對話（interaction-design §16.2），下面是共用的 ChatView。
// 行程頁的半屏聊天（ChatSheet）是同一段對話；跳到地圖、探索、行程再按底部的「AI」都回到這裡。

import { ai } from '../appAi.ts';
import { Icon } from '../components/Icon.tsx';
import { ChatView } from './ChatView.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';

export function ChatPage() {
  const overlay = useMobile((s) => s.chatOverlay);
  const { setChatOverlay } = mobileStore.getState();
  const listOpen = overlay === 'list';
  return (
    <div className="m-chat-page" data-testid="m-chat-page">
      <header className="m-chat-head">
        <h2 className="m-h2 ic-text">
          <Icon name="spark" size={20} /> {listOpen ? '對話' : 'AI 助理'}
        </h2>
        <span className="m-chat-head-end">
          <button type="button" className={`ac-head-btn ${listOpen ? 'on' : ''}`} aria-label="對話清單" aria-expanded={listOpen} onClick={() => setChatOverlay(listOpen ? null : 'list')} data-testid="chat-list-toggle">
            <Icon name="list" size={20} />
          </button>
          <button
            type="button"
            className="ac-head-btn"
            aria-label="新對話"
            onClick={() => {
              setChatOverlay(null);
              void ai.newConversation();
            }}
            data-testid="chat-new"
          >
            <Icon name="plus" size={20} />
          </button>
        </span>
      </header>
      <ChatView variant="page" />
    </div>
  );
}
