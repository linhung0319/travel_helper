// 整個網站的那一張地圖（MapLibre）：資料點、行程的路線和編號、AI 的標示，和三種標示（T15m 第七輪 §8.1）：
// - 指到（只有網頁，hoveredId）：滑鼠在卡片、清單列、時間軸卡片、地圖的點上，那個點稍微放大、加一圈淡灰光圈（places-hover）；不閃
// - 選中（selectedId，兩邊一樣）：類型色的水滴（DOM 標記，尖端在點上，頭裡寫編號；沒有編號寫類型圓章的字，interaction-design §12.5），旁邊的名稱變粗；
//   選中時跳 3 下（CSS 的 bounce，1.5 秒，影子跟著縮放；減少動態時不跳），再選一次、或地圖移動後它進入畫面時再跳
// - AI 指給你看：也是水滴（頭裡是 A、B、C、提議的順序或類型的字），只畫 AI 最新的一組（lib/overlays.aiDrops），新出現的跳 3 下；AI 畫的路線（mapOverlayLayers.ts）。地圖上不畫圈
// 地圖怎麼動（§8.2）：選中一個點照 lib/mapCamera.selectCamera（可見範圍扣掉手機的行程面板、網頁浮在地圖上的詳情）；框範圍也讓開它們。
// 點地圖上的點照 §8.3（mapPick.ts）。行程分頁的地圖不套探索的篩選（§8.4）；想去分頁只畫想去的點，分還沒排、候選、已排三種樣子（§5.3），左下角圖例。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
// maplibre-gl v6 的 worker 是另一個檔案；經過 Vite 打包後用 import.meta.url 找不到，所以讓 Vite 打包 worker 再指定網址
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { DESKTOP_QUERY, useApp, useCanHover, useData, useIsDesktop, usePlan, useShared, useUi } from '../hooks.ts';
import { areaColor, initialExtent, MAP_MIN_ZOOM, mapMaxBounds } from '../lib/areas.ts';
import { nightsPerArea, nightsPerAreaDiff } from '../lib/tripSkeleton.ts';
import { areaFocusShape, DETAIL_ZOOM, isMinorOnMap, shapeLabelAt } from '../lib/mapLayers.ts';
import { displayName } from '../data/normalize.ts';
import { currentArea, exploreStage } from '../lib/shelves.ts';
import { pickArea, showAllAreas } from '../exploreArea.ts';
import { useOverview } from '../shared/overviewStore.ts';
import { TYPE_COLORS, TYPE_INK } from '../lib/typeStyle.ts';
import { addMapIcons } from './mapIcons.ts';
import { markMapLoaded } from '../lib/idle.ts';
import { clearCurrentMap, hoverPaused, selectedDropHtml, setCurrentMap, STYLE_URL } from './mapRuntime.ts';
import { dayColor, placeVisual } from '../lib/visual.ts';
import { tripDates } from '../lib/trip.ts';
import { EMPTY_FILTER } from '../lib/filter.ts';
import { PLACE_TYPES, type Bbox, type Place } from '../data/types.ts';
import { PreviewCard } from './PreviewCard.tsx';
import { addOverlayLayers, ITINERARY_CASING_OPACITY, ITINERARY_LINE_OPACITY, OVERLAY_SOURCES } from './mapOverlayLayers.ts';
import { aiDrops, itineraryFeatures, itineraryMarks, legStationFeatures, proposalFeatures, routeFeatures, routeLabels, type AiDrop } from '../lib/overlays.ts';
import { commands, itineraryPathOf } from '../appCommands.ts';
import { routeLabelHtml } from '../lib/modeIcon.ts';
import { selectCamera, visibleArea, type ScreenRect } from '../lib/mapCamera.ts';
import { MapCommandBars } from './MapCommandBars.tsx';
import { pickPlace } from './mapPick.ts';
import { shared } from '../appShared.ts';
import { likedPlaces, placeDayStatus } from '../lib/wishlist.ts';
import { closeDiscussion, closeMapPanel, closeTimetable, uiStore } from '../uiStore.ts';
import { planStore } from '../planStore.ts';
import { addPlaceStore } from '../addPlaceStore.ts';
import type { LonLat } from '../data/types.ts';
import { mobileStore } from '../mobile/mobileStore.ts';

setWorkerUrl(maplibreWorkerUrl);

