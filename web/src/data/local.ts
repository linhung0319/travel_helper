// 本機的實作：build 時直接讀 data/（Vite 的 import.meta.glob）。
// 只讀網站要用的檔案（areas/、stations.json、areas.json、時刻表），研究筆記（raw/）、cache/、derived/ 不打包。

import type { KintetsuTimes, RouteTimetable, UrbanRoute, UrbanTransfer } from '@travel-helper/engine';
import { normalizeAreas, normalizePlaceList } from './normalize.ts';
import type { DataSource } from './source.ts';
import type { StationTimetable } from './types.ts';

// 新增區域時（data/areas/<新區域>/）會自動被讀進來，不用改程式
const placeModules = import.meta.glob<unknown>(['../../../data/areas/*/*.json', '../../../data/stations.json'], {
  eager: true,
  import: 'default',
});
const areasModule = import.meta.glob<unknown>('../../../data/areas.json', { eager: true, import: 'default' });

// 時刻表照車站拆開，不 eager：用到哪一站才載入那一站
const timetableModules = import.meta.glob<unknown>(
  // _travel-times.json（各站之間的車程）不是車站的時刻表
  ['../../../data/timetables/kintetsu/[!_]*.json', '../../../data/timetables/jr/*.json'],
  { import: 'default' },
);

// 行程引擎用的：近鐵的站間車程、巴士、船、JR 的路線檔（有 stops、trips 的）
const kintetsuTimesModule = import.meta.glob<unknown>('../../../data/timetables/kintetsu/_travel-times.json', { import: 'default' });
const routeModules = import.meta.glob<unknown>(['../../../data/timetables/bus/*.json', '../../../data/timetables/ferry/*.json', '../../../data/timetables/jr/*.json'], {
  import: 'default',
});

// 大阪的班距型路線；_transfers.json 是轉乘表，其他是路線
const urbanModules = import.meta.glob<unknown>('../../../data/timetables/urban/*.json', { import: 'default' });

function timetableLoader(stationId: string) {
  for (const [path, load] of Object.entries(timetableModules)) {
    if (path.endsWith(`/${stationId}.json`)) return load;
  }
  return null;
}

export const localSource: DataSource = {
  async loadAreas() {
    return normalizeAreas(Object.values(areasModule)[0]);
  },
  async loadPlaces() {
    return Object.values(placeModules).flatMap(normalizePlaceList);
  },
  async loadTimetable(stationId) {
    const load = timetableLoader(stationId);
    if (!load) return null;
    const content = (await load()) as StationTimetable;
    // jr-sangu.json 這類路線格式的檔案沒有 directions
    return content && typeof content === 'object' && 'directions' in content ? content : null;
  },
  async loadEngineTimetables() {
    const [kintetsu, routes, urbanDocs] = await Promise.all([
      Object.values(kintetsuTimesModule)[0]?.() ?? Promise.resolve(null),
      Promise.all(Object.values(routeModules).map((load) => load())),
      Promise.all(Object.entries(urbanModules).map(async ([p, load]) => ({ isTransfers: p.endsWith('/_transfers.json'), doc: await load() }))),
    ]);
    return {
      urban: urbanDocs.filter((u) => !u.isTransfers).map((u) => u.doc as UrbanRoute),
      urbanTransfers: urbanDocs.filter((u) => u.isTransfers).flatMap((u) => u.doc as UrbanTransfer[]),
      kintetsu: (kintetsu as KintetsuTimes | null) ?? null,
      routes: routes.filter((r): r is RouteTimetable => !!r && typeof r === 'object' && 'stops' in r && 'trips' in r),
    };
  },
};
