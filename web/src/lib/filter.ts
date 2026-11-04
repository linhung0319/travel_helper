// 篩選：區域、子地區、類型、用餐、分級、人數（餐廳的 15 人、住宿的包棟和 15 人）、投票（T15m）、天氣（T42、T58、T66）、適合（T57）、
// 誰吃、住法（T66，書架兩級的條件，interaction-design §32）。
// 每一項都是「空陣列＝不篩」；有值時符合其中一個就算，只有 lodging、suits 是每個都要符合（是條件，不是互斥的值）。

import { displayName } from '../data/normalize.ts';
import type { Area, Context, Place, PlaceType, Tier } from '../data/types.ts';

export interface Filter {
  areas: string[];
  regions: string[];
  types: PlaceType[];
  contexts: Context[];
  tiers: Tier[];
  /** 餐廳的 group.fit15（interaction-design §5 的「可容納 15 人」）；有值時只剩餐廳 */
  fit15: Fit15[];
  /** 投票（interaction-design §9）：有人按了 ❤️ 的（AI 問「想去的」用，畫面的篩選沒有這個按鈕）、大家喜歡的（❤️ 2 人以上）、我按了 ❤️ 的 */
  votes: VoteFilter[];
  /**
   * 天氣（T58，CONVENTIONS 景點的 weather）：景點的 weather 是其中一個；和 AI 的 search_places 同一個意思。餐廳、住宿本來就在室內，不受影響。
   * 面板只有「下雨也行」（rain＝室內、有遮蔽都算，T66）；indoor、covered 留給 AI
   */
  weather: WeatherFilter[];
  /** 住宿的人數（T57）：能包棟（group.wholeRental）、可住 15 人（group.maxGuests ≥ 15）；有值時只剩住宿，選兩個要都符合。和 AI 的 search_places 的 wholeRental、maxGuestsAtLeast 同一個條件。面板不畫了（T66 改用 stay），留給 AI 的 set_filter */
  lodging: LodgingFilter[];
  /** 誰吃（T66）：全員 15 人（書架「全員吃飯」的第一級）、分組 4～6 人；有值時只剩餐廳 */
  who: WhoFilter[];
  /** 住法（T66）：包棟住得下全團、旅館飯店住得下全團（書架「住在這裡」的第一級）、要分開住（其他）；有值時只剩住宿 */
  stay: StayFilter[];
  /** 適合（T57）：景點的評分 elderFit、kidsFit、accessEase ≥ 4；有值時只剩景點，選兩個以上要都符合。和 AI 的 search_places 的 elderly、kids、access 同一個門檻 */
  suits: SuitFilter[];
}

export const LODGING_FILTER_VALUES = ['wholeRental', 'sleeps15'] as const;
export type LodgingFilter = (typeof LODGING_FILTER_VALUES)[number];
export const LODGING_FILTER_LABELS: Record<LodgingFilter, string> = { wholeRental: '能包棟', sleeps15: '可住 15 人' };
/** 「可住 15 人」：group.maxGuests 至少這麼多（整團 15 人） */
export const SLEEPS_GROUP = 15;

export const SUIT_VALUES = ['elderly', 'kids', 'access'] as const;
export type SuitFilter = (typeof SUIT_VALUES)[number];
export const SUIT_LABELS: Record<SuitFilter, string> = { elderly: '長輩', kids: '小孩', access: '不用搭車' };
/** 晶片、AI 說明用（面板上的組名是「適合」，晶片單獨出現要看得懂） */
const SUIT_CHIP_LABELS: Record<SuitFilter, string> = { elderly: '適合長輩', kids: '適合小孩', access: '不用搭車' };
/** 每個「適合」看哪個評分 */
export const SUIT_SCORES: Record<SuitFilter, 'elderFit' | 'kidsFit' | 'accessEase'> = { elderly: 'elderFit', kids: 'kidsFit', access: 'accessEase' };
/** 「適合」的門檻：評分至少幾分（4 分是 CONVENTIONS 評分表的「平地、步行少」「小孩會喜歡」「車站步行 10 分內」這一端） */
export const SUIT_MIN = 4;

