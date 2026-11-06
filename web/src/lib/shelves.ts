// 探索、想去的「主題 × 區段」（T75，interaction-design §35.4）。純函式，沒有畫面；手機、網頁共用。
// - 主題（玩、吃、住）就是 filter.types 的那一個；主題列的數字是那一類在目前地區（子地區）的總數，不看篩選。
// - 每個主題的區段把那一類切完、加起來等於總數（「玩」的下雨也行例外，和前兩排重疊）。區段的條件就是 Filter 的值，
//   和自己在面板加的條件「而且」：區段裡的列＝符合篩選（含主題）的點裡、再符合區段條件的。
// - 沒有兩級退（§32 的舊書架 T79 刪了）。
// AI 問同樣的事（「一定要去」「全員吃飯」「包棟・全團一棟」「下雨也行」）時也用這幾組條件（set_filter 的欄位一樣）。

import { displayName } from '../data/normalize.ts';
import type { Area, Bbox, Place } from '../data/types.ts';
import { EMPTY_FILTER, RAIN_OK, TYPE_LABELS, isFilterEmpty, matchesFilter, type Filter, type FilterKey } from './filter.ts';
import { explorePlaces } from './explore.ts';

/** 主題：玩、吃、住（＝filter.types 的那一個） */
export const THEMES = ['spot', 'restaurant', 'lodging'] as const;
export type Theme = (typeof THEMES)[number];

/** 主題列的字：大字（玩）、圓章（景）、名詞（景點） */
export const THEME_LABELS: Record<Theme, { tab: string; seal: string; noun: string }> = {
  spot: { tab: '玩', seal: '景', noun: TYPE_LABELS.spot },
  restaurant: { tab: '吃', seal: '食', noun: TYPE_LABELS.restaurant },
  lodging: { tab: '住', seal: '宿', noun: TYPE_LABELS.lodging },
};

export const isTheme = (v: string | null | undefined): v is Theme => !!v && (THEMES as readonly string[]).includes(v);

/** 目前的主題：filter.types 剛好一個而且是三類之一；概覽、AI 給了好幾類時是 null */
export function themeOf(filter: Pick<Filter, 'types'>): Theme | null {
  return filter.types.length === 1 && isTheme(filter.types[0]) ? filter.types[0] : null;
}

/** 探索、想去的區段和想去的三段共用的頭（標題、說明小字），畫面用同一個元件畫 */
export interface SectionHead {
  id: string;
  title: string;
  /** 說明小字（「S、A 級」「15 人能坐一起」） */
  rule: string;
}

/** 探索的一個區段 */
export interface Section extends SectionHead {
  id: ExploreSectionId;
  theme: Theme;
  /** 區段的條件（types 之外；和篩選「而且」） */
  filter: Partial<Filter>;
  /** 和同主題的其他區段重疊（下雨也行），不算進「加起來等於總數」 */
  overlap?: boolean;
  /** 問 AI 那句（0 個時的下一步，放進輸入框） */
  ask: (where: string) => string;
}

export type ExploreSectionId = 'must' | 'other' | 'rain' | 'together' | 'split' | 'apart' | 'whole' | 'multi' | 'hotel' | 'minshuku';

/**
 * 每個主題的區段（§35.4 的表），順序就是畫面的順序。
 * 「其他景點」用 tiers B：沒評等級的也算 B（filter.ts 的 matchesFilter，T75），所以 S、A 和 B 加起來是全部的景點。
 */
export const SECTIONS: Record<Theme, readonly Section[]> = {
  spot: [
    { id: 'must', theme: 'spot', title: '一定要去', rule: 'S、A 級', filter: { tiers: ['S', 'A'] }, ask: (w) => `${w}有什麼值得去的景點？` },
    { id: 'other', theme: 'spot', title: '其他景點', rule: 'B 級', filter: { tiers: ['B'] }, ask: (w) => `${w}還有什麼景點？` },
    { id: 'rain', theme: 'spot', title: '下雨也行', rule: '室內或有遮蔽（和上面兩排有重複）', filter: { weather: RAIN_OK }, overlap: true, ask: (w) => `${w}下雨天可以去哪裡？` },
  ],
  restaurant: [
    { id: 'together', theme: 'restaurant', title: '全員吃飯', rule: '15 人能坐一起', filter: { who: ['together'] }, ask: (w) => `${w}有哪裡可以 15 人一起吃飯？` },
    { id: 'split', theme: 'restaurant', title: '要分桌', rule: '一家坐得下 15 人，分兩桌以上', filter: { who: ['split'] }, ask: (w) => `${w}有哪裡 15 人分桌坐得下？` },
    { id: 'apart', theme: 'restaurant', title: '要分組去', rule: '坐不下 15 人，或席數還沒查', filter: { who: ['apart'] }, ask: (w) => `${w}適合 4～6 人分組吃的店？` },
  ],
  lodging: [
    { id: 'whole', theme: 'lodging', title: '包棟・全團一棟', rule: '能包棟，住得下 15 人', filter: { stay: ['whole'] }, ask: (w) => `${w}有可以包棟住 15 人的嗎？` },
    { id: 'multi', theme: 'lodging', title: '包棟・要分住', rule: '能包棟，但住不下 15 人', filter: { stay: ['multi'] }, ask: (w) => `${w}有哪些包棟可以分住？` },
    { id: 'hotel', theme: 'lodging', title: '旅館飯店', rule: '分房住', filter: { stay: ['hotel'] }, ask: (w) => `${w}適合 15 人的旅館飯店？` },
    { id: 'minshuku', theme: 'lodging', title: '民宿', rule: '不能包棟、房間少', filter: { stay: ['other'] }, ask: (w) => `${w}有哪些民宿？` },
  ],
};

