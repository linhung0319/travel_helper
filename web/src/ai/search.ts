// search_places 的比對（規格 §4.1）：純函式。語音輸入的地名可能有錯字、中日文混雜（interaction-design §2），所以名稱比對要能模糊。

import { displayMinutes, estimateWalk } from '../lib/geo/index.ts';
import { openingOn, type EngineConfig, type PlaceRecord } from '@travel-helper/engine';
import { matchesFilter, placeFit15, type Filter, EMPTY_FILTER } from '../lib/filter.ts';
import { placeBadges } from '../lib/badges.ts';
import { inBbox } from '../lib/areas.ts';
import { ratingOf } from '../lib/explore.ts';
import type { Area, Bbox, LonLat, Place, PlaceType } from '../data/types.ts';
import { placeName } from './deps.ts';

const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s・·、,。.'’「」()（）]/g, '');

/** 字元雙連的相似度（Dice）：錯字、少字還比得到 */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2));
  const gb = grams(b);
  let hits = 0;
  for (const g of grams(a)) {
    const i = gb.indexOf(g);
    if (i >= 0) {
      hits += 1;
      gb.splice(i, 1);
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

/** 名稱的候選：中、日、假名、英文，加上 Google 上的名字 */
function namesOf(p: Place): string[] {
  const raw = p.raw as { googleName?: unknown; aliases?: unknown };
  const extra = [raw.googleName, ...(Array.isArray(raw.aliases) ? raw.aliases : [])].filter((x): x is string => typeof x === 'string');
  return [p.name.zh, p.name.ja, p.name.kana, p.name.en, ...extra].filter((x): x is string => !!x).map(fold).filter(Boolean);
}

/** 0～1：1 是名字裡找得到整段，0.5 以上算模糊比到 */
export function nameScore(p: Place, text: string): number {
  const q = fold(text);
  if (!q) return 1;
  let best = 0;
  for (const n of namesOf(p)) {
    if (n.includes(q) || (q.length >= 2 && q.includes(n))) return 1;
    best = Math.max(best, dice(q, n));
    // 名字長、問的短：比同樣長度的片段（「伊勢神宮」比「伊勢神宮 內宮」）
    if (n.length > q.length) for (let i = 0; i + q.length <= n.length; i++) best = Math.max(best, dice(q, n.slice(i, i + q.length)));
  }
  return best;
}

export const NAME_MATCH = 0.5;

export interface SearchInput {
  text?: string;
  types?: PlaceType[];
  areas?: string[];
  regions?: string[];
  /** 推薦等級（「一定要去」是 S、A）：同探索篩選的 tiers */
  tiers?: Filter['tiers'];
  cuisine?: string[];
  near?: { place?: string; coords?: LonLat; walkMinutes?: number };
  inView?: boolean;
  openAt?: { date: string; time: string };
  fit15?: Filter['fit15'];
  fitSubgroup?: boolean;
  elderly?: boolean;
  kids?: boolean;
  reservable?: boolean;
  /** 下雨也行：景點要 indoor；餐廳、住宿本來就在室內，不受影響 */
  indoor?: boolean;
  /** 能包棟（只留住宿） */
  wholeRental?: boolean;
  /** 最多住幾人至少這麼多（只留住宿） */
  maxGuestsAtLeast?: number;
  votes?: Filter['votes'];
  sort?: 'recommend' | 'rating' | 'likes' | 'distance';
  limit?: number;
}

export type OpenState = 'open' | 'closed' | 'unknown';

/** 那個時間開著嗎：營業時間沒查是 unknown，不說成沒開 */
export function openAtTime(p: Place, date: string, time: string, holidays: readonly string[]): OpenState {
  const s = openingOn(p.raw as unknown as PlaceRecord, date, holidays);
  if (s.kind !== 'open') return s.kind;
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m;
  return s.periods.some((x) => t >= x.open && t < x.close) ? 'open' : 'closed';
}

const get = (p: Place, ...path: string[]): unknown => path.reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), p.raw);

/** 評分（1～5）；沒有評過是 null */
const score = (p: Place, key: string): number | null => {
  const v = p.assessment?.scores?.[key];
  return typeof v === 'number' ? v : null;
};

/** 「適合長輩、小孩」：評分 3 分以上 */
const GOOD_FIT = 3;

