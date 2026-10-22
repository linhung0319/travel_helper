// 資料點：預設資料（places_base）與修改（place_edits）。architecture §3.2、§4。
//
// GET  /api/places                預設資料全部（含已下架的），加上轉址。用最新的匯入 ID 當 ETag
// GET  /api/places/:id            一個點合併後的資料、改過的欄位、修改紀錄（轉址的舊 ID 會轉到新 ID）
// GET  /api/edits?since=&place=   修改紀錄（含已復原、已收掉的），since 是 updated_at
// POST /api/edits                 { placeId, fieldPath, value, note? }：先合併再用 schema 驗證，不符合就 400
// POST /api/edits/:id/revert      復原：只有改的人自己能按

import type { Ctx } from '../env.ts';
import { applyEdits, editFromRow, getAt, parseFieldPath, type EditRow } from '../lib/merge.ts';
import { badRequest, conflict, forbidden, json, notFound, nowIso, rawJson, readBody } from '../lib/http.ts';
import { validatePlace } from '../lib/validate.ts';

const EDIT_COLUMNS = `id, place_id, field_path, value, base_value, note, author, created_at, updated_at,
  reverted_at, reverted_by, closed_at, closed_import_id, closed_reason`;

interface FullEditRow extends EditRow {
  note: string | null;
  updated_at: string;
  reverted_by: string | null;
  closed_import_id: number | null;
  closed_reason: string | null;
}

/** API 回傳的修改（JSON 欄位解開） */
export function editToJson(r: FullEditRow) {
  return {
    id: r.id,
    placeId: r.place_id,
    fieldPath: r.field_path,
    value: JSON.parse(r.value),
    baseValue: r.base_value === null ? null : JSON.parse(r.base_value),
    baseMissing: r.base_value === null,
    note: r.note,
    author: r.author,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    revertedAt: r.reverted_at,
    revertedBy: r.reverted_by,
    closedAt: r.closed_at,
    closedImportId: r.closed_import_id,
    closedReason: r.closed_reason,
  };
}

async function latestImportId(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT MAX(id) AS id FROM imports').first<{ id: number | null }>();
  return row?.id ?? 0;
}

export async function listPlaces({ db, req }: Ctx): Promise<Response> {
  const importId = await latestImportId(db);
  const etag = `"imp-${importId}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });

  const rows = await db.prepare('SELECT id, data, retired_at FROM places_base ORDER BY id').all<{ id: string; data: string; retired_at: string | null }>();
  const redirects = await db.prepare('SELECT old_id, new_id FROM redirects').all<{ old_id: string; new_id: string }>();
  const retired: Record<string, string> = {};
  for (const r of rows.results) if (r.retired_at) retired[r.id] = r.retired_at;
  // data 已經是 JSON 文字：直接接起來，不在 Worker 裡解開（約 550 筆、3 MB，解開再序列化會超過免費方案的 CPU 時間）
  const body =
    `{"importId":${importId},"places":[${rows.results.map((r) => r.data).join(',')}]` +
    `,"retired":${JSON.stringify(retired)}` +
    `,"redirects":${JSON.stringify(Object.fromEntries(redirects.results.map((r) => [r.old_id, r.new_id])))}}`;
  return rawJson(body, { headers: { etag, 'cache-control': 'no-cache' } });
}

/** 轉址：舊 ID → 新 ID（沒有轉址就照原樣） */
export async function resolveId(db: D1Database, id: string): Promise<string> {
  const r = await db.prepare('SELECT new_id FROM redirects WHERE old_id = ?').bind(id).first<{ new_id: string }>();
  return r?.new_id ?? id;
}

interface BaseRow {
  id: string;
  type: string;
  area: string | null;
  data: string;
  retired_at: string | null;
}

async function loadBase(db: D1Database, id: string): Promise<BaseRow | null> {
  return db.prepare('SELECT id, type, area, data, retired_at FROM places_base WHERE id = ?').bind(id).first<BaseRow>();
}

async function loadEdits(db: D1Database, placeId: string): Promise<FullEditRow[]> {
  const r = await db.prepare(`SELECT ${EDIT_COLUMNS} FROM place_edits WHERE place_id = ? ORDER BY id`).bind(placeId).all<FullEditRow>();
  return r.results;
}

export async function getPlace({ db }: Ctx, params: Record<string, string>): Promise<Response> {
  const id = await resolveId(db, params.id);
  const base = await loadBase(db, id);
  if (!base) throw notFound(`沒有資料點「${params.id}」`);
  const rows = await loadEdits(db, id);
  const baseData = JSON.parse(base.data);
  const merged = applyEdits(baseData, rows.map(editFromRow));
  return json({
    id,
    redirectedFrom: id === params.id ? null : params.id,
    retiredAt: base.retired_at,
    data: merged.data,
    base: baseData,
    edited: merged.edited,
    edits: rows.map(editToJson),
  });
}

export async function listEdits({ db, url }: Ctx): Promise<Response> {
  const since = url.searchParams.get('since');
  const place = url.searchParams.get('place');
  const where: string[] = [];
  const args: unknown[] = [];
  // >=：同一毫秒的修改不會漏掉，前端用 id 去重複
  if (since) (where.push('updated_at >= ?'), args.push(since));
  if (place) (where.push('place_id = ?'), args.push(await resolveId(db, place)));
  const sql = `SELECT ${EDIT_COLUMNS} FROM place_edits ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
  const r = await db.prepare(sql).bind(...args).all<FullEditRow>();
  return json({ edits: r.results.map(editToJson), now: nowIso() });
}

