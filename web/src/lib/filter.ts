// 篩選：區域、子地區、類型、分級、投票（T15m），以及照類型分段的條件（T67，interaction-design §32）：
// 餐廳的誰吃、哪一餐、帶小孩、怎麼去；住宿的住法、晚餐、適合、其他；景點的適合、天氣、怎麼去。
// 每一項都是「空陣列＝不篩」；有值時符合其中一個就算（同一組裡是「或」），只有 suits、amenity 是每個都要符合（是條件，不是互斥的值）。
// T67 拿掉 fit15、lodging 兩個欄位：AI 的 set_filter 還收，進來時轉成 who、stay（toFilterPatch）。

import { displayName } from '../data/normalize.ts';
import type { Area, Context, Place, PlaceType, Tier } from '../data/types.ts';

export interface Filter {
  areas: string[];
  regions: string[];
  types: PlaceType[];
  /** 哪一餐（餐廳的 contexts）：午餐、晚餐、小吃咖啡（light＝snack 或 cafe）；snack、cafe、transit 單獨也認得（AI、舊的手機條件） */
  contexts: ContextFilter[];
  tiers: Tier[];
  /** 投票（interaction-design §9）：有人按了 ❤️ 的（AI 問「想去的」用，畫面的篩選沒有這個按鈕）、大家喜歡的（❤️ 2 人以上）、我按了 ❤️ 的 */
  votes: VoteFilter[];
  /**
   * 天氣（T58，CONVENTIONS 景點的 weather）：景點的 weather 是其中一個；和 AI 的 search_places 同一個意思。餐廳、住宿本來就在室內，不受影響。
   * 面板只有「下雨也行」（rain＝室內、有遮蔽都算，T66）；indoor、covered 留給 AI
   */
  weather: WeatherFilter[];
  /**
   * 誰吃（T66、T75）：together 能坐一起（fit15 yes）、split 要分桌（fit15 split）、apart 坐不下或還沒查——這三個把餐廳切完（§35.4 吃的三個區段）；
   * sub 分組 4～6 人（面板）；all 全員 15 人（together＋split 而且收小孩，AI 和舊條件用）。有值時只剩餐廳
   */
  who: WhoFilter[];
  /** 帶小孩（T67）：kids.allowed 不是 no、age-limit（不明的當可以）；有值時只剩餐廳 */
  kids: KidsFilter[];
  /** 怎麼去（T67）：車站旁（餐廳的 transit）、不用搭車（accessEase ≥ 4；餐廳沒有這個評分，看車站旁或車站走路 10 分內） */
  reach: ReachFilter[];
  /** 住法（T66、T67、T69）：包棟一棟住全團、包棟要和別處分住、旅館飯店、民宿；fits、apart 是書架「住在這裡」的兩級（面板沒有）。有值時只剩住宿 */
  stay: StayFilter[];
  /** 住宿的晚餐（T67）：一泊二食、不含但走路有店、要開車找；有值時只剩住宿 */
  dinner: DinnerFilter[];
  /** 適合（T57、T67）：elderFit、kidsFit、winterFit ≥ 4；景點、住宿都用（住宿沒有 winterFit），有值時只剩景點、住宿，選兩個以上要都符合 */
  suits: SuitFilter[];
  /** 住宿的其他（T67）：溫泉（tags 有溫泉）、車站走路到（nearestStation.mode 是 walk）；有值時只剩住宿，選兩個要都符合 */
  amenity: AmenityFilter[];
}

/** 哪一餐：Context 加上 light（小吃咖啡合成一顆） */
export type ContextFilter = Context | 'light';
export const MEAL_VALUES = ['lunch', 'dinner', 'light'] as const;
/** AI、set_filter 收得到的 contexts（面板只畫 MEAL_VALUES） */
export const CONTEXT_FILTER_VALUES: readonly ContextFilter[] = ['lunch', 'dinner', 'light', 'snack', 'cafe', 'transit'];

/** 整團的人數 */
export const SLEEPS_GROUP = 15;

