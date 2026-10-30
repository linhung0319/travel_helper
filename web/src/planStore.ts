// 行程引擎（T14）在瀏覽器跑：行程或資料點一變就重算時間軸（T29b 起只重算有改的那天，資料點、道路快取變了才整份重算），
// 「這一天」的時間軸、地圖上的交通標籤、空檔、警告都讀這一份。

import { createStore, type StoreApi } from 'zustand/vanilla';
import { createPlanCache, placeLookup, planItinerary, resolveConfig, rideDepartures, type DayPlan, type EngineConfig, type EngineData, type ItineraryPlan, type PlaceRecord, type RideDeparture, type TransitRide } from '@travel-helper/engine';
import type { DataState } from './dataStore.ts';
import type { DataSource, EngineTimetables } from './data/source.ts';
import type { LonLat } from './data/types.ts';

export interface PlanState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  plan: ItineraryPlan | null;
}

export const planStore = createStore<PlanState>()(() => ({ status: 'loading', error: null, plan: null }));

let lastEngineData: EngineData | null = null;
/** 最後一次算時間軸用的資料（「＋ 排進」算最順路的位置用）；時刻表還沒載入時是 null */
export const currentEngineData = () => lastEngineData;

/** 算時間軸用的設定（班次表列一程的所有班次也用這一份） */
export const engineConfig: EngineConfig = resolveConfig();

// 一程那天的所有班次（班次表每次重畫都要）：照引擎資料（換了就整個重算）、日期、方式、上下車站、路線記住
const departuresCache = new WeakMap<EngineData, Map<string, RideDeparture[]>>();
const NO_DEPARTURES: RideDeparture[] = [];

/** 這一程那天、同一對站的所有班次（引擎的 rideDepartures，記住結果）；時刻表還沒載入時是 [] */
export function departuresOf(date: string, ride: TransitRide): RideDeparture[] {
  const data = lastEngineData;
  if (!data) return NO_DEPARTURES;
  let byKey = departuresCache.get(data);
  if (!byKey) departuresCache.set(data, (byKey = new Map()));
  const key = [date, ride.mode, ride.from, ride.to, ride.routeId ?? ''].join('|');
  let hit = byKey.get(key);
  if (!hit) byKey.set(key, (hit = rideDepartures(data, engineConfig, date, ride)));
  return hit;
}

export interface RoadCache {
  cachedMeters(profile: 'foot' | 'car', from: LonLat, to: LonLat): number | null;
  cachedMinutes(profile: 'foot' | 'car', from: LonLat, to: LonLat): number | null;
  /** 查到新路線就加一（routing.ts）；沒有就當作不會變 */
  readonly version?: number;
}

// 引擎的網路、搜尋、上下車點、每天的結果都照 EngineData 和它的陣列、函式快取（T29b spec §7.2）：
// 資料點沒變就沿用同一份 stations、getPlace；資料點、地區、時刻表、道路快取都沒變就沿用同一個 EngineData
let placesMemo: { places: DataState['places']; byId: DataState['byId']; getPlace: EngineData['getPlace']; stations: PlaceRecord[] } | null = null;
let areasMemo: { areas: DataState['areas']; needsCar: Record<string, boolean> } | null = null;
let dataMemo: { places: DataState['places']; byId: DataState['byId']; areas: DataState['areas']; tt: EngineTimetables; roads: RoadCache | undefined; version: number; data: EngineData } | null = null;

export function buildEngineData(d: DataState, tt: EngineTimetables, roads?: RoadCache): EngineData {
  const version = roads?.version ?? 0;
  const m = dataMemo;
  if (m && m.places === d.places && m.byId === d.byId && m.areas === d.areas && m.tt === tt && m.roads === roads && m.version === version) return m.data;
  // 自己加的點（T31）：places 只有沒刪除的；byId 還有已刪除的，要交給引擎當 retired（行程裡那一格還要顯示名稱、警告）
  if (placesMemo?.places !== d.places || placesMemo.byId !== d.byId) {
    const base: PlaceRecord[] = [];
    for (const p of d.places) if (p.origin !== 'user') base.push(p.raw as unknown as PlaceRecord);
    const users: PlaceRecord[] = [];
    const retired: string[] = [];
    const live = new Set(d.places.map((p) => p.id));
    for (const p of d.byId.values()) {
      if (p.origin !== 'user') continue;
      users.push(p.raw as unknown as PlaceRecord);
      if (!live.has(p.id)) retired.push(p.id);
    }
    placesMemo = { places: d.places, byId: d.byId, getPlace: placeLookup(base, { users, retired }), stations: base.filter((r) => r.type === 'station') };
  }
  if (areasMemo?.areas !== d.areas) {
    const needsCar: Record<string, boolean> = {};
    for (const a of d.areas) for (const r of a.regions ?? []) needsCar[r.id] = !!r.needsCar;
    areasMemo = { areas: d.areas, needsCar };
  }
  const needsCar = areasMemo.needsCar;
  const data: EngineData = {
    getPlace: placesMemo.getPlace,
    stations: placesMemo.stations,
    kintetsu: tt.kintetsu,
    routes: tt.routes,
    urban: tt.urban,
    urbanTransfers: tt.urbanTransfers,
    regionNeedsCar: needsCar,
    walkMeters: roads ? (a, b) => roads.cachedMeters('foot', a, b) : undefined,
    driveMeters: roads ? (a, b) => roads.cachedMeters('car', a, b) : undefined,
    driveMinutes: roads ? (a, b) => roads.cachedMinutes('car', a, b) : undefined,
  };
  dataMemo = { places: d.places, byId: d.byId, areas: d.areas, tt, roads, version, data };
  return data;
}

/** 只重算有改的那一天（引擎的 PlanCache；EngineData 換了就整份重算） */
const planCache = createPlanCache();

/** 開始算：讀時刻表，之後行程或資料點變了就重算 */
export function startPlanner(data: StoreApi<DataState>, source: DataSource, roads?: RoadCache, store: StoreApi<PlanState> = planStore) {
  let timetables: EngineTimetables | null = null;
  const compute = () => {
    const d = data.getState();
    if (!timetables || d.status !== 'ready') return;
    if (!d.itinerary) {
      store.setState({ status: 'ready', error: null, plan: null });
      return;
    }
    try {
      lastEngineData = buildEngineData(d, timetables, roads);
      store.setState({ status: 'ready', error: null, plan: planItinerary(d.itinerary, lastEngineData, engineConfig, planCache) });
    } catch (e) {
      store.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };
  source
    .loadEngineTimetables()
    .then((tt) => {
      timetables = tt;
      compute();
    })
    .catch((e) => store.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
  let prev = data.getState();
  return data.subscribe((s) => {
    if (s.itinerary !== prev.itinerary || s.places !== prev.places || s.status !== prev.status) compute();
    prev = s;
  });
}

export function dayPlanOf(plan: ItineraryPlan | null, date: string): DayPlan | null {
  return plan?.days.find((d) => d.date === date) ?? null;
}
