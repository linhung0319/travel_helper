import { POINT_TYPES, type Area, type Bbox, type Issue, type LngLat, type Point, type PointType } from './types';

// data/ 下所有 JSON（cache/ 除外）。新增的檔案會自動出現，不用改程式。
const dataModules = import.meta.glob<unknown>(['../../data/**/*.json', '!../../data/cache/**'], {
  eager: true,
  import: 'default',
});

// 開發用的假資料，只放在 web/src/dev-fixtures/，不會進 data/
const fixtureModules = import.meta.glob<unknown>('./dev-fixtures/*.json', {
  eager: true,
  import: 'default',
});

// 和 scripts/validate.mjs 的 BBOX_ISESHIMA 相同
export const REGION_BBOX: Bbox = [136.5, 34.2, 137.1, 34.65];

export const TYPE_LABELS: Record<PointType, string> = {
  station: '車站',
  spot: '景點',
  lodging: '住宿',
  restaurant: '餐廳',
};

export const TYPE_COLORS: Record<PointType, string> = {
  station: '#1f6feb',
  spot: '#1a7f37',
  lodging: '#8250df',
  restaurant: '#d1501a',
};

export const AREA_COLORS: Record<string, string> = {
  shima: '#0a8f8f',
  toba: '#cf222e',
  futami: '#9a6700',
  ise: '#bf3989',
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toCoords(v: unknown): LngLat | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lon, lat] = v;
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

function labelOf(name: unknown, id: string): string {
  if (!isObject(name)) return id;
  const zh = typeof name.zh === 'string' ? name.zh : null;
  const ja = typeof name.ja === 'string' ? name.ja : null;
  return zh ?? ja ?? id;
}

function extractPoints(modules: Record<string, unknown>, prefix: RegExp, base: string, fixture: boolean): Point[] {
  const out: Point[] = [];
  for (const [modPath, content] of Object.entries(modules)) {
    const file = base + modPath.replace(prefix, '');
    // 資料點清單檔的最外層是陣列；時刻表等其他格式的檔案略過
    if (!Array.isArray(content)) continue;
    content.forEach((item, i) => {
      if (!isObject(item)) return;
      const type = item.type;
      if (typeof type !== 'string' || !(POINT_TYPES as readonly string[]).includes(type)) return;
      const id = typeof item.id === 'string' ? item.id : `（沒有 id #${i}）`;
      out.push({
        key: `${file}#${i}`,
        id,
        type: type as PointType,
        label: labelOf(item.name, id),
        area: typeof item.area === 'string' ? item.area : null,
        coords: toCoords(item.coords),
        file,
        fixture,
        sources: Array.isArray(item.sources) ? item.sources.filter(isObject).map((s) => s as unknown as Point['sources'][number]) : [],
        raw: item,
      });
    });
  }
  return out;
}

function extractAreas(): Area[] {
  const content = dataModules['../../data/areas.json'];
  if (!Array.isArray(content)) return [];
  return content
    .filter(isObject)
    .filter((a) => typeof a.id === 'string' && Array.isArray(a.bbox) && a.bbox.length === 4)
    .map((a) => a as unknown as Area)
    .sort((a, b) => (a.tripOrder ?? 99) - (b.tripOrder ?? 99));
}

export const areas: Area[] = extractAreas();
export const realPoints: Point[] = extractPoints(dataModules, /^\.\.\/\.\.\/data\//, 'data/', false);
export const fixturePoints: Point[] = extractPoints(fixtureModules, /^\.\/dev-fixtures\//, 'web/src/dev-fixtures/', true);

export function inBbox([lon, lat]: LngLat, [w, s, e, n]: Bbox): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

export function unionBbox(boxes: Bbox[]): Bbox {
  if (boxes.length === 0) return REGION_BBOX;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/** 找出座標、ID、來源的問題（和 validate 的檢查類似，但在地圖上直接看得到是哪一點） */
export function findIssues(points: Point[]): Issue[] {
  const issues: Issue[] = [];
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const seen = new Map<string, Point>();
  for (const p of points) {
    if (!p.coords) {
      issues.push({ kind: 'bad-coords', pointKey: p.key, message: `沒有座標或格式錯誤：${JSON.stringify(p.raw.coords ?? null)}` });
    } else if (!inBbox(p.coords, REGION_BBOX)) {
      issues.push({ kind: 'outside-region', pointKey: p.key, message: '座標不在伊勢志摩範圍內（經緯度顛倒？）' });
    } else if (p.area) {
      const area = areaById.get(p.area);
      if (area && !inBbox(p.coords, area.bbox)) {
        issues.push({ kind: 'outside-area', pointKey: p.key, message: `座標不在所屬區域「${area.name.zh ?? area.name.ja}」的 bbox 內` });
      }
    }
    const dup = seen.get(p.id);
    if (dup) issues.push({ kind: 'duplicate-id', pointKey: p.key, message: `ID 重複（另一筆在 ${dup.file}）` });
    else seen.set(p.id, p);
    if (p.sources.length === 0) issues.push({ kind: 'no-sources', pointKey: p.key, message: '沒有 sources' });
  }
  return issues;
}
