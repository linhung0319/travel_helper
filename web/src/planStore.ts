// 行程引擎（T14）在瀏覽器跑：行程或資料點一變就重算整份時間軸（12 天約 15 ms），
// 「這一天」的時間軸、地圖上的交通標籤、空檔、警告都讀這一份。

import { createStore, type StoreApi } from 'zustand/vanilla';
import { placeLookup, planItinerary, type DayPlan, type EngineData, type ItineraryPlan, type KintetsuTimes, type PlaceRecord, type RouteTimetable } from '@travel-helper/engine';
import type { DataState } from './dataStore.ts';
import type { DataSource } from './data/source.ts';
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

export interface RoadCache {
  cachedMeters(profile: 'foot' | 'car', from: LonLat, to: LonLat): number | null;
}

export function buildEngineData(d: DataState, tt: { kintetsu: KintetsuTimes | null; routes: RouteTimetable[] }, roads?: RoadCache): EngineData {
  const records = d.places.map((p) => p.raw as unknown as PlaceRecord);
  const needsCar: Record<string, boolean> = {};
  for (const a of d.areas) for (const r of a.regions ?? []) needsCar[r.id] = !!r.needsCar;
  return {
    getPlace: placeLookup(records),
    stations: records.filter((r) => r.type === 'station'),
    kintetsu: tt.kintetsu,
    routes: tt.routes,
    regionNeedsCar: needsCar,
    walkMeters: roads ? (a, b) => roads.cachedMeters('foot', a, b) : undefined,
    driveMeters: roads ? (a, b) => roads.cachedMeters('car', a, b) : undefined,
  };
}

/** 開始算：讀時刻表，之後行程或資料點變了就重算 */
export function startPlanner(data: StoreApi<DataState>, source: DataSource, roads?: RoadCache, store: StoreApi<PlanState> = planStore) {
  let timetables: { kintetsu: KintetsuTimes | null; routes: RouteTimetable[] } | null = null;
  const compute = () => {
    const d = data.getState();
    if (!timetables || d.status !== 'ready') return;
    if (!d.itinerary) {
      store.setState({ status: 'ready', error: null, plan: null });
      return;
    }
    try {
      lastEngineData = buildEngineData(d, timetables, roads);
      store.setState({ status: 'ready', error: null, plan: planItinerary(d.itinerary, lastEngineData) });
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
