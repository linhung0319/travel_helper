// 匯入 D1 的比對與 SQL 產生（architecture §3.4、§3.5）。scripts/db-import.mjs 的核心，沒有 I/O 以外的副作用。
//
// 流程：loadSources（讀 data/）→ readDbState（讀資料庫）→ planImport（比對出報告）→ 👤 看報告、處理衝突
//       → 再算一次、確認和報告一樣 → buildSql（產生 SQL）→ 執行
//
// 區域不寫死：區域清單從 areas.json 讀；新的區域（例如大阪）的 ID 全部是新的，只會新增。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { threeWay, editFromRow, getAt, parseFieldPath } from '../../worker/src/lib/merge.ts';

export const POINT_FILES = ['spots.json', 'lodging.json', 'restaurants.json'];

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));

/** 鍵排序後的 JSON：同樣的內容一定得到同樣的字串（content_hash 用） */
export function canonical(x) {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x)
      .filter((k) => x[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x);
}

export const contentHash = (record) => crypto.createHash('sha256').update(canonical(record)).digest('hex');

/**
 * 讀匯入的來源：areas.json 列的每個區域的 data/areas/<area>/*.json、stations.json、redirects.json。
 * 回傳 { areaIds, records: Map<id, { record, type, area, hash }>, redirects }
 */
export function loadSources(dataDir) {
  const areas = readJson(path.join(dataDir, 'areas.json'));
  const areaIds = areas.map((a) => a.id);
  const records = new Map();
  const add = (rec) => {
    if (records.has(rec.id)) throw new Error(`ID「${rec.id}」重複（validate 應該先擋下來）`);
    records.set(rec.id, { record: rec, type: rec.type, area: rec.area ?? null, hash: contentHash(rec) });
  };
  const stations = path.join(dataDir, 'stations.json');
  if (fs.existsSync(stations)) readJson(stations).forEach(add);
  for (const a of areaIds) {
    for (const f of POINT_FILES) {
      const p = path.join(dataDir, 'areas', a, f);
      if (fs.existsSync(p)) readJson(p).forEach(add);
    }
  }
  const rp = path.join(dataDir, 'redirects.json');
  const redirects = fs.existsSync(rp) ? readJson(rp) : [];
  return { areaIds, records, redirects };
}

/** 指定的區域 → Set；'all' 是 areas.json 的全部區域 */
export function resolveScope(spec, areaIds) {
  const list = spec === 'all' ? areaIds : String(spec).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = list.filter((a) => !areaIds.includes(a));
  if (unknown.length) throw new Error(`區域 ${unknown.join('、')} 不在 areas.json（有的區域：${areaIds.join('、')}）`);
  if (!list.length) throw new Error('沒有指定區域');
  return new Set(list);
}

/**
 * 從資料庫讀比對要用的狀態。db 要有 query(sql) → rows。
 * 只讀還有效的修改（沒復原、沒收掉）。
 */
export async function readDbState(db) {
  const places = await db.query('SELECT id, type, area, content_hash, retired_at FROM places_base');
  const edits = await db.query(
    'SELECT id, place_id, field_path, value, base_value, author, created_at, reverted_at, closed_at FROM place_edits WHERE reverted_at IS NULL AND closed_at IS NULL ORDER BY id',
  );
  const redirects = await db.query('SELECT old_id, new_id FROM redirects');
  const [{ max_id }] = await db.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM imports');
  return { places, edits, redirects, lastImportId: Number(max_id) };
}

/** 讀「內容變了」的點在資料庫裡的舊資料（報告列出哪些欄位變了） */
export async function readOldData(db, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await db.query(`SELECT id, data FROM places_base WHERE id IN (${chunk.map(sqlString).join(', ')})`);
    for (const r of rows) out.set(r.id, JSON.parse(r.data));
  }
  return out;
}

/** 兩份資料點的最上層欄位，哪些不一樣 */
export function changedFields(oldData, newData) {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  return [...keys].filter((k) => canonical(oldData?.[k]) !== canonical(newData?.[k])).sort();
}

