// 換探索、想去的目前地區（地區列、概覽的「看鳥羽 ›」、地圖的地區標籤共用，T42、T43）
import { appStore } from './store.ts';
import { commands } from './appCommands.ts';
import { dataStore } from './dataStore.ts';
import { initialExtent } from './lib/areas.ts';
import { EMPTY_FILTER } from './lib/filter.ts';
import { wishPrefs } from './shared/wishPrefs.ts';

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
  s.setFilter(EMPTY_FILTER);
  s.setQuery('');
  pickArea(area);
}
