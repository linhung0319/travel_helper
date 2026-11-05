// 時間軸推算、空檔、衝突與團體檢查。輸入確定的行程和資料，輸出每天的 DayPlan（不存）。

import { resolveConfig, type ConfigOverride, type EngineConfig } from './config.ts';
import { openingOn, type EngineData, type PlaceRecord, type ResolvedPlace } from './data.ts';
import { planLeg, type Endpoint, type LegWarning } from './travel.ts';
import { dayOfWeek, formatDuration as dur, fromMinutes, toMinutes } from './time.ts';
import { lodgingOn, nightMeals, nightOf, type PlaceMeals } from './nights.ts';
import type {
  DayPlan,
  EngineWarning,
  FlightItem,
  FreeItem,
  Gap,
  Itinerary,
  ItineraryItem,
  ItineraryPlan,
  Leg,
  MealKind,
  PartyProfile,
  TimelineEntry,
  VisitItem,
  TagId,
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
  ctx.warnings.push({ ...w, date: ctx.date });
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
  const { leg, warnings } = planLeg(st.loc, target, { date: ctx.date, depart: st.time, party: ctx.party, data: ctx.data, cfg: ctx.cfg }, spec);
  for (const w of warnings) warn(ctx, itemId ? { ...w, itemId, leg: true } : { ...w, leg: true });
  if (leg.mode === 'ferry') ctx.tiring.value = true;
  return leg;
}

// --- 各種項目 ---------------------------------------------------------------

