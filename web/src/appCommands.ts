// 整個網站共用的一份地圖指令和路線查詢（UI 和 T16 的 AI 都用這一份）。
import { appStore } from './store.ts';
import { dataStore } from './dataStore.ts';
import { createCommands } from './commands.ts';
import { createRoadRouter } from './lib/routing.ts';
import { startRouteResolver } from './routeResolver.ts';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const commands = createCommands(appStore, dataStore);

/** 步行、開車路徑（OSRM）；T15 用 cachedMeters 接 engine 的 walkMeters／driveMeters */
export const roadRouter = createRoadRouter({ storage: browserStorage() });

startRouteResolver(appStore, dataStore, roadRouter);
