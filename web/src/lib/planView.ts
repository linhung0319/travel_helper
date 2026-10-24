// 「這一天」面板和地圖要的行程資訊（T15m）：交通的文字、行程裡找項目、匯出。
// 純函式：時間軸、交通時間、空檔、警告都是引擎（T14）算好的，這裡只整理成畫面要的樣子。

import type { DayPlan, EngineWarning, Itinerary, ItineraryItem, Leg, LegTarget, TimelineEntry, TravelMode, TravelSpec, TripRef, VisitItem } from '@travel-helper/engine';
import { toMinutes } from '@travel-helper/engine';
import { MODE_ICONS } from './routing.ts';
import { displayMinutes, estimateWalk } from './geo/walk.ts';
import type { Place } from '../data/types.ts';

/**
 * 交通卡的第一行（距離由元件接在後面），例如「🚶 8 分」「🚕 12 分・大型 2 台或 4 台」「🚃 34 分・等 11 分」。
 * 搭車的每一程另外一行一行列（rideLines）
 */
export function legText(leg: Leg): string {
  if (leg.mode === 'none') return '';
  if (leg.mode === 'unknown') return `❓ 交通未定 ${leg.minutes} 分`;
  const cars = leg.taxi ? `・${leg.taxi.jumboCars ? `大型 ${leg.taxi.jumboCars} 台或 ` : ''}${leg.taxi.cars} 台` : '';
  const wait = leg.waitMinutes ? `・等 ${leg.waitMinutes} 分` : '';
  return `${MODE_ICONS[leg.mode]} ${leg.minutes} 分${cars}${wait}`;
}

/** 交通卡的補充：走到車站、計程車費用、手動指定（等車寫在第一行） */
export function legDetail(leg: Leg): string[] {
  const out: string[] = [];
  if (leg.walkMinutes && leg.rides.length) out.push(`含步行 ${leg.walkMinutes} 分`);
  if (leg.taxi?.fareEstimateYen) out.push(`每台約 ${leg.taxi.fareEstimateYen.toLocaleString()} 円`);
  if (leg.specified) out.push('手動指定');
  return out;
}

/** 規劃模式的交通方式選單（auto：不寫 mode，由引擎挑） */
export const EDITOR_MODES = ['auto', 'walk', 'taxi', 'transit'] as const;
export type EditorMode = (typeof EDITOR_MODES)[number];

/** 前一班／後一班：只換 trip，方式照原樣（自動的段落還是自動，引擎用 trip 不需要 mode） */
export function specWithTrip(cur: TravelSpec | null | undefined, trip: TripRef): TravelSpec {
  return { ...cur, trip };
}

/** 這段的設定在選單上亮哪個：舊的電車、巴士、船算大眾運輸；包車、自駕、其他是 legacy（選單都不亮，卡片照原名） */
export function editorModeOf(spec: TravelSpec | null): EditorMode | 'legacy' {
  const m = spec?.mode;
  if (!m) return 'auto';
  if (m === 'walk' || m === 'taxi' || m === 'transit') return m;
  if (m === 'train' || m === 'bus' || m === 'ferry') return 'transit';
  return 'legacy';
}

/** 引擎算不出時間的依據（指定的方式在時刻表裡找不到班次、缺座標：照指定的方式回傳 0 分，警告要填 minutes） */
const UNCOMPUTED_BASIS = new Set(['找不到班次', '缺座標']);

/** 規劃模式要不要給「自己填分鐘」：算不出來（交通未定、指定的方式找不到班次、缺座標）或已經填過分鐘 */
export function showMinutesInput(leg: Pick<Leg, 'mode' | 'basis'>, spec: TravelSpec | null): boolean {
  return leg.mode === 'unknown' || UNCOMPUTED_BASIS.has(leg.basis) || spec?.minutes != null;
}

/** 距離的寫法：850 公尺、1.2 公里 */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
}

