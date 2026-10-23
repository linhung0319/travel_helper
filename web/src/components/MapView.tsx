import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
// maplibre-gl v6 的 worker 是另一個檔案；經過 Vite 打包後用 import.meta.url 找不到，所以讓 Vite 打包 worker 再指定網址
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { useApp, useCanHover, useData, usePlan, useShared } from '../hooks.ts';
import { suggestionCounts, voteCounts } from '../sharedStore.ts';
import { initialExtent } from '../lib/areas.ts';
import { photoCandidates } from '../lib/photos.ts';
import { TYPE_COLORS, TYPE_ICONS } from '../lib/typeStyle.ts';
import { dayColor, placeVisual } from '../lib/visual.ts';
import { tripDates } from '../lib/trip.ts';
import { PLACE_TYPES, type Bbox, type Place } from '../data/types.ts';
import { PreviewCard } from './PreviewCard.tsx';
import { addOverlayLayers, OVERLAY_SOURCES } from './mapOverlayLayers.ts';
import { compareFeatures, highlightFeatures, itineraryFeatures, placeBadges, proposalFeatures, routeFeatures, routeLabels } from '../lib/overlays.ts';
import { HIGHLIGHT_STYLES } from '../store.ts';
import { commands } from '../appCommands.ts';
import { MapCommandBars } from './MapCommandBars.tsx';

setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** 放大到這裡以上，S、A 級顯示小張照片，其他只顯示小點（interaction-design §7） */
export const PHOTO_MARKER_ZOOM = 13;
/** 這個縮放以上才顯示每個點的 💬／❤️ 數字 */
const BADGE_ZOOM = 10;
const DATES = tripDates();

const typeColorExpr = ['match', ['get', 'type'], ...PLACE_TYPES.flatMap((t) => [t, TYPE_COLORS[t]]), '#555'];

function featureCollection(places: Place[]): FeatureCollection {
  const { filter, day } = appStore.getState();
  const { days } = dataStore.getState();
  return {
    type: 'FeatureCollection',
    features: places.map((p) => {
      const v = placeVisual(p, filter, day, days);
      return {
        type: 'Feature',
        id: undefined,
        geometry: { type: 'Point', coordinates: p.coords },
        properties: {
          id: p.id,
          type: p.type,
          tier: p.tier ?? '',
          label: p.name.zh || p.name.ja,
          dim: v.dim ? 1 : 0,
          order: v.order ?? 0,
          dayColor: day === 'all' ? '' : dayColor(DATES, day),
          photo: (p.tier === 'S' || p.tier === 'A') && p.photos.length > 0 ? 1 : 0,
        },
      };
    }),
  };
}

