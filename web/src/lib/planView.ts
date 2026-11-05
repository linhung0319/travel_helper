// 「這一天」面板和地圖要的行程資訊（T15m）：交通的文字、等待說明、班次分類、編號、時間條段落、行程裡找項目、匯出。
// 純函式：時間軸、交通時間、空檔、警告都是引擎（T14）算好的，這裡只整理成畫面要的樣子。

import type { DayPlan, EngineWarning, Itinerary, ItineraryItem, Leg, LegTarget, MealKind, TimelineEntry, TravelMode, TravelSpec, VisitItem } from '@travel-helper/engine';
import { nightRunOf, toMinutes } from '@travel-helper/engine';
import { displayMinutes, estimateWalk } from './geo/walk.ts';
import type { Place, PlaceType } from '../data/types.ts';
import type { IconName } from './icons.ts';

/** 交通方式的中文名（交通卡標題、「自動（…）」）：電車、巴士、船都叫大眾運輸 */
export function legModeName(mode: Leg['mode']): string {
  switch (mode) {
    case 'walk':
      return '步行';
    case 'taxi':
      return '計程車';
    case 'train':
    case 'bus':
    case 'ferry':
    case 'transit':
      return '大眾運輸';
    case 'charter':
      return '包車';
    case 'car':
      return '自駕';
    case 'other':
      return '其他';
    case 'unknown':
      return '交通未定';
    default:
      return '不用移動';
  }
}

/** 交通卡標題第一行（第五輪 §3.1）：方式＋分鐘，例如「計程車 12 分」「大眾運輸 115 分」；none 是空字串 */
export function legTitle(leg: Leg): string {
  if (leg.mode === 'none') return '';
  return `${legModeName(leg.mode)}${leg.taxiBefore || leg.taxiAfter ? '＋計程車' : ''} ${leg.minutes} 分`;
}

/** 編輯時的交通方式選單（auto：不寫 mode，由引擎挑） */
export const EDITOR_MODES = ['auto', 'walk', 'taxi', 'transit'] as const;
export type EditorMode = (typeof EDITOR_MODES)[number];

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

/** 編輯時要不要給「自己填分鐘」：算不出來（交通未定、指定的方式找不到班次、缺座標）或已經填過分鐘 */
export function showMinutesInput(leg: Pick<Leg, 'mode' | 'basis'>, spec: TravelSpec | null): boolean {
  return leg.mode === 'unknown' || UNCOMPUTED_BASIS.has(leg.basis) || spec?.minutes != null;
}

/** 這一列的交通是設定在哪裡（setLegTravel 的對象）；起點沒有可設的交通 */
export function legTargetOf(entry: TimelineEntry, date: string): LegTarget | null {
  if (entry.kind === 'lodging') return { lodging: date };
  if ((entry.kind === 'visit' || entry.kind === 'free' || entry.kind === 'flight') && entry.itemId) return { itemId: entry.itemId };
  return null;
}

/** 交通卡的 key（uiStore.legOpen、班次表的 legKey）：日期:lodging 或 日期:種類:項目 ID（沒有用點 ID） */
export function legKeyOf(entry: TimelineEntry, date: string): string {
  return `${date}:${entry.kind === 'lodging' ? 'lodging' : `${entry.kind}:${entry.itemId ?? entry.placeId ?? ''}`}`;
}

/** 用 legKey 在這天的時間軸找那一段交通的資料卡；找不到或那張卡沒有交通回傳 null */
export function findLegEntry(day: DayPlan | null, legKey: string): TimelineEntry | null {
  if (!day) return null;
  return day.entries.find((e) => e.travel && legKeyOf(e, day.date) === legKey) ?? null;
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
}

