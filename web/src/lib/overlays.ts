// 畫在地圖上的東西 → GeoJSON：地圖指令（T12）的標示、比較、路線、AI 的提議，和確定的行程（T15m）。MapView 拿去 setData。
// 也算地圖上每個點的編號（itineraryMarks：某一天、點開的那段交通、整趟三種規則，第五輪 §9.2）。

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Itinerary } from '@travel-helper/engine/types';
import type { DayPlan } from '@travel-helper/engine';
import type { HighlightStyle, MapRoute, Proposal } from '../store.ts';
import type { LonLat, Place } from '../data/types.ts';
import { stopsOn } from './itinerary.ts';
import { dayColor } from './visual.ts';
import { lineMidpoint } from './routing.ts';
import type { Leg } from '@travel-helper/engine';
import { shortDayLabel } from './trip.ts';
import { legKeyOf, mapMark, stopMarks } from './planView.ts';
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

/** 標示的點：每種樣式一組（AI 的 primary／warning／muted，和點開的交通上下車的站 leg） */
export function highlightFeatures(highlights: Partial<Record<HighlightStyle | 'leg', string[]>>, byId: Map<string, Place>): FeatureCollection<Point> {
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
  /** 圖示（MapView 用 modeIconHtml 畫）；transit 已換成第一程的方式 */
  mode: Leg['mode'];
  minutes: number | null;
  /** 不含圖示和 emoji 的字，例如「16 分」（e2e 讀這個） */
  text: string;
}

/** 標籤的字：自訂文字優先，否則「N 分」（無條件進位）；還在查時是「…」 */
function labelText(minutes: number | null, label: string | null = null, pending = false): string {
  if (label) return label;
  if (minutes != null) return `${Math.max(1, Math.ceil(minutes - 1e-9))} 分`;
  return pending ? '…' : '';
}

/** 路線中間的標籤（DOM 標記：交通圖示＋分鐘） */
export function routeLabels(routes: MapRoute[]): RouteLabel[] {
  return routes.map((r) => ({
    id: r.id,
    coords: lineMidpoint(r.geometry ?? [r.from.coords, r.to.coords]),
    mode: r.unknown ? 'unknown' : r.mode,
    minutes: r.minutes,
    text: labelText(r.minutes, r.label, r.source === 'pending'),
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
    else if (c.kind === 'return-travel') push(c.date, '回住宿的交通');
    else push(c.date, `改了${n(c.place)}`);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, parts]) => ({ date, text: `${shortDayLabel(date)}：${parts.join('、')}` }));
}

/**
 * 確定的行程（T15m，interaction-design §3）：
 * - 線：每天一種顏色，依時間軸的順序（出發的住宿 → 各點 → 會合點 → 住宿）連起來；選了某一天時只畫那天
 * - 備選：時段備案的非主選點，用那天顏色的空心圈
 * - 交通標籤：只有選定的那天，在每段的中間標交通圖示和「12 分」
 * - 整趟時點了某一天的路線（focusDay）：其他天的線 dim（變淡），同色的兩天才不會搞混（第五輪 §9.1）
 * 線有 pathOf 給的路徑（步行、車沿道路，搭車照班次的站、電車沿車站）就照路徑畫，沒有（還沒查到、船）就是兩點之間的直線。
 */
