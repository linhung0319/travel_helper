// 手機版聊天的內容（interaction-design §16.2）：AI 分頁（ChatPage）和行程頁的半屏聊天（ChatSheet）共用同一段對話。
// 內容是網頁也在用的 components/ChatBody；這裡只給手機的東西：卡片（MobileChatCards）、沒有對話時的說明、「＋ 加地點」、點地點的規則、捲動位置。

import { useStore } from 'zustand';
import { ai } from '../appAi.ts';
import { ChatBody } from '../components/ChatBody.tsx';
import { PlaceTagAction } from '../components/ChatRich.tsx';
import { ChatCardMobile } from './MobileChatCards.tsx';
import { PlacePicker } from './PlacePicker.tsx';
import { restoreChatScroll, saveChatScroll, tapPlace, useScreenLabel } from './mobileAi.ts';
import { mobileStore, useMobile } from './mobileStore.ts';
import './chat.css';

function Empty() {
  const asking = useStore(ai.store, (s) => s.suggestions.length > 0);
  // 按了問 AI：下面已經有建議問題，這裡不再多說
  if (asking) return null;
  return (
    <div className="m-chat-empty" data-testid="chat-empty">
      <p>問我行程的事。可以打字，也可以按鍵盤上的麥克風用說的。</p>
    </div>
  );
}

/** 聊天。variant：page＝AI 分頁、sheet＝半屏（輪播換成矮的橫卡） */
export function ChatView({ variant }: { variant: 'page' | 'sheet' }) {
  const overlay = useMobile((s) => s.chatOverlay);
  const screenLabel = useScreenLabel();
  const m = mobileStore.getState();
  return (
    <PlaceTagAction.Provider value={tapPlace}>
      <div className="m-chat" data-variant={variant}>
        <ChatBody
          card={(use, version) => <ChatCardMobile use={use} version={version} />}
          empty={<Empty />}
          screenLabel={screenLabel}
          listOpen={overlay === 'list'}
          closeList={() => m.setChatOverlay(null)}
          onNewChat={() => {
            m.setChatOverlay(null);
            void ai.newConversation();
          }}
          listNewRow
          chipsExtra={
            <button type="button" className="ac-chip add" onClick={() => m.setChatOverlay('picker')} data-testid="chat-add-place">
              <span className="ac-chip-text">＋ 加地點</span>
            </button>
          }
          initialScroll={restoreChatScroll}
          onScrollPos={(el, atEnd) => saveChatScroll(el.scrollTop, atEnd)}
          growInput
        />
      </div>
      {overlay === 'picker' && <PlacePicker />}
    </PlaceTagAction.Provider>
  );
}
