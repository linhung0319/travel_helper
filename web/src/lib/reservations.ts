// 預約筆記的列（T15m 第三輪）：行程裡需要預約的餐廳、體驗、住宿，套上大家記的狀態（未訂位／已訂位／不訂位）。
// 狀態用 (日期, 地點) 對應：項目移到別天、住宿換了入住日，就變回未訂位。純函式。

import { lodgingOn } from '@travel-helper/engine';
import type { DayPlan, Itinerary } from '@travel-helper/engine';
import type { Reservation, ReservationStatus } from '../backend/types.ts';
import type { Place } from '../data/types.ts';
import { allItems } from './planView.ts';

export interface NoteRow {
  /** 存狀態的 key：餐廳、體驗是排的那天；住宿是入住那晚 */
  key: { date: string; placeId: string };
  date: string;
  /** 住宿：退房日（最後一晚的隔天）；其他是 null */
  endDate: string | null;
  /** 住宿：連住幾晚；其他是 null */
  nights: number | null;
  placeId: string;
  /** 行程項目；住宿是 null */
  itemId: string | null;
  /** 主要的、這個時段也可以去的、住宿 */
  role: 'main' | 'other' | 'lodging';
  time: string | null;
  /** 幾個人（行程的 party） */
  people: number;
  accepted: string | null;
  methods: string[];
  phone: string | null;
  url: string | null;
  /** 資料點裡的預約備註（店家怎麼說） */
  placeNote: string | null;
  leadDays: number | null;
  status: ReservationStatus;
  /** 大家記的備註 */
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** 住宿：晚數和下訂時不一樣了 */
  nightsChanged: boolean;
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
    placeNote: [str('note'), str('groupNote')].filter(Boolean).join('；') || null,
    leadDays: typeof r?.leadDays === 'number' ? r.leadDays : null,
  };
}

/** 隔天的日期 */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const saveKey = (date: string, placeId: string) => `${date}|${placeId}`;

/**
 * 預約筆記的清單：每段連住的住宿（連續同一間合成一列），加上接受訂位的餐廳、體驗（多點卡片每個點一列，主要的在前）。
 * 時間用引擎算出的開始時間；狀態套上 reservations 裡同 (日期, 點) 的紀錄，沒有的是 pending。
 */
export function noteRows(it: Itinerary | null, plan: { days: DayPlan[] } | null, byId: Map<string, Place>, reservations: Reservation[]): NoteRow[] {
  if (!it) return [];
  const saved = new Map(reservations.map((r) => [saveKey(r.date, r.placeId), r]));
  const startOf = new Map<string, string>();
  for (const d of plan?.days ?? []) for (const e of d.entries) if (e.itemId) startOf.set(e.itemId, e.start);
  const withState = (row: Omit<NoteRow, 'status' | 'note' | 'updatedBy' | 'updatedAt' | 'nightsChanged'>): NoteRow => {
    const s = saved.get(saveKey(row.key.date, row.key.placeId));
    return {
      ...row,
      status: s?.status ?? 'pending',
      note: s?.note ?? null,
      updatedBy: s?.updatedBy ?? null,
      updatedAt: s?.updatedAt ?? null,
      nightsChanged: !!s && row.role === 'lodging' && s.nights != null && s.nights !== row.nights,
    };
  };

  const out: NoteRow[] = [];
  for (const ref of allItems(it)) {
    if (ref.item.type !== 'visit') continue;
    const v = ref.item;
    const people = it.party.size;
    v.options.forEach((o, i) => {
      const p = byId.get(o.place);
      if (!p || p.type === 'lodging') return;
      const r = reservationOf(p);
      if (!r.accepted || !RESERVE_ACCEPTED.has(r.accepted)) return;
      out.push(
        withState({
          key: { date: ref.date, placeId: p.id },
          date: ref.date,
          endDate: null,
          nights: null,
          placeId: p.id,
          itemId: v.id,
          role: i === v.selected ? 'main' : 'other',
          time: v.start ?? startOf.get(v.id) ?? null,
          people,
          ...r,
        }),
      );
    });
  }

  // 住宿：日期相連、同一間的合成一列
  let run: { date: string; last: string; placeId: string; nights: number } | null = null;
  const flush = () => {
    const p = run && byId.get(run.placeId);
    if (run && p) {
      out.push(
        withState({
          key: { date: run.date, placeId: p.id },
          date: run.date,
          endDate: nextDay(run.last),
          nights: run.nights,
          placeId: p.id,
          itemId: null,
          role: 'lodging',
          time: null,
          people: it.party.size,
          ...reservationOf(p),
        }),
      );
    }
    run = null;
  };
  for (const d of it.days) {
    const lodging = lodgingOn(it, d.date);
    if (!lodging) {
      flush();
      continue;
    }
    if (run && run.placeId === lodging && nextDay(run.last) === d.date) {
      run.last = d.date;
      run.nights += 1;
    } else {
      flush();
      run = { date: d.date, last: d.date, placeId: lodging, nights: 1 };
    }
  }
  flush();

  const rank = (r: NoteRow) => (r.role === 'lodging' ? 2 : r.role === 'other' ? 1 : 0);
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.role === 'lodging' ? 1 : 0) - (b.role === 'lodging' ? 1 : 0) || (a.time ?? '').localeCompare(b.time ?? '') || rank(a) - rank(b));
}

