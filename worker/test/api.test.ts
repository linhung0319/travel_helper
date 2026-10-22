// Worker 的資料 API（T24）：在 Node 裡直接呼叫 handle()，資料庫用 node:sqlite 模擬的 D1。
// 預設資料用匯入腳本（scripts/lib/import-plan.mjs）匯入測試用的 test-area。

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, type FakeD1 } from './helpers/d1.ts';
import { handle } from '../src/index.ts';
import { writeTestData, testSpot } from '../../scripts/test/helpers/test-area.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import * as imp from '../../scripts/lib/import-plan.mjs';

let d1: FakeD1;
const env = () => ({ DB: d1 as unknown as D1Database, DEV_AUTH: '1', DEV_MEMBER_ID: 'dev-a', DEV_MEMBER_NAME: '甲' });

async function call(method: string, path: string, body?: unknown, opts: { as?: string; headers?: Record<string, string>; env?: object } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.as) headers['x-dev-member'] = opts.as;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await handle(
    new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    (opts.env ?? env()) as never,
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

async function importTestArea(spots = [testSpot('test-area-spot', { stayMinutes: 60 }), testSpot('test-area-dup')], redirects?: unknown[]) {
  const dir = writeTestData({ spots, extraFiles: redirects ? { 'redirects.json': redirects } : {} });
  const sources = imp.loadSources(dir);
  const query = async (sql: string) => (await d1.prepare(sql).all<Record<string, unknown>>()).results;
  const plan = imp.planImport({ sources, scope: imp.resolveScope('all', sources.areaIds), state: await imp.readDbState({ query }) });
  d1.db.exec(imp.buildSql(plan, sources, { gitCommit: 'test', importedBy: 'test', now: new Date().toISOString() }));
}

beforeEach(async () => {
  d1 = freshDb();
  await importTestArea();
});

describe('登入（T24 的開發用身分）', () => {
  test('DEV_AUTH 不是 "1"：401', async () => {
    const r = await call('GET', '/api/me', undefined, { env: { DB: d1 } });
    assert.equal(r.status, 401);
  });
  test('預設身分、X-Dev-Member 切換，第一次看到就寫進 members', async () => {
    assert.equal((await call('GET', '/api/me')).body.member.displayName, '甲');
    assert.equal((await call('GET', '/api/me', undefined, { as: 'dev-b' })).body.member.id, 'dev-b');
    const m = await call('GET', '/api/members');
    assert.deepEqual(m.body.members.map((x: any) => x.id).sort(), ['dev-a', 'dev-b']);
    assert.equal((await call('GET', '/api/me', undefined, { as: 'someone' })).status, 401);
  });
  test('沒有的 API 404、方法不對 405', async () => {
    assert.equal((await call('GET', '/api/nope')).status, 404);
    assert.equal((await call('DELETE', '/api/places')).status, 405);
  });
});

describe('預設資料與修改', () => {
  test('GET /api/places：全部的點、ETag 是匯入編號，沒變就 304', async () => {
    const r = await call('GET', '/api/places');
    assert.equal(r.status, 200);
    assert.equal(r.body.importId, 1);
    assert.deepEqual(r.body.places.map((p: any) => p.id).sort(), ['test-area-dup', 'test-area-spot', 'test-station']);
    assert.deepEqual(r.body.retired, {});
    const etag = r.headers.get('etag')!;
    assert.equal(etag, '"imp-1"');
    assert.equal((await call('GET', '/api/places', undefined, { headers: { 'if-none-match': etag } })).status, 304);
  });

  test('修改：先合併再驗證，通過就生效；GET /api/places/:id 看得到改過的欄位', async () => {
    const r = await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: 90, note: '其實要比較久' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.edit.baseValue, 60);
    assert.equal(r.body.edit.author, 'dev-a');
    const p = await call('GET', '/api/places/test-area-spot');
    assert.equal(p.body.data.stayMinutes, 90);
    assert.equal(p.body.base.stayMinutes, 60, '預設資料不動');
    assert.equal(p.body.edited.stayMinutes.author, 'dev-a');
    assert.equal(p.body.edits.length, 1);
  });

  test('改完不符合 schema：400，不寫進去', async () => {
    const r = await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: '很久' });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /不符合 schema/);
    assert.ok(r.body.details.some((d: any) => d.path === '/stayMinutes'));
    const extra = await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'nonsense', value: 1 });
    assert.equal(extra.status, 400);
    assert.equal((await call('GET', '/api/edits')).body.edits.length, 0);
  });

  test('不能改 id、type，三層以上的路徑不行；沒有的點 404', async () => {
    for (const fieldPath of ['id', 'type', 'group.a.b']) {
      assert.equal((await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath, value: 'x' })).status, 400, fieldPath);
    }
    assert.equal((await call('POST', '/api/edits', { placeId: 'nope', fieldPath: 'phone', value: 'x' })).status, 404);
    assert.equal((await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'phone' })).status, 400, '沒有 value');
  });

  test('復原：只有改的人自己能按；復原過不能再復原', async () => {
    const id = (await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: 90 })).body.edit.id;
    assert.equal((await call('POST', `/api/edits/${id}/revert`, {}, { as: 'dev-b' })).status, 403);
    const ok = await call('POST', `/api/edits/${id}/revert`, {});
    assert.equal(ok.status, 200);
    assert.equal(ok.body.edit.revertedBy, 'dev-a');
    assert.equal((await call('POST', `/api/edits/${id}/revert`, {})).status, 409);
    assert.equal((await call('GET', '/api/places/test-area-spot')).body.data.stayMinutes, 60);
  });

  test('別人可以蓋過去：最新一筆生效', async () => {
    await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: 90 });
    await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: 30 }, { as: 'dev-b' });
    const p = await call('GET', '/api/places/test-area-spot');
    assert.equal(p.body.data.stayMinutes, 30);
    assert.equal(p.body.edited.stayMinutes.author, 'dev-b');
  });

  test('GET /api/edits?since= 只回傳之後變動的（同一毫秒的也回傳，前端用 id 去重複）', async () => {
    await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: 90 });
    await new Promise((r) => setTimeout(r, 2));
    const since = (await call('GET', '/api/edits')).body.now;
    assert.equal((await call('GET', `/api/edits?since=${since}`)).body.edits.length, 0);
    const id = (await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'phone', value: '0599-00-0000' })).body.edit.id;
    assert.deepEqual((await call('GET', `/api/edits?since=${since}`)).body.edits.map((e: any) => e.id), [id]);
  });

  test('轉址的舊 ID：GET、修改都轉到新 ID；下架的點照樣回傳並標出來', async () => {
    await importTestArea([testSpot('test-area-spot')], [{ from: 'test-area-dup', to: 'test-area-spot', date: '2026-10-22', reason: '重複' }]);
    const list = await call('GET', '/api/places');
    assert.deepEqual(list.body.redirects, { 'test-area-dup': 'test-area-spot' });
    assert.ok(list.body.retired['test-area-dup']);
    const p = await call('GET', '/api/places/test-area-dup');
    assert.equal(p.body.id, 'test-area-spot');
    assert.equal(p.body.redirectedFrom, 'test-area-dup');
    const e = await call('POST', '/api/edits', { placeId: 'test-area-dup', fieldPath: 'stayMinutes', value: 10 });
    assert.equal(e.body.edit.placeId, 'test-area-spot');
  });
});

