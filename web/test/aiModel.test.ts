// 接真的模型的部分（T16）：快速選項的標記、送給模型的歷史、推薦問題、Worker 的事件流、完整內容（含思考）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { splitReplies, streamingView, toApiMessages, turnsOf } from '../src/ai/transcript.ts';
import { createWorkerModel } from '../src/ai/workerModel.ts';
import { ModelError, type ChatMessage, type ModelEvent, type ModelRequest } from '../src/ai/types.ts';
import { harness } from './aiHarness.ts';

const REQUEST: ModelRequest = { system: 's', tools: [], messages: [{ role: 'user', content: [{ type: 'text', text: '嗨' }] }], context: { screen: {}, chips: [], decisions: [], draft: null, cards: [] } };

const collect = async (send: AsyncIterable<ModelEvent>) => {
  const out: ModelEvent[] = [];
  for await (const e of send) out.push(e);
  return out;
};

const ndjson = (chunks: string[], status = 200) =>
  (async () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const x of chunks) c.enqueue(new TextEncoder().encode(x));
          c.close();
        },
      }),
      { status },
    )) as unknown as typeof fetch;

test('快速選項：從回答結尾拆出來，正文不留標記', () => {
  assert.deepEqual(splitReplies('有三家。\n[[reply:只看午餐有開的]][[reply:排進 2/5]]'), { text: '有三家。', replies: ['只看午餐有開的', '排進 2/5'] });
  assert.deepEqual(splitReplies('沒有選項 [[place:toba-a]]'), { text: '沒有選項 [[place:toba-a]]', replies: [] });
});

test('逐字顯示：完整和進來一半的標記都不露出來', () => {
  assert.equal(streamingView('有三家。\n[[reply:只看'), '有三家。');
  assert.equal(streamingView('有三家。\n[[reply:只看午餐]][[rep'), '有三家。');
  assert.equal(streamingView('去 [[place:toba'), '去');
  assert.equal(streamingView('去 ['), '去');
  assert.equal(streamingView('去 [[place:toba-a]] 吃'), '去 [[place:toba-a]] 吃');
});

test('一輪的畫面：思考不畫出來，選項變按鈕', () => {
  const messages: ChatMessage[] = [
    { id: '1', turn: 't', createdAt: 'x', role: 'user', content: [{ type: 'text', text: '問' }] },
    { id: '2', turn: 't', createdAt: 'x', role: 'assistant', end: true, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '答。[[reply:下一步]]' }] },
  ];
  const [turn] = turnsOf(messages, new Set());
  assert.deepEqual(turn.texts, ['答。']);
  assert.deepEqual(turn.replies, ['下一步']);
});

test('送給模型的歷史：思考原樣留著、脈絡接在那輪的話後面、選項標記不動（只增不改）', () => {
  const thinking = { type: 'thinking' as const, thinking: '', signature: 's' };
  const messages: ChatMessage[] = [
    { id: '1', turn: 't', createdAt: 'x', role: 'user', turnContext: '{"screen":{}}', content: [{ type: 'text', text: '問' }] },
    { id: '2', turn: 't', createdAt: 'x', role: 'assistant', end: true, content: [thinking, { type: 'text', text: '答。[[reply:下一步]]' }] },
    // 只有思考（沒話可說）：API 不收，不送
    { id: '3', turn: 'u', createdAt: 'x', role: 'user', content: [{ type: 'text', text: '再問' }] },
    { id: '4', turn: 'u', createdAt: 'x', role: 'assistant', end: true, content: [thinking] },
  ];
  const api = toApiMessages(messages);
  assert.deepEqual(api[0].content, [{ type: 'text', text: '問' }, { type: 'text', text: '<context>{"screen":{}}</context>' }]);
  assert.deepEqual(api[1].content, [thinking, { type: 'text', text: '答。[[reply:下一步]]' }]);
  assert.equal(api.length, 3);
});