/** 時間軸的 tag 用：這天這個點的那一列（住宿用那晚所在的那一列） */
export function reservationFor(rows: NoteRow[], date: string, placeId: string): NoteRow | null {
  return rows.find((r) => r.placeId === placeId && (r.date === date || (r.endDate !== null && r.date <= date && date < r.endDate))) ?? null;
}

/** 這份行程比之前多出來、還沒訂的列（主要的、住宿）：採用後提醒「記得自己去訂」（§17.6） */
export function newPendingRows(before: Itinerary, after: Itinerary, byId: Map<string, Place>, reservations: Reservation[]): NoteRow[] {
  const had = new Set(noteRows(before, null, byId, reservations).map((r) => saveKey(r.key.date, r.key.placeId)));
  return noteRows(after, null, byId, reservations).filter((r) => r.role !== 'other' && r.status === 'pending' && !had.has(saveKey(r.key.date, r.key.placeId)));
}

/** 每個點的預約狀態（探索、想去、詳情的標籤，§17.7）：還有沒訂的就是 pending；全部不用訂、不在筆記裡的沒有 */
export function bookingByPlace(rows: NoteRow[]): Map<string, 'booked' | 'pending'> {
  const out = new Map<string, 'booked' | 'pending'>();
  for (const r of rows) {
    if (r.role === 'other' || r.status === 'skip') continue;
    if (r.status === 'pending') out.set(r.placeId, 'pending');
    else if (!out.has(r.placeId)) out.set(r.placeId, 'booked');
  }
  return out;
}

/** 提議動到已訂的點（§17.7）：程式判斷，不靠 AI 記得。那一列不見了，或住宿的晚數變了 */
export function bookedConflicts(before: Itinerary, after: Itinerary, byId: Map<string, Place>, reservations: Reservation[]): string[] {
  const next = new Map(noteRows(after, null, byId, reservations).map((r) => [saveKey(r.key.date, r.key.placeId), r]));
  return noteRows(before, null, byId, reservations)
    .filter((r) => r.status === 'booked')
    .filter((r) => {
      const a = next.get(saveKey(r.key.date, r.key.placeId));
      return !a || a.nights !== r.nights;
    })
    .map((r) => {
      const p = byId.get(r.placeId);
      return `${p ? p.name.zh || p.name.ja : r.placeId} ${r.role === 'lodging' ? '這晚' : '這天'}已訂，採用的話要記得自己去取消`;
    });
}

