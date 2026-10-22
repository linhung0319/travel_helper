// 測試用的假資料：在鳥羽附近放幾個點，距離用公尺控制（不依賴 data/ 的內容）
import { placeLookup, type EngineData, type PlaceRecord } from '../src/index.ts';
import type { LonLat } from '../src/types.ts';

export const ORIGIN: LonLat = [136.84, 34.48];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((34.48 * Math.PI) / 180);

/** 從 ORIGIN 往東 east 公尺、往北 north 公尺的座標 */
export function at(east: number, north = 0): LonLat {
  return [ORIGIN[0] + east / M_PER_DEG_LON, ORIGIN[1] + north / M_PER_DEG_LAT];
}

const OPEN: [string, string][] = [['09:00', '17:00']];
export const ALL_WEEK = { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: OPEN, sat: OPEN, sun: OPEN };

export function spot(id: string, coords: LonLat, extra: Partial<PlaceRecord> = {}): PlaceRecord {
  return { id, type: 'spot', name: { ja: id }, coords, sources: [], hours: ALL_WEEK, stayMinutes: 60, region: 'r1', ...extra } as PlaceRecord;
}

export function restaurant(id: string, coords: LonLat, extra: Partial<PlaceRecord> = {}): PlaceRecord {
  return {
    id,
    type: 'restaurant',
    name: { ja: id },
    coords,
    sources: [],
    hours: ALL_WEEK,
    cuisine: ['定食・食堂'],
    group: { fit15: 'yes', fitSubgroup: 'yes' },
    reservation: { accepted: 'yes' },
    kids: { allowed: 'yes' },
    region: 'r1',
    ...extra,
  } as PlaceRecord;
}

export function lodging(id: string, coords: LonLat, extra: Partial<PlaceRecord> = {}): PlaceRecord {
  return { id, type: 'lodging', name: { ja: id }, coords, sources: [], meals: 'dinner+breakfast', checkIn: '15:00', region: 'r1', ...extra } as PlaceRecord;
}

export function station(id: string, coords: LonLat): PlaceRecord {
  return { id, type: 'station', name: { ja: id }, coords, sources: [], operator: 'other', region: 'r1' } as PlaceRecord;
}

export function fake(places: PlaceRecord[], extra: Partial<EngineData> & { users?: PlaceRecord[]; retired?: string[] } = {}): EngineData {
  const { users, retired, ...rest } = extra;
  return { getPlace: placeLookup(places, { users, retired }), stations: places.filter((p) => p.type === 'station'), ...rest };
}