/** 交通卡上列出每一程，例如「10:12 近鐵 鳥羽 → 宇治山田 10:30」，兩程之間「轉乘 8 分」；nameOf 把站名裡的資料點 ID 換成名稱 */
export function rideLines(leg: Leg, nameOf: (id: string) => string): string[] {
  const out: string[] = [];
  leg.rides.forEach((r, i) => {
    const prev = leg.rides[i - 1];
    if (prev) out.push(`轉乘 ${toMinutes(r.depart) - toMinutes(prev.arrive)} 分`);
    out.push(`${r.depart} ${r.line} ${nameOf(r.from)} → ${nameOf(r.to)} ${r.arrive}`);
  });
  return out;
}

/** 這一列的交通是設定在哪裡（setLegTravel 的對象）；起點、會合沒有可設的交通 */
export function legTargetOf(entry: TimelineEntry, date: string): LegTarget | null {
  if (entry.kind === 'lodging') return { lodging: date };
  if ((entry.kind === 'visit' || entry.kind === 'free' || entry.kind === 'flight') && entry.itemId) return { itemId: entry.itemId };
  return null;
}

/** 在 Google Maps 開這段路線（起訖座標、交通方式） */
export function legMapsUrl(from: Place, to: Place, mode: TravelMode): string {
  const travelmode = mode === 'walk' ? 'walking' : mode === 'train' || mode === 'bus' || mode === 'ferry' || mode === 'transit' ? 'transit' : 'driving';
  const [flon, flat] = from.coords;
  const [tlon, tlat] = to.coords;
  return `https://www.google.com/maps/dir/?api=1&origin=${flat},${flon}&destination=${tlat},${tlon}&travelmode=${travelmode}`;
}

export interface ItemRef {
  item: ItineraryItem;
  date: string;
  /** 在分組裡時：split 的 ID、組名 */
  split: { id: string; group: string; groupName: string } | null;
}

/** 行程裡所有的項目（含分組裡的） */
export function allItems(it: Itinerary | null): ItemRef[] {
  const out: ItemRef[] = [];
  for (const d of it?.days ?? []) {
    for (const item of d.items) {
      out.push({ item, date: d.date, split: null });
      if (item.type === 'split') {
        for (const g of item.groups) for (const x of g.items) out.push({ item: x, date: d.date, split: { id: item.id, group: g.id, groupName: g.name } });
      }
    }
  }
  return out;
}

export function findItemRef(it: Itinerary | null, itemId: string): ItemRef | null {
  return allItems(it).find((r) => r.item.id === itemId) ?? null;
}

/** 這個點排在行程的哪些項目（主選或備案都算） */
export function itemsWithPlace(it: Itinerary | null, placeId: string): ItemRef[] {
  return allItems(it).filter((r) => r.item.type === 'visit' && r.item.options.some((o) => o.place === placeId));
}

/** visit 目前選的點 */
export const selectedPlace = (v: VisitItem) => v.options[v.selected]?.place ?? null;

/** 多點卡片「這個時段也可以去」的一列 */
export interface OptionRow {
  place: Place;
  /** 在 options 裡的位置（selectOption、removeOption 用） */
  index: number;
  main: boolean;
  /** 從主要那個走過來幾分（anchors 有就用，沒有用直線估算）；主要那個是 null */
  walkMinutesFromMain: number | null;
}

/** 從 a 走到 b 幾分：a、b 任一邊的 anchors 有就用，沒有用直線估算 */
function walkBetween(a: Place, b: Place): number {
  const m = a.anchors.find((x) => x.id === b.id)?.walkMinutes ?? b.anchors.find((x) => x.id === a.id)?.walkMinutes;
  return m ?? displayMinutes(estimateWalk(a.coords, b.coords).minutes);
}

/** 一張卡片裡的幾個點：主要的排第一，其他照原本的順序；找不到資料的點不列 */
export function optionRows(item: VisitItem, byId: Map<string, Place>): OptionRow[] {
  const main = byId.get(item.options[item.selected]?.place ?? '');
  const rows: OptionRow[] = [];
  item.options.forEach((o, index) => {
    const place = byId.get(o.place);
    if (!place) return;
    const isMain = index === item.selected;
    rows.push({ place, index, main: isMain, walkMinutesFromMain: isMain || !main ? null : walkBetween(main, place) });
  });
  return rows.sort((a, b) => Number(b.main) - Number(a.main));
}

/** 畫面上不另外列的警告：計程車的台數已經寫在交通那一行 */
const HIDDEN_WARNINGS = new Set(['taxi']);