/** 所有區段（找 ID 用） */
export const ALL_SECTIONS: readonly Section[] = THEMES.flatMap((t) => SECTIONS[t]);
export const sectionById = (id: string): Section | undefined => ALL_SECTIONS.find((s) => s.id === id);

/** 區段的條件疊在目前的篩選上（主題換成區段的；同一個欄位篩選也有值時取交集，交集空的那欄留區段的值）——AI、「全部」之類要一份 Filter 時用 */
export function sectionFilter(section: Section, filter: Filter): Filter {
  const out: Filter = { ...filter, types: [section.theme] };
  for (const [k, want] of Object.entries(section.filter) as [FilterKey, string[]][]) {
    const have = filter[k] as string[];
    const both = have.length ? want.filter((v) => have.includes(v)) : want;
    (out[k] as string[]) = both.length ? both : want;
  }
  return out;
}

const sectionMatch = (section: Section) => {
  const f: Filter = { ...EMPTY_FILTER, ...section.filter, types: [section.theme] };
  return (p: Place) => matchesFilter(p, f);
};

export interface SectionOpts {
  /** 搜尋 */
  query?: string;
  /** 只看地圖畫面裡的（網頁） */
  bounds?: Bbox | null;
}

/** 一個主題在目前篩選下的點（推薦順序）：filter 的 types 換成那個主題 */
export function themePlaces(places: Place[], theme: Theme, filter: Filter, opts: SectionOpts = {}): Place[] {
  return explorePlaces(places, { ...filter, types: [theme] }, opts.bounds ?? null, 'recommend', () => 0, opts.query ?? '');
}

/** 區段裡的列（推薦順序）：符合篩選（主題換成區段的）而且符合區段的條件 */
export function sectionPlaces(places: Place[], section: Section, filter: Filter, opts: SectionOpts = {}): Place[] {
  return themePlaces(places, section.theme, filter, opts).filter(sectionMatch(section));
}

export interface SectionCount {
  section: Section;
  count: number;
}

/**
 * 區段的數量（§35.4）：沒篩選時是真實總數，有篩選時是符合篩選的數。total 是這個主題符合篩選的總數；
 * 不重疊的區段加起來等於 total（下雨也行不算）
 */
export function sectionCounts(places: Place[], theme: Theme, filter: Filter, opts: SectionOpts = {}): { total: number; sections: SectionCount[] } {
  const pool = themePlaces(places, theme, filter, opts);
  return { total: pool.length, sections: SECTIONS[theme].map((section) => ({ section, count: pool.filter(sectionMatch(section)).length })) };
}

/**
 * 一個點在書架上屬於哪個區段（T85 §37：AI 結果集的列第二行最前面的小標）。同時在兩個區段時取第一個符合的，
 * 「下雨也行」和前兩排重疊，不標；景點一定落在「一定要去」或「其他景點」。車站、沒有符合的是 null
 */
export function shelfOf(place: Place): Section | null {
  if (!isTheme(place.type)) return null;
  return SECTIONS[place.type].find((s) => !s.overlap && sectionMatch(s)(place)) ?? null;
}

/** 選了一區時一定有一個主題（同探索的 needTheme）：沒給或給了好幾類，換成第一個（沒有就「玩」）；不用換時回傳同一個物件 */
export function withTheme(filter: Filter): Filter {
  if (!currentArea(filter) || themeOf(filter)) return filter;
  return { ...filter, types: [filter.types.find(isTheme) ?? 'spot'] };
}

/** 符合篩選的點（推薦順序，不看搜尋、地圖範圍）：AI 套了篩選時地圖畫水滴的那些（T85 §37） */
export function filterMatches(places: Place[], filter: Filter): Place[] {
  return explorePlaces(places, filter, null, 'recommend', () => 0, '');
}