/** 資料卡、自由時間的地點、住宿的檢查 */
function placeChecks(res: ResolvedPlace | null, placeId: string, itemId: string | undefined, ctx: RunContext): void {
  if (!res) {
    warn(ctx, { code: 'place-missing', level: 'act', itemId, placeId, message: `找不到這個地點（${placeId}）` });
    return;
  }
  // 車站不能當資料卡（車站是交通的端點，不是去玩的點）
  if (res.record.type === 'station') warn(ctx, { code: 'station-card', level: 'act', itemId, placeId, message: '車站不能當資料卡' });
  if (res.retired) warn(ctx, { code: 'place-retired', level: 'note', itemId, placeId, message: '這個點已下架，資料可能過時' });
  if (res.origin === 'user') warn(ctx, { code: 'unchecked', level: 'note', itemId, placeId, message: '自己加的點，營業時間未查' });
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

/** 依營業時間調整開始時間（沒指定時間時等開門，交通卡下面的等待那行就是它，不另外提醒），並檢查公休、打烊、最後入場 */
function hoursCheck(rec: PlaceRecord, start: number, stay: number, fixed: boolean, itemId: string, ctx: RunContext): number {
  if (rec.type !== 'spot' && rec.type !== 'restaurant') return start;
  const s = openingOn(rec, ctx.date, ctx.cfg.holidays);
  const placeId = rec.id;
  if (s.kind === 'unknown') {
    const month = Number(ctx.date.slice(5, 7));
    const holiday = s.reason.startsWith('國定假日');
    warn(ctx, { code: 'hours-unknown', level: 'note', itemId, placeId, message: `${holiday ? '國定假日' : `${month} 月`}營業時間未查` });
    return start;
  }
  if (s.kind === 'closed') {
    const weekly = s.reason === '公休';
    warn(ctx, { code: 'closed', level: 'act', itemId, placeId, message: weekly ? `這天公休（週${WEEKDAY_ZH[dayOfWeek(ctx.date)]}）` : `這天休業（${s.reason}）` });
    return start;
  }
  const p = s.periods.find((x) => start < x.close);
  if (!p) {
    warn(ctx, { code: 'after-hours', level: 'act', itemId, placeId, message: `${fromMinutes(start)} 到，${fromMinutes(s.periods[s.periods.length - 1].close)} 打烊` });
    return start;
  }
  let t = start;
  if (t < p.open) {
    if (fixed) warn(ctx, { code: 'before-open', level: 'act', itemId, placeId, message: `${fromMinutes(p.open)} 開門，指定 ${fromMinutes(t)}` });
    else t = p.open;
  }
  if (p.lastEntry != null && t > p.lastEntry) {
    warn(ctx, { code: 'last-entry', level: 'act', itemId, placeId, message: `${fromMinutes(t)} 到，${fromMinutes(p.lastEntry)} 最後入場` });
  } else if (t + stay > p.close) {
    warn(ctx, { code: 'closes-during', level: 'note', itemId, placeId, message: `${fromMinutes(p.close)} 打烊，停留到 ${fromMinutes(t + stay)}` });
  }
  return t;
}

/** 團體檢查（餐廳）與長輩、小孩檢查（景點） */
function groupChecks(rec: PlaceRecord, itemId: string, ctx: RunContext, tags: readonly TagId[] = []): void {
  const { party } = ctx;
  const placeId = rec.id;
  if (rec.type === 'restaurant') {
    const g = rec.group ?? {};
    const res = rec.reservation?.accepted ?? 'unknown';
    // 標了「分組」（大家分開在附近吃）只免全員的座位和預約；一組 4～6 人也坐不下照樣提醒
    if (!tags.includes('groups')) {
      const msg = groupDiningMessage(party.size, g.fit15 === 'yes' || !!g.confirmed15 ? 'yes' : (g.fit15 ?? 'unknown'), res);
      if (msg) warn(ctx, { code: 'group-dining', level: msg.act ? 'act' : 'note', itemId, placeId, message: msg.text });
    } else if (g.fitSubgroup === 'no') {
      warn(ctx, { code: 'group-dining', level: 'act', itemId, placeId, message: '一組 4～6 人也坐不下' });
    }
    const allowed = rec.kids?.allowed;
    if (party.kids > 0 && (allowed === 'no' || allowed === 'age-limit')) {
      warn(ctx, {
        code: 'kids-not-allowed',
        level: 'act',
        itemId,
        placeId,
        message: allowed === 'no' ? '不收小孩' : rec.kids?.minAge ? `限 ${rec.kids.minAge} 歲以上` : '小孩有年齡限制',
      });
    }
    return;
  }
  if (rec.type === 'spot') {
    const acc = rec.accessibility ?? {};
    if (acc.stairs === '多' && party.elders > 0) {
      warn(ctx, { code: 'stairs', level: 'note', itemId, placeId, message: '階梯多，長輩吃力' });
    }
    if (acc.stairs === '多' || (acc.walkInsideMinutes ?? 0) >= ctx.cfg.day.tiringWalkInside) ctx.tiring.value = true;
  }
}

/**
 * 餐廳 15 人的一條（§34.1 合併）：坐不下壓過一切；其他把預約放前面（那是要行動的）、座位接後面。
 * 可預約又坐得下回傳 null。坐不下、不接受預約是要處理（act）
 */
export function groupDiningMessage(size: number, fit: string, reservation: string): { text: string; act: boolean } | null {
  if (fit === 'no') return { text: `${size} 人坐不下`, act: true };
  const resv = reservation === 'no' ? '不接受預約' : reservation === 'yes' ? null : '能不能預約不確定';
  const seat = fit === 'yes' ? null : fit === 'split' ? 'split' : 'unknown';
  const act = reservation === 'no';
  if (!resv && !seat) return null;
  if (resv && seat) {
    if (reservation !== 'no' && seat === 'unknown') return { text: `預約、${size} 人座位都不確定，先打電話`, act };
    return { text: `${resv}，${size} 人${seat === 'split' ? '要分桌' : '坐不坐得下也不確定'}`, act };
  }
  if (resv) return { text: act ? resv : `${resv}，先打電話`, act };
  return { text: `${size} 人${seat === 'split' ? '要分桌' : '坐不坐得下不確定'}，先打電話`, act };
}

const MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack'] as const satisfies readonly TagId[];

/** 這張卡算哪一餐：只有一個用餐標籤就用它；好幾個時有猜的那餐就用猜的，沒有就用最早的；沒標用猜的 */
export function pickMeal(tags: readonly TagId[] | undefined, guessed: MealKind | null): MealKind | null {
  const meals = MEAL_TAGS.filter((m) => tags?.includes(m));
  if (!meals.length) return guessed;
  if (meals.length === 1) return meals[0];
  return guessed && meals.includes(guessed) ? guessed : meals[0];
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
      warn(ctx, { code: 'late', level: 'act', itemId: item.id, placeId: opt.place, message: `${fromMinutes(arrive)} 到，指定 ${item.start}` });
    }
    start = Math.max(arrive, fixed);
  }
  const rec = res?.origin === 'base' ? res.record : null;
  if (rec) start = hoursCheck(rec, start, stay, !!item.start, item.id, ctx);
  const guessed: MealKind | null = rec?.type === 'restaurant' ? (inWindow(start, ctx.cfg.meals.lunch) ? 'lunch' : inWindow(start, ctx.cfg.meals.dinner) ? 'dinner' : 'snack') : null;
  const meal = pickMeal(item.tags, guessed);
  if (rec) groupChecks(rec, item.id, ctx, item.tags);
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
    mealTags: MEAL_TAGS.filter((m) => item.tags?.includes(m)),
    ...(item.tags?.includes('rest') ? { rest: true } : {}),
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
    if (arrive > fixed) warn(ctx, { code: 'late', level: 'act', itemId: item.id, message: `${fromMinutes(arrive)} 到，指定 ${item.start}` });
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
    warn(ctx, { code: 'flight-late', level: 'act', itemId: item.id, placeId: item.airport, message: `${fromMinutes(arrive)} 到機場，${fromMinutes(deadline)} 前要到` });
  }
  st.loc = target;
  st.started = true;
  st.time = Math.max(arrive, st.time);
  return { kind: 'flight', itemId: item.id, placeId: item.airport, travel: leg, arrive: fromMinutes(arrive), start: item.depart, end: item.depart, waitMinutes: 0 };
}

