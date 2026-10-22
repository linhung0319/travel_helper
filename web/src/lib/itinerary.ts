// 行程在地圖上的樣子：每天依序經過哪些點。行程的格式是 engine 的 itinerary-v1（CONVENTIONS §3「行程」）；
// 時間軸、交通時間由 engine 算（T15 接上），這裡只取「順序」。

import type { Itinerary, ItineraryDay } from '@travel-helper/engine/types';

/** 一天裡依序經過的點（地圖的順序編號、路線用） */
export interface DayStop {
  /** 行程項目的 ID；住宿是 null */
  itemId: string | null;
  place: string;
  kind: 'visit' | 'free' | 'flight' | 'meet' | 'lodging';
  /** 指定的開始時間（訂位、航班）；沒有是 null */
  time: string | null;
}

export function dayStops(day: ItineraryDay): DayStop[] {
  const out: DayStop[] = [];
  for (const it of day.items) {
    if (it.type === 'visit') {
      const place = it.options[it.selected]?.place;
      if (place) out.push({ itemId: it.id, place, kind: 'visit', time: it.start ?? null });
    } else if (it.type === 'free') {
      if (it.place) out.push({ itemId: it.id, place: it.place, kind: 'free', time: it.start ?? null });
    } else if (it.type === 'flight') {
      // 同一個機場連續幾班（分兩批搭）只算一站
      if (out.at(-1)?.place !== it.airport) out.push({ itemId: it.id, place: it.airport, kind: 'flight', time: it.direction === 'arrive' ? it.arrive : it.depart });
    } else if (it.type === 'split') {
      // 分組的各組路線在 T15 畫；地圖的順序只放會合點
      out.push({ itemId: it.id, place: it.meet.place, kind: 'meet', time: it.meet.time });
    }
  }
  if (day.lodging) out.push({ itemId: null, place: day.lodging, kind: 'lodging', time: null });
  return out;
}

/** 資料點 → 排在哪幾天、第幾個（1 起算） */
export function placeDays(it: Itinerary | null): Map<string, { date: string; order: number }[]> {
  const out = new Map<string, { date: string; order: number }[]>();
  for (const day of it?.days ?? []) {
    dayStops(day).forEach((s, i) => {
      out.set(s.place, [...(out.get(s.place) ?? []), { date: day.date, order: i + 1 }]);
    });
  }
  return out;
}

export function itineraryDay(it: Itinerary | null, date: string): ItineraryDay | null {
  return it?.days.find((d) => d.date === date) ?? null;
}

/** 這一天依序經過的點；沒有這一天是空陣列 */
export function stopsOn(it: Itinerary | null, date: string): DayStop[] {
  const d = itineraryDay(it, date);
  return d ? dayStops(d) : [];
}
