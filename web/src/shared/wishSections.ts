// 想去分三段（設計 §5.3）：還沒排、已是候選、已排進行程。純函式，沒有版面；網頁、手機的 WishSectionList 共用。
// 一個點只在一段：排進任何一天＝已排；否則是任何一天的候選＝已是候選；都不是＝還沒排。其他天的狀態用膠囊顯示（不在這裡）。

import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate } from '../backend/types.ts';
import { placeDayStatus } from '../lib/wishlist.ts';
import type { SectionHead } from '../lib/shelves.ts';
import { shortDayLabel } from '../lib/trip.ts';
import type { RowHighlight } from './rowHighlights.ts';

export type SectionId = 'unscheduled' | 'candidate' | 'scheduled';

export interface WishGroup {
  /** 候選、已排：放在這段最早的那天；還沒排是 null */
  date: string | null;
  ids: string[];
}

/**
 * 三段的標題、說明小字（T75，interaction-design §35.8）：和探索的區段同一個頭（SectionHead），畫面用同一個收合區段元件畫，色條用愛心紅
 */
export const WISH_SECTION_HEADS: Record<SectionId, SectionHead & { id: SectionId }> = {
  unscheduled: { id: 'unscheduled', title: '還沒排', rule: '想去的人多的排前面' },
  candidate: { id: 'candidate', title: '已是候選', rule: '主辦考慮放某一天，還沒定' },
  scheduled: { id: 'scheduled', title: '已排進行程', rule: '主辦已經排進那天' },
};

/** 想去最下面那行說明（§35.8） */
export const WISH_SECTIONS_NOTE = '「已是候選」是主辦考慮放進那天、還沒定；「已排進行程」是主辦已經排了。';

export interface WishSection extends SectionHead {
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
  const section = (id: SectionId, groups: WishGroup[]): WishSection => ({ ...WISH_SECTION_HEADS[id], count: groups.reduce((n, g) => n + g.ids.length, 0), groups });
  return [
    section('unscheduled', sortedUnscheduled.length ? [{ date: null, ids: sortedUnscheduled }] : []),
    section('candidate', grouped(byDate.candidate)),
    section('scheduled', grouped(byDate.scheduled)),
  ];
}

/** 候選、已排那段的第二行（§35.8）：「2/7 候選」「2/5 排了」；同一個點也是別天的候選時多一顆（那段的那顆在前） */
export function wishWhen(section: SectionId, status: { candidate: string[]; scheduled: string[] }): RowHighlight[] {
  const days = (list: string[]) => list.map(shortDayLabel).join('、');
  const out: RowHighlight[] = [];
  if (status.scheduled.length) out.push({ label: `${days(status.scheduled)} 排了`, tone: 'plan' });
  if (status.candidate.length) out.push({ label: `${days(status.candidate)} 候選`, tone: 'indigo' });
  return section === 'candidate' ? out.reverse() : out;
}
