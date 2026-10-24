// 地圖上的行程線沿道路和鐵路畫（T15m 第三輪）：
// - createPathOf：給 itineraryFeatures 用，同步回傳那一段的路徑（步行、車看 router 的快取，電車沿車站），沒有就 null（畫直線）
// - startItineraryRoutes：選定的那天變了或時間軸重算後，把那天每一段步行、車的路徑一段一段向 router 要，
//   拿到就讓 routesVersion 加一，地圖重畫。換天時舊的那天不再排新的請求，新的那天從頭排（優先於其他天）。
// 選「全部」時不查（太多段，OSRM 要求低頻），只畫已經在快取裡的。

import type { StoreApi } from 'zustand/vanilla';
import type { Leg } from '@travel-helper/engine';
import type { AppStore } from './store.ts';
import type { DataState } from './dataStore.ts';
import type { PlanState } from './planStore.ts';
import type { LonLat, Place } from './data/types.ts';
import { itineraryFeatures } from './lib/overlays.ts';
import { railPath, routeProfile, type RailStation, type RoadRouter } from './lib/routing.ts';
import { tripDates } from './lib/trip.ts';

const DATES = tripDates();

type PathOf = (from: Place, to: Place, mode: Leg['mode']) => LonLat[] | null;

/** 這一段該怎麼查：步行／車用 OSRM，其他不查 */
function roadProfile(mode: Leg['mode']): 'foot' | 'car' | null {
  if (mode === 'none' || mode === 'unknown') return null;
  const p = routeProfile(mode);
  return p === 'foot' || p === 'car' ? p : null;
}

/** 同步取得一段的路徑：只看快取，沒查到回傳 null */
export function createPathOf(router: Pick<RoadRouter, 'cachedPath'>, data: StoreApi<DataState>): PathOf {
  let stationsFor: Place[] | null = null;
  let stations: RailStation[] = [];
  const railStations = () => {
    const places = data.getState().places;
    if (places !== stationsFor) {
      stationsFor = places;
      stations = places
        .filter((p) => p.type === 'station')
        .map((p): RailStation => ({ id: p.id, coords: p.coords, operator: p.raw.operator as string | undefined, stationNumber: p.raw.stationNumber as string | undefined }));
    }
    return stations;
  };
  return (from, to, mode) => {
    if (mode === 'none' || mode === 'unknown') return null;
    const profile = routeProfile(mode);
    if (profile === 'rail') {
      const path = railPath(from.id, to.id, railStations());
      return path && path.length >= 2 ? path : null;
    }
    if (profile === 'foot' || profile === 'car') return router.cachedPath(profile, from.coords, to.coords);
    return null;
  };
}

export function startItineraryRoutes(app: StoreApi<AppStore>, data: StoreApi<DataState>, plan: StoreApi<PlanState>, router: RoadRouter): () => void {
  let generation = 0;
  let key = '';

  /** 選定那天需要查、還沒在快取裡的段落（照時間軸的順序） */
  const wanted = (day: string) => {
    const out: { profile: 'foot' | 'car'; from: LonLat; to: LonLat }[] = [];
    const seen = new Set<string>();
    const collect: PathOf = (from, to, mode) => {
      const profile = roadProfile(mode);
      if (profile && !router.cachedPath(profile, from.coords, to.coords)) {
        const k = `${profile}|${from.coords}|${to.coords}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ profile, from: from.coords, to: to.coords });
        }
      }
      return null;
    };
    const d = data.getState();
    itineraryFeatures(d.itinerary, plan.getState().plan, d.byId, DATES, day, collect);
    return out;
  };

  const check = () => {
    const day = app.getState().day;
    const d = data.getState();
    const p = plan.getState().plan;
    if (day === 'all' || !d.itinerary || !p) {
      generation++;
      key = '';
      return;
    }
    const todo = wanted(day);
    const nextKey = todo.map((t) => `${t.profile}|${t.from}|${t.to}`).join(';');
    if (nextKey === key) return;
    key = nextKey;
    const mine = ++generation;
    void (async () => {
      for (const t of todo) {
        if (mine !== generation) return;
        const road = await router.route(t.profile, t.from, t.to);
        if (mine !== generation) return;
        if (road) app.setState((s) => ({ routesVersion: s.routesVersion + 1 }));
      }
    })();
  };

  check();
  const offs = [
    app.subscribe((s, prev) => {
      if (s.day !== prev.day) check();
    }),
    plan.subscribe((s, prev) => {
      if (s.plan !== prev.plan) check();
    }),
    data.subscribe((s, prev) => {
      if (s.byId !== prev.byId || s.itinerary !== prev.itinerary) check();
    }),
  ];
  return () => {
    generation++;
    offs.forEach((off) => off());
  };
}
