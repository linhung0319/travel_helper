// 預約筆記的列（T15m 第三輪）：行程裡需要預約的餐廳、體驗、住宿，套上大家記的狀態（未訂位／已訂位／不訂位）。
// 狀態用 (日期, 地點) 對應：項目移到別天、住宿換了入住日，就變回未訂位。純函式。

import type { DayPlan, Itinerary, TimelineEntry } from '@travel-helper/engine';
import type { Reservation, ReservationStatus } from '../backend/types.ts';
import type { Place } from '../data/types.ts';
import { allItems, type ItemRef } from './planView.ts';

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
  /** 幾個人（分組的那組人數，全員是行程的 party） */
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
    placeNote: str('note'),
    leadDays: typeof r?.leadDays === 'number' ? r.leadDays : null,
  };
}

function groupSize(it: Itinerary, ref: ItemRef): number {
  const day = it.days.find((d) => d.date === ref.date);
  const sp = day?.items.find((x) => x.id === ref.split?.id);
  return (sp?.type === 'split' && sp.groups.find((g) => g.id === ref.split?.group)?.size) || it.party.size;
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
  for (const d of plan?.days ?? []) {
    const walk = (es: TimelineEntry[]) => {
      for (const e of es) {
        if (e.itemId) startOf.set(e.itemId, e.start);
        for (const g of e.groups ?? []) walk(g.entries);
      }
    };
    walk(d.entries);
  }
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
    const people = ref.split ? groupSize(it, ref) : it.party.size;
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
    if (!d.lodging) {
      flush();
      continue;
    }
    if (run && run.placeId === d.lodging && nextDay(run.last) === d.date) {
      run.last = d.date;
      run.nights += 1;
    } else {
      flush();
      run = { date: d.date, last: d.date, placeId: d.lodging, nights: 1 };
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
