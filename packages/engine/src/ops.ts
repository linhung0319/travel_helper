// 行程的操作：T15 的手動選單和 T16 的 AI 提議用同一組。
// 每個操作都不改傳進來的行程，回傳新的一份；不合法時丟出 ItineraryError（訊息給人看）。

import { DEFAULT_CONFIG } from './config.ts';
import { dateRange, isDate, isTime } from './time.ts';
import {
  ITINERARY_FORMAT,
  TRAVEL_MODES,
  type DateString,
  type DiningStyle,
  type FlightItem,
  type GroupItem,
  type Itinerary,
  type ItineraryItem,
  type LodgingMeals,
  type MealKind,
  type PartyProfile,
  type TimeString,
  type TravelSpec,
  type VisitItem,
} from './types.ts';

export class ItineraryError extends Error {
  override name = 'ItineraryError';
}

// 行程是純 JSON，用 JSON 複製（structuredClone 不在 engine 的 lib 裡）
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 一開始的行程：12 天、航班放好、其他是空的（CLAUDE.md 的航班） */
export function createItinerary(
  opts: { from?: DateString; to?: DateString; party?: PartyProfile; flights?: Omit<FlightItem, 'id' | 'type'>[] } = {},
): Itinerary {
  const from = opts.from ?? DEFAULT_CONFIG.trip.from;
  const to = opts.to ?? DEFAULT_CONFIG.trip.to;
  const flights = opts.flights ?? [
    { direction: 'arrive', airport: 'kansai-airport', depart: '08:20', arrive: '11:55', note: '去程第一批（桃園 → 關西）' },
    { direction: 'arrive', airport: 'kansai-airport', depart: '09:45', arrive: '13:20', note: '去程第二批（桃園 → 關西）' },
    { direction: 'depart', airport: 'kansai-airport', depart: '12:45', arrive: '15:00', note: '回程（關西 → 桃園）' },
    { direction: 'depart', airport: 'kansai-airport', depart: '12:55', arrive: '15:05', note: '回程（關西 → 桃園）' },
  ];
  const it: Itinerary = {
    format: ITINERARY_FORMAT,
    party: opts.party ?? { size: 15, elders: 5, kids: 4 },
    days: dateRange(from, to).map((date) => ({ date, lodging: null, lodgingMeals: null, start: null, note: null, items: [] })),
  };
  let n = 0;
  for (const f of flights) {
    const day = it.days[f.direction === 'arrive' ? 0 : it.days.length - 1];
    day.items.push({ id: `f-${++n}`, type: 'flight', flightNo: null, people: null, ...f });
  }
  it.seq = n;
  return it;
}

// --- 找項目 -----------------------------------------------------------------

export interface ItemLocation {
  dayIndex: number;
  /** 項目所在的陣列（一天的 items，或某一組的 items） */
  list: (ItineraryItem | GroupItem)[];
  index: number;
  item: ItineraryItem | GroupItem;
  /** 在分組裡時：split 的 ID、組的 ID */
  splitId: string | null;
  groupId: string | null;
}

export function allItemIds(it: Itinerary): string[] {
  const ids: string[] = [];
  for (const d of it.days) {
    for (const i of d.items) {
      ids.push(i.id);
      if (i.type === 'split') for (const g of i.groups) ids.push(...g.items.map((x) => x.id));
    }
  }
  return ids;
}

export function findItem(it: Itinerary, id: string): ItemLocation | null {
  for (let dayIndex = 0; dayIndex < it.days.length; dayIndex++) {
    const items = it.days[dayIndex].items;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.id === id) return { dayIndex, list: items, index, item, splitId: null, groupId: null };
      if (item.type === 'split') {
        for (const g of item.groups) {
          const gi = g.items.findIndex((x) => x.id === id);
          if (gi >= 0) return { dayIndex, list: g.items, index: gi, item: g.items[gi], splitId: item.id, groupId: g.id };
        }
      }
    }
  }
  return null;
}

function mustFind(it: Itinerary, id: string): ItemLocation {
  const loc = findItem(it, id);
  if (!loc) throw new ItineraryError(`找不到項目 ${id}`);
  return loc;
}

