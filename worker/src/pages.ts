// Worker 自己回的幾個 HTML 頁面：登入、被擋下、錯誤、管理頁的外框。
// 家人多半在手機的 LINE 內建瀏覽器打開（architecture §5），所以字大、按鈕大，不靠 JS。
// 登入頁是家人第一眼看到的：木版畫風的夕陽和大浪（loginArt.ts，scripts/login-art.mjs 產生），內嵌在頁面裡，不用多一個請求，字型也只用系統字。

import { LOGIN_ART } from './loginArt.ts';

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

const LOGIN_STYLE = `
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;min-height:100dvh;background:linear-gradient(180deg,#fbd893 0%,#f9b26a 30%,#f27f5c 52%,#d9506f 68%,#c9456e 100%);background-attachment:fixed;color:#102a55;font:17px/1.6 system-ui,-apple-system,"Noto Sans TC",sans-serif;overflow-x:hidden}
.lg-sun{position:fixed;top:32px;right:-34px;width:190px;height:190px;border-radius:50%;background:linear-gradient(180deg,#fff2a6,#ffd777)}
.lg-art{position:fixed;inset:0;width:100%;height:100%;display:block}
.lg{position:relative;min-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;gap:24px;padding:calc(24px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))}
.lg-title{display:flex;align-items:flex-start;gap:12px}
.lg-title h1{margin:0;writing-mode:vertical-rl;font:900 44px/1.1 "Noto Serif TC","Hiragino Mincho ProN","Yu Mincho","Songti TC",serif;letter-spacing:.14em;color:#0f2f5e}
.lg-seal{display:grid;place-items:center;width:32px;height:32px;margin-top:4px;border-radius:6px;background:#c8321f;color:#fff3dc;font:900 19px/1 "Noto Serif TC","Hiragino Mincho ProN","Yu Mincho","Songti TC",serif}
.lg-date{margin:4px 0 0;writing-mode:vertical-rl;font-size:15px;font-weight:700;letter-spacing:.16em;color:#0f2f5e}
.lg-card{width:100%;max-width:400px;margin-inline:auto;padding:18px 20px;border-radius:18px;background:#fff8ea;box-shadow:0 10px 30px rgb(15 47 94/.32)}
.lg-card p{margin:0}
.lg-lead{font-weight:700}
.lg-btn{display:flex;align-items:center;justify-content:center;min-height:54px;margin:12px 0 10px;border-radius:12px;background:#c8321f;color:#fff8ea;font-size:19px;font-weight:700;letter-spacing:.3em;text-indent:.3em;text-decoration:none}
.lg-btn:hover{background:#a92818}
.lg-btn:focus-visible{outline:3px solid #0f2f5e;outline-offset:2px}
.lg-note{font-size:14px;line-height:1.5;color:#51607a}
@media (min-width:900px){
  .lg-sun{top:6vh;right:clamp(90px,14vw,240px);width:280px;height:280px}
  .lg{justify-content:center;align-items:flex-end;gap:32px;padding:40px clamp(40px,7vw,120px)}
  .lg-title{width:360px;justify-content:flex-end}
  .lg-title h1{font-size:64px}
  .lg-date{font-size:17px}
  .lg-card{width:360px;margin:0}
}
`;

export function page(title: string, body: string, status = 200, headers: Record<string, string> = {}): Response {
  return htmlResponse(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`, status, headers);
}

function htmlResponse(html: string, status: number, headers: Record<string, string>): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** 還沒登入：只有一顆「用 LINE 登入」 */
export function loginPage(returnTo: string): Response {
  const href = `/auth/line/login?return=${encodeURIComponent(returnTo)}`;
  return htmlResponse(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#fbd893">
<meta name="robots" content="noindex"><title>伊勢志摩旅行</title><style>${LOGIN_STYLE}</style></head>
<body><div class="lg-sun"></div>${LOGIN_ART}<main class="lg">
<div class="lg-title"><span class="lg-seal" aria-hidden="true">旅</span><h1>伊勢志摩</h1><p class="lg-date">二〇二七年二月</p></div>
<div class="lg-card">
<p class="lg-lead">一家 15 人的行程，大家一起排。</p>
<a class="lg-btn" href="${esc(href)}">登入</a>
<p class="lg-note">只有家人能進來。按了會跳到 LINE 確認身分，第一次按「許可」就好。</p>
</div>
</main></body></html>`,
    200,
    {},
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
