// 拖曳放在哪：卡片中間合併、上下邊緣插入；不能合併時中間照上下半插入；拖到自己不動；候選區只收備卡
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropIntent, dropTarget, samePosition, type DragSource, type DropTargetInfo } from '../src/lib/dropIntent.ts';
import { itin } from './helpers.ts';

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

test('dropIntent：放在交通卡上一律是插入（排在下一張卡片前面），不合併；拖到通往自己的交通卡不動', () => {
  const item: DragSource = { kind: 'item', itemId: 'a', placeType: 'restaurant', options: 1 };
  const legToB: DropTargetInfo = { kind: 'leg', itemId: 'b' };
  for (const y of [5, 50, 95]) assert.equal(dropIntent(item, legToB, rect, y), 'before');
  assert.equal(dropIntent(item, { kind: 'leg', itemId: null }, rect, 50), 'before');
  assert.equal(dropIntent(item, { kind: 'leg', itemId: 'a' }, rect, 50), 'none');
  const opt: DragSource = { kind: 'option', itemId: 'a', index: 1, placeType: 'restaurant' };
  assert.equal(dropIntent(opt, { kind: 'leg', itemId: 'a' }, rect, 50), 'before');
  const cand: DragSource = { kind: 'candidate', candidateId: 1, placeId: 'p', placeType: 'restaurant' };
  assert.equal(dropIntent(cand, legToB, rect, 50), 'before');
});

test('samePosition：放回自己前後、通往自己的交通卡（＝排在自己前面）是原位；其他不是', () => {
  const it = itin({ '2027-02-03': ['a', 'b', 'c'], '2027-02-04': ['d'] });
  const id = '2027-02-03:b';
  const at = (x: Parameters<typeof dropTarget>[1]) => samePosition(it, id, dropTarget(it, x, id)!);
  // 放在 a 的後面、c 的前面、自己前後的邊緣都還在第 2 個
  assert.equal(at({ kind: 'item', itemId: '2027-02-03:a', after: true }), true);
  assert.equal(at({ kind: 'item', itemId: '2027-02-03:c', after: false }), true);
  assert.equal(at({ kind: 'item', itemId: '2027-02-03:a', after: false }), false);
  assert.equal(at({ kind: 'item', itemId: '2027-02-03:c', after: true }), false);
  assert.equal(at({ kind: 'end', date: '2027-02-03' }), false);
  assert.equal(at({ kind: 'end', date: '2027-02-04' }), false);
  // 已經在最後的放到這天最後：原位
  const last = '2027-02-03:c';
  assert.equal(samePosition(it, last, dropTarget(it, { kind: 'end', date: '2027-02-03' }, last)!), true);
});
