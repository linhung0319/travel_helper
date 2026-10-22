// T11 用到的「行程」只有：每天有哪些點、幾點。完整的格式由 T14 定（packages/engine），T15 接上後換掉這裡的型別。

export interface DayItem {
  place: string;
  arrive?: string;
  stayMinutes?: number;
}

export interface DayPlan {
  date: string;
  items: DayItem[];
}

export interface ItineraryLike {
  days: DayPlan[];
}

/** 資料點 → 排在哪幾天、第幾個（1 起算） */
export function placeDays(it: ItineraryLike | null): Map<string, { date: string; order: number }[]> {
  const out = new Map<string, { date: string; order: number }[]>();
  for (const day of it?.days ?? []) {
    day.items.forEach((item, i) => {
      out.set(item.place, [...(out.get(item.place) ?? []), { date: day.date, order: i + 1 }]);
    });
  }
  return out;
}

export function dayPlan(it: ItineraryLike | null, date: string): DayPlan | null {
  return it?.days.find((d) => d.date === date) ?? null;
}