export const SUIT_VALUES = ['elderly', 'kids', 'winter'] as const;
export type SuitFilter = (typeof SUIT_VALUES)[number];
export const SUIT_LABELS: Record<SuitFilter, string> = { elderly: '長輩', kids: '小孩', winter: '2 月' };
/** 晶片、AI 說明用（面板上的組名是「適合」，晶片單獨出現要看得懂） */
const SUIT_CHIP_LABELS: Record<SuitFilter, string> = { elderly: '適合長輩', kids: '適合小孩', winter: '適合 2 月' };
/** 每個「適合」看哪個評分 */
export const SUIT_SCORES: Record<SuitFilter, 'elderFit' | 'kidsFit' | 'winterFit'> = { elderly: 'elderFit', kids: 'kidsFit', winter: 'winterFit' };
/** 「適合」「不用搭車」的門檻：評分至少幾分（4 分是 CONVENTIONS 評分表的「平地、步行少」「小孩會喜歡」「車站步行 10 分內」這一端） */
export const SUIT_MIN = 4;
/** 「適合」對哪幾類有用 */
const SUIT_TYPES: readonly PlaceType[] = ['spot', 'lodging'];

/** 評分（1～5）；沒有評過是 null */
export function placeScore(p: Pick<Place, 'assessment'>, key: string): number | null {
  const v = p.assessment?.scores?.[key];
  return typeof v === 'number' ? v : null;
}

const groupOf = (p: Place) => (p.raw.group as Record<string, unknown> | undefined) ?? {};

/** 景點的 weather（T58）：室內、有遮蔽、戶外；null 是沒判 */
export const WEATHER_LEVELS = ['indoor', 'covered', 'outdoor'] as const;
export type Weather = (typeof WEATHER_LEVELS)[number];
export const WEATHER_LABELS: Record<Weather, string> = { indoor: '室內', covered: '有遮蔽', outdoor: '戶外' };
/** 篩選的天氣：rain（下雨也行＝室內、有遮蔽都算，面板只有這顆，T66）；indoor、covered 是 AI 的 set_filter 用 */
export const WEATHER_VALUES = ['rain', 'indoor', 'covered'] as const;
export type WeatherFilter = (typeof WEATHER_VALUES)[number];
export const WEATHER_FILTER_LABELS: Record<WeatherFilter, string> = { rain: '下雨也行', indoor: '室內', covered: '有遮蔽' };
export const RAIN_OK: WeatherFilter[] = ['rain'];

/** 景點的 weather 符不符合篩選的其中一個（rain：室內、有遮蔽都算）；沒判的不算 */
export function weatherMatches(w: Weather | null, values: readonly string[]): boolean {
  if (!w) return false;
  return values.includes(w) || (values.includes('rain') && (w === 'indoor' || w === 'covered'));
}

// ---- 餐廳 ----

/**
 * 誰吃（T66、T75）：together、split、apart 照 fit15 把餐廳切成三份（§35.4：全員吃飯、要分桌、要分組去）；
 * sub 是分組 4～6 人坐得下（面板「分組去」）；all 是舊的「全員 15 人」（together＋split 而且收小孩），AI 和舊條件還收
 */
export const WHO_VALUES = ['together', 'split', 'apart', 'sub', 'all'] as const;
export type WhoFilter = (typeof WHO_VALUES)[number];
export const WHO_LABELS: Record<WhoFilter, string> = { together: '15 人能坐一起', split: '15 人要分桌', apart: '15 人坐不下、還沒查', sub: '分組 4～6 人', all: '全員 15 人' };
/** 面板上的誰吃 */
export const WHO_PANEL: readonly WhoFilter[] = ['all', 'sub'];

/** 餐廳的 kids.allowed（yes、no、age-limit、unknown）；沒寫是 null（當可以） */
export function placeKidsAllowed(p: Place): string | null {
  const v = (p.raw.kids as Record<string, unknown> | undefined)?.allowed;
  return typeof v === 'string' ? v : null;
}

