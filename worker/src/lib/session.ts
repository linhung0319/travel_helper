// 登入憑證（architecture §5）：`<內容 base64url>.<HMAC-SHA256 簽章 base64url>`，存在 HttpOnly cookie。
// 之後的 API 只驗這個憑證，不每次都問 LINE；有沒有被停用看 members（auth.ts）。

export const SESSION_COOKIE = 'th_session';
/** 有效期限 30 天：過期就重新登入，順便再檢查一次群組 */
export const SESSION_DAYS = 30;

export interface SessionPayload {
  /** LINE userId */
  uid: string;
  /** 發出、到期的時間（秒） */
  iat: number;
  exp: number;
}

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmac(secret: string, data: string | Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), typeof data === 'string' ? enc.encode(data) : data));
}

/** 長度一樣才逐 byte 比，不因為前面就不同而提早結束 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function checkSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET 沒設定或太短（至少 32 個字元）');
  return secret;
}

export async function signSession(secret: string, uid: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { uid, iat, exp: iat + SESSION_DAYS * 86400 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** 簽章不對、格式不對、過期都回 null */
export async function verifySession(secret: string, token: string, now = Date.now()): Promise<SessionPayload | null> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    if (!timingSafeEqual(fromB64url(sig), await hmac(secret, body))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof p.uid !== 'string' || typeof p.exp !== 'number') return null;
    return p.exp * 1000 > now ? p : null;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** HttpOnly、Secure、SameSite=Lax（從 LINE 導回來是一般的連結導向，Lax 會帶 cookie；別的網站送來的 POST 不會帶） */
export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export const clearCookie = (name: string) => setCookie(name, '', 0);
