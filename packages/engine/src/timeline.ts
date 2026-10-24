// 時間軸推算、空檔、衝突與團體檢查。輸入確定的行程和資料，輸出每天的 DayPlan（不存）。

import { resolveConfig, type ConfigOverride, type EngineConfig } from './config.ts';
import { openingOn, type EngineData, type PlaceRecord, type ResolvedPlace } from './data.ts';
import { planLeg, type Endpoint, type LegWarning } from './travel.ts';
import { fromMinutes, toMinutes } from './time.ts';
import type {
  DayPlan,
  EngineWarning,
  FlightItem,
  FreeItem,
  Gap,
  GroupItem,
  Itinerary,
  ItineraryItem,
  ItineraryPlan,
  Leg,
  LodgingMeals,
  MealKind,
  PartyProfile,
  SplitItem,
  TimelineEntry,
  VisitItem,
} from './types.ts';

interface State {
  loc: Endpoint | null;
  time: number;
  /** 還沒有任何東西決定時間（例如第一天在航班之前） */
  started: boolean;
}

interface RunContext {
  date: string;
  data: EngineData;
  cfg: EngineConfig;
  party: PartyProfile;
  whole: boolean;
  groupId: string | null;
  warnings: EngineWarning[];
  /** 這段裡有沒有「累」的項目 */
  tiring: { value: boolean };
}

const NO_PLACE: Endpoint = { id: null, coords: null, record: null };

function endpointOf(id: string | null | undefined, data: EngineData): Endpoint {
  if (!id) return NO_PLACE;
  const r = data.getPlace(id);
  return { id, coords: (r?.record.coords as Endpoint['coords']) ?? null, record: r?.record ?? null };
}

function warn(ctx: RunContext, w: LegWarning): void {
  ctx.warnings.push({ ...w, date: ctx.date, ...(ctx.groupId ? { groupId: ctx.groupId } : {}) });
}

/** 停留時間的預設：資料的 stayMinutes → 餐廳依料理種類（§5.5）→ 各類型的預設 */
export function defaultStay(res: ResolvedPlace | null, cfg: EngineConfig): number {
  if (!res) return cfg.stay.spot;
  const r = res.record;
  if (res.origin === 'user') return r.stayMinutes ?? cfg.stay.userPlace;
  if (r.stayMinutes != null) return r.stayMinutes;
  switch (r.type) {
    case 'restaurant': {
      const c = (r.cuisine ?? []).find((x) => cfg.meals.stayByCuisine[x] != null);
      return c ? cfg.meals.stayByCuisine[c] : cfg.meals.defaultStay;
    }
    case 'lodging':
      return cfg.stay.lodging;
    case 'station':
      return cfg.stay.station;
    default:
      return cfg.stay.spot;
  }
}

const inWindow = (t: number, [a, b]: [string, string]) => t >= toMinutes(a) && t < toMinutes(b);

function travelTo(target: Endpoint, st: State, ctx: RunContext, spec: VisitItem['travel'], itemId: string | undefined): Leg | null {
  if (!st.loc || !st.started) return null;
  const { leg, warnings } = planLeg(st.loc, target, { date: ctx.date, depart: st.time, party: ctx.party, whole: ctx.whole, data: ctx.data, cfg: ctx.cfg }, spec);
  for (const w of warnings) warn(ctx, itemId ? { ...w, itemId } : w);
  if (leg.mode === 'ferry') ctx.tiring.value = true;
  return leg;
}

// --- 各種項目 ---------------------------------------------------------------

function placeChecks(res: ResolvedPlace | null, placeId: string, itemId: string | undefined, ctx: RunContext): void {
  if (!res) {
    warn(ctx, { code: 'place-missing', level: 'error', itemId, placeId, message: `找不到地點「${placeId}」` });
    return;
  }
  if (res.retired) warn(ctx, { code: 'place-retired', level: 'warning', itemId, placeId, message: '這個點已下架，資料可能過時' });
  if (res.origin === 'user') warn(ctx, { code: 'unchecked', level: 'info', itemId, placeId, message: '使用者加的點：營業時間、團體條件未查' });
}

