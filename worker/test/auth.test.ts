// T25：LINE 登入、群組檢查、白名單、webhook、管理頁、網站要先登入。
// LINE 的 API 用假的 fetch 模擬（T23 實測的行為：成員 200、不是成員 404）。

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshDb, type FakeD1 } from './helpers/d1.ts';
import { handle } from '../src/index.ts';
import { signSession, verifySession } from '../src/lib/session.ts';

const BASE = 'https://trip.example.dev';
const SECRET = 'x'.repeat(40);
const MSG_SECRET = 'messaging-secret';
const ADMIN = 'Uadmin';

let d1: FakeD1;
/** 假的 LINE：誰在哪個群組 */
let groupMembers: Record<string, string[]>;
/** 授權碼 → 登入的人 */
let codes: Record<string, { sub: string; name: string; picture?: string }>;
let memberApiStatus: number | null;
const realFetch = globalThis.fetch;

const env = (extra: object = {}) =>
  ({
    DB: d1 as unknown as D1Database,
    LINE_LOGIN_CHANNEL_ID: '1234567890',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    LINE_MESSAGING_CHANNEL_SECRET: MSG_SECRET,
    LINE_MESSAGING_ACCESS_TOKEN: 'access-token',
    SESSION_SECRET: SECRET,
    PUBLIC_BASE_URL: BASE,
    ADMIN_LINE_USER_IDS: ADMIN,
    ...extra,
  }) as never;

function fakeLine(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const form = () => new URLSearchParams(String(init?.body ?? ''));
  const res = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  if (url.pathname === '/oauth2/v2.1/token') {
    const code = form().get('code')!;
    return codes[code] ? res(200, { id_token: `idt-${code}`, access_token: 'a' }) : res(400, { error: 'invalid_grant' });
  }
  if (url.pathname === '/oauth2/v2.1/verify') {
    const who = codes[form().get('id_token')!.replace(/^idt-/, '')];
    return res(200, { sub: who.sub, name: who.name, picture: who.picture });
  }
  let m = url.pathname.match(/^\/v2\/bot\/group\/([^/]+)\/member\/([^/]+)$/);
  if (m) {
    if (memberApiStatus) return res(memberApiStatus, { message: 'error' });
    return (groupMembers[m[1]] ?? []).includes(m[2]) ? res(200, { userId: m[2] }) : res(404, { message: 'Not found' });
  }
  m = url.pathname.match(/^\/v2\/bot\/group\/([^/]+)\/summary$/);
  if (m) return res(200, { groupId: m[1], groupName: `群組 ${m[1]}` });
  throw new Error(`沒有模擬的網址：${url}`);
}

beforeEach(() => {
  d1 = freshDb();
  groupMembers = {};
  codes = {};
  memberApiStatus = null;
  globalThis.fetch = fakeLine as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function call(method: string, path: string, opts: { cookie?: string; headers?: Record<string, string>; body?: BodyInit; env?: never } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  return handle(new Request(`${BASE}${path}`, { method, headers, body: opts.body }), opts.env ?? env());
}

const cookieValue = (res: Response, name: string) => {
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (kv.slice(0, i) === name) return decodeURIComponent(kv.slice(i + 1));
  }
  return null;
};

/** 走完一次 LINE 登入：回傳 callback 的回應 */
async function login(who: { sub: string; name: string }, returnTo = '/') {
  const code = `code-${who.sub}`;
  codes[code] = who;
  const start = await call('GET', `/auth/line/login?return=${encodeURIComponent(returnTo)}`);
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const oauth = cookieValue(start, 'th_oauth')!;
  return call('GET', `/auth/line/callback?code=${code}&state=${state}`, { cookie: `th_oauth=${encodeURIComponent(oauth)}` });
}

const approveGroup = (id: string) =>
  d1.db.exec(`INSERT INTO line_groups (group_id, group_name, status, joined_at) VALUES ('${id}', 'G', 'approved', '2026-10-26T00:00:00Z')`);

const member = (id: string) => d1.db.prepare('SELECT * FROM members WHERE line_user_id = ?').get(id) as Record<string, unknown> | undefined;

function signed(body: unknown) {
  const text = JSON.stringify(body);
  return { text, sig: crypto.createHmac('sha256', MSG_SECRET).update(text).digest('base64') };
}
const webhook = (body: unknown, sig?: string) => {
  const s = signed(body);
  return call('POST', '/line/webhook', { body: s.text, headers: { 'x-line-signature': sig ?? s.sig } });
};

describe('登入憑證', () => {
  test('簽章、竄改、過期', async () => {
    const t = await signSession(SECRET, 'U1', 0);
    assert.equal((await verifySession(SECRET, t, 1000))?.uid, 'U1');
    assert.equal(await verifySession('y'.repeat(40), t, 1000), null, '別的 secret');
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'U2', iat: 0, exp: 9e9 })).toString('base64url');
    assert.equal(await verifySession(SECRET, `${forged}.${sig}`, 1000), null, '改了內容');
    assert.equal(await verifySession(SECRET, `${body}.${sig}`, 31 * 86400 * 1000), null, '超過 30 天');
    assert.equal(await verifySession(SECRET, 'garbage', 0), null);
  });
});

