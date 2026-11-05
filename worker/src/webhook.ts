// LINE 的通知（POST /line/webhook，architecture §5）：
// - join：記下群組（pending，要 👤 在管理頁核准才算數）
// - 其他來自群組的通知：沒記過的群組也補記（機器人在 webhook 上線前就已經在群組裡的情況）
// - leave：機器人被移出群組，這個群組不再拿來檢查
// - memberLeft：核准的群組裡有人退出 → 這個人（source = 'group'）標成停用；重新登入時再檢查，還在別的核准群組就恢復
// - message（T34）：核准的群組裡有人 @ 機器人 → 回覆最新的行程（bot.ts）。其他訊息、沒核准的群組、私訊都不回
// - postback（T73）：核准的群組裡有人按回覆下面的按鈕（Quick Reply） → data 當成問的話回覆，不用 @
// 簽章不對回 401；簽章對了一律回 200（LINE 會重送失敗的通知）。回覆在回 200 之後做（waitUntil），不讓 LINE 等 AI。

import type { Env } from './env.ts';
import { botReply, stripMentions } from './bot.ts';
import { json, nowIso } from './lib/http.ts';
import { groupName, replyMessage, verifyWebhookSignature } from './lib/line.ts';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; groupId?: string; userId?: string };
  left?: { members?: { type?: string; userId?: string }[] };
  message?: {
    type?: string;
    text?: string;
    mention?: { mentionees?: { index: number; length: number; type?: string; isSelf?: boolean }[] };
  };
  postback?: { data?: string };
}

/** 回 200 之後還要做完的事（Worker 的 ctx.waitUntil）；測試時沒有，就直接等 */
export type WaitUntil = (p: Promise<unknown>) => void;

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

/** 核准、機器人還在的群組 */
async function approved(env: Env, groupId: string): Promise<boolean> {
  const g = await env.DB.prepare('SELECT status, left_at FROM line_groups WHERE group_id = ?').bind(groupId).first<{ status: string; left_at: string | null }>();
  return g?.status === 'approved' && !g.left_at;
}

/** 有人 @ 機器人或按了按鈕：照問題回覆。出錯只記 log（不能讓 LINE 重送） */
async function answer(env: Env, ev: LineEvent, question: string): Promise<void> {
  try {
    const { texts, buttons } = await botReply(env, env.DB, question);
    await replyMessage(env.LINE_MESSAGING_ACCESS_TOKEN ?? '', ev.replyToken!, texts, buttons);
  } catch (e) {
    console.error('LINE 機器人回覆', e);
  }
}

const mentionsBot = (ev: LineEvent) => ev.type === 'message' && ev.message?.type === 'text' && !!ev.replyToken && !!ev.message.mention?.mentionees?.some((m) => m.isSelf);
/** 按了回覆下面的按鈕（postback 在群組有沒有 reply token，👤 實測時確認；PLAN T73） */
const isPostback = (ev: LineEvent) => ev.type === 'postback' && !!ev.replyToken && typeof ev.postback?.data === 'string';
/** 要回的問題：@ 的訊息拿掉 @；按鈕是 data */
const questionOf = (ev: LineEvent) => (ev.type === 'postback' ? (ev.postback?.data ?? '') : stripMentions(ev.message?.text ?? '', ev.message?.mention?.mentionees ?? []));

export async function handleWebhook(req: Request, env: Env, waitUntil?: WaitUntil): Promise<Response> {
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

  const replies: Promise<void>[] = [];
  for (const ev of events) {
    const groupId = ev.source?.type === 'group' ? ev.source.groupId : undefined;
    if (!groupId) continue;
    if (ev.type === 'leave') {
      await env.DB.prepare('UPDATE line_groups SET left_at = ? WHERE group_id = ? AND left_at IS NULL').bind(nowIso(), groupId).run();
      continue;
    }
    await rememberGroup(env, groupId, ev.type === 'join');
    if ((mentionsBot(ev) || isPostback(ev)) && (await approved(env, groupId))) replies.push(answer(env, ev, questionOf(ev)));
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
  if (replies.length) {
    const all = Promise.all(replies);
    if (waitUntil) waitUntil(all);
    else await all;
  }
  return json({ ok: true });
}
