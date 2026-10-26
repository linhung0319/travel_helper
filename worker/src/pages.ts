// Worker 自己回的幾個 HTML 頁面：登入、被擋下、錯誤、管理頁的外框。
// 家人多半在手機的 LINE 內建瀏覽器打開（architecture §5），所以字大、按鈕大，不靠 JS。

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#e3e3e3;--card:#f6f6f6;--green:#06c755;--red:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--fg:#eee;--muted:#aaa;--line:#333;--card:#1e1e1e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 system-ui,-apple-system,"Noto Sans TC",sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 16px calc(32px + env(safe-area-inset-bottom))}
h1{font-size:24px;margin:0 0 12px}
h2{font-size:19px;margin:28px 0 8px}
p{margin:8px 0}
.muted{color:var(--muted);font-size:15px}
.btn{display:inline-block;border:0;border-radius:10px;padding:14px 24px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;background:var(--card);color:var(--fg)}
.btn.line{background:var(--green);color:#fff;font-size:19px;width:100%;text-align:center}
.btn.small{padding:6px 12px;font-size:15px;font-weight:600}
.btn.danger{color:var(--red)}
.card{background:var(--card);border-radius:12px;padding:12px;margin:8px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.card img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.card .grow{flex:1;min-width:160px;overflow-wrap:anywhere}
.tag{font-size:13px;border:1px solid var(--line);border-radius:6px;padding:0 6px;margin-left:4px;color:var(--muted)}
form{display:inline}
code{font-size:13px;overflow-wrap:anywhere}
`;

export function page(title: string, body: string, status = 200, headers: Record<string, string> = {}): Response {
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** 還沒登入：只有一顆「用 LINE 登入」 */
export function loginPage(returnTo: string): Response {
  const href = `/auth/line/login?return=${encodeURIComponent(returnTo)}`;
  return page(
    '伊勢志摩旅行',
    `<h1>伊勢志摩旅行 2027</h1>
<p>這是家人一起排行程用的網站，要先用 LINE 登入。</p>
<p style="margin:24px 0"><a class="btn line" href="${esc(href)}">用 LINE 登入</a></p>
<p class="muted">只有家人 LINE 群組裡的人能進來。登入時 LINE 會問你要不要同意，按「許可」就好。</p>`,
  );
}

export function blockedPage(o: { name?: string; reason: 'not-member' | 'disabled' | 'line-error' }): Response {
  const why =
    o.reason === 'disabled'
      ? '這個帳號已經停用了。'
      : o.reason === 'line-error'
        ? '現在沒辦法向 LINE 確認你在不在家人群組裡，請等一下再試。'
        : '你不在家人的 LINE 群組裡，所以還不能進來。';
  return page(
    '還不能進來',
    `<h1>還不能進來</h1>
${o.name ? `<p>${esc(o.name)}，你好：</p>` : ''}<p>${why}</p>
<p>請告訴管理員，他可以在管理頁讓你進來。</p>
<p style="margin-top:24px"><a class="btn" href="/auth/line/login">重新登入</a></p>`,
    403,
  );
}

export function errorPage(title: string, message: string, status = 400): Response {
  return page(
    title,
    `<h1>${esc(title)}</h1><p>${esc(message)}</p>
<p style="margin-top:24px"><a class="btn" href="/">回首頁</a></p>`,
    status,
  );
}