/** 加地點的彈窗（第一步或第二步）開著 */
const addPlaceOpen = () => {
  const a = addPlaceStore.getState();
  return !!a.draft || !!a.entry;
};

/** 手機按住加地點：按住多久、手指最多移動多遠（px） */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/** 地圖的樣式（手機版詳情的小地圖也用） */
/** 放大到這裡以上，小點換成類別圖標（像 Google Maps） */
export const ICON_ZOOM = 12;
/** 這個縮放以上 AI 的水滴才寫名稱（和資料點的名稱圖層同一個縮放） */
const DROP_NAME_ZOOM = 13;
/** highlight 指令的注意、次要：--red-day、--ink-3 */
const DROP_TONES: Record<NonNullable<AiDrop['tone']>, string> = { warning: '#c0392b', muted: '#8a90a0' };
const DATES = tripDates();
/** 文字的墨色（--ink） */
const INK = '#1c2840';
/** 指到的光圈（--ink-3） */
const HOVER_HALO = '#a3a9b8';

const typeColorExpr = ['match', ['get', 'type'], ...PLACE_TYPES.flatMap((t) => [t, TYPE_COLORS[t]]), '#4b5262'];

/** 想去分頁每個點是哪一段（§5.3）：還沒排、已是候選、已排（已排的用那天的顏色） */
type WishKind = 'unscheduled' | 'candidate' | 'scheduled';

