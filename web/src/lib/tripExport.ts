// 下載行程（T35）：把時間軸整理成給人看的內容，PDF（列印用的 HTML）和 MD 共用這一份，只有排版不同（tripExportFormat.ts）。
// 不用 T34 的行程摘要（TripSummary 不放交通）：直接從瀏覽器的時間軸整理，要車次、上下車站、要先買的特急券、錯過時的班次。
// 預約只放狀態（已訂／待訂／不用訂）。純函式：時間、班次都是引擎算好的；班次表從外面傳進來（planStore 的 departuresOf）。

import type { DayPlan, Itinerary, ItineraryItem, ItineraryPlan, Leg, PartyProfile, RideDeparture, TimelineEntry, TransitRide } from '@travel-helper/engine';
import { isTicketRide, dayAreaLabel, dayAreaOf, lodgingMealsOn, lodgingOn, nightAreaOf, stripParens } from '@travel-helper/engine';
import type { Reservation, ReservationStatus } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import { googleMapsUrl } from './addPlace/view.ts';
import { dayAreaName } from './dayTitle.ts';
import { dayStops } from './itinerary.ts';
import { MEALS_LABELS } from './labels.ts';
import { isKintetsu, rideShortName } from './legView.ts';
import { cardTime, legTitle } from './planView.ts';
import { noteRows, reservationFor, type NoteRow } from './reservations.ts';
import { headwayText } from './timetableView.ts';
import { dayLabel } from './trip.ts';

/** 當天那個方向的班次在這個數以內：列當天全部（伊勢志摩的巴士、船）；超過的（近鐵等）只列後兩班 */
export const MISSED_ALL_MAX = 12;
/** 班次多的路線列幾班 */
export const MISSED_NEXT_COUNT = 2;

export interface ExportPlace {
  /** 中文名（沒有中文用日文） */
  name: string;
  /** 日文名；和 name 一樣時是 null */
  ja: string | null;
  mapsUrl: string | null;
}

/**
 * 錯過的話（T73 決定 6：只列規劃那班之後的）：
 * later＝之後的全部（當天 12 班以內的路線，只有發車時間）；next＝之後的兩班（班次多的，帶到站、車種）；last＝規劃的就是末班；
 * all＝當天全部（對不到規劃的那班時才會這樣）；headway＝班距型
 */
export type ExportMissed =
  | { kind: 'later'; times: string[] }
  | { kind: 'next'; trains: { depart: string; arrive: string; kind: string | null }[] }
  | { kind: 'last' }
  | { kind: 'all'; times: string[] }
  | { kind: 'headway'; text: string };

export interface ExportRide {
  mode: TransitRide['mode'];
  /** 短名稱，例如「近鐵特急」「鷗巴士 5 號」 */
  name: string;
  from: string;
  to: string;
  /** 班距型是 null */
  depart: string | null;
  arrive: string | null;
  /** 上車前要在車站買的票；巴士、近鐵特急以外是 null */
  ticket: '特急券' | '票' | null;
  missed: ExportMissed | null;
}

export interface ExportLeg {
  /** 「大眾運輸 45 分」「大眾運輸 4 小時 7 分」「計程車 12 分」「步行 8 分」 */
  title: string;
  depart: string;
  arrive: string;
  /** 大眾運輸接計程車：「先搭計程車 9 分到鳥羽站」（台數不印，T74a） */
  taxi: string | null;
  walkBefore: number;
  walkAfter: number;
  rides: ExportRide[];
  /** 使用者在這段交通寫的備註 */
  note: string | null;
}

export type ExportStopKind = TimelineEntry['kind'];

export interface ExportStop {
  kind: ExportStopKind;
  /** 「10:00–11:30」「09:30 出發」「18:10 到住宿」 */
  time: string;
  /** 抵達、起飛、集合、自由時間這類前綴；一般的點是 null */
  label: string | null;
  place: ExportPlace | null;
  /** 合併卡的備選（到時候再選；T73）：每個印一行「備案：一榮」 */
  alternatives: ExportPlace[];
  flightNo: string | null;
  /** 「午餐」「晚餐」 */
  meals: string[];
  reservation: string | null;
  note: string | null;
}

