// 整趟的直的骨架（T45b，interaction-design §19）：一天一列，左邊地區色帶、中間這天在哪一區和子地區、右邊那晚的住宿。
// 網頁右欄、手機、iPad 共用；這裡是純函式，畫面在 shared/ui/TripSkeleton.tsx。
// 一天在哪一區、連住第幾晚照 engine 的 nights（dayAreaOf、nightAreaOf、nightRunOf）。

import { dayAreaOf, dayAreaLabel, lodgingOn, nightAreaOf, nightRunOf, type AreaOfPlace } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Area, Place } from '../data/types.ts';
import { dayStops } from './itinerary.ts';

/** 色帶在連住的那一段裡的位置：一晚自己一段 one；兩晚以上 top、mid、bot */
export type RailPos = 'one' | 'top' | 'mid' | 'bot';

/** 住宿的預約狀態（照預約筆記，看這段連住的第一晚；沒寫過是待訂） */
export type StayBooking = 'pending' | 'booked' | 'skip';

export type SkeletonStay =
  /** 選了住宿 */
  | { kind: 'lodging'; id: string; name: string; booking: StayBooking }
  /** 只定了區（住宿欄是「未選住宿」） */
  | { kind: 'area'; area: string }
  /** 區也還沒決定（住宿欄是「—」） */
  | { kind: 'none' };

export interface SkeletonRow {
  date: string;
  /** 這晚的區；最後一天沒有晚上、或還沒決定是 null */
  nightArea: string | null;
  /** 左邊的色帶：area 是 null 就是虛線（還沒決定）；最後一天沒有晚上是 null */
  rail: { area: string | null; pos: RailPos } | null;
  /** 這天在哪一區：「鳥羽」「志摩 → 鳥羽」「鳥羽（去伊勢一日）」「鳥羽 → ？」；完全沒決定是 null */
  where: string | null;
  /** 子地區（照排了的點的順序，連續相同的併成一個）；還沒排是空的 */
  regions: string[];
  /** 那晚的住宿；最後一天是 null */
  stay: SkeletonStay | null;
}

export interface SkeletonInput {
  itinerary: Itinerary;
  areas: Area[];
  byId: Map<string, Place>;
  /** 住宿的預約狀態（placeId、這段連住的第一晚）；沒給或 undefined 是待訂 */
  booking?: (placeId: string, date: string) => StayBooking | undefined;
}

export const areaNameOf = (areas: Area[]) => (id: string) => {
  const a = areas.find((x) => x.id === id);
  return a ? a.name.zh || a.name.ja || id : id;
};

export const placeAreaOf = (byId: Map<string, Place>): AreaOfPlace => (id) => byId.get(id)?.area ?? null;

/** 一天排了的點的子地區名稱，照順序、連續相同的併成一個（機場、住宿不算） */
export function dayRegions(it: Itinerary, date: string, areas: Area[], byId: Map<string, Place>): string[] {
  const day = it.days.find((d) => d.date === date);
  if (!day) return [];
  const regionName = (p: Place) => {
    const r = areas.find((a) => a.id === p.area)?.regions?.find((x) => x.id === p.region);
    return r ? r.name.zh || r.name.ja || null : null;
  };
  const out: string[] = [];
  for (const s of dayStops(day)) {
    if (s.kind === 'flight' || s.kind === 'lodging') continue;
    const p = byId.get(s.place);
    const n = p && regionName(p);
    if (n && out.at(-1) !== n) out.push(n);
  }
  return out;
}

/** 這天在哪一區的寫法：engine 的 dayAreaLabel，加上只決定一邊的「鳥羽 → ？」「？ → 志摩」 */
export function whereLabel(it: Itinerary, date: string, areas: Area[], areaOf: AreaOfPlace): string | null {
  const info = dayAreaOf(it, date, areaOf);
  const name = areaNameOf(areas);
  const label = dayAreaLabel(info, name);
  if (label || !info) return label;
  if (info.dayTrip && info.area) return name(info.area);
  if (info.from && !info.to) return `${name(info.from)} → ？`;
  if (!info.from && info.to) return `？ → ${name(info.to)}`;
  return null;
}

