// 讀進來的資料（區域、資料點、行程）。和 UI 狀態（store.ts）分開。
// 資料點：預設資料（basePlaces，清單層）套上修改層（appShared.ts 的 edits）就是 places；行程從後端來（backend/）。
// 詳情層用到才讀那幾個點（ensureDetails，T47；以前是閒置時一次讀 597 個），放在 details，不換 places：不然詳情一到，行程要整份重算、清單要全部重畫。要完整欄位用 fullPlace。

import { createStore, type StoreApi } from 'zustand/vanilla';
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
  /** 詳情層：讀過的點（用到才讀，T47）；一個都還沒讀是 null */
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

const fullMemo = new WeakMap<Place, { detail: Record<string, unknown>; full: Place }>();

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
  // 看這個點的詳情是不是同一份（別的點讀進來時 details 會換一個 Map，這個點不用重算）
  if (memo && memo.detail === detail) return memo.full;
  const base = s.basePlaces.find((x) => x.id === id);
  const seed = normalizePlace({ ...(base?.raw ?? p.raw), ...detail });
  if (!seed) return p;
  const [merged] = mergePlaceEdits([seed], s.placeEdits);
  const full: Place = { ...merged, retiredAt: p.retiredAt };
  fullMemo.set(p, { detail, full });
  return full;
}

/**
 * 詳情層的讀法（T47 起用到才讀）：回傳的 ensure(ids) 只讀那幾個點（詳情、小卡片、AI 問到的點），讀過的不再讀，
 * 同一輪要的併成一個請求（行程的卡片一次展開好幾張）；不給 ids 是全部（匯出行程）。讀不到時 reject，下次呼叫再試。
 * 要了卻沒回來的（資料庫沒有）記成空的詳情，不然畫面一直等。
 */
export function createDetailsLoader(store: StoreApi<DataState>, load: (ids?: readonly string[]) => Promise<{ id: string }[]>) {
  let allLoading: Promise<void> | null = null;
  let allLoaded = false;
  /** 正在讀的點 → 那一次請求 */
  const inflight = new Map<string, Promise<void>>();
  let queued: { ids: Set<string>; done: Promise<void> } | null = null;

  const merge = (list: { id: string }[], asked: readonly string[] = []) =>
    store.setState((s) => {
      const next = new Map(s.details ?? []);
      for (const id of asked) if (!next.has(id)) next.set(id, {});
      for (const d of list) next.set(d.id, d as Record<string, unknown>);
      return { details: next, detailsError: null };
    });
  const failed = (e: unknown): never => {
    store.setState({ detailsError: e instanceof Error ? e.message : String(e) });
    throw e;
  };

  return function ensure(ids?: readonly string[]): Promise<void> {
    if (allLoaded) return Promise.resolve();
    if (!ids) {
      allLoading ??= load()
        .then((list) => {
          merge(list);
          allLoaded = true;
        })
        .catch((e: unknown) => {
          allLoading = null;
          return failed(e);
        });
      return allLoading;
    }
    if (allLoading) return allLoading;
    const s = store.getState();
    const need = [...new Set(ids)].filter((id) => {
      const p = s.byId.get(id);
      return !!p && p.origin !== 'user' && !s.details?.has(id);
    });
    const waits = new Set<Promise<void>>();
    for (const id of need) {
      const p = inflight.get(id);
      if (p) {
        waits.add(p);
        continue;
      }
      if (!queued) {
        const batch = new Set<string>();
        const done = new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => {
          queued = null;
          const asked = [...batch];
          return load(asked)
            .then((list) => merge(list, asked))
            .catch(failed)
            .finally(() => asked.forEach((x) => inflight.delete(x)));
        });
        queued = { ids: batch, done };
      }
      queued.ids.add(id);
      inflight.set(id, queued.done);
      waits.add(queued.done);
    }
    return Promise.all(waits).then(() => {});
  };
}

/** 網站共用的一份 */
export const ensureDetails = createDetailsLoader(dataStore, (ids) => dataSource.loadPlaceDetails(ids));

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
  } catch (e) {
    dataStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
