// 管理頁（GET /admin、POST /admin/action）：只有 ADMIN_LINE_USER_IDS 的人能開。
// - 群組：機器人被邀進的群組要核准，群組成員才能登入（誰都能把機器人邀進自己的群組）
// - 等待核准：登入被擋下的人，可以核准成白名單
// - 成員：停用、恢復、改成白名單
// 不靠 JS：每個按鈕是一個 form，做完 303 回到 /admin。

import { currentMember, isAdmin } from './auth.ts';
import type { Env, Member } from './env.ts';
import { HttpError, nowIso } from './lib/http.ts';
import { blockedPage, errorPage, esc, loginPage, page } from './pages.ts';

interface GroupRow {
  group_id: string;
  group_name: string | null;
  status: string;
  joined_at: string;
  left_at: string | null;
}
interface RequestRow {
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
  last_at: string;
  attempts: number;
}
interface MemberRow {
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
  source: string;
  checked_at: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
}

const SOURCE_LABEL: Record<string, string> = { group: '群組', allowlist: '白名單', admin: '管理員', dev: '開發用' };
const STATUS_LABEL: Record<string, string> = { pending: '等待核准', approved: '已核准', rejected: '不核准' };

/** 日本時間的「月/日 時:分」：只是給人看的紀錄時間 */
const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const button = (action: string, id: string, label: string, cls = '') =>
  `<form method="post" action="/admin/action"><input type="hidden" name="action" value="${esc(action)}"><input type="hidden" name="id" value="${esc(id)}"><button class="btn small ${cls}">${esc(label)}</button></form>`;

