// 登入（T24：開發用的固定身分；T25 換成 LINE 登入＋群組檢查，只要換掉這個檔案的 currentMember）。
//
// DEV_AUTH = "1" 時：
// - 預設是 DEV_MEMBER_ID（wrangler.jsonc 的 vars）
// - 測「只有本人能刪」時可以加 header `X-Dev-Member: <id>` 切換成別人
// - 第一次看到的身分自動寫進 members（source = 'dev'）
// 其他情況一律 401。

import type { Env, Member } from './env.ts';
import { HttpError, nowIso } from './lib/http.ts';

const DEV_ID = /^dev-[a-z0-9-]{1,40}$/;

export async function currentMember(req: Request, env: Env): Promise<Member> {
  if (env.DEV_AUTH !== '1') throw new HttpError(401, 'unauthorized', '請先登入');
  const id = req.headers.get('x-dev-member') ?? env.DEV_MEMBER_ID ?? 'dev-user';
  if (!DEV_ID.test(id)) throw new HttpError(401, 'unauthorized', '開發用的身分要是 dev- 開頭');
  const name = id === env.DEV_MEMBER_ID && env.DEV_MEMBER_NAME ? env.DEV_MEMBER_NAME : id;
  await env.DB.prepare(
    `INSERT INTO members (line_user_id, display_name, source, checked_at) VALUES (?, ?, 'dev', ?)
     ON CONFLICT (line_user_id) DO NOTHING`,
  )
    .bind(id, name, nowIso())
    .run();
  const row = await env.DB.prepare('SELECT line_user_id, display_name, picture_url, source, disabled_at FROM members WHERE line_user_id = ?')
    .bind(id)
    .first<{ line_user_id: string; display_name: string; picture_url: string | null; source: string; disabled_at: string | null }>();
  if (!row || row.disabled_at) throw new HttpError(403, 'disabled', '這個帳號已停用，請洽管理員');
  return { id: row.line_user_id, displayName: row.display_name, pictureUrl: row.picture_url, source: row.source };
}