export interface Digest {
  id: string;
  name: string;
  ja: string;
  type: PlaceType;
  area: string | null;
  region: string | null;
  tier: string | null;
  badges: string[];
  /** 第一句簡介 */
  summary: string | null;
  likes: number;
  fit15?: string | null;
  walkMinutes?: number;
  open?: OpenState;
  /** 以下只有搜尋結果帶（T41），脈絡晶片不帶：景點下雨也行嗎（null 是資料沒寫） */
  indoor?: boolean | null;
  /** 建議停留（用餐）分鐘；null 是資料沒寫 */
  stayMinutes?: number | null;
  /** 子地區要不要搭車 */
  needsCar?: boolean;
  /** 要了 elderly、kids，這個點沒有評分 */
  fitUnknown?: true;
}

const firstSentence = (text: string | undefined) => {
  if (!text) return null;
  const m = /^.+?[。！？!?]/s.exec(text);
  const s = m ? m[0] : text;
  // 切斷的要標「…」，AI 才不會把斷掉的字當成完整的（T36 模擬抓到）
  return [...s].length > SUMMARY_MAX ? `${[...s].slice(0, SUMMARY_MAX).join('')}…` : s;
};
const SUMMARY_MAX = 80;

/** 精簡內容：搜尋結果、脈絡晶片都用這一份 */
export function digestOf(p: Place, likes: number): Digest {
  return {
    id: p.id,
    name: placeName(p),
    ja: p.name.ja,
    type: p.type,
    area: p.area,
    region: p.region,
    tier: p.tier,
    badges: placeBadges(p, 4).map((b) => b.label),
    summary: firstSentence(p.summary?.text),
    likes,
    ...(p.type === 'restaurant' ? { fit15: placeFit15(p) } : {}),
  };
}

export interface SearchEnv {
  places: Place[];
  byId: Map<string, Place>;
  bounds: Bbox | null;
  likes(id: string): number;
  config: EngineConfig;
  /** 完整的資料點（摘要在詳情層）；沒給就用 places 那一份 */
  full?: (id: string) => Place | null;
  /** 區域（子地區要不要搭車）；沒給就不帶 needsCar */
  areas?: Area[];
}

/** 住宿的團體欄位；maxGuests 不在清單層，要給完整的資料點 */
const lodgingGroup = (p: Place, key: 'wholeRental' | 'maxGuests'): unknown => get(p, 'group', key);

export interface SearchResult {
  /** 符合條件的總數（可能比回傳的多） */
  total: number;
  /** 因為資料沒查到而沒有列出的筆數（fit15 未查等）：AI 要照實說 */
  unknownExcluded: number;
  /** 要了 elderly、kids 時，列出來但沒有評分的筆數（排在有評分的後面）：AI 要照實說沒有資料 */
  fitUnknown?: number;
  places: Digest[];
}

/** 一個條件：資料是 true／false／沒寫（null） */
type Check = boolean | null;

