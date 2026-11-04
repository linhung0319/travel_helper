// 換探索、想去的目前地區（地區列、概覽的「看鳥羽 ›」、地圖的地區標籤共用，T42、T43）
import { appStore } from './store.ts';
import { commands } from './appCommands.ts';
import { dataStore } from './dataStore.ts';
import { initialExtent } from './lib/areas.ts';
import { EMPTY_FILTER } from './lib/filter.ts';
import { wishPrefs } from './shared/wishPrefs.ts';
import { overviewStore } from './shared/overviewStore.ts';
import { currentArea } from './lib/shelves.ts';

/** 換地區（子地區清掉、取消選中的點），地圖飛過去；概覽（null）時看整個伊勢志摩。「自己加 N」一起取消 */
export function pickArea(area: string | null) {
  const s = appStore.getState();
  wishPrefs.getState().setUserOnly(false);
  s.select(null);
  s.setFilter({ areas: area ? [area] : [], regions: [] });
  if (area) commands.focus({ area });
  else {
    const { areas, places } = dataStore.getState();
    const bbox = initialExtent(areas, places);
    if (bbox) commands.focus({ bbox });
  }
}

/** 地區列的鈕（含「概覽」「全部」、目前這顆，T49）：地區、子地區以外的條件和搜尋都清掉，回到那一層的第一頁（概覽或那區的書架）。想去一樣 */
export function pickAreaChip(area: string | null) {
  const s = appStore.getState();
  // 「概覽」鈕：概覽的卡全部換回全區、地圖的框拿掉（T63 §28）
  if (!area) overviewStore.getState().reset();
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
  const { areas, places } = dataStore.getState();
  const bbox = initialExtent(areas, places);
  if (bbox) commands.focus({ bbox });
}

/** 選區後的子地區列：一次一個；null 是整區 */
export function pickRegion(region: string | null) {
  const s = appStore.getState();
  s.setFilter({ regions: region ? [region] : [] });
  const area = currentArea(s.filter);
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
