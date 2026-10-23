// 畫在地圖上的東西 → GeoJSON：地圖指令（T12）的標示、比較、路線、AI 的提議，和確定的行程（T15m）。MapView 拿去 setData。

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Itinerary } from '@travel-helper/engine/types';
import type { DayPlan } from '@travel-helper/engine';
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

/**
 * 確定的行程（T15m，interaction-design §3）：
 * - 線：每天一種顏色，依時間軸的順序（出發的住宿 → 各點 → 會合點 → 住宿）連起來；選了某一天時其他天變淡
 * - 備選：時段備案的非主選點，用那天顏色的空心圈
 * - 交通標籤：只有選定的那天，在每段的中間標「🚃 12 分」
 * 線是直線（不查路徑），T15 再看要不要沿道路畫。
 */
export function itineraryFeatures(
  it: Itinerary | null,
  plan: { days: DayPlan[] } | null,
  byId: Map<string, Place>,
  dates: string[],
  day: string,
): { lines: FeatureCollection<LineString>; alts: FeatureCollection<Point>; legs: RouteLabel[] } {
  const lines: Feature<LineString>[] = [];
  const alts: Feature<Point>[] = [];
  const legs: RouteLabel[] = [];
  for (const d of it?.days ?? []) {
    const color = dayColor(dates, d.date);
    const active = day === 'all' || day === d.date ? 1 : 0;
    // 只有選定的那天畫方向箭頭
    const selected = day === d.date ? 1 : 0;
    const dp = plan?.days.find((x) => x.date === d.date);
    type Stop = { place: string; leg: DayPlan['entries'][number]['travel'] };
    const toStop = (e: DayPlan['entries'][number]): Stop => ({ place: e.placeId!, leg: e.travel });
    // 有時間軸時照時間軸（含出發的住宿）；還沒算好時照行程的順序。
    // 分組的那天，線在分組前斷開：每組從上一站經過組裡的點到會合點各一條，會合後再接著走
    const paths: Stop[][] = [[]];
    if (dp) {
      for (const e of dp.entries) {
        if (!e.placeId) continue;
        if (e.groups) {
          const before = paths[paths.length - 1].at(-1);
          for (const g of e.groups) {
            const inGroup = g.entries.filter((x) => x.placeId && x.kind !== 'meet').map(toStop);
            paths.push([...(before ? [before] : []), ...inGroup, { place: e.placeId, leg: g.entries.find((x) => x.kind === 'meet')?.travel ?? e.travel }]);
          }
          paths.push([{ place: e.placeId, leg: null }]);
        } else paths[paths.length - 1].push(toStop(e));
      }
    } else paths[0] = stopsOn(it, d.date).map((s) => ({ place: s.place, leg: null }));
    for (const path of paths) {
      const coords: LonLat[] = [];
      let prev: LonLat | null = null;
      for (const o of path) {
        const p = byId.get(o.place);
        if (!p) continue;
        if (prev && (prev[0] !== p.coords[0] || prev[1] !== p.coords[1]) && day === d.date && o.leg && o.leg.mode !== 'none' && o.leg.minutes > 0) {
          legs.push({
            id: `leg-${d.date}-${legs.length}`,
            coords: lineMidpoint([prev, p.coords]),
            text: o.leg.mode === 'unknown' ? `❓ ${o.leg.minutes} 分` : routeLabel(o.leg.mode, o.leg.minutes),
          });
        }
        coords.push(p.coords);
        prev = p.coords;
      }
      if (coords.length >= 2) lines.push(line(coords, { date: d.date, color, active, selected }));
    }
    for (const item of d.items) {
      const visits = item.type === 'visit' ? [item] : item.type === 'split' ? item.groups.flatMap((g) => g.items.filter((x) => x.type === 'visit')) : [];
      for (const v of visits) {
        v.options.forEach((o, i) => {
          const p = byId.get(o.place);
          if (p && i !== v.selected) alts.push(point(p.coords, { id: p.id, date: d.date, color, active }));
        });
      }
    }
  }
  return { lines: collection(lines), alts: collection(alts), legs };
}

/** 地圖上每個點的小標記：💬 建議數、❤️ 數（interaction-design §3、§9） */
export function placeBadges(byId: Map<string, Place>, suggestions: Map<string, number>, likes: Map<string, number>): { id: string; coords: LonLat; text: string }[] {
  const ids = new Set([...suggestions.keys(), ...likes.keys()]);
  const out: { id: string; coords: LonLat; text: string }[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    const parts = [suggestions.get(id) ? `💬${suggestions.get(id)}` : '', likes.get(id) ? `❤️${likes.get(id)}` : ''].filter(Boolean);
    if (parts.length) out.push({ id, coords: p.coords, text: parts.join(' ') });
  }
  return out;
}