export function searchPlaces(input: SearchInput, env: SearchEnv): SearchResult {
  const filter: Filter = { ...EMPTY_FILTER, areas: input.areas ?? [], regions: input.regions ?? [], types: input.types ?? [], votes: input.votes ?? [], tiers: input.tiers ?? [] };
  const center = input.near?.place ? env.byId.get(input.near.place)?.coords : input.near?.coords;
  // 全員的步行速度（同引擎的係數）
  const walk = (a: LonLat, b: LonLat) => displayMinutes(estimateWalk(a, b).minutes * env.config.walk.factorWhole);
  let unknownExcluded = 0;
  let fitUnknown = 0;
  const fitWanted = !!(input.elderly || input.kids);
  /** 沒寫的條件算進 unknownExcluded，不列出 */
  const pass = (c: Check) => {
    if (c === null) unknownExcluded += 1;
    return c === true;
  };
  const known = (v: unknown): Check => (typeof v === 'boolean' ? v : null);
  const needCar = new Map((env.areas ?? []).flatMap((a) => (a.regions ?? []).flatMap((r) => (typeof r.needsCar === 'boolean' ? [[r.id, r.needsCar] as const] : []))));
  const rows: { p: Place; rank: number; walk?: number; open?: OpenState; fitKnown: boolean }[] = [];
  for (const p of env.places) {
    // 車站要明確問才列
    if (p.type === 'station' && !input.types?.includes('station')) continue;
    if (!matchesFilter(p, filter)) continue;
    const rank = input.text ? nameScore(p, input.text) : 1;
    if (rank < NAME_MATCH) continue;
    if (input.cuisine?.length && !p.cuisine.some((c) => input.cuisine!.some((q) => c.includes(q) || q.includes(c)))) continue;
    if (input.inView && env.bounds && !inBbox(p.coords, env.bounds)) continue;
    const minutes = center ? walk(center, p.coords) : undefined;
    if (minutes != null && input.near?.walkMinutes != null && minutes > input.near.walkMinutes) continue;
    if (input.fit15?.length) {
      const v = placeFit15(p);
      if (!v || v === 'unknown') {
        if (!input.fit15.includes('unknown')) {
          unknownExcluded += 1;
          continue;
        }
      } else if (!input.fit15.includes(v)) continue;
    }
    if (input.fitSubgroup && get(p, 'group', 'fitSubgroup') !== 'yes') continue;
    if (input.reservable) {
      const a = get(p, 'reservation', 'accepted');
      if (a === undefined || a === null) unknownExcluded += 1;
      if (a !== 'yes' && a !== 'groups-only') continue;
    }
    if (input.indoor && p.type === 'spot' && !pass(known(get(p, 'indoor')))) continue;
    if (input.wholeRental && (p.type !== 'lodging' || !pass(known(lodgingGroup(p, 'wholeRental'))))) continue;
    if (input.maxGuestsAtLeast != null) {
      if (p.type !== 'lodging') continue;
      const n = lodgingGroup(env.full?.(p.id) ?? p, 'maxGuests');
      if (!pass(typeof n === 'number' ? n >= input.maxGuestsAtLeast : null)) continue;
    }
    // 長輩、小孩：分數低於 3 才拿掉；沒有分數的留著，排在有分數的後面（T41：志摩一半的景點沒有 elderFit）
    let skip = false;
    let fitKnown = true;
    for (const [want, key] of [[input.elderly, 'elderFit'], [input.kids, 'kidsFit']] as const) {
      if (!want) continue;
      const v = score(p, key);
      if (v === null) fitKnown = false;
      else if (v < GOOD_FIT) skip = true;
    }
    if (skip) continue;
    const open = input.openAt ? openAtTime(p, input.openAt.date, input.openAt.time, env.config.holidays) : undefined;
    // 確定沒開才拿掉；沒查到的留著，標 unknown
    if (open === 'closed') continue;
    if (fitWanted && !fitKnown) fitUnknown += 1;
    rows.push({ p, rank, walk: minutes, open, fitKnown });
  }
  const tierRank = (p: Place) => (p.tier ? 'SAB'.indexOf(p.tier) : 3);
  const by: Record<NonNullable<SearchInput['sort']>, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    recommend: (a, b) => tierRank(a.p) - tierRank(b.p),
    rating: (a, b) => (ratingOf(b.p) ?? -1) - (ratingOf(a.p) ?? -1),
    likes: (a, b) => env.likes(b.p.id) - env.likes(a.p.id),
    distance: (a, b) => (a.walk ?? Infinity) - (b.walk ?? Infinity),
  };
  const sort = by[input.sort ?? (center ? 'distance' : 'recommend')] ?? by.recommend;
  rows.sort((a, b) => b.rank - a.rank || Number(b.fitKnown) - Number(a.fitKnown) || sort(a, b));
  const limit = Math.min(Math.max(1, input.limit ?? 10), 30);
  return {
    total: rows.length,
    unknownExcluded,
    ...(fitWanted ? { fitUnknown } : {}),
    places: rows.slice(0, limit).map((r) => {
      const full = env.full?.(r.p.id) ?? r.p;
      const stay = get(full, 'stayMinutes');
      const car = r.p.region ? needCar.get(r.p.region) : undefined;
      return {
        ...digestOf(full, env.likes(r.p.id)),
        ...(r.walk != null ? { walkMinutes: r.walk } : {}),
        ...(r.open ? { open: r.open } : {}),
        ...(r.p.type === 'spot' ? { indoor: known(get(full, 'indoor')) } : {}),
        ...(r.p.type === 'spot' || r.p.type === 'restaurant' ? { stayMinutes: typeof stay === 'number' ? stay : null } : {}),
        ...(car !== undefined ? { needsCar: car } : {}),
        ...(fitWanted && !r.fitKnown ? { fitUnknown: true as const } : {}),
      };
    }),
  };
}