describe('LINE 登入', () => {
  test('/auth/line/login：導到 LINE，帶 state、nonce、redirect_uri', async () => {
    const r = await call('GET', '/auth/line/login?return=/day/2');
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get('location')!);
    assert.equal(loc.origin + loc.pathname, 'https://access.line.me/oauth2/v2.1/authorize');
    assert.equal(loc.searchParams.get('client_id'), '1234567890');
    assert.equal(loc.searchParams.get('redirect_uri'), `${BASE}/auth/line/callback`);
    assert.equal(loc.searchParams.get('scope'), 'openid profile');
    const [state, nonce, ret] = cookieValue(r, 'th_oauth')!.split('.');
    assert.equal(loc.searchParams.get('state'), state);
    assert.equal(loc.searchParams.get('nonce'), nonce);
    assert.equal(ret, '/day/2');
  });

  test('設定不齊：500，列出少了什麼', async () => {
    const r = await call('GET', '/auth/line/login', { env: env({ SESSION_SECRET: 'short' }) });
    assert.equal(r.status, 500);
    assert.match(await r.text(), /SESSION_SECRET（至少 32 個字元）/);
  });

  test('核准的群組裡的人：登入成功，寫進 members（group），回到原本的頁面', async () => {
    approveGroup('Cfamily');
    groupMembers.Cfamily = ['U1'];
    const r = await login({ sub: 'U1', name: '阿明' }, '/admin?x=1');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/admin?x=1');
    const token = cookieValue(r, 'th_session')!;
    assert.equal((await verifySession(SECRET, token))?.uid, 'U1');
    assert.equal(member('U1')?.source, 'group');
    const me = await call('GET', '/api/me', { cookie: `th_session=${token}` });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { member: { id: 'U1', displayName: '阿明', pictureUrl: null, source: 'group' }, isAdmin: false });
  });

  test('不在群組（404）：擋下來、記進等待核准；核准成白名單後就能進來', async () => {
    approveGroup('Cfamily');
    const r = await login({ sub: 'U9', name: '外人' });
    assert.equal(r.status, 403);
    assert.match(await r.text(), /不在家人的 LINE 群組裡/);
    assert.equal(cookieValue(r, 'th_session'), null);
    assert.equal(member('U9'), undefined);
    assert.equal((d1.db.prepare('SELECT attempts FROM login_requests WHERE line_user_id = ?').get('U9') as { attempts: number }).attempts, 1);

    const admin = await login({ sub: ADMIN, name: '管理員' });
    const adminCookie = `th_session=${cookieValue(admin, 'th_session')}`;
    const form = new URLSearchParams({ action: 'approve-request', id: 'U9' });
    const a = await call('POST', '/admin/action', { cookie: adminCookie, body: form });
    assert.equal(a.status, 303);
    assert.equal(member('U9')?.source, 'allowlist');

    const again = await login({ sub: 'U9', name: '外人' });
    assert.equal(again.status, 302);
    assert.equal(member('U9')?.source, 'allowlist', '白名單不會被改成別的');
  });

  test('還沒核准的群組不算數', async () => {
    d1.db.exec(`INSERT INTO line_groups (group_id, status, joined_at) VALUES ('Cother', 'pending', '2026-10-26T00:00:00Z')`);
    groupMembers.Cother = ['U2'];
    assert.equal((await login({ sub: 'U2', name: '別人的群組' })).status, 403);
  });

  test('管理員：沒有任何核准的群組也能進來（要先進管理頁核准群組）', async () => {
    const r = await login({ sub: ADMIN, name: '管理員' });
    assert.equal(r.status, 302);
    assert.equal(member(ADMIN)?.source, 'admin');
    const me = await call('GET', '/api/me', { cookie: `th_session=${cookieValue(r, 'th_session')}` });
    assert.equal(((await me.json()) as { isAdmin: boolean }).isAdmin, true);
  });

  test('被管理員停用的人：在群組裡也進不來；已經登入的也立刻被擋', async () => {
    approveGroup('Cfamily');
    groupMembers.Cfamily = ['U1'];
    const first = await login({ sub: 'U1', name: '阿明' });
    const cookie = `th_session=${cookieValue(first, 'th_session')}`;
    d1.db.exec(`UPDATE members SET disabled_at = '2026-10-26T00:00:00Z', disabled_reason = 'admin' WHERE line_user_id = 'U1'`);
    assert.equal((await call('GET', '/api/me', { cookie })).status, 403);
    const r = await login({ sub: 'U1', name: '阿明' });
    assert.equal(r.status, 403);
    assert.match(await r.text(), /停用/);
  });

  test('state 對不上、取消登入、授權碼不對', async () => {
    const start = await call('GET', '/auth/line/login');
    const oauth = cookieValue(start, 'th_oauth')!;
    const bad = await call('GET', '/auth/line/callback?code=c&state=wrong', { cookie: `th_oauth=${encodeURIComponent(oauth)}` });
    assert.equal(bad.status, 400);
    assert.equal((await call('GET', '/auth/line/callback?error=access_denied')).status, 400);
    const state = oauth.split('.')[0];
    const noCode = await call('GET', `/auth/line/callback?code=nobody&state=${state}`, { cookie: `th_oauth=${encodeURIComponent(oauth)}` });
    assert.equal(noCode.status, 502);
  });

  test('LINE 查群組成員失敗（5xx）：顯示稍後再試，不記進等待核准', async () => {
    approveGroup('Cfamily');
    memberApiStatus = 500;
    const r = await login({ sub: 'U1', name: '阿明' });
    assert.equal(r.status, 403);
    assert.match(await r.text(), /等一下再試/);
    assert.equal(d1.db.prepare('SELECT COUNT(*) AS n FROM login_requests').get()!.n, 0);
  });

  test('登出：清掉 cookie', async () => {
    const r = await call('POST', '/auth/logout');
    assert.equal(r.status, 302);
    assert.match(r.headers.getSetCookie().join(), /th_session=; .*Max-Age=0/);
  });

  test('回到哪裡：只接受站內路徑', async () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/line/login']) {
      const r = await call('GET', `/auth/line/login?return=${encodeURIComponent(bad)}`);
      assert.equal(cookieValue(r, 'th_oauth')!.split('.')[2], '/', bad);
    }
  });
});

