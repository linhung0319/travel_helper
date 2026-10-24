// 「＋ 排進」（想去清單）：把一個項目插在這天最順路的位置——試每個縫隙，整天的交通（含緩衝）增加最少的那個。
// 只看頂層的縫隙：不插進分組裡，也不插在抵達航班之前、出發航班之後。

import { resolveConfig, type ConfigOverride, type EngineConfig } from './config.ts';
import type { EngineData } from './data.ts';
import { addItem, ItineraryError, type NewItem } from './ops.ts';
import { planDay } from './timeline.ts';
import type { DateString, DayPlan, Itinerary, TimelineEntry } from './types.ts';

/** 整天花在交通上的分鐘（含緩衝、含各組） */
function travelTotal(plan: DayPlan): number {
  const sum = (entries: TimelineEntry[]): number =>
    entries.reduce((n, e) => n + (e.travel ? e.travel.minutes + e.travel.bufferMinutes : 0) + (e.groups ? e.groups.reduce((m, g) => m + sum(g.entries), 0) : 0), 0);
  return sum(plan.entries);
}

/** 回傳 addItem(it, date, item, { index }) 要用的 index */
export function bestInsertIndex(it: Itinerary, date: DateString, item: NewItem, data: EngineData, override: ConfigOverride | EngineConfig = {}): number {
  const cfg = 'trip' in override && 'walk' in override && 'holidays' in override ? (override as EngineConfig) : resolveConfig(override as ConfigOverride);
  const dayIndex = it.days.findIndex((d) => d.date === date);
  if (dayIndex < 0) throw new ItineraryError(`行程裡沒有 ${date}`);
  const items = it.days[dayIndex].items;
  const lo = items.map((x) => x.type === 'flight' && x.direction === 'arrive').lastIndexOf(true) + 1;
  const firstDepart = items.findIndex((x) => x.type === 'flight' && x.direction === 'depart');
  const hi = firstDepart >= 0 ? firstDepart : items.length;
  let best = hi;
  let bestCost = Infinity;
  for (let i = lo; i <= hi; i++) {
    const next = addItem(it, date, item, { index: i }).itinerary;
    const cost = travelTotal(planDay(next, dayIndex, data, cfg));
    // 平手取後面的位置（照加入的順序排）
    if (cost <= bestCost) {
      best = i;
      bestCost = cost;
    }
  }
  return best;
}
