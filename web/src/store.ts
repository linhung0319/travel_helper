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

/**
 * 叫地圖移動的請求：MapView 看到 seq 變了就移過去（使用者自己拖地圖不會產生請求）。
 * reveal：選中一個點，地圖照 lib/mapCamera.selectCamera 讓它看得到（能不動就不動、平移、太遠才拉到 13）
 */
export interface CameraRequest {
  seq: number;
  bbox?: Bbox;
  center?: LonLat;
  zoom?: number;
  reveal?: LonLat;
}

/** 標示的樣式（AI 的 highlight 指令可以用的）：主要（黃）、注意（紅）、次要（灰） */
export const HIGHLIGHT_STYLES = ['primary', 'warning', 'muted'] as const;
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];

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

/** 時間軸點開的那段交通畫在地圖上的路線（不是 AI 的 routes，「清掉」不算它）；stations＝每一程上下車的站 */
export type LegRoute = MapRoute & { stations: string[] };

/** AI 提議的行程（showProposal）：地圖用虛線、半透明畫，採用前不改確定的行程 */
export interface Proposal {
  itinerary: Itinerary;
  /** 有改動的天（地圖只畫這幾天的提議） */
  dates: string[];
  /** 和確定的行程比，改了什麼（engine 的 diffItinerary） */
  changes: Change[];
  summary: string | null;
}

/** 篩選屬於哪一頁：想去自己一份，探索和行程共用一份（行程分頁的地圖不套篩選，時間軸空檔「找附近的…」設的篩選是給探索的） */
export type FilterOwner = 'explore' | 'wish';
const ownerOf = (mode: AppState['mode']): FilterOwner => (mode === 'wish' ? 'wish' : 'explore');