describe('開發用的身分只在 localhost 有效', () => {
  test('DEV_AUTH = "1" 但不是 localhost：401', async () => {
    const r = await call('GET', '/api/me', { env: env({ DEV_AUTH: '1', DEV_MEMBER_ID: 'dev-a' }) });
    assert.equal(r.status, 401);
  });
  test('localhost：照舊可以用', async () => {
    const r = await handle(new Request('http://localhost:8787/api/me'), env({ DEV_AUTH: '1', DEV_MEMBER_ID: 'dev-a' }));
    assert.equal(r.status, 200);
  });
});

describe('LINE 的通知', () => {
  test('簽章不對：401，什麼都不記', async () => {
    const r = await webhook({ events: [{ type: 'join', source: { type: 'group', groupId: 'C1' } }] }, 'AAAA');
    assert.equal(r.status, 401);
    assert.equal(d1.db.prepare('SELECT COUNT(*) AS n FROM line_groups').get()!.n, 0);
  });

  test('Verify 按鈕（沒有事件）：200', async () => {
    assert.equal((await webhook({ events: [] })).status, 200);
  });

  test('join 記成等待核准；別的群組訊息也補記；leave 標成離開；又被邀回來就清掉', async () => {
    await webhook({ events: [{ type: 'join', source: { type: 'group', groupId: 'C1' } }] });
    let g = d1.db.prepare('SELECT * FROM line_groups WHERE group_id = ?').get('C1') as Record<string, unknown>;
    assert.equal(g.status, 'pending');
    assert.equal(g.group_name, '群組 C1');

    await webhook({ events: [{ type: 'message', source: { type: 'group', groupId: 'C2', userId: 'U1' } }] });
    assert.ok(d1.db.prepare('SELECT 1 FROM line_groups WHERE group_id = ?').get('C2'));

    d1.db.exec(`UPDATE line_groups SET status = 'approved' WHERE group_id = 'C1'`);
    await webhook({ events: [{ type: 'leave', source: { type: 'group', groupId: 'C1' } }] });
    g = d1.db.prepare('SELECT * FROM line_groups WHERE group_id = ?').get('C1') as Record<string, unknown>;
    assert.ok(g.left_at);
    await webhook({ events: [{ type: 'join', source: { type: 'group', groupId: 'C1' } }] });
    g = d1.db.prepare('SELECT * FROM line_groups WHERE group_id = ?').get('C1') as Record<string, unknown>;
    assert.equal(g.left_at, null);
    assert.equal(g.status, 'approved', '核准狀態照舊');
  });

  test('核准的群組有人退出：停用（left-group）；重新登入時還在別的核准群組就恢復', async () => {
    approveGroup('Cfamily');
    approveGroup('Cother');
    groupMembers.Cfamily = ['U1'];
    groupMembers.Cother = ['U1'];
    const first = await login({ sub: 'U1', name: '阿明' });
    const cookie = `th_session=${cookieValue(first, 'th_session')}`;

    await webhook({ events: [{ type: 'memberLeft', source: { type: 'group', groupId: 'Cfamily' }, left: { members: [{ type: 'user', userId: 'U1' }] } }] });
    assert.equal(member('U1')?.disabled_reason, 'left-group');
    assert.equal((await call('GET', '/api/me', { cookie })).status, 403, '已經登入的也立刻被擋');

    groupMembers.Cfamily = [];
    const again = await login({ sub: 'U1', name: '阿明' });
    assert.equal(again.status, 302);
    assert.equal(member('U1')?.disabled_at, null);
  });

  test('沒核准的群組有人退出：不影響', async () => {
    d1.db.exec(`INSERT INTO members (line_user_id, display_name, source) VALUES ('U1', '阿明', 'group')`);
    await webhook({ events: [{ type: 'memberLeft', source: { type: 'group', groupId: 'Cx' }, left: { members: [{ type: 'user', userId: 'U1' }] } }] });
    assert.equal(member('U1')?.disabled_at, null);
  });
});

