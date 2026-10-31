// 時間軸的提議差異（規格 §3.3、interaction-design §16.1）：哪幾張卡標「提議」、哪幾張被換掉或拿掉要畫成變淡劃掉。純函式。

import type { Change } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';

export interface ProposalGhost {
  /** 原本的項目 */
  itemId: string;
  place: string | null;
  /** 畫在這張卡前面；null 是最後面（回住宿之前） */
  beforeItemId: string | null;
  /** 移到別天時的目的地 */
  movedTo: string | null;
}

export interface DayDiff {
  /** 標「提議」的項目 */
  marked: Set<string>;
  ghosts: ProposalGhost[];
  /** 這晚的住宿變了 */
  lodging: boolean;
}

/** 這張卡之後，第一張改完還在的卡 */
function nextSurvivor(before: Itinerary, after: Itinerary, date: string, itemId: string): string | null {
  const items = before.days.find((d) => d.date === date)?.items ?? [];
  const kept = new Set(after.days.find((d) => d.date === date)?.items.map((i) => i.id) ?? []);
  const at = items.findIndex((i) => i.id === itemId);
  return items.slice(at + 1).find((i) => kept.has(i.id))?.id ?? null;
}

export function dayDiff(changes: Change[], before: Itinerary, after: Itinerary, date: string): DayDiff {
  const marked = new Set<string>();
  const ghosts: ProposalGhost[] = [];
  let lodging = false;
  for (const c of changes) {
    const here = c.date === date;
    if (c.kind === 'lodging' && here) lodging = true;
    if (!c.itemId) continue;
    if (c.kind === 'removed' && here) ghosts.push({ itemId: c.itemId, place: c.place ?? null, beforeItemId: nextSurvivor(before, after, date, c.itemId), movedTo: null });
    else if (c.kind === 'moved-day' && c.fromDate === date) ghosts.push({ itemId: c.itemId, place: c.place ?? null, beforeItemId: nextSurvivor(before, after, date, c.itemId), movedTo: c.date });
    else if (c.kind === 'changed' && here && c.before !== undefined) {
      ghosts.push({ itemId: c.itemId, place: c.before, beforeItemId: c.itemId, movedTo: null });
      marked.add(c.itemId);
    } else if (here && c.kind !== 'removed') marked.add(c.itemId);
  }
  return { marked, ghosts, lodging };
}
