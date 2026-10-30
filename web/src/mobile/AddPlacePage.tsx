// 手機的加地點整頁（T31 spec §3「手機」）：蓋在最上面（和詳情同一層規則，詳情開著時蓋在詳情上，存完或取消回到詳情）。
// 上半是自己的一張小地圖（新的 MapLibre，同一個樣式；主地圖在別的分頁是藏起來的）：圖釘固定在正中央（CSS，不是 Marker），拖地圖對準，停下來時更新位置。
// 下半是表單（AddPlaceForm），自己捲動，鍵盤打開時按鈕捲得到。
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { Map as MapLibreMap } from 'maplibre-gl';
import { addPlaceStore, useAddPlace } from '../addPlaceStore.ts';
import { bindAddLayer } from './mobileStore.ts';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { STYLE_URL } from '../components/MapView.tsx';
import { Icon } from '../components/Icon.tsx';
import { AddPlaceForm } from '../shared/ui/AddPlaceForm.tsx';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import type { LonLat } from '../data/types.ts';

// 加地點整頁也是一層 history（mobileStore.bindAddLayer）
bindAddLayer({ isOpen: () => !!addPlaceStore.getState().draft, cancel: () => addPlaceStore.getState().cancel() }, (onChange) =>
  addPlaceStore.subscribe((s) => onChange(!!s.draft)),
);

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

function AddMap() {
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
    const map = new MapLibreMap({ container: ref.current!, style: STYLE_URL, center: start, zoom: 16, attributionControl: { compact: true } });
    mapRef.current = map;
    // 還沒有位置（打名稱找不到、地圖指的不會）：位置就是小地圖的中心，使用者拖了再更新
    if (!addPlaceStore.getState().draft?.coords) addPlaceStore.getState().patch({ coords: start });
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
    return () => {
      delete (window as any).__thAddMap;
      mapRef.current = null;
      map.remove();
    };
  }, []);
  return <div ref={ref} className="m-add-map" data-testid="m-add-map" />;
}

export function AddPlacePage() {
  const open = useAddPlace((s) => !!s.draft);
  const edit = useAddPlace((s) => s.draft?.mode === 'edit');
  if (!open) return null;
  return (
    <section className="m-full m-add" data-testid="m-add-page" aria-label={edit ? '修改地點' : '加一個地點'}>
      <div className="m-add-top">
        <AddMap />
        <button type="button" className="m-add-back" onClick={() => addPlaceStore.getState().cancel()} aria-label="返回" data-testid="m-add-back">
          <Icon name="back" size={24} />
        </button>
        <p className="m-add-hint">拖地圖，讓圖釘對準店門口</p>
        <svg className="m-add-pin" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true" data-testid="m-add-pin">
          <path d="M17 42s-14-13.5-14-24A14 14 0 0 1 31 18c0 10.5-14 24-14 24z" fill="#2b3a67" stroke="#fff" strokeWidth="2.5" />
          <circle cx="17" cy="18" r="5" fill="#fff" />
        </svg>
      </div>
      <div className="m-add-form">
        <AddPlaceForm surface="mobile" />
      </div>
    </section>
  );
}