/**
 * 比對出匯入的計畫（也就是給 👤 看的報告）。
 * - sources：loadSources 的結果；scope：要匯入的區域（Set）
 * - state：readDbState 的結果；oldData：readOldData 的結果（可省略，省略就不列變了哪些欄位）
 * - resolutions：衝突的處理 { <editId>: 'keep' | 'use-base' }
 *     keep：保留使用者的修改（base_value 換成新的預設值，之後再匯入時以新的為準）
 *     use-base：用新的預設值（這筆修改收掉）
 */
export function planImport({ sources, scope, state, oldData = new Map(), resolutions = {} }) {
  const db = new Map(state.places.map((p) => [p.id, p]));
  const inScope = (area) => area !== null && scope.has(area);

  const add = [];
  const update = [];
  const restore = [];
  const retire = [];
  const moved = [];
  let unchanged = 0;

  for (const [id, src] of sources.records) {
    const cur = db.get(id);
    if (!inScope(src.area)) {
      // 不在這次的範圍：區域換了的話記下來（不下架，等匯入新的區域時處理）
      if (cur && inScope(cur.area)) moved.push({ id, from: cur.area, to: src.area });
      continue;
    }
    if (!cur) add.push({ id, type: src.type, area: src.area });
    else if (cur.content_hash !== src.hash || cur.type !== src.type || cur.area !== src.area) {
      update.push({
        id,
        type: src.type,
        area: src.area,
        fromArea: cur.area !== src.area ? cur.area : undefined,
        restored: !!cur.retired_at,
        fields: oldData.has(id) ? changedFields(oldData.get(id), src.record) : null,
      });
    } else if (cur.retired_at) restore.push({ id, type: src.type, area: src.area });
    else unchanged++;
  }
  for (const cur of state.places) {
    if (!inScope(cur.area) || cur.retired_at || sources.records.has(cur.id)) continue;
    retire.push({ id: cur.id, type: cur.type, area: cur.area });
  }

  // 內容變了的點：每筆還有效的修改做三方比對
  const updatedIds = new Set(update.map((u) => u.id));
  const editResults = { keep: [], same: [], conflict: [] };
  for (const row of state.edits) {
    if (!updatedIds.has(row.place_id)) continue;
    const e = editFromRow(row);
    const newBase = sources.records.get(row.place_id).record;
    const r = threeWay(e, newBase);
    const path = parseFieldPath(e.fieldPath);
    const next = path ? getAt(newBase, path) : { present: false };
    const item = {
      editId: e.id,
      placeId: e.placeId,
      fieldPath: e.fieldPath,
      author: e.author,
      createdAt: e.createdAt,
      baseValue: e.baseValue.present ? e.baseValue.value : undefined,
      value: e.value,
      newBase: next.present ? next.value : undefined,
    };
    if (r === 'conflict') item.resolution = resolutions[e.id] ?? null;
    editResults[r].push(item);
  }
  const unresolved = editResults.conflict.filter((c) => c.resolution !== 'keep' && c.resolution !== 'use-base');

  // 轉址：redirects.json 有、資料庫沒有（或目的地不同）的才寫
  const dbRedirects = new Map(state.redirects.map((r) => [r.old_id, r.new_id]));
  const redirects = sources.redirects
    .filter((r) => dbRedirects.get(r.from) !== r.to)
    .map((r) => ({ from: r.from, to: r.to, reason: r.reason ?? null, replaces: dbRedirects.get(r.from) ?? null }));
  // 轉址的舊 ID 這次沒有在來源裡，照規則會下架；不在範圍內的也一起下架（它已經被合併了）
  for (const r of redirects) {
    const cur = db.get(r.from);
    if (cur && !cur.retired_at && !retire.some((x) => x.id === r.from)) retire.push({ id: r.from, type: cur.type, area: cur.area, redirectedTo: r.to });
    const x = retire.find((x) => x.id === r.from);
    if (x) x.redirectedTo = r.to;
  }

  const sortById = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  [add, update, restore, retire, moved].forEach((l) => l.sort(sortById));

  const plan = {
    scope: [...scope].sort(),
    importId: state.lastImportId + 1,
    add,
    update,
    restore,
    retire,
    moved,
    unchanged,
    edits: editResults,
    unresolved: unresolved.map((c) => c.editId),
    redirects,
  };
  plan.summary = summarize(plan);
  plan.planHash = crypto.createHash('sha256').update(canonical({ ...plan, summary: undefined })).digest('hex').slice(0, 16);
  return plan;
}