describe('自己加的點', () => {
  const data = { name: { zh: '阿嬤推薦的店' }, coords: [136.8, 34.48] };
  test('新增、誰都能改、只有本人能刪（軟刪除）', async () => {
    const c = await call('POST', '/api/user-places', { type: 'restaurant', data });
    assert.equal(c.status, 201);
    const id = c.body.userPlace.id;
    assert.match(id, /^user-[0-9a-f]{12}$/);
    assert.equal(c.body.userPlace.data.id, id);
    const u = await call('PATCH', `/api/user-places/${id}`, { data: { ...data, note: '週一休' } }, { as: 'dev-b' });
    assert.equal(u.body.userPlace.updatedBy, 'dev-b');
    assert.equal((await call('DELETE', `/api/user-places/${id}`, undefined, { as: 'dev-b' })).status, 403);
    const d = await call('DELETE', `/api/user-places/${id}`);
    assert.ok(d.body.userPlace.deletedAt);
    assert.equal((await call('PATCH', `/api/user-places/${id}`, { data })).status, 404);
  });
  test('名稱、座標、類別要對', async () => {
    assert.equal((await call('POST', '/api/user-places', { type: 'restaurant', data: { coords: [136.8, 34.48] } })).status, 400);
    assert.equal((await call('POST', '/api/user-places', { type: 'restaurant', data: { ...data, coords: [34.48, 136.8] } })).status, 400);
    assert.equal((await call('POST', '/api/user-places', { type: 'station', data })).status, 400);
  });
});