/** 收小孩：不是不收小孩、有年齡限制的店（不明的當可以，interaction-design §32） */
export function kidsWelcome(p: Place): boolean {
  const kids = placeKidsAllowed(p);
  return kids !== 'no' && kids !== 'age-limit';
}

/**
 * 全員 15 人能一起吃（書架「全員吃飯」的第一級，interaction-design §32）：fit15 是 yes 或 split（一家容納得下），
 * 而且不是不收小孩、有年齡限制的店（kids.allowed 不明的當可以）
 */
export function eatsTogether(p: Place): boolean {
  if (p.type !== 'restaurant') return false;
  const fit = placeFit15(p);
  return (fit === 'yes' || fit === 'split') && kidsWelcome(p);
}

export function matchesWho(p: Place, v: WhoFilter): boolean {
  if (p.type !== 'restaurant') return false;
  if (v === 'all') return eatsTogether(p);
  // T75：together、split、apart 不看收不收小孩，三個加起來剛好是全部的餐廳
  if (v === 'together') return placeFit15(p) === 'yes';
  if (v === 'split') return placeFit15(p) === 'split';
  // 坐不下、還沒查（沒寫也算）
  if (v === 'apart') return placeFit15(p) !== 'yes' && placeFit15(p) !== 'split';
  return groupOf(p).fitSubgroup !== 'no';
}

/** 帶小孩（T67） */
export const KIDS_VALUES = ['ok'] as const;
export type KidsFilter = (typeof KIDS_VALUES)[number];
export const KIDS_LABELS: Record<KidsFilter, string> = { ok: '可以帶小孩' };

/** 怎麼去（T67）：車站旁（餐廳的 transit：主要車站走路 5 分內）、不用搭車 */
export const REACH_VALUES = ['station', 'easy'] as const;
export type ReachFilter = (typeof REACH_VALUES)[number];
export const REACH_LABELS: Record<ReachFilter, string> = { station: '車站旁', easy: '不用搭車' };
/** 餐廳的「不用搭車」：車站走路幾分內（同 accessEase 4 分的「車站步行 10 分內」） */
export const EASY_WALK_MINUTES = 10;

/**
 * 車站的 ID 不在餐廳的資料裡（anchors 只有 ID），由資料載入時註冊；沒註冊（Node 的測試）時只看 transit。
 * 同 setVoteLookup：matchesFilter 的呼叫者不用多傳參數
 */
let stationIds: ReadonlySet<string> = new Set();
export function setStationIds(ids: Iterable<string>) {
  stationIds = new Set(ids);
}

export function matchesReach(p: Place, v: ReachFilter): boolean {
  if (v === 'station') return p.contexts.includes('transit');
  if (p.type === 'restaurant') return p.contexts.includes('transit') || p.anchors.some((a) => stationIds.has(a.id) && typeof a.walkMinutes === 'number' && a.walkMinutes <= EASY_WALK_MINUTES);
  return (placeScore(p, 'accessEase') ?? 0) >= SUIT_MIN;
}

// ---- 住宿 ----

/**
 * 住法（T66、T67、T69）。面板四顆：包棟・一棟住全團（能包棟、maxGuests ≥ 15）、包棟・要和別處分住（能包棟、住不下或人數不明；多半那裡只有一棟，要另外找一處，T69 從「要兩棟」改名）、
 * 旅館・飯店（kind 是 hotel、ryokan、other，分房住）、民宿（其他：不能包棟的 minshuku、rental-house，T69 補上，之前篩不到）。
 * 書架「住在這裡」的兩級（面板沒有）：fits 一間住得下全團（包棟一棟，或旅館飯店 5 間房以上）、apart 其他（要分開住）
 */
