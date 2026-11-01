// 正式 build 的資料來源（T15）：資料點從 API（D1），其他從 build:static 的 /static/（architecture §3.7）。
// HTTP 快取交給瀏覽器：/api/places* 是 no-cache＋ETag（匯入編號），/static/ 是 must-revalidate＋ETag，沒變就 304。

import { api, staticJson } from '../backend/http.ts';
import { normalizeAreas, normalizePlaceList } from './normalize.ts';
import type { DataSource, EngineTimetables } from './source.ts';
import type { StationTimetable } from './types.ts';

interface TimetableIndex {
  kintetsu: { station: string; file: string }[];
  jr: { station: string; file: string }[];
}

let indexOnce: Promise<TimetableIndex> | null = null;
let engineOnce: Promise<EngineTimetables> | null = null;

/** 只記成功的：失敗了下次再試 */
function once<T>(get: () => Promise<T> | null, put: (p: Promise<T> | null) => void, load: () => Promise<T>): Promise<T> {
  const cur = get();
  if (cur) return cur;
  const p = load();
  put(p);
  p.catch(() => put(null));
  return p;
}

export const apiSource: DataSource = {
  async loadAreas() {
    return normalizeAreas(await staticJson('/static/areas.json'));
  },
  async loadPlaces() {
    const r = await api<{ places: unknown[]; retired: Record<string, string> }>('GET', '/api/places');
    return normalizePlaceList(r.places).map((p) => (r.retired[p.id] ? { ...p, retiredAt: r.retired[p.id] } : p));
  },
  async loadPlaceDetails() {
    return (await api<{ details: { id: string }[] }>('GET', '/api/places/details')).details;
  },
  async loadTimetable(stationId) {
    const index = await once(() => indexOnce, (p) => (indexOnce = p), () => staticJson<TimetableIndex>('/static/timetables/index.json'));
    const hit = [...index.kintetsu, ...index.jr].find((x) => x.station === stationId);
    if (!hit) return null;
    const doc = await staticJson<StationTimetable>(`/static/${hit.file}`);
    return doc && typeof doc === 'object' && 'directions' in doc ? doc : null;
  },
  loadEngineTimetables() {
    // 一個檔案，不是幾十個請求（build-static.mjs 的 timetables/engine.json）
    return once(() => engineOnce, (p) => (engineOnce = p), () => staticJson<EngineTimetables>('/static/timetables/engine.json'));
  },
  async loadTripInfo(topic) {
    return staticJson(topic === 'passes' ? '/static/passes.json' : '/static/access.json');
  },
};