/** 依營業時間調整開始時間（沒指定時間時等開門），並檢查公休、打烊、最後入場 */
function hoursCheck(rec: PlaceRecord, start: number, stay: number, fixed: boolean, itemId: string, ctx: RunContext): number {
  if (rec.type !== 'spot' && rec.type !== 'restaurant') return start;
  const s = openingOn(rec, ctx.date, ctx.cfg.holidays);
  const placeId = rec.id;
  if (s.kind === 'unknown') {
    warn(ctx, { code: 'hours-unknown', level: 'info', itemId, placeId, message: s.reason });
    return start;
  }
  if (s.kind === 'closed') {
    warn(ctx, { code: 'closed', level: 'error', itemId, placeId, message: `這天休息（${s.reason}）` });
    return start;
  }
  const p = s.periods.find((x) => start < x.close);
  if (!p) {
    warn(ctx, { code: 'after-hours', level: 'error', itemId, placeId, message: `${fromMinutes(start)} 已經打烊（營業到 ${fromMinutes(s.periods[s.periods.length - 1].close)}）` });
    return start;
  }
  let t = start;
  if (t < p.open) {
    if (fixed) warn(ctx, { code: 'before-open', level: 'error', itemId, placeId, message: `指定的 ${fromMinutes(t)} 還沒開門（${fromMinutes(p.open)} 開）` });
    else {
      warn(ctx, { code: 'wait-open', level: 'info', itemId, placeId, message: `等開門 ${p.open - t} 分（${fromMinutes(p.open)} 開）` });
      t = p.open;
    }
  }
  if (p.lastEntry != null && t > p.lastEntry) {
    warn(ctx, { code: 'last-entry', level: 'error', itemId, placeId, message: `${fromMinutes(t)} 才到，超過最後入場／L.O. ${fromMinutes(p.lastEntry)}` });
  } else if (t + stay > p.close) {
    warn(ctx, { code: 'closes-during', level: 'warning', itemId, placeId, message: `停留到 ${fromMinutes(t + stay)}，但 ${fromMinutes(p.close)} 打烊` });
  }
  return t;
}

/** 團體檢查（餐廳）與長輩、小孩檢查（景點） */
function groupChecks(rec: PlaceRecord, itemId: string, ctx: RunContext): void {
  const { party } = ctx;
  const placeId = rec.id;
  if (rec.type === 'restaurant') {
    const g = rec.group ?? {};
    const res = rec.reservation?.accepted ?? 'unknown';
    if (ctx.whole) {
      const ok = g.fit15 === 'yes' || !!g.confirmed15;
      if (!ok) {
        const why = g.fit15 === 'split' ? '要分桌或分批' : g.fit15 === 'no' ? '坐不下' : '不確定坐不坐得下';
        warn(ctx, { code: 'group-seats', level: g.fit15 === 'no' ? 'error' : 'warning', itemId, placeId, message: `全員 ${party.size} 人：${why}（fit15: ${g.fit15 ?? 'null'}），要先打電話確認` });
      }
      if (res === 'no') warn(ctx, { code: 'no-reservation', level: 'error', itemId, placeId, message: '全員用餐一定要預約，這家不接受預約（§5.6）' });
      else if (res === 'unknown') warn(ctx, { code: 'no-reservation', level: 'warning', itemId, placeId, message: '全員用餐要預約，這家能不能預約不確定' });
    } else if (g.fitSubgroup === 'no') {
      warn(ctx, { code: 'group-seats', level: 'error', itemId, placeId, message: `這組 ${party.size} 人坐不下` });
    }
    const allowed = rec.kids?.allowed;
    if (party.kids > 0 && (allowed === 'no' || allowed === 'age-limit')) {
      warn(ctx, {
        code: 'kids-not-allowed',
        level: 'error',
        itemId,
        placeId,
        message: allowed === 'no' ? '這家不接受小孩' : `這家有年齡限制${rec.kids?.minAge ? `（${rec.kids.minAge} 歲以上）` : ''}`,
      });
    }
    return;
  }
  if (rec.type === 'spot') {
    const acc = rec.accessibility ?? {};
    if (acc.stairs === '多' && party.elders > 0) {
      warn(ctx, { code: 'stairs', level: 'warning', itemId, placeId, message: '階梯多，長輩要考慮（可以分組，讓能走的人去）' });
    }
    if (acc.stairs === '多' || (acc.walkInsideMinutes ?? 0) >= ctx.cfg.day.tiringWalkInside) ctx.tiring.value = true;
  }
}

