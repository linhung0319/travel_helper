// 想去：有 ❤️ 的點（頭像、👎）；某天的候選（已經排進那天的不列）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCandidates, likedPlaces, placeDayStatus } from '../src/lib/wishlist.ts';
import { wishSections } from '../src/shared/wishSections.ts';
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

test('wishSections：已排優先，其他天的候選不重複列', () => {
  // A 排在 2/12、又是 2/6、2/10 的候選；B 是 2/6、2/11 的候選；C 都不是
  const it = itin({ '2027-02-12': ['A'] });
  const cands = [cand('A', '2027-02-06'), cand('A', '2027-02-10'), cand('B', '2027-02-11'), cand('B', '2027-02-06')];
  const s = wishSections(['A', 'B', 'C'], cands, it, () => 1);
  assert.deepEqual(s.map((x) => [x.id, x.count]), [['unscheduled', 1], ['candidate', 1], ['scheduled', 1]]);
  assert.deepEqual(s[0].groups, [{ date: null, ids: ['C'] }]);
  assert.deepEqual(s[1].groups, [{ date: '2027-02-06', ids: ['B'] }]);
  assert.deepEqual(s[2].groups, [{ date: '2027-02-12', ids: ['A'] }]);
});

test('wishSections：候選、已排按日期分組，同時排在幾天的放最早那天', () => {
  const it = itin({ '2027-02-09': ['x', 'y'], '2027-02-05': ['y'] });
  const cands = [cand('c1', '2027-02-08'), cand('c2', '2027-02-06'), cand('c1', '2027-02-06')];
  const s = wishSections(['x', 'y', 'c1', 'c2'], cands, it, () => 0);
  assert.deepEqual(s[2].groups, [{ date: '2027-02-05', ids: ['y'] }, { date: '2027-02-09', ids: ['x'] }]);
  assert.deepEqual(s[1].groups, [{ date: '2027-02-06', ids: ['c1', 'c2'] }]);
});

test('wishSections：還沒排照 ❤ 多到少，同數照原本的順序', () => {
  const n: Record<string, number> = { C1: 3, C2: 1, C3: 2, C4: 2 };
  const s = wishSections(['C2', 'C4', 'C1', 'C3'], [], null, (id) => n[id]);
  assert.deepEqual(s[0].groups, [{ date: null, ids: ['C1', 'C4', 'C3', 'C2'] }]);
  assert.deepEqual(s[1].groups, []);
});
