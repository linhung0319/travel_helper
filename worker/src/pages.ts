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
body{margin:0;min-height:100dvh;background:linear-gradient(180deg,#f9bf8c 0%,#f7a56e 24%,#f28751 44%,#ea6a5c 58%,#d6506c 68%,#b8456f 84%,#9c3d6c 100%);background-attachment:fixed;color:#102a55;font:17px/1.6 system-ui,-apple-system,"Noto Sans TC",sans-serif;overflow-x:hidden}
.lg-sun{position:fixed;top:32px;right:-34px;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#fffbe0 0%,#fff1a8 55%,#ffd977 100%);box-shadow:0 0 60px 18px rgb(255 238 170/.5)}
.lg-art{position:fixed;inset:0;width:100%;height:100%;display:block}
.lg{position:relative;min-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;gap:24px;padding:calc(24px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))}
.lg p{margin:0}
.lg-serif,.lg-title h1{font-family:"Noto Serif TC","Hiragino Mincho ProN","Yu Mincho","Songti TC",serif}
.lg-title{display:flex;align-items:flex-start;gap:12px}
.lg-title h1{margin:0;writing-mode:vertical-rl;font-weight:900;font-size:44px;line-height:1.1;letter-spacing:.14em;color:#0f2f5e}
.lg-sub{order:-1}
.lg-seal{display:grid;place-items:center;width:32px;height:32px;margin-top:4px;border-radius:6px;background:#c8321f;color:#fff3dc;font-weight:900;font-size:19px;line-height:1}
.lg .lg-date{margin-top:4px;writing-mode:vertical-rl;font-size:15px;font-weight:700;letter-spacing:.16em;color:#0f2f5e}
.lg-family,.lg-route{display:none}
.lg-card{width:100%;max-width:400px;margin-inline:auto;padding:18px 20px;border-radius:18px;background:#fff8ea;box-shadow:0 10px 30px rgb(15 47 94/.32)}
.lg-lead{font-weight:700}
.lg-btn{display:flex;align-items:center;justify-content:center;min-height:54px;margin:12px 0 10px;border-radius:12px;background:#c8321f;color:#fff8ea;font-size:19px;font-weight:700;letter-spacing:.3em;text-indent:.3em;text-decoration:none}
.lg-btn:hover{background:#a92818}
.lg-btn:focus-visible{outline:3px solid #0f2f5e;outline-offset:2px}
.lg-note{font-size:14px;line-height:1.5;color:#51607a}
/* 網頁版（§27）：右邊一張從頂到底的米色短冊，字都在短冊上；太陽右邊約 70px 藏在短冊後面 */
@media (min-width:900px){
  .lg-sun{--side:clamp(40px,5vw,96px);--d:clamp(210px,19vw,330px);top:5vh;right:calc(var(--side) + 290px);width:var(--d);height:var(--d);box-shadow:0 0 90px 34px rgb(255 238 170/.55)}
  .lg{width:360px;margin:0 clamp(40px,5vw,96px) 0 auto;padding:9vh 40px 6vh;background:#fff8ea;box-shadow:0 0 0 1px rgb(15 47 94/.06),-18px 0 50px rgb(15 47 94/.28)}
  .lg-title{flex-direction:row-reverse;justify-content:center;align-items:stretch;gap:22px}
  .lg-title h1{font-size:clamp(56px,8.6vh,78px);line-height:1.05;letter-spacing:.16em}
  .lg .lg-date{margin:0;padding-top:.5em;letter-spacing:.2em;font-family:"Noto Serif TC","Hiragino Mincho ProN","Yu Mincho","Songti TC",serif}
  .lg-sub{order:0;display:flex;flex-direction:column;align-items:center}
  .lg-family{display:block;writing-mode:vertical-rl;padding-top:3.2em;font-size:17px;line-height:1.9;letter-spacing:.2em}
  .lg-seal{width:30px;height:30px;margin-top:14px;font-size:18px}
  .lg-card{display:flex;flex-direction:column;gap:12px;max-width:none;margin:0;padding:0;border-radius:0;background:none;box-shadow:none}
  .lg-lead{display:none}
  .lg-route{display:flex;flex-direction:column;gap:2px;font-size:13px;color:#7a6a4f;letter-spacing:.08em}
  .lg-route b{font-size:15px;color:#0f2f5e;letter-spacing:.12em}
  .lg-btn{min-height:56px;margin:0}
  .lg-note{font-size:13.5px;line-height:1.65}
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
<meta name="theme-color" content="#f9bf8c">
<meta name="robots" content="noindex"><title>伊勢志摩旅行</title><style>${LOGIN_STYLE}</style></head>
<body><div class="lg-sun"></div>${LOGIN_ART}<main class="lg">
<div class="lg-title"><h1>伊勢志摩</h1><p class="lg-date">二〇二七年二月</p><div class="lg-sub"><p class="lg-family lg-serif">一家人的行程</p><span class="lg-seal lg-serif" aria-hidden="true">旅</span></div></div>
<div class="lg-card">
<p class="lg-route"><span>2/2（二）– 2/13（六）· 11 晚</span><b>志摩 › 鳥羽 › 伊勢 › 大阪</b></p>
<p class="lg-lead">一家人的行程</p>
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
