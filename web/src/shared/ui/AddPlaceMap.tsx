// 加地點彈窗的小地圖（T31、T33）：新的一張 MapLibre、同一個樣式。圖釘固定在正中央（CSS，不是 Marker），拖地圖對準，停下來時更新位置。
// 網頁、手機同一個（T33 前網頁的圖釘在主地圖上）。

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { addPlaceStore } from '../../addPlaceStore.ts';
import { appStore } from '../../store.ts';
import { dataStore } from '../../dataStore.ts';
import { loadMapLib, STYLE_URL } from '../../components/mapRuntime.ts';
import { TYPE_COLORS } from '../../lib/typeStyle.ts';
import type { LonLat } from '../../data/types.ts';

/** 主地圖還沒有畫面時（還沒載入）的中心：伊勢志摩中間 */
const FALLBACK_CENTER: LonLat = [136.85, 34.45];

/** 資料點的小圓點（類型色），讓人知道附近有什麼 */
function placeDots() {
  return {
    type: 'FeatureCollection' as const,
    features: dataStore.getState().places.map((p) => ({
      type: 'Feature' as const,
      properties: { color: TYPE_COLORS[p.type] },
      geometry: { type: 'Point' as const, coordinates: p.coords },
    })),
  };
}

export function AddPlaceMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const coords = useStore(addPlaceStore, (s) => s.draft?.coords ?? null);
  // 位置從外面改了（草稿換了位置）：小地圖跟過去；差在 1e-6 以內是自己 moveend 寫回去的，不動（避免來回）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    const c = map.getCenter();
    if (Math.abs(c.lng - coords[0]) > 1e-6 || Math.abs(c.lat - coords[1]) > 1e-6) map.jumpTo({ center: coords });
  }, [coords]);
  useEffect(() => {
    const start = addPlaceStore.getState().draft?.coords ?? appStore.getState().view?.center ?? FALLBACK_CENTER;
    // 還沒有位置（打名稱找不到、地圖指的不會）：位置就是小地圖的中心，使用者拖了再更新
    if (!addPlaceStore.getState().draft?.coords) addPlaceStore.getState().patch({ coords: start });
    let gone = false;
    let remove: (() => void) | null = null;
    void loadMapLib().then(({ Map: MapLibre }) => {
      if (gone || !ref.current) return;
      const map = new MapLibre({ container: ref.current, style: STYLE_URL, center: start, zoom: 16, attributionControl: { compact: true } });
      mapRef.current = map;
    map.on('moveend', () => {
      const c = map.getCenter();
      addPlaceStore.getState().patch({ coords: [c.lng, c.lat] });
    });
    map.on('load', () => {
      map.addSource('dots', { type: 'geojson', data: placeDots() });
      map.addLayer({
        id: 'dots',
        type: 'circle',
        source: 'dots',
        paint: { 'circle-radius': 4, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      });
    });
    // 測試用：e2e 拖地圖不好對準，直接讀這張地圖
      if (import.meta.env.DEV) (window as any).__thAddMap = map;
      remove = () => map.remove();
    });
    return () => {
      gone = true;
      delete (window as any).__thAddMap;
      mapRef.current = null;
      remove?.();
    };
  }, []);
  return (
    <div className="apd-map-wrap">
      <div ref={ref} className="apd-map" data-testid="add-map" />
      <p className="apd-map-hint">拖地圖，讓圖釘對準店門口</p>
      <svg className="apd-pin" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true" data-testid="add-pin">
        <path d="M17 42s-14-13.5-14-24A14 14 0 0 1 31 18c0 10.5-14 24-14 24z" fill="#2b3a67" stroke="#fff" strokeWidth="2.5" />
        <circle cx="17" cy="18" r="5" fill="#fff" />
      </svg>
    </div>
  );
}
