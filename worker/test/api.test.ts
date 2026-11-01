// Worker 的資料 API（T24）：在 Node 裡直接呼叫 handle()，資料庫用 node:sqlite 模擬的 D1。
// 預設資料用匯入腳本（scripts/lib/import-plan.mjs）匯入測試用的 test-area。

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, type FakeD1 } from './helpers/d1.ts';
import { createItinerary } from '@travel-helper/engine';
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

  test('ETag：Cloudflare 改成弱 ETag 也比對得到', async () => {
    assert.equal((await call('GET', '/api/places', undefined, { headers: { 'if-none-match': 'W/"imp-1"' } })).status, 304);
    assert.equal((await call('GET', '/api/places/details', undefined, { headers: { 'if-none-match': 'W/"imp-1"' } })).status, 304);
    assert.equal((await call('GET', '/api/places', undefined, { headers: { 'if-none-match': '"imp-0"' } })).status, 200);
  });

  test('清單層、詳情層：接起來等於原始資料；研究用的 extra 不外流', async () => {
    const list = (await call('GET', '/api/places')).body.places;
    const details = (await call('GET', '/api/places/details')).body.details;
    const one = (await call('GET', '/api/places/test-area-spot')).body.data;
    const l = list.find((p: any) => p.id === 'test-area-spot');
    const d = details.find((p: any) => p.id === 'test-area-spot');
    assert.equal(l.sources, undefined);
    assert.equal(l.summary, undefined);
    const { extra: _a, ...full } = { ...l, ...d };
    const { extra: _b, ...orig } = one;
    assert.deepEqual(full, orig);
    assert.equal(d.extra?.conflicts, undefined);
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

describe('展開 Google Maps 短網址（T31）', () => {
  const realFetch = globalThis.fetch;
  const G = 'https://www.google.com/maps/place/X/@34.4,136.8,17z';
  /** 假 fetch：照 map 回應，沒列的回 200；呼叫過的網址記在 calls */
  const stub = (map: Record<string, { status: number; location?: string }>) => {
    const calls: string[] = [];
    globalThis.fetch = (async (u: string | URL | Request) => {
      const url = String(u);
      calls.push(url);
      const r = map[url] ?? { status: 200 };
      return new Response(null, { status: r.status, headers: r.location ? { location: r.location } : {} });
    }) as typeof fetch;
    return calls;
  };
  const resolve = (u: string, o: Parameters<typeof call>[3] = {}) =>
    call('GET', `/api/resolve-map-link?url=${encodeURIComponent(u)}`, undefined, o);
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('短網址一路跟轉址，回傳最後的網址', async () => {
    const calls = stub({ 'https://maps.app.goo.gl/abc': { status: 302, location: G } });
    const r = await resolve('https://maps.app.goo.gl/abc');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { url: G });
    assert.equal(calls.length, 2);
  });
  test('起點不是 Google 短網址：400', async () => {
    stub({});
    assert.equal((await resolve('https://example.com/x')).status, 400);
  });
  test('轉址到別的網站：400', async () => {
    stub({ 'https://maps.app.goo.gl/abc': { status: 302, location: 'https://evil.example/' } });
    assert.equal((await resolve('https://maps.app.goo.gl/abc')).status, 400);
  });
  test('轉址到長得像 Google 的別人網域、或不是 https：400', async () => {
    stub({ 'https://maps.app.goo.gl/abc': { status: 302, location: 'https://google.attacker.com/' } });
    assert.equal((await resolve('https://maps.app.goo.gl/abc')).status, 400);
    stub({ 'https://maps.app.goo.gl/abc': { status: 302, location: 'http://www.google.com/maps/place/X' } });
    assert.equal((await resolve('https://maps.app.goo.gl/abc')).status, 400);
  });
  test('fetch 丟錯：400 而不是 500', async () => {
    globalThis.fetch = (async () => {
      throw new Error('boom');
    }) as typeof fetch;
    assert.equal((await resolve('https://maps.app.goo.gl/abc')).status, 400);
  });
  test('一直轉址（超過 5 次）：400', async () => {
    stub({ 'https://maps.app.goo.gl/abc': { status: 302, location: 'https://maps.app.goo.gl/abc' } });
    assert.equal((await resolve('https://maps.app.goo.gl/abc')).status, 400);
  });
  test('沒登入：401', async () => {
    stub({});
    assert.equal((await resolve('https://maps.app.goo.gl/abc', { env: { DB: d1 } })).status, 401);
  });
  test('PATCH 可以改 type；沒給沿用；不合法 400', async () => {
    const data = { name: { zh: '某店' }, coords: [136.8, 34.48] };
    const id = (await call('POST', '/api/user-places', { type: 'restaurant', data })).body.userPlace.id;
    const same = await call('PATCH', `/api/user-places/${id}`, { data });
    assert.equal(same.body.userPlace.type, 'restaurant');
    const u = await call('PATCH', `/api/user-places/${id}`, { data, type: 'spot' });
    assert.equal(u.body.userPlace.type, 'spot');
    assert.equal(u.body.userPlace.data.type, 'spot');
    assert.equal((await call('PATCH', `/api/user-places/${id}`, { data, type: 'bar' })).status, 400);
  });
});

describe('確定的行程與快照', () => {
  test('version 不一樣就 409；每次改之前存快照；可以復原', async () => {
    assert.deepEqual((await call('GET', '/api/itinerary')).body, { version: 0, data: null, updatedBy: null, updatedAt: null });
    const a = { ...createItinerary(), seq: 100 };
    const v1 = await call('PUT', '/api/itinerary', { version: 0, data: a });
    assert.equal(v1.body.version, 1);
    assert.equal((await call('PUT', '/api/itinerary', { version: 0, data: createItinerary() }, { as: 'dev-b' })).status, 409);
    const v2 = await call('PUT', '/api/itinerary', { version: 1, data: { ...createItinerary(), seq: 200 }, reason: '加了一天' }, { as: 'dev-b' });
    assert.equal(v2.body.version, 2);
    assert.equal(v2.body.updatedBy, 'dev-b');
    const stale = await call('PUT', '/api/itinerary', { version: 1, data: createItinerary() });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.details.current, 2);

    const snaps = (await call('GET', '/api/itinerary/snapshots')).body.snapshots;
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].version, 1);
    assert.deepEqual((await call('GET', `/api/itinerary/snapshots/${snaps[0].id}`)).body.data, a);

    const r = await call('POST', `/api/itinerary/snapshots/${snaps[0].id}/restore`, { version: 2 });
    assert.equal(r.body.version, 3);
    assert.deepEqual(r.body.data, a);
    assert.equal((await call('GET', '/api/itinerary/snapshots')).body.snapshots.length, 2, '復原也存快照');
  });
  test('data 要是物件、version 要是整數', async () => {
    assert.equal((await call('PUT', '/api/itinerary', { version: 0, data: [] })).status, 400);
    assert.equal((await call('PUT', '/api/itinerary', { version: '0', data: {} })).status, 400);
  });
  test('存行程時跑 validateItinerary：格式不對 400；舊資料的 bufferMinutes、trip 不報錯，mode 收 transit', async () => {
    const bad = await call('PUT', '/api/itinerary', { version: 0, data: { days: ['a'] } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.length > 0);
    const it = createItinerary();
    it.days[1].items.push({
      id: 'i-1',
      type: 'visit',
      options: [{ place: 'test-area-spot', stayMinutes: null, note: null }],
      selected: 0,
      start: null,
      travel: { mode: 'transit', minutes: null, note: null, bufferMinutes: 5, trip: { line: 'x' } },
      note: null,
    } as never);
    assert.equal((await call('PUT', '/api/itinerary', { version: 0, data: it })).status, 200);
  });
});

