// 假 AI（T16m）：實作 ModelClient，輸入是對話和脈絡，輸出是文字和工具呼叫（格式同 Claude API）。只在 dev server 有。
// 狀態用 settings 切換（dev 選單、Playwright）：延遲、用量、下一次出錯、超過每天上限。

import { ModelError, type ApiMessage, type ContextUsage, type ModelClient, type ModelEvent, type ModelRequest, type ToolUseBlock } from '../../ai/types.ts';
import { fallbackText, findScript, type ScriptEnv } from './scripts.ts';

export interface FakeSettings {
  /** 思考的時間、逐字之間的延遲（毫秒） */
  delayMs: number;
  usage: ContextUsage;
  /** 下一次（或第幾輪）的狀況：error＝網路錯誤；quota＝超過每天上限；hang＝一直不回（測關閉頁面） */
  next: 'error' | 'quota' | 'hang' | null;
}

/** 這輪使用者說的話：最後一則有文字的 user 訊息；回傳它之後的訊息 */
function lastUserTurn(messages: ApiMessage[]): { text: string; after: ApiMessage[] } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const t = m.content.find((b) => b.type === 'text');
    if (t?.type === 'text') return { text: t.text, after: messages.slice(i + 1) };
  }
  return { text: '', after: [] };
}

function resultsOf(after: ApiMessage[]): Record<string, unknown> {
  const uses = new Map<string, ToolUseBlock>();
  const out: Record<string, unknown> = {};
  for (const m of after) {
    for (const b of m.content) {
      if (b.type === 'tool_use') uses.set(b.id, b);
      else if (b.type === 'tool_result') {
        const name = uses.get(b.tool_use_id)?.name;
        if (name) out[name] = JSON.parse(b.content);
      }
    }
  }
  return out;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

export function createFakeModel(init: Partial<FakeSettings> = {}): ModelClient & { settings: FakeSettings } {
  const settings: FakeSettings = { delayMs: 0, usage: 'ok', next: null, ...init };

  return {
    settings,
    async *send(request: ModelRequest, signal: AbortSignal): AsyncGenerator<ModelEvent> {
      const pause = async (ms: number) => {
        if (ms > 0) await wait(ms, signal);
      };
      await pause(settings.delayMs);
      const { next } = settings;
      settings.next = null;
      if (next === 'error') throw new ModelError('network', '連不上 AI，請再試一次');
      if (next === 'quota') throw new ModelError('quota', '今天的 AI 用量到上限了，明天再來');
      if (next === 'hang') {
        await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      const { text, after } = lastUserTurn(request.messages);
      const env: ScriptEnv = { text, context: request.context, results: resultsOf(after) };
      const script = findScript(env);
      // 第幾步：這輪 AI 已經回了幾次
      const step = after.filter((m) => m.role === 'assistant').length;
      const out = script ? (script.steps[step]?.(env) ?? {}) : { text: fallbackText() };
      if (out.text) {
        // 逐字顯示
        const chars = [...out.text];
        for (let i = 0; i < chars.length; i += 6) {
          await pause(settings.delayMs ? 16 : 0);
          yield { type: 'text', text: chars.slice(i, i + 6).join('') };
        }
      }
      for (const t of out.tools ?? []) yield { type: 'tool_use', id: `toolu_${crypto.randomUUID()}`, name: t.name, input: t.input };
      yield { type: 'done', usage: settings.usage };
    },
  };
}