describe('管理頁', () => {
  test('沒登入：登入頁；不是管理員：403；管理員：看得到群組和等待核准的人', async () => {
    const anon = await call('GET', '/admin');
    assert.equal(anon.status, 200);
    assert.match(await anon.text(), /用 LINE 登入/);

    approveGroup('Cfamily');
    groupMembers.Cfamily = ['U1'];
    const u1 = await login({ sub: 'U1', name: '阿明' });
    assert.equal((await call('GET', '/admin', { cookie: `th_session=${cookieValue(u1, 'th_session')}` })).status, 403);

    await login({ sub: 'U9', name: '外人' });
    const admin = await login({ sub: ADMIN, name: '管理員' });
    const page = await call('GET', '/admin', { cookie: `th_session=${cookieValue(admin, 'th_session')}` });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /外人/);
    assert.match(html, /阿明/);
  });

  test('核准群組、停用和恢復成員；不能停用自己', async () => {
    await webhook({ events: [{ type: 'join', source: { type: 'group', groupId: 'C1' } }] });
    const admin = await login({ sub: ADMIN, name: '管理員' });
    const cookie = `th_session=${cookieValue(admin, 'th_session')}`;
    const post = (action: string, id: string) => call('POST', '/admin/action', { cookie, body: new URLSearchParams({ action, id }) });

    await post('approve-group', 'C1');
    assert.equal((d1.db.prepare('SELECT status FROM line_groups WHERE group_id = ?').get('C1') as { status: string }).status, 'approved');

    d1.db.exec(`INSERT INTO members (line_user_id, display_name, source) VALUES ('U1', '阿明', 'group')`);
    await post('disable-member', 'U1');
    assert.equal(member('U1')?.disabled_reason, 'admin');
    await post('enable-member', 'U1');
    assert.equal(member('U1')?.disabled_at, null);
    assert.equal((await post('disable-member', ADMIN)).status, 400);
  });

  test('從別的網站送來的 POST：403', async () => {
    const admin = await login({ sub: ADMIN, name: '管理員' });
    const r = await call('POST', '/admin/action', {
      cookie: `th_session=${cookieValue(admin, 'th_session')}`,
      headers: { origin: 'https://evil.example' },
      body: new URLSearchParams({ action: 'approve-group', id: 'C1' }),
    });
    assert.equal(r.status, 403);
  });
});

describe('網站本身要先登入', () => {
  const assets = { fetch: async (req: Request) => new Response(`asset ${new URL(req.url).pathname}`) };

  test('沒登入：任何路徑都回登入頁，登入後回到原本的路徑', async () => {
    const r = await call('GET', '/some/page?day=3', { env: env({ ASSETS: assets }) });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /用 LINE 登入/);
    assert.match(html, /return=%2Fsome%2Fpage%3Fday%3D3/);
  });

  test('登入了：交給靜態檔案', async () => {
    const admin = await login({ sub: ADMIN, name: '管理員' });
    const r = await call('GET', '/index.html', { cookie: `th_session=${cookieValue(admin, 'th_session')}`, env: env({ ASSETS: assets }) });
    assert.equal(await r.text(), 'asset /index.html');
  });

  test('API 沒登入：401 JSON', async () => {
    const r = await call('GET', '/api/places');
    assert.equal(r.status, 401);
    assert.equal(((await r.json()) as { error: string }).error, 'unauthorized');
  });
});
