// 聊天紀錄的整理（規格 §11）：哪一輪沒有回完、要送給模型的歷史。
// Claude API 要求每個工具呼叫都有對應的結果，所以沒有回完的那輪整個不送；重試時才不會留下沒結果的工具呼叫。

import { shortDayLabel } from '../lib/trip.ts';
import type { ApiMessage, CardState, ChatContext, ChatMessage, ContentBlock, ToolUseBlock } from './types.ts';

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

/** 查資料工具的一行灰字 */
export function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'search_places':
      return '找了地點';
    case 'get_place':
      return `看了 ${(input.ids as string[] | undefined)?.length ?? 1} 個地點的資料`;
    case 'get_day':
      return `看了 ${shortDayLabel(String(input.date))}${input.on === 'draft' ? ' 提議後' : ''}的行程`;
    case 'get_trip_overview':
      return '看了整趟行程';
    case 'check_changes':
      return '試算了改動';
    case 'suggest_position':
      return '算了最順路的位置';
    case 'get_route':
      return '查了路線';
    case 'get_timetable':
      return '查了時刻表';
    case 'get_opinions':
      return '看了大家的意見';
    case 'get_trip_info':
      return '查了旅程資料';
    case 'get_reservations':
      return '看了預約清單';
    default:
      return name;
  }
}

/** 畫面上的一個工具呼叫：卡片的狀態和工具的結果 */
export interface ChatToolUse {
  block: ToolUseBlock;
  card?: CardState;
  result?: Record<string, unknown>;
}

/** 畫面上的一輪：使用者的話、查了什麼、AI 的字、卡片、快速選項 */
export interface ChatTurn {
  id: string;
  user: string;
  contexts: ChatContext[];
  reads: ToolUseBlock[];
  texts: string[];
  uses: ChatToolUse[];
  replies: string[];
}

/** 不畫卡片的工具：效果畫在別的地方 */
const NO_CARD = new Set(['suggest_replies', 'decide_card', 'show_again', 'clear_view']);

/** 訊息整理成一輪一輪（readTools：查資料工具的名字，併成一行灰字） */
export function turnsOf(messages: ChatMessage[], readTools: Set<string>): ChatTurn[] {
  const turns = new Map<string, ChatTurn>();
  const results = new Map<string, Record<string, unknown>>();
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type !== 'tool_result') continue;
      try {
        results.set(b.tool_use_id, JSON.parse(b.content));
      } catch {
        // 不是 JSON：當作沒有結果
      }
    }
  }
  for (const m of messages) {
    let t = turns.get(m.turn);
    if (!t) turns.set(m.turn, (t = { id: m.turn, user: '', contexts: [], reads: [], texts: [], uses: [], replies: [] }));
    for (const b of m.content) {
      if (b.type === 'text') {
        if (m.role === 'user') {
          t.user = b.text;
          t.contexts = m.contexts ?? [];
        } else t.texts.push(b.text);
      } else if (b.type === 'tool_use') {
        if (readTools.has(b.name)) t.reads.push(b);
        else if (b.name === 'suggest_replies') t.replies = (b.input.replies as string[] | undefined) ?? [];
        else if (!NO_CARD.has(b.name)) t.uses.push({ block: b, card: m.cards?.[b.id], result: results.get(b.id) });
      }
    }
  }
  return [...turns.values()];
}

export type RichInline = { text: string; bold?: boolean } | { place: string } | { href: string; label: string };
export type RichBlock = { kind: 'p'; parts: RichInline[] } | { kind: 'list'; items: RichInline[][] };

const INLINE = /\[\[place:([^\]]+)\]\]|\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s）)，。、]+)/g;

function parseInline(line: string): RichInline[] {
  const out: RichInline[] = [];
  let at = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    if (m[1]) out.push({ place: m[1] });
    else if (m[2]) out.push({ text: m[2], bold: true });
    else if (m[3]) out.push({ href: m[4], label: m[3] });
    else out.push({ href: m[5], label: /google\.[^/]+\/maps/.test(m[5]) ? 'Google Maps' : '連結' });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

/** 回覆的文字（規格 §5）：地點標籤、粗體、條列、連結；只認 http(s) 的連結，其他 Markdown 照原文 */
export function parseRich(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const li = /^(?:[-*]|・)\s*(.+)$/.exec(line);
    if (li && !line.startsWith('**')) {
      const last = blocks.at(-1);
      if (last?.kind === 'list') last.items.push(parseInline(li[1]));
      else blocks.push({ kind: 'list', items: [parseInline(li[1])] });
    } else blocks.push({ kind: 'p', parts: parseInline(line) });
  }
  return blocks;
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
