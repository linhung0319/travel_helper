// 交通卡、班次表要的整理（T29c spec §8.2～§8.8）：短名稱、膠囊、這段的警告、補充資訊、錯過的標籤、一程一行的步驟、可以多待、班次格子。
// 純函式：時間、班次、錯過的話都是引擎算好的，這裡只整理成畫面要的樣子。缺 ready、transfers、ifMissed 的舊資料不當掉，缺的就不顯示。

import type { DayPlan, EngineWarning, Leg, PathRef, RideDeparture, TimelineEntry, TransitRide, TravelSpec } from '@travel-helper/engine';
import { isTicketRide, toMinutes } from '@travel-helper/engine';

/** 「錯過 +N 分」變橘色的門檻（分，spec §8.5） */
export const HOT_MISS_MINUTES = 30;

/** 去掉所有全形括號（含裡面的字），例如「伊勢鳥羽線（經二見）（往鳥羽）」→「伊勢鳥羽線」 */
const stripParens = (s: string) => s.replace(/（[^（）]*）/g, '').trim();

/** 是不是近鐵（舊資料沒有 operator：電車、沒有 routeId、不是班距型的就是近鐵） */
export const isKintetsu = (r: TransitRide) => r.operator === 'kintetsu' || (r.operator == null && r.mode === 'train' && !r.routeId && r.kind !== 'headway');

/** 班距型的業者簡稱（沒列的照原名） */
const OPERATOR_SHORT: Record<string, string> = {
  JR西日本: 'JR',
  'Osaka Metro': '地鐵',
  南海電鉄: '南海',
  近畿日本鉄道: '近鐵',
};

/** 線名的簡稱（班距型）：業者簡稱已經說了的地名拿掉 */
const LINE_SHORT: Record<string, string> = { 大阪環狀線: '環狀線' };

/**
 * 一程的短名稱（膠囊、步驟用；spec §8.2）：
 * 近鐵：「近鐵」＋車種（「特急（往賢島）」→「近鐵特急」）；
 * 班距型：業者簡稱＋線名（「JR西日本」＋「大阪環狀線」→「JR 環狀線」；線名已經帶業者的照線名，例如「南海 機場急行」）；
 * 巴士、船、JR：路線名去掉括號（經由、往哪），最後一段是「A～B」區間的拿掉（「鷗巴士 5 號 鳥羽～國崎線（經相差）（往国崎）」→「鷗巴士 5 號」）。
 * nameOfRoute 給了而且查得到路線名時，用路線名代替 line
 */
export function rideShortName(ride: TransitRide, nameOfRoute?: (routeId: string) => string | null): string {
  const routeName = ride.routeId && nameOfRoute ? nameOfRoute(ride.routeId) : null;
  const name = stripParens(routeName ?? ride.line);
  if (isKintetsu(ride)) return `近鐵${name.split(' ')[0]}`;
  if (ride.kind === 'headway') {
    const op = ride.operator ? (OPERATOR_SHORT[ride.operator] ?? ride.operator) : null;
    const line = LINE_SHORT[name] ?? name;
    return !op || line.startsWith(op) ? line : `${op} ${line}`;
  }
  const parts = name.split(' ');
  if (parts.length > 1 && parts[parts.length - 1].includes('～')) return parts.slice(0, -1).join(' ');
  return name;
}

/** 收合時第二行的膠囊：每一程的方式和短名稱；stops[i] 是第 i 程和第 i+1 程中間的換車站名 */
export function legChips(leg: Leg, nameOf: (id: string) => string): { rides: { mode: TransitRide['mode']; name: string }[]; stops: string[] } {
  return {
    rides: leg.rides.map((r) => ({ mode: r.mode, name: rideShortName(r) })),
    stops: leg.rides.slice(0, -1).map((r) => nameOf(r.to)),
  };
}

const LEVEL_ORDER: Record<EngineWarning['level'], number> = { error: 0, warning: 1, info: 2 };
const byLevel = (ws: EngineWarning[]) => [...ws].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

