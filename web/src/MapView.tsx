import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
// maplibre-gl v6 的 worker 是另一個檔案，用 import.meta.url 找；經過 Vite 打包後會找不到，所以讓 Vite 打包 worker 再指定網址
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AREA_COLORS, TYPE_COLORS } from './data';
import { POINT_TYPES, type Area, type Bbox, type Point, type PointType } from './types';

setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export interface MapViewHandle {
  fitBbox(bbox: Bbox): void;
  flyTo(coords: [number, number]): void;
}

interface Props {
  points: Point[];
  areas: Area[];
  visibleTypes: Record<PointType, boolean>;
  showBbox: boolean;
  showLabels: boolean;
  initialBbox: Bbox;
  selectedKey: string | null;
  flaggedKeys: Set<string>;
  onPick(keys: string[]): void;
}

const circleLayer = (t: PointType) => `pt-${t}`;
const labelLayer = (t: PointType) => `pt-${t}-label`;

function pointsGeoJSON(points: Point[], flagged: Set<string>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points
      .filter((p) => p.coords)
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p.coords! },
        properties: { key: p.key, type: p.type, label: p.label, fixture: p.fixture, flagged: flagged.has(p.key) },
      })),
  };
}

function areasGeoJSON(areas: Area[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.flatMap((a) => {
      const [w, s, e, n] = a.bbox;
      const color = AREA_COLORS[a.id] ?? '#555';
      return [
        {
          type: 'Feature' as const,
          geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
          properties: { id: a.id, color },
        },
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [w, n] },
          properties: { id: a.id, color, label: `${a.name.zh ?? a.name.ja} bbox` },
        },
      ];
    }),
  };
}

export const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  // 事件處理器裡要拿到最新的 onPick
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  useImperativeHandle(ref, () => ({
    fitBbox(bbox) {
      mapRef.current?.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 20, duration: 600 });
    },
    flyTo(coords) {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 14), duration: 600 });
    },
  }));

  useEffect(() => {
    const b = props.initialBbox;
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: STYLE_URL,
      bounds: [[b[0], b[1]], [b[2], b[3]]],
      fitBoundsOptions: { padding: 20 },
      // 手機上版權文字會蓋住地圖，收成 ⓘ 按鈕
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'area-bbox',
        type: 'line',
        source: 'areas',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2] },
      });
      map.addLayer({
        id: 'area-bbox-label',
        type: 'symbol',
        source: 'areas',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-anchor': 'top-left',
          'text-offset': [0.3, 0.3],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });

      map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      for (const t of POINT_TYPES) {
        map.addLayer({
          id: circleLayer(t),
          type: 'circle',
          source: 'points',
          filter: ['==', ['get', 'type'], t],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8],
            'circle-color': TYPE_COLORS[t],
            'circle-opacity': ['case', ['get', 'fixture'], 0.55, 0.95],
            // 有問題的點（座標不在所屬區域內、ID 重複…）用紅框標出來
            'circle-stroke-color': ['case', ['get', 'flagged'], '#ff0000', '#ffffff'],
            'circle-stroke-width': ['case', ['get', 'flagged'], 3, 1.5],
          },
        });
        map.addLayer({
          id: labelLayer(t),
          type: 'symbol',
          source: 'points',
          minzoom: 11,
          filter: ['==', ['get', 'type'], t],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-anchor': 'left',
            'text-offset': [0.8, 0],
            'text-optional': true,
          },
          paint: { 'text-color': TYPE_COLORS[t], 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
        });
      }
      map.addLayer({
        id: 'pt-selected',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'key'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 14],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#000',
          'circle-stroke-width': 3,
        },
      });

      const circleLayers = POINT_TYPES.map(circleLayer);
      map.on('click', (e) => {
        // 點的周圍留一點空間，手機上比較好點；重疊的點全部列出來
        const pad = 8;
        const feats: MapGeoJSONFeature[] = map.queryRenderedFeatures(
          [
            [e.point.x - pad, e.point.y - pad],
            [e.point.x + pad, e.point.y + pad],
          ],
          { layers: circleLayers.filter((id) => map.getLayoutProperty(id, 'visibility') !== 'none') },
        );
        const keys = [...new Set(feats.map((f) => String(f.properties.key)))];
        onPickRef.current(keys);
      });
      for (const id of circleLayers) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
      setLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // 地圖只建立一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (mapRef.current!.getSource('points') as GeoJSONSource).setData(pointsGeoJSON(props.points, props.flaggedKeys));
  }, [loaded, props.points, props.flaggedKeys]);

  useEffect(() => {
    if (!loaded) return;
    (mapRef.current!.getSource('areas') as GeoJSONSource).setData(areasGeoJSON(props.areas));
  }, [loaded, props.areas]);

  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    for (const t of POINT_TYPES) {
      const vis = props.visibleTypes[t] ? 'visible' : 'none';
      map.setLayoutProperty(circleLayer(t), 'visibility', vis);
      map.setLayoutProperty(labelLayer(t), 'visibility', props.visibleTypes[t] && props.showLabels ? 'visible' : 'none');
    }
    const bboxVis = props.showBbox ? 'visible' : 'none';
    map.setLayoutProperty('area-bbox', 'visibility', bboxVis);
    map.setLayoutProperty('area-bbox-label', 'visibility', bboxVis);
  }, [loaded, props.visibleTypes, props.showBbox, props.showLabels]);

  useEffect(() => {
    if (!loaded) return;
    mapRef.current!.setFilter('pt-selected', ['==', ['get', 'key'], props.selectedKey ?? '']);
  }, [loaded, props.selectedKey]);

  return <div ref={containerRef} className="map" />;
});
