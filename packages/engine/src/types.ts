// web、worker、引擎共用的型別。資料格式以 schema/ 為準，這裡只列程式用得到的欄位。
// T22 先放空殼：資料點的共同欄位；行程的型別由 T14 補上（CONVENTIONS §3「行程」）。

export const PLACE_TYPES = ['station', 'spot', 'lodging', 'restaurant'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const AREA_IDS = ['ise', 'futami', 'toba', 'shima', 'kix'] as const;
export type AreaId = (typeof AREA_IDS)[number];

/** [經度, 緯度] */
export type LonLat = [number, number];

/** YYYY-MM-DD，日本時間（architecture §3.8） */
export type DateString = string;
/** HH:MM，日本時間；過了午夜可以寫 24:30、25:00 */
export type TimeString = string;

export interface LocalizedName {
  ja: string;
  kana?: string | null;
  zh?: string | null;
  en?: string | null;
}

export interface Source {
  type: string;
  url: string;
  retrieved: DateString;
  note?: string | null;
}

/** 資料點的共同欄位；各類別的其他欄位見 schema/<type>.schema.json */
export interface PlaceBase {
  id: string;
  type: PlaceType;
  name: LocalizedName;
  area?: AreaId;
  coords: LonLat;
  sources: Source[];
  [key: string]: unknown;
}
