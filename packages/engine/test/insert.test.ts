// 「＋ 排進」插在最順路的位置
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, bestInsertIndex, createItinerary, setLodging, type Itinerary, type NewItem } from '../src/index.ts';
import { at, fake, lodging, spot } from './synthetic.ts';

const D = '2027-02-05';
const visit = (place: string): NewItem => ({ type: 'visit', options: [{ place }] });
const H = lodging('h', at(10000)); // 東邊遠處，全程都坐計程車，交通時間和距離成正比
const A = spot('a', at(3000)); // 西
const B = spot('b', at(6000)); // 中間
const C = spot('c', at(9000)); // 東
const data = fake([H, A, B, C]);

function day(places: string[], date = D): Itinerary {
  let it = createItinerary();
  const i = it.days.findIndex((d) => d.date === date);
  if (i > 0) it = setLodging(it, it.days[i - 1].date, 'h');
  if (i < it.days.length - 1) it = setLodging(it, date, 'h');
  for (const p of places) it = addItem(it, date, visit(p)).itinerary;
  return it;
}

test('插在交通增加最少的位置', () => {
  assert.equal(bestInsertIndex(day(['a', 'c']), D, visit('b'), data), 1);
});

test('空的一天回傳 0', () => {
  assert.equal(bestInsertIndex(day([]), D, visit('b'), data), 0);
});

test('不插進分組、不插在抵達航班之前、出發航班之後', () => {
  const first = '2027-02-02';
  let it = day([], first);
  it = addItem(it, first, {
    type: 'split',
    groups: [
      { id: 'g1', name: '一組', size: 8, elders: 5, kids: 0, items: [{ id: '', type: 'visit', options: [{ place: 'a' }], selected: 0 }] },
      { id: 'g2', name: '二組', size: 7, elders: 0, kids: 4, items: [{ id: '', type: 'visit', options: [{ place: 'c' }], selected: 0 }] },
    ],
    meet: { place: 'a', time: '16:00' },
  } as NewItem).itinerary;
  const items = it.days[0].items;
  const lastArrive = items.map((x) => x.type === 'flight' && x.direction === 'arrive').lastIndexOf(true);
  const idx = bestInsertIndex(it, first, visit('b'), data);
  assert.ok(idx > lastArrive, `index ${idx} 要在抵達航班（${lastArrive}）之後`);
  assert.ok(idx <= items.length);

  const last = '2027-02-13';
  const it2 = addItem(day(['a'], last), last, visit('c'), { index: 0 }).itinerary;
  const firstDepart = it2.days.at(-1)!.items.findIndex((x) => x.type === 'flight' && x.direction === 'depart');
  assert.ok(bestInsertIndex(it2, last, visit('b'), data) <= firstDepart);
});