function dayIndexOf(it: Itinerary, date: DateString): number {
  const i = it.days.findIndex((d) => d.date === date);
  if (i < 0) throw new ItineraryError(`行程裡沒有 ${date} 這一天`);
  return i;
}

/** 新的項目 ID：i-<流水號>（不用亂數，結果固定；刪掉的號碼不再用） */
export function nextItemId(it: Itinerary, prefix = 'i'): string {
  let max = it.seq ?? 0;
  for (const id of allItemIds(it)) {
    const m = /^[a-z]+-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

function assertMovable(item: ItineraryItem | GroupItem): void {
  if (item.type === 'flight') throw new ItineraryError('航班是固定項目，不能刪除或移動');
}

// --- 操作 -------------------------------------------------------------------

export type NewItem =
  | (Omit<VisitItem, 'id' | 'selected'> & { selected?: number })
  | (Omit<Extract<ItineraryItem, { type: 'free' }>, 'id'>)
  | (Omit<Extract<ItineraryItem, { type: 'split' }>, 'id'>);

export interface AddOptions {
  /** 插在第幾個（預設最後；在航班出發之前） */
  index?: number;
  /** 加進某個分組：split 的 ID 和組的 ID */
  split?: { id: string; group: string };
}

/** 新增項目，回傳新的行程和新項目的 ID */
export function addItem(it: Itinerary, date: DateString, item: NewItem, opts: AddOptions = {}): { itinerary: Itinerary; itemId: string } {
  const next = clone(it);
  const day = next.days[dayIndexOf(next, date)];
  const id = nextItemId(next);
  next.seq = Number(id.split('-')[1]);
  const full = { ...clone(item), id } as ItineraryItem;
  if (full.type === 'visit') {
    full.selected = full.selected ?? 0;
    if (!full.options.length) throw new ItineraryError('visit 至少要有一個選項');
    if (full.selected < 0 || full.selected >= full.options.length) throw new ItineraryError('selected 超出選項範圍');
  }
  if (full.type === 'split') {
    if (opts.split) throw new ItineraryError('分組裡不能再分組');
    full.groups.forEach((g) => g.items.forEach((x, k) => (x.id = `${id}-${g.id}-${k + 1}`)));
  }
  let list: (ItineraryItem | GroupItem)[] = day.items;
  if (opts.split) {
    const sp = day.items.find((x) => x.id === opts.split?.id);
    const g = sp?.type === 'split' ? sp.groups.find((x) => x.id === opts.split?.group) : null;
    if (!g) throw new ItineraryError(`這天沒有分組 ${opts.split.id}／${opts.split.group}`);
    list = g.items;
  }
  // 預設插在最後，但在出發的航班之前
  const lastFlight = list.findIndex((x) => x.type === 'flight' && x.direction === 'depart');
  const at = opts.index ?? (lastFlight >= 0 ? lastFlight : list.length);
  if (at < 0 || at > list.length) throw new ItineraryError(`位置 ${at} 超出範圍`);
  list.splice(at, 0, full as GroupItem);
  return { itinerary: next, itemId: id };
}

export function removeItem(it: Itinerary, itemId: string): Itinerary {
  const next = clone(it);
  const loc = mustFind(next, itemId);
  assertMovable(loc.item);
  loc.list.splice(loc.index, 1);
  return next;
}

/** 移到別天（放在那天的最後、出發航班之前，或指定位置）；分組裡的項目會移出來 */
export function moveItemToDay(it: Itinerary, itemId: string, date: DateString, index?: number): Itinerary {
  const next = clone(it);
  const loc = mustFind(next, itemId);
  assertMovable(loc.item);
  const [item] = loc.list.splice(loc.index, 1);
  const day = next.days[dayIndexOf(next, date)];
  const lastFlight = day.items.findIndex((x) => x.type === 'flight' && x.direction === 'depart');
  const at = index ?? (lastFlight >= 0 ? lastFlight : day.items.length);
  if (at < 0 || at > day.items.length) throw new ItineraryError(`位置 ${at} 超出範圍`);
  day.items.splice(at, 0, item as ItineraryItem);
  return next;
}

/**
 * 拖曳用：移到某天（或某天某個分組）的第 index 個。index 是「先拿出來、再插進去」之後的位置。
 * 分組不能放進分組；不能放在抵達航班之前、出發航班之後。
 */
export function moveItemTo(it: Itinerary, itemId: string, date: DateString, index: number, split?: { id: string; group: string }): Itinerary {
  const next = clone(it);
  const loc = mustFind(next, itemId);
  assertMovable(loc.item);
  const [item] = loc.list.splice(loc.index, 1);
  insertChecked(next, item, date, index, split);
  return next;
}

/** moveItemTo 的插入：在 next（會被改）的 date（或某分組）第 index 個放進 item，並檢查航班邊界 */
function insertChecked(next: Itinerary, item: ItineraryItem | GroupItem, date: DateString, index: number, split?: { id: string; group: string }): void {
  const day = next.days[dayIndexOf(next, date)];
  let list: (ItineraryItem | GroupItem)[] = day.items;
  if (split) {
    if (item.type === 'split') throw new ItineraryError('分組裡不能再分組');
    const sp = day.items.find((x) => x.id === split.id);
    const g = sp?.type === 'split' ? sp.groups.find((x) => x.id === split.group) : null;
    if (!g) throw new ItineraryError(`這天沒有分組 ${split.id}／${split.group}`);
    list = g.items;
  }
  if (index < 0 || index > list.length) throw new ItineraryError(`位置 ${index} 超出範圍`);
  const lo = list.map((x) => x.type === 'flight' && x.direction === 'arrive').lastIndexOf(true) + 1;
  const firstDepart = list.findIndex((x) => x.type === 'flight' && x.direction === 'depart');
  if (index < lo || (firstDepart >= 0 && index > firstDepart)) throw new ItineraryError('不能移到航班的另一邊');
  list.splice(index, 0, item as GroupItem);
}

/** 上移／下移一格（同一天、同一組裡）；不能跨過航班 */
export function moveItem(it: Itinerary, itemId: string, direction: 'up' | 'down'): Itinerary {
  const next = clone(it);
  const loc = mustFind(next, itemId);
  assertMovable(loc.item);
  const to = loc.index + (direction === 'up' ? -1 : 1);
  if (to < 0 || to >= loc.list.length) throw new ItineraryError(direction === 'up' ? '已經是第一個' : '已經是最後一個');
  if (loc.list[to].type === 'flight') throw new ItineraryError('不能移到航班的另一邊');
  [loc.list[loc.index], loc.list[to]] = [loc.list[to], loc.list[loc.index]];
  return next;
}

/** 改停留時間（目前選的選項；null：用預設）；free 項目改 minutes */
export function setStay(it: Itinerary, itemId: string, minutes: number | null): Itinerary {
  if (minutes != null && !(Number.isFinite(minutes) && minutes >= 0)) throw new ItineraryError('停留時間要是 0 以上的分鐘數');
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type === 'visit') item.options[item.selected].stayMinutes = minutes;
  else if (item.type === 'free') {
    if (minutes == null) throw new ItineraryError('自由時間要填分鐘數');
    item.minutes = minutes;
  } else throw new ItineraryError('這種項目沒有停留時間');
  return next;
}

/** 切換時段備案 */
export function selectOption(it: Itinerary, itemId: string, index: number): Itinerary {
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit') throw new ItineraryError('只有 visit 有備案');
  if (!Number.isInteger(index) || index < 0 || index >= item.options.length) throw new ItineraryError('沒有這個備案');
  item.selected = index;
  return next;
}

/** 加一個備案（不切換） */
export function addOption(it: Itinerary, itemId: string, option: VisitItem['options'][number]): Itinerary {
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit') throw new ItineraryError('只有 visit 有備案');
  item.options.push(clone(option));
  return next;
}

/** 刪一個選項；不能刪到沒有。刪到主要的那個時改成第一個，刪到前面的照樣指著原本那個 */
export function removeOption(it: Itinerary, itemId: string, index: number): Itinerary {
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit') throw new ItineraryError('只有 visit 有備案');
  if (item.options.length <= 1) throw new ItineraryError('至少要留一個選項');
  if (index < 0 || index >= item.options.length) throw new ItineraryError('沒有這個備案');
  item.options.splice(index, 1);
  if (item.selected === index) item.selected = 0;
  else if (item.selected > index) item.selected -= 1;
  return next;
}

/** 兩張卡的主卡類型要一樣、都不能是住宿（typeOf 沒給就不檢查類型） */
function assertSameType(typeOf: ((placeId: string) => string | undefined) | undefined, placeA: string, placeB: string): void {
  if (!typeOf) return;
  const ta = typeOf(placeA);
  const tb = typeOf(placeB);
  if (ta === 'lodging' || tb === 'lodging') throw new ItineraryError('住宿不能合併');
  if (ta !== tb) throw new ItineraryError('只有同類型的點能合併');
}

/**
 * 合併：source（visit、只有一個選項）的選項加到 target 的最後，刪掉 source。
 * target 的 selected、start、meal、dining、travel 不變；回傳 source 原本的 start（被丟掉的時間，給畫面提示）。
 */
export function mergeItems(
  it: Itinerary,
  sourceId: string,
  targetId: string,
  typeOf?: (placeId: string) => string | undefined,
): { itinerary: Itinerary; droppedStart: TimeString | null } {
  if (sourceId === targetId) throw new ItineraryError('不能合併到自己');
  const next = clone(it);
  const src = mustFind(next, sourceId);
  const dst = mustFind(next, targetId);
  if (src.item.type !== 'visit' || dst.item.type !== 'visit') throw new ItineraryError('只有 visit 能合併');
  if (src.item.options.length > 1) throw new ItineraryError('有備卡的卡片不能合併，只能換順序');
  assertSameType(typeOf, src.item.options[0].place, dst.item.options[dst.item.selected].place);
  dst.item.options.push(src.item.options[0]);
  const droppedStart = src.item.start ?? null;
  src.list.splice(src.index, 1);
  return { itinerary: next, droppedStart };
}

function mustBeBackup(item: ItineraryItem | GroupItem, optionIndex: number): VisitItem {
  if (item.type !== 'visit') throw new ItineraryError('只有 visit 有備案');
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= item.options.length) throw new ItineraryError('沒有這個備案');
  if (optionIndex === item.selected) throw new ItineraryError('主卡要先把皇冠給別張');
  return item;
}