function runVisit(item: VisitItem, st: State, ctx: RunContext): TimelineEntry {
  const opt = item.options[item.selected] ?? item.options[0];
  if (!opt) throw new Error(`項目 ${item.id} 沒有選項`);
  const res = ctx.data.getPlace(opt.place);
  placeChecks(res, opt.place, item.id, ctx);
  const target = endpointOf(opt.place, ctx.data);
  const leg = travelTo(target, st, ctx, item.travel, item.id);
  const arrive = leg ? toMinutes(leg.arrive) : st.started ? st.time : item.start ? toMinutes(item.start) : st.time;
  const stay = opt.stayMinutes ?? defaultStay(res, ctx.cfg);
  let start = arrive;
  if (item.start) {
    const fixed = toMinutes(item.start);
    if (arrive > fixed) {
      warn(ctx, { code: 'late', level: 'error', itemId: item.id, placeId: opt.place, message: `趕不上指定的 ${item.start}（${fromMinutes(arrive)} 才到）` });
    }
    start = Math.max(arrive, fixed);
  }
  const rec = res?.origin === 'base' ? res.record : null;
  if (rec) start = hoursCheck(rec, start, stay, !!item.start, item.id, ctx);
  let meal: MealKind | null = item.meal ?? null;
  if (!meal && rec?.type === 'restaurant') {
    meal = inWindow(start, ctx.cfg.meals.lunch) ? 'lunch' : inWindow(start, ctx.cfg.meals.dinner) ? 'dinner' : 'snack';
  }
  if (rec) groupChecks(rec, item.id, ctx);
  const end = start + stay;
  st.loc = target;
  st.time = end;
  st.started = true;
  return {
    kind: 'visit',
    itemId: item.id,
    placeId: opt.place,
    travel: leg,
    arrive: fromMinutes(arrive),
    start: fromMinutes(start),
    end: fromMinutes(end),
    waitMinutes: start - arrive,
    meal,
    mealTag: item.meal ?? null,
    groupId: ctx.groupId,
  };
}

function runFree(item: FreeItem, st: State, ctx: RunContext): TimelineEntry {
  let leg: Leg | null = null;
  if (item.place) {
    placeChecks(ctx.data.getPlace(item.place), item.place, item.id, ctx);
    const target = endpointOf(item.place, ctx.data);
    leg = travelTo(target, st, ctx, item.travel, item.id);
    st.loc = target;
  }
  const arrive = leg ? toMinutes(leg.arrive) : st.time;
  let start = arrive;
  if (item.start) {
    const fixed = toMinutes(item.start);
    if (arrive > fixed) warn(ctx, { code: 'late', level: 'error', itemId: item.id, message: `趕不上指定的 ${item.start}（${fromMinutes(arrive)} 才到）` });
    start = Math.max(arrive, fixed);
  }
  const end = start + item.minutes;
  st.time = end;
  st.started = true;
  return {
    kind: 'free',
    itemId: item.id,
    placeId: item.place ?? st.loc?.id ?? null,
    travel: leg,
    arrive: fromMinutes(arrive),
    start: fromMinutes(start),
    end: fromMinutes(end),
    waitMinutes: start - arrive,
    groupId: ctx.groupId,
  };
}

