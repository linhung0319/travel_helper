// 自己加的點（user_places）。architecture §3.1。
//
// GET    /api/user-places?since=   全部（含已刪除的，前端用 deletedAt 判斷）
// POST   /api/user-places          { type, data }：ID 由 Worker 產生（user-<隨機>）
// PATCH  /api/user-places/:id      { data }：整份取代，誰都可以改（全員共用），記下最後改的人
// DELETE /api/user-places/:id      軟刪除：只有本人能刪
//
// 自己加的點不是查到的資料，沒有 sources 等欄位，所以不用 schema/ 驗證，只檢查最基本的：
// 名稱、座標、大小。

import type { Ctx } from '../env.ts';
import { badRequest, forbidden, json, notFound, nowIso, readBody, isPlainObject } from '../lib/http.ts';

const TYPES = new Set(['spot', 'lodging', 'restaurant']);
const MAX_BYTES = 32 * 1024;

interface Row {
  id: string;
  type: string;
  data: string;
  author: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
}

const toJson = (r: Row) => ({
  id: r.id,
  type: r.type,
  data: JSON.parse(r.data),
  author: r.author,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
  deletedAt: r.deleted_at,
});

/** 檢查使用者送來的點，回傳要存的 data（id、type 由 Worker 填） */
export function checkUserPlace(type: unknown, data: unknown, id: string): Record<string, unknown> {
  if (typeof type !== 'string' || !TYPES.has(type)) throw badRequest('type 要是 spot、lodging、restaurant 其中之一');
  if (!isPlainObject(data)) throw badRequest('data 要是物件');
  const name = data.name;
  if (!isPlainObject(name) || !['ja', 'zh'].some((k) => typeof name[k] === 'string' && (name[k] as string).trim())) {
    throw badRequest('data.name 至少要有 ja 或 zh');
  }
  const c = data.coords;
  if (!Array.isArray(c) || c.length !== 2 || !c.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw badRequest('data.coords 要是 [經度, 緯度]');
  }
  const [lon, lat] = c as number[];
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw badRequest('data.coords 超出範圍（是不是經緯度寫反了？要是 [經度, 緯度]）');
  const out = { ...data, id, type };
  if (JSON.stringify(out).length > MAX_BYTES) throw badRequest('data 太大');
  return out;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `user-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function listUserPlaces({ db, url }: Ctx): Promise<Response> {
  const since = url.searchParams.get('since');
  const r = since
    ? await db.prepare('SELECT * FROM user_places WHERE updated_at >= ? ORDER BY created_at').bind(since).all<Row>()
    : await db.prepare('SELECT * FROM user_places ORDER BY created_at').all<Row>();
  return json({ userPlaces: r.results.map(toJson), now: nowIso() });
}

export async function createUserPlace({ db, req, member }: Ctx): Promise<Response> {
  const body = await readBody(req);
  const id = randomId();
  const data = checkUserPlace(body.type, body.data, id);
  const now = nowIso();
  const row = await db
    .prepare('INSERT INTO user_places (id, type, data, author, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(id, data.type, JSON.stringify(data), member.id, now, now, member.id)
    .first<Row>();
  return json({ userPlace: toJson(row!) }, { status: 201 });
}

async function load(db: D1Database, id: string): Promise<Row> {
  const row = await db.prepare('SELECT * FROM user_places WHERE id = ?').bind(id).first<Row>();
  if (!row) throw notFound(`沒有自己加的點「${id}」`);
  return row;
}

export async function updateUserPlace({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await load(db, params.id);
  if (row.deleted_at) throw notFound('這個點已經刪除了');
  const body = await readBody(req);
  const data = checkUserPlace(row.type, body.data, row.id);
  const now = nowIso();
  const updated = await db
    .prepare('UPDATE user_places SET data = ?, updated_at = ?, updated_by = ? WHERE id = ? RETURNING *')
    .bind(JSON.stringify(data), now, member.id, row.id)
    .first<Row>();
  return json({ userPlace: toJson(updated!) });
}

export async function deleteUserPlace({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const row = await load(db, params.id);
  if (row.author !== member.id) throw forbidden('只有加這個點的人能刪');
  if (row.deleted_at) return json({ userPlace: toJson(row) });
  const now = nowIso();
  const updated = await db
    .prepare('UPDATE user_places SET deleted_at = ?, updated_at = ? WHERE id = ? RETURNING *')
    .bind(now, now, row.id)
    .first<Row>();
  return json({ userPlace: toJson(updated!) });
}
