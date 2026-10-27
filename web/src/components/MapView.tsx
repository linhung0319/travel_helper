// 整個網站的那一張地圖（MapLibre）：資料點、行程的路線和編號、AI 的標示，和三種標示（T15m 第七輪 §8.1）：
// - 指到（只有網頁，hoveredId）：滑鼠在卡片、清單列、時間軸卡片、地圖的點上，那個點稍微放大、加一圈淡灰光圈（places-hover）；不閃
// - 選中（selectedId，兩邊一樣）：類型色的水滴（DOM 標記，尖端在點上，頭裡寫編號；沒有編號寫類型圓章的字，interaction-design §12.5），旁邊的名稱變粗；
//   選中時跳 3 下（CSS 的 bounce，1.5 秒，影子跟著縮放；減少動態時不跳），再選一次、或地圖移動後它進入畫面時再跳
// - AI 指給你看：彩色圈、字母、AI 畫的路線（mapOverlayLayers.ts）
// 地圖怎麼動（§8.2）：選中一個點照 lib/mapCamera.selectCamera（可見範圍扣掉手機的行程面板、網頁浮在地圖上的詳情）；框範圍也讓開它們。
// 點地圖上的點照 §8.3（mapPick.ts）。行程分頁的地圖不套探索的篩選（§8.4）；想去分頁只畫想去的點，分還沒排、候選、已排三種樣子（§5.3），左下角圖例。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
// maplibre-gl v6 的 worker 是另一個檔案；經過 Vite 打包後用 import.meta.url 找不到，所以讓 Vite 打包 worker 再指定網址
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { DESKTOP_QUERY, useApp, useCanHover, useData, useIsDesktop, usePlan, useShared, useUi } from '../hooks.ts';
import { voteCounts } from '../sharedStore.ts';
import { initialExtent } from '../lib/areas.ts';
import { TYPE_COLORS, TYPE_GLYPHS, TYPE_INK } from '../lib/typeStyle.ts';
import { addMapIcons } from './mapIcons.ts';
import { dayColor, placeVisual } from '../lib/visual.ts';
import { tripDates } from '../lib/trip.ts';
import { EMPTY_FILTER } from '../lib/filter.ts';
import { PLACE_TYPES, type Bbox, type Place } from '../data/types.ts';
import { PreviewCard } from './PreviewCard.tsx';
import { addOverlayLayers, ITINERARY_CASING_OPACITY, ITINERARY_LINE_OPACITY, OVERLAY_SOURCES } from './mapOverlayLayers.ts';
import { compareFeatures, highlightFeatures, itineraryFeatures, itineraryMarks, placeBadges, proposalFeatures, routeFeatures, routeLabels } from '../lib/overlays.ts';
import { commands, itineraryPathOf } from '../appCommands.ts';
import { iconSvg } from '../lib/icons.ts';
import { routeLabelHtml } from '../lib/modeIcon.ts';
import { selectCamera, visibleArea, type ScreenRect } from '../lib/mapCamera.ts';
import { MapCommandBars } from './MapCommandBars.tsx';
import { pickPlace } from './mapPick.ts';
import { shared } from '../appShared.ts';
import { likedPlaces, placeDayStatus } from '../lib/wishlist.ts';
import { closeMapPanel, closeTimetable, uiStore } from '../uiStore.ts';
import { planStore } from '../planStore.ts';

setWorkerUrl(maplibreWorkerUrl);

/** 地圖的樣式（手機版詳情的小地圖也用） */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** 放大到這裡以上，小點換成類別圖標（像 Google Maps） */
export const ICON_ZOOM = 12;
/** 這個縮放以上才顯示每個點的想去數 */
const BADGE_ZOOM = 10;
const DATES = tripDates();
/** 文字的墨色（--ink） */
const INK = '#1c2840';
/** 指到的光圈（--ink-3） */
const HOVER_HALO = '#a3a9b8';

const typeColorExpr = ['match', ['get', 'type'], ...PLACE_TYPES.flatMap((t) => [t, TYPE_COLORS[t]]), '#4b5262'];

/** 水滴的外形（34×44，尖端在 (17, 42)；§草圖 九） */
const DROP_PATH = 'M17 42s-14-13.5-14-24A14 14 0 0 1 31 18c0 10.5-14 24-14 24z';