function runFlight(item: FlightItem, st: State, ctx: RunContext): TimelineEntry {
  const target = endpointOf(item.airport, ctx.data);
  if (item.direction === 'arrive') {
    const arr = toMinutes(item.arrive);
    const end = arr + ctx.cfg.flight.arrivalClearMinutes;
    st.time = st.started ? Math.max(st.time, end) : end;
    st.started = true;
    st.loc = target;
    return { kind: 'flight', itemId: item.id, placeId: item.airport, travel: null, arrive: item.arrive, start: item.arrive, end: fromMinutes(end), waitMinutes: 0 };
  }
  const leg = travelTo(target, st, ctx, item.travel, item.id);
  const arrive = leg ? toMinutes(leg.arrive) : st.time;
  const deadline = toMinutes(item.depart) - ctx.cfg.flight.departAtAirportBefore;
  if (arrive > deadline) {
    warn(ctx, { code: 'flight-late', level: 'error', itemId: item.id, placeId: item.airport, message: `${fromMinutes(arrive)} 才到機場，起飛前 ${ctx.cfg.flight.departAtAirportBefore} 分（${fromMinutes(deadline)}）要到` });
  }
  st.loc = target;
  st.started = true;
  st.time = Math.max(arrive, st.time);
  return { kind: 'flight', itemId: item.id, placeId: item.airport, travel: leg, arrive: fromMinutes(arrive), start: item.depart, end: item.depart, waitMinutes: 0 };
}

function runItems(items: readonly (ItineraryItem | GroupItem)[], st: State, ctx: RunContext): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const item of items) {
    if (item.type === 'visit') out.push(runVisit(item, st, ctx));
    else if (item.type === 'free') out.push(runFree(item, st, ctx));
    else if (item.type === 'flight') out.push(runFlight(item, st, ctx));
    else out.push(runSplit(item, st, ctx));
  }
  return out;
}

function runSplit(item: SplitItem, st: State, ctx: RunContext): TimelineEntry {
  const total = item.groups.reduce((s, g) => s + g.size, 0);
  if (total !== ctx.party.size) {
    warn(ctx, { code: 'split-size', level: 'warning', itemId: item.id, message: `各組加起來 ${total} 人，全員是 ${ctx.party.size} 人` });
  }
  const meet = endpointOf(item.meet.place, ctx.data);
  placeChecks(ctx.data.getPlace(item.meet.place), item.meet.place, item.id, ctx);
  const meetTime = toMinutes(item.meet.time);
  let latest = st.time;
  const groups = item.groups.map((g) => {
    const gst: State = { ...st };
    const gctx: RunContext = { ...ctx, party: g, whole: false, groupId: g.id };
    const entries = runItems(g.items, gst, gctx);
    const leg = travelTo(meet, gst, gctx, null, item.id);
    const arrive = leg ? toMinutes(leg.arrive) : gst.time;
    if (arrive > meetTime) {
      warn(gctx, { code: 'meet-late', level: 'error', itemId: item.id, placeId: item.meet.place, message: `${g.name} ${fromMinutes(arrive)} 才到會合點，約的是 ${item.meet.time}` });
    }
    latest = Math.max(latest, arrive);
    const t = fromMinutes(arrive);
    entries.push({ kind: 'meet', itemId: item.id, placeId: item.meet.place, travel: leg, arrive: t, start: t, end: t, waitMinutes: 0, groupId: g.id });
    return { id: g.id, name: g.name, entries };
  });
  const start = Math.max(meetTime, latest);
  st.loc = meet;
  st.time = start;
  st.started = true;
  return {
    kind: 'meet',
    itemId: item.id,
    placeId: item.meet.place,
    travel: null,
    arrive: fromMinutes(latest),
    start: fromMinutes(start),
    end: fromMinutes(start),
    waitMinutes: start - latest,
    groups,
  };
}

// --- 一天 -------------------------------------------------------------------

function lodgingMeals(day: Itinerary['days'][number], data: EngineData): LodgingMeals | 'varies' | null {
  if (day.lodgingMeals) return day.lodgingMeals;
  const m = day.lodging ? data.getPlace(day.lodging)?.record.meals : null;
  return (m as LodgingMeals | 'varies' | null | undefined) ?? null;
}

function allEntries(entries: TimelineEntry[]): TimelineEntry[] {
  return entries.flatMap((e) => [e, ...(e.groups?.flatMap((g) => g.entries) ?? [])]);
}

