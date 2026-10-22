// 測試共用：簡單的行程。
import type { Itinerary } from '@travel-helper/engine/types';

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
