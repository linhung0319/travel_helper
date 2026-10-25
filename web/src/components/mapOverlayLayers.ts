// 地圖指令（T12）的圖層：標示、比較、路線、AI 的提議。線畫在資料點下面，框、字畫在上面。
// 資料由 MapView 依 store 的狀態 setData（lib/overlays.ts 產生 GeoJSON）。

import type { Map as MapLibreMap } from 'maplibre-gl';

export const OVERLAY_SOURCES = {
  highlights: 'overlay-highlights',
  compare: 'overlay-compare',
  routes: 'overlay-routes',
  proposalPoints: 'overlay-proposal-points',
  proposalLines: 'overlay-proposal-lines',
  itineraryLines: 'overlay-itinerary-lines',
  itineraryAlts: 'overlay-itinerary-alts',
} as const;

const HIGHLIGHT_COLORS: Record<string, string> = { primary: '#d4a72c', warning: '#cf222e', muted: '#8c959f' };
const COMPARE_COLOR = '#8250df';
const PROPOSAL_ADDED_COLOR = '#1a7f37';
/** 步行藍、電車黑、巴士橘、船青綠，其他（計程車、包車）紫 */
const ROUTE_COLOR = ['match', ['get', 'mode'], 'walk', '#0969da', 'train', '#24292f', 'bus', '#bc4c00', 'ferry', '#1b7c83', '#6e40c9'];

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
  // 時段備案的備選：那天顏色的空心圈（interaction-design §6）
  map.addLayer({
    id: 'itinerary-alt',
    type: 'circle',
    source: OVERLAY_SOURCES.itineraryAlts,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 14],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': ['case', ['==', ['get', 'active'], 1], 0.95, 0.25],
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
      'circle-color': '#8c959f',
      'circle-opacity': 0.55,
      'circle-stroke-color': '#57606a',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'proposal-removed-x',
    type: 'symbol',
    source: OVERLAY_SOURCES.proposalPoints,
    filter: ['==', ['get', 'status'], 'removed'],
    layout: { 'text-field': '×', 'text-font': ['Noto Sans Bold'], 'text-size': 18, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#57606a', 'text-halo-width': 1.5 },
  });
  // 提議的點：半透明的白底、那天顏色的框
  map.addLayer({
    id: 'proposal-circle',
    type: 'circle',
    source: OVERLAY_SOURCES.proposalPoints,
    filter: ['!=', ['get', 'status'], 'removed'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 13],
      'circle-color': '#ffffff',
      'circle-opacity': 0.6,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 0.85,
    },
  });
  // 提議新增的點：綠色亮框
  map.addLayer({
    id: 'proposal-added',
    type: 'circle',
    source: OVERLAY_SOURCES.proposalPoints,
    filter: ['==', ['get', 'status'], 'added'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 12, 14, 18],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': PROPOSAL_ADDED_COLOR,
      'circle-stroke-width': 3,
    },
  });
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

  map.addLayer({
    id: 'highlight-ring',
    type: 'circle',
    source: OVERLAY_SOURCES.highlights,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 19],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': ['match', ['get', 'style'], ...Object.entries(HIGHLIGHT_COLORS).flat(), HIGHLIGHT_COLORS.primary] as never,
      'circle-stroke-width': 3.5,
    },
  });
  map.addLayer({
    id: 'compare-ring',
    type: 'circle',
    source: OVERLAY_SOURCES.compare,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 19],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': COMPARE_COLOR,
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: 'compare-letter',
    type: 'symbol',
    source: OVERLAY_SOURCES.compare,
    layout: { 'text-field': ['get', 'letter'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-offset': [0, -1.7], 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': COMPARE_COLOR, 'text-halo-width': 3 },
  });
}