export const STAY_VALUES = ['whole', 'multi', 'hotel', 'other', 'fits', 'apart'] as const;
export type StayFilter = (typeof STAY_VALUES)[number];
// T75（§35.4）改字：包棟・全團一棟、包棟・要分住、旅館飯店
export const STAY_LABELS: Record<StayFilter, string> = { whole: '包棟・全團一棟', multi: '包棟・要分住', hotel: '旅館飯店', other: '民宿', fits: '一間住得下全團', apart: '要分開住' };
/** 面板上的住法 */
export const STAY_PANEL: readonly StayFilter[] = ['whole', 'multi', 'hotel', 'other'];
/** 旅館、飯店幾間房以上算住得下全團（👤 定：不補 maxGuests，用房間數判） */
export const HOTEL_ROOMS_GROUP = 5;
/** 算旅館、飯店的 kind（rental-house、minshuku 不算） */
const HOTEL_KINDS = ['hotel', 'ryokan', 'other'];

/** 住宿是哪一種：包棟一棟、包棟要和別處分住、旅館飯店、其他（民宿等）；不是住宿是 null */
export type StayKind = 'whole' | 'multi' | 'hotel' | 'other';
export function placeStayKind(p: Place): StayKind | null {
  if (p.type !== 'lodging') return null;
  const g = groupOf(p);
  if (g.wholeRental === true) return typeof g.maxGuests === 'number' && g.maxGuests >= SLEEPS_GROUP ? 'whole' : 'multi';
  if (typeof p.raw.kind === 'string' && HOTEL_KINDS.includes(p.raw.kind)) return 'hotel';
  return 'other';
}

/** 一間住得下全團（書架「住在這裡」的第一級）：包棟一棟，或旅館飯店 5 間房以上 */
export function fitsWholeGroup(p: Place): boolean {
  const kind = placeStayKind(p);
  if (kind === 'whole') return true;
  const rooms = groupOf(p).totalRooms;
  return kind === 'hotel' && typeof rooms === 'number' && rooms >= HOTEL_ROOMS_GROUP;
}

export function matchesStay(p: Place, v: StayFilter): boolean {
  const kind = placeStayKind(p);
  if (!kind) return false;
  if (v === 'fits') return fitsWholeGroup(p);
  if (v === 'apart') return !fitsWholeGroup(p);
  return kind === v;
}

/** 住宿的晚餐（T67）：一泊二食（meals 是 dinner+breakfast 或 varies）、不含走路有店（dinnerAccess walk）、要開車找（car） */
export const DINNER_VALUES = ['included', 'walk', 'car'] as const;
export type DinnerFilter = (typeof DINNER_VALUES)[number];
export const DINNER_LABELS: Record<DinnerFilter, string> = { included: '一泊二食', walk: '不含，走路有店', car: '不含，要開車找' };

export function matchesDinner(p: Place, v: DinnerFilter): boolean {
  if (p.type !== 'lodging') return false;
  if (v === 'included') return p.raw.meals === 'dinner+breakfast' || p.raw.meals === 'varies';
  return p.raw.dinnerAccess === v;
}

/** 住宿的其他（T67）：溫泉、車站走路到 */
export const AMENITY_VALUES = ['onsen', 'stationWalk'] as const;
export type AmenityFilter = (typeof AMENITY_VALUES)[number];
export const AMENITY_LABELS: Record<AmenityFilter, string> = { onsen: '溫泉', stationWalk: '車站走路到' };

export function matchesAmenity(p: Place, v: AmenityFilter): boolean {
  if (p.type !== 'lodging') return false;
  if (v === 'onsen') return p.tags.includes('溫泉');
  return (p.raw.nearestStation as Record<string, unknown> | undefined)?.mode === 'walk';
}

export function placeWeather(p: { raw: Record<string, unknown> }): Weather | null {
  const v = p.raw.weather;
  return typeof v === 'string' && (WEATHER_LEVELS as readonly string[]).includes(v) ? (v as Weather) : null;
}

export const VOTE_FILTER_VALUES = ['any', 'popular', 'mine'] as const;
export type VoteFilter = (typeof VOTE_FILTER_VALUES)[number];

export const VOTE_FILTER_LABELS: Record<VoteFilter, string> = {
  any: '有人想去的',
  popular: '大家想去的',
  mine: '只看我按的',
};

