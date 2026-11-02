// T34：LINE @ 機器人、行程摘要的存取。LINE 和 Claude API 都用假的 fetch，不花錢。

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createItinerary, type TripSummary } from '@travel-helper/engine';
import { freshDb, type FakeD1 } from './helpers/d1.ts';
import { handle } from '../src/index.ts';
import { botReply, normalize, parseCommand, splitMessages, stripMentions } from '../src/bot.ts';
import type { Env } from '../src/env.ts';

const MSG_SECRET = 'messaging-secret';
const AI = 'https://ai.test';
const realFetch = globalThis.fetch;

let d1: FakeD1;
let replies: { replyToken: string; messages: { type: string; text: string }[] }[];
/** 假 AI 這次要回的 JSON；null：AI 出錯 */
let aiOutput: Record<string, unknown> | null;
let aiRequests: Record<string, any>[];

const env = (extra: Partial<Env> = {}): Env => ({
  DB: d1 as unknown as D1Database,
  LINE_MESSAGING_CHANNEL_SECRET: MSG_SECRET,
  LINE_MESSAGING_ACCESS_TOKEN: 'access-token',
  PUBLIC_BASE_URL: 'https://trip.example.dev',
  ANTHROPIC_API_KEY: 'test',
  ANTHROPIC_BASE_URL: AI,
  DEV_AUTH: '1',
  DEV_MEMBER_ID: 'dev-a',
  DEV_MEMBER_NAME: '小明',
  ...extra,
});

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const body = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '';
  const res = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.pathname === '/v2/bot/message/reply') {
    replies.push(JSON.parse(body));
    return res(200, {});
  }
  if (url.pathname.endsWith('/summary') && url.hostname === 'api.line.me') return res(200, { groupName: '家人' });
  if (url.origin === AI && url.pathname === '/v1/messages') {
    aiRequests.push(JSON.parse(body));
    if (!aiOutput) return res(500, { type: 'error', error: { type: 'api_error', message: 'boom' } });
    return res(200, {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: JSON.stringify(aiOutput) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 2000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
  }
  throw new Error(`沒有模擬的網址：${url}`);
}

beforeEach(() => {
  d1 = freshDb();
  replies = [];
  aiOutput = null;
  aiRequests = [];
  globalThis.fetch = fakeFetch as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const SUMMARY: TripSummary = {
  days: [
    { date: '2027-02-02', lodging: '海邊旅館', lines: [{ start: '11:55', end: null, text: '抵達 關西機場' }] },
    {
      date: '2027-02-03',
      lodging: '海邊旅館',
      lines: [
        { start: '10:00', end: '12:00', text: '伊勢神宮' },
        { start: '12:30', end: '13:30', text: '海女小屋' },
      ],
    },
    { date: '2027-02-04', lodging: null, lines: [] },
  ],
  reservations: [{ date: '2027-02-03', placeId: 'r', name: '海女小屋', time: '12:30', endDate: null }],
};

function seed(o: { summaryVersion?: number; version?: number } = {}) {
  const v = o.version ?? 3;
  d1.db.exec(`INSERT INTO members (line_user_id, display_name, source) VALUES ('U1', '王小明', 'group')`);
  d1.db.prepare(`INSERT INTO itinerary (id, data, version, updated_by, updated_at) VALUES (1, '{}', ?, 'U1', '2027-01-20T12:05:00Z')`).run(v);
  d1.db.prepare(`INSERT INTO trip_summary (id, version, data, updated_at) VALUES (1, ?, ?, '2027-01-20T12:05:00Z')`).run(o.summaryVersion ?? v, JSON.stringify(SUMMARY));
  d1.db.exec(`INSERT INTO line_groups (group_id, group_name, status, joined_at) VALUES ('Cfamily', '家人', 'approved', '2026-10-26T00:00:00Z')`);
  d1.db.exec(`INSERT INTO line_groups (group_id, group_name, status, joined_at) VALUES ('Cother', '別人', 'pending', '2026-10-26T00:00:00Z')`);
}

/** 2027-02-03 11:00 日本時間 */
const NOW = Date.UTC(2027, 1, 3, 2, 0);
const ask = (q: string, e: Partial<Env> = {}) => botReply(env(e), d1 as unknown as D1Database, q, NOW);

describe('指令', () => {
  const days = SUMMARY.days.map((d) => d.date);
  test('完全符合的才算，全形、空白、標點都不影響', () => {
    assert.deepEqual(parseCommand('整趟', '2027-02-03', days), { type: 'trip' });
    assert.deepEqual(parseCommand(' ２／３？', '2027-02-03', days), { type: 'day', date: '2027-02-03' });
    assert.deepEqual(parseCommand('2月3日', '2027-02-03', days), { type: 'day', date: '2027-02-03' });
    assert.deepEqual(parseCommand('今天', '2027-02-03', days), { type: 'day', date: '2027-02-03' });
    assert.deepEqual(parseCommand('明天', '2027-02-03', days), { type: 'day', date: '2027-02-04' });
    assert.deepEqual(parseCommand('現在', '2027-02-03', days), { type: 'now' });
    assert.deepEqual(parseCommand('預約', '2027-02-03', days), { type: 'reservations', date: null });
    assert.deepEqual(parseCommand('2/3 預約', '2027-02-03', days), { type: 'reservations', date: '2027-02-03' });
    assert.deepEqual(parseCommand('明天的預約', '2027-02-03', days), { type: 'reservations', date: '2027-02-04' });
    assert.deepEqual(parseCommand('預約 2/3', '2027-02-03', days), { type: 'reservations', date: '2027-02-03' });
    assert.deepEqual(parseCommand('', '2027-02-03', days), { type: 'help' });
    // 不是指令：交給 AI
    assert.equal(parseCommand('給我整趟', '2027-02-03', days), null);
    assert.equal(parseCommand('預約狀態', '2027-02-03', days), null);
    assert.equal(parseCommand('明天去哪', '2027-02-03', days), null);
    // 不在旅程裡的日期也解析出來（回覆說不在旅程裡）
    assert.deepEqual(parseCommand('2/20', '2027-02-03', days), { type: 'day', date: '2027-02-20' });
    assert.equal(normalize('２／３？'), '2/3');
  });

  test('拿掉 @、長文字在兩天之間切開', () => {
    assert.equal(stripMentions('@行程機器人 整趟', [{ index: 0, length: 6 }]), '整趟');
    assert.deepEqual(splitMessages('aaa\n\nbbb\n\nccc', 8), ['aaa\n\nbbb', 'ccc']);
  });
});

describe('回覆', () => {
  test('還沒有摘要：請人打開網站', async () => {
    assert.match((await ask('整趟'))[0], /行程還沒整理好/);
  });

  test('一天、整趟：最後寫誰什麼時候更新；摘要跟不上時註明', async () => {
    seed();
    assert.equal((await ask('2/3'))[0], '2/3（三）\n10:00-12:00 伊勢神宮\n12:30-13:30 海女小屋\n住：海邊旅館\n（1/20 21:05 王小明 更新）');
    assert.match((await ask('整趟'))[0], /^2\/2（二）\n11:55 抵達 關西機場\n住：海邊旅館\n\n2\/3（三）[\s\S]*2\/4（四）\n還沒排\n（1\/20 21:05 王小明 更新）$/);
    assert.equal((await ask('2/20'))[0], '2/20（六）不在旅程裡（旅程是 2/2～2/4）');
    assert.equal(aiRequests.length, 0);
  });

  test('摘要比行程舊', async () => {
    seed({ version: 4, summaryVersion: 3 });
    assert.match((await ask('今天'))[0], /這份可能還不是最新的/);
  });

  test('現在：用日本時間', async () => {
    seed();
    assert.match((await ask('現在'))[0], /^現在 11:00（2\/3（三））\n進行中：10:00-12:00 伊勢神宮\n下一個：12:30-13:30 海女小屋/);
  });

  test('預約：讀最新的預約筆記', async () => {
    seed();
    assert.equal((await ask('今天的預約'))[0], '2/3（三）的預約\n12:30 海女小屋：還沒訂');
    d1.db.exec(`INSERT INTO reservations (date, place_id, status, note, updated_by, updated_at) VALUES ('2027-02-03', 'r', 'booked', '電話訂', 'U1', '2027-01-21T00:00:00Z')`);
    assert.equal((await ask('今天的預約'))[0], '2/3（三）的預約\n12:30 海女小屋：已訂（電話訂）');
  });

  test('不是指令：AI 分類，內容還是照摘要排；用量記在機器人', async () => {
    seed();
    aiOutput = { type: 'day', date: '2027-02-03', text: null };
    assert.match((await ask('今天要去哪裡'))[0], /^2\/3（三）\n10:00-12:00 伊勢神宮/);
    assert.equal(aiRequests[0].model, 'claude-haiku-5-5');
    assert.equal(aiRequests[0].output_config.format.type, 'json_schema');
    assert.match(aiRequests[0].messages[0].content, /<now>2027-02-03（三）11:00 日本時間<\/now>/);
    const usage = d1.db.prepare(`SELECT * FROM ai_usage WHERE member_id = 'line-bot'`).get() as Record<string, number>;
    assert.equal(usage.input_tokens, 2000);

    aiOutput = { type: 'answer', date: null, text: '2/3 去伊勢神宮。' };
    assert.deepEqual(await ask('哪天去伊勢神宮'), ['2/3 去伊勢神宮。']);
  });

  test('AI 出錯、額度用完：回可用的指令和網站', async () => {
    seed();
    aiOutput = null;
    assert.match((await ask('哈囉'))[0], /^可以問：整趟、2\/5[\s\S]*網站：https:\/\/trip\.example\.dev$/);
    aiOutput = { type: 'trip', date: null, text: null };
    d1.db.exec(`INSERT INTO ai_usage (member_id, date, cost_micro_usd) VALUES ('line-bot', '2027-02-03', 5000000)`);
    // 用 Date.now() 的 jstDate 算今天：額度記在今天
    d1.db.exec(`UPDATE ai_usage SET date = '${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}'`);
    assert.match((await ask('全部行程'))[0], /^可以問/);
  });
});

describe('webhook', () => {
  function signed(body: unknown) {
    const text = JSON.stringify(body);
    return { text, sig: crypto.createHmac('sha256', MSG_SECRET).update(text).digest('base64') };
  }
  const hook = (body: unknown) => {
    const s = signed(body);
    return handle(new Request('https://trip.example.dev/line/webhook', { method: 'POST', headers: { 'x-line-signature': s.sig }, body: s.text }), env());
  };
  const message = (groupId: string, text: string, self = true) => ({
    type: 'message',
    replyToken: 'rt-1',
    source: { type: 'group', groupId, userId: 'U1' },
    message: { type: 'text', text, mention: { mentionees: [{ index: 0, length: 4, type: 'user', isSelf: self }] } },
  });

  test('核准的群組裡 @ 機器人才回', async () => {
    seed();
    assert.equal((await hook({ events: [message('Cfamily', '@機器人 2/3')] })).status, 200);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].replyToken, 'rt-1');
    assert.match(replies[0].messages[0].text, /^2\/3（三）\n10:00-12:00 伊勢神宮/);

    await hook({ events: [message('Cother', '@機器人 2/3')] }); // 沒核准
    await hook({ events: [message('Cfamily', '@小美 2/3', false)] }); // @ 的不是機器人
    await hook({ events: [{ ...message('Cfamily', '2/3'), message: { type: 'text', text: '2/3' } }] }); // 沒有 @
    assert.equal(replies.length, 1);
  });
});

describe('PUT /api/itinerary/summary', () => {
  const put = (body: unknown) => handle(new Request('http://localhost/api/itinerary/summary', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env());

  test('只收目前這一版行程的摘要；sync 帶摘要的版本', async () => {
    const r0 = await handle(new Request('http://localhost/api/itinerary', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 0, data: createItinerary() }) }), env());
    assert.equal(r0.status, 200);
    assert.equal((await put({ version: 2, summary: SUMMARY })).status, 409);
    assert.equal((await put({ version: 1, summary: { days: 'x' } })).status, 400);
    assert.equal((await put({ version: 1, summary: SUMMARY })).status, 200);
    const row = d1.db.prepare('SELECT version, data FROM trip_summary WHERE id = 1').get() as { version: number; data: string };
    assert.equal(row.version, 1);
    assert.deepEqual(JSON.parse(row.data), SUMMARY);
    // 同一版再存一次（例如另一個人打開網站補存）：照樣 200
    assert.equal((await put({ version: 1, summary: SUMMARY })).status, 200);
    const sync = await (await handle(new Request('http://localhost/api/sync'), env())).json();
    assert.equal(sync.summary, 1);
    assert.equal(sync.itinerary, 1);
  });
});
