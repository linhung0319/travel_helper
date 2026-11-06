// 呈現介面（規格 §5）：工具只呼叫這個介面，AI 不知道是哪個平台。
// 地圖、結果集、路線兩邊一樣（createBaseStage）；切畫面的部分（ScreenSurface）T16m-b、T16m-c 各寫一份。

import type { StoreApi } from 'zustand/vanilla';
import type { LonLat } from '@travel-helper/engine/types';
import type { createCommands, FocusTarget } from '../commands.ts';
import type { AddPlaceDraft } from '../lib/addPlace/draft.ts';
import type { AppStore, DaySelection } from '../store.ts';
import type { Filter } from '../lib/filter.ts';
import { withTheme } from '../lib/shelves.ts';
import type { AddedVia } from '../backend/types.ts';
import type { TravelMode } from '@travel-helper/engine/types';

export interface ShowPlaces {
  ids: string[];
  title: string;
  notes?: Record<string, string>;
  lettered?: boolean;
}

export interface ShowRoute {
  from: string | LonLat;
  to: string | LonLat;
  mode: TravelMode;
  minutes?: number | null;
  label?: string | null;
}

/** entry：短網址，交給加地點畫面的第一步展開（§17.8） */
export type AddPlaceInit = Partial<AddPlaceDraft> & { via: AddedVia; entry?: string };

export type ScreenTab = 'explore' | 'wish' | 'trip';
export type ScreenPanel = 'comments' | 'reservations' | 'snapshots';
export type ScreenTarget = { tab: ScreenTab } | { panel: ScreenPanel };

/** 工具呈現時用的介面：回傳 null 是成功，字串是錯誤 */
export interface Stage {
  showPlaces(input: ShowPlaces): string | null;
  showRoute(input: ShowRoute): string | null;
  showDay(day: DaySelection): string | null;
  openPlace(id: string): string | null;
  moveMap(target: FocusTarget): string | null;
  setFilter(patch: Partial<Filter>, clear: boolean): string | null;
  addPlace(init: AddPlaceInit): string | null;
  /** 切分頁、打開面板 */
  showScreen(target: ScreenTarget): string | null;
  /** 清掉結果集、路線 */
  clear(): void;
  /** 現在的畫面：AI 回覆前後比對，變了就是使用者動過畫面（不搶畫面） */
  screenKey(): string;
  /** 平台無關的「正在看什麼」（給 AI 的脈絡） */
  screenName(): 'trip' | 'explore' | 'wish' | 'detail' | 'chat';
  /** 這個平台現在的篩選（手機的 feed、wish）；null 是看 appStore */
  screenFilter(): Filter | null;
  /** 探索那份篩選（set_filter 套在這上面；T85 回給 AI 的區段數字用它算） */
  exploreFilter(): Filter;
  /** 提議採用了（手機：到行程頁） */
  afterAdopt(): void;
  /** 顯示中的提議過期了 */
  proposalStale(): void;
}

/** 各平台怎麼切畫面 */
export interface ScreenSurface {
  /** 讓使用者看得到結果集（網頁：右欄切到探索；手機：訊息裡的輪播，不用切） */
  showList(): void;
  showTab(tab: ScreenTab): void;
  /** 討論、預約、快照 */
  showPanel(panel: ScreenPanel): void;
  showDay(day: DaySelection): void;
  openPlace(id: string): void;
  /** 地圖的篩選、搜尋以外，這個平台的畫面狀態（手機的分頁、整頁） */
  screenKey(): string;
  screenName(): ReturnType<Stage['screenName']>;
  /** AI 套了篩選（已經檢查過）：手機接到自己的 feed，回傳 feed 套好後的篩選；網頁就是 appStore，不用做事 */
  filterApplied(patch: Partial<Filter>, clear: boolean): Filter | void;
  screenFilter(): Filter | null;
  /** 探索那份篩選（手機的 feed）；null 是看 appStore */
  exploreFilter(): Filter | null;
  /** AI 要套篩選了：記下這個平台現在的篩選、搜尋、展開的區段，回傳「復原」用的函式（T85 §37） */
  snapshotFilter(): () => void;
  /** AI 套了篩選的那一下：探索展開的區段整份換成這些（T85 §37） */
  openSections(ids: string[]): void;
  afterAdopt(): void;
  proposalStale(): void;
}

/**
 * 網頁（appStore 的探索那份）的「復原」：回到 AI 套用之前的篩選、搜尋、展開的區段，地圖飛回那區。
 * 呼叫時已經在探索分頁（setFilter 先 showList）
 */
