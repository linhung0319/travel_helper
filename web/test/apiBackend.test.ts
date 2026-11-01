// 前端的 apiBackend 對真的 Worker 程式（handle()＋node:sqlite 的 D1），和假後端（mock.ts）跑同一份情境：
// 回傳的形狀、規則都要一樣。dev server、既有 e2e 靠假後端，它和 Worker 走樣的話，這裡要抓得到。

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createItinerary, DEFAULT_CONFIG, type Itinerary } from '@travel-helper/engine';
import { freshDb, type FakeD1 } from '../../worker/test/helpers/d1.ts';
import { handle } from '../../worker/src/index.ts';
import { apiBackend } from '../src/backend/api.ts';
import { apiSource } from '../src/data/api.ts';
import { createMockBackend } from '../src/backend/mock.ts';
import { BackendError, type Backend } from '../src/backend/types.ts';
import { writeTestData, testSpot } from '../../scripts/test/helpers/test-area.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import * as imp from '../../scripts/lib/import-plan.mjs';

let d1: FakeD1;
let member = 'dev-a';
const realFetch = globalThis.fetch;

beforeEach(async () => {
  d1 = freshDb();
  const dir = writeTestData({ spots: [testSpot('test-area-spot'), testSpot('test-area-b')] });
  const sources = imp.loadSources(dir);
  const query = async (sql: string) => (await d1.prepare(sql).all<Record<string, unknown>>()).results;
  const plan = imp.planImport({ sources, scope: imp.resolveScope('all', sources.areaIds), state: await imp.readDbState({ query }) });
  d1.db.exec(imp.buildSql(plan, sources, { gitCommit: 't', importedBy: 't', now: new Date().toISOString() }));
  member = 'dev-a';
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('x-dev-member', member);
    return handle(new Request(`http://localhost${input}`, { ...init, headers }), { DB: d1, DEV_AUTH: '1' } as never);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const seed = { members: [{ id: 'dev-a', displayName: 'a', pictureUrl: null }, { id: 'dev-b', displayName: 'b', pictureUrl: null }], me: 'dev-a', itinerary: null };

const statusOf = (p: Promise<unknown>) =>
  p.then(
    () => 200,
    (e) => (e as BackendError).status,
  );

/** 時間、自動編號之外都比；鍵要一樣 */
function shape<T>(x: T): T {
  return JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'string' && /At$/.test(k) ? 'T' : k === 'id' && typeof v === 'string' && v.startsWith('user-') ? 'user-x' : v)));
}