export function itineraryFeatures(
  it: Itinerary | null,
  plan: { days: DayPlan[] } | null,
  byId: Map<string, Place>,
  dates: string[],
  day: string,
  pathOf?: (from: Place, to: Place, mode: Leg['mode'], rides: Leg['rides']) => LonLat[] | null,
  focusDay: string | null = null,
): { lines: FeatureCollection<LineString>; alts: FeatureCollection<Point>; legs: RouteLabel[] } {
  const lines: Feature<LineString>[] = [];
  const alts: Feature<Point>[] = [];
  const legs: RouteLabel[] = [];
  for (const d of it?.days ?? []) {
    // 選了某一天就只畫那天
    if (day !== 'all' && day !== d.date) continue;
    const color = dayColor(dates, d.date);
    const active = 1;
    const dim = day === 'all' && focusDay != null && focusDay !== d.date;
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
      let prevPlace: Place | null = null;
      for (const o of path) {
        const p = byId.get(o.place);
        if (!p) continue;
        const moved = prev && (prev[0] !== p.coords[0] || prev[1] !== p.coords[1]);
        const seg = moved && prevPlace && pathOf && o.leg ? pathOf(prevPlace, p, o.leg.mode, o.leg.rides) : null;
        if (prev && moved && day === d.date && o.leg && o.leg.mode !== 'none' && o.leg.minutes > 0) {
          legs.push({
            id: `leg-${d.date}-${legs.length}`,
            coords: lineMidpoint(seg && seg.length >= 2 ? seg : [prev, p.coords]),
            // 大眾運輸的圖示用第一程的方式
            mode: o.leg.mode === 'transit' ? (o.leg.rides?.[0]?.mode ?? 'transit') : o.leg.mode,
            minutes: o.leg.minutes,
            text: labelText(o.leg.minutes),
          });
        }
        // 路徑的頭尾就是前後兩站，中間的點接進來
        if (seg && seg.length >= 2) coords.push(...seg.slice(1, -1));
        coords.push(p.coords);
        prev = p.coords;
        prevPlace = p;
      }
      if (coords.length >= 2) lines.push(line(coords, { date: d.date, color, active, selected, dim }));
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

type Entry = DayPlan['entries'][number];

/** 這段交通（legKeyOf）的兩端卡片：to 是那張卡，from 是時間軸上前一個有點的卡（分組裡第一個點從分組前的點出發）；找不到是 null */
function legEnds(day: DayPlan, legKey: string): { from: Entry; to: Entry } | null {
  const walk = (entries: DayPlan['entries'], before: Entry | null): { from: Entry; to: Entry } | null => {
    let prev = before;
    for (const e of entries) {
      for (const g of e.groups ?? []) {
        const hit = walk(g.entries, prev);
        if (hit) return hit;
      }
      if (e.placeId && prev && legKeyOf(e, day.date) === legKey) return { from: prev, to: e };
      if (e.placeId) prev = e;
    }
    return null;
  };
  return walk(day.entries, null);
}

/**
 * 地圖上每個點寫的號碼（第五輪 §9.2，規則在 planView.mapMark）：
 * - 某一天：照那天的 stopMarks（起終點同一點是 0）；legOpen 是這天的一段交通時，那段的兩端照 'leg'（例如回住宿那段，住宿是最後一號）
 * - 整趟（'all'）：每天的點都編；那天的終點（住宿）隔天也在 → 照隔天的號碼（隔天的 0）。
 *   同一個點排在好幾天時，focusDay（整趟點亮的那天）優先，其次是比較早的那天
 */
export function itineraryMarks(plan: { days: DayPlan[] } | null, day: string, legOpen: string | null, focusDay: string | null = null): Map<string, string> {
  const out = new Map<string, string>();
  const days = plan?.days ?? [];
  if (day !== 'all') {
    const dp = days.find((d) => d.date === day);
    if (!dp) return out;
    const ends = legOpen?.startsWith(`${day}:`) ? legEnds(dp, legOpen) : null;
    const { byEntry, byPlace } = stopMarks(dp);
    // 兩端寫這兩張卡自己的號碼（同一點去兩次時，不是單純取最小、最大）
    const leg = ends && { from: ends.from.placeId!, to: ends.to.placeId!, fromMark: byEntry.get(ends.from) ?? null, toMark: byEntry.get(ends.to) ?? null };
    for (const [id, list] of byPlace) out.set(id, leg ? mapMark(list, 'leg', leg, id) : mapMark(list, 'day'));
    return out;
  }
  const marks = days.map((d) => stopMarks(d).byPlace);
  const order = days.map((_, i) => i).sort((a, b) => Number(days[b].date === focusDay) - Number(days[a].date === focusDay));
  for (const i of order) {
    const last = days[i].entries.filter((e) => e.placeId).at(-1)?.placeId;
    for (const [id, list] of marks[i]) {
      if (out.has(id)) continue;
      const next = id === last ? marks[i + 1]?.get(id) : undefined;
      out.set(id, mapMark(next ?? list, 'trip'));
    }
  }
  return out;
}

/** 地圖上每個點的小標記：想去數（前面的愛心由 MapView 畫）（想去的人數，interaction-design §3、§9） */
export function placeBadges(byId: Map<string, Place>, likes: Map<string, number>): { id: string; coords: LonLat; text: string }[] {
  const out: { id: string; coords: LonLat; text: string }[] = [];
  for (const [id, n] of likes) {
    const p = byId.get(id);
    if (p && n > 0) out.push({ id, coords: p.coords, text: `${n}` });
  }
  return out;
}
