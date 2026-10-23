// T15m：假後端的規則要和 T24 的 Worker 一樣（只有寫的人能改刪、version 衝突、快照、軟刪除）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockBackend, type MockSeed } from '../src/backend/mock.ts';
import { BackendError, isVersionConflict } from '../src/backend/types.ts';
import { itin } from './helpers.ts';

const SEED: MockSeed = {
  members: [
    { id: 'm-a', displayName: '阿公', pictureUrl: null },
    { id: 'm-b', displayName: '媽媽', pictureUrl: null },
  ],
  me: 'm-a',
  itinerary: itin({ '2027-02-03': ['x', 'y'] }),
};

let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 23, 0, 0, clock++)).toISOString();

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    assert.ok(e instanceof BackendError, String(e));
    return e.status;
  }
};

test('行程：version 對才能存，存之前自動存快照；舊的 version 回 409', async () => {
  const b = createMockBackend(SEED, { now });
  const doc = await b.getItinerary();
  assert.equal(doc.version, 1);
  const next = structuredClone(doc.data!);
  next.days[0].items.pop();
  const saved = await b.putItinerary(1, next, '刪掉 y');
  assert.equal(saved.version, 2);
  assert.equal(saved.updatedBy, 'm-a');
  const snaps = await b.listSnapshots();
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].version, 1);
  assert.equal(snaps[0].reason, '刪掉 y');

  await assert.rejects(b.putItinerary(1, next), (e) => isVersionConflict(e) && (e.details as { current: number }).current === 2);
});

test('快照復原：也是一次修改，會再存快照', async () => {
  const b = createMockBackend(SEED, { now });
  const doc = await b.getItinerary();
  const next = structuredClone(doc.data!);
  next.days[0].items = [];
  await b.putItinerary(1, next);
  const [snap] = await b.listSnapshots();
  const restored = await b.restoreSnapshot(snap.id, 2);
  assert.equal(restored.version, 3);
  assert.equal(restored.data!.days[0].items.length, 2);
  assert.equal((await b.listSnapshots()).length, 2);
});

test('建議：別人看得到、改不了、刪不掉；寫的人可以刪（軟刪除）', async () => {
  const b = createMockBackend(SEED, { now });
  const s = await b.createSuggestion({ day: '2027-02-03', text: '想去水族館', placeIds: ['x'] });
  assert.equal(s.author, 'm-a');
  assert.equal(s.status, 'pending');

  b.setMe('m-b');
  assert.equal((await b.listSuggestions()).length, 1);
  assert.equal(await status(b.updateSuggestion(s.id, { text: '改掉' })), 403);
  assert.equal(await status(b.deleteSuggestion(s.id)), 403);
  // 規劃的人可以標狀態
  const adopted = await b.setSuggestionStatus(s.id, { status: 'adopted', adoptedItemIds: ['i-1'] });
  assert.equal(adopted.statusBy, 'm-b');
  assert.deepEqual(adopted.adoptedItemIds, ['i-1']);

  b.setMe('m-a');
  await b.deleteSuggestion(s.id);
  assert.equal((await b.listSuggestions()).length, 0);
  assert.equal(await status(b.deleteSuggestion(s.id)), 404);
});

test('建議：day 要是日期或 trip，text 不能空', async () => {
  const b = createMockBackend(SEED, { now });
  assert.equal(await status(b.createSuggestion({ day: 'tomorrow', text: 'x' })), 400);
  assert.equal(await status(b.createSuggestion({ day: 'trip', text: '  ' })), 400);
  assert.equal(await status(b.createSuggestion({ day: 'trip', text: '想吃伊勢龍蝦' })), 200);
});

test('建議：標回待處理時清掉標的人和採用的項目', async () => {
  const b = createMockBackend(SEED, { now });
  const s = await b.createSuggestion({ day: 'trip', text: 'x' });
  await b.setSuggestionStatus(s.id, { status: 'declined', note: '排不下' });
  const back = await b.setSuggestionStatus(s.id, { status: 'pending' });
  assert.equal(back.statusNote, null);
  assert.equal(back.statusBy, null);
  assert.equal(back.adoptedItemIds, null);
});

test('投票：一人對一個點一筆，再投是取代，收回後不列出', async () => {
  const b = createMockBackend(SEED, { now });
  await b.putVote('x', 'like');
  await b.putVote('x', 'dislike', '太遠');
  b.setMe('m-b');
  await b.putVote('x', 'like');
  let votes = await b.listVotes();
  assert.equal(votes.length, 2);
  assert.deepEqual(votes.find((v) => v.memberId === 'm-a'), { placeId: 'x', memberId: 'm-a', value: 'dislike', note: '太遠', updatedAt: votes[0].updatedAt, deletedAt: null });
  await b.deleteVote('x');
  votes = await b.listVotes();
  assert.deepEqual(votes.map((v) => v.memberId), ['m-a']);
});

test('修改紀錄：只有改的人能復原', async () => {
  const b = createMockBackend(
    {
      ...SEED,
      edits: [{ placeId: 'x', fieldPath: 'closedNote', value: '週三公休', baseValue: null, baseMissing: true, note: null, author: 'm-b', createdAt: now() }],
    },
    { now },
  );
  const [e] = await b.listEdits();
  assert.equal(await status(b.revertEdit(e.id)), 403);
  b.setMe('m-b');
  const r = await b.revertEdit(e.id);
  assert.equal(r.revertedBy, 'm-b');
  assert.equal(await status(b.revertEdit(e.id)), 409);
});

test('回傳的是複本：改了不影響假資料庫', async () => {
  const b = createMockBackend(SEED, { now });
  const doc = await b.getItinerary();
  doc.data!.days[0].items = [];
  assert.equal((await b.getItinerary()).data!.days[0].items.length, 2);
});

test('存進 storage，重新建立時讀回來；reset 回到種子資料', async () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const b1 = createMockBackend(SEED, { now, storage });
  await b1.createSuggestion({ day: 'trip', text: '留著' });
  b1.setMe('m-b');
  const b2 = createMockBackend(SEED, { now, storage });
  assert.equal((await b2.listSuggestions()).length, 1);
  assert.equal(b2.currentMemberId(), 'm-b');
  b2.reset();
  assert.equal((await b2.listSuggestions()).length, 0);
  assert.equal(b2.currentMemberId(), 'm-b', 'reset 不換人');
});

test('simulateOtherEdit：version 加一，記成別人改的', async () => {
  const b = createMockBackend(SEED, { now });
  b.simulateOtherEdit();
  const doc = await b.getItinerary();
  assert.equal(doc.version, 2);
  assert.equal(doc.updatedBy, 'm-b');
});

test('sync：各種資料的版本', async () => {
  const b = createMockBackend(SEED, { now });
  const s1 = await b.sync();
  await b.createSuggestion({ day: 'trip', text: 'x' });
  const s2 = await b.sync();
  assert.equal(s1.itinerary, 1);
  assert.notEqual(s1.suggestions, s2.suggestions);
  assert.equal(s1.votes, s2.votes);
});