/** 拿掉 item 的第 optionIndex 個選項（selected 跟著調整），回傳那個選項 */
function takeOption(item: VisitItem, optionIndex: number): VisitItem['options'][number] {
  const [opt] = item.options.splice(optionIndex, 1);
  if (item.selected > optionIndex) item.selected -= 1;
  return opt;
}

/** 拆開：備卡拿出來變成獨立的一站，插在 date（或某分組）的第 index 個（先拿出來再插進去的位置，同 moveItemTo） */
export function detachOption(
  it: Itinerary,
  itemId: string,
  optionIndex: number,
  date: DateString,
  index: number,
  split?: { id: string; group: string },
): { itinerary: Itinerary; itemId: string } {
  const next = clone(it);
  const item = mustBeBackup(mustFind(next, itemId).item, optionIndex);
  const opt = takeOption(item, optionIndex);
  const id = nextItemId(next);
  next.seq = Number(id.split('-')[1]);
  insertChecked(next, { id, type: 'visit', options: [opt], selected: 0 }, date, index, split);
  return { itinerary: next, itemId: id };
}

/** 備卡搬到別張同類型卡的最後；不能搬主卡 */
export function moveOption(
  it: Itinerary,
  fromItemId: string,
  optionIndex: number,
  toItemId: string,
  typeOf?: (placeId: string) => string | undefined,
): Itinerary {
  if (fromItemId === toItemId) throw new ItineraryError('已經在這張卡裡了');
  const next = clone(it);
  const from = mustBeBackup(mustFind(next, fromItemId).item, optionIndex);
  const to = mustFind(next, toItemId).item;
  if (to.type !== 'visit') throw new ItineraryError('只有 visit 有備案');
  assertSameType(typeOf, from.options[optionIndex].place, to.options[to.selected].place);
  to.options.push(takeOption(from, optionIndex));
  return next;
}

