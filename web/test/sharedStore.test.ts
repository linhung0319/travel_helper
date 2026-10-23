// T15m：共用資料的動作（存檔、衝突退回、採用建議、投票、修改紀錄合併）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { moveItem, removeItem } from '@travel-helper/engine';
import { createShared, voteCounts, suggestionCounts, pendingCount } from '../src/sharedStore.ts';
import { createMockBackend, type MockSeed } from '../src/backend/mock.ts';
import type { DataState } from '../src/dataStore.ts';
import { normalizePlace } from '../src/data/normalize.ts';
import type { Place } from '../src/data/types.ts';
import { itin } from './helpers.ts';

const place = (id: string, over: Record<string, unknown> = {}): Place =>
  normalizePlace({ id, type: 'restaurant', name: { ja: id }, area: 'toba', coords: [136.8, 34.5], sources: [], ...over })!;

const PLACES = [place('x', { closedNote: '週二公休', group: { fit15: 'split', seats: 30 } }), place('y')];

const SEED: MockSeed = {
  members: [
    { id: 'm-a', displayName: '阿公', pictureUrl: null },
    { id: 'm-b', displayName: '媽媽', pictureUrl: null },
  ],
  me: 'm-a',
  itinerary: itin({ '2027-02-03': ['x', 'y'] }),
  edits: [
    { placeId: 'x', fieldPath: 'group.fit15', value: 'yes', baseValue: 'split', baseMissing: false, note: null, author: 'm-b', createdAt: '2026-10-20T00:00:00.000Z' },
  ],
};

async function setup() {
  const backend = createMockBackend(SEED);
  const data = createStore<DataState>()(() => ({
    status: 'ready',
    error: null,
    areas: [],
    basePlaces: PLACES,
    places: PLACES,
    byId: new Map(PLACES.map((p) => [p.id, p])),
    itinerary: null,
    days: new Map(),
    stationNames: new Map(),
  }));
  const shared = createShared(() => backend, data);
  await shared.load();
  return { backend, data, shared };
}

test('載入：行程放進 dataStore，修改合併進資料點、標出誰改的', async () => {
  const { data, shared } = await setup();
  assert.equal(shared.store.getState().version, 1);
  assert.equal(data.getState().days.get('y')?.[0].order, 2);
  const x = data.getState().byId.get('x')!;
  assert.equal((x.raw.group as { fit15: string }).fit15, 'yes');
  assert.equal((x.raw.group as { seats: number }).seats, 30, '只改 group.fit15，其他欄位留著');
  assert.equal(x.edited['group.fit15'].author, 'm-b');
  assert.equal(x.edited['group.fit15'].baseValue, 'split');
  assert.equal(data.getState().byId.get('y')!.edited['group.fit15'], undefined);
});

test('改行程：存檔後 version 加一、有快照', async () => {
  const { data, shared } = await setup();
  const r = await shared.changeItinerary((it) => moveItem(it, '2027-02-03:y', 'up'), '上移 y');
  assert.ok(r.ok);
  assert.equal(shared.store.getState().version, 2);
  assert.equal(data.getState().days.get('y')?.[0].order, 1);
  assert.equal(shared.store.getState().snapshots.length, 1);
  assert.equal(shared.store.getState().toast?.kind, 'ok');
});

test('別人改過了：退回原本的行程、標出衝突，重新載入後才能再改', async () => {
  const { backend, data, shared } = await setup();
  backend.simulateOtherEdit();
  const before = data.getState().itinerary;
  const r = await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '刪掉 x');
  assert.equal(r.ok, false);
  assert.equal(data.getState().itinerary, before, '退回原本那份');
  assert.ok(shared.store.getState().conflict);
  const again = await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '刪掉 x');
  assert.equal(again.ok, false);

  await shared.reloadItinerary();
  assert.equal(shared.store.getState().conflict, null);
  assert.equal(shared.store.getState().version, 2);
  assert.ok((await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '刪掉 x')).ok);
});

test('引擎的操作出錯（ItineraryError）：不存檔、提示錯誤', async () => {
  const { shared } = await setup();
  const r = await shared.changeItinerary((it) => removeItem(it, 'nope'), '刪掉不存在的');
  assert.equal(r.ok, false);
  assert.equal(shared.store.getState().version, 1);
  assert.equal(shared.store.getState().toast?.kind, 'error');
});

test('復原快照：回到原狀', async () => {
  const { data, shared } = await setup();
  await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '刪掉 x');
  assert.equal(data.getState().days.has('x'), false);
  const [snap] = shared.store.getState().snapshots;
  assert.ok((await shared.restoreSnapshot(snap.id)).ok);
  assert.equal(data.getState().days.get('x')?.[0].order, 1);
  assert.equal(shared.store.getState().version, 3);
});

test('採用建議：行程項目記下誰提的，建議標成已採用', async () => {
  const { backend, data, shared } = await setup();
  backend.setMe('m-b');
  await shared.reloadMe();
  const r = await shared.createSuggestion({ day: '2027-02-03', text: '想吃 y', placeIds: ['y'] });
  assert.ok(r.ok);
  backend.setMe('m-a');
  await shared.reloadMe();
  const sg = shared.store.getState().suggestions[0];
  assert.ok((await shared.adoptSuggestion(sg, ['2027-02-03:y'])).ok);
  const item = data.getState().itinerary!.days[0].items[1];
  assert.deepEqual(item.type === 'visit' && item.proposedBy, ['m-b']);
  const after = shared.store.getState().suggestions[0];
  assert.equal(after.status, 'adopted');
  assert.equal(after.statusBy, 'm-a');
  assert.equal(pendingCount(shared.store.getState().suggestions), 0);
});

test('別人的建議：刪不掉，清單不變', async () => {
  const { backend, shared } = await setup();
  await shared.createSuggestion({ day: 'trip', text: '阿公的建議' });
  backend.setMe('m-b');
  await shared.reloadMe();
  const r = await shared.deleteSuggestion(shared.store.getState().suggestions[0].id);
  assert.equal(r.ok, false);
  assert.equal(shared.store.getState().suggestions.length, 1);
});

test('投票：取代自己的票、收回；計數', async () => {
  const { shared } = await setup();
  await shared.vote('x', 'like');
  await shared.vote('x', 'dislike', '太遠');
  assert.deepEqual(voteCounts(shared.store.getState().votes).get('x'), { like: 0, dislike: 1 });
  await shared.vote('x', null);
  assert.equal(voteCounts(shared.store.getState().votes).get('x'), undefined);
});

test('復原修改：資料點回到預設值、不再標已修改', async () => {
  const { backend, data, shared } = await setup();
  backend.setMe('m-b');
  await shared.reloadMe();
  const id = shared.store.getState().edits[0].id;
  assert.ok((await shared.revertEdit(id)).ok);
  const x = data.getState().byId.get('x')!;
  assert.equal((x.raw.group as { fit15: string }).fit15, 'split');
  assert.deepEqual(x.edited, {});
});

test('同步：別人改了行程就換上新的', async () => {
  const { backend, shared } = await setup();
  backend.simulateOtherEdit();
  await shared.syncOnce();
  assert.equal(shared.store.getState().version, 2);
  assert.equal(shared.store.getState().updatedBy, 'm-b');
});

test('suggestionCounts：每個點幾則', () => {
  const c = suggestionCounts([{ placeIds: ['a', 'b'] }, { placeIds: ['a'] }] as never);
  assert.deepEqual([...c], [
    ['a', 2],
    ['b', 1],
  ]);
});
