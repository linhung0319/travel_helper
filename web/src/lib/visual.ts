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

// 每天一種顏色（interaction-design §3）。避開四種類型色（藍、綠、紫、橘）的色相，
// 才不會把「這天」和「這種地方」搞混；test/lib.test.ts 檢查：色相差至少 25°，12 色彼此 CIELAB ΔE 至少 20；畫在淺色地圖上，不用太淺的色
export const DAY_PALETTE = ['#495057', '#3bbd0f', '#bd0fbd', '#bd0f3b', '#9c840d', '#0fbda0', '#6a1b5d', '#2e6a1b', '#7f9410', '#bd0f74', '#0d909c', '#6a1b2e'];

/** #rrggbb → 色相 h（度）、飽和度 s、亮度 l（0～1） */
export function hueOf(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** #rrggbb → CIELAB（D65） */
export function labOf(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** 兩個顏色的色差（CIE76） */
export function deltaE(a: string, b: string): number {
  const [p, q] = [labOf(a), labOf(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function dayColor(dates: string[], date: string): string {
  const i = dates.indexOf(date);
  return i < 0 ? '#57606a' : DAY_PALETTE[i % DAY_PALETTE.length];
}
