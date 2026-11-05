// 行程摘要（T34）：只有「結果」，幾點到幾點做什麼、住哪、要預約的有哪些；不放交通、警告。
// 瀏覽器算完時間軸後整理成 TripSummary 存進 D1（Worker 算不出時間，architecture §6）；
// LINE 機器人讀出來排成文字回覆（T35 的下載檔不用這份，直接從時間軸整理，見 web/src/lib/tripExport.ts）。純函式，沒有 I/O。
// T73：回覆改成適合聊天氣泡（約 15～16 個中文字寬）：名稱拿掉括號說明、單天只寫開始時間、整趟一天三行、預約照狀態分段。

import { dayAreaLabel, dayAreaOf, lodgingOn, nightAreaOf, type AreaOfPlace } from './nights.ts';
import { dateRange, dayOfWeek, toMinutes } from './time.ts';
import type { AreaId, DateString, ItineraryPlan, Itinerary, TimeString, TimelineEntry } from './types.ts';

/** 時間軸的一行 */
export interface SummaryLine {
  start: TimeString;
  /** 只有一個時間點的（抵達、起飛）是 null */
  end: TimeString | null;
  text: string;
  /** 行程項目的種類（T73）；T73 之前存的摘要沒有這欄：抵達、起飛看 text 開頭 */
  kind?: 'visit' | 'free' | 'flight';
  /** 合併卡的備選（名稱；T73）；沒有備選、T73 之前存的摘要沒有這欄 */
  alternatives?: string[];
}

/** 要預約的一列（主選和住宿）；狀態不存在這裡，回覆時再讀最新的預約筆記 */
export interface SummaryReservation {
  /** 預約筆記的 key：餐廳、體驗是排的那天；住宿是入住那晚 */
  date: DateString;
  placeId: string;
  name: string;
  time: TimeString | null;
  /** 住宿：退房日；其他是 null */
  endDate: DateString | null;
}

export interface SummaryDay {
  date: DateString;
  lines: SummaryLine[];
  /** 這晚住哪（名稱）；沒排是 null */
  lodging: string | null;
  /** 這天在哪一區（「鳥羽」「志摩 → 鳥羽」「鳥羽（去伊勢一日）」）；沒決定是 null。T45a 之前存的摘要沒有這欄 */
  area?: string | null;
  /** 這晚住哪一區（名稱）；沒決定、最後一天是 null。T45a 之前存的摘要沒有這欄 */
  stayArea?: string | null;
}

export interface TripSummary {
  days: SummaryDay[];
  reservations: SummaryReservation[];
}

export interface SummaryInput {
  itinerary: Itinerary;
  plan: ItineraryPlan;
  /** 地點的名稱（中文優先）；找不到回 null */
  nameOf: (placeId: string) => string | null;
  /** 要預約的列：web 的 noteRows 只留主選和住宿 */
  reservations?: SummaryReservation[];
  /** 區的名稱（T45a）；沒給時用區 ID */
  areaName?: (id: AreaId) => string | null;
  /** 地點的區（只選了住宿、沒寫區的晚上用） */
  areaOf?: AreaOfPlace;
}

/** 引擎的時間軸 → 摘要。同一時段有備選時只列主選（引擎本來就只算主選），備選的名稱另外存 */
export function buildTripSummary({ itinerary, plan, nameOf, reservations = [], areaName, areaOf }: SummaryInput): TripSummary {
  const aName = (id: AreaId) => areaName?.(id) ?? id;
  const items = new Map<string, Itinerary['days'][number]['items'][number]>();
  for (const d of itinerary.days) for (const it of d.items) items.set(it.id, it);
  const name = (id: string | null) => (id ? (nameOf(id) ?? id) : null);

  const lineOf = (e: TimelineEntry): SummaryLine | null => {
    switch (e.kind) {
      case 'visit': {
        const it = e.itemId ? items.get(e.itemId) : undefined;
        const alternatives = it?.type === 'visit' ? it.options.filter((_, i) => i !== it.selected).map((o) => name(o.place) ?? o.place) : [];
        return { start: e.start, end: e.end, text: name(e.placeId) ?? '（地點）', kind: 'visit', ...(alternatives.length ? { alternatives } : {}) };
      }
      case 'free': {
        const where = name(e.placeId);
        return { start: e.start, end: e.end, text: where ? `自由時間：${where}` : '自由時間', kind: 'free' };
      }
      case 'flight': {
        const f = e.itemId ? items.get(e.itemId) : undefined;
        const no = f?.type === 'flight' && f.flightNo ? `（${f.flightNo}）` : '';
        const arrive = f?.type === 'flight' && f.direction === 'arrive';
        return { start: e.start, end: null, text: `${arrive ? '抵達' : '起飛'} ${name(e.placeId) ?? '機場'}${no}`, kind: 'flight' };
      }
      default:
        return null; // 出發、回住宿不列（最後一行寫住哪）
    }
  };

  const days: SummaryDay[] = itinerary.days.map((d) => {
    const dp = plan.days.find((x) => x.date === d.date);
    const lines: SummaryLine[] = [];
    for (const e of dp?.entries ?? []) pushLine(lines, lineOf(e));
    const stay = nightAreaOf(itinerary, d.date, areaOf);
    return {
      date: d.date,
      lines,
      lodging: name(lodgingOn(itinerary, d.date)),
      area: dayAreaLabel(dayAreaOf(itinerary, d.date, areaOf), aName),
      stayArea: stay ? aName(stay) : null,
    };
  });
  return { days, reservations };
}

