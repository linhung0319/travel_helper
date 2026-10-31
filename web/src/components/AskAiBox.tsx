// 詳情的問 AI。
// 手機（AskAiBox，T16m-c 才換）：淡藍框，建議問題（點了就送）＋自己打的輸入框；送出＝askAboutPlace：寫進 uiStore.chatDraft、把地點放進選取。
// 網頁（AskAiButton，§16.1）：一顆按鈕，建議問題和輸入都到聊天欄。

import { useState, type FormEvent } from 'react';
import type { Place } from '../data/types.ts';
import { askAiPrompts } from '../shared/askAiPrompts.ts';
import { askAboutPlace } from '../uiStore.ts';
import { Icon } from './Icon.tsx';
import { askPlace } from './webAi.ts';

export function AskAiButton({ place }: { place: Place }) {
  return (
    <button type="button" className="ask-ai-button" onClick={() => askPlace(place.id)} data-testid="detail-ask-ai">
      <Icon name="spark" size={20} />問 AI 關於「{place.name.zh || place.name.ja}」
    </button>
  );
}

export function AskAiBox({ place, fromTrip }: { place: Place; fromTrip: boolean }) {
  const [value, setValue] = useState('');
  const from = fromTrip ? 'trip' : 'other';
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    askAboutPlace(place.id, t, from);
    setValue('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(value);
  };
  return (
    <section className="ask-ai-box" data-testid="ask-ai-box">
      <h3 className="ask-ai-title ic-text">
        <Icon name="spark" size={20} />問 AI 關於「{place.name.zh || place.name.ja}」
      </h3>
      <div className="ask-ai-prompts">
        {askAiPrompts(place.type, fromTrip).map((q) => (
          <button key={q} type="button" className="ask-ai-prompt" data-testid="ask-ai-prompt" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form className="ask-ai-form" onSubmit={submit}>
        <input className="ask-ai-input" data-testid="ask-ai-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="或自己問…" aria-label="問 AI" />
        <button type="submit" className="ask-ai-send" aria-label="送出" disabled={!value.trim()}>
          <Icon name="send" size={20} />
        </button>
      </form>
    </section>
  );
}