/** 到了之後等很久（30 分以上）：「13:39–18:00 空檔 4 小時 21 分」（T73） */
export interface ExportGap {
  from: string;
  to: string;
  minutes: number;
}

/** 印成空檔的門檻（分） */
export const GAP_MIN_MINUTES = 30;

export type ExportRow =
  | { kind: 'leg'; leg: ExportLeg }
  | { kind: 'gap'; gap: ExportGap }
  | { kind: 'stop'; stop: ExportStop };

export interface ExportLodging {
  place: ExportPlace;
  address: string | null;
  phone: string | null;
  checkIn: string | null;
  meals: string | null;
  reservation: string | null;
}

export interface ExportDay {
  date: string;
  /** 「2/5（五）」 */
  heading: string;
  area: string | null;
  note: string | null;
  /** 總覽的「去哪裡」：這天去的點（主選，名稱拿掉括號）；航班、出發、回住宿不算 */
  places: string[];
  /** 只有出發、回住宿、沒有任何點的那天是 []（印「還沒排」） */
  rows: ExportRow[];
  lodging: ExportLodging | null;
  /** 這晚住哪一區（T45a）：還沒選住宿、只定了區時寫區名，其他是 null */
  stayArea: string | null;
}

export interface ExportFlight {
  date: string;
  direction: 'arrive' | 'depart';
  flightNo: string | null;
  depart: string;
  arrive: string;
  airport: string;
  people: number | null;
}

/** 預約一覽的一列（§17.6） */
export interface ExportReservation {
  when: string;
  name: string;
  status: string;
}

export interface ExportDoc {
  /** 「2/2（二）～ 2/13（六）」 */
  range: string;
  party: PartyProfile;
  flights: ExportFlight[];
  days: ExportDay[];
  /** 預約一覽：主要的和住宿，照日期 */
  reservations: ExportReservation[];
  version: number;
  /** 「1/20 21:05 王小明 更新」；不知道是 null */
  updated: string | null;
  /** 產生的時間（日本時間，「2026-11-02 14:05」） */
  generatedAt: string;
}

export interface ExportInput {
  itinerary: Itinerary;
  plan: ItineraryPlan;
  /** 清單層（名稱、地區、預約的列） */
  byId: Map<string, Place>;
  /** 完整的資料點（地址、電話、入住時間）；拿不到用清單層 */
  fullOf: (id: string) => Place | null;
  areas: Area[];
  reservations: Reservation[];
  /** 一程那天同一對站的所有班次（planStore 的 departuresOf） */
  departures: (date: string, ride: TransitRide) => RideDeparture[];
  version: number;
  updated: string | null;
  generatedAt: string;
}

const STATUS_LABELS: Record<ReservationStatus, string> = { pending: '待訂', booked: '已訂', skip: '不用訂' };
const MEAL_LABELS: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' };
const EXPRESS = ['特急', 'しまかぜ'];

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * 錯過的話（2026-11-02 👤 定，T73 決定 6 改成只列規劃那班之後的）：
 * 當天那個方向 12 班以內列之後的全部，超過的列之後的兩班；規劃的就是末班時寫末班。對不到規劃的那班時列當天全部
 */
export function missedOf(ride: TransitRide, deps: RideDeparture[]): ExportMissed | null {
  if (ride.kind === 'headway') return ride.headwayMin != null || ride.first || ride.last ? { kind: 'headway', text: headwayText(ride) } : null;
  if (!deps.length) return ride.ifMissed === null ? { kind: 'last' } : null;
  let plan = ride.tripId != null ? deps.findIndex((d) => d.tripId === ride.tripId) : -1;
  if (plan < 0) plan = deps.findIndex((d) => d.depart === ride.depart);
  if (plan < 0) return deps.length <= MISSED_ALL_MAX ? { kind: 'all', times: deps.map((d) => d.depart) } : null;
  const later = deps.slice(plan + 1);
  if (!later.length) return { kind: 'last' };
  if (deps.length <= MISSED_ALL_MAX) return { kind: 'later', times: later.map((d) => d.depart) };
  const kintetsu = isKintetsu(ride);
  return { kind: 'next', trains: later.slice(0, MISSED_NEXT_COUNT).map((d) => ({ depart: d.depart, arrive: d.arrive, kind: kintetsu ? stripParens(d.line).split(' ')[0] || null : null })) };
}

