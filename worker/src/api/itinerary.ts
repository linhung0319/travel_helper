// 確定的行程（只有一份）與快照。architecture §3.6。
//
// GET  /api/itinerary                        { version, data, updatedBy, updatedAt }；還沒有行程時 version 0、data null
// PUT  /api/itinerary                        { version, data, reason? }：version 要和資料庫的一樣，否則 409（別人改過了）
//                                            改之前自動把舊的存成快照
// GET  /api/itinerary/snapshots              快照清單（不含 data）
// GET  /api/itinerary/snapshots/:id          一份快照
// POST /api/itinerary/snapshots/:id/restore  { version }：復原也是一次修改，會再存快照
//
// 行程的格式由 T14 定（packages/engine）：PUT 時跑 validateItinerary，大小在 D1 一列的上限內。

import { validateItinerary } from '@travel-helper/engine';
import type { Ctx } from '../env.ts';
import { badRequest, conflict, json, notFound, nowIso, readBody, isPlainObject } from '../lib/http.ts';

// D1 一列最大 2 MB；留一點空間
const MAX_BYTES = 1024 * 1024;

export interface ItinRow {
  data: string;
  version: number;
  updated_by: string;
  updated_at: string;
}

async function current(db: D1Database): Promise<ItinRow | null> {
  return db.prepare('SELECT data, version, updated_by, updated_at FROM itinerary WHERE id = 1').first<ItinRow>();
}

/** 行程裡 data 以外的欄位（JSON 片段，沒有外面的大括號）：bootstrap 直接接 data 的字串 */
export const itineraryMeta = (r: ItinRow | null) => JSON.stringify({ version: r?.version ?? 0, updatedBy: r?.updated_by ?? null, updatedAt: r?.updated_at ?? null }).slice(1, -1);

export const SNAPSHOT_LIST = 'SELECT id, version, reason, created_by, created_at FROM snapshots ORDER BY id DESC';

export interface SnapshotMetaRow {
  id: number;
  version: number;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export const snapshotMetaJson = (s: SnapshotMetaRow) => ({ id: s.id, version: s.version, reason: s.reason, createdBy: s.created_by, createdAt: s.created_at });

const toJson = (r: ItinRow | null) =>
  r
    ? { version: r.version, data: JSON.parse(r.data), updatedBy: r.updated_by, updatedAt: r.updated_at }
    : { version: 0, data: null, updatedBy: null, updatedAt: null };

export async function getItinerary({ db }: Ctx): Promise<Response> {
  return json(toJson(await current(db)));
}

/** 寫入新版本：舊的先存成快照。用 version 做樂觀鎖，snapshot 和 update 在同一個 batch（同一個交易） */
async function save(db: D1Database, version: number, data: unknown, reason: string | null, by: string): Promise<Response> {
  const text = JSON.stringify(data);
  if (text.length > MAX_BYTES) throw badRequest('行程太大');
  const now = nowIso();
  let changes: number;
  if (version === 0) {
    const r = await db
      .prepare('INSERT INTO itinerary (id, data, version, updated_by, updated_at) VALUES (1, ?, 1, ?, ?) ON CONFLICT (id) DO NOTHING')
      .bind(text, by, now)
      .run();
    changes = r.meta.changes;
  } else {
    const [, upd] = await db.batch([
      db
        .prepare(
          `INSERT INTO snapshots (data, version, reason, created_by, created_at)
           SELECT data, version, ?, ?, ? FROM itinerary WHERE id = 1 AND version = ?`,
        )
        .bind(reason, by, now, version),
      db.prepare('UPDATE itinerary SET data = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = 1 AND version = ?').bind(text, by, now, version),
    ]);
    changes = upd.meta.changes;
  }
  const cur = await current(db);
  if (!changes) throw conflict('version-conflict', '別人改過了，請重新載入再改', { current: cur?.version ?? 0 });
  return json(toJson(cur));
}

function readVersion(body: Record<string, unknown>): number {
  const v = body.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw badRequest('version 要是 0 以上的整數（手上那份行程的 version）');
  return v;
}

export async function putItinerary({ db, req, member }: Ctx): Promise<Response> {
  const body = await readBody(req, 2 * MAX_BYTES);
  const version = readVersion(body);
  if (!isPlainObject(body.data)) throw badRequest('data 要是物件');
  const problems = validateItinerary(body.data);
  if (problems.length) throw badRequest('行程的格式不對', problems);
  if (body.reason != null && typeof body.reason !== 'string') throw badRequest('reason 要是字串');
  return save(db, version, body.data, (body.reason as string | undefined) ?? null, member.id);
}

const MAX_SUMMARY_BYTES = 200 * 1024;

/**
 * PUT /api/itinerary/summary  { version, summary }（T34）：瀏覽器算好時間軸後存的行程摘要（engine 的 TripSummary）。
 * 只收目前這一版行程的摘要：version 不一樣回 409（別人又改了，摘要由他存）。內容一樣時不寫。
 */
export async function putSummary({ db, req }: Ctx): Promise<Response> {
  const body = await readBody(req, 2 * MAX_SUMMARY_BYTES);
  const version = readVersion(body);
  const s = body.summary;
  if (!isPlainObject(s) || !Array.isArray(s.days) || !Array.isArray(s.reservations)) throw badRequest('summary 要有 days、reservations');
  const text = JSON.stringify(s);
  if (text.length > MAX_SUMMARY_BYTES) throw badRequest('摘要太大');
  const r = await db
    .prepare(
      `INSERT INTO trip_summary (id, version, data, updated_at)
       SELECT 1, ?, ?, ? FROM itinerary WHERE id = 1 AND version = ?
       ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data, updated_at = excluded.updated_at
         WHERE trip_summary.version <> excluded.version OR trip_summary.data <> excluded.data`,
    )
    .bind(version, text, nowIso(), version)
    .run();
  if (!r.meta.changes) {
    const cur = await current(db);
    if ((cur?.version ?? 0) !== version) throw conflict('version-conflict', '行程已經是新的版本了', { current: cur?.version ?? 0 });
  }
  return json({ version });
}

export async function listSnapshots({ db }: Ctx): Promise<Response> {
  const r = await db.prepare(SNAPSHOT_LIST).all<SnapshotMetaRow>();
  return json({ snapshots: r.results.map(snapshotMetaJson) });
}

async function loadSnapshot(db: D1Database, idText: string) {
  const id = Number(idText);
  if (!Number.isInteger(id)) throw badRequest('快照 ID 要是整數');
  const s = await db.prepare('SELECT * FROM snapshots WHERE id = ?').bind(id).first<{
    id: number;
    data: string;
    version: number;
    reason: string | null;
    created_by: string;
    created_at: string;
  }>();
  if (!s) throw notFound(`沒有快照 #${id}`);
  return s;
}

export async function getSnapshot({ db }: Ctx, params: Record<string, string>): Promise<Response> {
  const s = await loadSnapshot(db, params.id);
  return json({ id: s.id, version: s.version, reason: s.reason, createdBy: s.created_by, createdAt: s.created_at, data: JSON.parse(s.data) });
}

export async function restoreSnapshot({ db, req, member }: Ctx, params: Record<string, string>): Promise<Response> {
  const s = await loadSnapshot(db, params.id);
  const version = readVersion(await readBody(req));
  if (version === 0) throw badRequest('還沒有行程，不能復原');
  return save(db, version, JSON.parse(s.data), `復原到快照 #${s.id}（第 ${s.version} 版）`, member.id);
}
