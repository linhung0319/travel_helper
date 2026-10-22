// 引擎需要的資料：由呼叫的人（web、worker、測試）傳進來，引擎本身不讀檔、不連網路。
// 型別只列引擎用得到的欄位；資料格式以 schema/ 為準。

import type { DateString, LonLat, PlaceBase, TimeString } from './types.ts';
import { dayOfWeek, toMinutes, WEEKDAY_KEYS } from './time.ts';

export type Period = [TimeString, TimeString];

export interface Hours {
  mon?: Period[] | null;
  tue?: Period[] | null;
  wed?: Period[] | null;
  thu?: Period[] | null;
  fri?: Period[] | null;
  sat?: Period[] | null;
  sun?: Period[] | null;
  holiday?: Period[] | null;
  lastEntry?: TimeString | (TimeString | null)[] | null;
  always?: boolean;
  note?: string | null;
}

export interface Closure {
  from: DateString;
  to: DateString;
  note?: string | null;
}

/** 資料點：引擎讀的欄位（其他欄位照樣帶著，不用） */
export interface PlaceRecord extends PlaceBase {
  region?: string;
  hours?: Hours | null;
  closures?: Closure[] | null;
  stayMinutes?: number | null;
  nearestStation?: { id: string; mode?: string; minutes?: number | null } | null;
  anchors?: { id: string; walkMinutes: number; walkSource?: string }[];
  cuisine?: string[];
  contexts?: string[];
  meals?: string | null;
  checkIn?: string | null;
  operator?: string;
  group?: {
    fit15?: 'yes' | 'split' | 'no' | 'unknown' | null;
    fitSubgroup?: 'yes' | 'no' | 'unknown' | null;
    confirmed15?: { date: string; note?: string | null } | null;
    [k: string]: unknown;
  } | null;
  reservation?: { accepted?: 'yes' | 'no' | 'groups-only' | 'unknown' | null; [k: string]: unknown } | null;
  kids?: { allowed?: string | null; friendly?: string | null; minAge?: number | null; [k: string]: unknown } | null;
  accessibility?: { walkInsideMinutes?: number | null; stairs?: string | null; [k: string]: unknown } | null;
}

/** 查詢一個地點的結果 */
export interface ResolvedPlace {
  record: PlaceRecord;
  /** base：預設資料；user：使用者自己加的點（只有座標） */
  origin: 'base' | 'user';
  /** 已下架（architecture §3.4） */
  retired: boolean;
}

/** 近鐵 data/timetables/kintetsu/_travel-times.json */
export interface KintetsuTimes {
  validFrom: DateString;
  stationOrder: string[];
  trains: Record<'weekday' | 'holiday', Record<string, KintetsuTrain>>;
}

export interface KintetsuTrain {
  type: string;
  note: string | null;
  to: string;
  dir: string;
  stops: [string, TimeString | null, TimeString | null][];
}

/** 巴士、定期船、JR 的路線檔（data/timetables/bus|ferry|jr/*.json，有 stops、trips 的） */
export interface RouteTimetable {
  id: string;
  mode: 'bus' | 'ferry' | 'jr' | string;
  operator?: string;
  name: { ja: string; zh?: string | null };
  validFrom: DateString;
  validTo?: DateString | null;
  stops: { id: string; name: string; coords?: LonLat; near?: { id: string; meters: number }[] }[];
  trips: Partial<Record<'weekday' | 'saturday' | 'holiday', RouteTrip[]>>;
  fares?: { adult?: Record<string, Record<string, number>> } | null;
}

export interface RouteTrip {
  id: string;
  headsign: string;
  dates?: DateString[];
  stops: [string, TimeString | null, TimeString | null][];
}

export interface EngineData {
  /** 用 ID 查地點（預設資料、使用者加的點、車站）；查不到回傳 null */
  getPlace(id: string): ResolvedPlace | null;
  stations: PlaceRecord[];
  kintetsu?: KintetsuTimes | null;
  routes?: RouteTimetable[];
  /** 子地區 ID → 是否大部分地點要搭車（areas.json 的 regions[].needsCar） */
  regionNeedsCar?: Record<string, boolean>;
  /**
   * 實際步行距離（公尺，係數 1），例如讀 data/cache/routes/ 的 OSRM 快取；
   * 沒有就回傳 null，引擎改用 anchors 或直線估算。
   */
  walkMeters?: (from: LonLat, to: LonLat) => number | null;
  /**
   * 實際開車距離（公尺），例如網站從 OSRM 的開車路徑拿到的；沒有就回傳 null，
   * 計程車、包車改用直線 × roadDetour 估算。
   */
  driveMeters?: (from: LonLat, to: LonLat) => number | null;
}

/** 從一批資料點建 EngineData.getPlace：users 是使用者加的點，retired 是已下架的 ID */
export function placeLookup(
  base: Iterable<PlaceRecord>,
  opts: { users?: Iterable<PlaceRecord>; retired?: Iterable<string> } = {},
): (id: string) => ResolvedPlace | null {
  const map = new Map<string, ResolvedPlace>();
  const retired = new Set(opts.retired ?? []);
  for (const r of base) map.set(r.id, { record: r, origin: 'base', retired: retired.has(r.id) });
  for (const r of opts.users ?? []) map.set(r.id, { record: r, origin: 'user', retired: false });
  return (id) => map.get(id) ?? null;
}

// --- 營業時間 ---------------------------------------------------------------

export type OpenStatus =
  | { kind: 'unknown'; reason: string }
  | { kind: 'closed'; reason: string }
  | { kind: 'open'; periods: { open: number; close: number; lastEntry: number | null }[] };

/** 某天的營業時段；國定假日有寫 holiday 就用 holiday，否則用星期幾 */
export function openingOn(place: PlaceRecord, date: DateString, holidays: readonly DateString[]): OpenStatus {
  const closure = place.closures?.find((c) => c.from <= date && date <= c.to);
  if (closure) return { kind: 'closed', reason: closure.note ?? `${closure.from}～${closure.to} 休業` };
  const h = place.hours;
  if (h == null) return { kind: 'unknown', reason: '營業時間未查' };
  if (h.always) return { kind: 'open', periods: [{ open: 0, close: 48 * 60, lastEntry: null }] };
  const key = holidays.includes(date) && h.holiday != null ? 'holiday' : WEEKDAY_KEYS[dayOfWeek(date)];
  const day = h[key];
  if (day == null) return { kind: 'unknown', reason: `${key === 'holiday' ? '國定假日' : '這天'}的營業時間未查` };
  if (day.length === 0) return { kind: 'closed', reason: '公休' };
  const le = h.lastEntry;
  return {
    kind: 'open',
    periods: day.map(([o, c], i) => {
      const l = Array.isArray(le) ? le[i] ?? null : day.length === 1 || i === day.length - 1 ? le ?? null : null;
      return { open: toMinutes(o), close: toMinutes(c), lastEntry: l ? toMinutes(l) : null };
    }),
  };
}
