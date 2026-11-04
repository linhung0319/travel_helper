// 問 AI 的建議問題（規格 §6）：照脈絡晶片的種類；地點的問題沿用 shared/askAiPrompts.ts。
// 空白的新對話的卡片（interaction-design §17.2）：第一張照行程狀態算（firstStarter），開始卡、空的一天的「問 AI」用同一份。

import { lodgingMealsOn, lodgingOn, nightAreaOf } from '@travel-helper/engine';
import type { Itinerary, ItineraryPlan } from '@travel-helper/engine/types';
import type { Vote } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import { isDeletedUserPlace } from '../lib/addPlace/view.ts';
import { tripDates } from '../lib/trip.ts';
import { likedPlaces, placesOnDay } from '../lib/wishlist.ts';
import { askAiPrompts } from '../shared/askAiPrompts.ts';
import type { ChatContext } from './types.ts';

export function promptsFor(c: ChatContext, place?: Place): string[] {
  switch (c.kind) {
    case 'place':
      if (c.itemId) return ['這天排它會不會太趕？', '換一家類似的', '前後怎麼去？'];
      return place ? askAiPrompts(place.type, false) : [];
    case 'day':
      return ['幫我檢查這天', '午餐吃哪裡？', '長輩會不會太累？'];
    case 'trip':
      return ['哪天最趕？', '哪幾晚還沒定住宿？'];
    case 'list':
      return c.source === 'wish' ? ['把還沒排的分到各天', '大家最想去的是？'] : ['挑 3 家最適合全員的', '這些哪幾家適合長輩？'];
  }
}

/** 一張推薦問題的卡片：問題和一行小字（為什麼推薦） */
export interface Starter {
  q: string;
  why: string;
}

/** 算推薦問題要知道的一天 */
export interface StarterDay {
  date: string;
  /** 這晚有住宿 */
  lodging: boolean;
  /** 那晚是一泊二食 */
  dinnerIncluded: boolean;
  /** 確定那晚不含晚餐（方案不確定時不能這樣寫，資料沒有的不猜） */
  dinnerExcluded: boolean;
  /** 排了景點或餐廳 */
  hasStops: boolean;
  /** 排了午餐；行程引擎還沒算好時當作有，不亂推薦 */
  hasLunch: boolean;
  hasDinner: boolean;
  /** 這晚住哪一區（T45c）：只定了區、還沒選住宿也算；還沒決定是 null */
  area: string | null;
  /** 住的地區 */
  areaName: string | null;
  /** 住宿同一區、大家想去、還沒排的景點和餐廳 */
  nearbyWishes: number;
  /** 引擎錯誤級的警告（第一則） */
  errorWarning: string | null;
}

export interface StarterInput {
  /** 整趟每一天，照日期排；第一天和最後一天是航班的天，最後一天不住 */
  days: StarterDay[];
  /** 正在看的那天；null＝整趟 */
  day: string | null;
  /** 行程裡的提醒數（不算 info） */
  warnings: number;
  /** 有人想去、還沒排進行程的點 */
  wishesUnplaced: number;
  /** 2 人以上想去、還沒排進行程的點 */
  popularUnplaced: number;
  /** 有沒有任何家人按過想去 */
  anyLiked: boolean;
}

const MAX_STARTERS = 3;
/** 問住宿一次問幾晚：整趟每晚一起問，回答會太長（T39） */
const LODGING_STRETCH = 3;

const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 要有住宿的晚上：2/2～2/12 */
export const nightsOf = (i: StarterInput) => i.days.slice(0, -1);
/** 要排東西的天：航班那兩天除外 */
export const fullDaysOf = (i: StarterInput) => i.days.slice(1, -1);

/** 某一天還沒排時的推薦問題（規則 3，也是空的一天「問 AI」帶的那一句） */
export function dayStarter(d: StarterDay): Starter {
  const why = !d.areaName ? '這天還沒排' : d.nearbyWishes > 0 ? `住${d.areaName}，附近大家想去的有 ${d.nearbyWishes} 個` : `住${d.areaName}，這天還沒排`;
  return { q: `${monthDay(d.date)} 去哪？`, why };
}

