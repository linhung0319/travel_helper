// 地圖網站的狀態（architecture §2）。UI 和之後的 AI 指令（T12）改的是同一份。
// 這裡只放最基本的設定函式；T12 會在上面包一層地圖指令（focus、highlight、selectDay、setFilter…）。

import { createStore } from 'zustand/vanilla';
import { EMPTY_FILTER, toggleValue, type Filter, type FilterKey } from './lib/filter.ts';
import type { Bbox, LonLat } from './data/types.ts';

/** 'all'＝全部的天；否則是 YYYY-MM-DD */
export type DaySelection = 'all' | string;

export type SheetTab = 'chat' | 'day';
export type SheetSnap = 'peek' | 'half' | 'full';

/** 叫地圖移動的請求：MapView 看到 seq 變了就移過去（使用者自己拖地圖不會產生請求） */
export interface CameraRequest {
  seq: number;
  bbox?: Bbox;
  center?: LonLat;
  zoom?: number;
}

export interface AppState {
  /** 地圖目前的範圍（地圖移動結束時更新）；給探索模式和 AI 當脈絡 */
  view: { center: LonLat; zoom: number; bounds: Bbox } | null;
  day: DaySelection;
  filter: Filter;
  mode: 'map' | 'explore';
  /** 規劃模式（T15 接上進入前確認、閒置退出） */
  planning: boolean;
  /** 滑鼠移過去、或在圖片牆點了的點：地圖上會閃 */
  hoveredId: string | null;
  /** 小卡片 */
  previewId: string | null;
  /** 詳情面板（車站的詳情面板裡有時刻表） */
  detailId: string | null;
  /** 「問 AI」選取的點（interaction-design §5；T12、T16 接上） */
  selection: string[];
  sheet: { tab: SheetTab; snap: SheetSnap };
  /** 車站面板的指定時間；null＝預設 */
  stationTime: string | null;
  camera: CameraRequest | null;
}

export interface AppActions {
  setView(view: AppState['view']): void;
  selectDay(day: DaySelection): void;
  setFilter(patch: Partial<Filter>): void;
  toggleFilter(key: FilterKey, value: string): void;
  clearFilter(): void;
  setMode(mode: AppState['mode']): void;
  setPlanning(on: boolean): void;
  hover(id: string | null): void;
  openPreview(id: string | null): void;
  openDetail(id: string): void;
  closeDetail(): void;
  addToSelection(id: string): void;
  removeFromSelection(id: string): void;
  setSheet(patch: Partial<AppState['sheet']>): void;
  setStationTime(time: string | null): void;
  moveCamera(req: Omit<CameraRequest, 'seq'>): void;
}

export type AppStore = AppState & AppActions;

export const initialState: AppState = {
  view: null,
  day: 'all',
  filter: EMPTY_FILTER,
  mode: 'map',
  planning: false,
  hoveredId: null,
  previewId: null,
  detailId: null,
  selection: [],
  sheet: { tab: 'chat', snap: 'peek' },
  stationTime: null,
  camera: null,
};

export function createAppStore(init: Partial<AppState> = {}) {
  return createStore<AppStore>()((set) => ({
    ...initialState,
    ...init,
    setView: (view) => set({ view }),
    selectDay: (day) => set({ day }),
    setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
    toggleFilter: (key, value) =>
      set((s) => ({ filter: { ...s.filter, [key]: toggleValue(s.filter[key] as string[], value) } })),
    clearFilter: () => set({ filter: EMPTY_FILTER }),
    setMode: (mode) => set({ mode }),
    setPlanning: (planning) => set({ planning }),
    hover: (hoveredId) => set({ hoveredId }),
    openPreview: (previewId) => set({ previewId }),
    // 打開詳情時小卡片收起；手機的面板拉到一半，地圖還看得到
    openDetail: (detailId) =>
      set((s) => ({ detailId, previewId: null, sheet: { ...s.sheet, snap: s.sheet.snap === 'peek' ? 'half' : s.sheet.snap } })),
    closeDetail: () => set({ detailId: null }),
    addToSelection: (id) => set((s) => (s.selection.includes(id) ? s : { selection: [...s.selection, id] })),
    removeFromSelection: (id) => set((s) => ({ selection: s.selection.filter((x) => x !== id) })),
    setSheet: (patch) => set((s) => ({ sheet: { ...s.sheet, ...patch } })),
    setStationTime: (stationTime) => set({ stationTime }),
    moveCamera: (req) => set((s) => ({ camera: { ...req, seq: (s.camera?.seq ?? 0) + 1 } })),
  }));
}

/** 整個網站共用的一份 */
export const appStore = createAppStore();