/** 同一份情境，每一步的結果記下來 */
async function scenario(b: Backend, setMe: (id: string) => void): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const P = 'test-area-spot';
  setMe('dev-a');
  await b.me();
  setMe('dev-b');
  await b.me();
  setMe('dev-a');

  // 行程
  const it0: Itinerary = createItinerary();
  out.itineraryEmpty = await b.getItinerary();
  const v1 = await b.putItinerary(0, it0, '建立');
  out.v1 = { version: v1.version, updatedBy: v1.updatedBy };
  out.conflict = await statusOf(b.putItinerary(0, it0));
  const conflictDetails = await b.putItinerary(0, it0).catch((e: BackendError) => [e.code, e.details]);
  out.conflictDetails = conflictDetails;
  const v2 = await b.putItinerary(1, { ...it0, seq: 50 }, '改');
  out.v2 = v2.version;
  const snaps = await b.listSnapshots();
  out.snaps = snaps.map(({ id: _id, ...s }) => s);
  out.snapshot = (await b.getSnapshot(snaps[0].id)).data;
  out.restored = (await b.restoreSnapshot(snaps[0].id, 2)).version;
  out.restoreNoVersion = await statusOf(b.restoreSnapshot(snaps[0].id, 0));

  // 投票
  out.vote = await b.putVote(P, 'like');
  out.voteAgain = await b.putVote(P, 'dislike');
  out.badVote = await statusOf(b.putVote(P, 'love' as never));
  setMe('dev-b');
  await b.putVote(P, 'like');
  await b.deleteVote(P);
  setMe('dev-a');
  out.votes = (await b.listVotes()).map((v) => [v.memberId, v.value]);

  // 留言
  const c = await b.createComment({ target: P, text: '想早上去' });
  out.comment = c;
  out.commentDay = await b.createComment({ target: 'day:2027-02-05', text: '這天', kind: 'planner' });
  out.commentTrip = await b.createComment({ target: 'trip', text: '整趟' });
  setMe('dev-b');
  out.notMineEdit = await statusOf(b.updateComment(c.id, 'x'));
  out.notMineDelete = await statusOf(b.deleteComment(c.id));
  setMe('dev-a');
  out.emptyText = await statusOf(b.createComment({ target: P, text: ' ' }));
  out.longText = await statusOf(b.createComment({ target: P, text: 'あ'.repeat(501) }));
  out.okLongText = await statusOf(b.createComment({ target: P, text: 'あ'.repeat(500) }));
  out.badKind = await statusOf(b.createComment({ target: P, text: 'x', kind: 'nope' as never }));
  out.updated = await b.updateComment(c.id, '想下午去');
  await b.deleteComment(c.id);
  out.deletedAgain = await statusOf(b.deleteComment(c.id));
  out.comments = (await b.listComments()).map((x) => x.target);

  // 候選
  const cand = await b.createCandidate({ placeId: P, day: '2027-02-05' });
  out.candidate = cand;
  setMe('dev-b');
  out.candidateAgain = (await b.createCandidate({ placeId: P, day: '2027-02-05' })).addedBy;
  out.badDay = await statusOf(b.createCandidate({ placeId: P, day: '2027-03-01' }));
  out.noPlace = await statusOf(b.createCandidate({ placeId: '', day: '2027-02-05' }));
  await b.deleteCandidate(cand.id);
  setMe('dev-a');
  out.candidateGone = await statusOf(b.deleteCandidate(cand.id));
  out.candidates = await b.listCandidates();

  // 預約
  out.reservation = await b.putReservation({ date: '2027-02-05', placeId: P, status: 'booked', note: ' 已訂 ', nights: 2 });
  out.reservation2 = await b.putReservation({ date: '2027-02-05', placeId: P, status: 'pending', note: '  ' });
  out.badStatus = await statusOf(b.putReservation({ date: '2027-02-05', placeId: P, status: 'nope' as never }));
  out.badDate = await statusOf(b.putReservation({ date: '2/5', placeId: P, status: 'booked' }));
  out.longNote = await statusOf(b.putReservation({ date: '2027-02-05', placeId: P, status: 'booked', note: 'あ'.repeat(501) }));
  out.reservations = await b.listReservations();

  // 自己加的點
  const data = { name: { zh: '小店' }, coords: [136.84, 34.48] as [number, number], addedVia: 'map' as const };
  const u = await b.createUserPlace('spot', data);
  out.userPlaceKeys = Object.keys(u).sort();
  out.userPlaceType = u.type;
  out.badCoords = await statusOf(b.createUserPlace('spot', { ...data, coords: [999, 0] }));
  setMe('dev-b');
  const u2 = await b.updateUserPlace(u.id, { ...data, note: '週一休' }, 'restaurant');
  out.updatedUser = [u2.type, u2.updatedBy, u2.data.note];
  out.notMineDeletePlace = await statusOf(b.deleteUserPlace(u.id));
  setMe('dev-a');
  out.deletedUser = !!(await b.deleteUserPlace(u.id)).deletedAt;
  out.userPlaces = (await b.listUserPlaces()).length;

  // 修改紀錄
  const e = await b.createEdit({ placeId: P, fieldPath: 'stayMinutes', value: 90, note: '要久一點' }, { value: 60, missing: false });
  out.editKeys = Object.keys(e).filter((k) => !['closedImportId', 'closedReason'].includes(k)).sort();
  out.edit = [e.placeId, e.fieldPath, e.value, e.note, e.author];
  setMe('dev-b');
  out.notMineRevert = await statusOf(b.revertEdit(e.id));
  setMe('dev-a');
  out.reverted = (await b.revertEdit(e.id)).revertedBy;
  out.revertTwice = await statusOf(b.revertEdit(e.id));

  // 同步、啟動
  const s = await b.sync();
  out.syncKeys = (['itinerary', 'votes', 'comments', 'candidates', 'reservations', 'edits', 'userPlaces'] as const).map((k) => [k, typeof s[k]]);
  const boot = await b.bootstrap();
  out.boot = {
    me: boot.me.id,
    itinerary: boot.itinerary.version,
    snapshots: boot.snapshots.length,
    votes: boot.votes.length,
    comments: boot.comments.length,
    candidates: boot.candidates.length,
    reservations: boot.reservations.length,
    edits: boot.edits.length,
    userPlaces: boot.userPlaces.length,
  };
  return out;
}