/** 連續的一段晚上（從 start 起，符合 open 的），寫成「2/9」或「2/9～2/11」；max 是最多幾晚 */
function nightRange(nights: StarterDay[], start: number, open: (d: StarterDay) => boolean, max = Infinity): string {
  let end = start;
  while (end + 1 < nights.length && end + 1 - start < max && open(nights[end + 1])) end++;
  return end > start ? `${monthDay(nights[start].date)}～${monthDay(nights[end].date)}` : monthDay(nights[start].date);
}

/** 問住宿的那一句（§17.2 的規則 1、2）；每晚都有住宿是 null。引導彈窗第 ③ 步「選住宿」直接用它：區還沒定完也問住宿（T46） */
export function lodgingStarter(i: StarterInput): Starter | null {
  const nights = nightsOf(i);
  const missing = nights.filter((d) => !d.lodging);
  if (!missing.length) return null;
  if (missing.length === nights.length) return { q: '幫我決定前幾晚住哪', why: '從第一晚開始，15 人的住宿最難訂' };
  // 連續的晚上併成一段，最早的一段先
  const range = nightRange(nights, nights.indexOf(missing[0]), (d) => !d.lodging, LODGING_STRETCH);
  return { q: `幫我決定 ${range} 住哪`, why: `還有 ${missing.length} 晚沒住宿` };
}

/**
 * 整趟「未選住宿」的「✦ 問 AI 推薦」（T54）：同第 ③ 步的問法，帶這晚的日期和區。
 * dates：從這晚起、同一區還沒選住宿的連續晚上（最多 LODGING_STRETCH 晚，呼叫的人給）
 */
export function nightLodgingStarter(dates: string[], areaName: string): Starter {
  const ds = dates.slice(0, LODGING_STRETCH);
  const range = ds.length > 1 ? `${monthDay(ds[0])}～${monthDay(ds.at(-1)!)}` : monthDay(ds[0]);
  return { q: `幫我決定 ${range} 在${areaName}住哪`, why: `${areaName}還沒選住宿` };
}

/** 第一張卡（interaction-design §17.2 的規則）：由上往下，第一個符合的就是。引導彈窗第 ③、④ 步用同一份規則，兩邊一定一致 */
export function firstStarter(i: StarterInput): Starter {
  const nights = nightsOf(i);
  // 先定每晚住哪一區，再挑住宿（T45c）：選了住宿的晚上區照住宿，不會在這裡
  const noArea = nights.filter((d) => !d.area && !d.lodging);
  if (noArea.length && noArea.length === nights.length) return { q: '幫我先排每晚住哪一區', why: '先定區，再挑住宿' };
  if (noArea.length) {
    const range = nightRange(nights, nights.indexOf(noArea[0]), (d) => !d.area && !d.lodging);
    return { q: `幫我決定 ${range} 住哪一區`, why: `還有 ${noArea.length} 晚沒決定區` };
  }
  const lodging = lodgingStarter(i);
  if (lodging) return lodging;
  const empty = fullDaysOf(i).find((d) => !d.hasStops);
  if (empty) return dayStarter(empty);
  // 晚餐排在午餐前面：沒有一泊二食的晚上，15 人比較難找位子
  const dinner = nights.find((d) => !d.hasDinner && !d.dinnerIncluded);
  if (dinner) return { q: `${monthDay(dinner.date)} 晚餐吃哪？`, why: dinner.dinnerExcluded ? '那晚不含晚餐' : '晚餐還空著' };
  const lunch = fullDaysOf(i).find((d) => !d.hasLunch);
  if (lunch) return { q: `${monthDay(lunch.date)} 午餐吃哪？`, why: '11:30～13:30 還空著' };
  const bad = i.days.find((d) => d.errorWarning);
  if (bad) return { q: `${monthDay(bad.date)} 的問題怎麼改？`, why: bad.errorWarning! };
  if (i.popularUnplaced > 0) return { q: '大家想去的還沒排的，排哪天？', why: `${i.popularUnplaced} 個` };
  return { q: '幫我整趟檢查一次', why: '每天都排好了' };
}