describe('留言', () => {
  test('只有作者能改、能刪（軟刪除）；地點、某一天、整趟都能留', async () => {
    const c = await call('POST', '/api/comments', { target: 'test-area-spot', text: '想早上去' });
    assert.equal(c.status, 201);
    assert.equal(c.body.comment.kind, 'normal');
    const id = c.body.comment.id;
    assert.equal((await call('PATCH', `/api/comments/${id}`, { text: '改掉' }, { as: 'dev-b' })).status, 403);
    assert.equal((await call('PATCH', `/api/comments/${id}`, { text: '想下午去' })).body.comment.text, '想下午去');
    assert.equal((await call('DELETE', `/api/comments/${id}`, undefined, { as: 'dev-b' })).status, 403);
    assert.equal((await call('DELETE', `/api/comments/${id}`)).status, 200);
    assert.equal((await call('GET', '/api/comments')).body.comments.length, 0);
    assert.equal((await call('DELETE', `/api/comments/${id}`)).status, 404);
    for (const target of ['day:2027-02-05', 'trip']) assert.equal((await call('POST', '/api/comments', { target, text: 'x', kind: 'planner' })).body.comment.target, target);
  });
  test('文字不能空、上限 500 字（和假後端一樣）；kind 要認得', async () => {
    assert.equal((await call('POST', '/api/comments', { target: 'trip', text: ' ' })).status, 400);
    assert.equal((await call('POST', '/api/comments', { target: 'trip', text: 'あ'.repeat(501) })).status, 400);
    assert.equal((await call('POST', '/api/comments', { target: '', text: 'x' })).status, 400);
    assert.equal((await call('POST', '/api/comments', { target: 'trip', text: 'x', kind: 'nope' })).status, 400);
  });
});