export function planDay(it: Itinerary, index: number, data: EngineData, cfg: EngineConfig): DayPlan {
  const day = it.days[index];
  const isFirst = day.date === cfg.trip.from;
  const isLast = day.date === cfg.trip.to;
  const warnings: EngineWarning[] = [];
  const tiring = { value: false };
  const ctx: RunContext = { date: day.date, data, cfg, party: it.party, whole: true, groupId: null, warnings, tiring };
  const startId = day.start ?? (index > 0 ? it.days[index - 1].lodging : null);
  const st: State = { loc: startId ? endpointOf(startId, data) : null, time: toMinutes(cfg.day.start), started: !!startId };
  const entries: TimelineEntry[] = [];
  if (startId) {
    const t = cfg.day.start;
    entries.push({ kind: 'start', itemId: null, placeId: startId, travel: null, arrive: t, start: t, end: t, waitMinutes: 0 });
  }
  entries.push(...runItems(day.items, st, ctx));

  let returnTime: string | null = null;
  const meals = lodgingMeals(day, data);
  if (day.lodging && !isLast) {
    placeChecks(data.getPlace(day.lodging), day.lodging, undefined, ctx);
    const target = endpointOf(day.lodging, data);
    const leg = travelTo(target, st, ctx, day.returnTravel, undefined);
    const arrive = leg ? toMinutes(leg.arrive) : st.time;
    returnTime = fromMinutes(arrive);
    entries.push({ kind: 'lodging', itemId: null, placeId: day.lodging, travel: leg, arrive: returnTime, start: returnTime, end: returnTime, waitMinutes: 0 });
    if (meals === 'dinner+breakfast' && arrive > toMinutes(cfg.day.dinnerLodgingArriveBy)) {
      warnings.push({ code: 'late-return', level: 'warning', date: day.date, placeId: day.lodging, message: `一泊二食 ${cfg.day.dinnerLodgingArriveBy} 前要到住宿，現在 ${returnTime} 才到` });
    } else if (arrive > toMinutes(cfg.day.returnLatest) && !isFirst) {
      warnings.push({ code: 'late-return', level: 'warning', date: day.date, placeId: day.lodging, message: `${returnTime} 才回到住宿；2 月天黑早，建議 ${cfg.day.returnBy}～${cfg.day.returnLatest} 回到住宿` });
    }
    if (meals === 'varies') {
      warnings.push({ code: 'lodging-meals-unknown', level: 'info', date: day.date, placeId: day.lodging, message: '這間住宿有含晚餐和不含晚餐的方案，請填 lodgingMeals' });
    }
    const rec = data.getPlace(day.lodging)?.record;
    if (rec?.checkIn && arrive < toMinutes(rec.checkIn)) {
      warnings.push({ code: 'before-checkin', level: 'info', date: day.date, placeId: day.lodging, message: `${returnTime} 到，還不能入住（${rec.checkIn} 起），可以先寄放行李` });
    }
  }

  // 統計
  const whole = entries;
  const walk = whole.reduce((s, e) => s + (e.travel?.walkMinutes ?? 0), 0);
  const visitRecs = allEntries(entries)
    .filter((e) => e.kind === 'visit' && e.placeId)
    .map((e) => ({ e, rec: data.getPlace(e.placeId as string)?.record ?? null }));
  const mainSpots = whole.filter((e) => {
    if (e.kind !== 'visit' || !e.placeId) return false;
    const r = data.getPlace(e.placeId)?.record;
    return r?.type === 'spot' && toMinutes(e.end) - toMinutes(e.start) >= 60;
  }).length;
  const freeMinutes = allEntries(entries).filter((e) => e.kind === 'free' && !e.groupId).reduce((s, e) => s + toMinutes(e.end) - toMinutes(e.start), 0);

  if (walk > cfg.walk.dailyMaxWhole) {
    warnings.push({ code: 'daily-walk', level: 'warning', date: day.date, message: `全員步行累計 ${walk} 分，超過 ${cfg.walk.dailyMaxWhole} 分` });
  }
  if (mainSpots > cfg.day.maxMainSpots) {
    warnings.push({ code: 'too-full', level: 'warning', date: day.date, message: `主要景點 ${mainSpots} 個，全員日建議 ${cfg.day.maxMainSpots} 個＋午餐` });
  }
  if ((isFirst || isLast) && visitRecs.some((x) => x.rec?.type === 'spot')) {
    warnings.push({ code: 'travel-day-spot', level: 'warning', date: day.date, message: `${isFirst ? '到達日' : '最後一天'}不排景點（§5.5）` });
  }
  const regions = visitRecs.map((x) => x.rec?.region as string | undefined);
  if (regions.length && data.regionNeedsCar && regions.every((r) => r && data.regionNeedsCar?.[r])) {
    warnings.push({ code: 'charter-suggested', level: 'info', date: day.date, message: '這天都在巴士稀少的子地區，建議包車（§5.4 ③）' });
  }
  if (it.party.elders > 0 || it.party.kids > 0) {
    let since: number | null = null;
    for (const e of whole) {
      const rest = e.kind === 'start' || e.kind === 'free' || e.kind === 'lodging' || e.kind === 'flight' || e.meal != null;
      if (since == null) since = toMinutes(e.start);
      if (toMinutes(e.end) - since > cfg.day.maxMinutesWithoutRest && !rest) {
        warnings.push({ code: 'no-rest', level: 'warning', date: day.date, itemId: e.itemId ?? undefined, message: `連續 ${toMinutes(e.end) - since} 分沒有休息（用餐、喝咖啡、自由時間），長輩、小孩會累` });
        break;
      }
      if (rest) since = toMinutes(e.end);
    }
  }

  return {
    date: day.date,
    entries,
    gaps: findGaps(day, entries, isLast, cfg),
    warnings: [...warnings],
    stats: { walkMinutes: walk, mainSpots, returnTime, tiring: tiring.value, freeMinutes },
  };
}