/** 指定開始時間（null：到了就開始） */
export function setStart(it: Itinerary, itemId: string, start: TimeString | null): Itinerary {
  if (start != null && !isTime(start)) throw new ItineraryError(`時間要寫成 HH:MM：${start}`);
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit' && item.type !== 'free') throw new ItineraryError('這種項目不能指定開始時間');
  item.start = start;
  return next;
}

/** 指定從上一站怎麼來（null：引擎依規則選） */
export function setTravel(it: Itinerary, itemId: string, travel: TravelSpec | null): Itinerary {
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit' && item.type !== 'free') throw new ItineraryError('這種項目不能指定交通');
  item.travel = travel ? clone(travel) : null;
  return next;
}

/** 交通設定的對象：某個項目（從上一站到它），或某天回住宿那段 */
export type LegTarget = { itemId: string } | { lodging: DateString };

/** 欄位全空的交通設定視為沒設定 */
const isEmptySpec = (s: TravelSpec) => s.mode == null && s.minutes == null && s.trip == null && s.note == null;

/** 設定某一段交通（方式、分鐘、班次、備註可以只填一部分）；spec 是 null 或欄位全空：清掉。split 項目本身不能設 */
export function setLegTravel(it: Itinerary, to: LegTarget, spec: TravelSpec | null): Itinerary {
  const next = clone(it);
  const value = spec && !isEmptySpec(spec) ? clone(spec) : null;
  if ('lodging' in to) {
    next.days[dayIndexOf(next, to.lodging)].returnTravel = value;
    return next;
  }
  const { item } = mustFind(next, to.itemId);
  if (item.type === 'split') throw new ItineraryError('分組項目不能指定交通；請設定組裡的項目');
  item.travel = value;
  return next;
}

