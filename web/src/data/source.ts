// 資料存取的介面（architecture §2）。UI 只透過它拿資料，所以本機（T11）和 API（T15 起）兩種實作可以互換。

import type { KintetsuTimes, RouteTimetable, UrbanRoute, UrbanTransfer } from '@travel-helper/engine';
import type { Area, Place, StationTimetable } from './types.ts';

/** 行程引擎要的時刻表（loadEngineTimetables 的回傳） */
export interface EngineTimetables {
  kintetsu: KintetsuTimes | null;
  routes: RouteTimetable[];
  /** 大阪的班距型路線 */
  urban: UrbanRoute[];
  /** 大阪的轉乘表 */
  urbanTransfers: UrbanTransfer[];
}

export interface DataSource {
  /** 區域（areas.json），依 tripOrder 排序 */
  loadAreas(): Promise<Area[]>;
  /** 預設資料的資料點：只有清單層（worker/src/lib/placeLayers.ts）；修改層由 dataStore 用 data/merge.ts 套上 */
  loadPlaces(): Promise<Place[]>;
  /** 資料點的詳情層（dataStore 的 ensureDetails）：給 ids 只讀那幾個（T47），不給是全部（匯出行程）。沒有的 ID 不回傳 */
  loadPlaceDetails(ids?: readonly string[]): Promise<{ id: string }[]>;
  /** 車站的發車時刻表（近鐵或 JR）；沒有資料回傳 null。照車站分開，用到才載入 */
  loadTimetable(stationId: string): Promise<StationTimetable | null>;
  /**
   * 行程引擎（T14）要的時刻表：近鐵的站間車程（_travel-times.json）、巴士、船、JR 的路線檔。
   * 第一次算時間軸時才載入（約 1.3 MB）。正式 build 讀 build:static 的 timetables/engine.json，一個請求。
   */
  loadEngineTimetables(): Promise<EngineTimetables>;
  /** 票券（passes.json）、機場交通（access/）：AI 的 get_trip_info 用，用到才載入。沒有資料回傳 null */
  loadTripInfo(topic: 'passes' | 'airport'): Promise<unknown>;
}
