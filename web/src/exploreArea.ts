// 換探索、想去的目前地區（地區列、概覽的「看鳥羽 ›」、地圖的地區標籤共用，T42、T43）
import { appStore } from './store.ts';
import { commands } from './appCommands.ts';
import { dataStore } from './dataStore.ts';
import { initialExtent } from './lib/areas.ts';
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
