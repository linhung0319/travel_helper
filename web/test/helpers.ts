// 測試共用：簡單的行程。
import type { Itinerary } from '@travel-helper/engine/types';
import type { Place } from '../src/data/types.ts';

/** { 日期: [資料點 ID…] } → itinerary-v1；項目 ID 是「日期:資料點」，方便比對 */
export function itin(days: Record<string, string[]>, lodging: Record<string, string> = {}): Itinerary {
  return {
    format: 'itinerary-v1',
    party: { size: 15, elders: 5, kids: 4 },
    days: Object.keys({ ...days, ...lodging })
      .sort()
      .map((date) => ({
        date,
        lodging: lodging[date] ?? null,
        items: (days[date] ?? []).map((place) => ({ id: `${date}:${place}`, type: 'visit' as const, options: [{ place }], selected: 0 })),
      })),
  };
}

/** 最小的 Place（測試用）；raw 是原始資料欄位（group、reservation、ratings…），其他欄位可用 over 蓋掉 */
export function placeWith(raw: Record<string, unknown> = {}, over: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    type: 'restaurant',
    name: { ja: '店', zh: '店', en: null },
    area: null,
    region: null,
    coords: [136.9, 34.4],
    tier: null,
    photos: [],
    summary: null,
    assessment: null,
    hours: null,
    closedNote: null,
    febNote: null,
    closures: [],
    contexts: [],
    tags: [],
    cuisine: [],
    anchors: [],
    links: {},
    sources: [],
    raw,
    edited: {},
    ...over,
  } as Place;
}
