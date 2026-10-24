// 「這一天」面板和地圖要的行程資訊（T15m）：交通的文字、行程裡找項目、需要預約的清單、匯出。
// 純函式：時間軸、交通時間、空檔、警告都是引擎（T14）算好的，這裡只整理成畫面要的樣子。

import type { DayPlan, EngineWarning, Itinerary, ItineraryItem, Leg, TimelineEntry, VisitItem } from '@travel-helper/engine';
import type { Place } from '../data/types.ts';
import { MODE_ICONS } from './routing.ts';

/** 引擎自動加的緩衝（集合、上下車），讓人知道時間怎麼來的 */
const bufferText = (leg: Leg) => (leg.bufferMinutes ? `＋緩衝 ${leg.bufferMinutes} 分` : '');

/** 一段交通的短文字，例如「🚶 8 分」「🚃 特急 10:02→10:15」「🚕 39 分・4 台」 */
export function legText(leg: Leg): string {
  if (leg.mode === 'none') return '';
  if (leg.mode === 'unknown') return `❓ 交通未定 ${leg.minutes} 分`;
  const icon = MODE_ICONS[leg.mode];
  if (leg.rides.length) {
    const r = leg.rides[0];
    const more = leg.rides.length > 1 ? `＋轉乘 ${leg.rides.length - 1} 次` : '';
    return `${icon} ${r.line} ${r.depart}→${leg.rides.at(-1)!.arrive}${more}${bufferText(leg)}`;
  }
  const cars = leg.taxi ? `・${leg.taxi.jumboCars ? `大型 ${leg.taxi.jumboCars} 台或 ` : ''}${leg.taxi.cars} 台` : '';
  return `${icon} ${leg.minutes} 分${bufferText(leg)}${cars}`;
}

/** 交通的補充：等車、走到車站、怎麼算的 */
export function legDetail(leg: Leg): string[] {
  const out: string[] = [];
  if (leg.walkMinutes && leg.rides.length) out.push(`含步行 ${leg.walkMinutes} 分`);
  if (leg.waitMinutes) out.push(`等 ${leg.waitMinutes} 分`);
  if (leg.taxi?.fareEstimateYen) out.push(`每台約 ${leg.taxi.fareEstimateYen.toLocaleString()} 円`);
  if (leg.specified) out.push('手動指定');
  return out;
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
  // 沒排的晚餐在回住宿之後才開始時，排在住宿那一列後面（時間不倒流）
  const lodging = day.entries.find((e) => e.kind === 'lodging');
  const afterLodging = day.gaps.filter((g) => g.kind === 'dinner' && lodging && g.from && g.from >= lodging.arrive);
  afterLodging.forEach((g) => used.add(g));
  for (const e of day.entries) {
    // 住宿是最後一列：「住宿（未排）」這類空檔放在它前面
    if (e.kind === 'lodging') pushGaps(null);
    const before = e.groups ? waits.filter((g) => g.beforeItemId === e.itemId) : [];
    rows.push(before.length ? { kind: 'entry', entry: e, gapsBeforeMeet: before } : { kind: 'entry', entry: e });
    if (e.kind === 'lodging') afterLodging.forEach((g) => rows.push({ kind: 'gap', gap: g }));
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
      if (e.travel && e.travel.minutes + e.travel.bufferMinutes > 0) out.push({ kind: 'travel', from: e.travel.depart, to: e.arrive, itemId: e.itemId, lane });
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

/** 標題的一行：幾點出發、幾點回住宿、交通多久（含緩衝、各組）、幾個要注意的警告 */
export function daySummary(day: DayPlan): { start: string | null; back: string | null; travelMinutes: number; warnings: number } {
  const sum = (entries: TimelineEntry[]): number =>
    entries.reduce((n, e) => n + (e.travel ? e.travel.minutes + e.travel.bufferMinutes : 0) + (e.groups ?? []).reduce((m, g) => m + sum(g.entries), 0), 0);
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

// --- 需要預約 ---------------------------------------------------------------

export interface ReservationRow {
  date: string;
  /** 行程項目；住宿是 null */
  itemId: string | null;
  placeId: string;
  /** 主選、備案、住宿 */
  role: 'main' | 'backup' | 'lodging';
  time: string | null;
  /** 幾個人（分組的那組人數，全員是行程的 party） */
  people: number;
  accepted: string | null;
  methods: string[];
  phone: string | null;
  url: string | null;
  note: string | null;
  leadDays: number | null;
}

const RESERVE_ACCEPTED = new Set(['yes', 'groups-only']);

function reservationOf(p: Place) {
  const r = (p.raw.reservation ?? null) as Record<string, unknown> | null;
  const str = (k: string) => (typeof r?.[k] === 'string' ? (r[k] as string) : null);
  return {
    accepted: str('accepted'),
    methods: Array.isArray(r?.methods) ? (r.methods as string[]) : [],
    phone: str('phone') ?? (typeof p.raw.phone === 'string' ? p.raw.phone : null),
    url: str('url') ?? p.links.official ?? null,
    note: str('note'),
    leadDays: typeof r?.leadDays === 'number' ? r.leadDays : null,
  };
}

/**
 * 「需要預約」的清單（PLAN T15m）：每晚的住宿，加上接受訂位的餐廳、體驗（主選和備案都列，備案標出來）。
 * 時間用引擎算出的開始時間，訂位時好對照。
 */
export function reservationRows(it: Itinerary | null, plan: { days: DayPlan[] } | null, byId: Map<string, Place>): ReservationRow[] {
  if (!it) return [];
  const out: ReservationRow[] = [];
  const startOf = new Map<string, string>();
  for (const d of plan?.days ?? []) {
    const walk = (es: TimelineEntry[]) => {
      for (const e of es) {
        if (e.itemId) startOf.set(e.itemId, e.start);
        for (const g of e.groups ?? []) walk(g.entries);
      }
    };
    walk(d.entries);
  }
  for (const ref of allItems(it)) {
    if (ref.item.type !== 'visit') continue;
    const v = ref.item;
    const people = ref.split ? groupSize(it, ref) : it.party.size;
    v.options.forEach((o, i) => {
      const p = byId.get(o.place);
      if (!p || p.type === 'lodging') return;
      const r = reservationOf(p);
      if (!r.accepted || !RESERVE_ACCEPTED.has(r.accepted)) return;
      out.push({ date: ref.date, itemId: v.id, placeId: p.id, role: i === v.selected ? 'main' : 'backup', time: v.start ?? startOf.get(v.id) ?? null, people, ...r });
    });
  }
  for (const d of it.days) {
    const p = d.lodging ? byId.get(d.lodging) : null;
    if (!p) continue;
    out.push({ date: d.date, itemId: null, placeId: p.id, role: 'lodging', time: null, people: it.party.size, ...reservationOf(p) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.role === 'lodging' ? 1 : 0) - (b.role === 'lodging' ? 1 : 0) || (a.time ?? '').localeCompare(b.time ?? ''));
}

function groupSize(it: Itinerary, ref: ItemRef): number {
  const day = it.days.find((d) => d.date === ref.date);
  const sp = day?.items.find((x) => x.id === ref.split?.id);
  return (sp?.type === 'split' && sp.groups.find((g) => g.id === ref.split?.group)?.size) || it.party.size;
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