/** 引擎的訊息裡露出欄位名的，換成給人看的話 */
const WARNING_TEXT: Record<string, string> = {
  'lodging-meals-unknown': '這間住宿有含晚餐和不含晚餐的方案，還沒選哪一種',
};

/** 引擎的警告，依項目分好；沒有項目的（整天的）放在 day */
export function warningsByItem(day: DayPlan | null): { byItem: Map<string, EngineWarning[]>; day: EngineWarning[] } {
  const byItem = new Map<string, EngineWarning[]>();
  const rest: EngineWarning[] = [];
  for (const raw of day?.warnings ?? []) {
    if (HIDDEN_WARNINGS.has(raw.code)) continue;
    const w = WARNING_TEXT[raw.code] ? { ...raw, message: WARNING_TEXT[raw.code] } : raw;
    if (w.itemId) byItem.set(w.itemId, [...(byItem.get(w.itemId) ?? []), w]);
    else rest.push(w);
  }
  return { byItem, day: rest };
}

/** 卡片上要顯示的警告：看主卡是這個項目全部的警告；看備卡時引擎沒有替備卡算，只留指名那張備卡的（placeId 相同） */
export function shownWarnings(list: EngineWarning[] | undefined, placeId: string | null, isMain: boolean): EngineWarning[] | undefined {
  if (isMain || !list) return list;
  const out = list.filter((w) => w.placeId != null && w.placeId === placeId);
  return out.length ? out : undefined;
}

export const WARNING_ICONS: Record<EngineWarning['level'], string> = { error: '⚠️', warning: '⚠️', info: 'ℹ️' };

/** 時間軸上的一列：項目（含交通）或空檔，依時間排好。分組的那列帶著「等會合」的空檔，畫在會合之前 */
export type TimelineRow = { kind: 'entry'; entry: TimelineEntry; gapsBeforeMeet?: DayPlan['gaps'] } | { kind: 'gap'; gap: DayPlan['gaps'][number] };

/** 把空檔插到時間軸裡（照引擎給的 afterItemId；沒有就放最前面） */
export function timelineRows(day: DayPlan): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const gapsAfter = new Map<string | null, DayPlan['gaps']>();
  for (const g of day.gaps) gapsAfter.set(g.afterItemId, [...(gapsAfter.get(g.afterItemId) ?? []), g]);
  const used = new Set<DayPlan['gaps'][number]>();
  const pushGaps = (key: string | null) => {
    for (const g of gapsAfter.get(key) ?? []) {
      if (used.has(g)) continue;
      used.add(g);
      rows.push({ kind: 'gap', gap: g });
    }
  };
  // 下一個是分組的空檔，其實是各組等會合的時間
  const splitIds = new Set(day.entries.filter((e) => e.groups).map((e) => e.itemId));
  const waits = day.gaps.filter((g) => g.beforeItemId && splitIds.has(g.beforeItemId));
  waits.forEach((g) => used.add(g));
  for (const e of day.entries) {
    // 住宿是最後一列：「住宿（未排）」這類空檔放在它前面
    if (e.kind === 'lodging') pushGaps(null);
    const before = e.groups ? waits.filter((g) => g.beforeItemId === e.itemId) : [];
    rows.push(before.length ? { kind: 'entry', entry: e, gapsBeforeMeet: before } : { kind: 'entry', entry: e });
    if (e.kind === 'start') continue;
    if (e.itemId) pushGaps(e.itemId);
  }
  pushGaps(null);
  return rows;
}

// --- 這一天的摘要、比例橫條、停留時間 ---------------------------------------

export interface BarSegment {
  kind: 'visit' | 'meal' | 'travel' | 'idle';
  from: string;
  to: string;
  itemId: string | null;
  /** 0 是全員；分組的時段，第 n 組是 n */
  lane: number;
}