/** 這段交通的警告（引擎標了 leg: true 的）：目的地是這張卡的；回住宿那段是沒有 itemId 的。依等級排（error、warning、info） */
export function legWarnings(day: DayPlan, entry: TimelineEntry): EngineWarning[] {
  const lodging = entry.kind === 'lodging';
  if (!lodging && !entry.itemId) return [];
  return byLevel(day.warnings.filter((w) => w.leg && (lodging ? !w.itemId : w.itemId === entry.itemId)));
}

/** 第一行「⚠ 數字」：只數 error、warning */
export function warnCount(ws: EngineWarning[]): number {
  return ws.filter((w) => w.level === 'error' || w.level === 'warning').length;
}

/** 補充資訊框不放的警告：ticket-tight 放在步驟的節點下面，taxi 和台數、起跳價重複 */
const INFO_HIDDEN = new Set(['ticket-tight', 'taxi']);

/** 點開後補充資訊框的行（spec §8.3）：警告文字（warning 以上在前）、計程車起跳價、前一站可以多待；沒有就是 [] */
export function infoLines(leg: Leg, ws: EngineWarning[], slack: string | null): string[] {
  const out = byLevel(ws.filter((w) => !INFO_HIDDEN.has(w.code))).map((w) => w.message);
  const taxi = leg.taxi;
  if (taxi?.fareFromYen != null) {
    const jumbo = /大型 ([\d,]+) 円/.exec(taxi.note)?.[1];
    out.push(`每台起跳 ${taxi.fareFromYen.toLocaleString('en-US')} 円${jumbo ? `（大型 ${jumbo} 円）` : ''}`);
  }
  if (slack) out.push(slack);
  return out;
}

/** 一程右邊「錯過的話」的標籤：hot 橘底、muted 淡灰、bad 紅底 */
export type MissBadge = { text: string; tone: 'hot' | 'muted' | 'bad' };

/**
 * 錯過的標籤（spec §8.5）：ifMissed 是 null（沒有下一班）→「錯過 無下一班」；
 * 班距型 →「約 N 分一班」（班距不知道就不顯示）；有時刻表 →「錯過 +N 分」，≥ hotMinutes 是 hot。
 * 沒有 ifMissed 欄位（舊資料）不顯示
 */
export function missBadge(ride: TransitRide, hotMinutes = HOT_MISS_MINUTES): MissBadge | null {
  if (ride.ifMissed === undefined) return null;
  if (ride.ifMissed === null) return { text: '錯過 無下一班', tone: 'bad' };
  if (ride.kind === 'headway') return ride.headwayMin != null ? { text: `約 ${ride.headwayMin} 分一班`, tone: 'muted' } : null;
  const late = ride.ifMissed.lateMinutes;
  return { text: `錯過 +${late} 分`, tone: late >= hotMinutes ? 'hot' : 'muted' };
}

/**
 * 展開後一程一行的步驟（spec §8.4）：
 * node：時間、名稱；wait 在這裡等的分鐘（0 是 null）；walk 從這裡走到下一個節點的分鐘（walkLast：走到終點那段）；
 *   board 在這裡上車的那一程（上車站才有，可以點開班次表）；ticketTight 買票站空檔不到 margin 時的空檔分鐘。
 * ride：短名稱、發車（班距型是 null）、車程分鐘、錯過的標籤。
 * transfer：轉乘有說明或有電梯路線時另外一行（步行分鐘、電梯路線分鐘、說明）
 */
export type CompactStep =
  | { kind: 'node'; time: string; name: string; wait: number | null; walk: number | null; walkLast: boolean; board: number | null; ticketTight: number | null }
  | { kind: 'ride'; index: number; mode: TransitRide['mode']; name: string; depart: string | null; minutes: number; badge: MissBadge | null }
  | { kind: 'transfer'; walk: number; elevatorWalk: number | null; note: string | null };

type NodeStep = Extract<CompactStep, { kind: 'node' }>;