/** 讀某一段交通的設定；沒設定是 null */
export function getLegTravel(it: Itinerary, to: LegTarget): TravelSpec | null {
  if ('lodging' in to) return it.days[dayIndexOf(it, to.lodging)].returnTravel ?? null;
  const { item } = mustFind(it, to.itemId);
  return item.type === 'split' ? null : (item.travel ?? null);
}

/** 標這個地點是哪一餐（null：不標） */
export function setMeal(it: Itinerary, itemId: string, meal: MealKind | null): Itinerary {
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit') throw new ItineraryError('只有 visit 可以標用餐');
  item.meal = meal;
  return next;
}

/** 標吃法：全員一起或分開吃（null：不標） */
export function setDining(it: Itinerary, itemId: string, dining: DiningStyle | null): Itinerary {
  const next = clone(it);
  const { item } = mustFind(next, itemId);
  if (item.type !== 'visit') throw new ItineraryError('只有 visit 可以標吃法');
  item.dining = dining;
  return next;
}

/** 設定這晚的住宿與方案 */
export function setLodging(it: Itinerary, date: DateString, lodging: string | null, meals: LodgingMeals | null = null): Itinerary {
  const next = clone(it);
  const day = next.days[dayIndexOf(next, date)];
  day.lodging = lodging;
  day.lodgingMeals = meals;
  return next;
}

// --- 驗證 -------------------------------------------------------------------

