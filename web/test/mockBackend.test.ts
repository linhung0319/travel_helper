// T15m：假後端的規則（只有寫的人能改刪、version 衝突、快照、軟刪除）。投票、留言、候選的規則 T15 要同步到 Worker。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockBackend, type MockSeed } from '../src/backend/mock.ts';
import { BackendError, isVersionConflict, dayTarget, TRIP_TARGET } from '../src/backend/types.ts';
import { itin } from './helpers.ts';
import fs from 'node:fs';
import { seedItinerary } from '../src/dev-fixtures/seed.ts';

test('種子行程沒有車站的資料卡（T29c §8.10），第一天和 2/5 換成附近的景點', () => {
  const stations = new Set((JSON.parse(fs.readFileSync(new URL('../../data/stations.json', import.meta.url), 'utf8').replace(/^﻿/, '')) as { id: string }[]).map((s) => s.id));
  const places: string[] = [];
  const walk = (items: ReturnType<typeof seedItinerary>['days'][number]['items']) => {
    for (const it of items) {
      if (it.type === 'visit') places.push(...it.options.map((o) => o.place));
      if (it.type === 'split') for (const g of it.groups) walk(g.items);
    }
  };
  for (const d of seedItinerary().days) walk(d.items);
  assert.ok(places.length > 10);
  assert.deepEqual(places.filter((p) => stations.has(p)), []);
});

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

test('投票：一人一點只有一個狀態，先 👎 再 ❤️ 變成 ❤️；收回後不列出', async () => {
  const b = createMockBackend(SEED, { now });
  await b.putVote('x', 'dislike');
  await b.putVote('x', 'like');
  b.setMe('m-b');
  await b.putVote('x', 'like');
  let votes = await b.listVotes();
  assert.equal(votes.length, 2);
  assert.deepEqual(votes.find((v) => v.memberId === 'm-a'), { placeId: 'x', memberId: 'm-a', value: 'like', updatedAt: votes[0].updatedAt, deletedAt: null });
  await b.deleteVote('x');
  votes = await b.listVotes();
  assert.deepEqual(votes.map((v) => v.memberId), ['m-a']);
});

test('候選：加到某天；同一天同一個點只有一筆；日期要在旅程裡；誰都能拿掉', async () => {
  const b = createMockBackend(SEED, { now });
  const c = await b.createCandidate({ placeId: 'x', day: '2027-02-05' });
  assert.equal(c.addedBy, 'm-a');
  assert.equal((await b.createCandidate({ placeId: 'x', day: '2027-02-05' })).id, c.id);
  await b.createCandidate({ placeId: 'x', day: '2027-02-06' });
  assert.equal(await status(b.createCandidate({ placeId: 'x', day: '2027-03-01' })), 400);
  assert.equal(await status(b.createCandidate({ placeId: '', day: '2027-02-05' })), 400);
  b.setMe('m-b');
  await b.deleteCandidate(c.id);
  assert.deepEqual((await b.listCandidates()).map((x) => x.day), ['2027-02-06']);
  assert.equal(await status(b.deleteCandidate(c.id)), 404);
  // 拿掉後可以再加
  assert.notEqual((await b.createCandidate({ placeId: 'x', day: '2027-02-05' })).id, c.id);
});

test('留言：大家都能留，只有作者能改、能刪（軟刪除）；文字不能空', async () => {
  const b = createMockBackend(SEED, { now });
  const c = await b.createComment({ target: 'x', text: '想早上去' });
  assert.equal(c.author, 'm-a');
  assert.equal(c.kind, 'normal');
  b.setMe('m-b');
  assert.equal((await b.listComments()).length, 1);
  assert.equal(await status(b.updateComment(c.id, '改掉')), 403);
  assert.equal(await status(b.deleteComment(c.id)), 403);
  const d = await b.createComment({ target: 'x', text: '這天排不下', kind: 'decline' });
  assert.equal(d.kind, 'decline');
  assert.equal(await status(b.createComment({ target: 'x', text: '  ' })), 400);
  b.setMe('m-a');
  assert.equal((await b.updateComment(c.id, '想早上去，人少')).text, '想早上去，人少');
  await b.deleteComment(c.id);
  assert.deepEqual((await b.listComments()).map((x) => x.id), [d.id]);
  assert.equal(await status(b.deleteComment(c.id)), 404);
});