export function skeletonRows({ itinerary: it, areas, byId, booking }: SkeletonInput): SkeletonRow[] {
  const areaOf = placeAreaOf(byId);
  const last = it.days.length - 1;
  const nightArea = it.days.map((d, i) => (i === last ? null : nightAreaOf(it, d.date, areaOf)));
  return it.days.map((d, i) => {
    const date = d.date;
    const isLast = i === last;
    let rail: SkeletonRow['rail'] = null;
    let stay: SkeletonStay | null = null;
    if (!isLast) {
      const a = nightArea[i];
      const same = (j: number) => j >= 0 && j < last && nightArea[j] === a;
      const up = same(i - 1);
      const down = same(i + 1);
      rail = { area: a, pos: up && down ? 'mid' : up ? 'bot' : down ? 'top' : 'one' };
      const lodging = lodgingOn(it, date);
      const p = lodging ? byId.get(lodging) : undefined;
      if (lodging) {
        const first = nightRunOf(it, date, 'lodging')?.first ?? date;
        stay = { kind: 'lodging', id: lodging, name: p ? p.name.zh || p.name.ja : lodging, booking: booking?.(lodging, first) ?? 'pending' };
      } else stay = a ? { kind: 'area', area: a } : { kind: 'none' };
    }
    return { date, nightArea: nightArea[i], rail, where: whereLabel(it, date, areas, areaOf), regions: dayRegions(it, date, areas, byId), stay };
  });
}

/** 每區住幾晚（地圖的「鳥羽 3 晚」）；照 areas 的順序，沒住的區不列 */
export function nightsPerArea(it: Itinerary, areas: Area[], byId: Map<string, Place>): { area: string; nights: number }[] {
  const areaOf = placeAreaOf(byId);
  const count = new Map<string, number>();
  for (const d of it.days.slice(0, -1)) {
    const a = nightAreaOf(it, d.date, areaOf);
    if (a) count.set(a, (count.get(a) ?? 0) + 1);
  }
  return areas.filter((a) => count.has(a.id)).map((a) => ({ area: a.id, nights: count.get(a.id)! }));
}

/** 2027-02-05 → 2/5 */
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/**
 * 概覽的「住 3 晚 · 2/2–2/5」（T52）：這區住幾晚（同 nightsPerArea），日期是入住那天到退房那天；
 * 中間斷開、住了兩段寫「住 3 晚 · 2/2–2/4、2/9–2/10」。沒住是 null。
 */
export function areaStayLine(it: Itinerary, area: string, byId: Map<string, Place>): string | null {
  const areaOf = placeAreaOf(byId);
  const days = it.days;
  const runs: [string, string][] = [];
  let nights = 0;
  for (let i = 0; i < days.length - 1; i++) {
    if (nightAreaOf(it, days[i].date, areaOf) !== area) continue;
    nights++;
    const last = runs.at(-1);
    if (last && last[1] === days[i].date) last[1] = days[i + 1].date;
    else runs.push([days[i].date, days[i + 1].date]);
  }
  if (!nights) return null;
  return `住 ${nights} 晚 · ${runs.map(([a, b]) => `${md(a)}–${md(b)}`).join('、')}`;
}

/** 決定了幾晚、一共幾晚（「11 晚 · 已決定 6 晚」） */
export function nightsDecided(it: Itinerary, byId: Map<string, Place>): { total: number; decided: number } {
  const areaOf = placeAreaOf(byId);
  const nights = it.days.slice(0, -1);
  return { total: nights.length, decided: nights.filter((d) => nightAreaOf(it, d.date, areaOf)).length };
}

/** 單天頂端的一行（「鳥羽・第 2 晚／3」）：這晚的區、連住第幾晚；最後一天或還沒決定是 null */
export function nightLine(it: Itinerary, date: string, areas: Area[], byId: Map<string, Place>): { area: string; areaName: string; index: number; total: number; lodging: string | null } | null {
  const areaOf = placeAreaOf(byId);
  const area = nightAreaOf(it, date, areaOf);
  const run = area ? nightRunOf(it, date, 'area', areaOf) : null;
  if (!area || !run) return null;
  return { area, areaName: areaNameOf(areas)(area), index: run.index, total: run.total, lodging: lodgingOn(it, date) };
}

/** 有晚上的日期（最後一天以外） */
export const hasNight = (it: Itinerary, date: string) => it.days.findIndex((d) => d.date === date) < it.days.length - 1 && it.days.some((d) => d.date === date);

