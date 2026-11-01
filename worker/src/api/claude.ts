// Claude API 代理（T16，architecture §6）：工具在瀏覽器執行，這裡只檢查用量、加上 API key、轉發。
// POST /api/claude/messages  { system, tools, messages }，回 NDJSON，一行一個事件：
//   { type: 'text', text }                              逐字進來的字
//   { type: 'done', content, stopReason, usage }        這次回覆完整的 content（thinking 的簽章要原樣留著，下一次送回來）；usage 是這段對話的用量狀態
//   { type: 'error', code, message }                    中途出錯
// 模型、輸出上限由 Worker 決定，瀏覽器不能指定，所以用量上限算得準。

import Anthropic from '@anthropic-ai/sdk';
import type { Ctx, Env } from '../env.ts';
import { badRequest, HttpError, json, readBody } from '../lib/http.ts';

const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_EFFORT = 'medium';
const MAX_OUTPUT_TOKENS = 8000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** 每人每天、全部人每月的上限（美元），可以用 AI_DAILY_USD、AI_MONTHLY_USD 改（2026-11-02 👤 定每月 80） */
const DEFAULT_DAILY_USD = 3;
const DEFAULT_MONTHLY_USD = 80;

/** 這段對話送給模型的 token 數到這裡就算快滿、滿了（規格 §11）：對話越長每一輪越貴，所以門檻看費用，不是模型的上限 */
export const NEAR_TOKENS = 60_000;
export const FULL_TOKENS = 100_000;

/** 每百萬 token 的美元（2026-10 官方價格）。寫入快取是輸入價的 1.25 倍 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** 拒答時伺服器端換模型重跑：只有這些模型支援 */
const SERVER_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** 這些 token 的費用，單位是百萬分之一美元：每百萬 token 1 美元＝每 token 1 單位 */
export function costMicroUsd(model: string, u: TokenUsage): number {
  const p = PRICES[model] ?? PRICES[DEFAULT_MODEL];
  return Math.ceil(u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 1.25);
}

export function contextUsage(tokens: number): 'ok' | 'near' | 'full' {
  return tokens >= FULL_TOKENS ? 'full' : tokens >= NEAR_TOKENS ? 'near' : 'ok';
}

/** 日本時間的日期：用量以日本時間的一天、一個月計 */
const jstDate = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

const limitOf = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value && Number.isFinite(n) && n >= 0 ? n : fallback;
};

async function checkQuota({ db, env, member }: Ctx): Promise<void> {
  const today = jstDate();
  const mine = await db.prepare('SELECT cost_micro_usd AS cost FROM ai_usage WHERE member_id = ? AND date = ?').bind(member.id, today).first<{ cost: number }>();
  if ((mine?.cost ?? 0) >= limitOf(env.AI_DAILY_USD, DEFAULT_DAILY_USD) * 1e6) throw new HttpError(429, 'quota-daily', '你今天的 AI 用量到上限了，明天再來');
  const all = await db.prepare('SELECT SUM(cost_micro_usd) AS cost FROM ai_usage WHERE date >= ? AND date <= ?').bind(`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-31`).first<{ cost: number | null }>();
  if ((all?.cost ?? 0) >= limitOf(env.AI_MONTHLY_USD, DEFAULT_MONTHLY_USD) * 1e6) throw new HttpError(429, 'quota-monthly', '這個月大家的 AI 用量到上限了，請聯絡管理員');
}

