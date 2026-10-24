// T15m：共用資料的動作（存檔、衝突退回、投票、留言、候選、修改紀錄合併）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { moveItem, removeItem } from '@travel-helper/engine';
import { createShared, voteCounts } from '../src/sharedStore.ts';
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

test('候選：加到某天、自己撤回；拿掉別人加的要寫理由，理由變成那個點的不採用留言', async () => {
  const { backend, shared } = await setup();
  assert.ok((await shared.addCandidate('x', '2027-02-05')).ok);
  assert.ok((await shared.addCandidate('y', '2027-02-05')).ok);
  const [cx, cy] = shared.store.getState().candidates;
  assert.ok((await shared.removeCandidate(cx.id)).ok);
  assert.deepEqual(shared.store.getState().candidates.map((c) => c.placeId), ['y']);
  backend.setMe('m-b');
  await shared.reloadMe();
  assert.equal((await shared.removeCandidate(cy.id)).ok, false, '別人加的沒寫理由不能拿掉');
  assert.ok((await shared.removeCandidate(cy.id, '這天排不下')).ok);
  assert.equal(shared.store.getState().candidates.length, 0);
  const c = shared.store.getState().comments[0];
  assert.equal(c.kind, 'decline');
  assert.equal(c.target, 'y');
  assert.ok(c.text.includes('2/5'));
  assert.match(c.text, /這天排不下/);
});

test('留言：新增、改、刪；只有作者能刪', async () => {
  const { backend, shared } = await setup();
  assert.ok((await shared.comment('x', '想早上去')).ok);
  const id = shared.store.getState().comments[0].id;
  assert.ok((await shared.editComment(id, '想早上去，人少')).ok);
  assert.equal(shared.store.getState().comments[0].text, '想早上去，人少');
  backend.setMe('m-b');
  await shared.reloadMe();
  assert.equal((await shared.deleteComment(id)).ok, false);
  backend.setMe('m-a');
  await shared.reloadMe();
  assert.ok((await shared.deleteComment(id)).ok);
  assert.equal(shared.store.getState().comments.length, 0);
});

test('投票：取代自己的票、收回；計數', async () => {
  const { shared } = await setup();
  await shared.vote('x', 'like');
  assert.equal(shared.store.getState().votes[0].value, 'like');
  await shared.vote('x', 'dislike');
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

test('預約筆記：先改畫面，後端丟錯時退回', async () => {
  const { backend, shared } = await setup();
  const input = { date: '2027-02-03', placeId: 'x', status: 'booked' as const, note: '電話訂好' };
  const pending = shared.setReservation(input);
  assert.equal(shared.store.getState().reservations[0]?.status, 'booked', '樂觀更新');
  const ok = await pending;
  assert.ok(ok.ok);
  assert.equal(shared.store.getState().reservations.length, 1);
  assert.equal(shared.store.getState().reservations[0].updatedBy, 'm-a');

  const real = backend.putReservation;
  backend.putReservation = async () => {
    throw new Error('壞了');
  };
  const failing = shared.setReservation({ ...input, status: 'skip' });
  assert.equal(shared.store.getState().reservations[0].status, 'skip');
  const bad = await failing;
  assert.equal(bad.ok, false);
  assert.equal(shared.store.getState().reservations.length, 1);
  assert.equal(shared.store.getState().reservations[0].status, 'booked', '退回原本的');
  backend.putReservation = real;
});

test('預約筆記：同步時別人改的會抓進來', async () => {
  const { backend, shared } = await setup();
  backend.setMe('m-b');
  await backend.putReservation({ date: '2027-02-03', placeId: 'y', status: 'booked' });
  backend.setMe('m-a');
  await shared.syncOnce();
  assert.equal(shared.store.getState().reservations.length, 1);
});

test('changeItinerary 的復原：回到改之前的行程、跑 after', async () => {
  const { data, shared } = await setup();
  const before = data.getState().itinerary;
  let afterCalls = 0;
  const after = async () => {
    afterCalls++;
  };
  const r = await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '合併', { undo: { text: '已合併到 A', after } });
  assert.ok(r.ok);
  const t = shared.store.getState().toast;
  assert.equal(t?.text, '已合併到 A');
  assert.equal(t?.action?.label, '復原');
  assert.notDeepEqual(data.getState().itinerary, before);
  await t!.action!.run();
  assert.deepEqual(data.getState().itinerary, before);
  assert.equal(afterCalls, 1);
});

test('changeItinerary 的復原：after 失敗時行程照樣復原、顯示錯誤提示', async () => {
  const { data, shared } = await setup();
  const before = data.getState().itinerary;
  const after = async () => {
    throw new Error('候選加不回去');
  };
  await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '合併', { undo: { text: '已合併', after } });
  await shared.store.getState().toast!.action!.run();
  assert.deepEqual(data.getState().itinerary, before);
  assert.equal(shared.store.getState().toast?.kind, 'error');
  assert.match(shared.store.getState().toast!.text, /候選加不回去/);
});

test('changeItinerary 的 settle：做完才跳「復原」；馬上按復原，候選加得回去', async () => {
  const { data, shared } = await setup();
  const before = data.getState().itinerary;
  const added = await shared.addCandidate('x', '2027-02-04');
  assert.ok(added.ok);
  const candidateId = added.value.id;
  const has = () => shared.store.getState().candidates.some((c) => c.placeId === 'x' && c.day === '2027-02-04');
  let toastDuringSettle: unknown = 'unset';
  // 照候選拖進時間軸的做法：settle 拿掉候選，復原的 after 沒有就加回去
  const settle = async () => {
    toastDuringSettle = shared.store.getState().toast?.action;
    await shared.removeCandidate(candidateId, undefined, true);
  };
  const after = async () => {
    if (!has()) await shared.addCandidate('x', '2027-02-04');
  };
  const r = await shared.changeItinerary((it) => removeItem(it, '2027-02-03:y'), '排進', { undo: { text: '已排進 x', after }, settle });
  assert.ok(r.ok);
  assert.equal(toastDuringSettle, undefined, 'settle 做的時候還沒有「復原」');
  assert.equal(has(), false);
  await shared.store.getState().toast!.action!.run();
  assert.deepEqual(data.getState().itinerary, before);
  assert.equal(has(), true);
});

test('changeItinerary 的復原：行程之後又被改過就不復原，顯示錯誤提示', async () => {
  const { data, shared } = await setup();
  await shared.changeItinerary((it) => removeItem(it, '2027-02-03:x'), '刪 x', { undo: { text: '已刪 x' } });
  const undo = shared.store.getState().toast!.action!;
  await shared.changeItinerary((it) => removeItem(it, '2027-02-03:y'), '刪 y');
  const now = data.getState().itinerary;
  await undo.run();
  assert.equal(data.getState().itinerary, now, '不能蓋掉後來的修改');
  assert.equal(shared.store.getState().toast?.kind, 'error');
  assert.equal(shared.store.getState().toast?.text, '行程已經被改過，不能復原');
});
