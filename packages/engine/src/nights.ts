// 每晚住哪一區（T45a）：讀 Itinerary.nights 的小函式。改用 ops.ts 的 setNightArea、setLodging、setDayArea。
// 一天在哪一區用推的：前一晚和這晚同區就是那區；不同區是移動日；dayArea 只用在住一區、白天去另一區。

import type { AreaId, DateString, Itinerary, LodgingMeals, Night } from './types.ts';

/** 地點 ID → 它的區（住宿的 area）；找不到回 null */
export type AreaOfPlace = (placeId: string) => AreaId | null | undefined;

/** 有晚上的日期：最後一天以外的每一天 */
export const nightDates = (it: Itinerary): DateString[] => it.days.slice(0, -1).map((d) => d.date);

export const nightOf = (it: Itinerary | null | undefined, date: DateString): Night | null => it?.nights?.[date] ?? null;

/** 這晚住的資料點 ID；沒選是 null */
export const lodgingOn = (it: Itinerary | null | undefined, date: DateString): string | null => it?.nights?.[date]?.lodging ?? null;

/** 這晚自己填的方案；沒填是 null（照住宿資料的 meals） */
export const lodgingMealsOn = (it: Itinerary | null | undefined, date: DateString): LodgingMeals | null => it?.nights?.[date]?.meals ?? null;

/** 住宿資料的 meals：'varies' 是有含晚餐和不含晚餐兩種方案 */
export type PlaceMeals = LodgingMeals | 'varies' | null | undefined;

/** 這晚的方案：自己填的 → 住宿資料的 meals；沒有住宿是 null */
export function nightMeals(it: Itinerary | null | undefined, date: DateString, mealsOf: (placeId: string) => PlaceMeals): LodgingMeals | 'varies' | null {
  const own = lodgingMealsOn(it, date);
  if (own) return own;
  const lodging = lodgingOn(it, date);
  return (lodging ? mealsOf(lodging) : null) ?? null;
}

/** 晚餐未選（T74a，§34.1 搬家）：住宿有兩種方案而這晚還沒選；整趟骨架住宿那格寫「晚餐未選」 */
export const mealsUnchosen = (it: Itinerary | null | undefined, date: DateString, mealsOf: (placeId: string) => PlaceMeals): boolean => nightMeals(it, date, mealsOf) === 'varies';

/** 這晚住哪一區：有寫 area 用它，沒寫但選了住宿就照住宿的區；都沒有是 null */
export function nightAreaOf(it: Itinerary | null | undefined, date: DateString, areaOf?: AreaOfPlace): AreaId | null {
  const n = nightOf(it, date);
  if (!n) return null;
  if (n.area) return n.area;
  return n.lodging && areaOf ? (areaOf(n.lodging) ?? null) : null;
}

/** 住某個點的晚上（入住日），依日期排序 */
export const nightsAt = (it: Itinerary, placeId: string): DateString[] =>
  nightDates(it).filter((d) => lodgingOn(it, d) === placeId);

export interface DayAreaInfo {
  /** 這天在哪一區；移動日、還沒決定是 null */
  area: AreaId | null;
  /** 前一晚的區（第一天沒有前一晚，用這晚的）；沒決定是 null */
  from: AreaId | null;
  /** 這晚的區（最後一天沒有這晚，用前一晚的）；沒決定是 null */
  to: AreaId | null;
  /** 移動日：前一晚和這晚住不同區 */
  move: boolean;
  /** 一日遊：這天寫了 dayArea */
  dayTrip: boolean;
}

/** 一天在哪一區（推的規則見檔頭）；行程裡沒有這天回 null */
export function dayAreaOf(it: Itinerary, date: DateString, areaOf?: AreaOfPlace): DayAreaInfo | null {
  const i = it.days.findIndex((d) => d.date === date);
  if (i < 0) return null;
  const isLast = i === it.days.length - 1;
  const tonight = isLast ? null : nightAreaOf(it, date, areaOf);
  const prev = i > 0 ? nightAreaOf(it, it.days[i - 1].date, areaOf) : null;
  const from = i > 0 ? prev : tonight;
  const to = isLast ? prev : tonight;
  const move = !!(from && to && from !== to);
  const dayArea = it.days[i].dayArea ?? null;
  if (dayArea) return { area: dayArea, from, to, move, dayTrip: true };
  return { area: from && to && from === to ? from : null, from, to, move, dayTrip: false };
}

/**
 * 一天在哪一區給人看的寫法：「鳥羽」、移動日「志摩 → 鳥羽」、一日遊「鳥羽（去伊勢一日）」；
 * 還沒決定回 null。areaName 給區的名稱（找不到用 ID）
 */
export function dayAreaLabel(info: DayAreaInfo | null, areaName: (id: AreaId) => string | null | undefined = (id) => id): string | null {
  if (!info) return null;
  const n = (id: AreaId) => areaName(id) ?? id;
  const base = info.move ? `${n(info.from!)} → ${n(info.to!)}` : info.from && info.from === info.to ? n(info.from) : null;
  if (info.dayTrip && info.area) return base && base !== n(info.area) ? `${base}（去${n(info.area)}一日）` : n(info.area);
  return base;
}

export interface NightRun {
  /** 連住的第幾晚（從 1 起算） */
  index: number;
  /** 這段連住幾晚 */
  total: number;
  /** 這段的第一晚、最後一晚（入住日） */
  first: DateString;
  last: DateString;
}

/**
 * 連住第幾晚：by 'lodging' 看同一間住宿、'area' 看同一區（areaOf 用在只選了住宿、沒寫區的晚上）。
 * 這晚沒選（住宿或區是 null）回 null
 */
export function nightRunOf(it: Itinerary, date: DateString, by: 'lodging' | 'area', areaOf?: AreaOfPlace): NightRun | null {
  const dates = nightDates(it);
  const i = dates.indexOf(date);
  if (i < 0) return null;
  const val = (d: DateString) => (by === 'lodging' ? lodgingOn(it, d) : nightAreaOf(it, d, areaOf));
  const v = val(date);
  if (v == null) return null;
  let first = i;
  while (first > 0 && val(dates[first - 1]) === v) first--;
  let last = i;
  while (last + 1 < dates.length && val(dates[last + 1]) === v) last++;
  return { index: i - first + 1, total: last - first + 1, first: dates[first], last: dates[last] };
}
