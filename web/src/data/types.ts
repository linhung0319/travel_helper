// 網站用到的資料型別。資料格式以 schema/ 為準，這裡只列介面用得到的欄位。
// 共用的基本型別從 @travel-helper/engine 拿；engine 還沒有的（區域、照片、各類別的欄位）先放這裡，之後再搬。

import type { LocalizedName, LonLat, Source } from '@travel-helper/engine/types';

export type { LocalizedName, LonLat, Source };

export const PLACE_TYPES = ['station', 'spot', 'lodging', 'restaurant'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const TIERS = ['S', 'A', 'B'] as const;
export type Tier = (typeof TIERS)[number];

export const CONTEXTS = ['lunch', 'dinner', 'transit', 'snack', 'cafe'] as const;
export type Context = (typeof CONTEXTS)[number];

/** [西, 南, 東, 北] */
export type Bbox = [number, number, number, number];

export interface Region {
  id: string;
  name: LocalizedName;
  center?: LonLat;
  needsCar?: boolean;
  note?: string | null;
}

/** data/areas.json 的一筆。區域一律從這裡讀，程式裡不寫死區域 ID（PLAN T11） */
export interface Area {
  id: string;
  name: LocalizedName;
  tripOrder?: number;
  center: LonLat;
  bbox: Bbox;
  stations?: string[];
  regions?: Region[];
}

export interface Photo {
  url: string;
  page?: string | null;
  kind?: string | null;
  credit?: string | null;
  license?: string | null;
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'holiday';
export type TimeRange = [string, string];

export interface Hours {
  mon?: TimeRange[] | null;
  tue?: TimeRange[] | null;
  wed?: TimeRange[] | null;
  thu?: TimeRange[] | null;
  fri?: TimeRange[] | null;
  sat?: TimeRange[] | null;
  sun?: TimeRange[] | null;
  holiday?: TimeRange[] | null;
  note?: string | null;
  lastEntry?: string | (string | null)[] | null;
  always?: boolean;
}

export interface Closure {
  from: string;
  to: string;
  note?: string | null;
}

export interface Assessment {
  rubric: string;
  scores: Record<string, number | null>;
  rationale?: Record<string, string | null>;
  confidence?: 'high' | 'medium' | 'low' | null;
  assessed?: string;
}

export interface Summary {
  text: string;
  pros?: string[];
  cons?: string[];
}

export interface Anchor {
  id: string;
  walkMinutes: number | null;
  walkSource?: string | null;
}

/** 使用者修改過的欄位（architecture §3.2）。本機的實作沒有修改層，一律是空的 */
export interface FieldEdit {
  author: string;
  at: string;
  baseValue: unknown;
}

/**
 * 合併後的資料點：預設資料再套上修改層。
 * 各類別的欄位都是選填（`raw` 保留整筆原始資料，詳情面板顯示少見的欄位時用）。
 */
export interface Place {
  id: string;
  type: PlaceType;
  name: LocalizedName;
  area: string | null;
  region: string | null;
  coords: LonLat;
  tier: Tier | null;
  photos: Photo[];
  summary: Summary | null;
  assessment: Assessment | null;
  hours: Hours | null;
  closedNote: string | null;
  febNote: string | null;
  closures: Closure[];
  contexts: Context[];
  tags: string[];
  cuisine: string[];
  anchors: Anchor[];
  links: Record<string, string | null>;
  sources: Source[];
  raw: Record<string, unknown>;
  /** 欄位路徑（例如 `hours`、`group.maxSeats`）→ 修改資訊 */
  edited: Record<string, FieldEdit>;
}

export interface TimetableTrain {
  dep: string;
  type: string;
  to: string;
  trainNo?: string | null;
  note?: string | null;
}

/** timetables/kintetsu/<id>.json、timetables/jr/<id>.json（車站格式） */
export interface StationTimetable {
  station: string;
  validFrom: string | null;
  validTo: string | null;
  retrieved: string;
  source: string;
  sources: Source[];
  directions: Record<string, { weekday: TimetableTrain[]; holiday: TimetableTrain[] }>;
  notes?: string | null;
}
