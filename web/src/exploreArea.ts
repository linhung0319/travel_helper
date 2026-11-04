// 換探索、想去的目前地區（地區列、子地區列、概覽的「看鳥羽 ›」、地圖的地區標籤共用，T42、T43）。
// T69（interaction-design §33）：「看哪裡」（地區、子地區）和「看什麼」（篩選、搜尋、想去的那一排）分開——換地區、子地區只換範圍，篩選留著，
// 書架帶來的條件照新的範圍重挑級數（lib/shelves.ts 的 rescopeFilter）。回書架是篩選列的「▤ 書架」（Explore.tsx）。
// 探索的「概覽」只有一層：有篩選時點它會離開篩選，留一份在 lensUndo，畫面出「復原」（復原就回到剛才的地區和篩選）。想去的「全部」也有三排書架，不離開。
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { appStore } from './store.ts';
import { commands } from './appCommands.ts';
import { dataStore } from './dataStore.ts';
import { initialExtent } from './lib/areas.ts';
import { EMPTY_FILTER, isFilterEmpty, type Filter } from './lib/filter.ts';
import { overviewStore } from './shared/overviewStore.ts';
import { backLabel, currentArea, rescopeFilter } from './lib/shelves.ts';
import { placeLabel } from './lib/listConditions.ts';

/** 地圖飛到那區（null：整個伊勢志摩） */
function focusArea(area: string | null) {
  if (area) {
    commands.focus({ area });
    return;
  }
  const { areas, places } = dataStore.getState();
  const bbox = initialExtent(areas, places);
  if (bbox) commands.focus({ bbox });
}

/** 有沒有「看什麼」：地區、子地區以外的條件或搜尋 */
export const hasLens = (filter: Filter, query: string) => !!query.trim() || !isFilterEmpty({ ...filter, areas: [], regions: [] });

/** 換範圍：地區、子地區換成 base，篩選照 rescopeFilter 跟著走 */
function setScope(areas: string[], regions: string[]) {
  const s = appStore.getState();
  s.setFilter(rescopeFilter(s.filter, { areas, regions }, dataStore.getState().places));
}

/** 換地區（子地區清掉、取消選中的點），地圖飛過去；篩選、搜尋留著（T69）。null 是沒選地區（探索的概覽、想去的「全部」） */
export function pickArea(area: string | null) {
  const s = appStore.getState();
  s.select(null);
  setScope(area ? [area] : [], []);
  focusArea(area);
}

/** 概覽離開篩選時留的那一份（T69）：「復原」回到剛才的地區和篩選；換到別的地方就不要了 */
export interface LensUndo {
  /** 「一定要去 · 鳥羽」（畫面寫「已離開「…」」） */
  label: string;
  /** 回到剛才的地區和篩選（網頁、手機各自的 store） */
  restore(): void;
}

export const lensUndo = createStore<{ undo: LensUndo | null; set(u: LensUndo | null): void }>()((set) => ({ undo: null, set: (undo) => set({ undo }) }));
export const useLensUndo = <T,>(sel: (s: { undo: LensUndo | null }) => T) => useStore(lensUndo, sel);

/**
 * 地區列的鈕（含「概覽」「全部」）。探索的「概覽」：有篩選時離開篩選（留復原），概覽的卡全部換回全區（T63 §28）；
 * 想去的「全部」、其他地區：只換範圍，篩選留著（T69）
 */
export function pickAreaChip(area: string | null) {
  const s = appStore.getState();
  lensUndo.getState().set(null);
  if (!area && s.mode !== 'wish') {
    if (hasLens(s.filter, s.query)) {
      const { filter, query } = s;
      lensUndo.getState().set({ label: lensLabel(filter, query, dataStore.getState().areas), restore: () => restoreLens(filter, query) });
    }
    overviewStore.getState().reset();
    s.setFilter(EMPTY_FILTER);
    s.setQuery('');
  }
  pickArea(area);
}

/** 「復原」：回到離開概覽前的地區、子地區和篩選 */
function restoreLens(filter: Filter, query: string) {
  const s = appStore.getState();
  s.setFilter(filter);
  s.setQuery(query);
  if (filter.regions.length === 1) commands.focus({ region: filter.regions[0] });
  else focusArea(currentArea(filter));
}

/** 按「復原」：做完就收掉 */
export function undoLeave() {
  const u = lensUndo.getState().undo;
  lensUndo.getState().set(null);
  u?.restore();
}

/** 離開篩選的那句（「一定要去 · 鳥羽」）：篩選是書架名或「自己篩選」，只有搜尋寫「「海女」」 */
export function lensLabel(filter: Filter, query: string, areaNames: Parameters<typeof placeLabel>[1]): string {
  const what = hasLens(filter, '') ? backLabel(filter) : `「${query.trim()}」`;
  return [what, placeLabel(filter, areaNames)].filter(Boolean).join(' · ');
}

/** 回到那區的書架（第一頁）：地區、子地區以外的條件和搜尋都清掉。整趟「未選住宿」的捷徑用（換到那區的書架、捲到住宿那排） */
export function openAreaHome(area: string) {
  const s = appStore.getState();
  lensUndo.getState().set(null);
  s.setFilter(EMPTY_FILTER);
  s.setQuery('');
  pickArea(area);
}

/** 概覽的卡點了子地區一行（T63 §28，網頁）：地圖框到那個子地區，region 是 null 時框到整區；人還在概覽 */
export function focusOverview(area: string, region: string | null) {
  commands.focus(region ? { region } : { area });
}

/** 地圖的「⤢ 看全部地區」（T63 §28）：概覽的卡全部換回全區，地圖回到一進概覽時的範圍 */
export function showAllAreas() {
  overviewStore.getState().reset();
  focusArea(null);
}

/** 子地區列：一次一個；null 是整區。篩選留著（T69） */
export function pickRegion(region: string | null) {
  const s = appStore.getState();
  setScope(s.filter.areas, region ? [region] : []);
  const area = currentArea(appStore.getState().filter);
  if (region) commands.focus({ region });
  else if (area) commands.focus({ area });
}

/** 概覽的「看賢島 ›」（T63）：進那一區再選那個子地區 */
export function overviewRegion(area: string, region: string) {
  pickArea(area);
  pickRegion(region);
}

/** 網頁地圖中間縮放的子地區名（T65）：等於子地區列選那個子地區；不在那區時先進那區（同「看賢島 ›」） */
export function pickMapRegion(area: string, region: string) {
  if (currentArea(appStore.getState().filter) === area) pickRegion(region);
  else overviewRegion(area, region);
}
