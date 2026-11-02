// Claude 代理和聊天紀錄（T16）：真的 SDK，接到本機假的 Claude API，不花錢。

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handle } from '../src/index.ts';
import { contextUsage, costMicroUsd, FULL_TOKENS, NEAR_TOKENS } from '../src/api/claude.ts';
import type { Env } from '../src/env.ts';
import { freshDb, type FakeD1 } from './helpers/d1.ts';

interface Upstream {
  usage: Record<string, number>;
  content: { type: string; [k: string]: unknown }[];
  stop: string;
  status?: number;
}

let upstream: Upstream;
let lastRequest: Record<string, any> | null = null;
let lastHeaders: Record<string, unknown> = {};
let server: Server;
let baseUrl = '';
let db: FakeD1;
let env: Env;

function sse(u: Upstream): string {
  const line = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let out = line('message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, stop_sequence: null, usage: { output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...u.usage } } });
  u.content.forEach((b, i) => {
    if (b.type === 'text') {
      out += line('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
      out += line('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text } });
    } else if (b.type === 'thinking') {
      out += line('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'thinking', thinking: '', signature: '' } });
      out += line('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'signature_delta', signature: b.signature } });
    } else {
      out += line('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      out += line('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    out += line('content_block_stop', { type: 'content_block_stop', index: i });
  });
  out += line('message_delta', { type: 'message_delta', delta: { stop_reason: u.stop, stop_sequence: null }, usage: { output_tokens: u.usage.output_tokens } });
  return out + line('message_stop', { type: 'message_stop' });
}

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastRequest = JSON.parse(body);
      lastHeaders = req.headers;
      if (upstream.status) {
        res.writeHead(upstream.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'nope' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sse(upstream));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

beforeEach(() => {
  db = freshDb();
  env = { DB: db as unknown as D1Database, DEV_AUTH: '1', DEV_MEMBER_ID: 'dev-a', DEV_MEMBER_NAME: 'A', ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: baseUrl, AI_MODEL: 'claude-sonnet-5-5' };
  upstream = { usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: '好' }], stop: 'end_turn' };
  lastRequest = null;
});

async function call(method: string, path: string, body?: unknown, opts: { as?: string } = {}) {
  const res = await handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(opts.as ? { 'x-dev-member': opts.as } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: res.status, res };
}
const jsonOf = async (r: { res: Response }) => (await r.res.json()) as any;
const ask = () => call('POST', '/api/claude/messages', { system: '提示', tools: [], messages: [{ role: 'user', content: '嗨' }] });
const eventsOf = async (r: { res: Response }) => (await r.res.text()).trim().split('\n').map((l) => JSON.parse(l));
const usageRow = () => db.prepare('SELECT * FROM ai_usage').first<Record<string, number>>();

describe('Claude 代理', () => {
  test('轉發：字逐字回來，最後有完整內容（思考的簽章原樣），瀏覽器不能指定模型', async () => {
    upstream.content = [{ type: 'thinking', signature: 'sig-1' }, { type: 'text', text: '你好' }, { type: 'tool_use', id: 't1', name: 'suggest_replies', input: { replies: ['a', 'b'] } }];
    upstream.stop = 'tool_use';
    const r = await call('POST', '/api/claude/messages', { model: 'claude-fable-5-1', max_tokens: 99, system: '提示', tools: [], messages: [{ role: 'user', content: '嗨' }] });
    assert.equal(r.status, 200);
    const events = await eventsOf(r);
    assert.deepEqual(events[0], { type: 'text', text: '你好' });
    const done = events.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.usage, 'ok');
    assert.equal(done.content[0].signature, 'sig-1');
    assert.deepEqual(done.content[2].input, { replies: ['a', 'b'] });
    assert.equal(lastRequest!.model, 'claude-sonnet-5-5');
    assert.notEqual(lastRequest!.max_tokens, 99);
    assert.equal(lastRequest!.fallbacks, 'default');
    assert.equal(lastRequest!.system[0].cache_control.type, 'ephemeral');
    assert.equal(lastRequest!.thinking.block_binding.prefix_mismatch_behavior, 'drop_block');
    assert.match(String(lastHeaders['anthropic-beta']), /context-management-2025-06-27/);
  });

  test('用量照快取分開記、費用算得對', async () => {
    upstream.usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 10000, cache_creation_input_tokens: 2000 };
    await (await ask()).res.text();
    const row = await usageRow();
    assert.equal(row!.input_tokens, 1000);
    assert.equal(row!.output_tokens, 500);
    assert.equal(row!.cache_read_tokens, 10000);
    assert.equal(row!.cache_write_tokens, 2000);
    // Sonnet 5.5：1000×2 + 500×10 + 10000×0.2 + 2000×2×1.25
    assert.equal(row!.cost_micro_usd, 14000);
    assert.equal(costMicroUsd('claude-opus-5-5', { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }), 4_000_000);
  });

  test('超過每人每天的上限：429，不呼叫 Claude；別人不受影響', async () => {
    env.AI_DAILY_USD = '1';
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    await db.prepare('INSERT INTO ai_usage (member_id, date, cost_micro_usd) VALUES (?, ?, ?)').bind('dev-a', today, 1_000_000).run();
    const r = await ask();
    assert.equal(r.status, 429);
    assert.equal((await jsonOf(r)).error, 'quota-daily');
    assert.equal(lastRequest, null);
    assert.equal((await call('POST', '/api/claude/messages', { system: 'x', tools: [], messages: [{ role: 'user', content: '嗨' }] }, { as: 'dev-b' })).status, 200);
  });

  test('超過全部人每月的上限：429；上個月的不算', async () => {
    env.AI_MONTHLY_USD = '2';
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const lastMonth = new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10);
    await db.prepare('INSERT INTO ai_usage (member_id, date, cost_micro_usd) VALUES (?, ?, ?)').bind('someone', lastMonth, 9_000_000).run();
    assert.equal((await ask()).status, 200);
    await db.prepare('INSERT INTO ai_usage (member_id, date, cost_micro_usd) VALUES (?, ?, ?)').bind('someone', today, 2_000_000).run();
    const r = await ask();
    assert.equal(r.status, 429);
    assert.equal((await jsonOf(r)).error, 'quota-monthly');
  });

  test('對話的用量狀態看送出的 token', () => {
    assert.equal(contextUsage(NEAR_TOKENS - 1), 'ok');
    assert.equal(contextUsage(NEAR_TOKENS), 'near');
    assert.equal(contextUsage(FULL_TOKENS), 'full');
  });

  test('拒答、工具參數被切斷、Claude API 出錯：都變成明確的錯誤事件', async () => {
    upstream.stop = 'refusal';
    assert.match((await eventsOf(await ask())).at(-1).message, /不能回答/);
    upstream = { usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 't', name: 'get_day', input: {} }], stop: 'max_tokens' };
    assert.equal((await eventsOf(await ask())).at(-1).type, 'error');
    upstream = { usage: {}, content: [], stop: 'end_turn', status: 400 };
    const e = (await eventsOf(await ask())).at(-1);
    assert.equal(e.type, 'error');
    assert.equal(e.code, 'other');
    assert.doesNotMatch(e.message, /nope/);
  });

  test('沒登入、沒設定 key、缺欄位', async () => {
    assert.equal((await call('POST', '/api/claude/messages', { system: 'x' })).status, 400);
    env.ANTHROPIC_API_KEY = undefined;
    assert.equal((await ask()).status, 503);
    env.ANTHROPIC_API_KEY = 'test';
    env.DEV_AUTH = undefined;
    assert.equal((await ask()).status, 401);
  });
});

describe('聊天紀錄', () => {
  const msg = (id: string, turn: string, extra: object = {}) => ({ id, turn, role: 'user', createdAt: 'x', content: [{ type: 'text', text: id }], ...extra });
  const create = async (as?: string) => (await jsonOf(await call('POST', '/api/chats', { title: '第一句' }, { as }))).conversation.id as string;
  const load = async (id: string, as?: string) => (await jsonOf(await call('GET', `/api/chats/${id}/messages`, undefined, { as }))).messages;

  test('建立、接訊息、順序、清單新的在前、用量', async () => {
    const a = await create();
    const b = await create();
    // updated_at 是毫秒：同一毫秒內建立 b、接上 a 的訊息時兩個一樣，順序不一定
    await new Promise((r) => setTimeout(r, 2));
    assert.equal((await call('POST', `/api/chats/${a}/messages`, { messages: [msg('m1', 't1'), msg('m2', 't1')] })).status, 201);
    assert.deepEqual((await load(a)).map((m: any) => m.id), ['m1', 'm2']);
    const list = (await jsonOf(await call('GET', '/api/chats'))).conversations;
    assert.deepEqual(list.map((c: any) => c.id).sort(), [a, b].sort());
    assert.equal(list[0].id, a);
    await call('PATCH', `/api/chats/${a}`, { usage: 'near' });
    assert.equal((await jsonOf(await call('GET', '/api/chats'))).conversations.find((c: any) => c.id === a).usage, 'near');
    assert.equal((await call('PATCH', `/api/chats/${a}`, { usage: 'huge' })).status, 400);
  });

  test('整則訊息原樣存回（卡片、晶片、脈絡、思考的簽章）；更新只換那則；重試拿掉一輪', async () => {
    const a = await create();
    const full = msg('m1', 't1', { contexts: [{ kind: 'trip' }], turnContext: '{"screen":{}}', cards: { x: { status: 'pending' } }, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '嗨' }] });
    await call('POST', `/api/chats/${a}/messages`, { messages: [full, msg('m2', 't2')] });
    assert.deepEqual((await load(a))[0], full);
    const changed = { ...full, cards: { x: { status: 'confirmed' } } };
    assert.equal((await call('PUT', `/api/chats/${a}/messages/m1`, { message: changed })).status, 200);
    assert.equal((await load(a))[0].cards.x.status, 'confirmed');
    assert.equal((await call('PUT', `/api/chats/${a}/messages/m2`, { message: changed })).status, 400);
    await call('DELETE', `/api/chats/${a}/turns/t2`);
    assert.deepEqual((await load(a)).map((m: any) => m.id), ['m1']);
  });

  test('別人的對話一律 404：讀、寫、改、刪都不行', async () => {
    const a = await create();
    await call('POST', `/api/chats/${a}/messages`, { messages: [msg('m1', 't1')] });
    const as = 'dev-b';
    assert.equal((await call('GET', `/api/chats/${a}/messages`, undefined, { as })).status, 404);
    assert.equal((await call('POST', `/api/chats/${a}/messages`, { messages: [msg('m2', 't2')] }, { as })).status, 404);
    assert.equal((await call('PATCH', `/api/chats/${a}`, { title: 'x' }, { as })).status, 404);
    assert.equal((await call('PUT', `/api/chats/${a}/messages/m1`, { message: msg('m1', 't1') }, { as })).status, 404);
    assert.equal((await call('DELETE', `/api/chats/${a}/turns/t1`, undefined, { as })).status, 404);
    assert.equal((await call('DELETE', `/api/chats/${a}`, undefined, { as })).status, 404);
    assert.deepEqual((await jsonOf(await call('GET', '/api/chats', undefined, { as }))).conversations, []);
    assert.equal((await load(a)).length, 1);
  });

  test('刪除對話也刪訊息；訊息格式不對是 400', async () => {
    const a = await create();
    await call('POST', `/api/chats/${a}/messages`, { messages: [msg('m1', 't1')] });
    assert.equal((await call('POST', `/api/chats/${a}/messages`, { messages: [{ id: 'x', turn: 't', role: 'system', content: [] }] })).status, 400);
    assert.equal((await call('POST', `/api/chats/${a}/messages`, { messages: [] })).status, 400);
    await call('DELETE', `/api/chats/${a}`);
    assert.equal((await call('GET', `/api/chats/${a}/messages`)).status, 404);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM chat_messages').first<{ n: number }>())!.n, 0);
  });
});
