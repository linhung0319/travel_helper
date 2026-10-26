// 篩選：區域、子地區、類型、情境、分級、團體（15 人）、投票（T15m）。每一項都是「空陣列＝不篩」，有值時符合其中一個就算。

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
  /** 投票（interaction-design §9）：大家喜歡的（❤️ 2 人以上）、我按了 ❤️ 的 */
  votes: VoteFilter[];
}

export const VOTE_FILTER_VALUES = ['popular', 'mine'] as const;
export type VoteFilter = (typeof VOTE_FILTER_VALUES)[number];

export const VOTE_FILTER_LABELS: Record<VoteFilter, string> = {
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

export const EMPTY_FILTER: Filter = { areas: [], regions: [], types: [], contexts: [], tiers: [], fit15: [], votes: [] };

export const TYPE_LABELS: Record<PlaceType, string> = {
  station: '車站',
  spot: '景點',
  lodging: '住宿',
  restaurant: '餐廳',
};

export const CONTEXT_LABELS: Record<Context, string> = {
  lunch: '午餐',
  dinner: '晚餐',
  transit: '轉車空檔',
  snack: '小吃',
  cafe: '咖啡',
};

export const FIT15_LABELS: Record<Fit15, string> = {
  yes: '可容納 15 人',
  split: '15 人要分桌',
  no: '坐不下 15 人',
  unknown: '15 人：未查',
};

export function placeFit15(p: Place): Fit15 | null {
  const g = p.raw.group as Record<string, unknown> | undefined;
  const v = g?.fit15;
  return typeof v === 'string' && (FIT15_VALUES as readonly string[]).includes(v) ? (v as Fit15) : null;
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
    const v = placeFit15(p);
    if (!(v && f.fit15.includes(v))) return false;
  }
  if (f.votes.length) {
    const ok =
      (f.votes.includes('popular') && (voteLookup?.likes(p.id) ?? 0) >= POPULAR_LIKES) || (f.votes.includes('mine') && !!voteLookup?.likedByMe(p.id));
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
    ...f.fit15.map((v) => ({ key: 'fit15' as const, value: v, label: FIT15_LABELS[v] })),
    ...f.votes.map((v) => ({ key: 'votes' as const, value: v, label: VOTE_FILTER_LABELS[v] })),
  ];
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
