// LINE 的通知（POST /line/webhook，architecture §5）。機器人不發訊息，只用來：
// - join：記下群組（pending，要 👤 在管理頁核准才算數）
// - 其他來自群組的通知：沒記過的群組也補記（機器人在 webhook 上線前就已經在群組裡的情況）
// - leave：機器人被移出群組，這個群組不再拿來檢查
// - memberLeft：核准的群組裡有人退出 → 這個人（source = 'group'）標成停用；重新登入時再檢查，還在別的核准群組就恢復
// 簽章不對回 401；簽章對了一律回 200（LINE 會重送失敗的通知）。

import type { Env } from './env.ts';
import { json, nowIso } from './lib/http.ts';
import { groupName, verifyWebhookSignature } from './lib/line.ts';

interface LineEvent {
  type: string;
  source?: { type?: string; groupId?: string; userId?: string };
  left?: { members?: { type?: string; userId?: string }[] };
}

async function rememberGroup(env: Env, groupId: string, rejoined: boolean) {
  const known = await env.DB.prepare('SELECT left_at FROM line_groups WHERE group_id = ?').bind(groupId).first<{ left_at: string | null }>();
  if (known && !(rejoined && known.left_at)) return;
  const name = await groupName(env.LINE_MESSAGING_ACCESS_TOKEN ?? '', groupId);
  // 被移出後又被邀回來：清掉 left_at，核准狀態照舊（被拒絕的還是拒絕）
  await env.DB.prepare(
    `INSERT INTO line_groups (group_id, group_name, joined_at) VALUES (?, ?, ?)
     ON CONFLICT (group_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at,
       group_name = COALESCE(excluded.group_name, line_groups.group_name)`,
  )
    .bind(groupId, name, nowIso())
    .run();
}

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed', message: '只收 POST' }, { status: 405 });
  if (!env.LINE_MESSAGING_CHANNEL_SECRET) return json({ error: 'not-configured', message: '沒有設定 LINE_MESSAGING_CHANNEL_SECRET' }, { status: 500 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (!(await verifyWebhookSignature(env.LINE_MESSAGING_CHANNEL_SECRET, body, req.headers.get('x-line-signature')))) {
    return json({ error: 'bad-signature', message: '簽章不對' }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(new TextDecoder().decode(body)) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return json({ ok: true });
  }

  for (const ev of events) {
    const groupId = ev.source?.type === 'group' ? ev.source.groupId : undefined;
    if (!groupId) continue;
    if (ev.type === 'leave') {
      await env.DB.prepare('UPDATE line_groups SET left_at = ? WHERE group_id = ? AND left_at IS NULL').bind(nowIso(), groupId).run();
      continue;
    }
    await rememberGroup(env, groupId, ev.type === 'join');
    if (ev.type === 'memberLeft') {
      const g = await env.DB.prepare('SELECT status FROM line_groups WHERE group_id = ?').bind(groupId).first<{ status: string }>();
      if (g?.status !== 'approved') continue;
      for (const m of ev.left?.members ?? []) {
        if (!m.userId) continue;
        await env.DB.prepare(
          `UPDATE members SET disabled_at = ?, disabled_reason = 'left-group'
           WHERE line_user_id = ? AND source = 'group' AND disabled_at IS NULL`,
        )
          .bind(nowIso(), m.userId)
          .run();
      }
    }
  }
  return json({ ok: true });
}