describe('確定的行程與快照', () => {
  test('version 不一樣就 409；每次改之前存快照；可以復原', async () => {
    assert.deepEqual((await call('GET', '/api/itinerary')).body, { version: 0, data: null, updatedBy: null, updatedAt: null });
    const v1 = await call('PUT', '/api/itinerary', { version: 0, data: { days: ['a'] } });
    assert.equal(v1.body.version, 1);
    assert.equal((await call('PUT', '/api/itinerary', { version: 0, data: { days: ['x'] } }, { as: 'dev-b' })).status, 409);
    const v2 = await call('PUT', '/api/itinerary', { version: 1, data: { days: ['b'] }, reason: '加了一天' }, { as: 'dev-b' });
    assert.equal(v2.body.version, 2);
    assert.equal(v2.body.updatedBy, 'dev-b');
    const stale = await call('PUT', '/api/itinerary', { version: 1, data: { days: ['c'] } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.details.current, 2);

    const snaps = (await call('GET', '/api/itinerary/snapshots')).body.snapshots;
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].version, 1);
    assert.deepEqual((await call('GET', `/api/itinerary/snapshots/${snaps[0].id}`)).body.data, { days: ['a'] });

    const r = await call('POST', `/api/itinerary/snapshots/${snaps[0].id}/restore`, { version: 2 });
    assert.equal(r.body.version, 3);
    assert.deepEqual(r.body.data, { days: ['a'] });
    assert.equal((await call('GET', '/api/itinerary/snapshots')).body.snapshots.length, 2, '復原也存快照');
  });
  test('data 要是物件、version 要是整數', async () => {
    assert.equal((await call('PUT', '/api/itinerary', { version: 0, data: [] })).status, 400);
    assert.equal((await call('PUT', '/api/itinerary', { version: '0', data: {} })).status, 400);
  });
});

describe('建議', () => {
  test('只有寫的人能改、能刪；狀態誰都能標', async () => {
    const c = await call('POST', '/api/suggestions', { day: '2027-02-05', text: '想去水族館', placeIds: ['test-area-spot'] });
    assert.equal(c.status, 201);
    const id = c.body.suggestion.id;
    assert.equal((await call('PATCH', `/api/suggestions/${id}`, { text: '改掉' }, { as: 'dev-b' })).status, 403);
    assert.equal((await call('PATCH', `/api/suggestions/${id}`, { text: '想去水族館（上午）' })).body.suggestion.text, '想去水族館（上午）');
    const s = await call('PATCH', `/api/suggestions/${id}/status`, { status: 'adopted', note: '排在第 4 天', adoptedItemIds: ['i1'] }, { as: 'dev-b' });
    assert.equal(s.body.suggestion.status, 'adopted');
    assert.equal(s.body.suggestion.statusBy, 'dev-b');
    assert.deepEqual(s.body.suggestion.adoptedItemIds, ['i1']);
    assert.equal((await call('DELETE', `/api/suggestions/${id}`, undefined, { as: 'dev-b' })).status, 403);
    assert.equal((await call('DELETE', `/api/suggestions/${id}`)).status, 200);
    assert.equal((await call('GET', '/api/suggestions')).body.suggestions.length, 0);
    assert.equal((await call('GET', '/api/suggestions?since=2000-01-01')).body.suggestions[0].deletedAt !== null, true, 'since 時回傳刪除的');
  });
  test('day 要是日期或 trip；text 不能空', async () => {
    assert.equal((await call('POST', '/api/suggestions', { day: '2/5', text: 'x' })).status, 400);
    assert.equal((await call('POST', '/api/suggestions', { day: 'trip', text: ' ' })).status, 400);
    assert.equal((await call('POST', '/api/suggestions', { day: 'trip', text: '整趟都想吃海鮮' })).status, 201);
  });
});

