import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
// maplibre-gl v6 的 worker 是另一個檔案；經過 Vite 打包後用 import.meta.url 找不到，所以讓 Vite 打包 worker 再指定網址
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { DESKTOP_QUERY, useApp, useCanHover, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { voteCounts } from '../sharedStore.ts';
import { initialExtent } from '../lib/areas.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { addMapIcons } from './mapIcons.ts';
import { placeVisual } from '../lib/visual.ts';
import { PULSE_EVENT, PULSE_MS } from '../lib/mapPulse.ts';
import { tripDates } from '../lib/trip.ts';
import { PLACE_TYPES, type Bbox, type Place } from '../data/types.ts';
import { PreviewCard } from './PreviewCard.tsx';
import { addOverlayLayers, ITINERARY_CASING_OPACITY, ITINERARY_LINE_OPACITY, OVERLAY_SOURCES } from './mapOverlayLayers.ts';
import { compareFeatures, highlightFeatures, itineraryFeatures, itineraryMarks, placeBadges, proposalFeatures, routeFeatures, routeLabels } from '../lib/overlays.ts';
import { commands, itineraryPathOf } from '../appCommands.ts';
import { routeLabelHtml } from '../lib/modeIcon.ts';
import { MapCommandBars } from './MapCommandBars.tsx';
import { showInExplore } from './Explore.tsx';
import { shared } from '../appShared.ts';
import { likedPlaces } from '../lib/wishlist.ts';
import { closeMapPanel, closeTimetable, uiStore } from '../uiStore.ts';

setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** 放大到這裡以上，小點換成類別圖標（像 Google Maps） */
export const ICON_ZOOM = 12;
/** 這個縮放以上才顯示每個點的 ❤️ 數字 */
const BADGE_ZOOM = 10;
const DATES = tripDates();
const PULSE_OFF = ['all', ['!=', ['get', 'mark'], ''], ['==', ['get', 'id'], '']] as never;

const typeColorExpr = ['match', ['get', 'type'], ...PLACE_TYPES.flatMap((t) => [t, TYPE_COLORS[t]]), '#555'];

/** marks：行程的編號（0、1、2…，overlays.itineraryMarks：某一天、點開的那段、整趟）；有編號的點畫成類型色的編號圓 */
function featureCollection(places: Place[], marks: Map<string, string>): FeatureCollection {
  const { filter, query, day, mode } = appStore.getState();
  const { days } = dataStore.getState();
  // 探索、想去時不因為「不在那天」變淡（找的是那天還沒排的點），只看篩選；想去時沒人 ❤️ 的點也變淡
  const dimDay = mode === 'explore' || mode === 'wish' ? 'all' : day;
  const liked = mode === 'wish' ? likedPlaces(shared.store.getState().votes) : null;
  return {
    type: 'FeatureCollection',
    features: places.map((p) => {
      const v = placeVisual(p, filter, dimDay, days, query);
      return {
        type: 'Feature',
        id: undefined,
        geometry: { type: 'Point', coordinates: p.coords },
        properties: {
          id: p.id,
          type: p.type,
          tier: p.tier ?? '',
          label: p.name.zh || p.name.ja,
          dim: v.dim || (liked && !liked.has(p.id)) ? 1 : 0,
          mark: marks.get(p.id) ?? '',
          typeColor: TYPE_COLORS[p.type],
        },
      };
    }),
  };
}

/** 可以點的圖層（點的時候都要查） */
const PICK_LAYERS = ['places-circle', 'places-icon', 'places-mark', 'places-pin'];

/** 畫面上那一張地圖（整個網站只有一張） */
let currentMap: MapLibreMap | null = null;

/** 地圖重新算大小：手機版從別的分頁切回行程時呼叫（藏起來的時候版面可能變過） */
export function resizeMap() {
  currentMap?.resize();
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeLabelsRef = useRef<Map<string, Marker>>(new Map());
  // 確定的行程的交通標籤、每個點的 💬／❤️（T15m）
  const legLabelsRef = useRef<Marker[]>([]);
  const badgesRef = useRef<Map<string, Marker>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0); // 地圖移動時重畫小卡片的位置
  const canHover = useCanHover();
  const canHoverRef = useRef(canHover);
  canHoverRef.current = canHover;
  const hideTimer = useRef<number | null>(null);

  const places = useData((s) => s.places);
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);
  const day = useApp((s) => s.day);
  const hoveredId = useApp((s) => s.hoveredId);
  const previewId = useApp((s) => s.previewId);
  const detailId = useApp((s) => s.detailId);
  const exploreTarget = useApp((s) => s.exploreTarget);
  const camera = useApp((s) => s.camera);
  const mode = useApp((s) => s.mode);
  const highlights = useApp((s) => s.highlights);
  const compare = useApp((s) => s.compare);
  const routes = useApp((s) => s.routes);
  const proposal = useApp((s) => s.proposal);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  // 行程改了（T15m）：順序編號、變淡要重畫
  const days = useData((s) => s.days);
  const plan = usePlan((s) => s.plan);
  const votes = useShared((s) => s.votes);
  // 點開的交通卡（那段的兩端照那段的號碼、其他路線變淡）、整趟點亮的那天
  const legOpen = useUi((s) => s.legOpen);
  const tripFocusDay = useApp((s) => s.tripFocusDay);

  // 點了一個點：電腦版右側切到探索、捲到那張卡片（再點卡片開詳情）；觸控先出小卡片，同一點再點一次開詳情
  const pick = (id: string | null) => {
    const s = appStore.getState();
    if (!id) {
      s.openPreview(null);
      return;
    }
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      showInExplore(id);
      return;
    }
    if (s.previewId === id) s.openDetail(id);
    else s.openPreview(id);
    s.hover(id);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const cancelHide = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => {
      appStore.getState().openPreview(null);
      appStore.getState().hover(null);
    }, 350);
  };
  const scheduleHideRef = useRef(scheduleHide);
  scheduleHideRef.current = scheduleHide;

  // 地圖只建立一次
  useEffect(() => {
    const { places: ps, areas: as } = dataStore.getState();
    const b: Bbox = initialExtent(as, ps) ?? [136.5, 34.2, 137.1, 34.65];
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: STYLE_URL,
      bounds: [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: true },
      // 手機上兩指旋轉容易誤觸，地圖一律朝北
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    currentMap = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    const reportView = () => {
      const bounds = map.getBounds();
      const c = map.getCenter();
      appStore.getState().setView({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      });
      containerRef.current?.classList.toggle('show-badges', map.getZoom() >= BADGE_ZOOM);
    };

    map.on('load', () => {
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      addMapIcons(map);
      // 縮小時是類別色的小點；放大到 ICON_ZOOM 換成圖標。選定那天的點不畫在這裡（畫成編號圓）
      map.addLayer({
        id: 'places-circle',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'mark'], ''],
        layout: { 'circle-sort-key': ['-', 1, ['get', 'dim']] },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['match', ['get', 'tier'], 'S', 6, 'A', 4.5, 3], 12, ['match', ['get', 'tier'], 'S', 8.5, 'A', 6, 4.5]],
          'circle-color': typeColorExpr as never,
          'circle-opacity': ['step', ['zoom'], ['case', ['==', ['get', 'dim'], 1], 0.25, 0.95], ICON_ZOOM, 0],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': ['step', ['zoom'], ['case', ['==', ['get', 'dim'], 1], 0.25, 1], ICON_ZOOM, 0],
        },
      });
      map.addLayer({
        id: 'places-icon',
        type: 'symbol',
        source: 'places',
        minzoom: ICON_ZOOM,
        filter: ['==', ['get', 'mark'], ''],
        layout: {
          'icon-image': ['concat', 'icon-', ['get', 'type']],
          // S 大、B 小，拉開差距讓好的點顯眼（整體密度不變）
          'icon-size': ['match', ['get', 'tier'], 'S', 1.2, 'A', 0.9, 0.72],
          'icon-allow-overlap': true,
          'symbol-sort-key': ['+', ['*', ['get', 'dim'], 10], ['match', ['get', 'tier'], 'S', 0, 'A', 1, 2]],
        },
        paint: { 'icon-opacity': ['case', ['==', ['get', 'dim'], 1], 0.3, 1] },
      });
      // 選定那天的點：類型色的圓（和時間軸的編號一樣），寫「宿」「1」「2」…
      map.addLayer({
        id: 'places-mark',
        type: 'circle',
        source: 'places',
        filter: ['!=', ['get', 'mark'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 13],
          'circle-color': ['get', 'typeColor'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
      // 點時間軸的卡片時，那個編號圓放大再縮回來（pulseMark）；蓋在 places-mark 上、文字下面
      map.addLayer({
        id: 'places-mark-pulse',
        type: 'circle',
        source: 'places',
        filter: PULSE_OFF,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 13],
          'circle-color': ['get', 'typeColor'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'places-mark-text',
        type: 'symbol',
        source: 'places',
        filter: ['!=', ['get', 'mark'], ''],
        layout: {
          'text-field': ['get', 'mark'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['case', ['>', ['length', ['get', 'mark']], 2], 9, 13],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      });
      // 選定那天的點一律寫名稱，看得出順序是哪幾個地方
      map.addLayer({
        id: 'places-mark-label',
        type: 'symbol',
        source: 'places',
        filter: ['!=', ['get', 'mark'], ''],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [1.3, 0],
          'text-optional': true,
        },
        paint: { 'text-color': '#24292f', 'text-halo-color': '#fff', 'text-halo-width': 1.8 },
      });
      map.addLayer({
        id: 'places-label',
        type: 'symbol',
        source: 'places',
        minzoom: 13,
        filter: ['all', ['==', ['get', 'dim'], 0], ['==', ['get', 'mark'], '']],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [1.2, 0],
          'text-optional': true,
        },
        paint: { 'text-color': '#24292f', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
      map.addLayer({
        id: 'places-focus',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 17],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#24292f',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'places-flash',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 14, 24],
          'circle-color': '#ffd33d',
          'circle-opacity': 0.55,
          'circle-stroke-color': '#bf8700',
          'circle-stroke-width': 2,
        },
      });

      // 選中的點（打開詳情、點了跳到探索卡片）：水滴形的大圖釘，尖端在點上，任何縮放都看得到
      map.addLayer({
        id: 'places-pin',
        type: 'symbol',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'type']],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });

      addOverlayLayers(map);

      // 點了哪個點；手機上手指比較粗，點的周圍留一點空間。好幾個點重疊時，選最靠近手指的那個
      const placeAt = (p: { x: number; y: number }): string | null => {
        const pad = 10;
        const feats = map.queryRenderedFeatures(
          [
            [p.x - pad, p.y - pad],
            [p.x + pad, p.y + pad],
          ],
          { layers: PICK_LAYERS },
        );
        let best: { id: string; d: number } | null = null;
        for (const f of feats) {
          const [x, y] = (f.geometry as GeoJSON.Point).coordinates;
          const pt = map.project([x, y]);
          const d = Math.hypot(pt.x - p.x, pt.y - p.y);
          if (!best || d < best.d) best = { id: String(f.properties.id), d };
        }
        return best?.id ?? null;
      };
      // 整趟時點到哪一天的行程線（沒點到是 null）
      const tripLineAt = (p: { x: number; y: number }): string | null => {
        if (appStore.getState().day !== 'all') return null;
        const pad = 6;
        const hit = map.queryRenderedFeatures(
          [
            [p.x - pad, p.y - pad],
            [p.x + pad, p.y + pad],
          ],
          { layers: ['itinerary-line'] },
        )[0];
        return hit ? String(hit.properties.date) : null;
      };
      map.on('click', (e: MapMouseEvent) => {
        closeMapPanel();
        closeTimetable();
        const id = placeAt(e.point);
        pickRef.current(id);
        // 整趟：點某天的路線 → 那天亮、其他天淡；點空白處清掉（點到點不動）
        if (!id) appStore.getState().setTripFocusDay(tripLineAt(e.point));
      });
      map.on('mousemove', PICK_LAYERS, (e) => {
        if (!canHoverRef.current) return;
        const id = String(e.features?.[0]?.properties.id ?? '');
        if (!id) return;
        cancelHideRef.current();
        map.getCanvas().style.cursor = 'pointer';
        const s = appStore.getState();
        if (s.previewId !== id) s.openPreview(id);
        if (s.hoveredId !== id) s.hover(id);
      });
      map.on('mouseleave', PICK_LAYERS, () => {
        map.getCanvas().style.cursor = '';
        if (canHoverRef.current) scheduleHideRef.current();
      });
      map.on('move', () => setTick((n) => n + 1));
      map.on('moveend', reportView);
      reportView();
      setLoaded(true);
    });

    // 版面改變（切到探索模式、手機轉向）時地圖要重新算大小
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);

    if (import.meta.env.DEV) {
      // Playwright 測試和 Claude in Chrome 檢查畫面用：算出點的像素位置、讀狀態
      (window as unknown as Record<string, unknown>).__th = {
        map,
        appStore,
        dataStore,
        uiStore,
        shared,
        commands,
        visual: (id: string) => {
          const p = dataStore.getState().byId.get(id);
          const s = appStore.getState();
          return p ? placeVisual(p, s.filter, s.day, dataStore.getState().days, s.query) : null;
        },
      };
    }

    return () => {
      ro.disconnect();
      routeLabelsRef.current.forEach((m) => m.remove());
      routeLabelsRef.current.clear();
      legLabelsRef.current.forEach((m) => m.remove());
      badgesRef.current.forEach((m) => m.remove());
      badgesRef.current.clear();
      map.remove();
      mapRef.current = null;
      if (currentMap === map) currentMap = null;
    };
  }, []);

  const cancelHideRef = useRef(cancelHide);
  cancelHideRef.current = cancelHide;

  // 資料點、篩選、選定的天、行程 → 重畫
  useEffect(() => {
    if (!loaded) return;
    const marks = itineraryMarks(plan, day, legOpen, tripFocusDay);
    (mapRef.current!.getSource('places') as GeoJSONSource).setData(featureCollection(places, marks));
  }, [loaded, places, filter, query, day, days, plan, byId, mode, votes, legOpen, tripFocusDay]);

  // 選中的點（詳情、探索捲到的卡片）：換成水滴圖釘，原本的圖標藏起來；只有小卡片的點：框起來
  // 滑鼠移過去、圖片牆點了的點：閃一下
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const pinned = detailId ?? (mode === 'explore' || mode === 'wish' ? exploreTarget?.id : null) ?? '';
    map.setFilter('places-pin', ['==', ['get', 'id'], pinned]);
    map.setFilter('places-icon', ['all', ['==', ['get', 'mark'], ''], ['!=', ['get', 'id'], pinned]]);
    map.setFilter('places-circle', ['all', ['==', ['get', 'mark'], ''], ['!=', ['get', 'id'], pinned]]);
    map.setFilter('places-focus', ['==', ['get', 'id'], pinned ? '' : (previewId ?? '')]);
  }, [loaded, previewId, detailId, exploreTarget, mode]);

  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    map.setFilter('places-flash', ['==', ['get', 'id'], hoveredId ?? '']);
    if (!hoveredId) return;
    // 閃幾下就停
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      if (!mapRef.current) return;
      map.setPaintProperty('places-flash', 'circle-opacity', n % 2 ? 0.15 : 0.55);
      if (n >= 5) window.clearInterval(timer);
    }, 220);
    return () => {
      window.clearInterval(timer);
      mapRef.current?.setPaintProperty('places-flash', 'circle-opacity', 0.55);
    };
  }, [loaded, hoveredId]);

  // 地圖指令（T12）：標示、比較
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const { byId } = dataStore.getState();
    (map.getSource(OVERLAY_SOURCES.highlights) as GeoJSONSource).setData(highlightFeatures(highlights, byId));
    (map.getSource(OVERLAY_SOURCES.compare) as GeoJSONSource).setData(compareFeatures(compare, byId));
  }, [loaded, highlights, compare]);

  // 路線：線畫在圖層，中間的標籤（交通圖示＋8 分）是 DOM 標記
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    (map.getSource(OVERLAY_SOURCES.routes) as GeoJSONSource).setData(routeFeatures(routes));
    const labels = routeLabels(routes);
    const keep = new Set(labels.map((l) => l.id));
    routeLabelsRef.current.forEach((m, id) => {
      if (keep.has(id)) return;
      m.remove();
      routeLabelsRef.current.delete(id);
    });
    for (const l of labels) {
      let m = routeLabelsRef.current.get(l.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'route-label';
        el.dataset.route = l.id;
        m = new Marker({ element: el }).setLngLat(l.coords).addTo(map);
        routeLabelsRef.current.set(l.id, m);
      }
      m.setLngLat(l.coords);
      m.getElement().innerHTML = routeLabelHtml(l.mode, l.text);
    }
  }, [loaded, routes]);

  // AI 的提議：虛線、半透明（interaction-design §0）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const f = proposal ? proposalFeatures(proposal, itinerary, dataStore.getState().byId, DATES) : { points: empty, lines: empty };
    (map.getSource(OVERLAY_SOURCES.proposalPoints) as GeoJSONSource).setData(f.points);
    (map.getSource(OVERLAY_SOURCES.proposalLines) as GeoJSONSource).setData(f.lines);
  }, [loaded, proposal, itinerary]);

  // 點開某一段交通時，其他行程路線變淡（只亮那一段）；收起來還原
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const dim = legOpen != null;
    map.setPaintProperty('itinerary-line', 'line-opacity', dim ? 0.1 : ITINERARY_LINE_OPACITY);
    map.setPaintProperty('itinerary-casing', 'line-opacity', dim ? 0.1 : ITINERARY_CASING_OPACITY);
    map.setPaintProperty('itinerary-arrow', 'icon-opacity', dim ? 0.15 : 1);
  }, [loaded, legOpen]);

  const routesVersion = useApp((s) => s.routesVersion);
  // 確定的行程（T15m）：每天的路線、備選的空心圈、選定那天的交通標籤
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const f = itineraryFeatures(itinerary, plan, byId, DATES, day, itineraryPathOf, tripFocusDay);
    (map.getSource(OVERLAY_SOURCES.itineraryLines) as GeoJSONSource).setData(f.lines);
    (map.getSource(OVERLAY_SOURCES.itineraryAlts) as GeoJSONSource).setData(f.alts);
    legLabelsRef.current.forEach((m) => m.remove());
    legLabelsRef.current = f.legs.map((l) => {
      const el = document.createElement('div');
      el.className = 'route-label leg-label';
      el.innerHTML = routeLabelHtml(l.mode, l.text);
      return new Marker({ element: el }).setLngLat(l.coords).addTo(map);
    });
  }, [loaded, itinerary, plan, byId, day, routesVersion, tripFocusDay]);

  // 每個點的 ❤️ 數（放大到 BADGE_ZOOM 才顯示）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const likes = new Map([...voteCounts(votes)].filter(([, c]) => c.like > 0).map(([id, c]) => [id, c.like]));
    const badges = placeBadges(byId, likes);
    const keep = new Set(badges.map((b) => b.id));
    badgesRef.current.forEach((m, id) => {
      if (keep.has(id)) return;
      m.remove();
      badgesRef.current.delete(id);
    });
    for (const b of badges) {
      let m = badgesRef.current.get(b.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'place-badge';
        el.dataset.id = b.id;
        m = new Marker({ element: el, offset: [18, -16] }).setLngLat(b.coords).addTo(map);
        badgesRef.current.set(b.id, m);
      }
      m.setLngLat(b.coords);
      m.getElement().textContent = b.text;
    }
  }, [loaded, votes, byId]);

  // 編號圓跳一下：pulse 圖層的半徑在 0.8 秒內放大到 1.5 倍再回來
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      map.setFilter('places-mark-pulse', PULSE_OFF);
    };
    const onPulse = (e: Event) => {
      stop();
      map.setFilter('places-mark-pulse', ['all', ['!=', ['get', 'mark'], ''], ['==', ['get', 'id'], (e as CustomEvent<string>).detail]]);
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = (now - t0) / PULSE_MS;
        if (t >= 1) return stop();
        const k = 1 + 0.5 * Math.sin(Math.PI * t);
        map.setPaintProperty('places-mark-pulse', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 8, 10 * k, 14, 13 * k]);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener(PULSE_EVENT, onPulse);
    return () => {
      window.removeEventListener(PULSE_EVENT, onPulse);
      stop();
    };
  }, [loaded]);

  // 移動地圖的請求（跳到區域、T12 的 focus）
  useEffect(() => {
    if (!loaded || !camera) return;
    const map = mapRef.current!;
    if (camera.bbox) {
      const [w, s, e, n] = camera.bbox;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        // 上方浮著日期列
        { padding: { top: 90, bottom: 60, left: 60, right: 60 }, maxZoom: camera.zoom ?? 15, duration: 600 },
      );
    } else if (camera.center) {
      map.flyTo({ center: camera.center, zoom: camera.zoom ?? Math.max(map.getZoom(), 14), duration: 600 });
    }
  }, [loaded, camera]);

  // 切換地圖／探索時版面高度會變
  useEffect(() => {
    mapRef.current?.resize();
  }, [mode]);

  const previewPlace = previewId && !detailId ? dataStore.getState().byId.get(previewId) : null;
  const previewPos = previewPlace && mapRef.current ? mapRef.current.project(previewPlace.coords) : null;

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" data-testid="map" />
      <MapCommandBars />
      {previewPlace && previewPos && (
        <PreviewCard
          place={previewPlace}
          anchor={canHover ? { x: previewPos.x, y: previewPos.y } : null}
          onEnter={cancelHide}
          onLeave={() => canHover && scheduleHide()}
        />
      )}
    </div>
  );
}