/** 到了之後等 30 分以上才印成空檔；抵達、起飛（在機場的時間）、出發、回住宿不印 */
function gapOf(e: TimelineEntry): ExportGap | null {
  if (e.kind !== 'visit' && e.kind !== 'free') return null;
  return e.waitMinutes >= GAP_MIN_MINUTES ? { from: e.arrive, to: e.start, minutes: e.waitMinutes } : null;
}

function ticketOf(rides: TransitRide[], i: number): ExportRide['ticket'] {
  if (!isTicketRide(rides, i)) return null;
  const r = rides[i];
  return isKintetsu(r) && EXPRESS.some((k) => r.line.startsWith(k)) ? '特急券' : '票';
}

export function buildTripExport(input: ExportInput): ExportDoc {
  const { itinerary, plan, byId, areas } = input;
  const rows = noteRows(itinerary, plan, byId, input.reservations);
  const areaOf = (id: string) => byId.get(id)?.area;
  const areaName = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return a ? a.name.zh || a.name.ja || id : id;
  };
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? p.name.zh || p.name.ja || id : id;
  };
  const placeOf = (id: string | null): ExportPlace | null => {
    if (!id) return null;
    const p = byId.get(id);
    if (!p) return { name: id, ja: null, mapsUrl: null };
    const name = p.name.zh || p.name.ja || id;
    return { name, ja: p.name.ja && p.name.ja !== name ? p.name.ja : null, mapsUrl: googleMapsUrl(p) };
  };
  const statusOf = (r: NoteRow | null) => (r ? STATUS_LABELS[r.status] : null);

  const items = new Map<string, ItineraryItem>();
  for (const d of itinerary.days) for (const it of d.items) items.set(it.id, it);
  const itemOf = (id: string | null) => (id ? (items.get(id) ?? null) : null);
  const travelNoteOf = (it: ItineraryItem | null) => (it ? str(it.travel?.note) : null);

  // 大眾運輸接計程車：哪一站、幾分（台數不印，T74a）
  const taxiLine = (leg: Leg): string | null => {
    const parts = [leg.taxiBefore && `先搭計程車 ${leg.taxiBefore.minutes} 分到${nameOf(leg.taxiBefore.station)}`, leg.taxiAfter && `到${nameOf(leg.taxiAfter.station)}再搭計程車 ${leg.taxiAfter.minutes} 分`].filter(Boolean);
    return parts.length ? parts.join('・') : null;
  };

  const legOf = (date: string, leg: Leg, note: string | null): ExportLeg | null => {
    if (leg.mode === 'none') return null;
    return {
      title: legTitle(leg),
      depart: leg.depart,
      arrive: leg.arrive,
      taxi: taxiLine(leg),
      walkBefore: leg.walkBefore ?? 0,
      walkAfter: leg.walkAfter ?? 0,
      rides: leg.rides.map((r, i) => ({
        mode: r.mode,
        name: rideShortName(r),
        from: nameOf(r.from),
        to: nameOf(r.to),
        depart: r.kind === 'headway' ? null : r.depart,
        arrive: r.kind === 'headway' ? null : r.arrive,
        ticket: ticketOf(leg.rides, i),
        missed: missedOf(r, r.kind === 'headway' ? [] : input.departures(date, r)),
      })),
      note,
    };
  };

  const stopOf = (date: string, e: TimelineEntry): ExportStop => {
    const item = itemOf(e.itemId);
    let label: string | null = null;
    let flightNo: string | null = null;
    if (e.kind === 'flight' && item?.type === 'flight') {
      label = item.direction === 'arrive' ? '抵達' : '起飛';
      flightNo = item.flightNo ?? null;
    } else if (e.kind === 'free') label = '自由時間';
    const main = e.kind === 'visit' && e.placeId ? reservationFor(rows, date, e.placeId) : null;
    const minor = e.kind === 'start' || e.kind === 'lodging';
    const place = placeOf(e.placeId);
    return {
      kind: e.kind,
      time: cardTime(e).text,
      label,
      // 出發、回住宿不印日文名（住宿框已經有）
      place: place && minor ? { ...place, ja: null } : place,
      alternatives: item?.type === 'visit' ? item.options.filter((_, i) => i !== item.selected).flatMap((o) => placeOf(o.place) ?? []) : [],
      flightNo,
      meals: (e.mealTags ?? []).map((m) => MEAL_LABELS[m] ?? m),
      reservation: main && main.role !== 'lodging' ? statusOf(main) : null,
      note: minor ? null : str(item?.note),
    };
  };

  const rowsOf = (date: string, entries: TimelineEntry[], returnNote: string | null): ExportRow[] => {
    // 只有出發、回住宿的那天（有住宿、沒有任何點）：印「還沒排」，不印那兩行；換住宿、真的要移動的（2/12 去關西機場那種）照印
    const moving = entries.some((e) => e.travel && e.travel.mode !== 'none' && e.travel.minutes > 0);
    if (!moving && !entries.some((e) => e.kind !== 'start' && e.kind !== 'lodging')) return [];
    const out: ExportRow[] = [];
    for (const e of entries) {
      if (e.travel) {
        const travelNote = e.kind === 'lodging' ? returnNote : travelNoteOf(itemOf(e.itemId));
        const leg = legOf(date, e.travel, travelNote);
        if (leg) out.push({ kind: 'leg', leg });
      }
      const gap = gapOf(e);
      if (gap) out.push({ kind: 'gap', gap });
      out.push({ kind: 'stop', stop: stopOf(date, e) });
    }
    return out;
  };

  const days: ExportDay[] = itinerary.days.map((d) => {
    const dp: DayPlan | undefined = plan.days.find((x) => x.date === d.date);
    let lodging: ExportLodging | null = null;
    const lodgingId = lodgingOn(itinerary, d.date);
    if (lodgingId) {
      const full = input.fullOf(lodgingId) ?? byId.get(lodgingId) ?? null;
      const raw = full?.raw ?? {};
      const res = (raw.reservation ?? null) as Record<string, unknown> | null;
      const meals = lodgingMealsOn(itinerary, d.date) ?? str(raw.meals);
      lodging = {
        place: placeOf(lodgingId)!,
        address: str(raw.address),
        phone: str(raw.phone) ?? str(res?.phone),
        checkIn: str(raw.checkIn),
        // 資料裡的 varies（方案不一）不寫，這晚選了方案才寫
        meals: meals ? (MEALS_LABELS[meals] ?? null) : null,
        reservation: statusOf(reservationFor(rows.filter((r) => r.role === 'lodging'), d.date, lodgingId)),
      };
    }
    const entries = dp?.entries ?? [];
    return {
      date: d.date,
      heading: dayLabel(d.date),
      // 這天在哪一區：先照每晚住哪一區推（移動日「志摩 → 鳥羽」），還沒定的照排了的點
      area: dayAreaLabel(dayAreaOf(itinerary, d.date, areaOf), areaName) ?? dayAreaName(dayStops(d, lodgingId), byId, areas),
      note: str(d.note),
      places: entries.filter((e) => e.kind === 'visit' && e.placeId).map((e) => stripParens(nameOf(e.placeId!))),
      rows: rowsOf(d.date, entries, str(d.returnTravel?.note)),
      lodging,
      stayArea: lodging ? null : (() => {
        const a = nightAreaOf(itinerary, d.date, areaOf);
        return a ? areaName(a) : null;
      })(),
    };
  });

  const flights: ExportFlight[] = [];
  for (const d of itinerary.days)
    for (const it of d.items)
      if (it.type === 'flight')
        flights.push({ date: d.date, direction: it.direction, flightNo: it.flightNo ?? null, depart: it.depart, arrive: it.arrive, airport: nameOf(it.airport), people: it.people ?? null });

  const first = itinerary.days[0]?.date;
  const last = itinerary.days[itinerary.days.length - 1]?.date;
  return {
    range: first && last ? `${dayLabel(first)} ～ ${dayLabel(last)}` : '',
    party: itinerary.party,
    flights,
    days,
    reservations: rows
      .filter((r) => r.role !== 'other')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ when: r.role === 'lodging' ? `${dayLabel(r.date)} 起住 ${r.nights} 晚` : `${dayLabel(r.date)}${r.time ? ` ${r.time}` : ''}`, name: nameOf(r.placeId), status: STATUS_LABELS[r.status] })),
    version: input.version,
    updated: input.updated,
    generatedAt: input.generatedAt,
  };
}