test('Worker 的事件流：切在一行中間也接得起來，done 帶完整內容', async () => {
  const content = [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '你好' }];
  const line = `${JSON.stringify({ type: 'done', content, usage: 'near' })}\n`;
  const model = createWorkerModel({ fetch: ndjson(['{"type":"text","te', 'xt":"你"}\n{"type":"text","text":"好"}\n', line]) });
  const events = await collect(model.send(REQUEST, new AbortController().signal));
  assert.deepEqual(events.slice(0, 2), [{ type: 'text', text: '你' }, { type: 'text', text: '好' }]);
  assert.deepEqual(events[2], { type: 'done', usage: 'near', content });
});

test('Worker 的錯誤：超過上限是 quota、中途錯誤、連線斷掉都變成 ModelError', async () => {
  const quota = (async () => new Response(JSON.stringify({ error: 'quota-daily', message: '明天再來' }), { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(collect(createWorkerModel({ fetch: quota }).send(REQUEST, new AbortController().signal)), (e: ModelError) => e.code === 'quota' && e.message === '明天再來');
  await assert.rejects(collect(createWorkerModel({ fetch: ndjson(['{"type":"error","code":"other","message":"不行"}\n']) }).send(REQUEST, new AbortController().signal)), (e: ModelError) => e.code === 'other' && e.message === '不行');
  // 沒有 done 就結束：連線斷了
  await assert.rejects(collect(createWorkerModel({ fetch: ndjson(['{"type":"text","text":"你"}\n']) }).send(REQUEST, new AbortController().signal)), (e: ModelError) => e.code === 'network');
  const down = (async () => {
    throw new TypeError('failed');
  }) as unknown as typeof fetch;
  await assert.rejects(collect(createWorkerModel({ fetch: down }).send(REQUEST, new AbortController().signal)), (e: ModelError) => e.code === 'network');
});

test('真的模型回完整內容：工具從內容拿、思考存進紀錄、脈絡存在那輪、用量回報給對話', async () => {
  const toolUse = { type: 'tool_use' as const, id: 'tu1', name: 'get_trip_overview', input: {} };
  const thinking = { type: 'thinking' as const, thinking: '', signature: 'sig' };
  const seen: ModelRequest[] = [];
  let round = 0;
  const h = await harness({
    model: {
      async *send(request) {
        seen.push(request);
        if (round++ === 0) {
          yield { type: 'done', usage: 'ok', content: [thinking, toolUse] };
        } else {
          yield { type: 'text', text: '好了' };
          yield { type: 'done', usage: 'near', content: [thinking, { type: 'text', text: '好了[[reply:再查一次]]' }] };
        }
      },
    },
  });
  await h.chat.send('哪天最趕？');
  const s = h.chat.store.getState();
  assert.equal(s.error, null);
  assert.equal(s.messages[0].role, 'user');
  assert.ok(s.messages[0].turnContext?.includes('"screen"'));
  assert.deepEqual(s.messages[1].content, [thinking, toolUse]);
  // 第二次送的歷史：第一次的東西一個字都沒變
  assert.deepEqual(seen[1].messages.slice(0, seen[0].messages.length), seen[0].messages);
  assert.equal(seen[1].messages[1].content[0], thinking);
  const [turn] = turnsOf(s.messages, new Set(['get_trip_overview']));
  assert.deepEqual(turn.texts, ['好了']);
  assert.deepEqual(turn.replies, ['再查一次']);
  assert.equal(s.conversations[0].usage, 'near');
  assert.equal(h.chat.incomplete(), null);
  h.close();
});

test('refresh：別的裝置接著聊過，切回來看得到；回覆中不動', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const before = h.chat.store.getState().messages.length;
  h.chat.store.setState({ messages: [] });
  await h.chat.refresh();
  assert.equal(h.chat.store.getState().messages.length, before);
  h.chat.store.setState({ status: 'thinking', messages: [] });
  await h.chat.refresh();
  assert.equal(h.chat.store.getState().messages.length, 0);
  h.chat.store.setState({ status: 'idle' });
  h.close();
});

test('starters：開著的行程算得出推薦問題', async () => {
  const h = await harness();
  const s = h.chat.starters();
  assert.equal(s.length, 3);
  assert.ok(s.every((x) => x.q && x.why));
  h.close();
});
