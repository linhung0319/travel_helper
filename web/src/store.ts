// 地圖網站的狀態（architecture §2）。UI 和 AI 的地圖指令（commands.ts，T12）改的是同一份。
// 這裡只放同步、不檢查的設定函式；檢查輸入、算範圍、移動地圖由 commands.ts 做。

import { createStore } from 'zustand/vanilla';
import { EMPTY_FILTER, toggleValue, type Filter, type FilterKey } from './lib/filter.ts';
import type { Bbox, LonLat } from './data/types.ts';
import type { Itinerary, TravelMode } from '@travel-helper/engine/types';
import type { Change } from '@travel-helper/engine';

/** 詳情的分頁（簡介、交通、評論、留言；車站只有前兩個） */
export type DetailTabId = 'intro' | 'transport' | 'reviews' | 'comments';

/** 詳情從哪裡打開：map＝行程（網頁浮在地圖上）、explore／wish＝右欄的清單（返回回到清單） */
export type DetailFrom = 'map' | 'explore' | 'wish';

/** 'all'＝全部的天；否則是 YYYY-MM-DD */
export type DaySelection = 'all' | string;

/** 叫地圖移動的請求：MapView 看到 seq 變了就移過去（使用者自己拖地圖不會產生請求） */
export interface CameraRequest {
  seq: number;
  bbox?: Bbox;
  center?: LonLat;
  zoom?: number;
}

/** 標示的樣式（AI 的 highlight 指令可以用的）：主要（黃）、注意（紅）、次要（灰） */
export const HIGHLIGHT_STYLES = ['primary', 'warning', 'muted'] as const;
/** focus：手機行程選到的那張卡（黑框、圖釘放大、其他路線變淡），只有畫面自己設，AI 的指令不能用 */
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number] | 'focus';

/** 路線的一端：資料點（place）或座標 */
export interface RouteEnd {
  place: string | null;
  coords: LonLat;
}

/**
 * 地圖上的一條路線（drawRoute）。geometry 先是 null（畫直線），routeResolver 查到路徑後補上：
 * 步行、車沿道路走（OSRM），電車依序連經過的車站，船畫直線。
 */
export interface MapRoute {
  id: string;
  from: RouteEnd;
  to: RouteEnd;
  mode: TravelMode;
  /** 顯示的分鐘：呼叫者給的（例如 T14 的 Leg），或從路徑距離用預設速度算的 */
  minutes: number | null;
  /** 呼叫者給了分鐘時是 true；false 時 routeResolver 用距離算 */
  minutesGiven: boolean;
  label: string | null;
  geometry: LonLat[] | null;
  /** 路徑的距離（公尺）；直線時是直線距離 */
  meters: number | null;
  /** 交通未定（行程卡上的「交通未定」）：標籤用問號圖示 */
  unknown?: boolean;
  /** pending：還在查；osrm：沿道路；rail：沿鐵路的車站；straight：直線（查不到或船）；given：呼叫者給的 */
  source: 'pending' | 'osrm' | 'rail' | 'straight' | 'given';
}

/** AI 提議的行程（showProposal）：地圖用虛線、半透明畫，採用前不改確定的行程 */
export interface Proposal {
  itinerary: Itinerary;
  /** 有改動的天（地圖只畫這幾天的提議） */
  dates: string[];
  /** 和確定的行程比，改了什麼（engine 的 diffItinerary） */
  changes: Change[];
  summary: string | null;
}

export interface AppState {
  /** 地圖目前的範圍（地圖移動結束時更新）；給探索模式和 AI 當脈絡 */
  view: { center: LonLat; zoom: number; bounds: Bbox } | null;
  day: DaySelection;
  /** 整趟模式點了哪一天的路線：那天亮、其他天變淡（第五輪 §9.1）；點地圖空白處、換天清掉 */
  tripFocusDay: string | null;
  filter: Filter;
  /** 搜尋欄（探索、想去、地圖共用；不放進 Filter） */
  query: string;
  mode: 'map' | 'explore' | 'wish';
  /** 編輯中（進入前確認、閒置結束）；選「全部」時一定結束 */
  planning: boolean;
  /** 滑鼠移過去、或在圖片牆點了的點：地圖上會閃 */
  hoveredId: string | null;
  /** 小卡片 */
  previewId: string | null;
  /** 詳情面板（車站的詳情面板裡有時刻表） */
  detailId: string | null;
  /** 詳情從哪裡打開（detailId 是 null 時也是 null）；網頁：map 浮在地圖右邊、explore／wish 蓋在右欄 */
  detailFrom: DetailFrom | null;
  /** 詳情一打開就選哪個分頁（想去列點最新留言：comments）；null＝簡介 */
  detailTab: DetailTabId | null;
  /** 電腦版點了地圖上的點：探索清單捲到那張卡片（seq 讓同一個點再點一次也會捲） */
  exploreTarget: { id: string; seq: number } | null;
  /** 「問 AI」選取的點（interaction-design §5；T12、T16 接上） */
  selection: string[];
  /** 車站面板的指定時間；null＝預設 */
  stationTime: string | null;
  camera: CameraRequest | null;
  /** highlight：每種樣式一組點 */
  highlights: Partial<Record<HighlightStyle, string[]>>;
  /** drawRoute 畫的路線 */
  routes: MapRoute[];
  /** 行程線的道路路徑查到一批就加一，地圖看到變了就重畫（itineraryRoutes.ts） */
  routesVersion: number;
  /** compare：比較中的點（地圖標 A、B、C，上方出現比較列） */
  compare: string[];
  proposal: Proposal | null;
}