async function addUsage({ db, member }: Ctx, model: string, u: TokenUsage): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_usage (member_id, date, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micro_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (member_id, date) DO UPDATE SET
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
         cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
         cost_micro_usd = cost_micro_usd + excluded.cost_micro_usd`,
    )
    .bind(member.id, jstDate(), u.input, u.output, u.cacheRead, u.cacheWrite, costMicroUsd(model, u))
    .run();
}

/** 送給 Claude API 的參數。system、tools 每次都一樣，快取才接得上；瀏覽器給的只有 system、tools、messages */
export function buildParams(env: Env, body: Record<string, unknown>) {
  if (typeof body.system !== 'string' || !body.system) throw badRequest('缺少 system');
  if (!Array.isArray(body.tools)) throw badRequest('缺少 tools');
  if (!Array.isArray(body.messages) || !body.messages.length) throw badRequest('缺少 messages');
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const fallback = SERVER_FALLBACK.has(model);
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    betas: [
      'context-management-2025-06-27',
      'thinking-binding-controls-2026-08-01',
      ...(fallback ? ['server-side-fallback-2026-07-01'] : []),
    ],
    ...(fallback ? { fallbacks: 'default' as const } : {}),
    // 歷史是只增不改的（transcript.ts）；萬一對不上就丟掉舊的思考，不讓使用者看到錯誤
    thinking: { type: 'adaptive' as const, block_binding: { prefix_mismatch_behavior: 'drop_block' as const } },
    output_config: { effort: (env.AI_EFFORT || DEFAULT_EFFORT) as 'low' | 'medium' | 'high' },
    // 兩個快取點：system（所有人共用工具和提示）、對話最新的地方（自動）
    cache_control: { type: 'ephemeral' as const },
    system: [{ type: 'text' as const, text: body.system, cache_control: { type: 'ephemeral' as const } }],
    tools: body.tools as Anthropic.Beta.BetaTool[],
    messages: body.messages as Anthropic.Beta.BetaMessageParam[],
    // 舊的查詢結果在伺服器端清掉：可以讓對話撐久一點，也不算改歷史。卡片的結果要留著（提議、結果集的狀態）
    context_management: {
      edits: [
        {
          type: 'clear_tool_uses_20250919' as const,
          trigger: { type: 'input_tokens' as const, value: 40_000 },
          keep: { type: 'tool_uses' as const, value: 6 },
          clear_at_least: { type: 'input_tokens' as const, value: 5_000 },
          exclude_tools: ['propose_changes', 'show_places', 'draft_comment'],
        },
      ],
    },
  };
}

function friendlyError(e: unknown): { code: 'network' | 'other'; message: string } {
  if (e instanceof Anthropic.RateLimitError) return { code: 'network', message: 'AI 現在比較忙，請稍後再試一次' };
  if (e instanceof Anthropic.APIConnectionError) return { code: 'network', message: '連不上 AI，請再試一次' };
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return { code: 'network', message: 'AI 暫時有問題，請稍後再試一次' };
  console.error('Claude API', e);
  return { code: 'other', message: 'AI 出了問題，請換個問法或稍後再試' };
}

export async function claudeMessages(ctx: Ctx): Promise<Response> {
  const { env, req } = ctx;
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ai-not-configured', message: 'AI 還沒設定好（缺少 ANTHROPIC_API_KEY）' }, { status: 503 });
  await checkQuota(ctx);
  const params = buildParams(env, await readBody(req, MAX_BODY_BYTES));
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const stream = client.beta.messages.stream(params);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let billed = false;
      try {
        for await (const e of stream) {
          if (e.type === 'message_start') {
            // 輸入先記：使用者中途按停止時，已經花掉的錢也要算進去
            const u = e.message.usage;
            await addUsage(ctx, params.model, { input: u.input_tokens, output: 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
            billed = true;
          } else if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
            emit({ type: 'text', text: e.delta.text });
          }
        }
        const message = await stream.finalMessage();
        const u = message.usage;
        await addUsage(ctx, params.model, { input: billed ? 0 : u.input_tokens, output: u.output_tokens, cacheRead: billed ? 0 : (u.cache_read_input_tokens ?? 0), cacheWrite: billed ? 0 : (u.cache_creation_input_tokens ?? 0) });
        const dropped = (message as unknown as { input_transformations?: unknown[] }).input_transformations;
        if (dropped?.length) console.warn('Claude API 丟掉了 thinking', JSON.stringify(dropped));
        if (message.stop_reason === 'refusal') {
          emit({ type: 'error', code: 'other', message: 'AI 不能回答這個問題，請換個問法' });
        } else if (message.stop_reason === 'max_tokens' && message.content.some((b) => b.type === 'tool_use')) {
          // 工具的參數可能被切斷：不能執行
          emit({ type: 'error', code: 'other', message: 'AI 這次要做的事太多，請分成小一點的問題' });
        } else {
          const tokens = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
          emit({ type: 'done', content: message.content, stopReason: message.stop_reason, usage: contextUsage(tokens) });
        }
      } catch (e) {
        if (!(e instanceof Anthropic.APIUserAbortError)) {
          try {
            emit({ type: 'error', ...friendlyError(e) });
          } catch {
            // 使用者已經離開
          }
        }
      }
      try {
        controller.close();
      } catch {
        // 使用者已經離開
      }
    },
    // 使用者按停止或關掉頁面：不再向 Claude API 要字
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
