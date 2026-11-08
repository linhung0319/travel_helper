// 畫在地圖上的東西 → GeoJSON：地圖指令（T12）的標示、比較、路線、AI 的提議，和確定的行程（T15m）。MapView 拿去 setData。
// 也算地圖上每個點的編號（itineraryMarks：某一天、點開的那段交通、整趟三種規則，第五輪 §9.2）。

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Itinerary } from '@travel-helper/engine/types';
import type { DayPlan } from '@travel-helper/engine';
import type { HighlightStyle, MapRoute, Proposal } from '../store.ts';
import type { Area, LonLat, Place } from '../data/types.ts';
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

/** 點開的交通上下車的站 */
export function legStationFeatures(ids: string[], byId: Map<string, Place>): FeatureCollection<Point> {
  return collection(
    ids.flatMap((id) => {
      const p = byId.get(id);
      return p ? [point(p.coords, { id })] : [];
    }),
  );
}

/**
 * 地圖上 AI 指給你看的一個點：畫成水滴。head 是頭裡的字（A、B、C 或提議的順序），沒有就照平常（行程編號、類型的字）；tone 是 highlight 指令的樣式；
 * glyph：頭裡一律是類型的漢字（AI 套的篩選，T85 §37），不寫行程編號
 */
export interface AiDrop {
  id: string;
  head?: string;
  tone?: Exclude<HighlightStyle, 'primary'>;
  glyph?: boolean;
}

/**
 * 現在要畫成水滴的點，只有 AI 最新的一組（每次給完整內容，舊的不留；§16.4、§37）：
 * - AI 套的篩選（最後給的是它）：符合的點不論幾個都畫，頭裡是類型的漢字（T85）
 * - 提議（畫面上看得到差異、而且是最後給的）：新增的點，頭裡寫提議的順序
 * - 否則結果集：比較時頭裡寫 A、B、C；沒有結果集時才輪到篩選
 * - 另外加上 highlight 指令標的點
 */
export function aiDrops(input: {
  aiResult: { ids: string[]; lettered: boolean } | null;
  /** AI 套的篩選符合的點（使用者自己動了篩選就是 null） */
  aiFilter?: { ids: string[] } | null;
  highlights: Partial<Record<HighlightStyle, string[]>>;
  /** proposalFeatures 的點；提議沒顯示時是空的 */
  proposalPoints: FeatureCollection<Point>;
  latest: 'result' | 'proposal' | 'filter' | null;
}): AiDrop[] {
  const { aiResult, highlights, proposalPoints, latest } = input;
  const aiFilter = input.aiFilter ?? null;
  const out = new Map<string, AiDrop>();
  const added = proposalPoints.features.filter((f) => f.properties?.status === 'added');
  const hasProposal = proposalPoints.features.length > 0;
  const pick =
    latest === 'filter' && aiFilter
      ? 'filter'
      : hasProposal && (latest === 'proposal' || !aiResult)
        ? 'proposal'
        : aiResult
          ? 'result'
          : aiFilter
            ? 'filter'
            : null;
  if (pick === 'proposal') for (const f of added) out.set(String(f.properties!.id), { id: String(f.properties!.id), head: String(f.properties!.order) });
  else if (pick === 'result') aiResult!.ids.forEach((id, i) => out.set(id, { id, ...(aiResult!.lettered ? { head: String.fromCharCode(65 + i) } : {}) }));
  else if (pick === 'filter') for (const id of aiFilter!.ids) out.set(id, { id, glyph: true });
  for (const [style, ids] of Object.entries(highlights) as [HighlightStyle, string[]][]) {
    for (const id of ids ?? []) if (!out.has(id)) out.set(id, { id, ...(style === 'primary' ? {} : { tone: style }) });
  }
  return [...out.values()];
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
 * - 點：提議裡的順序編號；這天原本沒有的點是 added（MapView 畫成水滴），原本有、提議拿掉的是 removed（灰、×）
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

/** 區 ID → 名稱（中文優先）；找不到用 ID */
export const areaNameIn = (areas: Area[]) => (id: string) => {
  const a = areas.find((x) => x.id === id);
  return a ? a.name.zh || a.name.ja || id : id;
};

/** 提議的摘要，一天一行，例如「2/5：＋鳥羽水族館、－海の博物館、調整順序」（interaction-design §0）；areaName 給住哪一區（T45a）的區名 */
export function describeChanges(changes: Change[], nameOf: (id: string) => string, areaName: (id: string) => string = (id) => id): { date: string; text: string }[] {
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
    else if (c.kind === 'night-area') push(c.date, `住的區：${c.before ? areaName(c.before) : '（未定）'} → ${c.after ? areaName(c.after) : '（未定）'}`);
    else if (c.kind === 'day-area') push(c.date, c.after ? `去${areaName(c.after)}一日遊` : '不排一日遊');
    else if (c.kind === 'return-travel') push(c.date, '回住宿的交通');
    else if (c.before !== undefined) push(c.date, `${n(c.before)} → ${n(c.place)}`);
    else push(c.date, `改了${n(c.place)}`);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, parts]) => ({ date, text: `${shortDayLabel(date)}：${parts.join('、')}` }));
}