/** 選中的水滴（interaction-design §12.5）：類型色，頭裡是編號（mark），沒有編號是類型圓章的字（餐廳的字墨色）；
 *  底下的影子（ms-shadow）跟著跳縮放；旁邊是粗體的名稱（手機詳情的小地圖也用） */
export function selectedDropHtml(place: Place, mark: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const head = mark || TYPE_GLYPHS[place.type];
  const small = head.length > 2;
  return (
    `<svg class="ms-drop" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="${DROP_PATH}" fill="${TYPE_COLORS[place.type]}" stroke="#fff" stroke-width="2.5"/>` +
    `<text x="17" y="${small ? 22 : 23.5}" text-anchor="middle" font-size="${small ? 11 : 15}" font-weight="900" fill="${TYPE_INK[place.type]}" font-family="'Zen Maru Gothic', 'Noto Sans TC', system-ui, sans-serif">${esc(head)}</text></svg>` +
    `<span class="ms-shadow" aria-hidden="true"></span>` +
    `<span class="ms-name">${esc(place.name.zh || place.name.ja)}</span>`
  );
}

/** 想去分頁每個點是哪一段（§5.3）：還沒排、已是候選、已排（已排的用那天的顏色） */
type WishKind = 'unscheduled' | 'candidate' | 'scheduled';

/** marks：行程的編號（0、1、2…，overlays.itineraryMarks：某一天、點開的那段、整趟）；有編號的點畫成類型色的編號圓 */
function featureCollection(places: Place[], marks: Map<string, string>): FeatureCollection {
  const { filter, query, day, mode } = appStore.getState();
  const { days, itinerary } = dataStore.getState();
  const trip = mode === 'map';
  // 探索、想去時不因為「不在那天」變淡（找的是那天還沒排的點），只看篩選。
  // 行程分頁不套探索的篩選（§8.4）：選了某一天，那天以外的點淡；整趟時沒排進行程的點淡
  const dimDay = trip ? day : 'all';
  const liked = mode === 'wish' ? likedPlaces(shared.store.getState().votes) : null;
  const candidates = shared.store.getState().candidates;
  // 想去分頁只畫想去的點
  const shown = liked ? places.filter((p) => liked.has(p.id)) : places;
  return {
    type: 'FeatureCollection',
    features: shown.map((p) => {
      const v = placeVisual(p, trip ? EMPTY_FILTER : filter, dimDay, days, trip ? '' : query);
      let wish: WishKind | '' = '';
      let wishColor = '';
      if (liked) {
        const st = placeDayStatus(p.id, candidates, itinerary);
        wish = st.scheduled.length ? 'scheduled' : st.candidate.length ? 'candidate' : 'unscheduled';
        wishColor = st.scheduled.length ? dayColor(DATES, st.scheduled[0]) : '';
      }
      const dim = v.dim || (trip && day === 'all' && !days.has(p.id));
      return {
        type: 'Feature',
        id: undefined,
        geometry: { type: 'Point', coordinates: p.coords },
        properties: {
          id: p.id,
          type: p.type,
          tier: p.tier ?? '',
          label: p.name.zh || p.name.ja,
          dim: dim ? 1 : 0,
          mark: liked ? '' : (marks.get(p.id) ?? ''),
          typeColor: TYPE_COLORS[p.type],
          typeInk: TYPE_INK[p.type],
          wish,
          wishColor,
        },
      };
    }),
  };
}

/** 可以點的圖層（點的時候都要查）；選中的點不在這些圖層裡（畫成水滴，點水滴另外接） */
const PICK_LAYERS = ['places-circle', 'places-icon', 'places-mark', 'wish-dot', 'wish-candidate'];

/** 各圖層本來的 filter；選中的點另外排除 */
const BASE_FILTERS: Record<string, unknown[]> = {
  'places-circle': ['all', ['==', ['get', 'mark'], ''], ['==', ['get', 'wish'], '']],
  'places-icon': ['all', ['==', ['get', 'mark'], ''], ['==', ['get', 'wish'], '']],
  'wish-dot': ['any', ['==', ['get', 'wish'], 'unscheduled'], ['==', ['get', 'wish'], 'scheduled']],
  'wish-candidate': ['==', ['get', 'wish'], 'candidate'],
  'places-mark': ['!=', ['get', 'mark'], ''],
  'places-mark-text': ['!=', ['get', 'mark'], ''],
  'places-mark-label': ['!=', ['get', 'mark'], ''],
  'places-label': ['all', ['==', ['get', 'dim'], 0], ['==', ['get', 'mark'], '']],
};