/** S、A 級的照片標記（DOM）。照片打不開時依序換下一張，全部打不開就換成類別色的圓點 */
function photoMarkerElement(p: Place, onPick: (id: string) => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `photo-marker tier-${p.tier}`;
  el.dataset.id = p.id;
  el.setAttribute('aria-label', p.name.zh || p.name.ja);
  el.style.borderColor = TYPE_COLORS[p.type];
  const urls = photoCandidates(p.photos, 200);
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  let i = 0;
  img.onerror = () => {
    i += 1;
    if (i < urls.length) img.src = urls[i];
    else {
      img.remove();
      el.classList.add('photo-marker-fallback');
      el.style.background = TYPE_COLORS[p.type];
      el.textContent = TYPE_ICONS[p.type];
    }
  };
  img.src = urls[0];
  el.appendChild(img);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onPick(p.id);
  });
  el.addEventListener('mouseenter', () => el.dispatchEvent(new CustomEvent('th-hover', { bubbles: true, detail: p.id })));
  return el;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
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
  const day = useApp((s) => s.day);
  const hoveredId = useApp((s) => s.hoveredId);
  const previewId = useApp((s) => s.previewId);
  const detailId = useApp((s) => s.detailId);
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
  const suggestions = useShared((s) => s.suggestions);
  const votes = useShared((s) => s.votes);

  // 點了一個點：滑鼠直接開詳情（小卡片已經在移上去時出現）；觸控先出小卡片，同一點再點一次開詳情
  const pick = (id: string | null) => {
    const s = appStore.getState();
    if (!id) {
      s.openPreview(null);
      return;
    }
    if (canHoverRef.current || s.previewId === id) s.openDetail(id);
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
      containerRef.current?.classList.toggle('show-photo-markers', map.getZoom() >= PHOTO_MARKER_ZOOM);
      containerRef.current?.classList.toggle('show-badges', map.getZoom() >= BADGE_ZOOM);
    };

    map.on('load', () => {
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // 變淡的點畫在下面
      map.addLayer({
        id: 'places-circle',
        type: 'circle',
        source: 'places',
        layout: { 'circle-sort-key': ['-', 1, ['get', 'dim']] },
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            ['match', ['get', 'tier'], 'S', 6, 'A', 5, 3.5],
            14,
            ['match', ['get', 'tier'], 'S', 11, 'A', 9, 6],
          ],
          'circle-color': typeColorExpr as never,
          'circle-opacity': ['case', ['==', ['get', 'dim'], 1], 0.25, 0.95],
          'circle-stroke-color': ['case', ['>', ['get', 'order'], 0], ['get', 'dayColor'], '#ffffff'],
          'circle-stroke-width': ['case', ['>', ['get', 'order'], 0], 3, 1.5],
          'circle-stroke-opacity': ['case', ['==', ['get', 'dim'], 1], 0.25, 1],
        },
      });
      map.addLayer({
        id: 'places-order',
        type: 'symbol',
        source: 'places',
        filter: ['>', ['get', 'order'], 0],
        layout: {
          'text-field': ['to-string', ['get', 'order']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-offset': [0, -1.4],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#fff', 'text-halo-color': ['get', 'dayColor'], 'text-halo-width': 2.5 },
      });
      map.addLayer({
        id: 'places-label',
        type: 'symbol',
        source: 'places',
        minzoom: 12,
        filter: ['==', ['get', 'dim'], 0],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
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

      addOverlayLayers(map);

      map.on('click', (e: MapMouseEvent) => {
        const pad = 10; // 手機上手指比較粗，點的周圍留一點空間
        const feats = map.queryRenderedFeatures(
          [
            [e.point.x - pad, e.point.y - pad],
            [e.point.x + pad, e.point.y + pad],
          ],
          { layers: ['places-circle'] },
        );
        // 好幾個點重疊時，選最靠近手指的那個
        let best: { id: string; d: number } | null = null;
        for (const f of feats) {
          const [x, y] = (f.geometry as GeoJSON.Point).coordinates;
          const pt = map.project([x, y]);
          const d = Math.hypot(pt.x - e.point.x, pt.y - e.point.y);
          if (!best || d < best.d) best = { id: String(f.properties.id), d };
        }
        pickRef.current(best?.id ?? null);
      });
      map.on('mousemove', 'places-circle', (e) => {
        if (!canHoverRef.current) return;
        const id = String(e.features?.[0]?.properties.id ?? '');
        if (!id) return;
        cancelHideRef.current();
        map.getCanvas().style.cursor = 'pointer';
        const s = appStore.getState();
        if (s.previewId !== id) s.openPreview(id);
        if (s.hoveredId !== id) s.hover(id);
      });
      map.on('mouseleave', 'places-circle', () => {
        map.getCanvas().style.cursor = '';
        if (canHoverRef.current) scheduleHideRef.current();
      });
      map.on('move', () => setTick((n) => n + 1));
      map.on('moveend', reportView);
      reportView();
      setLoaded(true);
    });

    const onMarkerHover = (e: Event) => {
      if (!canHoverRef.current) return;
      const id = (e as CustomEvent<string>).detail;
      cancelHideRef.current();
      appStore.getState().openPreview(id);
      appStore.getState().hover(id);
    };
    containerRef.current!.addEventListener('th-hover', onMarkerHover);
    const onMarkerLeave = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('.photo-marker') && canHoverRef.current) scheduleHideRef.current();
    };
    containerRef.current!.addEventListener('mouseout', onMarkerLeave);

    // 版面改變（切到探索模式、手機轉向）時地圖要重新算大小
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);

    if (import.meta.env.DEV) {
      // Playwright 測試和 Claude in Chrome 檢查畫面用：算出點的像素位置、讀狀態
      (window as unknown as Record<string, unknown>).__th = {
        map,
        appStore,
        dataStore,
        commands,
        visual: (id: string) => {
          const p = dataStore.getState().byId.get(id);
          const s = appStore.getState();
          return p ? placeVisual(p, s.filter, s.day, dataStore.getState().days) : null;
        },
      };
    }

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      routeLabelsRef.current.forEach((m) => m.remove());
      routeLabelsRef.current.clear();
      legLabelsRef.current.forEach((m) => m.remove());
      badgesRef.current.forEach((m) => m.remove());
      badgesRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const cancelHideRef = useRef(cancelHide);
  cancelHideRef.current = cancelHide;

  // 資料點、篩選、選定的天、行程 → 重畫
  useEffect(() => {
    if (!loaded) return;
    (mapRef.current!.getSource('places') as GeoJSONSource).setData(featureCollection(places));
    for (const p of places) {
      const m = markersRef.current.get(p.id);
      if (m) m.getElement().classList.toggle('dim', placeVisual(p, filter, day, days).dim);
    }
  }, [loaded, places, filter, day, days]);

  // S、A 級的照片標記
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const { days } = dataStore.getState();
    const s = appStore.getState();
    for (const p of places) {
      if ((p.tier !== 'S' && p.tier !== 'A') || p.photos.length === 0 || markersRef.current.has(p.id)) continue;
      const el = photoMarkerElement(p, (id) => pickRef.current(id));
      el.classList.toggle('dim', placeVisual(p, s.filter, s.day, days).dim);
      markersRef.current.set(p.id, new Marker({ element: el }).setLngLat(p.coords).addTo(map));
    }
  }, [loaded, places]);

  // 小卡片或詳情的點：框起來；滑鼠移過去、圖片牆點了的點：閃一下
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    map.setFilter('places-focus', ['==', ['get', 'id'], detailId ?? previewId ?? '']);
    markersRef.current.forEach((m, id) => m.getElement().classList.toggle('focus', id === (detailId ?? previewId)));
  }, [loaded, previewId, detailId]);

  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    map.setFilter('places-flash', ['==', ['get', 'id'], hoveredId ?? '']);
    markersRef.current.forEach((m, id) => m.getElement().classList.toggle('flash', id === hoveredId));
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
    // 照片標記（DOM）蓋在圖層上面，另外加 class
    markersRef.current.forEach((m, id) => {
      const el = m.getElement();
      for (const st of HIGHLIGHT_STYLES) el.classList.toggle(`hl-${st}`, !!highlights[st]?.includes(id));
      el.classList.toggle('compared', compare.includes(id));
    });
  }, [loaded, highlights, compare]);

  // 路線：線畫在圖層，中間的標籤（🚶 8 分）是 DOM 標記，才放得了 emoji
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
      m.getElement().textContent = l.text;
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
    // 放大後照片標記（DOM）會蓋住圖層上的編號和 ×，所以照片標記自己也標出來
    const marks = new Map(f.points.features.map((x) => [String(x.properties?.id), x.properties as { status: string; order: number; color: string }]));
    markersRef.current.forEach((m, id) => {
      const el = m.getElement();
      const p = marks.get(id);
      el.classList.toggle('proposal-added', p?.status === 'added');
      el.classList.toggle('proposal-removed', p?.status === 'removed');
      if (p) {
        el.dataset.proposal = p.status === 'removed' ? '×' : String(p.order);
        el.style.setProperty('--proposal-color', p.color);
      } else delete el.dataset.proposal;
    });
  }, [loaded, proposal, itinerary]);

  // 確定的行程（T15m）：每天的路線、備選的空心圈、選定那天的交通標籤
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const f = itineraryFeatures(itinerary, plan, byId, DATES, day);
    (map.getSource(OVERLAY_SOURCES.itineraryLines) as GeoJSONSource).setData(f.lines);
    (map.getSource(OVERLAY_SOURCES.itineraryAlts) as GeoJSONSource).setData(f.alts);
    legLabelsRef.current.forEach((m) => m.remove());
    legLabelsRef.current = f.legs.map((l) => {
      const el = document.createElement('div');
      el.className = 'route-label leg-label';
      el.textContent = l.text;
      return new Marker({ element: el }).setLngLat(l.coords).addTo(map);
    });
  }, [loaded, itinerary, plan, byId, day]);

  // 每個點的 💬 建議數、❤️ 數（放大到 BADGE_ZOOM 才顯示）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const likes = new Map([...voteCounts(votes)].filter(([, c]) => c.like > 0).map(([id, c]) => [id, c.like]));
    const badges = placeBadges(byId, suggestionCounts(suggestions), likes);
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
  }, [loaded, suggestions, votes, byId]);

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
        { padding: 40, maxZoom: camera.zoom ?? 15, duration: 600 },
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