function runItems(items: readonly ItineraryItem[], st: State, ctx: RunContext): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const item of items) {
    if (item.type === 'visit') out.push(runVisit(item, st, ctx));
    else if (item.type === 'free') out.push(runFree(item, st, ctx));
    else out.push(runFlight(item, st, ctx));
  }
  return out;
}

// --- 一天 -------------------------------------------------------------------

export function planDay(it: Itinerary, index: number, data: EngineData, cfg: EngineConfig): DayPlan {
  const day = it.days[index];
  const isFirst = day.date === cfg.trip.from;
  const isLast = day.date === cfg.trip.to;
  const warnings: EngineWarning[] = [];
  const tiring = { value: false };
  const ctx: RunContext = { date: day.date, data, cfg, party: it.party, warnings, tiring };
  const startId = day.start ?? (index > 0 ? lodgingOn(it, it.days[index - 1].date) : null);
  const lodging = isLast ? null : lodgingOn(it, day.date);
  const st: State = { loc: startId ? endpointOf(startId, data) : null, time: toMinutes(cfg.day.start), started: !!startId };
  const entries: TimelineEntry[] = [];
  if (startId) {
    const t = cfg.day.start;
    entries.push({ kind: 'start', itemId: null, placeId: startId, travel: null, arrive: t, start: t, end: t, waitMinutes: 0 });
  }
  entries.push(...runItems(day.items, st, ctx));

  let returnTime: string | null = null;
  const meals = nightMeals(it, day.date, (id) => data.getPlace(id)?.record.meals as PlaceMeals);
  if (lodging) {
    placeChecks(data.getPlace(lodging), lodging, undefined, ctx);
    const area = nightOf(it, day.date)?.area;
    const lodgingArea = data.getPlace(lodging)?.record.area;
    if (area && lodgingArea && area !== lodgingArea) {
      warnings.push({ code: 'lodging-area-mismatch', level: 'act', date: day.date, placeId: lodging, message: `不在這晚選的${data.areaNames?.[area] ?? '區'}` });
    }
    const target = endpointOf(lodging, data);
    const leg = travelTo(target, st, ctx, day.returnTravel, undefined);
    const arrive = leg ? toMinutes(leg.arrive) : st.time;
    returnTime = fromMinutes(arrive);
    entries.push({ kind: 'lodging', itemId: null, placeId: lodging, travel: leg, arrive: returnTime, start: returnTime, end: returnTime, waitMinutes: 0 });
    if (meals === 'dinner+breakfast' && arrive > toMinutes(cfg.day.dinnerLodgingArriveBy)) {
      warnings.push({ code: 'late-return', level: 'note', date: day.date, placeId: lodging, message: `${returnTime} 回住宿，晚餐 ${cfg.day.dinnerLodgingArriveBy} 前要到` });
    } else if (arrive > toMinutes(cfg.day.returnLatest) && !isFirst) {
      warnings.push({ code: 'late-return', level: 'note', date: day.date, placeId: lodging, message: `${returnTime} 回住宿，2 月 ${cfg.day.returnLatest} 天黑` });
    }
  }

  // 統計
  const walk = entries.reduce((s, e) => s + (e.travel?.walkMinutes ?? 0), 0);
  const visitRecs = entries
    .filter((e) => e.kind === 'visit' && e.placeId)
    .map((e) => ({ e, rec: data.getPlace(e.placeId as string)?.record ?? null }));
  const mainSpots = entries.filter((e) => {
    if (e.kind !== 'visit' || !e.placeId) return false;
    const r = data.getPlace(e.placeId)?.record;
    return r?.type === 'spot' && toMinutes(e.end) - toMinutes(e.start) >= 60;
  }).length;
  const freeMinutes = entries.filter((e) => e.kind === 'free').reduce((s, e) => s + toMinutes(e.end) - toMinutes(e.start), 0);

  if (walk > cfg.walk.dailyMaxWhole) {
    warnings.push({ code: 'daily-walk', level: 'note', date: day.date, message: `這天步行 ${dur(walk)}，長輩會累` });
  }
  if (mainSpots > cfg.day.maxMainSpots) {
    warnings.push({ code: 'too-full', level: 'note', date: day.date, message: `景點 ${mainSpots} 個，一起走 ${cfg.day.maxMainSpots} 個就夠` });
  }
  if ((isFirst || isLast) && visitRecs.some((x) => x.rec?.type === 'spot')) {
    warnings.push({ code: 'travel-day-spot', level: 'note', date: day.date, message: isFirst ? '這天下午才到，景點來不及' : '這天要趕飛機，景點來不及' });
  }
  const regions = visitRecs.map((x) => x.rec?.region as string | undefined);
  if (regions.length && data.regionNeedsCar && regions.every((r) => r && data.regionNeedsCar?.[r])) {
    warnings.push({ code: 'charter-suggested', level: 'note', date: day.date, message: '這一帶巴士少，適合包車' });
  }
  if (it.party.elders > 0 || it.party.kids > 0) {
    let since: number | null = null;
    for (const e of entries) {
      const rest = e.kind === 'start' || e.kind === 'free' || e.kind === 'lodging' || e.kind === 'flight' || e.meal != null || e.rest === true;
      // 坐車 restRideMinutes 分以上也算休息（坐 4 小時特急不算「沒休息」）：從下車那一刻重算
      if (e.travel && e.travel.minutes >= cfg.day.restRideMinutes) since = toMinutes(e.arrive);
      if (since == null) since = toMinutes(e.start);
      if (toMinutes(e.end) - since > cfg.day.maxMinutesWithoutRest && !rest) {
        warnings.push({ code: 'no-rest', level: 'note', date: day.date, itemId: e.itemId ?? undefined, message: `${dur(toMinutes(e.end) - since)}沒有用餐休息，長輩小孩會累` });
        break;
      }
      if (rest) since = toMinutes(e.end);
    }
  }

  return {
    date: day.date,
    entries,
    gaps: findGaps(day, !!lodging, entries, isLast, cfg),
    warnings: [...warnings],
    stats: { walkMinutes: walk, mainSpots, returnTime, tiring: tiring.value, freeMinutes },
  };
}