// --- 空檔 -------------------------------------------------------------------

function findGaps(day: Itinerary['days'][number], entries: TimelineEntry[], isLast: boolean, cfg: EngineConfig): Gap[] {
  const gaps: Gap[] = [];
  const timed = entries.filter((e) => e.kind !== 'start');
  if (!isLast && !day.lodging) {
    gaps.push({ kind: 'lodging', date: day.date, label: '住宿（未排）', from: null, to: null, afterItemId: timed[timed.length - 1]?.itemId ?? null, beforeItemId: null });
  }
  for (let i = 0; i < timed.length; i++) {
    const e = timed[i];
    if (e.waitMinutes >= cfg.day.idleGapMinutes) {
      gaps.push({
        kind: 'idle',
        date: day.date,
        label: `空檔 ${e.waitMinutes} 分`,
        from: e.arrive,
        to: e.start,
        afterItemId: timed[i - 1]?.itemId ?? null,
        beforeItemId: e.itemId,
      });
    }
  }
  return gaps;
}

// --- 整趟 -------------------------------------------------------------------

export function planItinerary(it: Itinerary, data: EngineData, override: ConfigOverride | EngineConfig = {}): ItineraryPlan {
  const cfg = 'trip' in override && 'walk' in override && 'holidays' in override ? (override as EngineConfig) : resolveConfig(override as ConfigOverride);
  const days = it.days.map((_, i) => planDay(it, i, data, cfg));
  const warnings: EngineWarning[] = [];
  for (let i = 1; i < days.length; i++) {
    if (days[i].stats.tiring && days[i - 1].stats.tiring) {
      warnings.push({ code: 'tiring-streak', level: 'warning', date: days[i].date, message: `${days[i - 1].date}、${days[i].date} 連續兩天都是累的行程（長階梯、景點內步行久、或船程）` });
    }
  }
  const middle = days.filter((d) => d.date !== cfg.trip.from && d.date !== cfg.trip.to);
  const planned = middle.filter((d) => d.entries.some((e) => e.kind === 'visit'));
  const halfFree = middle.some(
    (d) => d.stats.freeMinutes >= cfg.day.halfDayFreeMinutes || (d.stats.returnTime != null && toMinutes(d.stats.returnTime) <= 13 * 60) || !d.entries.some((e) => e.kind === 'visit'),
  );
  if (planned.length >= 3 && !halfFree) {
    warnings.push({ code: 'no-free-time', level: 'warning', message: `中間的日子沒有半天以上的自由時間（§5.5：至少一個半天）` });
  }
  return { days, warnings };
}
