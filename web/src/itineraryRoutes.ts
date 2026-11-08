// 地圖上的行程線沿道路和鐵路畫（T15m 第三輪）：
// - createPathOf：給 itineraryFeatures 和展開的交通細列用，同步回傳那一段的路徑（搭車的照班次一程一程畫、電車沿車站，
//   頭尾走到車站、搭計程車到車站的那一小段沿道路（查到了的話）；
//   步行、車看 router 的快取），沒有就 null（畫直線）
// - startItineraryRoutes：每一天每一段步行、車的路徑一段一段向 router（共用的佇列，1.1 秒一個）要：
//   選定的那天先，其他天照日期排在後面；選「全部」就照日期。拿到就讓 routesVersion 加一，地圖重畫。
//   換天或時間軸重算時重新排（已在快取的不再查），舊的一輪不再往下排。大眾運輸的段落也查頭尾那一小段（transitEnds）。
//   查到新的距離後重算時間軸（replan，隔一下合併成一次）：引擎的步行、計程車分鐘改用道路距離。

import type { StoreApi } from 'zustand/vanilla';
import type { Leg } from '@travel-helper/engine';
import type { AppStore } from './store.ts';
import type { DataState } from './dataStore.ts';
import type { PlanState } from './planStore.ts';
import type { LonLat, Place } from './data/types.ts';
import { itineraryFeatures } from './lib/overlays.ts';
import { railPath, ridesPath, routeProfile, transitEnds, type EndQuery, type RailStation, type RoadRouter, type RouteLine } from './lib/routing.ts';
import { currentEngineData, replan } from './planStore.ts';
import { tripDates } from './lib/trip.ts';

const DATES = tripDates();

/** taxi：大眾運輸接計程車的那兩段（Leg 的 taxiBefore、taxiAfter，直接給 Leg 就可以） */
export type PathOf = (from: Place, to: Place, mode: Leg['mode'], rides?: Leg['rides'], taxi?: Pick<Leg, 'taxiBefore' | 'taxiAfter'> | null) => LonLat[] | null;

/** 查到新距離後隔多久重算時間軸（連續查到好幾段只算一次） */
const REPLAN_DELAY_MS = 800;

/** 這一段該怎麼查：步行／車用 OSRM，其他不查 */
function roadProfile(mode: Leg['mode']): 'foot' | 'car' | null {
  if (mode === 'none' || mode === 'unknown') return null;
  const p = routeProfile(mode);
  return p === 'foot' || p === 'car' ? p : null;
}

/** 大阪班距型路線的停靠順序：照引擎資料（時刻表載入後才有；有班次的段落一定已經載入） */
const urbanLines = (() => {
  let memo: { urban: readonly RouteLine[]; map: Map<string, RouteLine> } | null = null;
  return (): ReadonlyMap<string, RouteLine> | undefined => {
    const urban = currentEngineData()?.urban;
    if (!urban) return undefined;
    if (memo?.urban !== urban) memo = { urban, map: new Map(urban.map((u) => [u.id, u])) };
    return memo.map;
  };
})();

/** 巴士、船的停留所座標：網路裡的 ID 是「路線 ID/停留所 ID」（引擎的 netStopId），照引擎資料的路線檔找 */
const routeStops = (() => {
  let memo: { routes: readonly { id: string; stops: { id: string; coords?: LonLat | null }[] }[]; map: Map<string, LonLat> } | null = null;
  return (): ReadonlyMap<string, LonLat> | undefined => {
    const routes = currentEngineData()?.routes;
    if (!routes) return undefined;
    if (memo?.routes !== routes) {
      const map = new Map<string, LonLat>();
      for (const doc of routes) for (const s of doc.stops) if (s.coords) map.set(`${doc.id}/${s.id}`, s.coords as LonLat);
      memo = { routes, map };
    }
    return memo.map;
  };
})();

/** 站、停留所的座標：資料點（車站）優先，否則照路線檔的停留所 */
export function stopCoordsOf(data: StoreApi<DataState>, stops: () => ReadonlyMap<string, LonLat> | undefined = routeStops): (id: string) => LonLat | null {
  return (id) => data.getState().byId.get(id)?.coords ?? stops()?.get(id) ?? null;
}

/** 同步取得一段的路徑：只看快取，沒查到回傳 null。lines：大阪路線的停靠順序；stops：停留所座標（測試給；預設照引擎資料） */
export function createPathOf(
  router: Pick<RoadRouter, 'cachedPath'>,
  data: StoreApi<DataState>,
  lines: () => ReadonlyMap<string, RouteLine> | undefined = urbanLines,
  stops: () => ReadonlyMap<string, LonLat> | undefined = routeStops,
): PathOf {
  const coordsOf = stopCoordsOf(data, stops);
  const road = (q: EndQuery | null) => {
    const g = q ? router.cachedPath(q.profile, q.from, q.to) : null;
    return g && q?.reverse ? [...g].reverse() : g;
  };
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
  return (from, to, mode, rides, taxi) => {
    if (mode === 'none' || mode === 'unknown') return null;
    // 搭車（電車、巴士、船）有班次時照班次的站畫；站都找不到再照交通方式。頭尾那一小段查到道路就沿路
    if ((mode === 'train' || mode === 'bus' || mode === 'ferry') && rides?.length) {
      const ends = transitEnds(from.coords, to.coords, rides, taxi, coordsOf);
      const path = ridesPath(from.coords, to.coords, rides, railStations(), coordsOf, lines(), { first: road(ends.first), last: road(ends.last) });
      if (path) return path;
    }
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
  // 只看班次的路徑（不看道路快取）：照班次畫得出來的段落就不用向 OSRM 查
  const byRides = createPathOf({ cachedPath: () => null }, data);
  const coordsOf = stopCoordsOf(data);

  /** 全部要查、還沒在快取裡的段落：選定的那天先，其他天照日期；選「全部」就是照日期 */
  const wanted = (day: string) => {
    const out: { key: string; profile: 'foot' | 'car'; from: LonLat; to: LonLat }[] = [];
    const seen = new Set<string>();
    const add = (profile: 'foot' | 'car', a: LonLat, b: LonLat) => {
      if (router.cachedPath(profile, a, b)) return;
      const key = `${profile}|${a}|${b}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, profile, from: a, to: b });
    };
    const collect: PathOf = (from, to, mode, rides, taxi) => {
      if (rides?.length && byRides(from, to, mode, rides, taxi)) {
        // 大眾運輸：頭尾走到車站、搭計程車到車站的那一小段
        const ends = transitEnds(from.coords, to.coords, rides, taxi, coordsOf);
        for (const q of [ends.first, ends.last]) if (q) add(q.profile, q.from, q.to);
        return null;
      }
      const profile = roadProfile(mode);
      if (profile) add(profile, from.coords, to.coords);
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
  // 查到新距離：隔一下重算時間軸（引擎的步行、計程車分鐘改用道路距離）
  let replanTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleReplan = () => {
    if (replanTimer) return;
    replanTimer = setTimeout(() => {
      replanTimer = null;
      replan();
    }, REPLAN_DELAY_MS);
  };

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
        if (road) {
          bump();
          scheduleReplan();
        }
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
    if (replanTimer) clearTimeout(replanTimer);
    offs.forEach((off) => off());
  };
}