const addMinutes = (t: string, m: number) => {
  const x = toMinutes(t) + m;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** 第 i 程「走到上車站／轉乘完」的時間：有 ready 用 ready；沒有時第一程是出發＋walkBefore，之後是前一程到站（轉乘步行當 0） */
function readyOf(leg: Leg, i: number): string {
  return leg.ready?.[i] ?? (i === 0 ? addMinutes(leg.depart, leg.walkBefore ?? 0) : leg.rides[i - 1].arrive);
}

/** 交通卡展開後的步驟；沒有搭車（計程車、步行）回傳 []。margin 是買票站要留的分鐘（EngineConfig.transit.ticketMargin） */
export function compactSteps(leg: Leg, fromName: string, toName: string, nameOf: (id: string) => string, margin: number): CompactStep[] {
  const rides = leg.rides;
  if (!rides.length) return [];
  const out: CompactStep[] = [];
  const node = (time: string, name: string, over: Partial<NodeStep> = {}): NodeStep => {
    const n: NodeStep = { kind: 'node', time, name, wait: null, walk: null, walkLast: false, board: null, ticketTight: null, ...over };
    out.push(n);
    return n;
  };
  // 上車站的等車、買票太趕
  const boarding = (i: number, time: string) => {
    const gap = toMinutes(rides[i].depart) - toMinutes(readyOf(leg, i));
    const wait = toMinutes(rides[i].depart) - toMinutes(time);
    return { board: i, wait: wait > 0 ? wait : null, ticketTight: isTicketRide(rides, i) && gap < margin ? Math.max(0, gap) : null };
  };
  const before = leg.walkBefore ?? 0;
  const after = leg.walkAfter ?? 0;
  if (before > 0) {
    node(leg.depart, fromName, { walk: before });
    node(readyOf(leg, 0), nameOf(rides[0].from), boarding(0, readyOf(leg, 0)));
  } else node(readyOf(leg, 0), fromName, boarding(0, readyOf(leg, 0)));
  rides.forEach((r, index) => {
    out.push({
      kind: 'ride',
      index,
      mode: r.mode,
      name: rideShortName(r),
      depart: r.kind === 'headway' ? null : r.depart,
      minutes: toMinutes(r.arrive) - toMinutes(r.depart),
      badge: missBadge(r),
    });
    const next = rides[index + 1];
    if (!next) return;
    const t = leg.transfers?.[index];
    const walk = t?.walkMinutes ?? 0;
    const separate = !!t && (t.note != null || t.elevator === true);
    const alight = nameOf(r.to);
    const boardName = nameOf(next.from);
    // 同一站換車、不用走：下車和上車合成一個節點
    if (!separate && walk === 0 && alight === boardName) {
      node(r.arrive, alight, boarding(index + 1, r.arrive));
      return;
    }
    node(r.arrive, alight, { walk: separate || walk === 0 ? null : walk });
    if (separate) out.push({ kind: 'transfer', walk, elevatorWalk: t.elevatorWalkMinutes, note: t.note });
    const ready = readyOf(leg, index + 1);
    node(ready, boardName, boarding(index + 1, ready));
  });
  const last = rides[rides.length - 1];
  if (after > 0) {
    node(last.arrive, nameOf(last.to), { walk: after, walkLast: true });
    node(leg.arrive, toName);
  } else node(last.arrive, toName);
  return out;
}

/**
 * 買票太趕那一行（spec §8.4、§8.6）：近鐵特急（line 開頭是特急、しまかぜ，和引擎 isTicketRide 一樣；舊資料沒有 operator 照 isKintetsu 猜）寫「買特急券」，
 * 其他（JR、船）寫「買票」；gap 是到站到發車的分鐘（compactSteps 的 ticketTight）
 */
export function ticketTightText(ride: TransitRide, gap: number): string {
  const express = isKintetsu(ride) && [...EXPRESS_KINDS].some((k) => ride.line.startsWith(k));
  return `到站 ${gap} 分就發車，買${express ? '特急券' : '票'}可能來不及`;
}

/**
 * 前一站可以多待幾分（spec §8.7）：第一程有時刻表、有 ready 時，N＝發車 − ready[0]，第一個上車站是買票站再扣 margin；
 * N ≤ 0 或條件不合回傳 null
 */
export function slackHint(leg: Leg, margin: number): string | null {
  const r = leg.rides[0];
  const ready = leg.ready?.[0];
  if (!r || r.kind === 'headway' || !ready) return null;
  const n = toMinutes(r.depart) - toMinutes(ready) - (isTicketRide(leg.rides, 0) ? margin : 0);
  return n > 0 ? `前一站多待 ${n} 分，一樣搭 ${r.depart}` : null;
}

/**
 * 班次表的一格（spec §8.8）：mark 是「規劃」或「+N 分」（下一班，late 是晚幾分）；isLast 是那天最後一班（可以和 mark 同時有）；
 * gone 是發車早於走到站（搭不到）；kind 是近鐵的車種，express 是特急、しまかぜ（要買特急券）
 */
export type DepartureCell = {
  depart: string;
  arrive: string;
  kind: string | null;
  express: boolean;
  mark: 'plan' | 'next' | null;
  isLast: boolean;
  gone: boolean;
  late: number | null;
};

const EXPRESS_KINDS = new Set(['特急', 'しまかぜ']);

/** 一程那天的班次（rideDepartures）排成格子；規劃那班照 tripId 找，對不到用發車時間相同的第一班；readyAt 是走到上車站的時間 */
export function departureCells(deps: RideDeparture[], ride: TransitRide, readyAt: string): DepartureCell[] {
  let plan = ride.tripId != null ? deps.findIndex((d) => d.tripId === ride.tripId) : -1;
  if (plan < 0) plan = deps.findIndex((d) => d.depart === ride.depart);
  const missed = ride.ifMissed;
  const next = missed ? deps.findIndex((d, i) => i > plan && d.depart === missed.depart) : -1;
  const kintetsu = isKintetsu(ride);
  const ready = toMinutes(readyAt);
  return deps.map((d, i) => {
    const kind = kintetsu ? stripParens(d.line).split(' ')[0] || null : null;
    return {
      depart: d.depart,
      arrive: d.arrive,
      kind,
      express: kind != null && EXPRESS_KINDS.has(kind),
      mark: i === plan ? 'plan' : i === next ? 'next' : null,
      isLast: i === deps.length - 1,
      gone: toMinutes(d.depart) < ready,
      late: i === next && missed ? missed.lateMinutes : null,
    };
  });
}

/** 班次表打開時捲到的那格：規劃那列（沒有規劃用第一班搭得到的）的前一列第一格；cols 是一列幾格 */
export function firstCellIndex(cells: DepartureCell[], cols: number): number {
  let i = cells.findIndex((c) => c.mark === 'plan');
  if (i < 0) i = cells.findIndex((c) => !c.gone);
  if (i < 0) return 0;
  return Math.max(0, (Math.floor(i / cols) - 1) * cols);
}

/** 編輯器的候選走法列（spec §8.9）：alternatives 少於 2 條回 []；current 是目前用的（第一條） */
export function pathRows(leg: Leg, nameOf: (id: string) => string): { path: PathRef; title: string; sub: string; current: boolean }[] {
  const alts = leg.alternatives ?? [];
  if (alts.length < 2) return [];
  return alts.map((a, i) => {
    const title = a.rides.map((r, j) => (j < a.rides.length - 1 ? `${rideShortName(r)} → ${nameOf(r.to)}` : rideShortName(r))).join(' → ');
    const transfers = Math.max(0, (a.ridesCount ?? a.rides.length) - 1);
    const sub = `${a.arrive} 到・${a.minutes} 分・${transfers === 0 ? '不用轉乘' : `轉乘 ${transfers} 次`}・等 ${a.waitMinutes} 分`;
    return { path: a.path, title, sub, current: i === 0 };
  });
}

/**
 * 選了第 index 條走法後這段的設定（spec §8.9）：第一條是目前用的（有指定 path 時引擎把指定的放第一個），選它不用改，回 undefined；
 * 選別條：改成大眾運輸、存 path，並清掉自己填的分鐘（有分鐘時引擎不看 path）
 */
export function specAfterPickPath(cur: TravelSpec | null, leg: Leg, index: number): TravelSpec | undefined {
  const alt = leg.alternatives?.[index];
  if (!alt || index === 0) return undefined;
  const { minutes: _minutes, ...rest } = cur ?? {};
  return { ...rest, mode: 'transit', path: alt.path };
}
