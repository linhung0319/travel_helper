// 呼叫 Worker：API 和 /static/ 都要登入（同一個網站，cookie 自動帶）。錯誤一律變成 BackendError。

import { BackendError } from './types.ts';

let reloading = false;

/** 登入過期（401）、帳號被停用（403 disabled）：重新載入，Worker 會顯示登入頁或停用頁 */
function backToLogin() {
  if (reloading || typeof location === 'undefined') return;
  reloading = true;
  location.reload();
}

const send = async (input: string, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(input, { credentials: 'same-origin', ...init });
  } catch {
    throw new BackendError(0, 'network', '連不上伺服器，請檢查網路再試一次');
  }
};

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (res.ok) return parsed as T;
  const e = (parsed ?? {}) as { error?: string; message?: string; details?: unknown };
  if (res.status === 401 || (res.status === 403 && e.error === 'disabled')) backToLogin();
  throw new BackendError(res.status, e.error ?? 'error', e.message ?? `伺服器錯誤（${res.status}）`, e.details);
}

/**
 * /static/ 的 JSON。沒登入時 Worker 回登入頁（HTML），不存在的檔案也可能回網站的 index.html（not_found_handling），
 * 所以除了狀態碼也要看內容是不是 JSON。
 */
export async function staticJson<T>(path: string): Promise<T> {
  const res = await send(path);
  if (res.status === 401) backToLogin();
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('json')) throw new BackendError(res.status, 'static', `讀不到 ${path}`);
  return (await res.json()) as T;
}
