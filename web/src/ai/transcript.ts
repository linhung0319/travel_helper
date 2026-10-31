// 聊天紀錄的整理（規格 §11）：哪一輪沒有回完、要送給模型的歷史。
// Claude API 要求每個工具呼叫都有對應的結果，所以沒有回完的那輪整個不送；重試時才不會留下沒結果的工具呼叫。

import type { ApiMessage, ChatMessage, ContentBlock } from './types.ts';

/** 這些訊息裡每一輪有沒有回完 */
export function completedTurns(messages: ChatMessage[]): Set<string> {
  return new Set(messages.filter((m) => m.end).map((m) => m.turn));
}

/** 最後一輪沒有回完時回傳它的 ID（關掉頁面、出錯）；openTurn 是還在跑的那輪，不算 */
export function incompleteTurn(messages: ChatMessage[], openTurn: string | null = null): string | null {
  const last = messages.at(-1);
  if (!last || last.turn === openTurn) return null;
  return completedTurns(messages).has(last.turn) ? null : last.turn;
}

/** 要送給模型的歷史：只留回完的輪和還在跑的那輪；只有 role、content。空的訊息（AI 最後沒有話要說，只用來標一輪結束）不送，API 不收 */
export function toApiMessages(messages: ChatMessage[], openTurn: string | null = null): ApiMessage[] {
  const done = completedTurns(messages);
  return messages.filter((m) => m.content.length > 0 && (done.has(m.turn) || m.turn === openTurn)).map(({ role, content }) => ({ role, content }));
}

/** 訊息裡給人看的文字 */
export function textOf(content: ContentBlock[]): string {
  return content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}

/** 對話的標題：第一句話的開頭 */
export function titleFrom(text: string, max = 20): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return [...t].length > max ? `${[...t].slice(0, max).join('')}…` : t;
}

const TAG = /\[\[place:([^\]]+)\]\]/g;

/** 回覆的文字拆成字和地點標籤（`[[place:<id>]]`）：畫面畫成可以點的標籤 */
export function splitPlaceTags(text: string): ({ text: string } | { placeId: string })[] {
  const out: ({ text: string } | { placeId: string })[] = [];
  let at = 0;
  for (const m of text.matchAll(TAG)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ placeId: m[1] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