/** 「大家喜歡的」至少幾個 ❤️ */
export const POPULAR_LIKES = 2;

/**
 * 投票不在資料點裡（存在後端），由 appShared 註冊查詢的方法；沒註冊（Node 的測試）時投票的篩選都不符合。
 * 這樣 matchesFilter 的呼叫者（地圖、圖片牆、指令）不用多傳參數。
 */
export interface VoteLookup {
  likes(placeId: string): number;
  likedByMe(placeId: string): boolean;
}
let voteLookup: VoteLookup | null = null;
export function setVoteLookup(lookup: VoteLookup | null) {
  voteLookup = lookup;
}

export const FIT15_VALUES = ['yes', 'split', 'no', 'unknown'] as const;
export type Fit15 = (typeof FIT15_VALUES)[number];

export type FilterKey = keyof Filter;

export const EMPTY_FILTER: Filter = { areas: [], regions: [], types: [], contexts: [], tiers: [], votes: [], weather: [], who: [], kids: [], reach: [], stay: [], dinner: [], suits: [], amenity: [] };

export const TYPE_LABELS: Record<PlaceType, string> = {
  station: '車站',
  spot: '景點',
  lodging: '住宿',
  restaurant: '餐廳',
};

export const CONTEXT_LABELS: Record<ContextFilter, string> = {
  lunch: '午餐',
  dinner: '晚餐',
  light: '小吃咖啡',
  transit: '車站旁',
  snack: '小吃',
  cafe: '咖啡',
};


export const FIT15_LABELS: Record<Fit15, string> = {
  yes: '可容納 15 人',
  split: '15 人要分桌',
  no: '坐不下 15 人',
  unknown: '還沒查',
};

export function placeFit15(p: Place): Fit15 | null {
  const v = (p.raw.group as Record<string, unknown> | undefined)?.fit15;
  return typeof v === 'string' && (FIT15_VALUES as readonly string[]).includes(v) ? (v as Fit15) : null;
}

export function isFilterEmpty(f: Filter): boolean {
  return Object.values(f).every((v) => v.length === 0);
}

function matchesContext(p: Place, v: ContextFilter): boolean {
  if (v === 'light') return p.contexts.includes('snack') || p.contexts.includes('cafe');
  return p.contexts.includes(v);
}

export function matchesFilter(p: Place, f: Filter): boolean {
  if (f.areas.length && !(p.area && f.areas.includes(p.area))) return false;
  if (f.regions.length && !(p.region && f.regions.includes(p.region))) return false;
  if (f.types.length && !f.types.includes(p.type)) return false;
  if (f.contexts.length && !f.contexts.some((v) => matchesContext(p, v))) return false;
  // 車站沒有分級：只篩分級時車站照樣顯示，方便看交通。沒評等級的算 B（T75，§35.4「其他景點」要收得到）
  if (f.tiers.length && p.type !== 'station' && !f.tiers.includes(p.tier ?? 'B')) return false;
  if (f.who.length && !f.who.some((v) => matchesWho(p, v))) return false;
  if (f.kids.length && !(p.type === 'restaurant' && kidsWelcome(p))) return false;
  if (f.reach.length && !f.reach.some((v) => matchesReach(p, v))) return false;
  if (f.stay.length && !f.stay.some((v) => matchesStay(p, v))) return false;
  if (f.dinner.length && !f.dinner.some((v) => matchesDinner(p, v))) return false;
  if (f.suits.length && !(SUIT_TYPES.includes(p.type) && f.suits.every((v) => (placeScore(p, SUIT_SCORES[v]) ?? 0) >= SUIT_MIN))) return false;
  if (f.amenity.length && !f.amenity.every((v) => matchesAmenity(p, v))) return false;
  if (f.weather.length && p.type === 'spot' && !weatherMatches(placeWeather(p), f.weather)) return false;
  if (f.votes.length) {
    const ok =
      (f.votes.includes('any') && (voteLookup?.likes(p.id) ?? 0) >= 1) || (f.votes.includes('popular') && (voteLookup?.likes(p.id) ?? 0) >= POPULAR_LIKES) || (f.votes.includes('mine') && !!voteLookup?.likedByMe(p.id));
    if (!ok) return false;
  }
  return true;
}

