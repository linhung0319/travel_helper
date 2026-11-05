// LINE 的 API（architecture §5；T23 實測過的行為寫在那裡）。
// 測試時換掉 globalThis.fetch 模擬 LINE 的回應。

import { b64url, hmac, timingSafeEqual } from './session.ts';

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const API = 'https://api.line.me';

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
}

export class LineError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function readJson(r: Response): Promise<unknown> {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function authorizeUrl(o: { channelId: string; redirectUri: string; state: string; nonce: string }): string {
  const u = new URL(AUTHORIZE_URL);
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: o.channelId,
    redirect_uri: o.redirectUri,
    state: o.state,
    nonce: o.nonce,
    scope: 'openid profile',
  }).toString();
  return u.toString();
}

/** 授權碼換 token，再請 LINE 驗證 ID token（簽章、aud、到期、nonce），拿回 userId、名字、大頭照 */
export async function loginWithCode(o: {
  code: string;
  redirectUri: string;
  channelId: string;
  channelSecret: string;
  nonce: string;
}): Promise<LineProfile> {
  const tokenRes = await fetch(`${API}/oauth2/v2.1/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: o.code,
      redirect_uri: o.redirectUri,
      client_id: o.channelId,
      client_secret: o.channelSecret,
    }),
  });
  const token = (await readJson(tokenRes)) as { id_token?: string };
  if (!tokenRes.ok || !token.id_token) throw new LineError('換 token 失敗', tokenRes.status, token);

  const verifyRes = await fetch(`${API}/oauth2/v2.1/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token.id_token, client_id: o.channelId, nonce: o.nonce }),
  });
  const idt = (await readJson(verifyRes)) as { sub?: string; name?: string; picture?: string };
  if (!verifyRes.ok || !idt.sub) throw new LineError('驗證 ID token 失敗', verifyRes.status, idt);
  return { userId: idt.sub, displayName: idt.name ?? '（沒有名字）', pictureUrl: idt.picture ?? null };
}

/**
 * 這個人在不在群組裡：200 是、404 不是（T23 實測：沒加機器人好友的成員也是 200）。
 * 其他狀態（403、5xx）丟 LineError，呼叫的人當成「查不到」處理。
 */
export async function isGroupMember(accessToken: string, groupId: string, userId: string): Promise<boolean> {
  const r = await fetch(`${API}/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (r.status === 200) return true;
  if (r.status === 404) return false;
  throw new LineError('查群組成員失敗', r.status, await readJson(r));
}

/** 群組名稱（管理頁顯示用）；拿不到回 null */
export async function groupName(accessToken: string, groupId: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    return ((await r.json()) as { groupName?: string }).groupName ?? null;
  } catch {
    return null;
  }
}

/** 一則文字訊息的字數上限（UTF-16）：先用 5000，還沒實測（PLAN T34）；一次回覆最多 5 則 */
export const LINE_TEXT_MAX = 5000;
export const LINE_REPLY_MAX = 5;
/** Quick Reply 最多 13 顆；按鈕的字最多 20 字（LINE 文件） */
export const QUICK_REPLY_MAX = 13;
const QUICK_REPLY_LABEL_MAX = 20;

/** 回覆下面的按鈕（T73）：postback，按了聊天室顯示 label 像是那個人打的，機器人收到 data（不用 @） */
export interface QuickReplyButton {
  label: string;
  data: string;
}

/**
 * 回覆（reply token 只能用一次、收到通知後 1 分鐘內）；回覆不計入每月的訊息額度。
 * 按鈕掛在最後一則（Quick Reply 只顯示在最後一則下面；群組裡任何人再發訊息就收掉）
 */
export async function replyMessage(accessToken: string, replyToken: string, texts: string[], buttons: QuickReplyButton[] = []): Promise<void> {
  const messages: Record<string, unknown>[] = texts.slice(0, LINE_REPLY_MAX).map((text) => ({ type: 'text', text }));
  if (buttons.length && messages.length) {
    messages[messages.length - 1].quickReply = {
      items: buttons.slice(0, QUICK_REPLY_MAX).map((b) => ({
        type: 'action',
        action: { type: 'postback', label: b.label.slice(0, QUICK_REPLY_LABEL_MAX), data: b.data, displayText: b.label },
      })),
    };
  }
  const r = await fetch(`${API}/v2/bot/message/reply`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) throw new LineError('回覆訊息失敗', r.status, await readJson(r));
}

/** webhook 的簽章：body 的 HMAC-SHA256（channel secret）base64，放在 x-line-signature */
export async function verifyWebhookSignature(channelSecret: string, body: Uint8Array, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const expected = b64url(await hmac(channelSecret, body));
  const given = signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const te = new TextEncoder();
  return timingSafeEqual(te.encode(given), te.encode(expected));
}
