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
  /** 預設資料的資料點（修改層由 dataStore 用 data/merge.ts 套上） */
  loadPlaces(): Promise<Place[]>;
  /** 車站的發車時刻表（近鐵或 JR）；沒有資料回傳 null。照車站分開，用到才載入 */
  loadTimetable(stationId: string): Promise<StationTimetable | null>;
  /**
   * 行程引擎（T14）要的時刻表：近鐵的站間車程（_travel-times.json）、巴士、船、JR 的路線檔。
   * 第一次算時間軸時才載入（約 1.3 MB）。T15 的 API 實作從 build:static 的輸出讀。
   */
  loadEngineTimetables(): Promise<EngineTimetables>;
}