/** marks：行程的編號（0、1、2…，overlays.itineraryMarks：某一天、點開的那段、整趟）；有編號的點畫成類型色的編號圓 */
function featureCollection(places: Place[], marks: Map<string, string>, detailed: boolean, overviewArea: string | null = null): FeatureCollection {
  const { filter, query, day, mode, aiResult } = appStore.getState();
  const { days, itinerary } = dataStore.getState();
  const trip = mode === 'map';
  // 探索、想去時不因為「不在那天」變淡（找的是那天還沒排的點），只看篩選。
  // 行程分頁不套探索的篩選（§8.4）：選了某一天，那天以外的點淡；整趟時沒排進行程的點淡
  const dimDay = trip ? day : 'all';
  const liked = mode === 'wish' ? likedPlaces(shared.store.getState().votes) : null;
  const candidates = shared.store.getState().candidates;
  // 想去分頁只畫想去的點
  const shown = liked ? places.filter((p) => liked.has(p.id)) : places;
  // 探索的分層（T43 §21）：縮遠只畫 S、A 級景點（選的那一區、概覽框著的那一區、清單裡符合的照樣畫）
  const layer = { explore: mode === 'explore', detailed, area: currentArea(filter) ?? overviewArea, listing: exploreStage(filter, query, !!aiResult) === 'list' };
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
          minor: isMinorOnMap(p, v.match, layer) ? 1 : 0,
          mark: liked ? '' : (marks.get(p.id) ?? ''),
          user: p.origin === 'user' ? 1 : 0,
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

/** 縮遠時收起 minor 的點的圖層（T43）；指到的點照樣畫（概覽的代表點有餐廳） */
const LAYERED = new Set(['places-circle', 'places-icon', 'places-label']);

/** 選區範圍的淡底、虛線框（T43 §21）：那區的顏色、很淡的底 */
const AREA_FOCUS_SOURCE = 'area-focus';

/** 各圖層本來的 filter；畫成水滴的點另外排除 */
const BASE_FILTERS: Record<string, unknown[]> = {
  'itinerary-alt': ['has', 'id'],
  'places-circle': ['all', ['==', ['get', 'mark'], ''], ['==', ['get', 'wish'], '']],
  'places-icon': ['all', ['==', ['get', 'mark'], ''], ['==', ['get', 'wish'], '']],
  'wish-dot': ['any', ['==', ['get', 'wish'], 'unscheduled'], ['==', ['get', 'wish'], 'scheduled']],
  'wish-candidate': ['==', ['get', 'wish'], 'candidate'],
  'places-mark': ['!=', ['get', 'mark'], ''],
  'places-mark-text': ['!=', ['get', 'mark'], ''],
  'places-mark-label': ['!=', ['get', 'mark'], ''],
  'places-label': ['all', ['==', ['get', 'dim'], 0], ['==', ['get', 'mark'], '']],
};

/** 蓋在地圖上的東西：網頁蓋在地圖右側的詳情彈窗（蓋住右欄的不算）、地圖上的日期晶片、手機的行程面板（藏起來的不算） */
function mapObstructions(): DOMRect[] {
  return [...document.querySelectorAll<HTMLElement>('.detail-float[data-at="map"], .map-days, .m-trip-sheet')]
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

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeLabelsRef = useRef<Map<string, Marker>>(new Map());
  // 確定的行程的交通標籤、每個點的留言、想去數（T15m）
  const legLabelsRef = useRef<Marker[]>([]);
  // 整趟時各區的晚數標籤（「鳥羽 3 晚」，T45b）
  const areaNightsRef = useRef<Marker[]>([]);
  // 選中的數字水滴；selectedRef 給地圖的事件讀（移動前後看它進入畫面沒有）
  const dropRef = useRef<Marker | null>(null);
  const anchorRef = useRef<Marker | null>(null);
  // AI 指給你看的水滴（id → 標記）
  const aiDropsRef = useRef<Map<string, Marker>>(new Map());
  const selectedRef = useRef<Place | null>(null);
  const bounceNext = useRef(false);
  const [loaded, setLoaded] = useState(false);
  // 縮放 >= DETAIL_ZOOM（T43）：探索畫全部的點、拿掉地區標籤
  const [detailed, setDetailed] = useState(false);
  // 探索縮遠時各區的名稱標籤（T43）
  const areaNameRef = useRef<Marker[]>([]);
  const regionNameRef = useRef<Marker | null>(null);
  const [, setTick] = useState(0); // 地圖移動時重畫小卡片的位置
  const canHover = useCanHover();
  const desktop = useIsDesktop();
  const canHoverRef = useRef(canHover);
  canHoverRef.current = canHover;
  const hideTimer = useRef<number | null>(null);
  // 加地點（T31）的右鍵選單（只有網頁）；確認畫面在彈窗裡，有自己的小地圖（T33）
  const [ctx, setCtx] = useState<{ x: number; y: number; coords: LonLat } | null>(null);

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
  const aiResult = useApp((s) => s.aiResult);
  const routes = useApp((s) => s.routes);
  const legRoute = useApp((s) => s.legRoute);
  const proposalOn = useApp((s) => s.proposal);
  // 看原本的行程時，提議的虛線收起來
  const proposalView = useUi((s) => s.proposalView);
  const proposal = proposalView === 'diff' ? proposalOn : null;
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
  // 探索的概覽（T63 §27，只有網頁）：點了卡片的子地區一行，地圖框著那一區或子地區，畫它的範圍；離開概覽就不算
  const overviewPick = useOverview((s) => s.focus);
  const overviewFocus = desktop && mode === 'explore' && exploreStage(filter, query, !!aiResult) === 'overview' ? overviewPick : null;

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
    const max = mapMaxBounds(as);
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: STYLE_URL,
      bounds: [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      fitBoundsOptions: { padding: 30 },
      // 只能看關西到伊勢志摩（T47）：拖不出去、縮不到全世界，圖磚才不會越抓越多
      ...(max ? { maxBounds: [[max[0], max[1]], [max[2], max[3]]] as [[number, number], [number, number]] } : {}),
      minZoom: MAP_MIN_ZOOM,
      attributionControl: { compact: true },
      // 手機上兩指旋轉容易誤觸，地圖一律朝北
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    setCurrentMap(map);
    // 縮放鈕只有網頁版（手機用兩指，地圖上只留「放大地圖」）；在右下，右上是引導彈窗的入口（T46）
    if (window.matchMedia(DESKTOP_QUERY).matches) map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    const reportView = () => {
      const bounds = map.getBounds();
      const c = map.getCenter();
      appStore.getState().setView({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      });
      containerRef.current?.classList.toggle('show-drop-names', map.getZoom() >= DROP_NAME_ZOOM);
    };
    // 縮放過了 DETAIL_ZOOM（T43）：換分層
    map.on('zoom', () => setDetailed(map.getZoom() >= DETAIL_ZOOM));

    map.on('load', () => {
      markMapLoaded();
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      addMapIcons(map);
      // 選了一區（T43 §21）：那區所有點外圍的形狀，淡底加虛線框，畫在所有點的下面、不擋點擊（不在 PICK_LAYERS）
      map.addSource(AREA_FOCUS_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'area-focus-fill', type: 'fill', source: AREA_FOCUS_SOURCE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.07 } });
      map.addLayer({
        id: 'area-focus-line',
        type: 'line',
        source: AREA_FOCUS_SOURCE,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.85, 'line-dasharray': [3, 2] },
      });
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
          'circle-color': ['case', ['==', ['get', 'user'], 1], '#ffffff', typeColorExpr] as never,
          'circle-opacity': ['step', ['zoom'], ['case', ['==', ['get', 'dim'], 1], 0.25, 0.95], ICON_ZOOM, 0],
          // 自己加的點：白底＋類型色描邊（縮小時的點看得出和查過的點不同）
          'circle-stroke-color': ['case', ['==', ['get', 'user'], 1], typeColorExpr, '#ffffff'] as never,
          'circle-stroke-width': ['case', ['==', ['get', 'user'], 1], 2, 1.5],
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
          'icon-image': ['concat', 'icon-', ['case', ['==', ['get', 'user'], 1], 'user-', ''], ['get', 'type']],
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
        setCtx(null);
        // 加地點的彈窗開著：點地圖上的點不開詳情（避免誤觸）
        if (addPlaceOpen()) return;
        closeMapPanel();
        closeDiscussion();
        closeTimetable();
        const id = placeAt(e.point);
        pickPlace(id);
        // 整趟：點某天的路線 → 那天亮、其他天淡；點空白處清掉（點到點不動）
        if (!id) appStore.getState().setTripFocusDay(tripLineAt(e.point));
      });
      // 右鍵（只有網頁；詳情、加地點的彈窗開著時不理）：選單「＋ 在這裡加地點」，開加地點的彈窗（T33）
      map.on('contextmenu', (e: MapMouseEvent) => {
        if (!window.matchMedia(DESKTOP_QUERY).matches || appStore.getState().detailId || addPlaceOpen()) return;
        e.originalEvent.preventDefault();
        const c = map.getContainer();
        // 選單約 180×50：靠近邊緣時往內縮，不超出地圖
        setCtx({ x: Math.max(0, Math.min(e.point.x, c.clientWidth - 180)), y: Math.max(0, Math.min(e.point.y, c.clientHeight - 50)), coords: [e.lngLat.lng, e.lngLat.lat] });
      });
      // 手機：行程分頁的地圖上按住約 0.5 秒（手指移動不超過 10px、只有一根手指）→ 手指旁跳出「＋ 在這裡加地點」小泡泡，點了才開加地點，位置就是手指那裡（spec §2）。
      // 不另外要求「展開」：這張地圖一直是看得到的（行程面板只是蓋在下半），在行程分頁、沒有整頁蓋著、表單沒開時就算數。
      // 長按時瀏覽器自己的選單（contextmenu）擋掉；一般拖曳、縮放、點選不受影響（移動就取消、第二根手指就取消）。
      {
        const el = map.getContainer();
        let timer: number | null = null;
        let from: { x: number; y: number } | null = null;
        let fired = false;
        const cancel = () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = null;
          from = null;
        };
        const blocked = () => {
          const m = mobileStore.getState();
          return window.matchMedia(DESKTOP_QUERY).matches || m.tab !== 'trip' || !!m.detail || !!m.page || !!m.actions || m.chatSheet || !!addPlaceOpen();
        };
        el.addEventListener(
          'touchstart',
          (e) => {
            cancel();
            fired = false;
            if (e.touches.length !== 1 || blocked()) return;
            const t = e.touches[0];
            from = { x: t.clientX, y: t.clientY };
            const r = el.getBoundingClientRect();
            timer = window.setTimeout(() => {
              timer = null;
              if (blocked()) return;
              fired = true;
              const x = t.clientX - r.left;
              const y = t.clientY - r.top;
              const ll = map.unproject([x, y]);
              // 泡泡放在手指上方一點（不被手指蓋住），約 180×50，不超出地圖
              setCtx({ x: Math.max(0, Math.min(x, el.clientWidth - 180)), y: Math.max(0, Math.min(y - 60, el.clientHeight - 50)), coords: [ll.lng, ll.lat] });
            }, LONG_PRESS_MS);
          },
          { passive: true },
        );
        el.addEventListener(
          'touchmove',
          (e) => {
            const t = e.touches[0];
            if (from && t && Math.hypot(t.clientX - from.x, t.clientY - from.y) > LONG_PRESS_SLOP) cancel();
          },
          { passive: true },
        );
        // 長按跳出泡泡後放開手指：擋掉後續的 click，免得點穿到地圖（所以不能是 passive）
        el.addEventListener('touchend', (e) => {
          if (fired && e.cancelable) e.preventDefault();
          fired = false;
          cancel();
        });
        el.addEventListener('touchcancel', cancel);
        el.addEventListener('contextmenu', (e) => {
          if (!window.matchMedia(DESKTOP_QUERY).matches) e.preventDefault();
        });
      }
      // 游標移開就解除暫停（移到空白處也算，不然回到同一個點還是不出小卡片）
      map.on('mousemove', (e) => {
        hoverPaused(e.originalEvent);
      });
      map.on('mousemove', PICK_LAYERS, (e) => {
        // 加地點的表單開著：不出小卡片（小卡片點了會開詳情）
        if (!canHoverRef.current || addPlaceOpen() || hoverPaused(e.originalEvent)) return;
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
        setCtx(null);
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
      setDetailed(map.getZoom() >= DETAIL_ZOOM);
      setLoaded(true);
    });

    // 版面改變（切到探索模式、手機轉向）時地圖要重新算大小
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);

    if (import.meta.env.DEV) {
      // Playwright 測試和 Claude in Chrome 檢查畫面用：算出點的像素位置、讀狀態
      // AI（T16m）：App 啟動；這裡只是讓 Playwright 讀得到
      void import('../appAi.ts').then(async (m) => {
        await m.startAi();
        const { ai, fakeSettings } = m;
        Object.assign((window as unknown as { __th: object }).__th, { ai, aiFake: fakeSettings });
      });
      (window as unknown as Record<string, unknown>).__th = {
        // 轉向時地圖重建：留著上一份的 ai、aiFake，才不會有一段時間讀不到
        ...(window as unknown as { __th?: object }).__th,
        map,
        appStore,
        dataStore,
        uiStore,
        planStore,
        addPlaceStore,
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
      dropRef.current?.remove();
      dropRef.current = null;
      aiDropsRef.current.forEach((m) => m.remove());
      aiDropsRef.current.clear();
      map.remove();
      mapRef.current = null;
      clearCurrentMap(map);
    };
  }, []);

  // 右鍵選單：Esc 關掉
  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCtx(null);
    // 點選單以外的地方（右欄、地圖外）也關掉
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.map-context')) setCtx(null);
    };
    const onBack = () => setCtx(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onBack);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onBack);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [ctx]);

  // 資料點、篩選、選定的天、行程 → 重畫
  useEffect(() => {
    if (!loaded) return;
    (mapRef.current!.getSource('places') as GeoJSONSource).setData(featureCollection(places, marks, detailed, overviewFocus?.area ?? null));
  }, [loaded, places, filter, query, day, days, plan, byId, mode, votes, candidates, itinerary, marks, detailed, aiResult, overviewFocus?.area]);

  const anchorId = desktop && detailId && detailId !== selectedId ? detailId : null;

  // AI 最新的一組：提議的點（看原本時收起來）、水滴
  const aiLatest = useApp((s) => s.aiLatest);
  const proposalShapes = useMemo(() => {
    const empty: FeatureCollection<GeoJSON.Point> = { type: 'FeatureCollection', features: [] };
    return proposal ? proposalFeatures(proposal, itinerary, dataStore.getState().byId, DATES) : { points: empty, lines: { type: 'FeatureCollection' as const, features: [] } };
  }, [proposal, itinerary]);
  const drops = useMemo(() => aiDrops({ aiResult, highlights, proposalPoints: proposalShapes.points, latest: aiLatest }), [aiResult, highlights, proposalShapes, aiLatest]);
  // 水滴頭裡的字：AI 給的（A、B、C、提議的順序）優先，再來是行程的編號
  const headOf = (id: string) => drops.find((d) => d.id === id)?.head ?? marks.get(id) ?? '';
  const headOfRef = useRef(headOf);
  headOfRef.current = headOf;

  // 畫成水滴的點（選中、詳情那個點、AI 的一組）：原本的點、名稱不畫
  const dropIdsKey = drops.map((d) => d.id).join(' ');
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const hidden = [...new Set([selectedId, anchorId, ...(dropIdsKey ? dropIdsKey.split(' ') : [])])].filter((x): x is string => !!x);
    const shownMinor = ['any', ['==', ['get', 'minor'], 0], ['==', ['get', 'id'], hoveredId ?? '']];
    for (const [layer, base] of Object.entries(BASE_FILTERS)) {
      map.setFilter(layer, ['all', base, ['!', ['in', ['get', 'id'], ['literal', hidden]]], ...(LAYERED.has(layer) ? [shownMinor] : [])] as never);
    }
  }, [loaded, selectedId, anchorId, dropIdsKey, hoveredId]);

  // 選了一區（T43 §21）：那區所有點外圍的形狀；只在探索。選了子地區（T56）只畫子地區的範圍，上緣放子地區名（點了沒有作用）
  // 概覽框著的卡（T63 §27）一樣畫
  const selectedArea = mode === 'explore' ? currentArea(filter) : null;
  const focusArea = selectedArea ?? overviewFocus?.area ?? null;
  const focusRegion = selectedArea ? (filter.regions.length === 1 ? filter.regions[0] : null) : (overviewFocus?.region ?? null);
  const areasForFocus = useData((s) => s.areas);
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const color = areaColor(areasForFocus, focusArea);
    const f = areaFocusShape(places, focusArea, focusRegion);
    if (f) f.properties = { ...f.properties, color };
    (map.getSource(AREA_FOCUS_SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features: f ? [f] : [] });
    regionNameRef.current?.remove();
    regionNameRef.current = null;
    const region = focusRegion ? areasForFocus.find((a) => a.id === focusArea)?.regions?.find((r) => r.id === focusRegion) : null;
    if (!f || !region) return;
    const el = document.createElement('div');
    el.className = 'region-name-label';
    el.dataset.testid = 'region-name-label';
    el.dataset.region = region.id;
    el.style.setProperty('--region-color', color);
    el.textContent = displayName(region.name, region.id);
    regionNameRef.current = new Marker({ element: el, anchor: 'bottom', offset: [0, -2] }).setLngLat(shapeLabelAt(f.geometry)).addTo(map);
  }, [loaded, places, focusArea, focusRegion, areasForFocus]);

  // 探索縮遠時（T43 §21）：每區的中心放區名（白底靛藍框），點了等於地區列選那一區；選中的那區靛藍底白字
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    areaNameRef.current.forEach((m) => m.remove());
    areaNameRef.current = [];
    if (mode !== 'explore' || detailed) return;
    areaNameRef.current = areasForFocus.map((a) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'area-name-label';
      el.dataset.area = a.id;
      el.dataset.testid = 'area-name-label';
      el.classList.toggle('on', a.id === focusArea);
      el.textContent = a.name.zh || a.name.ja;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        pickArea(a.id);
      });
      return new Marker({ element: el }).setLngLat(a.center).addTo(map);
    });
  }, [loaded, mode, detailed, areasForFocus, focusArea]);

  // AI 指給你看的水滴：只有最新的一組（舊的直接拿掉）；新出現的跳 3 下（地圖正要飛過去時，到了再跳）。
  // 也是選中的點、詳情那個點的不畫（它們有自己的水滴）
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    const list = drops.filter((d) => d.id !== selectedId && d.id !== anchorId && byId.has(d.id));
    const keep = new Set(list.map((d) => d.id));
    aiDropsRef.current.forEach((m, id) => {
      if (keep.has(id)) return;
      m.remove();
      aiDropsRef.current.delete(id);
    });
    const fresh: Element[] = [];
    for (const d of list) {
      const p = byId.get(d.id)!;
      let m = aiDropsRef.current.get(d.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'map-selected map-ai-drop';
        el.setAttribute('data-testid', 'map-ai-drop');
        el.dataset.id = d.id;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          pickPlace(d.id);
        });
        el.addEventListener('mouseenter', () => {
          if (!canHoverRef.current || addPlaceOpen()) return;
          cancelHideRef.current();
          appStore.getState().openPreview(d.id);
          appStore.getState().hover(d.id, 'map');
        });
        el.addEventListener('mouseleave', () => {
          if (canHoverRef.current) scheduleHideRef.current();
        });
        m = new Marker({ element: el, anchor: 'bottom', offset: [0, 2] }).setLngLat(p.coords).addTo(map);
        aiDropsRef.current.set(d.id, m);
        fresh.push(el);
      }
      const el = m.getElement();
      const head = d.head ?? marks.get(d.id) ?? '';
      const svg = el.querySelector('.ms-drop');
      const bouncing = svg?.classList.contains('bounce');
      el.dataset.label = head;
      el.innerHTML = selectedDropHtml(p, head, d.tone && DROP_TONES[d.tone]);
      if (bouncing) el.querySelector('.ms-drop')?.classList.add('bounce');
      m.setLngLat(p.coords);
    }
    if (!fresh.length || reducedMotion()) return;
    const run = () => fresh.forEach((el) => el.querySelector('.ms-drop')?.classList.add('bounce'));
    if (map.isMoving()) map.once('moveend', run);
    else {
      // 同一輪框範圍的指令還沒開始動：等下一格再看
      const raf = requestAnimationFrame(() => (map.isMoving() ? map.once('moveend', run) : run()));
      return () => cancelAnimationFrame(raf);
    }
  }, [loaded, drops, selectedId, anchorId, byId, marks]);

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
    const mark = headOfRef.current(p.id);
    const el = m.getElement();
    el.dataset.id = p.id;
    el.innerHTML = selectedDropHtml(p, mark);
    m.setLngLat(p.coords);
  }, [loaded, anchorId, byId, marks, drops]);

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
    const mark = headOfRef.current(p.id);
    const el = m.getElement();
    el.dataset.id = p.id;
    el.dataset.label = mark;
    el.innerHTML = selectedDropHtml(p, mark);
    m.setLngLat(p.coords);
  }, [loaded, selectedId, byId, marks, drops]);

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

  // 點開的交通：上下車的站
  useEffect(() => {
    if (!loaded) return;
    (mapRef.current!.getSource(OVERLAY_SOURCES.legStations) as GeoJSONSource).setData(legStationFeatures(legRoute?.stations ?? [], dataStore.getState().byId));
  }, [loaded, legRoute]);

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
    (map.getSource(OVERLAY_SOURCES.proposalPoints) as GeoJSONSource).setData(proposalShapes.points);
    (map.getSource(OVERLAY_SOURCES.proposalLines) as GeoJSONSource).setData(proposalShapes.lines);
  }, [loaded, proposalShapes]);

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

  // 整趟時各區的晚數（T45b §19.4）：在那區的中心放「鳥羽 3 晚」，框是那區的顏色；沒住的區不放。網頁只在行程分頁，手機的地圖只在行程分頁出現
  // 看提議時照提議之後的行程算，晚數有變的區芥子黃框（T48）
  const areasAll = useData((s) => s.areas);
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current!;
    areaNightsRef.current.forEach((m) => m.remove());
    areaNightsRef.current = [];
    if (day !== 'all' || !itinerary || (desktop && mode !== 'map')) return;
    const list = proposal ? nightsPerAreaDiff(proposal.itinerary, itinerary, areasAll, byId) : nightsPerArea(itinerary, areasAll, byId).map((x) => ({ ...x, changed: false }));
    areaNightsRef.current = list.flatMap(({ area, nights, changed }) => {
      const a = areasAll.find((x) => x.id === area);
      if (!a) return [];
      const el = document.createElement('div');
      el.className = changed ? 'area-nights-label changed' : 'area-nights-label';
      el.dataset.area = area;
      el.dataset.testid = 'area-nights-label';
      el.style.setProperty('--area', areaColor(areasAll, area));
      const b = document.createElement('b');
      b.textContent = a.name.zh || a.name.ja;
      el.append(b, ` ${nights} 晚`);
      return [new Marker({ element: el }).setLngLat(a.center).addTo(map)];
    });
  }, [loaded, itinerary, proposal, areasAll, byId, day, mode, desktop]);

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

  // 移動地圖的請求：選中一個點（reveal）照 selectCamera；框範圍、飛到中心時讓開浮在地圖上的東西
  useEffect(() => {
    if (!loaded || !camera) return;
    const map = mapRef.current!;
    const vis = visibleRect(map, mapObstructions());
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
    // 版面剛變（手機切回行程時地圖縮到面板上面）：這個 effect 比 ResizeObserver 早，先對齊大小，不然動畫會照舊的大小停在看不到的地方
    if (map.getCanvas().clientWidth !== w || map.getCanvas().clientHeight !== h) map.resize();
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
      {overviewFocus && (
        <button type="button" className="map-all-areas" onClick={showAllAreas} data-testid="map-all-areas">
          <span aria-hidden>⤢</span> 看全部地區
        </button>
      )}
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
      {ctx && (
        <div className="map-context" style={{ left: ctx.x, top: ctx.y }} data-testid="map-context">
          <button
            type="button"
            data-testid="map-context-add"
            onClick={() => {
              addPlaceStore.getState().start({ via: 'map', coords: ctx.coords });
              setCtx(null);
            }}
          >
            ＋ 在這裡加地點
          </button>
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
