// 想去：有 ❤️ 的點（頭像、👎）；某天的候選（已經排進那天的不列）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCandidates, likedPlaces, placeDayStatus } from '../src/lib/wishlist.ts';
import type { Candidate, Vote } from '../src/backend/types.ts';
import { itin } from './helpers.ts';

const vote = (placeId: string, memberId: string, value: 'like' | 'dislike' = 'like', updatedAt = '2026-10-20T00:00:00.000Z'): Vote => ({
  placeId,
  memberId,
  value,
  updatedAt,
  deletedAt: null,
});
let seq = 0;
const cand = (placeId: string, day: string, createdAt = '2026-10-21T00:00:00.000Z'): Candidate => ({
  id: ++seq,
  placeId,
  day,
  addedBy: 'm-a',
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
});

test('likedPlaces：有 ❤️ 的點才算，頭像照按的先後；只有 👎 的不算', () => {
  const m = likedPlaces([vote('x', 'b', 'like', '2026-10-21T00:00:00.000Z'), vote('x', 'a'), vote('x', 'c', 'dislike'), vote('y', 'a', 'dislike')]);
  assert.deepEqual([...m.keys()], ['x']);
  assert.deepEqual(m.get('x'), { likes: ['a', 'b'], dislikes: ['c'] });
});

test('dayCandidates：只列那天的，已經排進那天的不列，照加的先後', () => {
  const it = itin({ '2027-02-05': ['x'] }, { '2027-02-05': 'h' });
  const list = [cand('z', '2027-02-05', '2026-10-22T00:00:00.000Z'), cand('y', '2027-02-05'), cand('x', '2027-02-05'), cand('h', '2027-02-05'), cand('w', '2027-02-06')];
  assert.deepEqual(dayCandidates(list, '2027-02-05', it).map((c) => c.placeId), ['y', 'z']);
  assert.deepEqual(dayCandidates(list, '2027-02-06', it).map((c) => c.placeId), ['w']);
  assert.deepEqual(dayCandidates(list, '2027-02-05', null).map((c) => c.placeId), ['y', 'x', 'h', 'z']);
});

test('dayCandidates：備選、分組裡的項目也算已經排進那天', () => {
  const it = itin({ '2027-02-05': ['x'] });
  it.days[0].items.push({ id: 'v2', type: 'visit', options: [{ place: 'main' }, { place: 'backup' }], selected: 0 });
  it.days[0].items.push({
    id: 's1',
    type: 'split',
    groups: [{ id: 'g1', name: '一組', size: 15, elders: 5, kids: 4, items: [{ id: 's1-g1-1', type: 'visit', options: [{ place: 'g' }], selected: 0 }] }],
    meet: { place: 'x', time: '15:00' },
  } as never);
  const list = ['backup', 'g', 'main', 'free'].map((p) => cand(p, '2027-02-05'));
  assert.deepEqual(dayCandidates(list, '2027-02-05', it).map((c) => c.placeId), ['free']);
});

test('placeDayStatus：兩天候選、一天已排，日期排序；已排的那天不再算候選', () => {
  const it = itin({ '2027-02-04': ['x'], '2027-02-05': ['y'] });
  const list = [cand('x', '2027-02-08'), cand('x', '2027-02-05'), cand('x', '2027-02-04'), cand('y', '2027-02-06')];
  assert.deepEqual(placeDayStatus('x', list, it), { candidate: ['2027-02-05', '2027-02-08'], scheduled: ['2027-02-04'] });
  assert.deepEqual(placeDayStatus('z', list, it), { candidate: [], scheduled: [] });
  assert.deepEqual(placeDayStatus('x', list, null), { candidate: ['2027-02-04', '2027-02-05', '2027-02-08'], scheduled: [] });
});