/** 蓋在地圖上的東西：網頁蓋在地圖右側的詳情彈窗（蓋住右欄的不算）、手機的行程面板（藏起來的不算） */
function mapObstructions(): DOMRect[] {
  return [...document.querySelectorAll<HTMLElement>('.detail-float[data-at="map"], .m-trip-sheet')]
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => el.getBoundingClientRect());
}

/** 地圖上看得到的範圍（地圖容器的座標）：扣掉 obstructions（手機面板、網頁浮動詳情） */
export function visibleRect(map: MapLibreMap, obstructions: DOMRect[]): ScreenRect {
  const box = map.getContainer().getBoundingClientRect();
  const v = visibleArea(
    { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
    obstructions.map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
  );
  return { left: v.left - box.left, top: v.top - box.top, right: v.right - box.left, bottom: v.bottom - box.top };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  // 確定的行程的交通標籤、每個點的留言、想去數（T15m）
  const legLabelsRef = useRef<Marker[]>([]);
  const badgesRef = useRef<Map<string, Marker>>(new Map());
  // 選中的數字水滴；selectedRef 給地圖的事件讀（移動前後看它進入畫面沒有）
  const dropRef = useRef<Marker | null>(null);
  const anchorRef = useRef<Marker | null>(null);
  const selectedRef = useRef<Place | null>(null);
  const bounceNext = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0); // 地圖移動時重畫小卡片的位置
  const canHover = useCanHover();
  const desktop = useIsDesktop();
  const canHoverRef = useRef(canHover);
  canHoverRef.current = canHover;
  const hideTimer = useRef<number | null>(null);

  const places = useData((s) => s.places);
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);
  const day = useApp((s) => s.day);
  const hoveredId = useApp((s) => s.hoveredId);
  const selectedId = useApp((s) => s.selectedId);
  // 網頁詳情彈窗的那個點：選中的換成別的點（位置分頁點了「附近」的一列）時，它保持水滴但不跳（第八輪 §13.3 第 5 點）
  const detailId = useApp((s) => s.detailId);
  const selectSeq = useApp((s) => s.selectSeq);
  const previewId = useApp((s) => s.previewId);
  const camera = useApp((s) => s.camera);
  const mode = useApp((s) => s.mode);
  const highlights = useApp((s) => s.highlights);
  const compare = useApp((s) => s.compare);
  const routes = useApp((s) => s.routes);
  const legRoute = useApp((s) => s.legRoute);
  const proposal = useApp((s) => s.proposal);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  // 行程改了（T15m）：順序編號、變淡要重畫
  const days = useData((s) => s.days);
  const plan = usePlan((s) => s.plan);
  const votes = useShared((s) => s.votes);
  const candidates = useShared((s) => s.candidates);
  // 點開的交通卡（那段的兩端照那段的號碼、其他路線變淡）、整趟點亮的那天
  const legOpen = useUi((s) => s.legOpen);
  const tripFocusDay = useApp((s) => s.tripFocusDay);
  // 想去分頁不寫行程的編號（三種樣子取代）
  const marks = useMemo(() => (mode === 'wish' ? new Map<string, string>() : itineraryMarks(plan, day, legOpen, tripFocusDay)), [plan, day, legOpen, tripFocusDay, mode]);

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
  const cancelHideRef = useRef(cancelHide);
  cancelHideRef.current = cancelHide;

  /** 水滴跳一下（減少動態時不跳） */
  const bounce = () => {
    const el = dropRef.current?.getElement().querySelector<SVGElement>('.ms-drop');
    if (!el || reducedMotion()) return;
    el.classList.remove('bounce');
    void el.getBoundingClientRect();
    el.classList.add('bounce');
  };
  const bounceRef = useRef(bounce);
  bounceRef.current = bounce;

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
    // 縮放鈕只有網頁版（手機用兩指，地圖上只留「放大地圖」）
    if (window.matchMedia(DESKTOP_QUERY).matches) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
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
      // 指到（只有網頁）：點下面一圈淡灰光圈；畫在所有點的下面
      map.addLayer({
        id: 'places-hover',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 13, 14, 22],
          'circle-color': HOVER_HALO,
          'circle-opacity': 0.32,
          'circle-blur': 0.15,
        },
      });
      // 縮小時是類別色的小點；放大到 ICON_ZOOM 換成圖標。選定那天的點不畫在這裡（畫成編號圓）
      map.addLayer({
        id: 'places-circle',
        type: 'circle',
        source: 'places',
        filter: BASE_FILTERS['places-circle'] as never,
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
        filter: BASE_FILTERS['places-icon'] as never,
        layout: {
          'icon-image': ['concat', 'icon-', ['get', 'type']],
          // S 大、B 小，拉開差距讓好的點顯眼（整體密度不變）
          'icon-size': ['match', ['get', 'tier'], 'S', 1.2, 'A', 0.9, 0.72],
          'icon-allow-overlap': true,
          'symbol-sort-key': ['+', ['*', ['get', 'dim'], 10], ['match', ['get', 'tier'], 'S', 0, 'A', 1, 2]],
        },
        paint: { 'icon-opacity': ['case', ['==', ['get', 'dim'], 1], 0.3, 1] },
      });
      // 想去分頁（§5.3）：還沒排＝空心墨色圓、已排＝實心的那天的顏色；已是候選＝藍染色虛線圓（圖，mapIcons.ts）
      map.addLayer({
        id: 'wish-dot',
        type: 'circle',
        source: 'places',
        filter: BASE_FILTERS['wish-dot'] as never,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5.5, 14, 8],
          'circle-color': ['case', ['==', ['get', 'wish'], 'scheduled'], ['get', 'wishColor'], '#ffffff'],
          'circle-opacity': ['case', ['==', ['get', 'dim'], 1], 0.35, 1],
          'circle-stroke-color': ['case', ['==', ['get', 'wish'], 'scheduled'], '#ffffff', INK],
          'circle-stroke-width': ['case', ['==', ['get', 'wish'], 'scheduled'], 1.5, 2.2],
          'circle-stroke-opacity': ['case', ['==', ['get', 'dim'], 1], 0.35, 1],
        },
      });
      map.addLayer({
        id: 'wish-candidate',
        type: 'symbol',
        source: 'places',
        filter: BASE_FILTERS['wish-candidate'] as never,
        layout: { 'icon-image': 'wish-candidate', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 14, 1.05], 'icon-allow-overlap': true },
        paint: { 'icon-opacity': ['case', ['==', ['get', 'dim'], 1], 0.35, 1] },
      });
      // 選定那天的點：類型色的圓（和時間軸的編號一樣），寫「宿」「1」「2」…
      map.addLayer({
        id: 'places-mark',
        type: 'circle',
        source: 'places',
        filter: BASE_FILTERS['places-mark'] as never,
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
        filter: BASE_FILTERS['places-mark-text'] as never,
        layout: {
          'text-field': ['get', 'mark'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['case', ['>', ['length', ['get', 'mark']], 2], 9, 13],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': ['get', 'typeInk'] },
      });
      // 選定那天的點一律寫名稱，看得出順序是哪幾個地方
      map.addLayer({
        id: 'places-mark-label',
        type: 'symbol',
        source: 'places',
        filter: BASE_FILTERS['places-mark-label'] as never,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [1.3, 0],
          'text-optional': true,
        },
        paint: { 'text-color': INK, 'text-halo-color': '#fff', 'text-halo-width': 1.8 },
      });
      map.addLayer({
        id: 'places-label',
        type: 'symbol',
        source: 'places',
        minzoom: 13,
        filter: BASE_FILTERS['places-label'] as never,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [1.2, 0],
          'text-optional': true,
        },
        paint: { 'text-color': INK, 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
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
        pickPlace(id);
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
        if (s.hoveredId !== id || !s.hoverFromMap) s.hover(id, 'map');
      });
      map.on('mouseleave', PICK_LAYERS, () => {
        map.getCanvas().style.cursor = '';
        if (canHoverRef.current) scheduleHideRef.current();
      });
      // 地圖移動前後：選中的點原本看不到、移動後進入畫面（或剛選中、地圖正要移過去）→ 水滴跳一下
      const selectedVisible = () => {
        const p = selectedRef.current;
        if (!p) return false;
        const pt = map.project(p.coords);
        const v = visibleRect(map, mapObstructions());
        return pt.x >= v.left && pt.x <= v.right && pt.y >= v.top && pt.y <= v.bottom;
      };
      let wasVisible = true;
      map.on('movestart', () => {
        wasVisible = selectedVisible();
      });
      map.on('move', () => setTick((n) => n + 1));
      map.on('moveend', () => {
        reportView();
        const now = selectedVisible();
        if (now && (bounceNext.current || !wasVisible)) bounceRef.current();
        bounceNext.current = false;
      });
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
        planStore,
        shared,
        commands,
        visibleRect: () => visibleRect(map, mapObstructions()),
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
      dropRef.current?.remove();
      dropRef.current = null;
      map.remove();
      mapRef.current = null;
      if (currentMap === map) currentMap = null;
    };
  }, []);

  // 資料點、篩選、選定的天、行程 → 重畫
  useEffect(() => {
    if (!loaded) return;
    (mapRef.current!.getSource('places') as GeoJSONSource).setData(featureCollection(places, marks));
  }, [loaded, places, filter, query, day, days, plan, byId, mode, votes, candidates, itinerary, marks]);

  const anchorId = desktop && detailId && detailId !== selectedId ? detailId : null;

  // 選中的點（和詳情那個點的水滴）：原本的點、名稱不畫（換成水滴）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const sel = selectedId ?? '';
    const anchor = anchorId ?? '';
    for (const [layer, base] of Object.entries(BASE_FILTERS)) map.setFilter(layer, ['all', base, ['!=', ['get', 'id'], sel], ['!=', ['get', 'id'], anchor]] as never);
  }, [loaded, selectedId, anchorId]);

  // 詳情那個點的水滴（不跳）：選中的換成「附近」的點時才有
  useEffect(() => {
    if (!loaded) return;
    const p = anchorId ? byId.get(anchorId) : undefined;
    if (!p) {
      anchorRef.current?.remove();
      anchorRef.current = null;
      return;
    }
    let m = anchorRef.current;
    if (!m) {
      const el = document.createElement('div');
      el.className = 'map-selected map-detail-drop';
      el.setAttribute('data-testid', 'map-detail-drop');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        if (id) pickPlace(id);
      });
      m = new Marker({ element: el, anchor: 'bottom', offset: [0, 2] }).setLngLat(p.coords).addTo(mapRef.current!);
      anchorRef.current = m;
    }
    const mark = marks.get(p.id) ?? '';
    const el = m.getElement();
    el.dataset.id = p.id;
    el.innerHTML = selectedDropHtml(p, mark);
    m.setLngLat(p.coords);
  }, [loaded, anchorId, byId, marks]);

  // 數字水滴（DOM 標記，大小不隨縮放變）：尖端在點上，頭裡寫編號或類型圖示，旁邊粗體的名稱。點水滴＝再點一次那個點
  useEffect(() => {
    if (!loaded) return;
    const p = selectedId ? byId.get(selectedId) : undefined;
    selectedRef.current = p ?? null;
    if (!p) {
      dropRef.current?.remove();
      dropRef.current = null;
      return;
    }
    let m = dropRef.current;
    if (!m) {
      const el = document.createElement('div');
      el.className = 'map-selected';
      el.setAttribute('data-testid', 'map-selected');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        if (id) pickPlace(id);
      });
      m = new Marker({ element: el, anchor: 'bottom', offset: [0, 2] }).setLngLat(p.coords).addTo(mapRef.current!);
      dropRef.current = m;
    }
    const mark = marks.get(p.id) ?? '';
    const el = m.getElement();
    el.dataset.id = p.id;
    el.dataset.label = mark;
    el.innerHTML = selectedDropHtml(p, mark);
    m.setLngLat(p.coords);
  }, [loaded, selectedId, byId, marks]);

  // 選了一次（selectSeq 加 1）：地圖不動就馬上跳；要移過去的，移完（moveend）再跳
  useEffect(() => {
    if (!loaded || !selectedId) return;
    bounceNext.current = true;
    const raf = requestAnimationFrame(() => {
      if (mapRef.current?.isMoving()) return;
      bounceNext.current = false;
      bounceRef.current();
    });
    return () => cancelAnimationFrame(raf);
  }, [loaded, selectedId, selectSeq]);

  // 指到（只有網頁）：光圈、點放大一點；滑鼠離開就拿掉，不閃
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    // 選中的點換成水滴了，光圈不畫在它身上
    const id = canHover && hoveredId && hoveredId !== selectedId ? hoveredId : '';
    map.setFilter('places-hover', ['==', ['get', 'id'], id]);
    const big = (base: unknown, k: number) => (id ? ['case', ['==', ['get', 'id'], id], ['*', base, k], base] : base);
    // 縮放的 interpolate 一定要在最外層：每個停的縮放各自看是不是指到的點
    map.setPaintProperty('places-circle', 'circle-radius', [
      'interpolate',
      ['linear'],
      ['zoom'],
      8,
      big(['match', ['get', 'tier'], 'S', 6, 'A', 4.5, 3], 1.4),
      12,
      big(['match', ['get', 'tier'], 'S', 8.5, 'A', 6, 4.5], 1.4),
    ] as never);
    map.setPaintProperty('places-mark', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 8, big(10, 1.2), 14, big(13, 1.2)] as never);
    map.setPaintProperty('wish-dot', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 8, big(5.5, 1.3), 14, big(8, 1.3)] as never);
    map.setLayoutProperty('places-icon', 'icon-size', big(['match', ['get', 'tier'], 'S', 1.2, 'A', 0.9, 0.72], 1.2) as never);
  }, [loaded, hoveredId, canHover, selectedId]);

  // 地圖指令（T12）：標示、比較；點開的交通，上下車的站也用同一層（leg 的樣式）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const { byId } = dataStore.getState();
    const rings = legRoute?.stations.length ? { ...highlights, leg: legRoute.stations } : highlights;
    (map.getSource(OVERLAY_SOURCES.highlights) as GeoJSONSource).setData(highlightFeatures(rings, byId));
    (map.getSource(OVERLAY_SOURCES.compare) as GeoJSONSource).setData(compareFeatures(compare, byId));
  }, [loaded, highlights, compare, legRoute]);

  // 路線（AI 的 routes 和點開的那段交通）：線畫在圖層，中間的標籤（交通圖示＋8 分）是 DOM 標記
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const all = legRoute ? [...routes, legRoute] : routes;
    (map.getSource(OVERLAY_SOURCES.routes) as GeoJSONSource).setData(routeFeatures(all));
    const labels = routeLabels(all);
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
  }, [loaded, routes, legRoute]);

  // AI 的提議：虛線、半透明（interaction-design §0）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const f = proposal ? proposalFeatures(proposal, itinerary, dataStore.getState().byId, DATES) : { points: empty, lines: empty };
    (map.getSource(OVERLAY_SOURCES.proposalPoints) as GeoJSONSource).setData(f.points);
    (map.getSource(OVERLAY_SOURCES.proposalLines) as GeoJSONSource).setData(f.lines);
  }, [loaded, proposal, itinerary]);

  // 點開某一段交通時，其他行程路線變淡（只亮那一段）；收起來還原。選中一個點不讓路線變淡（§8.1）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const dim = legOpen != null;
    map.setPaintProperty('itinerary-line', 'line-opacity', dim ? 0.1 : ITINERARY_LINE_OPACITY);
    map.setPaintProperty('itinerary-casing', 'line-opacity', dim ? 0.1 : ITINERARY_CASING_OPACITY);
    map.setPaintProperty('itinerary-arrow', 'icon-opacity', dim ? 0.15 : 1);
  }, [loaded, legOpen]);

  const routesVersion = useApp((s) => s.routesVersion);
  // 確定的行程（T15m）：每天的路線、備選的空心圈、選定那天的交通標籤（在每段路線的中點）。想去分頁只畫想去的點（§5.3），不畫行程
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const f = itineraryFeatures(mode === 'wish' ? null : itinerary, plan, byId, DATES, day, itineraryPathOf, tripFocusDay);
    (map.getSource(OVERLAY_SOURCES.itineraryLines) as GeoJSONSource).setData(f.lines);
    (map.getSource(OVERLAY_SOURCES.itineraryAlts) as GeoJSONSource).setData(f.alts);
    legLabelsRef.current.forEach((m) => m.remove());
    legLabelsRef.current = f.legs.map((l) => {
      const el = document.createElement('div');
      el.className = 'route-label leg-label';
      el.innerHTML = routeLabelHtml(l.mode, l.text);
      return new Marker({ element: el }).setLngLat(l.coords).addTo(map);
    });
  }, [loaded, itinerary, plan, byId, day, routesVersion, tripFocusDay, mode]);

  // 交通時間的小標籤（在路線中點）不蓋住編號：和編號的圈、選中水滴旁邊的名稱重疊的，先藏起來（地圖移動、縮放時重算）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const run = () => {
      const base = map.getContainer().getBoundingClientRect();
      const hit = (a: DOMRect, b: { left: number; right: number; top: number; bottom: number }) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      // 編號的圈（半徑約 14px）
      const circles = [...marks.keys()].flatMap((id) => {
        const p = byId.get(id);
        if (!p) return [];
        const pt = map.project(p.coords);
        return [{ left: base.left + pt.x - 14, right: base.left + pt.x + 14, top: base.top + pt.y - 14, bottom: base.top + pt.y + 14 }];
      });
      const name = dropRef.current?.getElement().querySelector('.ms-name')?.getBoundingClientRect();
      for (const m of legLabelsRef.current) {
        const el = m.getElement();
        const r = el.getBoundingClientRect();
        el.classList.toggle('leg-label-hidden', circles.some((c) => hit(r, c)) || (!!name && hit(r, name)));
      }
    };
    run();
    map.on('move', run);
    return () => {
      map.off('move', run);
    };
  }, [loaded, itinerary, plan, byId, day, routesVersion, tripFocusDay, mode, marks, selectedId]);

  // 每個點的想去數（放大到 BADGE_ZOOM 才顯示）
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
      m.getElement().innerHTML = `${iconSvg('heart', 16, true)}<span>${b.text}</span>`;
    }
  }, [loaded, votes, byId]);

  // 移動地圖的請求：選中一個點（reveal）照 selectCamera；框範圍、飛到中心時讓開浮在地圖上的東西
  useEffect(() => {
    if (!loaded || !camera) return;
    const map = mapRef.current!;
    const vis = visibleRect(map, mapObstructions());
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
    // 可見範圍的中心離地圖中心多遠（flyTo、easeTo 的 offset）
    const offset: [number, number] = [(vis.left + vis.right) / 2 - w / 2, (vis.top + vis.bottom) / 2 - h / 2];
    if (camera.reveal) {
      const move = selectCamera(map.project(camera.reveal), vis, map.getZoom());
      if (move.kind === 'stay') return;
      map.easeTo({ center: camera.reveal, offset, zoom: move.kind === 'zoom' ? move.zoom : map.getZoom(), duration: 600 });
    } else if (camera.bbox) {
      const [west, south, east, north] = camera.bbox;
      // 上方留給浮動的列（比較、提議）；被蓋住的那邊多留
      const pad = { top: 90 + vis.top, bottom: 60 + (h - vis.bottom), left: 60 + vis.left, right: 60 + (w - vis.right) };
      const fits = w - pad.left - pad.right > 80 && h - pad.top - pad.bottom > 80;
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: fits ? pad : { top: 90, bottom: 60, left: 60, right: 60 }, maxZoom: camera.zoom ?? 15, duration: 600 },
      );
    } else if (camera.center) {
      map.flyTo({ center: camera.center, offset, zoom: camera.zoom ?? Math.max(map.getZoom(), 14), duration: 600 });
    }
  }, [loaded, camera]);

  // 切換地圖／探索時版面高度會變
  useEffect(() => {
    mapRef.current?.resize();
  }, [mode]);

  // 小卡片（照片彈窗）只有電腦版、只有滑鼠在地圖的點上時（§8.3）；手機版點圖釘是選卡片
  const previewPlace = previewId && !detailId && desktop ? dataStore.getState().byId.get(previewId) : null;
  const previewPos = previewPlace && mapRef.current ? mapRef.current.project(previewPlace.coords) : null;

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" data-testid="map" />
      <MapCommandBars />
      {mode === 'wish' && (
        <div className="map-legend" data-testid="map-wish-legend" aria-label="圖例">
          <span>
            <i className="lg-dot lg-unscheduled" aria-hidden /> 還沒排
          </span>
          <span>
            <i className="lg-dot lg-candidate" aria-hidden /> 已是候選
          </span>
          <span>
            <i className="lg-dot lg-scheduled" aria-hidden /> 已排
          </span>
        </div>
      )}
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