export function summarize(plan) {
  return {
    add: plan.add.length,
    update: plan.update.length,
    restore: plan.restore.length,
    retire: plan.retire.length,
    unchanged: plan.unchanged,
    moved: plan.moved.length,
    editsKept: plan.edits.keep.length,
    editsClosed: plan.edits.same.length,
    conflicts: plan.edits.conflict.length,
    unresolved: plan.unresolved.length,
    redirects: plan.redirects.length,
  };
}

/** SQL 的字串常值 */
export function sqlString(s) {
  return s === null || s === undefined ? 'NULL' : `'${String(s).replaceAll("'", "''")}'`;
}

const jsonOrNull = (present, v) => (present ? sqlString(JSON.stringify(v)) : 'NULL');

/**
 * 計畫 → SQL（一個字串，好幾句）。meta：{ gitCommit, importedBy, now }
 * 有沒處理的衝突就不產生（丟錯）。
 */
export function buildSql(plan, sources, meta) {
  if (plan.unresolved.length) throw new Error(`還有 ${plan.unresolved.length} 個衝突沒有處理（修改 #${plan.unresolved.join('、#')}）`);
  const id = plan.importId;
  const now = sqlString(meta.now);
  const out = [];
  const summary = { ...plan.summary, conflictResolutions: Object.fromEntries(plan.edits.conflict.map((c) => [c.editId, c.resolution])), planHash: plan.planHash };
  out.push(
    `INSERT INTO imports (id, area, git_commit, imported_at, imported_by, summary) VALUES (${id}, ${sqlString(plan.scope.join(','))}, ${sqlString(meta.gitCommit)}, ${now}, ${sqlString(meta.importedBy)}, ${sqlString(JSON.stringify(summary))});`,
  );
  for (const a of plan.add) {
    const s = sources.records.get(a.id);
    out.push(
      `INSERT INTO places_base (id, type, area, data, content_hash, import_id, first_import_id) VALUES (${sqlString(a.id)}, ${sqlString(s.type)}, ${sqlString(s.area)}, ${sqlString(JSON.stringify(s.record))}, ${sqlString(s.hash)}, ${id}, ${id});`,
    );
  }
  for (const u of plan.update) {
    const s = sources.records.get(u.id);
    out.push(
      `UPDATE places_base SET type = ${sqlString(s.type)}, area = ${sqlString(s.area)}, data = ${sqlString(JSON.stringify(s.record))}, content_hash = ${sqlString(s.hash)}, import_id = ${id}, retired_at = NULL, retired_import_id = NULL WHERE id = ${sqlString(u.id)};`,
    );
  }
  for (const r of plan.restore) {
    out.push(`UPDATE places_base SET retired_at = NULL, retired_import_id = NULL, import_id = ${id} WHERE id = ${sqlString(r.id)};`);
  }
  for (const r of plan.retire) {
    out.push(`UPDATE places_base SET retired_at = ${now}, retired_import_id = ${id} WHERE id = ${sqlString(r.id)};`);
  }
  const close = (editId, reason) =>
    `UPDATE place_edits SET closed_at = ${now}, closed_import_id = ${id}, closed_reason = ${sqlString(reason)}, updated_at = ${now} WHERE id = ${editId};`;
  for (const e of plan.edits.same) out.push(close(e.editId, 'same-as-new-base'));
  for (const c of plan.edits.conflict) {
    if (c.resolution === 'use-base') out.push(close(c.editId, 'conflict-use-base'));
    else out.push(`UPDATE place_edits SET base_value = ${jsonOrNull(c.newBase !== undefined, c.newBase)}, updated_at = ${now} WHERE id = ${c.editId};`);
  }
  for (const r of plan.redirects) out.push(...redirectSql(r, id, now));
  return out.join('\n') + '\n';
}