// --- 空檔 -------------------------------------------------------------------

function findGaps(day: Itinerary['days'][number], hasLodging: boolean, entries: TimelineEntry[], isLast: boolean, cfg: EngineConfig): Gap[] {
  const gaps: Gap[] = [];
  const timed = entries.filter((e) => e.kind !== 'start');
  if (!isLast && !hasLodging) {
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

/**
 * 只重算有改的那一天（T29b spec §7.3）：一天的結果只看那天的內容、這晚（nights）、前一天的住宿（那天沒設 start 時當起點）、party、資料和設定。
 * 每天的鑰匙是這幾樣轉成字串（行程的操作會深拷貝整份，不能比物件），一樣就沿用上次的 DayPlan。
 * 資料（EngineData）或設定換了物件就整個作廢：網站在資料點、道路快取變了時才換 EngineData
 */
export interface PlanCache {
  data: EngineData | null;
  cfg: EngineConfig | null;
  days: Map<string, DayPlan>;
}

export function createPlanCache(): PlanCache {
  return { data: null, cfg: null, days: new Map() };
}

function dayKey(it: Itinerary, index: number): string {
  const day = it.days[index];
  const prev = day.start == null && index > 0 ? lodgingOn(it, it.days[index - 1].date) : null;
  return JSON.stringify([day, it.nights?.[day.date] ?? null, prev, index === it.days.length - 1, it.party]);
}

export function planItinerary(it: Itinerary, data: EngineData, override: ConfigOverride | EngineConfig = {}, cache?: PlanCache): ItineraryPlan {
  const cfg = 'trip' in override && 'walk' in override && 'holidays' in override ? (override as EngineConfig) : resolveConfig(override as ConfigOverride);
  let days: DayPlan[];
  if (cache) {
    const old = cache.data === data && cache.cfg === cfg ? cache.days : new Map<string, DayPlan>();
    // 只留這次用到的，舊的不累積
    const now = new Map<string, DayPlan>();
    days = it.days.map((_, i) => {
      const key = dayKey(it, i);
      const day = old.get(key) ?? now.get(key) ?? planDay(it, i, data, cfg);
      now.set(key, day);
      return day;
    });
    Object.assign(cache, { data, cfg, days: now });
  } else {
    days = it.days.map((_, i) => planDay(it, i, data, cfg));
  }
  // 連兩天累不發訊息：整趟骨架直接看每天的 stats.tiring（§34.1 搬家）
  const warnings: EngineWarning[] = [];
  const middle = days.filter((d) => d.date !== cfg.trip.from && d.date !== cfg.trip.to);
  const planned = middle.filter((d) => d.entries.some((e) => e.kind === 'visit'));
  const halfFree = middle.some(
    (d) => d.stats.freeMinutes >= cfg.day.halfDayFreeMinutes || (d.stats.returnTime != null && toMinutes(d.stats.returnTime) <= 13 * 60) || !d.entries.some((e) => e.kind === 'visit'),
  );
  if (planned.length >= 3 && !halfFree) {
    warnings.push({ code: 'no-free-time', level: 'note', message: `${planned.length} 天都排滿，建議留半天休息` });
  }
  return { days, warnings };
}