const MAX_VALUE_BYTES = 64 * 1024;

export async function createEdit({ db, req, member }: Ctx): Promise<Response> {
  const body = await readBody(req);
  const { placeId, fieldPath, value, note } = body;
  if (typeof placeId !== 'string' || !placeId) throw badRequest('placeId 要是字串');
  if (typeof fieldPath !== 'string') throw badRequest('fieldPath 要是字串');
  const path = parseFieldPath(fieldPath);
  if (!path) throw badRequest(`fieldPath「${fieldPath}」不對：只能是最上層欄位或往下一層（例如 hours、group.maxSeats），不能改 id、type`);
  if (!('value' in body) || value === undefined) throw badRequest('缺少 value（要清空就送 null）');
  const valueText = JSON.stringify(value);
  if (valueText.length > MAX_VALUE_BYTES) throw badRequest('value 太大');
  if (note != null && typeof note !== 'string') throw badRequest('note 要是字串');

  const id = await resolveId(db, placeId);
  const base = await loadBase(db, id);
  if (!base) throw notFound(`沒有資料點「${placeId}」（自己加的點用 PATCH /api/user-places/:id 改）`);
  const baseData = JSON.parse(base.data);
  const existing = (await loadEdits(db, id)).map(editFromRow);
  const current = applyEdits(baseData, existing).data;

  // 先合併再驗證整筆資料（architecture §3.2）
  const candidate = applyEdits(current, [
    { id: Number.MAX_SAFE_INTEGER, placeId: id, fieldPath, value, baseValue: { present: false }, author: member.id, createdAt: '', revertedAt: null, closedAt: null },
  ]).data;
  const errors = validatePlace(base.type, candidate);
  if (errors.length) throw badRequest('改完之後不符合 schema', errors);

  const before = getAt(baseData, path);
  const now = nowIso();
  const res = await db
    .prepare(
      `INSERT INTO place_edits (place_id, field_path, value, base_value, note, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${EDIT_COLUMNS}`,
    )
    .bind(id, fieldPath, valueText, before.present ? JSON.stringify(before.value) : null, note ?? null, member.id, now, now)
    .first<FullEditRow>();
  return json({ edit: editToJson(res!), data: candidate }, { status: 201 });
}

export async function revertEdit({ db, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw badRequest('修改的 ID 要是整數');
  const row = await db.prepare(`SELECT ${EDIT_COLUMNS} FROM place_edits WHERE id = ?`).bind(id).first<FullEditRow>();
  if (!row) throw notFound(`沒有修改 #${id}`);
  if (row.author !== member.id) throw forbidden('只有改的人自己能復原；改錯了請再新增一筆修改蓋過去');
  if (row.reverted_at) throw conflict('already-reverted', '這筆修改已經復原了');
  if (row.closed_at) throw conflict('already-closed', '這筆修改在匯入時已經收掉了');
  const now = nowIso();
  const updated = await db
    .prepare(`UPDATE place_edits SET reverted_at = ?, reverted_by = ?, updated_at = ? WHERE id = ? RETURNING ${EDIT_COLUMNS}`)
    .bind(now, member.id, now, id)
    .first<FullEditRow>();
  return json({ edit: editToJson(updated!) });
}