/**
 * 轉址：記下 old → new，再把修改、投票、建議、確定的行程裡的舊 ID 換成新 ID（architecture §3.5）。
 * - 投票：同一個人兩邊都投過的話，保留新 ID 那一票，舊的軟刪除
 * - 建議、行程：JSON 文字裡完整等於 "舊 ID" 的字串換掉（ID 全專案唯一、kebab-case，不會碰到其他字串）；
 *   行程改之前先存快照
 */
export function redirectSql(r, importId, now) {
  const from = sqlString(r.from);
  const to = sqlString(r.to);
  const qFrom = sqlString(JSON.stringify(r.from));
  const qTo = sqlString(JSON.stringify(r.to));
  return [
    `INSERT INTO redirects (old_id, new_id, reason, import_id) VALUES (${from}, ${to}, ${sqlString(r.reason)}, ${importId}) ON CONFLICT (old_id) DO UPDATE SET new_id = excluded.new_id, reason = excluded.reason, import_id = excluded.import_id;`,
    // 之前轉到舊 ID 的轉址也直接指到新的 ID（不留連鎖）
    `UPDATE redirects SET new_id = ${to} WHERE new_id = ${from};`,
    `UPDATE place_edits SET place_id = ${to}, updated_at = ${now} WHERE place_id = ${from};`,
    `UPDATE OR IGNORE votes SET place_id = ${to}, updated_at = ${now} WHERE place_id = ${from};`,
    `UPDATE votes SET deleted_at = ${now}, updated_at = ${now} WHERE place_id = ${from} AND deleted_at IS NULL;`,
    `UPDATE suggestions SET place_ids = REPLACE(place_ids, ${qFrom}, ${qTo}), updated_at = ${now} WHERE instr(place_ids, ${qFrom}) > 0;`,
    `INSERT INTO snapshots (data, version, reason, created_by, created_at) SELECT data, version, ${sqlString(`匯入 #${importId}：轉址 ${r.from} → ${r.to} 之前`)}, 'import', ${now} FROM itinerary WHERE id = 1 AND instr(data, ${qFrom}) > 0;`,
    `UPDATE itinerary SET data = REPLACE(data, ${qFrom}, ${qTo}), version = version + 1, updated_by = 'import', updated_at = ${now} WHERE id = 1 AND instr(data, ${qFrom}) > 0;`,
  ];
}

