// 想去（interaction-design §6）：❤️ 就是想去。想去分頁列有人 ❤️ 的點；某天的候選是想去裡「加到某天」的點。

import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate, Vote } from '../backend/types.ts';

/** 有人 ❤️ 的點：按 ❤️、👎 的人（member id，照按的先後）。只有 👎 的點不列 */
export function likedPlaces(votes: Vote[]): Map<string, { likes: string[]; dislikes: string[] }> {
  const sorted = votes.filter((v) => !v.deletedAt).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const all = new Map<string, { likes: string[]; dislikes: string[] }>();
  for (const v of sorted) {
    const c = all.get(v.placeId) ?? { likes: [], dislikes: [] };
    (v.value === 'like' ? c.likes : c.dislikes).push(v.memberId);
    all.set(v.placeId, c);
  }
  return new Map([...all].filter(([, c]) => c.likes.length > 0));
}

/** 某天行程裡的點：主選、備選、分組裡的項目、那晚的住宿 */
function placesOnDay(it: Itinerary | null, date: string): Set<string> {
  const out = new Set<string>();
  const d = it?.days.find((x) => x.date === date);
  if (!d) return out;
  if (d.lodging) out.add(d.lodging);
  for (const x of d.items.flatMap((x) => (x.type === 'split' ? x.groups.flatMap((g) => g.items) : [x]))) {
    if (x.type === 'visit') x.options.forEach((o) => o.place && out.add(o.place));
    else if (x.type === 'free' && x.place) out.add(x.place);
  }
  return out;
}

/** 某天的候選：已經排進那天的不列（別人直接排進去、或排進去後還沒拿掉），照加的先後 */
export function dayCandidates(candidates: Candidate[], date: string, it: Itinerary | null): Candidate[] {
  const on = placesOnDay(it, date);
  return candidates.filter((c) => c.day === date && !c.deletedAt && !on.has(c.placeId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
