// 篩選：區域、子地區、類型、情境、分級。每一項都是「空陣列＝不篩」，有值時符合其中一個就算。

import { displayName } from '../data/normalize.ts';
import type { Area, Context, Place, PlaceType, Tier } from '../data/types.ts';

export interface Filter {
  areas: string[];
  regions: string[];
  types: PlaceType[];
  contexts: Context[];
  tiers: Tier[];
}

export type FilterKey = keyof Filter;

export const EMPTY_FILTER: Filter = { areas: [], regions: [], types: [], contexts: [], tiers: [] };

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
  return true;
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
  ];
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