export function appFilterSnapshot(app: StoreApi<AppStore>, focusArea: (area: string) => void): () => void {
  const { filter, query, sectionsOpen } = app.getState();
  const open = sectionsOpen.explore;
  return () => {
    const s = app.getState();
    s.setFilter(filter);
    s.setQuery(query);
    s.setSectionsOpen(open, 'explore');
    const area = filter.areas.length === 1 ? filter.areas[0] : null;
    if (area) focusArea(area);
  };
}

/** 還沒接上平台的預設：照 appStore（網頁版的 mode、詳情） */
export function appSurface(app: StoreApi<AppStore>): ScreenSurface {
  return {
    showList: () => app.getState().setMode('explore'),
    showTab: (tab) => app.getState().setMode(tab === 'trip' ? 'map' : tab),
    showPanel: () => {},
    showDay: () => app.getState().setMode('map'),
    openPlace: (id) => app.getState().openDetail(id),
    screenKey: () => {
      const s = app.getState();
      return [s.mode, s.detailId ?? ''].join('|');
    },
    screenName: () => {
      const s = app.getState();
      return s.detailId ? 'detail' : s.mode === 'map' ? 'trip' : s.mode;
    },
    filterApplied: () => {},
    screenFilter: () => null,
    exploreFilter: () => null,
    snapshotFilter: () => appFilterSnapshot(app, () => {}),
    openSections: (ids) => app.getState().setSectionsOpen(ids, 'explore'),
    afterAdopt: () => {},
    proposalStale: () => {},
  };
}

export interface StageDeps {
  app: StoreApi<AppStore>;
  commands: ReturnType<typeof createCommands>;
  surface: ScreenSurface;
  startAddPlace(init: AddPlaceInit): void;
}

const errorOf = (r: { ok: true } | { ok: false; error: string }) => (r.ok ? null : r.error);

export function createBaseStage({ app, commands, surface, startAddPlace }: StageDeps): Stage {
  return {
    showPlaces(input) {
      surface.showList();
      return errorOf(commands.showResult(input.ids, { title: input.title, notes: input.notes, lettered: input.lettered }));
    },
    showRoute(input) {
      // 新的路線取代上一個 AI 的路線
      commands.clearHighlights();
      const r = commands.drawRoute(input.from, input.to, input.mode, { minutes: input.minutes ?? null, label: input.label ?? null });
      if (!r.ok) return r.error;
      const ends = [input.from, input.to].filter((x): x is string => typeof x === 'string');
      if (ends.length) commands.focus(ends);
      return null;
    },
    showDay(day) {
      surface.showDay(day);
      return errorOf(commands.selectDay(day));
    },
    openPlace(id) {
      surface.openPlace(id);
      return errorOf(commands.focus(id));
    },
    moveMap: (target) => errorOf(commands.focus(target)),
    // T85 §37：先讓使用者看得到探索（網頁切到探索，篩選才套在探索那份）；套好後符合的點畫水滴、
    // 目前主題數字大於 0 的區段全部打開、內容最上面是「AI 幫你套了」（可以復原）
    setFilter(patch, clear) {
      surface.showList();
      const undo = surface.snapshotFilter();
      if (clear) commands.clearFilter();
      const err = errorOf(commands.setFilter(patch));
      if (err) return err;
      const own = surface.filterApplied(patch, clear);
      // 選了一區時一定有一個主題（不然探索畫面自己補上，會被當成使用者改了篩選）
      const now = own ?? app.getState().filter;
      let fixed = withTheme(now);
      if (fixed !== now) {
        commands.setFilter({ types: fixed.types });
        fixed = surface.filterApplied({ types: fixed.types }, false) ?? app.getState().filter;
      }
      const r = commands.showFilterResult(fixed, undo);
      if (r.ok && r.sections.length) surface.openSections(r.sections);
      return null;
    },
    addPlace(init) {
      startAddPlace(init);
      return null;
    },
    showScreen(target) {
      if ('tab' in target) surface.showTab(target.tab);
      else surface.showPanel(target.panel);
      return null;
    },
    clear() {
      commands.clearResult();
      commands.clearHighlights();
      commands.clearFilterResult();
    },
    screenKey() {
      const s = app.getState();
      const c = s.view?.center;
      return [surface.screenKey(), s.day, c ? `${c[0].toFixed(3)},${c[1].toFixed(3)}` : '', s.view?.zoom.toFixed(1) ?? ''].join('|');
    },
    screenName: () => surface.screenName(),
    screenFilter: () => surface.screenFilter(),
    exploreFilter: () => {
      const own = surface.exploreFilter();
      if (own) return own;
      // 網頁：在想去分頁時探索那份收在 filterStash（地區跟著走）
      const s = app.getState();
      return s.mode === 'wish' ? { ...s.filterStash.explore.filter, areas: s.filter.areas, regions: s.filter.regions } : s.filter;
    },
    afterAdopt: () => surface.afterAdopt(),
    proposalStale: () => surface.proposalStale(),
  };
}