/**
 * AI 的 set_filter（和 commands.setFilter）收到的舊欄位轉成新的（T67）：
 * fit15 yes → who together、split → split（T75）；no、unknown → who apart。lodging wholeRental → 住法的包棟兩顆；sleeps15 → 包棟一棟。suits 的 access → reach easy。
 * 其他欄位照舊；回傳的只有 Filter 的欄位
 */
export function toFilterPatch(patch: Record<string, unknown>): Partial<Filter> {
  const out: Record<string, string[]> = {};
  const add = (k: FilterKey, vs: string[]) => {
    out[k] = [...new Set([...(out[k] ?? []), ...vs])];
  };
  for (const [k, v] of Object.entries(patch)) {
    const list = Array.isArray(v) ? v.map(String) : [];
    if (k === 'fit15') {
      if (list.includes('yes')) add('who', ['together']);
      if (list.includes('split')) add('who', ['split']);
      if (list.some((x) => x === 'no' || x === 'unknown')) add('who', ['apart']);
      if (!list.length) add('who', []);
    } else if (k === 'lodging') {
      if (list.includes('sleeps15')) add('stay', ['whole']);
      else if (list.includes('wholeRental')) add('stay', ['whole', 'multi']);
      else add('stay', []);
    } else if (k === 'suits') {
      add('suits', list.filter((x) => x !== 'access'));
      if (list.includes('access')) add('reach', ['easy']);
    } else add(k as FilterKey, list);
  }
  return out as Partial<Filter>;
}

/** 比對用：全形半形統一、小寫 */
const fold = (s: string) => s.normalize('NFKC').toLowerCase();

/**
 * 搜尋欄（探索、想去）：名稱（中文、日文、假名、英文）裡找得到每一個詞就算。空字串都符合。
 * 搜尋不放進 Filter：Filter 是 T12 setFilter 指令的格式（都是陣列）。
 */
export function matchesQuery(p: Place, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const names = [p.name.zh, p.name.ja, p.name.kana, p.name.en].filter((x): x is string => !!x).map(fold);
  return words.every((w) => names.some((n) => n.includes(w)));
}

export interface FilterChip {
  key: FilterKey;
  value: string;
  label: string;
}

/** 晶片的字（T67：新名字「全員 15 人」「一泊二食」） */
const CHIP_LABELS: { [K in FilterKey]?: Record<string, string> } = {
  types: TYPE_LABELS,
  contexts: CONTEXT_LABELS,
  votes: VOTE_FILTER_LABELS,
  weather: WEATHER_FILTER_LABELS,
  who: WHO_LABELS,
  kids: KIDS_LABELS,
  reach: REACH_LABELS,
  stay: STAY_LABELS,
  dinner: DINNER_LABELS,
  suits: SUIT_CHIP_LABELS,
  amenity: AMENITY_LABELS,
};

/** 地圖上方可以取消的篩選標籤（interaction-design §5） */
export function filterChips(f: Filter, areas: Area[]): FilterChip[] {
  const regionName = new Map(areas.flatMap((a) => (a.regions ?? []).map((r) => [r.id, displayName(r.name, r.id)] as const)));
  const areaName = new Map(areas.map((a) => [a.id, displayName(a.name, a.id)]));
  const label = (key: FilterKey, v: string): string => {
    if (key === 'areas') return areaName.get(v) ?? v;
    if (key === 'regions') return regionName.get(v) ?? v;
    if (key === 'tiers') return `${v} 級`;
    return CHIP_LABELS[key]?.[v] ?? v;
  };
  return (Object.keys(EMPTY_FILTER) as FilterKey[]).flatMap((key) => (f[key] as string[]).map((value) => ({ key, value, label: label(key, value) })));
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
