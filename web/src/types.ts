// 只定義地圖需要的欄位；完整格式見 schema/

export const POINT_TYPES = ['station', 'spot', 'lodging', 'restaurant'] as const;
export type PointType = (typeof POINT_TYPES)[number];

export type LngLat = [number, number];
export type Bbox = [number, number, number, number]; // [西, 南, 東, 北]

export interface Source {
  type: string;
  url: string;
  retrieved: string;
  note?: string | null;
}

export interface Area {
  id: string;
  name: { ja: string; zh?: string | null };
  center: LngLat;
  bbox: Bbox;
  tripOrder?: number;
}

/** 讀進來的一筆資料點，加上地圖要用的資訊 */
export interface Point {
  key: string; // 檔案路徑 + 索引，全部唯一（id 可能重複，重複正是要檢查的）
  id: string;
  type: PointType;
  label: string;
  area: string | null;
  coords: LngLat | null; // null：沒有座標或座標格式錯誤
  file: string; // 例如 data/areas/toba/spots.json
  fixture: boolean;
  sources: Source[];
  raw: Record<string, unknown>;
}

export type IssueKind = 'bad-coords' | 'outside-region' | 'outside-area' | 'duplicate-id' | 'no-sources';

export interface Issue {
  kind: IssueKind;
  pointKey: string;
  message: string;
}