/** 空白的新對話的卡片：第一張照行程狀態算，另外兩張照現在的狀況挑，不夠時用示範句補滿 */
export function startersFor(i: StarterInput): Starter[] {
  const first = firstStarter(i);
  const missing = nightsOf(i).filter((d) => !d.lodging).length;
  const viewing = i.day ? i.days.find((d) => d.date === i.day) : undefined;
  const others: Starter[] = [
    // 空的一天沒有東西可以檢查
    ...(viewing?.hasStops ? [{ q: `幫我檢查 ${monthDay(viewing.date)}`, why: '正在看這天' }] : []),
    // 第一張已經在問住宿（或住哪一區）、問想去時，不用再問一次
    ...(missing > 0 && !/住哪/.test(first.q) ? [{ q: '哪幾晚還沒定住宿？', why: `還有 ${missing} 晚` }] : []),
    ...(i.warnings > 0 ? [{ q: '哪天最趕？', why: `有 ${i.warnings} 個提醒` }] : []),
    ...(i.wishesUnplaced > 0 && !first.q.startsWith('大家想去') ? [{ q: '把想去的排進行程', why: `${i.wishesUnplaced} 個還沒排` }] : []),
    { q: '鳥羽能坐 15 人的海鮮餐廳', why: '示範：找餐廳' },
    { q: '長輩走起來輕鬆的景點', why: '示範：找景點' },
  ];
  return [first, ...others.filter((s) => s.q !== first.q)].slice(0, MAX_STARTERS);
}

/** 想去頁空白時「問 AI 推薦」放進輸入框的那一句（§17.4） */
export const WISH_EMPTY_DRAFT = '推薦幾個適合全家去的地方';

/** 「未選住宿」「引導彈窗 ③」放進輸入框的那一句：住宿那一句加人數（T61） */
export const lodgingDraft = (s: Starter) => `${s.q}，要 15 人住得下`;

/** 空的一天「問 AI」放進輸入框的那一句（T61）：寫日期和住哪，不帶晶片也看得懂 */
export function emptyDayDraft(d: StarterDay): string {
  const md = monthDay(d.date);
  return d.areaName ? `${md} 住${d.areaName}，這天還沒排，幫我排一天` : `${md} 這天還沒排，幫我排一天`;
}

/** 引導彈窗第 ③ 步（選住宿）：藍卡下面接著問住宿的事 */
export const LODGING_FOLLOWUPS = ['我已經訂好幾晚了', '一間住得下 15 人的住宿有哪些？'];
/** 空的一天：沒有東西可以檢查，問怎麼排。不帶晶片（§17.1），所以直接寫日期 */
export const emptyDayFollowups = (date: string) => [`想去的點哪些適合 ${monthDay(date)}？`, `${monthDay(date)} 長輩走起來輕鬆的安排`];

/** 第一個還沒排的天（引導彈窗第 ④ 步）；都排了是 null */
export const firstEmptyDate = (i: StarterInput) => fullDaysOf(i).find((d) => !d.hasStops)?.date ?? null;

/** 「整趟」晶片的建議問題：拿掉現在問了沒意義的（沒有提醒不問哪天最趕、住宿都定了不問哪幾晚） */
export function tripPrompts(i: StarterInput): string[] {
  const missing = nightsOf(i).some((d) => !d.lodging);
  return promptsFor({ kind: 'trip' }).filter((q) => (q === '哪天最趕？' ? i.warnings > 0 : q === '哪幾晚還沒定住宿？' ? missing : true));
}

/** 訊息區卡片的一張；chip＝晶片的建議問題，starter＝照行程算的 */
export interface StarterCard extends Starter {
  source: 'starter' | 'chip';
}