/** 評分（1～5）；沒有評過是 null */
export function placeScore(p: Pick<Place, 'assessment'>, key: string): number | null {
  const v = p.assessment?.scores?.[key];
  return typeof v === 'number' ? v : null;
}

/** 住宿的 group 欄位（wholeRental、maxGuests） */
const lodgingGroup = (p: Place, key: 'wholeRental' | 'maxGuests'): unknown => (p.raw.group as Record<string, unknown> | undefined)?.[key];

export function matchesLodging(p: Place, v: LodgingFilter): boolean {
  if (p.type !== 'lodging') return false;
  if (v === 'wholeRental') return lodgingGroup(p, 'wholeRental') === true;
  const n = lodgingGroup(p, 'maxGuests');
  return typeof n === 'number' && n >= SLEEPS_GROUP;
}

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

/** 誰吃（T66）：全員 15 人、分組 4～6 人 */
export const WHO_VALUES = ['all', 'sub'] as const;
export type WhoFilter = (typeof WHO_VALUES)[number];
export const WHO_LABELS: Record<WhoFilter, string> = { all: '全員 15 人', sub: '分組 4～6 人' };

/** 餐廳的 kids.allowed（yes、no、age-limit、unknown）；沒寫是 null（當可以） */
export function placeKidsAllowed(p: Place): string | null {
  const v = (p.raw.kids as Record<string, unknown> | undefined)?.allowed;
  return typeof v === 'string' ? v : null;
}

/**
 * 全員 15 人能一起吃（書架「全員吃飯」的第一級，interaction-design §32）：fit15 是 yes 或 split（一家容納得下），
 * 而且不是不收小孩、有年齡限制的店（kids.allowed 不明的當可以）
 */
export function eatsTogether(p: Place): boolean {
  if (p.type !== 'restaurant') return false;
  const fit = placeFit15(p);
  if (fit !== 'yes' && fit !== 'split') return false;
  const kids = placeKidsAllowed(p);
  return kids !== 'no' && kids !== 'age-limit';
}

export function matchesWho(p: Place, v: WhoFilter): boolean {
  if (p.type !== 'restaurant') return false;
  if (v === 'all') return eatsTogether(p);
  return (p.raw.group as Record<string, unknown> | undefined)?.fitSubgroup !== 'no';
}

/** 住法（T66）：包棟・一棟全團、旅館飯店・全團住得下、要分開住（其他住宿：包棟住不下、民宿、人數房數不明） */
export const STAY_VALUES = ['whole', 'hotel', 'split'] as const;
export type StayFilter = (typeof STAY_VALUES)[number];
export const STAY_LABELS: Record<StayFilter, string> = { whole: '包棟・一棟全團', hotel: '旅館飯店・全團住得下', split: '要分開住' };
/** 旅館、飯店幾間房以上算住得下全團（👤 定：不補 maxGuests，用房間數判） */
export const HOTEL_ROOMS_GROUP = 5;
/** 算旅館、飯店的 kind（rental-house、minshuku 不算） */
const HOTEL_KINDS = ['hotel', 'ryokan', 'other'];

