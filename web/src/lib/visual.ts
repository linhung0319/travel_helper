// 每個點在畫面上怎麼顯示：符不符合篩選、是不是選定那天的點（其他天變淡、不隱藏，interaction-design §3）。

import { matchesFilter, matchesQuery, type Filter } from './filter.ts';
import { inBbox } from './areas.ts';
import type { Bbox, Place, Tier } from '../data/types.ts';

export interface PlaceVisual {
  match: boolean;
  /** 變淡：不符合篩選，或選了某一天而這個點不在那天 */
  dim: boolean;
  /** 選定那天的第幾個（1 起算）；不在那天是 null */
  order: number | null;
}

export function placeVisual(
  p: Place,
  filter: Filter,
  day: string,
  days: Map<string, { date: string; order: number }[]>,
  query = '',
): PlaceVisual {
  const match = matchesFilter(p, filter) && matchesQuery(p, query);
  const inDay = day === 'all' ? null : (days.get(p.id)?.find((d) => d.date === day) ?? null);
  return { match, dim: !match || (day !== 'all' && !inDay), order: inDay?.order ?? null };
}

const TIER_RANK: Record<Tier, number> = { S: 0, A: 1, B: 2 };

/** 探索模式：目前畫面裡、符合篩選的點；S → A → B，同級的依評論數（人氣） */
export function wallPlaces(places: Place[], bounds: Bbox | null, filter: Filter, query = ''): Place[] {
  if (!bounds) return [];
  return places
    .filter((p) => inBbox(p.coords, bounds) && matchesFilter(p, filter) && matchesQuery(p, query))
    .sort((a, b) => rank(a) - rank(b) || popularity(b) - popularity(a) || a.id.localeCompare(b.id));
}

function rank(p: Place): number {
  return p.tier ? TIER_RANK[p.tier] : 3;
}

function popularity(p: Place): number {
  const r = p.raw.ratings as Record<string, unknown> | undefined;
  if (!r) return 0;
  return Math.max(...['googleReviews', 'tabelogReviews', 'rakutenReviews', 'jalanReviews'].map((k) => (typeof r[k] === 'number' ? (r[k] as number) : 0)));
}

// 每天一種顏色（interaction-design §3）
const DAY_PALETTE = ['#e5534b', '#f08c00', '#c69026', '#57ab5a', '#2da44e', '#1b7c83', '#3d76c5', '#6e40c9', '#a8459b', '#d03592', '#8c6d1f', '#57606a'];

export function dayColor(dates: string[], date: string): string {
  const i = dates.indexOf(date);
  return i < 0 ? '#57606a' : DAY_PALETTE[i % DAY_PALETTE.length];
}