export interface AppState {
  /** 地圖目前的範圍（地圖移動結束時更新）；給探索模式和 AI 當脈絡 */
  view: { center: LonLat; zoom: number; bounds: Bbox } | null;
  day: DaySelection;
  /** 整趟模式點了哪一天的路線：那天亮、其他天變淡（第五輪 §9.1）；點地圖空白處、換天清掉 */
  tripFocusDay: string | null;
  filter: Filter;
  /** 搜尋欄（不放進 Filter）；filter、query 是現在這頁的（網頁探索、想去各一份，見 filterStash） */
  query: string;
  /** 網頁的探索、想去各自一份篩選和搜尋（第七輪最終 review #3，和手機一樣）：filter、query 是現在那頁的，另一頁的收在這裡；行程分頁沿用探索那份 */
  filterStash: Record<FilterOwner, { filter: Filter; query: string }>;
  mode: 'map' | 'explore' | 'wish';
  /** 編輯中（進入前確認、閒置結束）；選「全部」時一定結束 */
  planning: boolean;
  /** 指到（只有網頁，§8.1）：滑鼠在卡片、清單列、時間軸卡片、地圖的點上；地圖上那個點放大、加淡灰光圈 */
  hoveredId: string | null;
  /** 指到是從地圖的點來的（只有這種才在清單、時間軸標出那張卡，卡片自己的 hover 不回頭標自己） */
  hoverFromMap: boolean;
  /** 選中（§8.1）：地圖上的數字水滴，同一時間只有一個；換分頁、換天、點地圖空白處清掉 */
  selectedId: string | null;
  /** 每選一次加 1（再選同一個也加）：水滴再跳一次 */
  selectSeq: number;
  /** 小卡片 */
  previewId: string | null;
  /** 詳情面板（車站的詳情面板裡有時刻表） */
  detailId: string | null;
  /** 詳情從哪裡打開（detailId 是 null 時也是 null）；網頁：map 浮在地圖右邊、explore／wish 蓋在右欄 */
  detailFrom: DetailFrom | null;
  /** 詳情一打開就選哪個分頁（想去列點最新留言：comments）；null＝簡介 */
  detailTab: DetailTabId | null;
  /** 電腦版點了地圖上的點、從詳情返回：探索清單捲到那張卡片（seq 讓同一個點再點一次也會捲）；不改篩選 */
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
  /** 時間軸點開的那段交通（useLegView 設，收起來清掉） */
  legRoute: LegRoute | null;
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
  /** 拖曳行程中（body.dragging-plan）不理；from='map'：從地圖的點來的 */
  hover(id: string | null, from?: 'map'): void;
  select(id: string | null): void;
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
  /** routes 和 legRoute 都找 */
  updateRoute(id: string, patch: Partial<Omit<MapRoute, 'id'>>): void;
  setLegRoute(route: Omit<LegRoute, 'id'> | null): void;
  setCompare(ids: string[]): void;
  /** 清掉 AI 的標示、路線、比較（不動提議、交通的路線、選中） */
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
  filterStash: { explore: { filter: EMPTY_FILTER, query: '' }, wish: { filter: EMPTY_FILTER, query: '' } },
  mode: 'map',
  planning: false,
  hoveredId: null,
  hoverFromMap: false,
  selectedId: null,
  selectSeq: 0,
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
  legRoute: null,
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
    // 換天照樣在編輯；選「全部」（整趟總覽）就結束編輯。換天時整趟點亮的那天、選中清掉
    selectDay: (day) =>
      set((s) => ({ day, tripFocusDay: null, ...(day === 'all' ? { planning: false } : {}), ...(day !== s.day ? { selectedId: null } : {}) })),
    setTripFocusDay: (tripFocusDay) => set({ tripFocusDay }),
    setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
    toggleFilter: (key, value) =>
      set((s) => ({ filter: { ...s.filter, [key]: toggleValue(s.filter[key] as string[], value) } })),
    clearFilter: () => set({ filter: EMPTY_FILTER }),
    setQuery: (query) => set({ query }),
    // 換分頁取消選中；探索、想去的篩選、搜尋換成那頁自己的
    setMode: (mode) =>
      set((s) => {
        if (mode === s.mode) return { mode };
        const from = ownerOf(s.mode);
        const to = ownerOf(mode);
        if (from === to) return { mode, selectedId: null };
        const filterStash = { ...s.filterStash, [from]: { filter: s.filter, query: s.query } };
        return { mode, selectedId: null, filterStash, filter: filterStash[to].filter, query: filterStash[to].query };
      }),
    setPlanning: (planning) => set({ planning }),
    hover: (hoveredId, from) => {
      if (dragging()) return;
      set({ hoveredId, hoverFromMap: !!hoveredId && from === 'map' });
    },
    select: (selectedId) => set((s) => ({ selectedId, selectSeq: s.selectSeq + 1 })),
    openPreview: (previewId) => set({ previewId }),
    // 打開詳情時小卡片收起；那個點就是選中的點
    openDetail: (detailId, from, tab) =>
      set((s) => ({ detailId, detailFrom: from ?? s.mode, detailTab: tab ?? null, previewId: null, selectedId: detailId, selectSeq: s.selectSeq + (s.selectedId === detailId ? 0 : 1) })),
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
    updateRoute: (id, patch) =>
      set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)), legRoute: s.legRoute?.id === id ? { ...s.legRoute, ...patch } : s.legRoute })),
    setLegRoute: (route) => set({ legRoute: route && { ...route, id: `leg${++routeSeq}` } }),
    setCompare: (ids) => set({ compare: [...new Set(ids)] }),
    clearHighlights: () => set({ highlights: {}, routes: [], compare: [] }),
    setProposal: (proposal) => set({ proposal }),
  }));
}

/** 正在拖行程的卡（planDrag.ts 在 body 加 dragging-plan）：這時的 hover 不算 */
const dragging = () => typeof document !== 'undefined' && document.body?.classList.contains('dragging-plan');

/** 整個網站共用的一份 */
export const appStore = createAppStore();
