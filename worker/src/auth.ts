// 登入（architecture §5）：LINE 登入＋家人群組檢查，另有白名單。
//
// - 之後的請求只驗登入憑證（cookie，lib/session.ts），再看 members 有沒有被停用。
// - 開發用的固定身分（T24）：DEV_AUTH = "1" 而且是 localhost 的請求才有效。
//   預設是 DEV_MEMBER_ID；測「只有本人能刪」時可以加 header `X-Dev-Member: <id>` 切換成別人；
//   第一次看到的身分自動寫進 members（source = 'dev'）。ngrok 通道、正式環境都不是 localhost，一律要 LINE 登入。
// - 登入時才檢查群組（每次登入一次；憑證 30 天）：
//   1. 管理員（ADMIN_LINE_USER_IDS）一律可以進來：還沒核准任何群組時，要先有人能進管理頁
//   2. 在任何一個「核准、機器人還在」的群組裡（line_groups）→ source = 'group'
//   3. 白名單（members.source = 'allowlist'）
//   被管理員停用的（disabled_reason = 'admin'）都不行；退出群組被停用的（left-group）重新檢查通過就恢復。
//   沒通過的記進 login_requests，管理頁可以核准成白名單。

import type { Env, Member } from './env.ts';
import { HttpError, nowIso } from './lib/http.ts';
import { authorizeUrl, isGroupMember, LineError, loginWithCode, type LineProfile } from './lib/line.ts';
import { b64url, checkSecret, clearCookie, readCookie, SESSION_COOKIE, SESSION_DAYS, setCookie, signSession, verifySession } from './lib/session.ts';
import { blockedPage, errorPage } from './pages.ts';

const DEV_ID = /^dev-[a-z0-9-]{1,40}$/;
const OAUTH_COOKIE = 'th_oauth';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

interface MemberRow {
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
  source: string;
  disabled_at: string | null;
  disabled_reason: string | null;
}

const toMember = (r: MemberRow): Member => ({ id: r.line_user_id, displayName: r.display_name, pictureUrl: r.picture_url, source: r.source });

async function memberRow(db: D1Database, id: string) {
  return db
    .prepare('SELECT line_user_id, display_name, picture_url, source, disabled_at, disabled_reason FROM members WHERE line_user_id = ?')
    .bind(id)
    .first<MemberRow>();
}

export const isLocalRequest = (req: Request) => LOCAL_HOSTS.has(new URL(req.url).hostname);

