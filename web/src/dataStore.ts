// 讀進來的資料（區域、資料點、行程）。和 UI 狀態（store.ts）分開：資料只在載入時改。

import { createStore } from 'zustand/vanilla';
import { dataSource } from './data/index.ts';
import type { Area, Place } from './data/types.ts';
import type { Itinerary } from '@travel-helper/engine/types';
import { placeDays } from './lib/itinerary.ts';
import { loadFakeItinerary } from './dev-fixtures/fakeItinerary.ts';

export interface DataState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  areas: Area[];
  places: Place[];
  byId: Map<string, Place>;
  /** 確定的行程（itinerary-v1）。T11、T12 是開發用的假行程，T15 換成 API */
  itinerary: Itinerary | null;
  /** 資料點 → 排在哪幾天 */
  days: Map<string, { date: string; order: number }[]>;
  /** 車站 ID → 顯示名稱（時刻表的終點用） */
  stationNames: Map<string, string>;
}

export const dataStore = createStore<DataState>()(() => ({
  status: 'loading',
  error: null,
  areas: [],
  places: [],
  byId: new Map(),
  itinerary: null,
  days: new Map(),
  stationNames: new Map(),
}));

export async function loadData() {
  try {
    const [areas, places, itinerary] = await Promise.all([dataSource.loadAreas(), dataSource.loadPlaces(), loadFakeItinerary()]);
    dataStore.setState({
      status: 'ready',
      areas,
      places,
      byId: new Map(places.map((p) => [p.id, p])),
      itinerary,
      days: placeDays(itinerary),
      stationNames: new Map(places.filter((p) => p.type === 'station').map((p) => [p.id, p.name.zh || p.name.ja])),
    });
  } catch (e) {
    dataStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
