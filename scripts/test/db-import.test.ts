// 匯入（scripts/lib/import-plan.mjs）的測試：新增、更新、三方比對的衝突、下架、恢復、轉址、區域不寫死。
// 資料庫用 node:sqlite 模擬的 D1（worker/test/helpers/d1.ts），套用同一份 worker/migrations。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshDb, type FakeD1 } from '../../worker/test/helpers/d1.ts';
import { ROOT, writeTestData, testSpot, testStation } from './helpers/test-area.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import * as imp from '../lib/import-plan.mjs';

const NOW = '2026-10-22T00:00:00.000Z';
const META = { gitCommit: 'test', importedBy: 'test', now: NOW };

function adapter(d1: FakeD1) {
  return { query: async (sql: string) => (await d1.prepare(sql).all<Record<string, unknown>>()).results };
}

/** 比對 → 產生 SQL → 執行；回傳計畫 */
async function runImport(d1: FakeD1, dataDir: string, scopeSpec = 'all', resolutions = {}) {
  const sources = imp.loadSources(dataDir);
  const scope = imp.resolveScope(scopeSpec, sources.areaIds);
  const state = await imp.readDbState(adapter(d1));
  const plan = imp.planImport({ sources, scope, state, resolutions });
  if (!plan.unresolved.length) d1.db.exec(imp.buildSql(plan, sources, META));
  return { plan, sources };
}

const row = (d1: FakeD1, sql: string, ...args: unknown[]) => d1.db.prepare(sql).get(...(args as never[])) as Record<string, any>;
const rows = (d1: FakeD1, sql: string, ...args: unknown[]) => d1.db.prepare(sql).all(...(args as never[])) as Record<string, any>[];

function addMember(d1: FakeD1, id = 'dev-a') {
  d1.db.prepare("INSERT OR IGNORE INTO members (line_user_id, display_name, source) VALUES (?, ?, 'dev')").run(id, id);
}