/** 行程裡所有的項目 */
export function allItems(it: Itinerary | null): ItemRef[] {
  return (it?.days ?? []).flatMap((d) => d.items.map((item) => ({ item, date: d.date })));
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

/** 要處理的提醒（act，§34.1）：只有這種計數、變紅 */
export const isAct = (w: Pick<EngineWarning, 'level'>) => w.level === 'act';

/** 幾條要處理的 */
export const actCount = (list: readonly Pick<EngineWarning, 'level'>[] | undefined) => list?.filter(isAct).length ?? 0;

/**
 * 引擎的警告，依項目分好；沒有項目的（整天的）放在 day。
 * 交通的警告（leg: true）不放：交通卡自己用 legView 的 legWarnings 顯示（T29c spec §8.2）；當天摘要的數字另外算（daySummary）。
 */
export function warningsByItem(day: DayPlan | null): { byItem: Map<string, EngineWarning[]>; day: EngineWarning[] } {
  const byItem = new Map<string, EngineWarning[]>();
  const rest: EngineWarning[] = [];
  for (const w of day?.warnings ?? []) {
    if (w.leg) continue;
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

/** 提醒前面的線條圖示：要處理 ⚠，留意 ⓘ（T74b 改成「·」） */
export const WARNING_ICONS: Record<EngineWarning['level'], IconName> = { act: 'warn', note: 'info' };

/** 時間軸上的一列：項目（含交通）或空檔（「住宿（未排）」這類），依時間排好 */
export type TimelineRow = { kind: 'entry'; entry: TimelineEntry } | { kind: 'gap'; gap: DayPlan['gaps'][number] };

/**
 * 把空檔插到時間軸裡（照引擎給的 afterItemId；沒有就放最後）。
 * 「到了要等」的空檔（idle）不另外一列：交通卡下面的等待那條（waitNote）就是它（第五輪 §2）
 */
export function timelineRows(day: DayPlan): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const gapsAfter = new Map<string | null, DayPlan['gaps']>();
  for (const g of day.gaps) if (g.kind !== 'idle') gapsAfter.set(g.afterItemId, [...(gapsAfter.get(g.afterItemId) ?? []), g]);
  const used = new Set<DayPlan['gaps'][number]>();
  const pushGaps = (key: string | null) => {
    for (const g of gapsAfter.get(key) ?? []) {
      if (used.has(g)) continue;
      used.add(g);
      rows.push({ kind: 'gap', gap: g });
    }
  };
  for (const e of day.entries) {
    // 住宿是最後一列：「住宿（未排）」這類空檔放在它前面
    if (e.kind === 'lodging') pushGaps(null);
    rows.push({ kind: 'entry', entry: e });
    if (e.kind === 'start') continue;
    if (e.itemId) pushGaps(e.itemId);
  }
  pushGaps(null);
  return rows;
}

// --- 這一天的摘要、比例橫條、停留時間 ---------------------------------------

export interface BarSegment {
  /** 停留照類型（景點、餐廳、其他）；交通；等待（到了等開始、交通卡裡的等車） */
  kind: 'spot' | 'restaurant' | 'other' | 'travel' | 'wait';
  from: string;
  to: string;
  itemId: string | null;
  /** 停留段的卡片編號（stopMarks），給段落裡寫字用；交通、等待是 null */
  mark: string | null;
  /** 交通段、交通卡裡的等車段：那張交通卡的 key（legKeyOf）；其他是 null */
  legKey: string | null;
}

/** 這天按時間比例的橫條：每段交通、等待、停留各一段（出發到回住宿）；交通卡裡的等車（走到上車站到第一程發車）切成等待 */
export function dayBar(day: DayPlan, typeOf: (placeId: string | null) => PlaceType | null): BarSegment[] {
  const out: BarSegment[] = [];
  const { byEntry } = stopMarks(day);
  const push = (kind: BarSegment['kind'], from: string, to: string, e: TimelineEntry, mark: string | null = null, leg = false) => {
    if (to > from) out.push({ kind, from, to, itemId: e.itemId, mark, legKey: leg ? legKeyOf(e, day.date) : null });
  };
  for (const e of day.entries) {
    if (e.kind === 'start') continue;
    const t = e.travel;
    if (t && t.minutes > 0) {
      const ready = t.ready?.[0];
      const board = t.rides[0]?.depart;
      if (ready && board && board > ready) {
        push('travel', t.depart, ready, e, null, true);
        push('wait', ready, board, e, null, true);
        push('travel', board, e.arrive, e, null, true);
      } else push('travel', t.depart, e.arrive, e, null, true);
    }
    push('wait', e.arrive, e.start, e);
    const type = typeOf(e.placeId);
    push(type === 'spot' || type === 'restaurant' ? type : 'other', e.start, e.end, e, byEntry.get(e) ?? null);
  }
  return out;
}

/** 標題的一行：幾點出發、幾點回住宿、交通總分鐘（含等車；沒有緩衝）、這天要處理的提醒數（卡片、交通、整天的都算） */
export function daySummary(day: DayPlan): { start: string | null; back: string | null; travelMinutes: number; warnings: number } {
  return {
    start: day.entries.find((e) => e.kind === 'start')?.start ?? null,
    back: day.entries.find((e) => e.kind === 'lodging')?.arrive ?? null,
    travelMinutes: day.entries.reduce((n, e) => n + (e.travel ? e.travel.minutes : 0), 0),
    warnings: actCount(day.warnings),
  };
}

/** 時間條上的整點刻度：從 t0 到 t1（分鐘）每個整點一個，pct 是在條上的位置（0～100），label 是「10」這種小時數 */
export function hourTicks(t0: number, t1: number): { label: string; pct: number }[] {
  const span = Math.max(1, t1 - t0);
  const out: { label: string; pct: number }[] = [];
  for (let m = Math.ceil(t0 / 60) * 60; m <= t1; m += 60) out.push({ label: String(Math.floor(m / 60)), pct: ((m - t0) / span) * 100 });
  return out;
}

/** 時間條摘要的交通總時間：不到 60 分寫「39 分」，之後照停留的寫法「1小時05分」 */
export function formatTravelTotal(minutes: number): string {
  return minutes < 60 ? `${minutes} 分` : formatStay(minutes);
}

/** 時間條上的某一段是不是目前點的那張卡：交通段看交通卡的 key，其他看項目 ID */
export function isBarSelected(seg: BarSegment, selected: string | null | undefined): boolean {
  if (!selected) return false;
  return seg.legKey ? seg.legKey === selected : seg.itemId === selected;
}

/** 目前點的卡片：開著的交通卡優先，不然是詳情面板開著的那個點在這天的第一張卡（回項目 ID，沒有就 null） */
export function selectedBarKey(day: DayPlan | null, legOpen: string | null, detailId: string | null): string | null {
  if (legOpen && legOpen.startsWith(`${day?.date}:`)) return legOpen;
  if (!day || !detailId) return null;
  return day.entries.find((e) => e.placeId === detailId && e.itemId && e.kind !== 'start')?.itemId ?? null;
}

/** 停留時間的標籤，分鐘補零：0小時45分、1小時00分、5小時15分（資料卡停留、時間條摘要的交通總時間） */
export function formatStay(minutes: number): string {
  return `${Math.floor(minutes / 60)}小時${String(minutes % 60).padStart(2, '0')}分`;
}

// --- 順序編號 ---------------------------------------------------------------

/**
 * 地圖和時間軸共用的編號（第五輪 §2；T39 👤 改成字）：起點是「起」（住宿、航班抵達的機場或其他），中間依時間軸的順序 1、2、3…，
 * 終點（回到的住宿、出發的航班）是「終」。
 * 這天沒有起點（前一晚還沒排住宿）時，第一個行程是 1，時間軸另外放一張「還沒有起點」（DayStartMissing）。
 * byPlace 是同一個點的所有號碼（依時間順序），地圖上顯示哪個交給 mapMark。isLodging 不再用到（起點不分住宿），留著相容舊的呼叫
 */
/** 這天還沒有起點：有排行程，第一個不是起點也不是航班（前一晚還沒排住宿）；只有今晚住宿的空白天不算 */
export const needsStart = (plan: DayPlan | null | undefined): boolean => {
  const first = plan?.entries[0];
  return !!first && first.kind !== 'start' && first.kind !== 'flight' && first.kind !== 'lodging';
};

export const START_MARK = '起';
export const END_MARK = '終';

export function stopMarks(day: DayPlan | null, _isLodging?: (placeId: string) => boolean): { byEntry: Map<TimelineEntry, string>; byPlace: Map<string, string[]> } {
  const byEntry = new Map<TimelineEntry, string>();
  const byPlace = new Map<string, string[]>();
  let n = 1;
  const entries = day?.entries ?? [];
  const first = entries[0];
  const last = entries.at(-1);
  const labelOf = (e: TimelineEntry) => {
    if (e === first && (e.kind === 'start' || e.kind === 'flight')) return START_MARK;
    if (e.kind === 'lodging') return END_MARK;
    // 最後一天：起飛的航班是終點（到達那天只有航班時不算）
    if (e === last && e.kind === 'flight' && entries.some((x) => x.kind !== 'flight')) return END_MARK;
    return String(n++);
  };
  const mark = (e: TimelineEntry) => {
    if (!e.placeId) return;
    const label = labelOf(e);
    byEntry.set(e, label);
    byPlace.set(e.placeId, [...(byPlace.get(e.placeId) ?? []), label]);
  };
  for (const e of entries) mark(e);
  return { byEntry, byPlace };
}

/**
 * 地圖標記上寫的號碼（第五輪 §9.2）。marks 是這個點的所有號碼（stopMarks 的 byPlace）：
 * day：起終點同一點（有「起」）→ 起，其他多個號碼用「・」連起來；
 * leg：這段的兩端寫這段兩張卡的號碼（leg.fromMark／toMark；同一點一天去兩次時才不會寫錯），
 *   沒給號碼時退回終點 → 這個點最後的號碼、起點 → 最前面的號碼；不在這段上的照 day；
 * trip：住宿是隔天的起點，呼叫的人傳隔天的 marks，規則同 day（有「起」就是起）
 */
export function mapMark(
  marks: string[],
  scope: 'day' | 'leg' | 'trip',
  leg?: { from: string; to: string; fromMark?: string | null; toMark?: string | null } | null,
  placeId?: string,
): string {
  if (scope === 'leg' && leg && placeId && marks.length) {
    if (placeId === leg.to) return leg.toMark ?? marks.at(-1)!;
    if (placeId === leg.from) return leg.fromMark ?? marks[0];
  }
  return marks.includes(START_MARK) ? START_MARK : marks.join('・');
}

const TYPE_LETTERS: Record<PlaceType | 'airport', string> = { lodging: '宿', spot: '景', restaurant: '食', station: '駅', airport: '機' };

/** 資料卡左邊類型色塊上的字：宿、景、食、駅、機；使用者加的點和其他是「點」 */
export function cardTypeLetter(type: PlaceType | 'airport' | null): string {
  return (type && TYPE_LETTERS[type]) ?? '點';
}

// --- 交通卡的等待、班次 -------------------------------------------

const MEAL_LABELS: Partial<Record<MealKind, string>> = { lunch: '午餐 ', dinner: '晚餐 ' };

/**
 * 交通卡下面「到了要等」的那條（第五輪 §2）：有指定開始時間寫「午餐 12:00 才開始」（標了用餐才寫，那一餐是引擎的 entry.meal）；
 * 沒有指定開始時間的造訪是等開門（引擎只會因為營業時間延後，開始時間就是開門時間）；不是造訪（自由時間的指定時間）不寫原因。不用等回傳 null
 */
export function waitNote(entry: TimelineEntry, item: VisitItem | null, _place: Place | undefined): string | null {
  if (entry.waitMinutes <= 0) return null;
  const head = `${entry.arrive} 到，等 ${entry.waitMinutes} 分`;
  // 那一餐照引擎用的（entry.meal，設計 §2.1）；使用者沒標用餐（mealTags 空）就不寫
  const meal = entry.mealTags?.length && entry.meal ? (MEAL_LABELS[entry.meal] ?? '') : '';
  if (item?.start) return `${head}（${meal}${item.start} 才開始）`;
  if (item) return `${head}（${entry.start} 才開門）`;
  return head;
}

/** 第 i 程「走到上車站／轉乘完」的時間（Leg.ready）；舊的計算結果沒有 ready 時第一程用出發時間、之後用前一程到站 */
export function rideReadyAt(leg: Pick<Leg, 'ready' | 'depart' | 'rides'>, i: number): string {
  return leg.ready?.[i] ?? (i === 0 ? leg.depart : (leg.rides[i - 1]?.arrive ?? leg.depart));
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
/** 這晚是連住的第幾晚（同一間連在一起算，從 nights 算）；這晚沒住宿是 null */
export function stayNight(it: Itinerary | null | undefined, date: string): { n: number; total: number } | null {
  const run = it ? nightRunOf(it, date, 'lodging') : null;
  return run ? { n: run.index, total: run.total } : null;
}

export function cardTime(entry: TimelineEntry): { text: string; stay: number | null } {
  if (entry.kind === 'start') return { text: `${entry.start} 出發`, stay: null };
  if (entry.kind === 'lodging') return { text: `${entry.arrive} 到住宿`, stay: null };
  const stay = toMinutes(entry.end) - toMinutes(entry.start);
  if (entry.kind === 'flight' || stay <= 0) return { text: entry.start, stay: null };
  return { text: `${entry.start}–${entry.end}`, stay };
}
