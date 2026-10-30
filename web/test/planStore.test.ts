// buildEngineData 的重用（T29b spec §7.2）：引擎的快取認 EngineData 和它的陣列、函式，資料沒變就要給同一份
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineData, type RoadCache } from '../src/planStore.ts';
import type { DataState } from '../src/dataStore.ts';
import type { EngineTimetables } from '../src/data/source.ts';
import { itin, placeWith } from './helpers.ts';

const places = [placeWith({}, { id: 'st', type: 'station' }), placeWith({}, { id: 'r1' })].map((p) => ({ ...p, raw: { id: p.id, type: p.type, name: p.name, coords: p.coords } }));
const areas: DataState['areas'] = [];
const byId = new Map(places.map((p) => [p.id, p]));
const state = (over: Partial<DataState> = {}) => ({ places, byId, areas, itinerary: itin({ '2027-02-04': ['r1'] }), ...over }) as unknown as DataState;
const tt = { kintetsu: null, routes: [], urban: [], urbanTransfers: [] } as unknown as EngineTimetables;

function roads(): RoadCache & { bump(): void } {
  let version = 0;
  return {
    cachedMeters: () => null,
    cachedMinutes: () => null,
    get version() {
      return version;
    },
    bump: () => void version++,
  };
}

test('buildEngineData：資料點、地區、時刻表、道路快取都沒變（只有行程變了）→ 同一個 EngineData', () => {
  const r = roads();
  const a = buildEngineData(state(), tt, r);
  const b = buildEngineData(state({ itinerary: itin({ '2027-02-05': ['r1'] }) }), tt, r);
  assert.equal(a, b);
  assert.deepEqual(a.stations.map((s) => s.id), ['st']);
});

test('buildEngineData：道路快取有新路線 → 新的 EngineData，stations、getPlace 照舊', () => {
  const r = roads();
  const a = buildEngineData(state(), tt, r);
  r.bump();
  const b = buildEngineData(state(), tt, r);
  assert.notEqual(a, b);
  assert.equal(a.stations, b.stations);
  assert.equal(a.getPlace, b.getPlace);
});

test('buildEngineData：資料點變了 → 新的 stations、getPlace', () => {
  const r = roads();
  const a = buildEngineData(state(), tt, r);
  const b = buildEngineData(state({ places: [...places] }), tt, r);
  assert.notEqual(a, b);
  assert.notEqual(a.stations, b.stations);
  assert.notEqual(a.getPlace, b.getPlace);
});

test('buildEngineData：自己加的點刪除（places 沒變、byId 變了）→ 重建 getPlace，已刪除的標 retired', () => {
  const r = roads();
  const user = { ...places[1], id: 'user-0123456789ab', origin: 'user' as const, raw: { id: 'user-0123456789ab', type: 'spot', name: { ja: '' }, coords: [136.8, 34.5], area: null } };
  const live = state({ places: [...places, user] as DataState['places'], byId: new Map([...places, user].map((p) => [p.id, p])) as DataState['byId'] });
  const a = buildEngineData(live, tt, r);
  assert.equal(a.getPlace(user.id)?.origin, 'user');
  assert.equal(a.getPlace(user.id)?.retired, false);
  const gone = state({ places, byId: live.byId });
  const b = buildEngineData(gone, tt, r);
  assert.notEqual(a.getPlace, b.getPlace);
  assert.equal(b.getPlace(user.id)?.retired, true);
});
