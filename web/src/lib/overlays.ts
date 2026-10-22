// 地圖指令（T12）畫在地圖上的東西 → GeoJSON：標示、比較、路線、AI 的提議。MapView 拿去 setData。

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Itinerary } from '@travel-helper/engine/types';
import type { HighlightStyle, MapRoute, Proposal } from '../store.ts';
import type { LonLat, Place } from '../data/types.ts';
import { stopsOn } from './itinerary.ts';
import { dayColor } from './visual.ts';
import { lineMidpoint, routeLabel } from './routing.ts';
import { shortDayLabel } from './trip.ts';
import type { Change } from '@travel-helper/engine';

const point = (coords: LonLat, properties: Record<string, unknown>): Feature<Point> => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coords },
  properties,
});
const line = (coords: LonLat[], properties: Record<string, unknown>): Feature<LineString> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords },
  properties,
});
const collection = <G extends Point | LineString>(features: Feature<G>[]): FeatureCollection<G> => ({ type: 'FeatureCollection', features });

export function highlightFeatures(highlights: Partial<Record<HighlightStyle, string[]>>, byId: Map<string, Place>): FeatureCollection<Point> {
  return collection(
    Object.entries(highlights).flatMap(([style, ids]) =>
      (ids ?? []).flatMap((id) => {
        const p = byId.get(id);
        return p ? [point(p.coords, { id, style })] : [];
      }),
    ),
  );
}

/** 比較的點：A、B、C… */
export function compareFeatures(ids: string[], byId: Map<string, Place>): FeatureCollection<Point> {
  return collection(
    ids.flatMap((id, i) => {
      const p = byId.get(id);
      return p ? [point(p.coords, { id, letter: String.fromCharCode(65 + i) })] : [];
    }),
  );
}

/** 步行用點線、船用長虛線，其他實線；直線（查不到路徑）比較淡 */
export function routeFeatures(routes: MapRoute[]): FeatureCollection<LineString> {
  return collection(
    routes.map((r) =>
      line(r.geometry ?? [r.from.coords, r.to.coords], {
        id: r.id,
        mode: r.mode,
        dash: r.mode === 'walk' ? 'dot' : r.mode === 'ferry' ? 'dash' : 'solid',
        estimate: r.source === 'pending' || r.source === 'straight' ? 1 : 0,
      }),
    ),
  );
}

export interface RouteLabel {
  id: string;
  coords: LonLat;
  text: string;
}

/** 路線中間的標籤（DOM 標記，才放得了 emoji） */
export function routeLabels(routes: MapRoute[]): RouteLabel[] {
  return routes.map((r) => ({
    id: r.id,
    coords: lineMidpoint(r.geometry ?? [r.from.coords, r.to.coords]),
    text: r.source === 'pending' && r.minutes == null ? `${routeLabel(r.mode, null, r.label)} …` : routeLabel(r.mode, r.minutes, r.label),
  }));
}

export type ProposalStatus = 'kept' | 'added' | 'removed';

/**
 * AI 提議的那幾天（interaction-design §0、§3）：
 * - 點：提議裡的順序編號；這天原本沒有的點是 added（亮框），原本有、提議拿掉的是 removed（灰、×）
 * - 線：依序用那天的顏色連起來（虛線）
 */
export function proposalFeatures(
  proposal: Proposal,
  current: Itinerary | null,
  byId: Map<string, Place>,
  dates: string[],
): { points: FeatureCollection<Point>; lines: FeatureCollection<LineString> } {
  const points: Feature<Point>[] = [];
  const lines: Feature<LineString>[] = [];
  for (const date of proposal.dates) {
    const color = dayColor(dates, date);
    const before = new Set(stopsOn(current, date).map((s) => s.place));
    const stops = stopsOn(proposal.itinerary, date);
    const after = new Set(stops.map((s) => s.place));
    const coords: LonLat[] = [];
    stops.forEach((s, i) => {
      const p = byId.get(s.place);
      if (!p) return;
      coords.push(p.coords);
      points.push(point(p.coords, { id: p.id, date, color, order: i + 1, status: before.has(s.place) ? 'kept' : 'added' }));
    });
    for (const id of before) {
      const p = byId.get(id);
      if (p && !after.has(id)) points.push(point(p.coords, { id, date, color, order: 0, status: 'removed' }));
    }
    if (coords.length >= 2) lines.push(line(coords, { date, color }));
  }
  return { points: collection(points), lines: collection(lines) };
}

/** 提議的摘要，一天一行，例如「2/5：＋鳥羽水族館、－海の博物館、調整順序」（interaction-design §0） */
export function describeChanges(changes: Change[], nameOf: (id: string) => string): { date: string; text: string }[] {
  const byDate = new Map<string, string[]>();
  const push = (date: string, s: string) => {
    const list = byDate.get(date) ?? [];
    if (!list.includes(s)) list.push(s);
    byDate.set(date, list);
  };
  const n = (id: string | null | undefined) => (id ? nameOf(id) : '（未定）');
  for (const c of changes) {
    if (c.kind === 'added') push(c.date, `＋${n(c.place)}`);
    else if (c.kind === 'removed') push(c.date, `－${n(c.place)}`);
    else if (c.kind === 'moved-day') {
      push(c.date, `＋${n(c.place)}（從 ${shortDayLabel(c.fromDate!)}）`);
      push(c.fromDate!, `－${n(c.place)}（移到 ${shortDayLabel(c.date)}）`);
    } else if (c.kind === 'reordered') push(c.date, '調整順序');
    else if (c.kind === 'lodging') push(c.date, `住宿：${n(c.before)} → ${n(c.after)}`);
    else push(c.date, `改了${n(c.place)}`);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, parts]) => ({ date, text: `${shortDayLabel(date)}：${parts.join('、')}` }));
}
