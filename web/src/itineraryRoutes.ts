// 地圖上的行程線沿道路和鐵路畫（T15m 第三輪）：
// - createPathOf：給 itineraryFeatures 用，同步回傳那一段的路徑（步行、車看 router 的快取，電車沿車站），沒有就 null（畫直線）
// - startItineraryRoutes：每一天每一段步行、車的路徑一段一段向 router（共用的佇列，1.1 秒一個）要：
//   選定的那天先，其他天照日期排在後面；選「全部」就照日期。拿到就讓 routesVersion 加一，地圖重畫。
//   換天或時間軸重算時重新排（已在快取的不再查），舊的一輪不再往下排。

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
  let pending = new Map<string, true>();

  /** 全部要查、還沒在快取裡的段落：選定的那天先，其他天照日期；選「全部」就是照日期 */
  const wanted = (day: string) => {
    const out: { key: string; profile: 'foot' | 'car'; from: LonLat; to: LonLat }[] = [];
    const seen = new Set<string>();
    const collect: PathOf = (from, to, mode) => {
      const profile = roadProfile(mode);
      if (profile && !router.cachedPath(profile, from.coords, to.coords)) {
        const key = `${profile}|${from.coords}|${to.coords}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ key, profile, from: from.coords, to: to.coords });
        }
      }
      return null;
    };
    const d = data.getState();
    const it = d.itinerary;
    if (!it) return out;
    const dates = it.days.map((x) => x.date).sort();
    const order = day === 'all' ? dates : [day, ...dates.filter((x) => x !== day)];
    for (const date of order) {
      const one = it.days.find((x) => x.date === date);
      if (one) itineraryFeatures({ ...it, days: [one] }, plan.getState().plan, d.byId, DATES, date, collect);
    }
    return out;
  };

  const bump = () => app.setState((s) => ({ routesVersion: s.routesVersion + 1 }));

  const check = () => {
    const p = plan.getState().plan;
    if (!data.getState().itinerary || !p) {
      generation++;
      pending = new Map();
      return;
    }
    const todo = wanted(app.getState().day);
    const now = new Set(todo.map((t) => t.key));
    // 之前在等的段落，現在已經在快取裡（別人查到的，或換天、重算時剛好完成）：地圖要重畫
    const gotCached = [...pending.keys()].some((k) => !now.has(k));
    pending = new Map(todo.map((t) => [t.key, true]));
    if (gotCached) bump();
    const mine = ++generation;
    void (async () => {
      for (const t of todo) {
        if (mine !== generation) return;
        const road = await router.route(t.profile, t.from, t.to);
        // 換了天或重算了：路徑已經進快取，新的一輪不會再查它，所以這裡一定要讓地圖重畫
        if (road) bump();
      }
    })();
  };

  check();
  const offs = [
    app.subscribe((s, prev) => {
      if (s.day !== prev.day || s.routes !== prev.routes) check();
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
