// 讀進來的資料（區域、資料點、行程）。和 UI 狀態（store.ts）分開。
// 資料點：預設資料（basePlaces，清單層）套上修改層（appShared.ts 的 edits）就是 places；行程從後端來（backend/）。
// 詳情層閒置時才讀（ensureDetails），放在 details，不換 places：不然詳情一到，行程要整份重算、清單要全部重畫。要完整欄位用 fullPlace。

import { createStore } from 'zustand/vanilla';
import { dataSource } from './data/index.ts';
import { mergePlaceEdits } from './data/merge.ts';
import { normalizePlace } from './data/normalize.ts';
import type { PlaceEdit } from './backend/types.ts';
import type { Area, Place } from './data/types.ts';
import type { Itinerary } from '@travel-helper/engine/types';

export interface DataState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  areas: Area[];
  /** 預設資料（清單層，還沒套修改） */
  basePlaces: Place[];
  /** 合併後的資料點（清單層，沒有下架的）：地圖、清單、引擎用這一份 */
  places: Place[];
  /** 也含已下架、已刪除的（行程裡那一格還要顯示名稱、警告） */
  byId: Map<string, Place>;
  /** 詳情層：還沒讀到是 null */
  details: Map<string, Record<string, unknown>> | null;
  /** 詳情層讀不到的原因（畫面顯示重試） */
  detailsError: string | null;
  /** 修改紀錄：fullPlace 要在詳情層上再套一次 */
  placeEdits: PlaceEdit[];
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
  details: null,
  detailsError: null,
  placeEdits: [],
  itinerary: null,
  days: new Map(),
  stationNames: new Map(),
}));

/** 已下架的不在 places；沒有下架的就回傳同一個陣列（React、引擎的快取看物件是不是同一個） */
export const livePlaces = (list: Place[]): Place[] => (list.some((p) => p.retiredAt) ? list.filter((p) => !p.retiredAt) : list);

const fullMemo = new WeakMap<Place, { details: DataState['details']; full: Place }>();

/**
 * 一個點的完整資料：清單層加詳情層，再套修改（規則和 Worker 一樣）。詳情層還沒到（或是自己加的點）回傳清單層那一份。
 * 沒有這個點回傳 null。
 */
export function fullPlace(s: Pick<DataState, 'byId' | 'basePlaces' | 'details' | 'placeEdits'>, id: string): Place | null {
  const p = s.byId.get(id);
  if (!p) return null;
  const detail = s.details?.get(id);
  if (p.origin === 'user' || !detail) return p;
  const memo = fullMemo.get(p);
  if (memo && memo.details === s.details) return memo.full;
  const base = s.basePlaces.find((x) => x.id === id);
  const seed = normalizePlace({ ...(base?.raw ?? p.raw), ...detail });
  if (!seed) return p;
  const [merged] = mergePlaceEdits([seed], s.placeEdits);
  const full: Place = { ...merged, retiredAt: p.retiredAt };
  fullMemo.set(p, { details: s.details, full });
  return full;
}

let detailsLoading: Promise<void> | null = null;

/** 讀詳情層（一次）；讀不到時 reject，下次呼叫再試 */
export function ensureDetails(): Promise<void> {
  if (dataStore.getState().details) return Promise.resolve();
  detailsLoading ??= dataSource
    .loadPlaceDetails()
    .then((list) => {
      dataStore.setState({ details: new Map(list.map((d) => [d.id, d])), detailsError: null });
    })
    .catch((e: unknown) => {
      detailsLoading = null;
      dataStore.setState({ detailsError: e instanceof Error ? e.message : String(e) });
      throw e;
    });
  return detailsLoading;
}

/** 閒置時讀詳情層；Safari 沒有 requestIdleCallback，等一下再讀。使用者先打開詳情就會馬上讀（useFullPlace） */
function scheduleDetails() {
  const go = () => void ensureDetails().catch(() => {});
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1500);
}

export async function loadData() {
  try {
    // 共用資料和資料點同時開始讀，不是讀完一個才讀另一個
    const { startLoadShared } = await import('./appShared.ts');
    const pending = startLoadShared();
    pending.catch(() => {});
    const [areas, places] = await Promise.all([dataSource.loadAreas(), dataSource.loadPlaces()]);
    dataStore.setState({
      areas,
      basePlaces: places,
      places: livePlaces(places),
      byId: new Map(places.map((p) => [p.id, p])),
      stationNames: new Map(places.filter((p) => p.type === 'station').map((p) => [p.id, p.name.zh || p.name.ja])),
    });
    // 行程、修改紀錄從後端來；讀完才算好（地圖一開始就要畫行程）
    const applyShared = await pending;
    await applyShared();
    dataStore.setState({ status: 'ready' });
    scheduleDetails();
  } catch (e) {
    dataStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
