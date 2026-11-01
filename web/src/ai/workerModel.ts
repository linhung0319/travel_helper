// 真的模型：呼叫 Worker 的 /api/claude/messages（T16，architecture §6）。API key 在 Worker，這裡看不到。
// Worker 回 NDJSON（格式見 worker/src/api/claude.ts），這裡轉成 ModelEvent；工具還是在瀏覽器執行（chat.ts）。

import { ModelError, type ContentBlock, type ContextUsage, type ModelClient, type ModelEvent, type ModelRequest } from './types.ts';

type WireEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; content: ContentBlock[]; usage: ContextUsage }
  | { type: 'error'; code: 'network' | 'other'; message: string };

export interface WorkerModelOptions {
  /** 測試、對話腳本的評估接到 Worker 的處理函式 */
  fetch?: typeof fetch;
  url?: string;
  /** 登入過期 */
  onLoggedOut?: () => void;
}

export function createWorkerModel(opts: WorkerModelOptions = {}): ModelClient {
  const url = opts.url ?? '/api/claude/messages';
  return {
    async *send(request: ModelRequest, signal: AbortSignal): AsyncGenerator<ModelEvent> {
      const doFetch = opts.fetch ?? fetch;
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          // context 已經跟著訊息進了 messages（transcript.ts）
          body: JSON.stringify({ system: request.system, tools: request.tools, messages: request.messages }),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new ModelError('network', '連不上伺服器，請檢查網路再試一次');
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (res.status === 401) opts.onLoggedOut?.();
        throw new ModelError(res.status === 429 ? 'quota' : 'other', e.message ?? `AI 暫時不能用（${res.status}）`);
      }
      if (!res.body) throw new ModelError('other', 'AI 沒有回應，請再試一次');

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let finished = false;
      const handle = (line: string): ModelEvent | null => {
        if (!line.trim()) return null;
        const e = JSON.parse(line) as WireEvent;
        if (e.type === 'error') throw new ModelError(e.code, e.message);
        if (e.type === 'done') finished = true;
        return e.type === 'text' ? e : { type: 'done', usage: e.usage, content: e.content };
      };
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const event = handle(line);
            if (event) yield event;
          }
        }
        const event = handle(buffer);
        if (event) yield event;
      } catch (e) {
        if (signal.aborted || e instanceof ModelError) throw e;
        throw new ModelError('network', '連線中斷了，請再試一次');
      }
      if (!finished) throw new ModelError('network', '連線中斷了，請再試一次');
    },
  };
}