/** 住宿是哪一種住法；不是住宿是 null */
export function placeStay(p: Place): StayFilter | null {
  if (p.type !== 'lodging') return null;
  const g = (p.raw.group as Record<string, unknown> | undefined) ?? {};
  if (g.wholeRental === true && typeof g.maxGuests === 'number' && g.maxGuests >= SLEEPS_GROUP) return 'whole';
  if (typeof p.raw.kind === 'string' && HOTEL_KINDS.includes(p.raw.kind) && typeof g.totalRooms === 'number' && g.totalRooms >= HOTEL_ROOMS_GROUP) return 'hotel';
  return 'split';
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

export const EMPTY_FILTER: Filter = { areas: [], regions: [], types: [], contexts: [], tiers: [], fit15: [], votes: [], weather: [], lodging: [], suits: [], who: [], stay: [] };

export const TYPE_LABELS: Record<PlaceType, string> = {
  station: '車站',
  spot: '景點',
  lodging: '住宿',
  restaurant: '餐廳',
};

export const CONTEXT_LABELS: Record<Context, string> = {
  lunch: '午餐',
  dinner: '晚餐',
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
  const g = p.raw.group as Record<string, unknown> | undefined;
  const v = g?.fit15;
  return typeof v === 'string' && (FIT15_VALUES as readonly string[]).includes(v) ? (v as Fit15) : null;
}

/** 篩選的「還沒查」：fit15 是 unknown 或沒寫的餐廳都算 */
function fit15ForFilter(p: Place): Fit15 | null {
  return placeFit15(p) ?? (p.type === 'restaurant' ? 'unknown' : null);
}

export function isFilterEmpty(f: Filter): boolean {
  return Object.values(f).every((v) => v.length === 0);
}

export function matchesFilter(p: Place, f: Filter): boolean {
  if (f.areas.length && !(p.area && f.areas.includes(p.area))) return false;
  if (f.regions.length && !(p.region && f.regions.includes(p.region))) return false;
  if (f.types.length && !f.types.includes(p.type)) return false;
  if (f.contexts.length && !p.contexts.some((c) => f.contexts.includes(c))) return false;
  // 車站沒有分級：只篩分級時車站照樣顯示，方便看交通
  if (f.tiers.length && p.type !== 'station' && !(p.tier && f.tiers.includes(p.tier))) return false;
  if (f.fit15.length) {
    const v = fit15ForFilter(p);
    if (!(v && f.fit15.includes(v))) return false;
  }
  if (f.lodging.length && !f.lodging.every((v) => matchesLodging(p, v))) return false;
  if (f.suits.length && !(p.type === 'spot' && f.suits.every((v) => (placeScore(p, SUIT_SCORES[v]) ?? 0) >= SUIT_MIN))) return false;
  if (f.who.length && !f.who.some((v) => matchesWho(p, v))) return false;
  if (f.stay.length) {
    const v = placeStay(p);
    if (!(v && f.stay.includes(v))) return false;
  }
  if (f.weather.length && p.type === 'spot' && !weatherMatches(placeWeather(p), f.weather)) return false;
  if (f.votes.length) {
    const ok =
      (f.votes.includes('any') && (voteLookup?.likes(p.id) ?? 0) >= 1) || (f.votes.includes('popular') && (voteLookup?.likes(p.id) ?? 0) >= POPULAR_LIKES) || (f.votes.includes('mine') && !!voteLookup?.likedByMe(p.id));
    if (!ok) return false;
  }
  return true;
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

/** 地圖上方可以取消的篩選標籤（interaction-design §5） */
export function filterChips(f: Filter, areas: Area[]): FilterChip[] {
  const regionName = new Map(areas.flatMap((a) => (a.regions ?? []).map((r) => [r.id, displayName(r.name, r.id)] as const)));
  const areaName = new Map(areas.map((a) => [a.id, displayName(a.name, a.id)]));
  return [
    ...f.areas.map((v) => ({ key: 'areas' as const, value: v, label: areaName.get(v) ?? v })),
    ...f.regions.map((v) => ({ key: 'regions' as const, value: v, label: regionName.get(v) ?? v })),
    ...f.types.map((v) => ({ key: 'types' as const, value: v, label: TYPE_LABELS[v] })),
    ...f.contexts.map((v) => ({ key: 'contexts' as const, value: v, label: CONTEXT_LABELS[v] })),
    ...f.tiers.map((v) => ({ key: 'tiers' as const, value: v, label: `${v} 級` })),
    ...f.fit15.map((v) => ({ key: 'fit15' as const, value: v, label: v === 'unknown' ? '15 人還沒查' : FIT15_LABELS[v] })),
    ...f.votes.map((v) => ({ key: 'votes' as const, value: v, label: VOTE_FILTER_LABELS[v] })),
    ...f.who.map((v) => ({ key: 'who' as const, value: v, label: WHO_LABELS[v] })),
    ...f.stay.map((v) => ({ key: 'stay' as const, value: v, label: STAY_LABELS[v] })),
    ...f.weather.map((v) => ({ key: 'weather' as const, value: v, label: WEATHER_FILTER_LABELS[v] })),
    ...f.lodging.map((v) => ({ key: 'lodging' as const, value: v, label: LODGING_FILTER_LABELS[v] })),
    ...f.suits.map((v) => ({ key: 'suits' as const, value: v, label: SUIT_CHIP_LABELS[v] })),
  ];
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