test('apiBackend（真的 Worker）和假後端：同一份情境，結果一樣', async () => {
  const mock = createMockBackend(seed);
  const fromMock = shape(await scenario(mock, (id) => mock.setMe(id)));
  const fromApi = shape(
    await scenario(apiBackend, (id) => {
      member = id;
    }),
  );
  // Worker 的成員多了 source（me）：只比情境裡記下來的東西，所以逐項比，錯的時候看得出是哪一步
  for (const k of Object.keys(fromMock)) assert.deepEqual(fromApi[k], fromMock[k], k);
  assert.deepEqual(Object.keys(fromApi).sort(), Object.keys(fromMock).sort());
});

test('錯誤變成 BackendError：狀態、代碼、訊息；連不上是 network', async () => {
  const e = await apiBackend.putItinerary(5, createItinerary()).catch((x: unknown) => x);
  assert.ok(e instanceof BackendError);
  assert.equal(e.status, 409);
  assert.equal(e.code, 'version-conflict');
  const bad = await apiBackend.putItinerary(0, { days: ['x'] } as never).catch((x: unknown) => x as BackendError);
  assert.equal((bad as BackendError).status, 400);
  assert.ok(((bad as BackendError).details as string[]).length > 0);
  globalThis.fetch = (async () => {
    throw new TypeError('failed');
  }) as typeof fetch;
  const net = await apiBackend.sync().catch((x: unknown) => x as BackendError);
  assert.equal((net as BackendError).code, 'network');
});

test('讀回來的舊行程會升級（meal 轉 tags）', async () => {
  const it = createItinerary();
  it.days[1].items.push({ id: 'i-1', type: 'visit', options: [{ place: 'test-area-spot', stayMinutes: null, note: null }], selected: 0, start: null, travel: null, note: null, meal: 'lunch' } as never);
  d1.db.prepare("INSERT INTO members (line_user_id, display_name, source) VALUES ('dev-a', 'a', 'dev') ON CONFLICT DO NOTHING").run();
  d1.db.prepare("INSERT INTO itinerary (id, data, version, updated_by, updated_at) VALUES (1, ?, 1, 'dev-a', 't')").run(JSON.stringify(it));
  for (const doc of [await apiBackend.getItinerary(), (await apiBackend.bootstrap()).itinerary]) {
    const item = doc.data!.days[1].items[0] as { tags?: string[]; meal?: string };
    assert.deepEqual(item.tags, ['lunch']);
    assert.equal(item.meal, undefined);
  }
});

test('apiSource：資料點是清單層，已下架的標出來，詳情層分開讀', async () => {
  d1.db.prepare("UPDATE places_base SET retired_at = 'T' WHERE id = 'test-area-b'").run();
  const places = await apiSource.loadPlaces();
  const a = places.find((p) => p.id === 'test-area-spot')!;
  assert.equal(a.summary, null, '摘要在詳情層');
  assert.deepEqual(a.sources, []);
  assert.equal(places.find((p) => p.id === 'test-area-b')!.retiredAt, 'T');
  const details = await apiSource.loadPlaceDetails();
  assert.ok((details.find((d) => d.id === 'test-area-spot') as { sources?: unknown[] }).sources!.length > 0);
  assert.equal(DEFAULT_CONFIG.trip.from, '2027-02-02');
});