function pushLine(out: SummaryLine[], l: SummaryLine | null) {
  if (l) out.push(l);
}

// --- 排成文字 ---------------------------------------------------------------

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

/** 2027-02-05 → 2/5（五） */
export function dayHeading(date: DateString): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}（${WEEKDAY[dayOfWeek(date)]}）`;
}

/** 2027-02-05 → 2/5 */
export const shortDate = (date: DateString) => {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
};

/** 名稱拿掉全形括號的說明：「La Mer（志摩觀光飯店 The Bay Suites 法式）」→「La Mer」（LINE 的回覆、下載的總覽用；整個名稱都是括號時照舊） */
export function stripParens(s: string): string {
  const out = s.replace(/（[^（）]*）/g, '').trim();
  return out || s.trim();
}

/** 抵達、起飛那行（T73 之前的摘要沒有 kind，看開頭） */
const isFlight = (l: SummaryLine) => l.kind === 'flight' || (l.kind === undefined && /^(抵達|起飛) /.test(l.text));

/** 那一行的名稱：航班照舊（括號是班號），其他拿掉括號 */
const nameText = (l: SummaryLine) => (isFlight(l) ? l.text : stripParens(l.text));

/** 「現在」用的一行：起訖都寫 */
const spanText = (l: SummaryLine) => `${l.start}${l.end && l.end !== l.start ? `-${l.end}` : ''} ${nameText(l)}`;

/** 合併卡的備選：主選下面縮排一行「　或 赤福 本店、豆腐庵山中」；沒有回 null */
const altText = (l: SummaryLine) => (l.alternatives?.length ? `　或 ${l.alternatives.map(stripParens).join('、')}` : null);

function pushWithAlt(out: string[], text: string, l: SummaryLine) {
  out.push(text);
  const alt = altText(l);
  if (alt) out.push(alt);
}

/** 「住：…」那行：選了住宿寫名稱，只定了區寫「志摩（還沒選住宿）」，都沒有是 null */
function stayLine(day: SummaryDay): string | null {
  if (day.lodging) return `住：${stripParens(day.lodging)}`;
  if (day.stayArea) return `住：${day.stayArea}（還沒選住宿）`;
  return null;
}

/** 日期（和那天在哪一區）：「2/5（五）志摩 → 鳥羽」 */
const heading = (day: SummaryDay) => (day.area ? `${dayHeading(day.date)}${day.area}` : dayHeading(day.date));

/** 一天：日期一行，接著每個行程一行（只寫開始時間），合併卡的備選縮排一行，最後「住：…」。什麼都沒排寫「還沒排」 */
export function formatDay(day: SummaryDay): string {
  const out = [heading(day)];
  if (!day.lines.length) out.push('還沒排');
  for (const l of day.lines) pushWithAlt(out, `${l.start} ${nameText(l)}`, l);
  const stay = stayLine(day);
  if (stay) out.push(stay);
  return out.join('\n');
}

/** 整趟的一天：日期一行、那天去的點用「、」串（航班不列；沒排寫「還沒排」）、住哪 */
function formatTripDay(day: SummaryDay): string {
  const places = day.lines.filter((l) => !isFlight(l)).map(nameText);
  const out = [heading(day), places.length ? places.join('、') : '還沒排'];
  const stay = stayLine(day);
  if (stay) out.push(stay);
  return out.join('\n');
}

/** 整趟：最上面一行說怎麼看某天的時間，接著每天三行，中間空一行 */
export function formatTrip(s: TripSummary): string {
  if (!s.days.length) return '還沒排';
  const head = `${tripRange(s)} 整趟\n要看某天的時間，按下面的日期或打「@機器人 ${shortDate(s.days[0].date)}」`;
  return [head, ...s.days.map(formatTripDay)].join('\n\n');
}

/** 旅程的日期範圍：2/2～2/13 */
export function tripRange(s: TripSummary): string {
  if (!s.days.length) return '';
  return `${shortDate(s.days[0].date)}～${shortDate(s.days[s.days.length - 1].date)}`;
}

/**
 * 現在、下一個（日本時間）：正在進行的（開始 ≤ 現在 < 結束），和下一個開始的；這兩行起訖都寫。
 * 回 null：today 不在旅程裡
 */
export function formatNow(s: TripSummary, now: { date: DateString; time: TimeString }): string | null {
  const day = s.days.find((d) => d.date === now.date);
  if (!day) return null;
  const t = toMinutes(now.time);
  const out = [`現在 ${now.time}（${dayHeading(now.date)}）`];
  const current = day.lines.filter((l) => toMinutes(l.start) <= t && l.end !== null && t < toMinutes(l.end));
  const next = day.lines.find((l) => toMinutes(l.start) > t);
  for (const l of current) pushWithAlt(out, `進行中：${spanText(l)}`, l);
  if (next) pushWithAlt(out, `下一個：${spanText(next)}`, next);
  if (out.length === 1) out.push(day.lines.length ? '今天的行程都結束了' : '今天還沒排');
  const stay = stayLine(day);
  if (stay) out.push(stay);
  return out.join('\n');
}

export type ReservationStatusText = 'pending' | 'booked' | 'skip';

/** 狀態的字和網站、PDF 一樣（interaction-design §17.6） */
const STATUS_TEXT: Record<ReservationStatusText, string> = { pending: '待訂', booked: '已訂', skip: '不用訂' };
const STATUS_ORDER: ReservationStatusText[] = ['pending', 'booked', 'skip'];

/** 預約的回覆最後一行（interaction-design §17.6） */
const RESERVATION_FOOTNOTE = '※ 網站不會幫忙訂，待訂的要自己訂，訂好到網站改成「已訂」';

/**
 * 預約狀態：date 是 null 時整趟。狀態用 (日期, 地點) 對最新的預約筆記，沒有的是待訂。
 * 住宿只要那天在入住～退房前一晚之間就列。
 * 排法：第一行寫數量（「整趟的預約：待訂 7、已訂 2」），之後照狀態分段（待訂、已訂、不用訂），備註換行縮排。
 */
export function formatReservations(
  s: TripSummary,
  date: DateString | null,
  saved: { date: string; placeId: string; status: ReservationStatusText; note: string | null }[],
): string {
  const rows = s.reservations.filter((r) => date === null || r.date === date || (r.endDate !== null && r.date <= date && date < r.endDate));
  const head = date ? `${dayHeading(date)}的預約` : '整趟的預約';
  if (!rows.length) return `${head}\n沒有要預約的`;
  const byKey = new Map(saved.map((x) => [`${x.date}|${x.placeId}`, x]));
  const groups: Record<ReservationStatusText, string[]> = { pending: [], booked: [], skip: [] };
  for (const r of rows) {
    const x = byKey.get(`${r.date}|${r.placeId}`);
    const when = r.endDate ? `${shortDate(r.date)} 起 ${dateRange(r.date, r.endDate).length - 1} 晚` : `${date ? '' : `${shortDate(r.date)} `}${r.time ?? ''}`.trim();
    const note = x?.note?.trim() ? `\n　${x.note.trim()}` : '';
    groups[x?.status ?? 'pending'].push(`・${when ? `${when} ` : ''}${stripParens(r.name)}${note}`);
  }
  const used = STATUS_ORDER.filter((k) => groups[k].length);
  const counts = used.map((k) => `${STATUS_TEXT[k]} ${groups[k].length}`).join('、');
  const sections = used.map((k) => [STATUS_TEXT[k], ...groups[k]].join('\n'));
  return [`${head}：${counts}`, ...sections, RESERVATION_FOOTNOTE].join('\n\n');
}

/** epoch 毫秒 → 日本時間的日期和 HH:MM（機器人、AI 的「現在」；日本沒有夏令時間） */
export function jstNow(ms: number): { date: DateString; time: TimeString; weekday: string } {
  const iso = new Date(ms + 9 * 3600_000).toISOString();
  const date = iso.slice(0, 10);
  return { date, time: iso.slice(11, 16), weekday: WEEKDAY[dayOfWeek(date)] };
}
