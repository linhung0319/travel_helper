// T34：LINE @ 機器人、行程摘要的存取。LINE 和 Claude API 都用假的 fetch，不花錢。T73：按鈕（Quick Reply、postback）、說明照時期切換。

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createItinerary, type TripSummary } from '@travel-helper/engine';
import { freshDb, type FakeD1 } from './helpers/d1.ts';
import { handle } from '../src/index.ts';
import { botReply, dayButtons, defaultButtons, helpText, normalize, parseCommand, splitMessages, stripMentions, tripButtons, UNKNOWN_TEXT } from '../src/bot.ts';
import type { Env } from '../src/env.ts';

const MSG_SECRET = 'messaging-secret';
const AI = 'https://ai.test';
const realFetch = globalThis.fetch;

let d1: FakeD1;
let replies: { replyToken: string; messages: { type: string; text: string; quickReply?: { items: { type: string; action: Record<string, string> }[] } }[] }[];
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
    { date: '2027-02-02', lodging: '海邊旅館', lines: [{ start: '11:55', end: null, text: '抵達 關西機場', kind: 'flight' }] },
    {
      date: '2027-02-03',
      lodging: '海邊旅館',
      area: '伊勢',
      lines: [
        { start: '10:00', end: '12:00', text: '伊勢神宮 內宮（皇大神宮）', kind: 'visit' },
        { start: '12:30', end: '13:30', text: '海女小屋', kind: 'visit', alternatives: ['一榮'] },
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

/** 2027-02-03 11:00 日本時間（旅行中） */
const NOW = Date.UTC(2027, 1, 3, 2, 0);
/** 2027-01-20 日本時間（出發前） */
const BEFORE = Date.UTC(2027, 0, 20, 2, 0);
const ask = (q: string, e: Partial<Env> = {}, nowMs = NOW) => botReply(env(e), d1 as unknown as D1Database, q, nowMs);
const texts = async (q: string, e: Partial<Env> = {}, nowMs = NOW) => (await ask(q, e, nowMs)).texts;
const labels = (r: { buttons: { label: string }[] }) => r.buttons.map((b) => b.label);

const DAYS = SUMMARY.days.map((d) => d.date);

describe('指令', () => {
  const days = DAYS;
  test('完全符合的才算，全形、空白、標點都不影響', () => {
    assert.deepEqual(parseCommand('整趟', '2027-02-03', days), { type: 'trip' });
    assert.deepEqual(parseCommand('網址', '2027-02-03', days), { type: 'url' });
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

  test('按鈕：出發前、旅行中、結束後不同；看完單天、整趟各有一組；按鈕的 data 都是指令', () => {
    assert.deepEqual(labels({ buttons: defaultButtons(DAYS, '2027-01-20') }), ['整趟', '2/2', '預約', '網址']);
    assert.deepEqual(labels({ buttons: defaultButtons(DAYS, '2027-02-03') }), ['今天', '明天', '現在', '整趟', '預約', '網址']);
    assert.deepEqual(labels({ buttons: defaultButtons(DAYS, '2027-02-05') }), ['整趟', '預約', '網址']);
    assert.deepEqual(labels({ buttons: defaultButtons([], '2027-02-03') }), ['整趟', '預約', '網址']);
    // 看完單天：隔天（看的是今天時叫「明天」）、整趟、那天的預約、網址；最後一天沒有隔天
    assert.deepEqual(labels({ buttons: dayButtons(DAYS, '2027-02-03', '2027-02-03') }), ['明天', '整趟', '2/3 預約', '網址']);
    assert.deepEqual(labels({ buttons: dayButtons(DAYS, '2027-02-03', '2027-01-20') }), ['2/4', '整趟', '2/3 預約', '網址']);
    assert.deepEqual(labels({ buttons: dayButtons(DAYS, '2027-02-04', '2027-02-03') }), ['整趟', '2/4 預約', '網址']);
    // 看完整趟：旅行中先今天、明天，再每天；最多 13 顆
    assert.deepEqual(labels({ buttons: tripButtons(DAYS, '2027-02-03') }), ['今天', '明天', '2/2', '2/3', '2/4']);
    assert.deepEqual(labels({ buttons: tripButtons(DAYS, '2027-01-20') }), ['2/2', '2/3', '2/4']);
    const twelve = Array.from({ length: 12 }, (_, i) => `2027-02-${String(2 + i).padStart(2, '0')}`);
    assert.equal(tripButtons(twelve, '2027-02-05').length, 13);
    for (const b of [...defaultButtons(DAYS, '2027-02-03'), ...dayButtons(DAYS, '2027-02-03', '2027-01-20'), ...tripButtons(DAYS, '2027-02-03')]) {
      assert.ok(b.data === '網址' || parseCommand(b.data, '2027-02-03', DAYS), b.data);
    }
  });
});

describe('回覆', () => {
  test('還沒有摘要：請人打開網站', async () => {
    const r = await ask('整趟');
    assert.match(r.texts[0], /行程還沒整理好/);
    assert.deepEqual(labels(r), ['整趟', '預約', '網址']);
  });

  test('網址：加上 openExternalBrowser，從 LINE 點開用手機的瀏覽器，提醒第一次要用 LINE 登入；還沒有摘要也回得出來', async () => {
    assert.deepEqual(await texts('網址'), ['用瀏覽器打開網站：\nhttps://trip.example.dev/?openExternalBrowser=1\n第一次打開要用 LINE 登入']);
    assert.match((await texts('網址', { PUBLIC_BASE_URL: undefined }))[0], /還沒設定/);
    seed();
    aiOutput = { type: 'url', date: null, text: null };
    assert.deepEqual(await texts('網站連結給我'), ['用瀏覽器打開網站：\nhttps://trip.example.dev/?openExternalBrowser=1\n第一次打開要用 LINE 登入']);
  });

  test('一天、整趟：最後寫誰什麼時候更新；摘要跟不上時註明；按鈕', async () => {
    seed();
    const day = await ask('2/3');
    assert.equal(day.texts[0], '2/3（三）伊勢\n10:00 伊勢神宮 內宮\n12:30 海女小屋\n　或 一榮\n住：海邊旅館\n（1/20 21:05 王小明 更新）');
    assert.deepEqual(labels(day), ['明天', '整趟', '2/3 預約', '網址']);
    const trip = await ask('整趟');
    assert.equal(
      trip.texts[0],
      [
        '2/2～2/4 整趟\n要看某天的時間，按下面的日期或打「@機器人 2/2」',
        '2/2（二）\n還沒排\n住：海邊旅館',
        '2/3（三）伊勢\n伊勢神宮 內宮、海女小屋\n住：海邊旅館',
        '2/4（四）\n還沒排\n（1/20 21:05 王小明 更新）',
      ].join('\n\n'),
    );
    assert.deepEqual(labels(trip), ['今天', '明天', '2/2', '2/3', '2/4']);
    const out = await ask('2/20');
    assert.equal(out.texts[0], '2/20（六）不在旅程裡（旅程是 2/2～2/4）');
    assert.deepEqual(labels(out), ['今天', '明天', '現在', '整趟', '預約', '網址']);
    assert.equal(aiRequests.length, 0);
  });

  test('摘要比行程舊', async () => {
    seed({ version: 4, summaryVersion: 3 });
    assert.match((await texts('今天'))[0], /這份可能還不是最新的/);
  });

  test('現在：用日本時間', async () => {
    seed();
    assert.match((await texts('現在'))[0], /^現在 11:00（2\/3（三））\n進行中：10:00-12:00 伊勢神宮 內宮\n下一個：12:30-13:30 海女小屋\n　或 一榮/);
  });

  test('預約：讀最新的預約筆記，照狀態分段', async () => {
    seed();
    assert.equal((await texts('今天的預約'))[0], '2/3（三）的預約：待訂 1\n\n待訂\n・12:30 海女小屋\n\n※ 網站不會幫忙訂，待訂的要自己訂，訂好到網站改成「已訂」');
    d1.db.exec(`INSERT INTO reservations (date, place_id, status, note, updated_by, updated_at) VALUES ('2027-02-03', 'r', 'booked', '電話訂', 'U1', '2027-01-21T00:00:00Z')`);
    assert.equal((await texts('今天的預約'))[0], '2/3（三）的預約：已訂 1\n\n已訂\n・12:30 海女小屋\n　電話訂\n\n※ 網站不會幫忙訂，待訂的要自己訂，訂好到網站改成「已訂」');
  });

  test('不是指令：AI 分類，內容還是照摘要排；用量記在機器人', async () => {
    seed();
    aiOutput = { type: 'day', date: '2027-02-03', text: null };
    assert.match((await texts('今天要去哪裡'))[0], /^2\/3（三）伊勢\n10:00 伊勢神宮 內宮/);
    assert.equal(aiRequests[0].model, 'claude-haiku-5-5');
    assert.equal(aiRequests[0].output_config.format.type, 'json_schema');
    assert.match(aiRequests[0].messages[0].content, /<now>2027-02-03（三）11:00 日本時間<\/now>/);
    const usage = d1.db.prepare(`SELECT * FROM ai_usage WHERE member_id = 'line-bot'`).get() as Record<string, number>;
    assert.equal(usage.input_tokens, 2000);

    aiOutput = { type: 'answer', date: null, text: '2/3 去伊勢神宮。' };
    assert.deepEqual(await texts('哪天去伊勢神宮'), ['2/3 去伊勢神宮。']);
  });

  test('怎麼用：和說明、指令、help 同一個指令，還沒有摘要也回得出來；出發前不舉今天、明天、現在，旅行中才舉', async () => {
    for (const q of ['怎麼用', '說明', '指令', 'help', 'HELP', '']) assert.deepEqual(parseCommand(q, '2027-02-03', ['2027-02-03']), { type: 'help' });
    // 還沒有摘要：當出發前
    const [noSummary] = await texts('怎麼用');
    assert.match(noSummary, /^2\/2～2\/13 伊勢志摩和大阪的景點、民宿、餐廳/);
    seed();
    const [before] = await texts('怎麼用', {}, BEFORE);
    assert.match(before, /^2\/2～2\/13 伊勢志摩和大阪的景點、民宿、餐廳/);
    assert.match(before, /網站不會幫忙訂/);
    assert.match(before, /https:\/\/trip\.example\.dev\/\?openExternalBrowser=1$/);
    assert.doesNotMatch(before, /今天|明天|現在/);
    assert.equal(helpText(undefined).includes('http'), false);
    const [during] = await texts('說明');
    assert.match(during, /^@ 我就能查行程：\n「今天」「明天」/);
    assert.match(during, /哪天去伊勢神宮/);
    assert.match(during, /用瀏覽器打開網站：\nhttps:\/\/trip\.example\.dev\/\?openExternalBrowser=1$/);
    assert.equal(helpText(undefined, true).includes('http'), false);
  });

  test('看不懂、AI 出錯、額度用完：一行加按鈕，不回整段說明', async () => {
    seed();
    aiOutput = null;
    const r = await ask('哈囉');
    assert.deepEqual(r.texts, [UNKNOWN_TEXT]);
    assert.deepEqual(labels(r), ['今天', '明天', '現在', '整趟', '預約', '網址']);
    aiOutput = { type: 'help', date: null, text: null };
    assert.deepEqual(await texts('天氣如何'), [UNKNOWN_TEXT]);
    aiOutput = { type: 'trip', date: null, text: null };
    // 額度用 Date.now() 的 jstDate 算今天：把今天的用量記滿（上面那次 AI 呼叫已經記了一列）
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    d1.db.exec(`INSERT INTO ai_usage (member_id, date, cost_micro_usd) VALUES ('line-bot', '${today}', 5000000) ON CONFLICT (member_id, date) DO UPDATE SET cost_micro_usd = 5000000`);
    assert.deepEqual(await texts('全部行程'), [UNKNOWN_TEXT]);
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
  const postback = (groupId: string, data: string) => ({ type: 'postback', replyToken: 'rt-2', source: { type: 'group', groupId, userId: 'U1' }, postback: { data } });

  test('核准的群組裡 @ 機器人才回；回覆的最後一則帶 Quick Reply（postback）', async () => {
    seed();
    assert.equal((await hook({ events: [message('Cfamily', '@機器人 2/3')] })).status, 200);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].replyToken, 'rt-1');
    assert.match(replies[0].messages[0].text, /^2\/3（三）伊勢\n10:00 伊勢神宮 內宮/);
    // webhook 用真的現在（出發前）：隔天的按鈕是日期
    const items = replies[0].messages.at(-1)!.quickReply!.items;
    assert.deepEqual(
      items.map((i) => i.action),
      [
        { type: 'postback', label: '2/4', data: '2/4', displayText: '2/4' },
        { type: 'postback', label: '整趟', data: '整趟', displayText: '整趟' },
        { type: 'postback', label: '2/3 預約', data: '2/3 預約', displayText: '2/3 預約' },
        { type: 'postback', label: '網址', data: '網址', displayText: '網址' },
      ],
    );

    await hook({ events: [message('Cother', '@機器人 2/3')] }); // 沒核准
    await hook({ events: [message('Cfamily', '@小美 2/3', false)] }); // @ 的不是機器人
    await hook({ events: [{ ...message('Cfamily', '2/3'), message: { type: 'text', text: '2/3' } }] }); // 沒有 @
    assert.equal(replies.length, 1);
  });

  test('按鈕（postback）：data 當成問的話，不用 @；一樣只回核准的群組', async () => {
    seed();
    assert.equal((await hook({ events: [postback('Cfamily', '2/3 預約')] })).status, 200);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].replyToken, 'rt-2');
    assert.match(replies[0].messages[0].text, /^2\/3（三）的預約：待訂 1/);
    await hook({ events: [postback('Cother', '整趟')] });
    await hook({ events: [{ ...postback('Cfamily', '整趟'), replyToken: undefined }] });
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
