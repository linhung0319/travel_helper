// 討論彈窗的分組（T33 設計 §3）：照對象分組、某一天的列法、點換天或移出行程時跟著走、未讀。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate, Comment } from '../src/backend/types.ts';
import { dayTarget, TRIP_TARGET } from '../src/backend/types.ts';
import type { Place } from '../src/data/types.ts';
import { discussionView, isUnread, latestCommentAt, placeWhere, unreadCount, unreadDates, type DiscussionInput } from '../src/lib/discussion.ts';

const D1 = '2027-02-04';
const D2 = '2027-02-05';

const comment = (id: number, target: string, createdAt: string, author = 'a', extra: Partial<Comment> = {}): Comment => ({ id, target, text: `留言 ${id}`, kind: 'normal', author, createdAt, updatedAt: createdAt, deletedAt: null, ...extra });
const place = (id: string, type = 'spot') => ({ id, type, name: { zh: id } }) as unknown as Place;
const visit = (id: string, p: string) => ({ type: 'visit', id, options: [{ place: p }], selected: 0 });
const itinerary = (days: Record<string, string[]>, lodging: Record<string, string> = {}) =>
  ({
    nights: Object.fromEntries(Object.entries(lodging).map(([date, l]) => [date, { lodging: l }])),
    days: Object.entries(days).map(([date, ps]) => ({ date, items: ps.map((p, i) => visit(`${date}-${i}`, p)) })),
  }) as unknown as Itinerary;
const candidate = (id: number, placeId: string, day: string): Candidate => ({ id, placeId, day, addedBy: 'a', createdAt: '', updatedAt: '', deletedAt: null });

function input(over: Partial<DiscussionInput> = {}): DiscussionInput {
  const ids = ['aqua', 'food', 'pearl', 'cafe', 'hotel', 'cand'];
  return {
    comments: [],
    itinerary: itinerary({ [D1]: ['aqua', 'food', 'pearl'], [D2]: [] }, { [D1]: 'hotel' }),
    candidates: [],
    byId: new Map([...ids.map((i) => [i, place(i)] as const), ['st', place('st', 'station')] as const]),
    dates: [D1, D2],
    ...over,
  };
}

test('全部：只列有留言的對象，最新留言的排最上面，每個對象裡由舊到新', () => {
  const view = discussionView('all', input({ comments: [comment(1, 'aqua', '2026-11-01T01'), comment(2, TRIP_TARGET, '2026-11-01T03'), comment(3, dayTarget(D1), '2026-11-01T02'), comment(4, 'aqua', '2026-11-01T04')] }));
  assert.equal(view.pinned, null);
  assert.deepEqual(view.threads.map((t) => t.target), ['aqua', TRIP_TARGET, dayTarget(D1)]);
  assert.deepEqual(view.threads[0].comments.map((c) => c.id), [1, 4]);
  assert.deepEqual(view.threads.map((t) => t.kind), ['place', 'trip', 'day']);
});

test('全部：刪掉的留言不算；留言全刪了那個對象就不列', () => {
  const view = discussionView('all', input({ comments: [comment(1, 'aqua', 't1', 'a', { deletedAt: 't2' })] }));
  assert.equal(view.threads.length, 0);
});

test('整趟：只有整趟的討論', () => {
  const view = discussionView('trip', input({ comments: [comment(1, TRIP_TARGET, 't1'), comment(2, 'aqua', 't2')] }));
  assert.equal(view.pinned?.target, TRIP_TARGET);
  assert.equal(view.threads.length, 0);
  assert.equal(view.quiet.length, 0);
});

test('某一天：這天的討論置頂（沒留言也列）；有留言的點依最新排；其他的點放最後', () => {
  const view = discussionView(D1, input({ comments: [comment(1, 'aqua', 't1'), comment(2, 'food', 't2')] }));
  assert.equal(view.pinned?.target, dayTarget(D1));
  assert.equal(view.pinned?.comments.length, 0);
  assert.deepEqual(view.threads.map((t) => t.target), ['food', 'aqua']);
  assert.equal(view.quiet.length, 2);
  assert.ok(view.quiet.some((t) => t.target === 'hotel' && t.where?.status === 'lodging'));
  assert.ok(view.quiet.some((t) => t.target === 'pearl' && t.where?.status === 'visit'));
});

test('某一天：候選也列，標候選；車站不列', () => {
  const view = discussionView(D2, input({ candidates: [candidate(1, 'cand', D2), candidate(2, 'st', D2)] }));
  assert.deepEqual(view.quiet.map((t) => [t.target, t.where?.status]), [['cand', 'candidate']]);
});

test('點換到另一天：留言跟著點，出現在新的那天底下', () => {
  const comments = [comment(1, 'aqua', 't1')];
  assert.deepEqual(discussionView(D1, input({ comments })).threads.map((t) => t.target), ['aqua']);
  const moved = input({ comments, itinerary: itinerary({ [D1]: ['food'], [D2]: ['aqua'] }) });
  assert.deepEqual(discussionView(D1, moved).threads, []);
  assert.deepEqual(discussionView(D2, moved).threads.map((t) => t.target), ['aqua']);
  assert.equal(placeWhere('aqua', moved)?.date, D2);
});

test('點移出行程：留言還在「全部」，where 是 null；日期的留言留在那天', () => {
  const comments = [comment(1, 'aqua', 't1'), comment(2, dayTarget(D1), 't2')];
  const gone = input({ comments, itinerary: itinerary({ [D1]: ['food'], [D2]: [] }) });
  const all = discussionView('all', gone).threads.find((t) => t.target === 'aqua');
  assert.equal(all?.where, null);
  assert.equal(discussionView(D1, gone).pinned?.comments.length, 1);
});

test('同一個點排在兩天：兩天底下都有同一串', () => {
  const both = input({ comments: [comment(1, 'aqua', 't1')], itinerary: itinerary({ [D1]: ['aqua'], [D2]: ['aqua'] }) });
  assert.equal(discussionView(D1, both).threads[0].comments.length, 1);
  assert.equal(discussionView(D2, both).threads[0].comments.length, 1);
});

test('未讀：別人在 seen 之後留的才算；自己的、刪掉的不算；seen 是 null 都不算', () => {
  const c = [comment(1, 'aqua', '2026-11-02', 'a'), comment(2, 'aqua', '2026-11-03', 'me'), comment(3, 'aqua', '2026-10-01', 'a'), comment(4, 'aqua', '2026-11-04', 'a', { deletedAt: 'x' })];
  assert.equal(unreadCount(c, 'me', '2026-11-01'), 1);
  assert.equal(unreadCount(c, 'me', null), 0);
  assert.equal(isUnread(c[1], 'me', '2026-11-01'), false);
});

test('未讀的日期：那天的討論、那天的點都算', () => {
  const dates = unreadDates(input({ comments: [comment(1, 'aqua', '2026-11-02'), comment(2, dayTarget(D2), '2026-11-02')] }), 'me', '2026-11-01');
  assert.deepEqual([...dates].sort(), [D1, D2]);
});

test('最新留言的時間：刪掉的不算，沒有留言是空字串', () => {
  assert.equal(latestCommentAt([]), '');
  assert.equal(latestCommentAt([comment(1, 'a', 't1'), comment(2, 'a', 't2'), comment(3, 'a', 't3', 'a', { deletedAt: 'x' })]), 't2');
});