describe('候選', () => {
  test('同一天同一個點只有一筆；日期要在旅程裡；誰都能拿掉；拿掉後可以再加', async () => {
    const c = await call('POST', '/api/candidates', { placeId: 'test-area-spot', day: '2027-02-05' });
    assert.equal(c.status, 201);
    assert.equal(c.body.candidate.addedBy, 'dev-a');
    const again = await call('POST', '/api/candidates', { placeId: 'test-area-spot', day: '2027-02-05' }, { as: 'dev-b' });
    assert.equal(again.status, 200);
    assert.equal(again.body.candidate.id, c.body.candidate.id);
    assert.equal(again.body.candidate.addedBy, 'dev-a');
    assert.equal((await call('POST', '/api/candidates', { placeId: 'test-area-spot', day: '2027-03-01' })).status, 400);
    assert.equal((await call('POST', '/api/candidates', { placeId: '', day: '2027-02-05' })).status, 400);
    assert.equal((await call('DELETE', `/api/candidates/${c.body.candidate.id}`, undefined, { as: 'dev-b' })).status, 200);
    assert.equal((await call('GET', '/api/candidates')).body.candidates.length, 0);
    assert.equal((await call('DELETE', `/api/candidates/${c.body.candidate.id}`)).status, 404);
    assert.notEqual((await call('POST', '/api/candidates', { placeId: 'test-area-spot', day: '2027-02-05' })).body.candidate.id, c.body.candidate.id);
  });
});

describe('預約筆記', () => {
  test('同一個 (date, placeId) 整筆取代；Worker 填誰、何時；空白的備註是 null', async () => {
    const body = { date: '2027-02-05', placeId: 'test-area-spot', status: 'booked', note: '已訂 15 位', nights: 2 };
    const a = await call('PUT', '/api/reservations', body);
    assert.equal(a.body.reservation.updatedBy, 'dev-a');
    assert.equal(a.body.reservation.nights, 2);
    const b = await call('PUT', '/api/reservations', { date: '2027-02-05', placeId: 'test-area-spot', status: 'pending', note: '  ' }, { as: 'dev-b' });
    assert.deepEqual([b.body.reservation.status, b.body.reservation.note, b.body.reservation.nights, b.body.reservation.updatedBy], ['pending', null, null, 'dev-b']);
    assert.equal((await call('GET', '/api/reservations')).body.reservations.length, 1);
    assert.equal((await call('PUT', '/api/reservations', { ...body, status: 'nope' })).status, 400);
    assert.equal((await call('PUT', '/api/reservations', { ...body, date: '2/5' })).status, 400);
    assert.equal((await call('PUT', '/api/reservations', { ...body, note: 'あ'.repeat(501) })).status, 400);
  });
});