/** 結構檢查（給 Worker 收到 PUT 時、匯入 JSON 時用）；回傳問題清單，空的就是沒問題 */
export function validateItinerary(it: unknown): string[] {
  const errs: string[] = [];
  const x = it as Itinerary;
  if (!x || typeof x !== 'object') return ['不是物件'];
  if (x.format !== ITINERARY_FORMAT) errs.push(`format 要是 ${ITINERARY_FORMAT}`);
  if (x.seq != null && !(Number.isInteger(x.seq) && x.seq >= 0)) errs.push('seq 要是 0 以上的整數');
  const p = x.party;
  if (!p || ![p.size, p.elders, p.kids].every((n) => Number.isInteger(n) && n >= 0)) errs.push('party 要有 size、elders、kids（0 以上的整數）');
  if (!Array.isArray(x.days)) return [...errs, 'days 要是陣列'];
  const ids = new Set<string>();
  const checkId = (id: unknown, where: string) => {
    if (typeof id !== 'string' || !id) errs.push(`${where}：缺 id`);
    else if (ids.has(id)) errs.push(`${where}：id ${id} 重複`);
    else ids.add(id);
  };
  const checkTravel = (t: TravelSpec | null | undefined, where: string) => {
    if (t == null) return;
    if (t.mode != null && !(TRAVEL_MODES as readonly string[]).includes(t.mode)) errs.push(`${where}：travel.mode 不認得`);
    if (t.minutes != null && !(Number.isFinite(t.minutes) && t.minutes >= 0)) errs.push(`${where}：travel.minutes 要是 0 以上`);
    // 舊資料的 bufferMinutes 忽略（緩衝拿掉了）
    if (t.trip != null) {
      if (typeof t.trip.id !== 'string' || !t.trip.id) errs.push(`${where}：travel.trip.id 要是非空字串`);
      if (!isTime(t.trip.depart)) errs.push(`${where}：travel.trip.depart 要是 HH:MM`);
      if (t.trip.arrive != null && !isTime(t.trip.arrive)) errs.push(`${where}：travel.trip.arrive 要是 HH:MM`);
      if (t.trip.rides != null && !(Array.isArray(t.trip.rides) && t.trip.rides.every((r) => typeof r === 'string'))) errs.push(`${where}：travel.trip.rides 要是 tripId 的陣列`);
      if (t.trip.via != null && (typeof t.trip.via !== 'string' || !t.trip.via)) errs.push(`${where}：travel.trip.via 要是車站 ID`);
    }
  };
  const checkItem = (i: ItineraryItem | GroupItem, where: string, inGroup: boolean) => {
    checkId(i?.id, where);
    switch (i?.type) {
      case 'visit':
        if (!Array.isArray(i.options) || !i.options.length) errs.push(`${where}：options 至少一個`);
        else if (!Number.isInteger(i.selected) || i.selected < 0 || i.selected >= i.options.length) errs.push(`${where}：selected 超出範圍`);
        else if (i.options.some((o) => typeof o.place !== 'string' || !o.place)) errs.push(`${where}：選項缺 place`);
        if (i.start != null && !isTime(i.start)) errs.push(`${where}：start 要是 HH:MM`);
        if (i.dining != null && i.dining !== 'together' && i.dining !== 'separate') errs.push(`${where}：dining 要是 together 或 separate`);
        checkTravel(i.travel, where);
        break;
      case 'free':
        if (!(Number.isFinite(i.minutes) && i.minutes >= 0)) errs.push(`${where}：minutes 要是 0 以上`);
        if (i.start != null && !isTime(i.start)) errs.push(`${where}：start 要是 HH:MM`);
        checkTravel(i.travel, where);
        break;
      default: {
        const it2 = i as ItineraryItem;
        if (inGroup) errs.push(`${where}：分組裡只能有 visit、free`);
        else if (it2?.type === 'flight') {
          if (!isTime(it2.depart) || !isTime(it2.arrive)) errs.push(`${where}：航班時間要是 HH:MM`);
          checkTravel(it2.travel, where);
        } else if (it2?.type === 'split') {
          if (!it2.meet || typeof it2.meet.place !== 'string' || !isTime(it2.meet.time)) errs.push(`${where}：meet 要有 place、time`);
          if (!Array.isArray(it2.groups) || it2.groups.length < 2) errs.push(`${where}：至少兩組`);
          else it2.groups.forEach((g, gi) => (g.items ?? []).forEach((gi2, k) => checkItem(gi2, `${where} 第 ${gi + 1} 組第 ${k + 1} 項`, true)));
        } else errs.push(`${where}：不認得的 type`);
      }
    }
  };
  let prev = '';
  x.days.forEach((d, di) => {
    const where = `第 ${di + 1} 天`;
    if (!isDate(d?.date)) errs.push(`${where}：date 要是 YYYY-MM-DD`);
    else if (d.date <= prev) errs.push(`${where}：日期要依序、不重複`);
    else prev = d.date;
    checkTravel(d?.returnTravel, where);
    if (!Array.isArray(d?.items)) errs.push(`${where}：items 要是陣列`);
    else d.items.forEach((i, k) => checkItem(i, `${where}第 ${k + 1} 項`, false));
  });
  return errs;
}