/** 整趟最上面那行（T54）：「11 晚 · 區 8／11 · 住宿 6／11 · 已訂 3」；已訂是住宿已訂的晚數 */
export function skeletonCounts(rows: SkeletonRow[]): { total: number; areas: number; lodgings: number; booked: number } {
  const nights = rows.filter((r) => r.stay);
  return {
    total: nights.length,
    areas: nights.filter((r) => r.nightArea).length,
    lodgings: nights.filter((r) => r.stay?.kind === 'lodging').length,
    booked: nights.filter((r) => r.stay?.kind === 'lodging' && r.stay.booking === 'booked').length,
  };
}

/** 「只看還沒決定的」留哪些列：區或住宿還沒定的晚上（最後一天沒有晚上，不留） */
export const isUndecided = (r: SkeletonRow) => !!r.stay && r.stay.kind !== 'lodging';

/** 這晚所在的「連著好幾晚都沒決定區」那一段（T54 的「2/9–2/11 都套用」）；這晚有區、或只有這一晚是 null */
export function undecidedRun(rows: SkeletonRow[], date: string): string[] | null {
  const open = (r: SkeletonRow | undefined) => !!r?.stay && !r.nightArea;
  const i = rows.findIndex((r) => r.date === date);
  if (!open(rows[i])) return null;
  let a = i;
  let b = i;
  while (open(rows[a - 1])) a--;
  while (open(rows[b + 1])) b++;
  return b > a ? rows.slice(a, b + 1).map((r) => r.date) : null;
}

/** 從這晚起、同一區還沒選住宿的連續晚上（「問 AI 推薦」帶的日期）；這晚不是「未選住宿」是空的 */
export function openLodgingRun(rows: SkeletonRow[], date: string): string[] {
  const i = rows.findIndex((r) => r.date === date);
  const area = rows[i]?.stay?.kind === 'area' ? rows[i].nightArea : null;
  if (!area) return [];
  const out: string[] = [];
  for (let j = i; j < rows.length && rows[j].stay?.kind === 'area' && rows[j].nightArea === area; j++) out.push(rows[j].date);
  return out;
}

/** 住宿欄的字（比對提議前後、劃掉的舊值用）：住宿名稱、「未選住宿」；區還沒定、最後一天是 null */
export function stayText(stay: SkeletonStay | null): string | null {
  if (!stay || stay.kind === 'none') return null;
  return stay.kind === 'lodging' ? stay.name : '未選住宿';
}

/** 一列在提議前後哪一格變了：有變的格子給舊值（劃掉用，null 是原本空的） */
export interface SkeletonRowDiff {
  where?: { before: string | null };
  /** 住哪區 */
  area?: { before: string | null };
  /** 住宿 */
  stay?: { before: string | null };
}

/**
 * 整趟看提議（T48）：骨架用提議之後的行程畫，這裡比對提議之前的同一天，列出有變的格子。
 * 「這天在哪一區」比字；住哪區比這晚的區；住宿比住宿名稱（只定區變成選了住宿也算）
 */
export function skeletonDiff(after: SkeletonRow[], before: SkeletonRow[], areas: Area[]): Map<string, SkeletonRowDiff> {
  const name = areaNameOf(areas);
  const out = new Map<string, SkeletonRowDiff>();
  for (const r of after) {
    const b = before.find((x) => x.date === r.date);
    if (!b) continue;
    const d: SkeletonRowDiff = {};
    if (r.where !== b.where) d.where = { before: b.where };
    if (r.nightArea !== b.nightArea) d.area = { before: b.nightArea ? name(b.nightArea) : null };
    const sa = stayText(r.stay);
    const sb = stayText(b.stay);
    if (sa !== sb) d.stay = { before: sb };
    if (d.where || d.area || d.stay) out.set(r.date, d);
  }
  return out;
}

/** 地圖的晚數標籤看提議（T48）：照提議之後的行程算，晚數和原本不一樣的區（新住進去的也算）標 changed */
export function nightsPerAreaDiff(after: Itinerary, before: Itinerary, areas: Area[], byId: Map<string, Place>): { area: string; nights: number; changed: boolean }[] {
  const old = new Map(nightsPerArea(before, areas, byId).map((x) => [x.area, x.nights]));
  return nightsPerArea(after, areas, byId).map((x) => ({ ...x, changed: old.get(x.area) !== x.nights }));
}