describe('投票', () => {
  test('一人一個點一筆、改票、收回（軟刪除）', async () => {
    await call('PUT', '/api/votes/test-area-spot', { value: 'like' });
    await call('PUT', '/api/votes/test-area-spot', { value: 'dislike', note: '太遠' });
    await call('PUT', '/api/votes/test-area-spot', { value: 'like' }, { as: 'dev-b' });
    let v = (await call('GET', '/api/votes?place=test-area-spot')).body.votes;
    assert.deepEqual(v.map((x: any) => [x.memberId, x.value]).sort(), [['dev-a', 'dislike'], ['dev-b', 'like']]);
    await call('DELETE', '/api/votes/test-area-spot');
    v = (await call('GET', '/api/votes')).body.votes;
    assert.deepEqual(v.map((x: any) => x.memberId), ['dev-b']);
    assert.equal((await call('PUT', '/api/votes/test-area-spot', { value: 'love' })).status, 400);
  });
});

describe('聊天紀錄', () => {
  test('只看得到自己的', async () => {
    await call('POST', '/api/chats/c1', { role: 'user', content: [{ type: 'text', text: '第一天去哪？' }] });
    await call('POST', '/api/chats/c1', { role: 'assistant', content: [{ type: 'text', text: '賢島' }] });
    await call('POST', '/api/chats/c1', { role: 'user', content: 'b 的' }, { as: 'dev-b' });
    assert.equal((await call('GET', '/api/chats/c1')).body.messages.length, 2);
    assert.equal((await call('GET', '/api/chats/c1', undefined, { as: 'dev-b' })).body.messages.length, 1);
    assert.deepEqual((await call('GET', '/api/chats')).body.conversations.map((c: any) => [c.id, c.messages]), [['c1', 2]]);
    assert.equal((await call('DELETE', '/api/chats/c1', undefined, { as: 'dev-b' })).body.deleted, 1);
    assert.equal((await call('GET', '/api/chats/c1')).body.messages.length, 2);
    assert.equal((await call('POST', '/api/chats/c1', { role: 'system', content: 'x' })).status, 400);
  });
});

describe('同步', () => {
  test('有變動時對應的版本跟著變', async () => {
    const a = (await call('GET', '/api/sync')).body;
    assert.equal(a.places, 1);
    assert.equal(a.votes, null);
    await call('PUT', '/api/votes/test-area-spot', { value: 'like' });
    const b = (await call('GET', '/api/sync')).body;
    assert.notEqual(b.votes, null);
    assert.equal(b.edits, a.edits);
    await new Promise((r) => setTimeout(r, 2));
    await call('DELETE', '/api/votes/test-area-spot');
    const c = (await call('GET', '/api/sync')).body;
    assert.notEqual(c.votes, b.votes, '收回投票也看得出來');
    await call('PUT', '/api/itinerary', { version: 0, data: {} });
    assert.equal((await call('GET', '/api/sync')).body.itinerary, 1);
  });
});
