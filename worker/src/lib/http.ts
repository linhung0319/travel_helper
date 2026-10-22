// HTTP 的小工具：JSON 回應、錯誤、讀 body、簡單的路由。

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad-request', message, details);
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message);
export const notFound = (message = '找不到') => new HttpError(404, 'not-found', message);
export const conflict = (code: string, message: string, details?: unknown) => new HttpError(409, code, message, details);

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { ...JSON_HEADERS, ...(init.headers ?? {}) } });
}

/** 已經是 JSON 文字的回應（資料點的 data 直接接起來，不在 Worker 裡解開再序列化：省 CPU 時間） */
export function rawJson(text: string, init: ResponseInit = {}): Response {
  return new Response(text, { ...init, headers: { ...JSON_HEADERS, ...(init.headers ?? {}) } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json({ error: e.code, message: e.message, ...(e.details === undefined ? {} : { details: e.details }) }, { status: e.status });
  }
  console.error(e);
  return json({ error: 'internal', message: '伺服器錯誤' }, { status: 500 });
}

/** 讀 JSON body：太大或不是物件就 400 */
export async function readBody(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'too-large', `內容太大（上限 ${maxBytes} bytes）`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest('body 不是合法的 JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('body 要是 JSON 物件');
  return body as Record<string, unknown>;
}

export type Handler<C> = (ctx: C, params: Record<string, string>) => Promise<Response>;

interface Route<C> {
  method: string;
  parts: string[];
  handler: Handler<C>;
}

/** 路徑像 /api/edits/:id/revert；:name 對到一段 */
export class Router<C> {
  private routes: Route<C>[] = [];

  on(method: string, pattern: string, handler: Handler<C>): this {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler<C>; params: Record<string, string> } | 'method-not-allowed' | null {
    const segs = pathname.split('/').filter(Boolean);
    let pathMatched = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      const ok = r.parts.every((p, i) => {
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(segs[i]);
          return true;
        }
        return p === segs[i];
      });
      if (!ok) continue;
      pathMatched = true;
      if (r.method === method) return { handler: r.handler, params };
    }
    return pathMatched ? 'method-not-allowed' : null;
  }
}

/** 現在的時間（UTC 的 ISO 字串）：只用來記錄誰、何時改的，行程的時間不用這個（architecture §3.8） */
export const nowIso = () => new Date().toISOString();

export const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
