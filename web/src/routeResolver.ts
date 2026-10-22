// drawRoute 畫的路線在背景補上路徑（lib/routing.ts）：步行、車沿道路（OSRM），電車沿車站，其他直線。
// 呼叫者沒給分鐘時，用路徑距離和預設速度算。store 只放結果，查詢放在這裡，所以 store 和指令在 Node 也能測。

import type { StoreApi } from 'zustand/vanilla';
import type { AppStore, MapRoute } from './store.ts';
import type { DataState } from './dataStore.ts';
import { lineMeters, minutesFromMeters, railPath, routeProfile, type RailStation, type RoadRouter } from './lib/routing.ts';
import type { LonLat } from './data/types.ts';

const DEFAULT_PARTY = { size: 15, elders: 5, kids: 4 };

export function startRouteResolver(app: StoreApi<AppStore>, data: StoreApi<DataState>, router: RoadRouter): () => void {
  const started = new Set<string>();

  const finish = (r: MapRoute, geometry: LonLat[], source: MapRoute['source']) => {
    // 路線在查的時候被 clearHighlights 清掉了就不寫回
    if (!app.getState().routes.some((x) => x.id === r.id)) return;
    const meters = lineMeters(geometry);
    const party = data.getState().itinerary?.party ?? DEFAULT_PARTY;
    const minutes = r.minutesGiven ? r.minutes : minutesFromMeters(r.mode, meters, party);
    app.getState().updateRoute(r.id, { geometry, meters, source, minutes });
  };

  const resolve = (r: MapRoute) => {
    started.add(r.id);
    const straight: LonLat[] = [r.from.coords, r.to.coords];
    const profile = routeProfile(r.mode);
    if (profile === 'rail') {
      const stations = data
        .getState()
        .places.filter((p) => p.type === 'station')
        .map((p): RailStation => ({ id: p.id, coords: p.coords, operator: p.raw.operator as string | undefined, stationNumber: p.raw.stationNumber as string | undefined }));
      const path = r.from.place && r.to.place ? railPath(r.from.place, r.to.place, stations) : null;
      finish(r, path && path.length >= 2 ? path : straight, path && path.length >= 2 ? 'rail' : 'straight');
      return;
    }
    if (profile === 'straight') {
      finish(r, straight, 'straight');
      return;
    }
    void router.route(profile, r.from.coords, r.to.coords).then((road) => {
      if (road) {
        // OSRM 的距離含起訖點到道路的距離，比折線長一點；時間用它算，和引擎的 walkMeters 一致
        if (!app.getState().routes.some((x) => x.id === r.id)) return;
        const party = data.getState().itinerary?.party ?? DEFAULT_PARTY;
        const geometry: LonLat[] = [r.from.coords, ...road.geometry, r.to.coords];
        app.getState().updateRoute(r.id, {
          geometry,
          meters: road.meters,
          source: 'osrm',
          minutes: r.minutesGiven ? r.minutes : minutesFromMeters(r.mode, road.meters, party),
        });
      } else finish(r, straight, 'straight');
    });
  };

  const check = (s: AppStore) => {
    for (const r of s.routes) if (!started.has(r.id) && r.source === 'pending') resolve(r);
    // 給了路徑但沒給分鐘的，也用距離算
    for (const r of s.routes) if (!started.has(r.id) && r.source === 'given') {
      started.add(r.id);
      if (!r.minutesGiven) finish(r, r.geometry!, 'given');
    }
  };
  check(app.getState());
  return app.subscribe(check);
}
