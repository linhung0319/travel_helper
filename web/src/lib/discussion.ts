// 討論彈窗的整理（T33 設計 §3）：純函式，留言照「討論對象」分組（整趟、某一天、資料點）。
// 留言的 target 本來就是地點 ID、day:<日期>、trip，這裡不存任何東西。點換天、移出行程時，分組跟著行程算，留言不用動。

import { lodgingOn } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate, Comment } from '../backend/types.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import type { Place } from '../data/types.ts';
import { dayCandidates, placesOnDay } from './wishlist.ts';

/** 篩選：全部、整趟或某一天（YYYY-MM-DD） */
export type DiscussionChip = 'all' | 'trip' | (string & {});

/** 一個點現在在行程的哪裡：排進去的、那晚住的、候選；都不是就是不在行程 */
export type PlaceWhere = { date: string; status: 'visit' | 'lodging' | 'candidate' } | null;

export interface DiscussionThread {
  target: string;
  kind: 'trip' | 'day' | 'place';
  /** 某一天的討論：那天 */
  date: string | null;
  /** 資料點 */
  placeId: string | null;
  /** 資料點在行程的哪裡（列在某一天底下時就是那天） */
  where: PlaceWhere;
  /** 由舊到新 */
  comments: Comment[];
  /** 最新一則的時間；沒有留言是空字串 */
  latestAt: string;
}

export interface DiscussionInput {
  comments: Comment[];
  itinerary: Itinerary | null;
  candidates: Candidate[];
  byId: Map<string, Place>;
  dates: string[];
}

export interface DiscussionView {
  /** 置頂：某一天的討論、整趟的討論 */
  pinned: DiscussionThread | null;
  /** 有留言的，最新留言的排最上面 */
  threads: DiscussionThread[];
  /** 這天還沒人留言的點 */
  quiet: DiscussionThread[];
}

const live = (comments: Comment[]) => comments.filter((c) => !c.deletedAt);

/** 每個對象的留言，由舊到新 */
function byTarget(comments: Comment[]): Map<string, Comment[]> {
  const out = new Map<string, Comment[]>();
  for (const c of live(comments)) out.set(c.target, [...(out.get(c.target) ?? []), c]);
  for (const list of out.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

/** 這天的點：行程裡的（含備選、住宿）和候選；車站沒有留言，不列 */
function dayPlaces(date: string, input: DiscussionInput): { placeId: string; where: NonNullable<PlaceWhere> }[] {
  const { itinerary, candidates, byId } = input;
  const lodging = lodgingOn(itinerary, date);
  const out = new Map<string, NonNullable<PlaceWhere>>();
  for (const id of placesOnDay(itinerary, date)) out.set(id, { date, status: id === lodging ? 'lodging' : 'visit' });
  for (const c of dayCandidates(candidates, date, itinerary, byId)) if (!out.has(c.placeId)) out.set(c.placeId, { date, status: 'candidate' });
  return [...out].filter(([id]) => byId.get(id)?.type !== 'station').map(([placeId, where]) => ({ placeId, where }));
}

/** 一個點第一個出現的地方：行程優先，其次候選 */
export function placeWhere(placeId: string, input: DiscussionInput): PlaceWhere {
  let cand: PlaceWhere = null;
  for (const date of input.dates) {
    const hit = dayPlaces(date, input).find((p) => p.placeId === placeId);
    if (!hit) continue;
    if (hit.where.status !== 'candidate') return hit.where;
    cand ??= hit.where;
  }
  return cand;
}

function thread(target: string, list: Comment[] | undefined, where: PlaceWhere = null): DiscussionThread {
  const comments = list ?? [];
  const day = target.startsWith('day:') ? target.slice(4) : null;
  const trip = target === TRIP_TARGET;
  return { target, kind: trip ? 'trip' : day ? 'day' : 'place', date: day, placeId: trip || day ? null : target, where, comments, latestAt: comments.at(-1)?.createdAt ?? '' };
}

const newestFirst = (a: DiscussionThread, b: DiscussionThread) => b.latestAt.localeCompare(a.latestAt);

/** 照篩選列出討論對象 */
export function discussionView(chip: DiscussionChip, input: DiscussionInput): DiscussionView {
  const all = byTarget(input.comments);
  if (chip === 'trip') return { pinned: thread(TRIP_TARGET, all.get(TRIP_TARGET)), threads: [], quiet: [] };
  if (chip === 'all') {
    const threads = [...all].map(([target, list]) => thread(target, list, target === TRIP_TARGET || target.startsWith('day:') ? null : placeWhere(target, input)));
    return { pinned: null, threads: threads.sort(newestFirst), quiet: [] };
  }
  const places = dayPlaces(chip, input).map((p) => thread(p.placeId, all.get(p.placeId), p.where));
  return {
    pinned: thread(dayTarget(chip), all.get(dayTarget(chip))),
    threads: places.filter((t) => t.comments.length > 0).sort(newestFirst),
    quiet: places.filter((t) => t.comments.length === 0),
  };
}

/** 新留言：別人在 seen 之後留的。seen 是 null（還沒記過）時都不算新的 */
export function isUnread(c: Comment, me: string | null, seen: string | null): boolean {
  return !c.deletedAt && seen !== null && c.author !== me && c.createdAt > seen;
}

export function unreadCount(comments: Comment[], me: string | null, seen: string | null): number {
  return comments.filter((c) => isUnread(c, me, seen)).length;
}

/** 有新留言的日期（日期晶片的紅點）：那天的討論、那天的點 */
export function unreadDates(input: DiscussionInput, me: string | null, seen: string | null): Set<string> {
  const targets = new Set(input.comments.filter((c) => isUnread(c, me, seen)).map((c) => c.target));
  const out = new Set<string>();
  if (targets.size === 0) return out;
  for (const date of input.dates) {
    if (targets.has(dayTarget(date)) || dayPlaces(date, input).some((p) => targets.has(p.placeId))) out.add(date);
  }
  return out;
}

/** 最新一則的時間；存「看到哪裡」用伺服器的時間，手機時間不準也不會算錯。沒有留言是空字串 */
export function latestCommentAt(comments: Comment[]): string {
  return live(comments).reduce((m, c) => (c.createdAt > m ? c.createdAt : m), '');
}