/**
 * 確定的行程（T15m，interaction-design §3）：
 * - 線：每天一種顏色，依時間軸的順序（出發的住宿 → 各點 → 住宿）連起來；選了某一天時只畫那天
 * - 備選：時段備案的非主選點，寫一個「備」字（那天的顏色）
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
  pathOf?: (from: Place, to: Place, mode: Leg['mode'], rides: Leg['rides'], taxi?: Pick<Leg, 'taxiBefore' | 'taxiAfter'> | null) => LonLat[] | null,
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
    // 有時間軸時照時間軸（含出發的住宿）；還沒算好時照行程的順序
    const path: Stop[] = dp ? dp.entries.filter((e) => e.placeId).map(toStop) : stopsOn(it, d.date).map((s) => ({ place: s.place, leg: null }));
    {
      const coords: LonLat[] = [];
      let prev: LonLat | null = null;
      let prevPlace: Place | null = null;
      for (const o of path) {
        const p = byId.get(o.place);
        if (!p) continue;
        const moved = prev && (prev[0] !== p.coords[0] || prev[1] !== p.coords[1]);
        const seg = moved && prevPlace && pathOf && o.leg ? pathOf(prevPlace, p, o.leg.mode, o.leg.rides, o.leg) : null;
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
    for (const v of d.items) {
      if (v.type !== 'visit') continue;
      v.options.forEach((o, i) => {
        const p = byId.get(o.place);
        if (p && i !== v.selected) alts.push(point(p.coords, { id: p.id, date: d.date, color, active }));
      });
    }
  }
  return { lines: collection(lines), alts: collection(alts), legs };
}

type Entry = DayPlan['entries'][number];

/** 這段交通（legKeyOf）的兩端卡片：to 是那張卡，from 是時間軸上前一個有點的卡；找不到是 null */
function legEnds(day: DayPlan, legKey: string): { from: Entry; to: Entry } | null {
  let prev: Entry | null = null;
  for (const e of day.entries) {
    if (e.placeId && prev && legKeyOf(e, day.date) === legKey) return { from: prev, to: e };
    if (e.placeId) prev = e;
  }
  return null;
}

/**
 * 地圖上每個點寫的號碼（第五輪 §9.2，規則在 planView.mapMark）：
 * - 某一天：照那天的 stopMarks（起終點同一點是「起」）；legOpen 是這天的一段交通時，那段的兩端照 'leg'（例如回住宿那段，住宿是最後一號）
 * - 整趟（'all'）：每天的點都編；那天的終點（住宿）隔天也在 → 照隔天的號碼（隔天的「起」）。
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

