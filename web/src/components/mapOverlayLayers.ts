// 地圖指令（T12）的圖層：路線、AI 的提議，和時間軸點開的那段交通（路線、上下車的站）。線畫在資料點下面，字畫在上面。
// AI 挑的點、提議新增的點不畫圈，是 MapView 的水滴（DOM 標記）。
// 顏色是設計 §2 的 token 值（MapLibre 讀不到 CSS 變數，所以寫成字串）。
// 資料由 MapView 依 store 的狀態 setData（lib/overlays.ts 產生 GeoJSON）。

import type { Map as MapLibreMap } from 'maplibre-gl';

export const OVERLAY_SOURCES = {
  legStations: 'overlay-leg-stations',
  routes: 'overlay-routes',
  proposalPoints: 'overlay-proposal-points',
  proposalLines: 'overlay-proposal-lines',
  itineraryLines: 'overlay-itinerary-lines',
  itineraryAlts: 'overlay-itinerary-alts',
} as const;

/** 點開的交通上下車的站：--ink-2 */
const LEG_STATION_COLOR = '#4b5262';
/** 路線一律墨色（--ink），交通方式看線型（步行點線、船虛線）和標籤的圖示 */
const ROUTE_COLOR = '#1c2840';

/** 行程線、白底的透明度：整趟點了某天時其他天（dim）0.25（第五輪 §9.1）；MapView 收起交通卡時還原成這個 */
export const ITINERARY_LINE_OPACITY = ['case', ['==', ['get', 'dim'], true], 0.25, ['==', ['get', 'active'], 1], 0.85, 0.15] as never;
export const ITINERARY_CASING_OPACITY = ['case', ['==', ['get', 'dim'], true], 0.25, ['==', ['get', 'active'], 1], 0.85, 0.2] as never;

export function addOverlayLayers(map: MapLibreMap, below = 'places-circle') {
  const empty = { type: 'FeatureCollection' as const, features: [] };
  for (const id of Object.values(OVERLAY_SOURCES)) map.addSource(id, { type: 'geojson', data: empty });

  // 確定的行程（T15m）：每天的顏色、實線；選了某一天時其他天變淡。畫在最下面
  map.addLayer(
    {
      id: 'itinerary-casing',
      type: 'line',
      source: OVERLAY_SOURCES.itineraryLines,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': ITINERARY_CASING_OPACITY },
    },
    below,
  );
  map.addLayer(
    {
      id: 'itinerary-line',
      type: 'line',
      source: OVERLAY_SOURCES.itineraryLines,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'selected'], 1], 4.5, 3.5],
        'line-opacity': ITINERARY_LINE_OPACITY,
      },
    },
    below,
  );
  // 選定那天的方向箭頭（圖片在 mapIcons.ts）
  map.addLayer(
    {
      id: 'itinerary-arrow',
      type: 'symbol',
      source: OVERLAY_SOURCES.itineraryLines,
      filter: ['==', ['get', 'selected'], 1],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 90,
        'icon-image': 'route-arrow',
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
      },
      paint: { 'icon-color': ['get', 'color'], 'icon-halo-color': '#ffffff', 'icon-halo-width': 1.5 },
    },
    below,
  );

  // 路線：白色的底，再畫一條依交通方式上色的線；查不到路徑（直線）時比較淡
  map.addLayer(
    {
      id: 'routes-casing',
      type: 'line',
      source: OVERLAY_SOURCES.routes,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': ['case', ['==', ['get', 'estimate'], 1], 0.5, 0.9] },
    },
    below,
  );
  // line-dasharray 不一定支援依資料變化，所以實線、點線、虛線各一層
  const routeLine = (id: string, dash: string, dasharray?: number[]) =>
    map.addLayer(
      {
        id,
        type: 'line',
        source: OVERLAY_SOURCES.routes,
        filter: ['==', ['get', 'dash'], dash],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROUTE_COLOR as never,
          'line-width': 4,
          'line-opacity': ['case', ['==', ['get', 'estimate'], 1], 0.55, 0.95],
          ...(dasharray ? { 'line-dasharray': dasharray } : {}),
        },
      },
      below,
    );
  routeLine('routes-solid', 'solid');
  routeLine('routes-dot', 'dot', [0.1, 2]);
  routeLine('routes-dash', 'dash', [2, 1.5]);

  // 提議：那天的顏色的虛線
  map.addLayer(
    {
      id: 'proposal-line',
      type: 'line',
      source: OVERLAY_SOURCES.proposalLines,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [2, 1.5] },
    },
    below,
  );
  // 時段備案的備選：一個「備」字，那天的顏色（不畫圈，地圖上只有水滴代表「指給你看」）
  map.addLayer({
    id: 'itinerary-alt',
    type: 'symbol',
    source: OVERLAY_SOURCES.itineraryAlts,
    layout: { 'text-field': '備', 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, -1.2], 'text-allow-overlap': true },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': ['get', 'color'],
      'text-halo-width': 2.5,
      'text-opacity': ['case', ['==', ['get', 'active'], 1], 0.95, 0.25],
    },
  });
  // 提議拿掉的點：灰色加 ×
  map.addLayer({
    id: 'proposal-removed',
    type: 'circle',
    source: OVERLAY_SOURCES.proposalPoints,
    filter: ['==', ['get', 'status'], 'removed'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 7, 14, 12],
      'circle-color': '#8a90a0',
      'circle-opacity': 0.55,
      'circle-stroke-color': '#4b5262',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'proposal-removed-x',
    type: 'symbol',
    source: OVERLAY_SOURCES.proposalPoints,
    filter: ['==', ['get', 'status'], 'removed'],
    layout: { 'text-field': '×', 'text-font': ['Noto Sans Bold'], 'text-size': 18, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#4b5262', 'text-halo-width': 1.5 },
  });
  // 提議留著的點只寫順序；新增的點是 MapView 的水滴
  map.addLayer({
    id: 'proposal-order',
    type: 'symbol',
    source: OVERLAY_SOURCES.proposalPoints,
    filter: ['>', ['get', 'order'], 0],
    // 確定的行程的編號在點的上方，提議的放下方，兩個都看得到
    layout: {
      'text-field': ['to-string', ['get', 'order']],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-offset': [0, 1.5],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 2.5 },
  });

  // 點開的交通上下車的站：實心小點，路線上的節點
  map.addLayer({
    id: 'leg-station',
    type: 'circle',
    source: OVERLAY_SOURCES.legStations,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 6],
      'circle-color': LEG_STATION_COLOR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}