/** 連結的名稱：官網、食べログ、じゃらん、楽天，其他用網域名稱 */
export function linkLabel(url: string, place: Place): string {
  if (place.links.official && url === place.links.official) return '官網';
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // 不是網址就原樣當名稱
  }
  host = host.replace(/^www\./, '');
  if (host === 'tabelog.com' || host.endsWith('.tabelog.com')) return '食べログ';
  if (host === 'jalan.net' || host.endsWith('.jalan.net')) return 'じゃらん';
  if (host === 'travel.rakuten.co.jp') return '楽天';
  return host;
}

// ---------- T55：預約筆記的卡片和日期分組 ----------

const METHOD_LABELS: Record<string, string> = {
  phone: '電話',
  web: '網路',
  line: 'LINE',
  'instagram-dm': 'IG 私訊',
  official: '官網',
  rakuten: '楽天',
  jalan: 'じゃらん',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  knt: '近畿日本ツーリスト',
  yahoo: 'Yahoo!トラベル',
  stayjapan: 'STAY JAPAN',
  'vacation-stay': 'Vacation STAY',
  other: '其他方式',
};

/**
 * 訂位條件的小標籤：只從現有的結構化欄位拆（訂位方式、幾天前要訂、只接受團體）。
 * 店家怎麼說的那段文字（reservation.note、住宿的 groupNote）拆不了，照樣顯示成文字（PLAN T55）。
 */
export function reservationTags(row: Pick<NoteRow, 'methods' | 'leadDays' | 'accepted' | 'phone' | 'url'>): string[] {
  // 卡片上已經有電話號碼、網址的連結，「電話」「官網」就不再寫一次
  const shown = (m: string) => (m === 'phone' && !!row.phone) || (m === 'official' && !!row.url);
  const out = row.methods.filter((m) => !shown(m)).map((m) => METHOD_LABELS[m] ?? m);
  if (row.leadDays != null) out.push(`${row.leadDays} 天前要訂`);
  if (row.accepted === 'groups-only') out.push('只接受團體');
  return out;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 卡片的第二列：「2/3 · 12:00 · 15 人」；住宿「2/2–2/3 · 1 晚 · 15 人」 */
export function dateLine(row: Pick<NoteRow, 'role' | 'date' | 'endDate' | 'nights' | 'time' | 'people'>): string {
  const parts = row.role === 'lodging' && row.endDate ? [`${md(row.date)}–${md(row.endDate)}`, `${row.nights} 晚`] : [md(row.date), ...(row.time ? [row.time] : [])];
  return [...parts, `${row.people} 人`].join(' · ');
}

export type StatusCounts = Record<ReservationStatus, number> & { all: number };

/** 最上面的計數鈕 */
export function statusCounts(rows: Pick<NoteRow, 'status'>[]): StatusCounts {
  const c: StatusCounts = { pending: 0, booked: 0, skip: 0, all: rows.length };
  for (const r of rows) c[r.status] += 1;
  return c;
}

export interface NoteDay {
  date: string;
  rows: NoteRow[];
  pending: number;
}

/** 照日期分組（rows 已照日期排好） */
export function noteDays(rows: NoteRow[]): NoteDay[] {
  const out: NoteDay[] = [];
  for (const r of rows) {
    let d = out[out.length - 1];
    if (!d || d.date !== r.date) out.push((d = { date: r.date, rows: [], pending: 0 }));
    d.rows.push(r);
    if (r.status === 'pending') d.pending += 1;
  }
  return out;
}

/** 日期標題預設展開嗎：有待訂的展開，都訂好或不用訂的收合 */
export const dayOpenByDefault = (day: Pick<NoteDay, 'pending'>) => day.pending > 0;

/** 卡片預設展開嗎：待訂的展開，已訂、不用訂收成一列 */
export const cardOpenByDefault = (row: Pick<NoteRow, 'status'>) => row.status === 'pending';

/** 收起來的卡片顯示備註的第一行 */
export const firstLine = (text: string | null) => (text ?? '').split(/\r?\n/)[0].trim() || null;