const avatar = (url: string | null) => (url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">` : '');

async function requireAdmin(req: Request, env: Env): Promise<Member | Response> {
  let member: Member;
  try {
    member = await currentMember(req, env);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return loginPage('/admin');
    if (e instanceof HttpError && e.status === 403) return blockedPage({ reason: 'disabled' });
    throw e;
  }
  if (!isAdmin(env, member)) return errorPage('只有管理員能看', `這一頁只給管理員。你的 LINE userId 是 ${member.id}。`, 403);
  return member;
}

async function render(env: Env, me: Member): Promise<Response> {
  const db = env.DB;
  const [groups, requests, members] = await Promise.all([
    db.prepare('SELECT group_id, group_name, status, joined_at, left_at FROM line_groups ORDER BY joined_at DESC').all<GroupRow>(),
    db
      .prepare('SELECT line_user_id, display_name, picture_url, last_at, attempts FROM login_requests WHERE dismissed_at IS NULL ORDER BY last_at DESC')
      .all<RequestRow>(),
    db
      .prepare('SELECT line_user_id, display_name, picture_url, source, checked_at, disabled_at, disabled_reason FROM members ORDER BY disabled_at IS NOT NULL, display_name')
      .all<MemberRow>(),
  ]);

  const groupHtml = groups.results.length
    ? groups.results
        .map((g) => {
          const actions = [g.status !== 'approved' ? button('approve-group', g.group_id, '核准') : '', g.status !== 'rejected' ? button('reject-group', g.group_id, '不核准', 'danger') : ''].join(' ');
          return `<div class="card"><div class="grow"><b>${esc(g.group_name ?? '（拿不到群組名稱）')}</b><span class="tag">${esc(STATUS_LABEL[g.status] ?? g.status)}</span>${g.left_at ? '<span class="tag">機器人已離開</span>' : ''}<br><span class="muted">加入 ${when(g.joined_at)}・<code>${esc(g.group_id)}</code></span></div>${actions}</div>`;
        })
        .join('')
    : '<p class="muted">還沒有。把官方帳號邀進家人群組後，這裡會出現那個群組。</p>';

  const requestHtml = requests.results.length
    ? requests.results
        .map(
          (r) =>
            `<div class="card">${avatar(r.picture_url)}<div class="grow"><b>${esc(r.display_name)}</b><br><span class="muted">最後一次 ${when(r.last_at)}・試了 ${r.attempts} 次</span></div>${button('approve-request', r.line_user_id, '核准（白名單）')} ${button('dismiss-request', r.line_user_id, '不核准', 'danger')}</div>`,
        )
        .join('')
    : '<p class="muted">沒有人在等。</p>';

  const memberHtml = members.results
    .map((m) => {
      const disabled = m.disabled_at
        ? `<span class="tag">${m.disabled_reason === 'left-group' ? '退出群組，重新登入時再檢查' : '已停用'}</span>`
        : '';
      const actions = m.disabled_at
        ? button('enable-member', m.line_user_id, '恢復')
        : [m.source !== 'allowlist' ? button('allowlist-member', m.line_user_id, '改成白名單') : '', m.line_user_id !== me.id ? button('disable-member', m.line_user_id, '停用', 'danger') : ''].join(' ');
      return `<div class="card">${avatar(m.picture_url)}<div class="grow"><b>${esc(m.display_name)}</b><span class="tag">${esc(SOURCE_LABEL[m.source] ?? m.source)}</span>${disabled}<br><span class="muted">最後檢查 ${when(m.checked_at)}</span></div>${actions}</div>`;
    })
    .join('');

  return page(
    '管理頁',
    `<h1>管理頁</h1>
<p class="muted">${esc(me.displayName)}（<code>${esc(me.id)}</code>）・<a href="/">回網站</a></p>
<h2>LINE 群組</h2>
<p class="muted">核准的群組裡的人才能登入。只核准家人的群組。</p>${groupHtml}
<h2>等待核准</h2>
<p class="muted">登入被擋下來的人（不在核准的群組裡）。核准後加進白名單，不用在群組裡也能進來。</p>${requestHtml}
<h2>成員（${members.results.length}）</h2>${memberHtml}`,
  );
}

async function act(env: Env, me: Member, action: string, id: string) {
  const db = env.DB;
  const now = nowIso();
  switch (action) {
    case 'approve-group':
    case 'reject-group':
      await db
        .prepare('UPDATE line_groups SET status = ?, decided_by = ?, decided_at = ? WHERE group_id = ?')
        .bind(action === 'approve-group' ? 'approved' : 'rejected', me.id, now, id)
        .run();
      return;
    case 'approve-request': {
      const r = await db.prepare('SELECT display_name, picture_url FROM login_requests WHERE line_user_id = ?').bind(id).first<RequestRow>();
      if (!r) return;
      await db.batch([
        db
          .prepare(
            `INSERT INTO members (line_user_id, display_name, picture_url, source, checked_at) VALUES (?, ?, ?, 'allowlist', ?)
             ON CONFLICT (line_user_id) DO UPDATE SET source = 'allowlist', disabled_at = NULL, disabled_reason = NULL`,
          )
          .bind(id, r.display_name, r.picture_url, now),
        db.prepare('DELETE FROM login_requests WHERE line_user_id = ?').bind(id),
      ]);
      return;
    }
    case 'dismiss-request':
      await db.prepare('UPDATE login_requests SET dismissed_at = ? WHERE line_user_id = ?').bind(now, id).run();
      return;
    case 'disable-member':
      if (id === me.id) throw new HttpError(400, 'bad-request', '不能停用自己');
      await db.prepare("UPDATE members SET disabled_at = ?, disabled_reason = 'admin' WHERE line_user_id = ?").bind(now, id).run();
      return;
    case 'enable-member':
      await db.prepare('UPDATE members SET disabled_at = NULL, disabled_reason = NULL WHERE line_user_id = ?').bind(id).run();
      return;
    case 'allowlist-member':
      await db.prepare("UPDATE members SET source = 'allowlist' WHERE line_user_id = ?").bind(id).run();
      return;
    default:
      throw new HttpError(400, 'bad-request', `不認得的動作：${action}`);
  }
}

export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  const me = await requireAdmin(req, env);
  if (me instanceof Response) return me;
  if (url.pathname === '/admin' && req.method === 'GET') return render(env, me);
  if (url.pathname === '/admin/action' && req.method === 'POST') {
    const form = await req.formData();
    try {
      await act(env, me, String(form.get('action') ?? ''), String(form.get('id') ?? ''));
    } catch (e) {
      if (e instanceof HttpError) return errorPage('沒有做', e.message, e.status);
      throw e;
    }
    return new Response(null, { status: 303, headers: { location: '/admin', 'cache-control': 'no-store' } });
  }
  return errorPage('找不到', '沒有這個頁面', 404);
}