/** 這天按時間比例的橫條：每段交通、等待、停留各一段（出發到回住宿） */
export function dayBar(day: DayPlan): BarSegment[] {
  const out: BarSegment[] = [];
  const walk = (entries: TimelineEntry[], lane: number) => {
    for (const e of entries) {
      if (e.kind === 'start') continue;
      if (e.travel && e.travel.minutes > 0) out.push({ kind: 'travel', from: e.travel.depart, to: e.arrive, itemId: e.itemId, lane });
      if (e.groups) {
        e.groups.forEach((g, i) => walk(g.entries.filter((x) => x.kind !== 'meet'), i + 1));
        continue;
      }
      if (e.start > e.arrive) out.push({ kind: 'idle', from: e.arrive, to: e.start, itemId: e.itemId, lane });
      if (e.end > e.start) out.push({ kind: e.meal ? 'meal' : 'visit', from: e.start, to: e.end, itemId: e.itemId, lane });
    }
  };
  walk(day.entries, 0);
  return out;
}

/** 標題的一行：幾點出發、幾點回住宿、交通總分鐘（含各組、等車；沒有緩衝）、幾個要注意的警告 */
export function daySummary(day: DayPlan): { start: string | null; back: string | null; travelMinutes: number; warnings: number } {
  const sum = (entries: TimelineEntry[]): number =>
    entries.reduce((n, e) => n + (e.travel ? e.travel.minutes : 0) + (e.groups ?? []).reduce((m, g) => m + sum(g.entries), 0), 0);
  return {
    start: day.entries.find((e) => e.kind === 'start')?.start ?? null,
    back: day.entries.find((e) => e.kind === 'lodging')?.arrive ?? null,
    travelMinutes: sum(day.entries),
    warnings: day.warnings.filter((w) => w.level !== 'info').length,
  };
}

/** 停留時間的標籤：45 分、1 小時、2.5 小時、1 小時 20 分 */
export function formatStay(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} 小時`;
  if (m === 30) return `${h}.5 小時`;
  return `${h} 小時 ${m} 分`;
}

// --- 順序編號 ---------------------------------------------------------------

/**
 * 地圖和時間軸共用的編號：出發、回到的住宿是「宿」，航班的機場是「機」，其他依時間軸的順序 1、2、3…
 * 分組的那天，先編各組的點（照組的順序），再編會合點。同一個點出現兩次時，地圖上寫「1・4」。
 */
export function stopMarks(day: DayPlan | null, isLodging: (placeId: string) => boolean): { byEntry: Map<TimelineEntry, string>; byPlace: Map<string, string> } {
  const byEntry = new Map<TimelineEntry, string>();
  const byPlace = new Map<string, string>();
  let n = 0;
  const mark = (e: TimelineEntry) => {
    if (!e.placeId) return;
    const label = e.kind === 'lodging' || (e.kind === 'start' && isLodging(e.placeId)) ? '宿' : e.kind === 'flight' ? '機' : e.kind === 'start' ? '起' : String(++n);
    byEntry.set(e, label);
    const prev = byPlace.get(e.placeId);
    byPlace.set(e.placeId, prev && prev !== label ? `${prev}・${label}` : label);
  };
  for (const e of day?.entries ?? []) {
    if (e.groups) for (const g of e.groups) for (const x of g.entries) if (x.kind !== 'meet') mark(x);
    mark(e);
  }
  return { byEntry, byPlace };
}

export const METHOD_LABELS: Record<string, string> = {
  phone: '電話',
  web: '網路',
  email: 'Email',
  line: 'LINE',
  instagram: 'IG',
  rakuten: '楽天',
  jalan: 'じゃらん',
};

/** 匯出的檔名，例如 itinerary-v12.json */
export const exportFileName = (version: number) => `itinerary-v${version}.json`;

/**
 * 資料卡上的時間：起點「09:30 出發」、終點「15:10 到住宿」只寫一個時間；
 * 其他「開始–結束」加停留分鐘（0 分只寫開始時間）；航班只寫一個時間（抵達／起飛，entry.start）。
 */
export function cardTime(entry: TimelineEntry): { text: string; stay: number | null } {
  if (entry.kind === 'start') return { text: `${entry.start} 出發`, stay: null };
  if (entry.kind === 'lodging') return { text: `${entry.arrive} 到住宿`, stay: null };
  const stay = toMinutes(entry.end) - toMinutes(entry.start);
  if (entry.kind === 'flight' || stay <= 0) return { text: entry.start, stay: null };
  return { text: `${entry.start}–${entry.end}`, stay };
}
