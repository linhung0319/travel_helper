// 讀進來的資料（區域、資料點、行程）。和 UI 狀態（store.ts）分開。
// 資料點：預設資料（basePlaces）套上修改層（appShared.ts 的 edits）就是 places；行程從後端來（backend/）。

import { createStore } from 'zustand/vanilla';
import { dataSource } from './data/index.ts';
import type { Area, Place } from './data/types.ts';
import type { Itinerary } from '@travel-helper/engine/types';

export interface DataState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  areas: Area[];
  /** 預設資料（還沒套修改） */
  basePlaces: Place[];
  /** 合併後的資料點：畫面都用這一份 */
  places: Place[];
  byId: Map<string, Place>;
  /** 確定的行程（itinerary-v1）；從後端讀（T15m 是假後端） */
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
  basePlaces: [],
  places: [],
  byId: new Map(),
  itinerary: null,
  days: new Map(),
  stationNames: new Map(),
}));

export async function loadData() {
  try {
    const [areas, places] = await Promise.all([dataSource.loadAreas(), dataSource.loadPlaces()]);
    dataStore.setState({
      areas,
      basePlaces: places,
      places,
      byId: new Map(places.map((p) => [p.id, p])),
      stationNames: new Map(places.filter((p) => p.type === 'station').map((p) => [p.id, p.name.zh || p.name.ja])),
    });
    // 行程、修改紀錄從後端來；讀完才算好（地圖一開始就要畫行程）
    const { loadShared } = await import('./appShared.ts');
    await loadShared();
    dataStore.setState({ status: 'ready' });
  } catch (e) {
    dataStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