/** 給 👤 看的報告（Markdown） */
export function reportMarkdown(plan, { sources, generatedAt, gitCommit }) {
  const s = plan.summary;
  const name = (id) => {
    const r = sources.records.get(id)?.record;
    return r ? `${r.name?.zh ?? r.name?.ja ?? ''}` : '';
  };
  const byAreaType = (list) => {
    const m = {};
    for (const x of list) {
      const k = `${x.area ?? '—'} / ${x.type}`;
      m[k] = (m[k] ?? 0) + 1;
    }
    return Object.entries(m)
      .sort()
      .map(([k, n]) => `${k} ${n}`)
      .join('、');
  };
  const lines = [];
  lines.push(`# 匯入報告（dry run）`, '');
  lines.push(`- 產生時間：${generatedAt}`, `- git：${gitCommit}`, `- 範圍：${plan.scope.join('、')}`, `- 這次匯入的編號：#${plan.importId}`, `- 報告代碼（planHash）：\`${plan.planHash}\``, '');
  lines.push('| 項目 | 筆數 |', '|---|---|');
  lines.push(`| 新增 | ${s.add} |`, `| 更新（內容變了） | ${s.update} |`, `| 恢復（之前下架、這次又出現，內容沒變） | ${s.restore} |`, `| 下架 | ${s.retire} |`, `| 沒變 | ${s.unchanged} |`);
  lines.push(`| 區域換了、不在這次的範圍 | ${s.moved} |`, `| 修改：保留 | ${s.editsKept} |`, `| 修改：兩邊一樣，收掉 | ${s.editsClosed} |`, `| 修改：衝突 | ${s.conflicts}（沒處理 ${s.unresolved}） |`, `| 轉址 | ${s.redirects} |`, '');

  if (plan.add.length) {
    lines.push(`## 新增 ${plan.add.length} 筆`, '', byAreaType(plan.add), '');
    if (plan.add.length <= 60) for (const a of plan.add) lines.push(`- \`${a.id}\` ${name(a.id)}`);
    else lines.push(`（超過 60 筆，清單見同名的 .json 的 \`add\`）`);
    lines.push('');
  }
  if (plan.update.length) {
    lines.push(`## 更新 ${plan.update.length} 筆`, '', byAreaType(plan.update), '');
    for (const u of plan.update) {
      const extra = [u.fromArea ? `區域 ${u.fromArea} → ${u.area}` : null, u.restored ? '恢復上架' : null].filter(Boolean).join('；');
      lines.push(`- \`${u.id}\` ${name(u.id)}：${u.fields ? u.fields.join('、') || '（只有鍵的順序）' : '—'}${extra ? `（${extra}）` : ''}`);
    }
    lines.push('');
  }
  if (plan.restore.length) {
    lines.push(`## 恢復 ${plan.restore.length} 筆`, '');
    for (const r of plan.restore) lines.push(`- \`${r.id}\` ${name(r.id)}`);
    lines.push('');
  }
  if (plan.retire.length) {
    lines.push(`## 下架 ${plan.retire.length} 筆（不刪除：行程、投票、修改照樣連得到，網站標「已下架」）`, '');
    for (const r of plan.retire) lines.push(`- \`${r.id}\`（${r.area} / ${r.type}）${r.redirectedTo ? `→ 轉址到 \`${r.redirectedTo}\`` : ''}`);
    lines.push('');
  }
  if (plan.moved.length) {
    lines.push(`## 區域換了 ${plan.moved.length} 筆（這次不處理，匯入新的區域時更新）`, '');
    for (const m of plan.moved) lines.push(`- \`${m.id}\`：${m.from} → ${m.to}`);
    lines.push('');
  }
  const fmt = (v) => (v === undefined ? '（沒有這個欄位）' : `\`${JSON.stringify(v)}\``);
  if (plan.edits.conflict.length) {
    lines.push(`## 衝突 ${plan.edits.conflict.length} 筆：兩邊都改了，要 👤 決定`, '');
    lines.push('在 `--resolve <檔案>` 的 JSON 寫 `{ "<修改 ID>": "keep" | "use-base" }`：keep＝保留使用者的修改，use-base＝用新的預設值。', '');
    for (const c of plan.edits.conflict) {
      lines.push(`- 修改 #${c.editId} \`${c.placeId}\` ${name(c.placeId)} 的 \`${c.fieldPath}\`（${c.author}，${c.createdAt}）：${c.resolution ? `**已決定：${c.resolution}**` : '**還沒處理**'}`);
      lines.push(`  - 原本的預設值：${fmt(c.baseValue)}`, `  - 使用者改成：${fmt(c.value)}`, `  - 新的預設值：${fmt(c.newBase)}`);
    }
    lines.push('');
  }
  if (plan.edits.same.length) {
    lines.push(`## 修改收掉 ${plan.edits.same.length} 筆（新的預設值和使用者改的一樣）`, '');
    for (const e of plan.edits.same) lines.push(`- 修改 #${e.editId} \`${e.placeId}\` 的 \`${e.fieldPath}\``);
    lines.push('');
  }
  if (plan.edits.keep.length) {
    lines.push(`## 修改保留 ${plan.edits.keep.length} 筆（點的內容變了，但這個欄位的預設值沒變）`, '');
    for (const e of plan.edits.keep) lines.push(`- 修改 #${e.editId} \`${e.placeId}\` 的 \`${e.fieldPath}\``);
    lines.push('');
  }
  if (plan.redirects.length) {
    lines.push(`## 轉址 ${plan.redirects.length} 筆（修改、投票、建議、行程裡的舊 ID 換成新的）`, '');
    for (const r of plan.redirects) lines.push(`- \`${r.from}\` → \`${r.to}\`${r.replaces ? `（原本轉到 \`${r.replaces}\`）` : ''}：${r.reason ?? ''}`);
    lines.push('');
  }
  return lines.join('\n');
}
