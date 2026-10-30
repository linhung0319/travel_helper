// 展開 Google Maps 短網址（T31）。
//
// GET /api/resolve-map-link?url=<網址>  → { url }：一路跟轉址，回傳最後的網址
//
// 瀏覽器不能直接跟 maps.app.goo.gl 的轉址（CORS），所以由 Worker 代跑。
// 為了避免被拿去打別的網站（SSRF），起點和每一跳都只接受 Google 的網址。

import type { Ctx } from '../env.ts';
import { badRequest, json } from '../lib/http.ts';

const MAX_REDIRECTS = 5;
const HOST_OK = [/(^|\.)google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/, /(^|\.)goo\.gl$/];

const hostOk = (u: URL) => u.protocol === 'https:' && HOST_OK.some((re) => re.test(u.hostname));

/** 起點只收短網址 */
function startOk(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  if (u.hostname === 'maps.app.goo.gl') return true;
  return u.hostname === 'goo.gl' && u.pathname.startsWith('/maps/');
}

export async function resolveMapLink({ url }: Ctx): Promise<Response> {
  const raw = url.searchParams.get('url');
  let current: URL;
  try {
    current = new URL(raw ?? '');
  } catch {
    throw badRequest('url 不是合法的網址');
  }
  if (!startOk(current)) throw badRequest('只接受 Google Maps 的短網址（maps.app.goo.gl）');
  for (let hops = 0; ; hops++) {
    let res: Response;
    try {
      res = await globalThis.fetch(current.href, { redirect: 'manual' });
    } catch {
      throw badRequest('展開短網址失敗');
    }
    // 不讀內容，關掉 body 免得連線掛著
    await res.body?.cancel().catch(() => {});
    if (res.status < 300 || res.status >= 400) return json({ url: current.href });
    if (hops >= MAX_REDIRECTS) throw badRequest('轉址太多次');
    const loc = res.headers.get('location');
    if (!loc) throw badRequest('轉址沒有目的地');
    let next: URL;
    try {
      next = new URL(loc, current);
    } catch {
      throw badRequest('轉址的網址不合法');
    }
    if (!hostOk(next)) throw badRequest('轉址到不是 Google 的網站，不跟');
    current = next;
  }
}