test('這天的留言：target 是 day:<日期>', async () => {
  const b = createMockBackend(SEED, { now });
  const c = await b.createComment({ target: dayTarget('2027-02-05'), text: '這天想輕鬆一點' });
  assert.equal(c.target, 'day:2027-02-05');
});

test('預約筆記：同一個 (日期, 點) 覆蓋，記下是誰改的', async () => {
  const b = createMockBackend(SEED, { now });
  await b.putReservation({ date: '2027-02-05', placeId: 'x', status: 'booked', note: '電話訂好', nights: 2 });
  b.setMe('m-b');
  const r = await b.putReservation({ date: '2027-02-05', placeId: 'x', status: 'skip' });
  await b.putReservation({ date: '2027-02-06', placeId: 'x', status: 'pending' });
  assert.equal(r.updatedBy, 'm-b');
  const all = await b.listReservations();
  assert.equal(all.length, 2);
  const x = all.find((y) => y.date === '2027-02-05')!;
  assert.deepEqual([x.status, x.note, x.nights, x.updatedBy], ['skip', null, null, 'm-b']);
  assert.equal(await status(b.putReservation({ date: '2027-02-05', placeId: 'x', status: 'nope' as never })), 400);
  assert.equal(await status(b.putReservation({ date: '壞', placeId: 'x', status: 'booked' })), 400);
});

test('整趟的留言：target 是 trip', async () => {
  const b = createMockBackend(SEED, { now });
  const c = await b.createComment({ target: TRIP_TARGET, text: '整趟都要小心感冒' });
  assert.equal(c.target, 'trip');
  assert.equal((await b.listComments()).length, 1);
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
  await b1.createCandidate({ placeId: 'x', day: '2027-02-05' });
  b1.setMe('m-b');
  const b2 = createMockBackend(SEED, { now, storage });
  assert.equal((await b2.listCandidates()).length, 1);
  assert.equal(b2.currentMemberId(), 'm-b');
  b2.reset();
  assert.equal((await b2.listCandidates()).length, 0);
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
  await b.createComment({ target: 'x', text: 'x' });
  const s2 = await b.sync();
  assert.equal(s1.itinerary, 1);
  assert.notEqual(s1.comments, s2.comments);
  assert.equal(s1.candidates, s2.candidates);
  await b.createCandidate({ placeId: 'x', day: '2027-02-05' });
  assert.notEqual(s2.candidates, (await b.sync()).candidates);
  assert.equal(s1.votes, s2.votes);
  const s3 = await b.sync();
  await b.putReservation({ date: '2027-02-05', placeId: 'x', status: 'booked' });
  assert.notEqual(s3.reservations, (await b.sync()).reservations);
});

test('讀 storage：舊格式（meal、dining）的行程和快照轉成 tags', async () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const b1 = createMockBackend(SEED, { now, storage });
  await b1.putItinerary(1, (await b1.getItinerary()).data!, '存一次，留一份快照');
  // 把存檔改成舊格式：visit 有 meal、dining，沒有 tags
  const key = [...mem.keys()][0];
  const st = JSON.parse(mem.get(key)!);
  const old = (it: { days: { items: Record<string, unknown>[] }[] }) => {
    const v = it.days[0].items[0];
    delete v.tags;
    v.meal = 'lunch';
    v.dining = 'separate';
  };
  old(st.itinerary.data);
  old(st.snapshots[0].data);
  mem.set(key, JSON.stringify(st));
  const b2 = createMockBackend(SEED, { now, storage });
  const v = (await b2.getItinerary()).data!.days[0].items[0] as unknown as Record<string, unknown>;
  assert.deepEqual(v.tags, ['lunch', 'groups']);
  assert.equal(v.meal, undefined);
  assert.equal(v.dining, undefined);
  const [meta] = await b2.listSnapshots();
  const snap = (await b2.getSnapshot(meta.id)).data.days[0].items[0] as unknown as Record<string, unknown>;
  assert.deepEqual(snap.tags, ['lunch', 'groups']);
  assert.equal(snap.meal, undefined);
});