function addEdit(d1: FakeD1, placeId: string, fieldPath: string, value: unknown, baseValue: unknown, author = 'dev-a') {
  addMember(d1, author);
  const r = d1.db
    .prepare('INSERT INTO place_edits (place_id, field_path, value, base_value, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(placeId, fieldPath, JSON.stringify(value), baseValue === undefined ? null : JSON.stringify(baseValue), author, NOW, NOW);
  return Number(r.lastInsertRowid);
}

function rewriteSpots(dir: string, spots: unknown[]) {
  fs.writeFileSync(path.join(dir, 'areas/test-area/spots.json'), JSON.stringify(spots, null, 2));
}

describe('匯入：新的區域 test-area（區域不寫死）', () => {
  test('第一次匯入：全部新增，記在 imports', async () => {
    const d1 = freshDb();
    const { plan } = await runImport(d1, writeTestData());
    assert.deepEqual(plan.scope, ['test-area']);
    assert.equal(plan.summary.add, 2);
    assert.deepEqual(plan.add.map((a: any) => a.id), ['test-area-spot', 'test-station']);
    assert.equal(row(d1, 'SELECT COUNT(*) AS n FROM places_base').n, 2);
    const i = row(d1, 'SELECT * FROM imports');
    assert.equal(i.area, 'test-area');
    assert.equal(JSON.parse(i.summary).add, 2);
    const p = row(d1, "SELECT * FROM places_base WHERE id = 'test-area-spot'");
    assert.equal(p.area, 'test-area');
    assert.equal(p.import_id, 1);
    assert.equal(p.first_import_id, 1);
    assert.equal(JSON.parse(p.data).id, 'test-area-spot');
  });

  test('重跑一次：全部沒變，不新增', async () => {
    const d1 = freshDb();
    const dir = writeTestData();
    await runImport(d1, dir);
    const { plan } = await runImport(d1, dir);
    assert.deepEqual(
      [plan.summary.add, plan.summary.update, plan.summary.retire, plan.summary.unchanged],
      [0, 0, 0, 2],
    );
  });

  test('不認得的區域：錯誤，列出 areas.json 有的區域', () => {
    assert.throws(() => imp.resolveScope('osaka', ['test-area']), /osaka 不在 areas.json（有的區域：test-area）/);
  });
});

describe('匯入：三方比對', () => {
  async function setup() {
    const d1 = freshDb();
    const dir = writeTestData({ spots: [testSpot('test-area-spot', { phone: '0000-11-1111', indoor: false, stayMinutes: 60 })] });
    await runImport(d1, dir);
    // 使用者改了三個欄位
    const keep = addEdit(d1, 'test-area-spot', 'stayMinutes', 90, 60); // 預設值這次不會變
    const same = addEdit(d1, 'test-area-spot', 'indoor', true, false); // 新的預設值剛好和使用者改的一樣
    const conflict = addEdit(d1, 'test-area-spot', 'phone', '0000-22-2222', '0000-11-1111'); // 兩邊都改了
    const reverted = addEdit(d1, 'test-area-spot', 'phone', '0000-99-9999', '0000-11-1111');
    d1.db.prepare('UPDATE place_edits SET reverted_at = ? WHERE id = ?').run(NOW, reverted);
    rewriteSpots(dir, [testSpot('test-area-spot', { phone: '0000-33-3333', indoor: true, stayMinutes: 60 })]);
    return { d1, dir, keep, same, conflict };
  }

  test('預設值沒變 → 保留；兩邊一樣 → 收掉；三個都不一樣 → 衝突（復原過的不算）', async () => {
    const { d1, dir, keep, same, conflict } = await setup();
    const { plan } = await runImport(d1, dir);
    assert.equal(plan.summary.update, 1);
    assert.deepEqual(plan.update[0].fields, null, '沒給 oldData 就不列欄位');
    assert.deepEqual(plan.edits.keep.map((e: any) => e.editId), [keep]);
    assert.deepEqual(plan.edits.same.map((e: any) => e.editId), [same]);
    assert.deepEqual(plan.edits.conflict.map((e: any) => e.editId), [conflict]);
    assert.deepEqual(plan.unresolved, [conflict]);
    const c = plan.edits.conflict[0];
    assert.deepEqual([c.baseValue, c.value, c.newBase], ['0000-11-1111', '0000-22-2222', '0000-33-3333']);
  });

  test('有沒處理的衝突：不產生 SQL、資料庫不動', async () => {
    const { d1, dir } = await setup();
    const { plan, sources } = await runImport(d1, dir);
    assert.throws(() => imp.buildSql(plan, sources, META), /還有 1 個衝突沒有處理/);
    assert.equal(row(d1, 'SELECT COUNT(*) AS n FROM imports').n, 1);
    assert.equal(JSON.parse(row(d1, "SELECT data FROM places_base WHERE id = 'test-area-spot'").data).phone, '0000-11-1111');
  });

  test('衝突選 keep：保留修改，base_value 換成新的預設值；兩邊一樣的那筆收掉', async () => {
    const { d1, dir, keep, same, conflict } = await setup();
    const { plan } = await runImport(d1, dir, 'all', { [conflict]: 'keep' });
    assert.equal(plan.unresolved.length, 0);
    const e = row(d1, 'SELECT * FROM place_edits WHERE id = ?', conflict);
    assert.equal(e.closed_at, null);
    assert.equal(JSON.parse(e.base_value), '0000-33-3333');
    const s = row(d1, 'SELECT * FROM place_edits WHERE id = ?', same);
    assert.equal(s.closed_reason, 'same-as-new-base');
    assert.equal(s.closed_import_id, 2);
    assert.equal(row(d1, 'SELECT closed_at FROM place_edits WHERE id = ?', keep).closed_at, null);
    assert.equal(JSON.parse(row(d1, "SELECT data FROM places_base WHERE id = 'test-area-spot'").data).phone, '0000-33-3333');
    assert.equal(JSON.parse(row(d1, 'SELECT summary FROM imports WHERE id = 2').summary).conflictResolutions[conflict], 'keep');
    // 再匯入一次：都處理完了，沒有衝突
    const again = await runImport(d1, dir);
    assert.equal(again.plan.summary.conflicts, 0);
    assert.equal(again.plan.summary.update, 0);
  });

  test('衝突選 use-base：這筆修改收掉', async () => {
    const { d1, dir, conflict } = await setup();
    await runImport(d1, dir, 'all', { [conflict]: 'use-base' });
    assert.equal(row(d1, 'SELECT closed_reason FROM place_edits WHERE id = ?', conflict).closed_reason, 'conflict-use-base');
  });

  test('報告列出變了哪些欄位（readOldData）', async () => {
    const { d1, dir, conflict } = await setup();
    const sources = imp.loadSources(dir);
    const state = await imp.readDbState(adapter(d1));
    const oldData = await imp.readOldData(adapter(d1), ['test-area-spot']);
    const plan = imp.planImport({ sources, scope: imp.resolveScope('all', sources.areaIds), state, oldData, resolutions: {} });
    assert.deepEqual(plan.update[0].fields, ['indoor', 'phone']);
    const md = imp.reportMarkdown(plan, { sources, generatedAt: NOW, gitCommit: 'test' });
    assert.match(md, /## 衝突 1 筆/);
    assert.match(md, new RegExp(`修改 #${conflict} \`test-area-spot\``));
    assert.match(md, /新的預設值：`"0000-33-3333"`/);
  });
});

describe('匯入：下架與恢復', () => {
  test('這次沒有的 ID 標成下架，不刪除；修改照樣留著。又出現時恢復', async () => {
    const d1 = freshDb();
    const dir = writeTestData({ spots: [testSpot('test-area-spot'), testSpot('test-area-gone')] });
    await runImport(d1, dir);
    const edit = addEdit(d1, 'test-area-gone', 'stayMinutes', 30, null);

    rewriteSpots(dir, [testSpot('test-area-spot')]);
    const r1 = await runImport(d1, dir);
    assert.deepEqual(r1.plan.retire.map((r: any) => r.id), ['test-area-gone']);
    const gone = row(d1, "SELECT * FROM places_base WHERE id = 'test-area-gone'");
    assert.equal(gone.retired_at, NOW);
    assert.equal(gone.retired_import_id, 2);
    assert.ok(row(d1, 'SELECT * FROM place_edits WHERE id = ?', edit), '修改沒有被刪');

    // 再跑一次：已經下架的不重複下架
    assert.equal((await runImport(d1, dir)).plan.summary.retire, 0);

    rewriteSpots(dir, [testSpot('test-area-spot'), testSpot('test-area-gone')]);
    const r2 = await runImport(d1, dir);
    assert.deepEqual(r2.plan.restore.map((r: any) => r.id), ['test-area-gone']);
    assert.equal(row(d1, "SELECT retired_at FROM places_base WHERE id = 'test-area-gone'").retired_at, null);
  });

  test('只匯入一個區域：其他區域的點不會被下架；區域換了的點等匯入新的區域時處理', async () => {
    const d1 = freshDb();
    const dir = writeTestData();
    // 加第二個區域 test-two（只改 areas.json 和資料，不改程式）
    const areas = JSON.parse(fs.readFileSync(path.join(dir, 'areas.json'), 'utf8'));
    areas.push({ ...areas[0], id: 'test-two', stations: [] });
    fs.writeFileSync(path.join(dir, 'areas.json'), JSON.stringify(areas));
    fs.mkdirSync(path.join(dir, 'areas/test-two'));
    fs.writeFileSync(path.join(dir, 'areas/test-two/spots.json'), JSON.stringify([testSpot('test-two-spot', { area: 'test-two' })]));

    await runImport(d1, dir, 'all');
    assert.equal(row(d1, 'SELECT COUNT(*) AS n FROM places_base').n, 3);

    // test-two 的點搬到 test-area：只匯入 test-two 時不下架，報告列成「區域換了」
    fs.writeFileSync(path.join(dir, 'areas/test-two/spots.json'), '[]');
    rewriteSpots(dir, [testSpot(), testSpot('test-two-spot')]);
    const r = await runImport(d1, dir, 'test-two');
    assert.equal(r.plan.summary.retire, 0);
    assert.deepEqual(r.plan.moved, [{ id: 'test-two-spot', from: 'test-two', to: 'test-area' }]);
    assert.equal(row(d1, "SELECT area FROM places_base WHERE id = 'test-two-spot'").area, 'test-two');

    const r2 = await runImport(d1, dir, 'test-area');
    assert.deepEqual(r2.plan.update.map((u: any) => [u.id, u.fromArea]), [['test-two-spot', 'test-two']]);
    assert.equal(row(d1, "SELECT area FROM places_base WHERE id = 'test-two-spot'").area, 'test-area');
  });
});

describe('匯入：轉址', () => {
  test('舊 ID → 新 ID：記在 redirects，修改、投票、建議、行程跟著轉過去，舊的點下架', async () => {
    const d1 = freshDb();
    const dir = writeTestData({ spots: [testSpot('test-area-spot'), testSpot('test-area-dup')] });
    await runImport(d1, dir);
    const edit = addEdit(d1, 'test-area-dup', 'stayMinutes', 45, null);
    addMember(d1, 'dev-b');
    const vote = d1.db.prepare("INSERT INTO votes (place_id, member_id, value, updated_at) VALUES (?, ?, 'like', ?)");
    vote.run('test-area-dup', 'dev-a', NOW); // 只投了舊的 → 轉過去
    vote.run('test-area-dup', 'dev-b', NOW); // 兩邊都投過 → 保留新的那一票
    vote.run('test-area-spot', 'dev-b', NOW);
    d1.db
      .prepare("INSERT INTO suggestions (day, place_ids, text, author, created_at, updated_at) VALUES ('trip', ?, '去看看', 'dev-a', ?, ?)")
      .run(JSON.stringify(['test-area-dup', 'test-station']), NOW, NOW);
    d1.db
      .prepare("INSERT INTO itinerary (id, data, version, updated_by, updated_at) VALUES (1, ?, 3, 'dev-a', ?)")
      .run(JSON.stringify({ days: [{ items: [{ place: 'test-area-dup' }, { place: 'test-area-dup-2' }] }] }), NOW);

    rewriteSpots(dir, [testSpot('test-area-spot')]);
    fs.writeFileSync(
      path.join(dir, 'redirects.json'),
      JSON.stringify([{ from: 'test-area-dup', to: 'test-area-spot', date: '2026-10-22', reason: '同一個地方' }]),
    );
    const { plan } = await runImport(d1, dir);
    assert.equal(plan.summary.redirects, 1);
    assert.deepEqual(plan.retire.map((r: any) => [r.id, r.redirectedTo]), [['test-area-dup', 'test-area-spot']]);

    assert.equal(row(d1, "SELECT new_id FROM redirects WHERE old_id = 'test-area-dup'").new_id, 'test-area-spot');
    assert.equal(row(d1, 'SELECT place_id FROM place_edits WHERE id = ?', edit).place_id, 'test-area-spot');
    const votes = rows(d1, 'SELECT place_id, member_id, deleted_at FROM votes ORDER BY place_id, member_id');
    assert.deepEqual(
      votes.map((v) => [v.place_id, v.member_id, v.deleted_at === null]),
      [
        ['test-area-dup', 'dev-b', false],
        ['test-area-spot', 'dev-a', true],
        ['test-area-spot', 'dev-b', true],
      ],
    );
    assert.deepEqual(JSON.parse(row(d1, 'SELECT place_ids FROM suggestions').place_ids), ['test-area-spot', 'test-station']);
    const itin = row(d1, 'SELECT * FROM itinerary');
    assert.equal(itin.version, 4);
    assert.deepEqual(JSON.parse(itin.data).days[0].items, [{ place: 'test-area-spot' }, { place: 'test-area-dup-2' }], '只換完全相同的 ID');
    const snap = row(d1, 'SELECT * FROM snapshots');
    assert.equal(snap.version, 3, '改行程前先存快照');

    // 再匯入一次：轉址已經在資料庫裡，不重複
    assert.equal((await runImport(d1, dir)).plan.summary.redirects, 0);
  });
});

describe('匯入：真的資料', () => {
  test('讀得到 areas.json 的全部區域，第一次匯入全部是新增', async () => {
    const sources = imp.loadSources(path.join(ROOT, 'data'));
    const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/areas.json'), 'utf8')).map((a: any) => a.id);
    assert.deepEqual(sources.areaIds, areas);
    const d1 = freshDb();
    const state = await imp.readDbState(adapter(d1));
    const plan = imp.planImport({ sources, scope: imp.resolveScope('all', sources.areaIds), state });
    assert.equal(plan.summary.add, sources.records.size);
    assert.equal(plan.summary.retire, 0);
    // SQL 執行得了，每一句都在 D1 的 100 KB 上限內
    const sql = imp.buildSql(plan, sources, META);
    assert.ok(sql.split('\n').every((l: string) => Buffer.byteLength(l) < 100_000));
    d1.db.exec(sql);
    assert.equal(row(d1, 'SELECT COUNT(*) AS n FROM places_base').n, sources.records.size);
  });

  test('canonical：鍵的順序不影響 content_hash', () => {
    assert.equal(imp.contentHash({ a: 1, b: [1, { c: 2, d: 3 }] }), imp.contentHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    assert.notEqual(imp.contentHash({ a: 1 }), imp.contentHash({ a: 2 }));
    assert.equal(imp.canonical(testStation()), imp.canonical(JSON.parse(JSON.stringify(testStation()))));
  });
});
