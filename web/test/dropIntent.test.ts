// 拖曳放在哪：卡片中間合併、上下邊緣插入；不能合併時中間照上下半插入；拖到自己不動；候選區只收備卡
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropIntent, type DragSource, type DropTargetInfo } from '../src/lib/dropIntent.ts';

const rect = { top: 0, height: 100 };
const card = (itemId: string, placeType: string | null, isFlight = false): DropTargetInfo => ({ kind: 'card', itemId, placeType, isFlight });

test('dropIntent：中間合併、邊緣插入', () => {
  const src = { kind: 'item', itemId: 'a', placeType: 'restaurant', options: 1 } as const;
  const target = { kind: 'card', itemId: 'b', placeType: 'restaurant', isFlight: false } as const;
  assert.equal(dropIntent(src, target, rect, 10), 'before');
  assert.equal(dropIntent(src, target, rect, 50), 'merge');
  assert.equal(dropIntent(src, target, rect, 90), 'after');
  // rect 不是從 0 開始
  assert.equal(dropIntent(src, target, { top: 200, height: 100 }, 260), 'merge');
  assert.equal(dropIntent(src, target, { top: 200, height: 100 }, 280), 'after');
});

test('dropIntent：不同類型、住宿、有備卡的卡片、航班不合併', () => {
  const spot: DragSource = { kind: 'item', itemId: 'a', placeType: 'spot', options: 1 };
  assert.equal(dropIntent(spot, card('b', 'restaurant'), rect, 40), 'before');
  assert.equal(dropIntent(spot, card('b', 'restaurant'), rect, 60), 'after');
  const stacked: DragSource = { kind: 'item', itemId: 'a', placeType: 'restaurant', options: 2 };
  assert.equal(dropIntent(stacked, card('b', 'restaurant'), rect, 40), 'before');
  assert.equal(dropIntent(stacked, card('b', 'restaurant'), rect, 60), 'after');
  const rest: DragSource = { kind: 'item', itemId: 'a', placeType: 'restaurant', options: 1 };
  assert.equal(dropIntent(rest, card('f', 'restaurant', true), rect, 40), 'before');
  assert.equal(dropIntent(rest, card('f', null, true), rect, 60), 'after');
  const lodging: DragSource = { kind: 'item', itemId: 'a', placeType: 'lodging', options: 1 };
  assert.equal(dropIntent(lodging, card('b', 'lodging'), rect, 50), 'after');
  assert.equal(dropIntent(rest, card('b', 'lodging'), rect, 45), 'before');
  // 沒有類型（自由時間等）不合併
  assert.equal(dropIntent(rest, card('b', null), rect, 45), 'before');
  // 候選、備卡同類型可以合併
  const cand: DragSource = { kind: 'candidate', candidateId: 1, placeId: 'p', placeType: 'spot' };
  assert.equal(dropIntent(cand, card('b', 'spot'), rect, 50), 'merge');
  assert.equal(dropIntent(cand, card('b', 'restaurant'), rect, 50), 'after');
  const opt: DragSource = { kind: 'option', itemId: 'a', index: 1, placeType: 'spot' };
  assert.equal(dropIntent(opt, card('b', 'spot'), rect, 50), 'merge');
});

test('dropIntent：拖到自己是 none；候選區只收備卡', () => {
  const item: DragSource = { kind: 'item', itemId: 'a', placeType: 'restaurant', options: 1 };
  assert.equal(dropIntent(item, card('a', 'restaurant'), rect, 10), 'none');
  assert.equal(dropIntent(item, card('a', 'restaurant'), rect, 50), 'none');
  const opt: DragSource = { kind: 'option', itemId: 'a', index: 1, placeType: 'restaurant' };
  assert.equal(dropIntent(opt, card('a', 'restaurant'), rect, 50), 'none');
  assert.equal(dropIntent(opt, { kind: 'candidates' }, rect, 50), 'after');
  assert.equal(dropIntent(item, { kind: 'candidates' }, rect, 50), 'none');
  const cand: DragSource = { kind: 'candidate', candidateId: 1, placeId: 'p', placeType: 'spot' };
  assert.equal(dropIntent(cand, { kind: 'candidates' }, rect, 50), 'none');
  assert.equal(dropIntent(item, { kind: 'end' }, rect, 0), 'after');
  assert.equal(dropIntent(cand, { kind: 'end' }, rect, 0), 'after');
});