export interface AppActions {
  setView(view: AppState['view']): void;
  selectDay(day: DaySelection): void;
  setTripFocusDay(date: string | null): void;
  setFilter(patch: Partial<Filter>): void;
  toggleFilter(key: FilterKey, value: string): void;
  clearFilter(): void;
  setQuery(query: string): void;
  setMode(mode: AppState['mode']): void;
  setPlanning(on: boolean): void;
  hover(id: string | null): void;
  openPreview(id: string | null): void;
  /** from 沒給＝現在的分頁（行程分頁打開的在網頁浮在地圖上）；tab＝一打開就選的分頁 */
  openDetail(id: string, from?: DetailFrom, tab?: DetailTabId): void;
  closeDetail(): void;
  revealInExplore(id: string): void;
  addToSelection(id: string): void;
  removeFromSelection(id: string): void;
  setStationTime(time: string | null): void;
  moveCamera(req: Omit<CameraRequest, 'seq'>): void;
  setSelection(ids: string[]): void;
  setHighlight(style: HighlightStyle, ids: string[]): void;
  /** 回傳新路線的 ID */
  addRoute(route: Omit<MapRoute, 'id'>): string;
  updateRoute(id: string, patch: Partial<Omit<MapRoute, 'id'>>): void;
  setCompare(ids: string[]): void;
  /** 清掉標示、路線、比較（不動提議、不動手機選到的卡 focus） */
  clearHighlights(): void;
  setProposal(proposal: Proposal | null): void;
}

export type AppStore = AppState & AppActions;

export const initialState: AppState = {
  view: null,
  day: 'all',
  tripFocusDay: null,
  filter: EMPTY_FILTER,
  query: '',
  mode: 'map',
  planning: false,
  hoveredId: null,
  previewId: null,
  detailId: null,
  detailFrom: null,
  detailTab: null,
  exploreTarget: null,
  selection: [],
  stationTime: null,
  camera: null,
  highlights: {},
  routes: [],
  routesVersion: 0,
  compare: [],
  proposal: null,
};

export function createAppStore(init: Partial<AppState> = {}) {
  let routeSeq = 0;
  return createStore<AppStore>()((set) => ({
    ...initialState,
    ...init,
    setView: (view) => set({ view }),
    // 換天照樣在編輯；選「全部」（整趟總覽）就結束編輯。換天時整趟點亮的那天清掉
    selectDay: (day) => set(day === 'all' ? { day, planning: false, tripFocusDay: null } : { day, tripFocusDay: null }),
    setTripFocusDay: (tripFocusDay) => set({ tripFocusDay }),
    setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
    toggleFilter: (key, value) =>
      set((s) => ({ filter: { ...s.filter, [key]: toggleValue(s.filter[key] as string[], value) } })),
    clearFilter: () => set({ filter: EMPTY_FILTER }),
    setQuery: (query) => set({ query }),
    setMode: (mode) => set({ mode }),
    setPlanning: (planning) => set({ planning }),
    hover: (hoveredId) => set({ hoveredId }),
    openPreview: (previewId) => set({ previewId }),
    // 打開詳情時小卡片收起
    openDetail: (detailId, from, tab) => set((s) => ({ detailId, detailFrom: from ?? s.mode, detailTab: tab ?? null, previewId: null })),
    closeDetail: () => set({ detailId: null, detailFrom: null, detailTab: null }),
    revealInExplore: (id) => set((s) => ({ exploreTarget: { id, seq: (s.exploreTarget?.seq ?? 0) + 1 } })),
    addToSelection: (id) => set((s) => (s.selection.includes(id) ? s : { selection: [...s.selection, id] })),
    removeFromSelection: (id) => set((s) => ({ selection: s.selection.filter((x) => x !== id) })),
    setStationTime: (stationTime) => set({ stationTime }),
    moveCamera: (req) => set((s) => ({ camera: { ...req, seq: (s.camera?.seq ?? 0) + 1 } })),
    setSelection: (ids) => set({ selection: [...new Set(ids)] }),
    setHighlight: (style, ids) =>
      set((s) => {
        const highlights = { ...s.highlights };
        if (ids.length) highlights[style] = [...new Set(ids)];
        else delete highlights[style];
        return { highlights };
      }),
    addRoute: (route) => {
      const id = `r${++routeSeq}`;
      set((s) => ({ routes: [...s.routes, { ...route, id }] }));
      return id;
    },
    updateRoute: (id, patch) => set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    setCompare: (ids) => set({ compare: [...new Set(ids)] }),
    // 手機行程選到的那張卡（focus）是畫面自己的狀態，不跟著清（點開交通卡、AI 清標示時，選到的卡的黑框還在）
    clearHighlights: () => set((s) => ({ highlights: s.highlights.focus ? { focus: s.highlights.focus } : {}, routes: [], compare: [] })),
    setProposal: (proposal) => set({ proposal }),
  }));
}

/** 整個網站共用的一份 */
export const appStore = createAppStore();