describe('啟動', () => {
  test('GET /api/bootstrap：一次拿齊，和各支 API 的內容一樣', async () => {
    assert.equal((await call('GET', '/api/bootstrap')).body.itinerary.data, null);
    await call('PUT', '/api/itinerary', { version: 0, data: createItinerary() });
    await call('PUT', '/api/votes/test-area-spot', { value: 'like' });
    await call('POST', '/api/comments', { target: 'trip', text: '嗨' });
    await call('POST', '/api/candidates', { placeId: 'test-area-spot', day: '2027-02-05' });
    await call('PUT', '/api/reservations', { date: '2027-02-05', placeId: 'test-area-spot', status: 'booked' });
    await call('POST', '/api/edits', { placeId: 'test-area-spot', fieldPath: 'stayMinutes', value: 90 });
    const r = await call('GET', '/api/bootstrap');
    assert.equal(r.status, 200);
    assert.equal(r.body.me.id, 'dev-a');
    assert.deepEqual(r.body.itinerary, (await call('GET', '/api/itinerary')).body);
    for (const k of ['members', 'snapshots', 'votes', 'comments', 'candidates', 'reservations', 'edits', 'userPlaces']) {
      const path = { userPlaces: '/api/user-places', snapshots: '/api/itinerary/snapshots' }[k] ?? `/api/${k}`;
      assert.deepEqual(r.body[k], (await call('GET', path)).body[k], k);
    }
    const { now: _a, ...sync } = r.body.sync;
    const { now: _b, ...direct } = (await call('GET', '/api/sync')).body;
    assert.deepEqual(sync, direct);
  });
});

describe('投票', () => {
  test('一人一個點一筆、改票、收回（軟刪除）', async () => {
    await call('PUT', '/api/votes/test-area-spot', { value: 'like' });
    await call('PUT', '/api/votes/test-area-spot', { value: 'dislike' });
    await call('PUT', '/api/votes/test-area-spot', { value: 'like' }, { as: 'dev-b' });
    let v = (await call('GET', '/api/votes?place=test-area-spot')).body.votes;
    assert.deepEqual(v.map((x: any) => [x.memberId, x.value]).sort(), [['dev-a', 'dislike'], ['dev-b', 'like']]);
    await call('DELETE', '/api/votes/test-area-spot');
    v = (await call('GET', '/api/votes')).body.votes;
    assert.deepEqual(v.map((x: any) => x.memberId), ['dev-b']);
    assert.equal((await call('PUT', '/api/votes/test-area-spot', { value: 'love' })).status, 400);
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
    await call('PUT', '/api/itinerary', { version: 0, data: createItinerary() });
    assert.equal((await call('GET', '/api/sync')).body.itinerary, 1);
    for (const [k, go] of [
      ['comments', () => call('POST', '/api/comments', { target: 'trip', text: 'x' })],
      ['candidates', () => call('POST', '/api/candidates', { placeId: 'test-area-spot', day: '2027-02-05' })],
      ['reservations', () => call('PUT', '/api/reservations', { date: '2027-02-05', placeId: 'test-area-spot', status: 'booked' })],
    ] as const) {
      assert.equal((await call('GET', '/api/sync')).body[k], null);
      await go();
      assert.notEqual((await call('GET', '/api/sync')).body[k], null, k);
    }
  });
});