export function adminIds(env: Env): Set<string> {
  return new Set((env.ADMIN_LINE_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export const isAdmin = (env: Env, member: Member) => adminIds(env).has(member.id);

export async function currentMember(req: Request, env: Env): Promise<Member> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token && env.SESSION_SECRET) {
    const s = await verifySession(env.SESSION_SECRET, token);
    if (s) {
      const row = await memberRow(env.DB, s.uid);
      if (!row) throw new HttpError(401, 'unauthorized', '請重新登入');
      if (row.disabled_at) throw new HttpError(403, 'disabled', '這個帳號已停用，請洽管理員');
      return toMember(row);
    }
  }
  if (env.DEV_AUTH === '1' && isLocalRequest(req)) return devMember(req, env);
  throw new HttpError(401, 'unauthorized', '請先登入');
}

async function devMember(req: Request, env: Env): Promise<Member> {
  const id = req.headers.get('x-dev-member') ?? env.DEV_MEMBER_ID ?? 'dev-user';
  if (!DEV_ID.test(id)) throw new HttpError(401, 'unauthorized', '開發用的身分要是 dev- 開頭');
  const name = id === env.DEV_MEMBER_ID && env.DEV_MEMBER_NAME ? env.DEV_MEMBER_NAME : id;
  await env.DB.prepare(
    `INSERT INTO members (line_user_id, display_name, source, checked_at) VALUES (?, ?, 'dev', ?)
     ON CONFLICT (line_user_id) DO NOTHING`,
  )
    .bind(id, name, nowIso())
    .run();
  const row = await memberRow(env.DB, id);
  if (!row || row.disabled_at) throw new HttpError(403, 'disabled', '這個帳號已停用，請洽管理員');
  return toMember(row);
}

// ---- 能不能進來 ----

export type Access = { ok: true; source: string } | { ok: false; reason: 'not-member' | 'disabled' | 'line-error' };

/** 登入時檢查一次（不寫資料庫） */
export async function decideAccess(env: Env, profile: LineProfile): Promise<Access> {
  const row = await memberRow(env.DB, profile.userId);
  if (row?.disabled_reason === 'admin') return { ok: false, reason: 'disabled' };
  if (adminIds(env).has(profile.userId)) return { ok: true, source: row?.source === 'group' || row?.source === 'allowlist' ? row.source : 'admin' };

  const groups = await env.DB.prepare("SELECT group_id FROM line_groups WHERE status = 'approved' AND left_at IS NULL ORDER BY joined_at").all<{
    group_id: string;
  }>();
  let lineFailed = false;
  for (const g of groups.results) {
    try {
      if (await isGroupMember(env.LINE_MESSAGING_ACCESS_TOKEN ?? '', g.group_id, profile.userId)) return { ok: true, source: 'group' };
    } catch (e) {
      if (!(e instanceof LineError)) throw e;
      console.error(`查群組成員失敗（${g.group_id}）`, e.status, e.body);
      lineFailed = true;
    }
  }
  if (row?.source === 'allowlist') return { ok: true, source: 'allowlist' };
  return { ok: false, reason: lineFailed ? 'line-error' : 'not-member' };
}

async function admit(env: Env, profile: LineProfile, source: string) {
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO members (line_user_id, display_name, picture_url, source, checked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (line_user_id) DO UPDATE SET display_name = excluded.display_name, picture_url = excluded.picture_url,
         source = excluded.source, checked_at = excluded.checked_at, disabled_at = NULL, disabled_reason = NULL`,
    ).bind(profile.userId, profile.displayName, profile.pictureUrl, source, now),
    env.DB.prepare('DELETE FROM login_requests WHERE line_user_id = ?').bind(profile.userId),
  ]);
}

async function recordRequest(env: Env, profile: LineProfile) {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO login_requests (line_user_id, display_name, picture_url, first_at, last_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (line_user_id) DO UPDATE SET display_name = excluded.display_name, picture_url = excluded.picture_url,
       last_at = excluded.last_at, attempts = attempts + 1, dismissed_at = NULL`,
  )
    .bind(profile.userId, profile.displayName, profile.pictureUrl, now, now)
    .run();
}

// ---- /auth/* ----

function missingConfig(env: Env): string[] {
  const need = ['LINE_LOGIN_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_SECRET', 'LINE_MESSAGING_ACCESS_TOKEN', 'SESSION_SECRET', 'PUBLIC_BASE_URL'] as const;
  const missing: string[] = need.filter((k) => !env[k]);
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET（至少 32 個字元）');
  return missing;
}

const callbackUrl = (env: Env) => `${env.PUBLIC_BASE_URL!.replace(/\/+$/, '')}/auth/line/callback`;

/** 登入後回到哪裡：只接受站內的路徑 */
export function safeReturn(s: string | null): string {
  return s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') && !s.startsWith('/auth/') ? s : '/';
}

const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

export async function handleAuth(req: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/auth/logout' && (req.method === 'POST' || req.method === 'GET')) {
    return redirect('/', [clearCookie(SESSION_COOKIE)]);
  }
  if (req.method !== 'GET') return errorPage('不支援', `${url.pathname} 不支援 ${req.method}`, 405);
  if (url.pathname !== '/auth/line/login' && url.pathname !== '/auth/line/callback') return errorPage('找不到', '沒有這個頁面', 404);

  const missing = missingConfig(env);
  if (missing.length) return errorPage('LINE 登入還沒設定好', `伺服器少了這些設定：${missing.join('、')}`, 500);

  if (url.pathname === '/auth/line/login') {
    const state = randomToken();
    const nonce = randomToken();
    const ret = safeReturn(url.searchParams.get('return'));
    const location = authorizeUrl({ channelId: env.LINE_LOGIN_CHANNEL_ID!, redirectUri: callbackUrl(env), state, nonce });
    return redirect(location, [setCookie(OAUTH_COOKIE, `${state}.${nonce}.${ret}`, 600)]);
  }

  // /auth/line/callback
  const done = (res: Response) => {
    res.headers.append('set-cookie', clearCookie(OAUTH_COOKIE));
    return res;
  };
  if (url.searchParams.get('error')) {
    return done(errorPage('沒有登入', 'LINE 登入取消了，或是 LINE 回報錯誤。可以回首頁再試一次。', 400));
  }
  const saved = readCookie(req, OAUTH_COOKIE);
  const [state, nonce, ...rest] = (saved ?? '').split('.');
  const code = url.searchParams.get('code');
  if (!saved || !state || !nonce || url.searchParams.get('state') !== state || !code) {
    return done(errorPage('登入逾時', '登入的步驟對不上（可能放太久，或換了瀏覽器）。請回首頁重新登入。', 400));
  }

  let profile: LineProfile;
  try {
    profile = await loginWithCode({
      code,
      redirectUri: callbackUrl(env),
      channelId: env.LINE_LOGIN_CHANNEL_ID!,
      channelSecret: env.LINE_LOGIN_CHANNEL_SECRET!,
      nonce,
    });
  } catch (e) {
    if (!(e instanceof LineError)) throw e;
    console.error(e.message, e.status, e.body);
    return done(errorPage('登入失敗', 'LINE 登入沒有成功，請回首頁再試一次。', 502));
  }

  const access = await decideAccess(env, profile);
  if (!access.ok) {
    if (access.reason === 'not-member') await recordRequest(env, profile);
    return done(blockedPage({ name: profile.displayName, reason: access.reason }));
  }
  await admit(env, profile, access.source);
  const token = await signSession(checkSecret(env.SESSION_SECRET), profile.userId);
  return done(redirect(safeReturn(rest.join('.')), [setCookie(SESSION_COOKIE, token, SESSION_DAYS * 86400)]));
}
