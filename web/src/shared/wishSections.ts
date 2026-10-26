// 想去分三段（設計 §5.3）：還沒排、已是候選、已排進行程。純函式，沒有版面；網頁、手機的 WishList 共用。
// 一個點只在一段：排進任何一天＝已排；否則是任何一天的候選＝已是候選；都不是＝還沒排。其他天的狀態用膠囊顯示（不在這裡）。

import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate } from '../backend/types.ts';
import { placeDayStatus } from '../lib/wishlist.ts';

export type SectionId = 'unscheduled' | 'candidate' | 'scheduled';

/** 每段先顯示幾個、「再顯示」每次多幾個 */
export const PAGE_FIRST = 8;
export const PAGE_MORE = 15;

export interface WishGroup {
  /** 候選、已排：放在這段最早的那天；還沒排是 null */
  date: string | null;
  ids: string[];
}

export interface WishSection {
  id: SectionId;
  count: number;
  groups: WishGroup[];
}

/**
 * 把想去的點（ids，已經篩選、排好）分成三段，永遠回三段（沒有點的段 count 0、groups 空）。
 * 候選、已排按日期（由早到晚）分組，組內照 ids 原本的順序；還沒排一組，❤ 多到少，同數照 ids 的順序。
 */
export function wishSections(ids: string[], candidates: Candidate[], it: Itinerary | null, likes: (id: string) => number): WishSection[] {
  const unscheduled: string[] = [];
  const byDate: Record<'candidate' | 'scheduled', Map<string, string[]>> = { candidate: new Map(), scheduled: new Map() };
  for (const id of ids) {
    const st = placeDayStatus(id, candidates, it);
    const kind = st.scheduled.length ? 'scheduled' : st.candidate.length ? 'candidate' : null;
    if (!kind) {
      unscheduled.push(id);
      continue;
    }
    const date = (kind === 'scheduled' ? st.scheduled : st.candidate)[0];
    byDate[kind].set(date, [...(byDate[kind].get(date) ?? []), id]);
  }
  const grouped = (m: Map<string, string[]>): WishGroup[] => [...m].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, ids: list }));
  const sortedUnscheduled = unscheduled.map((id, i) => ({ id, i })).sort((a, b) => likes(b.id) - likes(a.id) || a.i - b.i).map((x) => x.id);
  const section = (id: SectionId, groups: WishGroup[]): WishSection => ({ id, count: groups.reduce((n, g) => n + g.ids.length, 0), groups });
  return [
    section('unscheduled', sortedUnscheduled.length ? [{ date: null, ids: sortedUnscheduled }] : []),
    section('candidate', grouped(byDate.candidate)),
    section('scheduled', grouped(byDate.scheduled)),
  ];
}