/** 空白的新對話要放哪些卡片：帶了晶片用晶片的建議問題；開始卡、空的一天不帶晶片，帶來的那一句（lead）放第一張，下面是那一步的問題 */
export function blankCards(lead: Starter | null, suggestions: string[], starters: Starter[], hasContexts: boolean): StarterCard[] {
  const base: StarterCard[] = (hasContexts || lead) && suggestions.length ? suggestions.map((q) => ({ q, why: '', source: 'chip' })) : starters.map((s) => ({ ...s, source: 'starter' }));
  if (!lead) return base;
  return [{ ...lead, source: 'starter' as const }, ...base.filter((c) => c.q !== lead.q)].slice(0, MAX_STARTERS);
}

export interface StarterSources {
  itinerary: Itinerary | null;
  /** 引擎還沒算好是 null */
  plan: ItineraryPlan | null;
  votes: Vote[];
  byId: Map<string, Place>;
  areas: Area[];
  day: string | null;
}

/** 把瀏覽器本來就有的資料整理成規則要的樣子（每晚的住宿、引擎算好的空檔和警告、大家的 ♡）；不呼叫 AI */
export function buildStarterInput({ itinerary, plan, votes, byId, areas, day }: StarterSources): StarterInput {
  const dates = tripDates();
  const scheduled = new Set(dates.flatMap((d) => [...placesOnDay(itinerary, d)]));
  const liked = likedPlaces(votes);
  const unplaced = [...liked].filter(([id]) => {
    const p = byId.get(id);
    return !!p && !isDeletedUserPlace(p) && !scheduled.has(id);
  });
  const days = dates.map((date): StarterDay => {
    const dp = plan?.days.find((x) => x.date === date);
    const lodgingId = itinerary ? lodgingOn(itinerary, date) : null;
    const lodging = lodgingId ? byId.get(lodgingId) : undefined;
    const meals = (itinerary ? lodgingMealsOn(itinerary, date) : null) ?? (lodging?.raw as { meals?: string | null } | undefined)?.meals ?? null;
    // 住哪一區（T45a）：只定了區、還沒選住宿也算
    const stayArea = itinerary ? nightAreaOf(itinerary, date, (id) => byId.get(id)?.area) : null;
    const entries = dp?.entries.flatMap((e) => [e, ...(e.groups?.flatMap((g) => g.entries) ?? [])]) ?? [];
    const ate = (meal: 'lunch' | 'dinner') => !dp || entries.some((e) => e.meal === meal || e.mealTags?.includes(meal));
    const isStop = (id: string) => id !== lodgingId && ['spot', 'restaurant'].includes(byId.get(id)?.type ?? '');
    return {
      date,
      area: stayArea,
      lodging: !!lodgingId,
      dinnerIncluded: meals === 'dinner+breakfast',
      dinnerExcluded: meals === 'breakfast' || meals === 'none',
      hasStops: [...placesOnDay(itinerary, date)].some(isStop),
      hasLunch: ate('lunch'),
      hasDinner: ate('dinner'),
      areaName: stayArea ? (areas.find((a) => a.id === stayArea)?.name.zh ?? null) : null,
      nearbyWishes: stayArea ? unplaced.filter(([id]) => byId.get(id)?.area === stayArea && ['spot', 'restaurant'].includes(byId.get(id)?.type ?? '')).length : 0,
      errorWarning: dp?.warnings.find((w) => w.level === 'error')?.message ?? null,
    };
  });
  return {
    days,
    day,
    warnings: plan?.days.reduce((n, p) => n + p.warnings.filter((w) => w.level !== 'info').length, 0) ?? 0,
    wishesUnplaced: unplaced.length,
    popularUnplaced: unplaced.filter(([, c]) => c.likes.length >= 2).length,
    anyLiked: liked.size > 0,
  };
}

/** 一次帶著的所有晶片：多個地點時問比較、怎麼排；其他照最後一個（剛帶進來的） */
export function promptsForAll(contexts: ChatContext[], last: ChatContext | undefined, place?: Place): string[] {
  const places = contexts.filter((c) => c.kind === 'place').length;
  if (places >= 2) return [`比較這 ${places} 家`, `這 ${places} 個排哪天比較順？`];
  return last ? promptsFor(last, place) : [];
}
