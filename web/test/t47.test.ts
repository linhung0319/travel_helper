// T47：第一次載入瘦身。詳情層用到才讀那幾個點（同一輪併成一個請求）；時刻表等行程有東西或打開行程才讀。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { createDetailsLoader, type DataState } from '../src/dataStore.ts';
import { currentEngineData, hasContent, requestPlan, startPlanner, type PlanState } from '../src/planStore.ts';
import { createReadTools } from '../src/ai/readTools.ts';
import { resolveConfig } from '@travel-helper/engine';
import { harness } from './aiHarness.ts';

const tick = () => new Promise((r) => setTimeout(r, 5));

function dataWith(ids: string[], userIds: string[] = []) {
  const byId = new Map<string, unknown>([...ids.map((id) => [id, { id, origin: 'base' }] as const), ...userIds.map((id) => [id, { id, origin: 'user' }] as const)]);
  return createStore<DataState>()(() => ({ byId, details: null, detailsError: null }) as unknown as DataState);
}

test('詳情層：同一輪要的點併成一個請求，讀過的不再讀；自己加的點、不認得的 ID 不讀', async () => {
  const store = dataWith(['a', 'b', 'c'], ['u1']);
  const calls: (readonly string[] | undefined)[] = [];
  const ensure = createDetailsLoader(store, async (ids) => {
    calls.push(ids);
    return (ids ?? []).filter((id) => id !== 'c').map((id) => ({ id, summary: id }));
  });
  await Promise.all([ensure(['a']), ensure(['b', 'u1', 'zzz']), ensure(['a', 'c'])]);
  assert.deepEqual(calls, [['a', 'b', 'c']], '三次併成一個請求，a 不重複');
  const d = store.getState().details!;
  assert.deepEqual(d.get('a'), { id: 'a', summary: 'a' });
  assert.deepEqual(d.get('c'), {}, '資料庫沒有的記成空的，畫面不會一直等');
  assert.equal(d.has('u1'), false);
  await ensure(['a', 'b']);
  assert.equal(calls.length, 1, '讀過的不再讀');
  await ensure(['b', 'd'].filter((x) => x !== 'd'));
  assert.equal(calls.length, 1);
});

test('詳情層：讀不到時 reject、記下原因，下次再試；不給 ids 讀全部，之後都不用再讀', async () => {
  const store = dataWith(['a', 'b']);
  let fail = true;
  const calls: (readonly string[] | undefined)[] = [];
  const ensure = createDetailsLoader(store, async (ids) => {
    calls.push(ids);
    if (fail) throw new Error('網路');
    return (ids ?? ['a', 'b']).map((id) => ({ id }));
  });
  await assert.rejects(ensure(['a']));
  assert.equal(store.getState().detailsError, '網路');
  fail = false;
  await ensure(['a']);
  assert.equal(store.getState().detailsError, null);
  assert.deepEqual(calls, [['a'], ['a']]);
  await ensure();
  assert.equal(calls.at(-1), undefined, '全部');
  await ensure(['b']);
  assert.equal(calls.length, 3, '讀過全部就不再讀');
});

test('時刻表：行程是空的不讀；排了東西才讀（延後）；打開行程馬上讀', async () => {
  assert.equal(hasContent(null), false);
  assert.equal(hasContent({ nights: {}, days: [{ date: 'x', items: [] }] } as never), false);
  assert.equal(hasContent({ nights: { x: { lodging: 'h' } }, days: [{ date: 'x', items: [] }] } as never), true);
  assert.equal(hasContent({ nights: { x: { area: 'toba' } }, days: [{ date: 'x', items: [] }] } as never), false, '只定了區不算');
  assert.equal(hasContent({ nights: {}, days: [{ date: 'x', items: [{ type: 'flight' }] }] } as never), false, '只有航班（新行程的預設）不算');
  assert.equal(hasContent({ nights: {}, days: [{ date: 'x', items: [{ type: 'flight' }, { type: 'visit' }] }] } as never), true);

  const data = createStore<any>()(() => ({ status: 'ready', itinerary: { nights: {}, days: [{ date: 'x', items: [] }] }, places: [] }));
  const plan = createStore<PlanState>()(() => ({ status: 'loading', error: null, plan: null }));
  let loads = 0;
  const deferred: (() => void)[] = [];
  const source = { loadEngineTimetables: () => { loads += 1; return new Promise<never>(() => {}); } } as never;
  const off = startPlanner(data, source, undefined, plan, { defer: (fn) => deferred.push(fn) });
  await tick();
  assert.equal(deferred.length, 0, '行程是空的：不排');
  data.setState({ itinerary: { nights: { x: { lodging: 'h' } }, days: [{ date: 'x', items: [] }] } });
  assert.equal(deferred.length, 1, '排了住宿：延後讀');
  assert.equal(loads, 0);
  requestPlan();
  assert.equal(loads, 1, '打開行程：馬上讀');
  deferred[0]();
  assert.equal(loads, 1, '不重複讀');
  off();
});

test('AI 搜尋：只讀回傳那幾個點的詳情；maxGuestsAtLeast 也是（T57 起 maxGuests 在清單層）', async () => {
  const h = await harness();
  const asked: string[][] = [];
  const read = createReadTools({ app: h.app, data: h.data, plan: h.plan, shared: h.shared, commands: h.commands, engine: currentEngineData, config: resolveConfig(), source: { loadTimetable: async () => null, loadTripInfo: async () => null }, details: async (ids) => void asked.push([...ids]) });
  const r = (await read.search_places({ areas: ['ise'], types: ['spot'], limit: 5 })) as unknown as { places: { id: string }[] };
  assert.deepEqual(asked, [r.places.map((p) => p.id)]);
  asked.length = 0;
  const big = (await read.search_places({ areas: ['ise'], wholeRental: true, maxGuestsAtLeast: 15, limit: 30 })) as unknown as { places: { id: string }[] };
  assert.deepEqual(asked, [big.places.map((p) => p.id)]);
  h.close();
});
