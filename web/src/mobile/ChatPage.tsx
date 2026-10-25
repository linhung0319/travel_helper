// 手機版「✨ AI」分頁（第六輪 §3.6 的 B6-A）：全螢幕聊天。最上面是標題和用量（用量 T16m 接上），下面是共用的 ChatView。
// 行程頁的半屏聊天（ChatSheet）往上拉就是這一頁，同一份對話。

import { ChatView } from './ChatView.tsx';

export function ChatPage() {
  return (
    <div className="m-chat-page" data-testid="m-chat-page">
      <header className="m-chat-head">
        <h2 className="m-h2">✨ AI 助理</h2>
        <span className="muted small">用量（T16 接上）</span>
      </header>
      <ChatView variant="page" />
    </div>
  );
}