/**
 * AI 套了篩選（set_filter）的那一下要打開的區段（T85 §37）：選了一區、有主題時，目前主題裡數字大於 0 的區段；
 * 0 的照舊收著。沒選地區（平的清單）、沒有主題時是空的
 */
export function sectionsWithResults(places: Place[], filter: Filter): ExploreSectionId[] {
  const theme = themeOf(filter);
  if (!theme || !currentArea(filter)) return [];
  return sectionCounts(places, theme, filter)
    .sections.filter((c) => c.count > 0)
    .map((c) => c.section.id);
}

/** set_filter 回給 AI 的數字（T85 §37：回覆照區段講，和右欄對得上）：符合幾個；選了一區、有主題時加每個區段（區段名 → 數字） */
export function filterSummary(places: Place[], filter: Filter): { total: number; sections?: Record<string, number> } {
  const theme = themeOf(filter);
  if (!theme || !currentArea(filter)) return { total: filterMatches(places, filter).length };
  const { total, sections } = sectionCounts(places, theme, filter);
  return { total, sections: Object.fromEntries(sections.map((c) => [c.section.title, c.count])) };
}

/** 主題列的三格數字（§35.3）：目前地區（子地區）那一類的總數，不看篩選。pool：探索是全部、想去是有人按想去的 */
export function themeCounts(pool: Place[], scope: Pick<Filter, 'areas' | 'regions'>): Record<Theme, number> {
  const out = { spot: 0, restaurant: 0, lodging: 0 };
  const f: Filter = { ...EMPTY_FILTER, areas: scope.areas, regions: scope.regions };
  for (const p of pool) if (isTheme(p.type) && matchesFilter(p, f)) out[p.type] += 1;
  return out;
}

/**
 * 地區分頁、子地區晶片後面的小數字（§35.2、35.3，取代 scopeCounts）：
 * 地區分頁＝目前主題＋篩選（含搜尋）在那區有幾個（永遠寫）；目前地區的子地區晶片＝目前主題在那個子地區有幾個（不看篩選，同主題列）。
 * 沒有主題（概覽）時地區分頁算三類加起來。pool：探索是全部、想去是有人按想去的
 */
export function scopeCountsByTheme(pool: Place[], filter: Filter, query: string, areas: Area[]): Map<string, number> {
  const out = new Map<string, number>();
  const theme = themeOf(filter);
  const types = theme ? [theme] : [...THEMES];
  const count = (f: Filter, q: string) => explorePlaces(pool, { ...f, types }, null, 'recommend', () => 0, q).length;
  for (const a of areas) out.set(a.id, count({ ...filter, areas: [a.id], regions: [] }, query));
  const cur = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  for (const r of cur?.regions ?? []) out.set(r.id, count({ ...EMPTY_FILTER, areas: [cur!.id], regions: [r.id] }, ''));
  return out;
}

/**
 * 探索這時畫哪一種（T75，取代舊的 exploreStage）：
 * - list：搜尋、AI 的結果集（一份平的清單），或 AI 一次給了好幾區、沒給地區卻有條件；
 * - area：選了一區（主題、區段、篩選都在這一層，書架不再進清單）；
 * - overview：沒選地區、沒有條件（types 可以有：主題跟著回概覽）。
 */
export type ExploreLayer = 'overview' | 'area' | 'list';

export function exploreLayer(filter: Filter, query: string, hasAiResult: boolean): ExploreLayer {
  if (hasAiResult || query.trim()) return 'list';
  if (filter.areas.length === 1) return 'area';
  if (filter.areas.length === 0 && isFilterEmpty({ ...filter, types: [] })) return 'overview';
  return 'list';
}

/** 目前的地區：只選了一區時是那一區，其他（概覽、AI 一次給好幾區）是 null */
export function currentArea(filter: Pick<Filter, 'areas'>): string | null {
  return filter.areas.length === 1 ? filter.areas[0] : null;
}

/** 最小的那一層的名字（「賢島」；沒選子地區是「志摩」）；找不到地區時寫「這裡」 */
export function scopeName(base: Pick<Filter, 'areas' | 'regions'>, areas: Area[]): string {
  const area = base.areas.length === 1 ? areas.find((a) => a.id === base.areas[0]) : undefined;
  if (!area) return '這裡';
  const region = base.regions.length === 1 ? area.regions?.find((r) => r.id === base.regions[0]) : undefined;
  return region ? displayName(region.name, region.id) : displayName(area.name, area.id);
}

/** 聊天的「正在看：」（探索、想去）：探索是「概覽」或地區名，想去是「想去」或「想去・鳥羽」 */
export function listScreenLabel(where: 'explore' | 'wish', areaName: string | null): string {
  if (where === 'explore') return areaName ?? '概覽';
  return areaName ? `想去・${areaName}` : '想去';
}
