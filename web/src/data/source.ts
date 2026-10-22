// 資料存取的介面（architecture §2）。UI 只透過它拿資料，所以本機（T11）和 API（T15 起）兩種實作可以互換。

import type { Area, Place, StationTimetable } from './types.ts';

export interface DataSource {
  /** 區域（areas.json），依 tripOrder 排序 */
  loadAreas(): Promise<Area[]>;
  /** 合併後的資料點（預設資料＋修改層），每筆附上 `edited` */
  loadPlaces(): Promise<Place[]>;
  /** 車站的發車時刻表（近鐵或 JR）；沒有資料回傳 null。照車站分開，用到才載入 */
  loadTimetable(stationId: string): Promise<StationTimetable | null>;
}
