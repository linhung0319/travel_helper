// 詳情面板的「附近的資料點和步行時間」（interaction-design §4 第 9 項；CONVENTIONS §5.2 只顯示最近的 3 個）。
// 有 anchors（OSRM 或估算的步行分鐘）就用；沒有的用直線距離估算，標成「估算」。

import { estimateWalk, displayMinutes } from './geo/walk.ts';
import type { Place, PlaceType } from '../data/types.ts';

export interface NearbyItem {
  place: Place;
  minutes: number;
  estimated: boolean;
}

/** 估算的上限：步行 15 分（係數 1） */
export const NEARBY_MAX_MINUTES = 15;

function fromAnchors(p: Place, byId: Map<string, Place>): NearbyItem[] {
  return p.anchors
    .filter((a) => a.walkMinutes != null && byId.has(a.id))
    .map((a) => ({ place: byId.get(a.id)!, minutes: a.walkMinutes!, estimated: a.walkSource === 'estimate' }));
}

/** 別的點把 p 當 anchor（例如餐廳 → 景點）：反過來也是附近 */
function reverseAnchors(p: Place, all: Place[]): NearbyItem[] {
  const out: NearbyItem[] = [];
  for (const q of all) {
    const a = q.anchors.find((x) => x.id === p.id);
    if (a && a.walkMinutes != null) out.push({ place: q, minutes: a.walkMinutes, estimated: a.walkSource === 'estimate' });
  }
  return out;
}

/**
 * 依類別分組，每組最近的 `perType` 個。
 * 順序：anchors／反向 anchors 的分鐘優先，同一點只留一筆；不夠的用直線估算補。
 */
export function nearbyPlaces(p: Place, all: Place[], perType = 3): Map<PlaceType, NearbyItem[]> {
  const byId = new Map(all.map((x) => [x.id, x]));
  const best = new Map<string, NearbyItem>();
  const keep = (it: NearbyItem) => {
    if (it.place.id === p.id) return;
    const old = best.get(it.place.id);
    // 有路線分鐘的蓋過估算的
    if (!old || (old.estimated && !it.estimated) || (old.estimated === it.estimated && it.minutes < old.minutes)) best.set(it.place.id, it);
  };
  fromAnchors(p, byId).forEach(keep);
  reverseAnchors(p, all).forEach(keep);
  for (const q of all) {
    if (q.id === p.id || best.has(q.id)) continue;
    const minutes = displayMinutes(estimateWalk(p.coords, q.coords).minutes);
    if (minutes <= NEARBY_MAX_MINUTES) best.set(q.id, { place: q, minutes, estimated: true });
  }
  const groups = new Map<PlaceType, NearbyItem[]>();
  for (const it of [...best.values()].sort((a, b) => a.minutes - b.minutes)) {
    const list = groups.get(it.place.type) ?? [];
    if (list.length < perType) groups.set(it.place.type, [...list, it]);
  }
  return groups;
}
