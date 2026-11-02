// 行程摘要（T34）：只有「結果」，幾點到幾點做什麼、住哪、要預約的有哪些；不放交通、警告。
// 瀏覽器算完時間軸後整理成 TripSummary 存進 D1（Worker 算不出時間，architecture §6）；
// LINE 機器人讀出來排成文字回覆（T35 的下載檔不用這份，直接從時間軸整理，見 web/src/lib/tripExport.ts）。純函式，沒有 I/O。

import { dayOfWeek, toMinutes } from './time.ts';
import type { DateString, ItineraryPlan, Itinerary, TimeString, TimelineEntry } from './types.ts';

/** 時間軸的一行 */
export interface SummaryLine {
  start: TimeString;
  /** 只有一個時間點的（抵達、起飛、集合）是 null */
  end: TimeString | null;
  text: string;
  /** 分組時是組名；全員是省略 */
  group?: string;
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
}

/** 引擎的時間軸 → 摘要。同一時段有備選時只列主選（引擎本來就只算主選）；分組時各組都列 */
export function buildTripSummary({ itinerary, plan, nameOf, reservations = [] }: SummaryInput): TripSummary {
  const items = new Map<string, Itinerary['days'][number]['items'][number]>();
  for (const d of itinerary.days) for (const it of d.items) items.set(it.id, it);
  const name = (id: string | null) => (id ? (nameOf(id) ?? id) : null);

  const lineOf = (e: TimelineEntry, group?: string): SummaryLine | null => {
    const g = group ? { group } : {};
    switch (e.kind) {
      case 'visit':
        return { start: e.start, end: e.end, text: name(e.placeId) ?? '（地點）', ...g };
      case 'free': {
        const where = name(e.placeId);
        return { start: e.start, end: e.end, text: where ? `自由時間：${where}` : '自由時間', ...g };
      }
      case 'flight': {
        const f = e.itemId ? items.get(e.itemId) : undefined;
        const no = f?.type === 'flight' && f.flightNo ? `（${f.flightNo}）` : '';
        const arrive = f?.type === 'flight' && f.direction === 'arrive';
        return { start: e.start, end: null, text: `${arrive ? '抵達' : '起飛'} ${name(e.placeId) ?? '機場'}${no}`, ...g };
      }
      case 'meet':
        return { start: e.start, end: null, text: `集合：${name(e.placeId) ?? '（地點）'}`, ...g };
      default:
        return null; // 出發、回住宿不列（最後一行寫住哪）
    }
  };

  const days: SummaryDay[] = itinerary.days.map((d) => {
    const dp = plan.days.find((x) => x.date === d.date);
    const lines: SummaryLine[] = [];
    for (const e of dp?.entries ?? []) {
      if (e.groups?.length) {
        for (const g of e.groups) for (const ge of g.entries) if (ge.kind !== 'meet') pushLine(lines, lineOf(ge, g.name));
      }
      pushLine(lines, lineOf(e));
    }
    return { date: d.date, lines, lodging: name(d.lodging) };
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

const lineText = (l: SummaryLine) => `${l.group ? `【${l.group}】` : ''}${l.start}${l.end && l.end !== l.start ? `-${l.end}` : ''} ${l.text}`;

/** 一天：日期一行，接著每個行程一行，最後「住：…」。什麼都沒排寫「還沒排」 */
export function formatDay(day: SummaryDay): string {
  const out = [dayHeading(day.date)];
  if (!day.lines.length) out.push('還沒排');
  for (const l of day.lines) out.push(lineText(l));
  if (day.lodging) out.push(`住：${day.lodging}`);
  return out.join('\n');
}

/** 整趟：每天一段，中間空一行 */
export const formatTrip = (s: TripSummary) => s.days.map(formatDay).join('\n\n');

/** 旅程的日期範圍：2/2～2/13 */
export function tripRange(s: TripSummary): string {
  if (!s.days.length) return '';
  return `${shortDate(s.days[0].date)}～${shortDate(s.days[s.days.length - 1].date)}`;
}

/**
 * 現在、下一個（日本時間）。每一組（全員算一組）各自找：正在進行的（開始 ≤ 現在 < 結束），和下一個開始的。
 * 回 null：today 不在旅程裡
 */
export function formatNow(s: TripSummary, now: { date: DateString; time: TimeString }): string | null {
  const day = s.days.find((d) => d.date === now.date);
  if (!day) return null;
  const t = toMinutes(now.time);
  const out = [`現在 ${now.time}（${dayHeading(now.date)}）`];
  const tracks = new Map<string, SummaryLine[]>();
  for (const l of day.lines) {
    const k = l.group ?? '';
    tracks.set(k, [...(tracks.get(k) ?? []), l]);
  }
  for (const [, lines] of tracks) {
    const current = lines.filter((l) => toMinutes(l.start) <= t && l.end !== null && t < toMinutes(l.end));
    const next = lines.find((l) => toMinutes(l.start) > t);
    for (const l of current) out.push(`進行中：${lineText(l)}`);
    if (next) out.push(`下一個：${lineText(next)}`);
  }
  if (out.length === 1) out.push(day.lines.length ? '今天的行程都結束了' : '今天還沒排');
  if (day.lodging) out.push(`住：${day.lodging}`);
  return out.join('\n');
}

export type ReservationStatusText = 'pending' | 'booked' | 'skip';

const STATUS_TEXT: Record<ReservationStatusText, string> = { pending: '還沒訂', booked: '已訂', skip: '不訂' };

/**
 * 預約狀態：date 是 null 時整趟。狀態用 (日期, 地點) 對最新的預約筆記，沒有的是還沒訂。
 * 住宿只要那天在入住～退房前一晚之間就列。
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
  const lines = rows.map((r) => {
    const x = byKey.get(`${r.date}|${r.placeId}`);
    const when = r.endDate ? `住 ${shortDate(r.date)}～${shortDate(r.endDate)}` : `${date ? '' : `${shortDate(r.date)} `}${r.time ?? ''}`.trim();
    const note = x?.note?.trim() ? `（${x.note.trim()}）` : '';
    return `${when ? `${when} ` : ''}${r.name}：${STATUS_TEXT[x?.status ?? 'pending']}${note}`;
  });
  return [head, ...lines].join('\n');
}

/** epoch 毫秒 → 日本時間的日期和 HH:MM（機器人、AI 的「現在」；日本沒有夏令時間） */
export function jstNow(ms: number): { date: DateString; time: TimeString; weekday: string } {
  const iso = new Date(ms + 9 * 3600_000).toISOString();
  const date = iso.slice(0, 10);
  return { date, time: iso.slice(11, 16), weekday: WEEKDAY[dayOfWeek(date)] };
}
