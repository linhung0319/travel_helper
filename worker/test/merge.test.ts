// 合併規則（architecture §3.2）和三方比對（§3.4）：worker/src/lib/merge.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, effectiveEdits, getAt, jsonEqual, parseFieldPath, setAt, threeWay, type Edit } from '../src/lib/merge.ts';

let nextId = 1;
function edit(fieldPath: string, value: unknown, over: Partial<Edit> = {}): Edit {
  return {
    id: nextId++,
    placeId: 'p',
    fieldPath,
    value,
    baseValue: { present: false },
    author: 'dev-a',
    createdAt: '2026-10-22T00:00:00Z',
    revertedAt: null,
    closedAt: null,
    ...over,
  };
}

const base = { id: 'p', type: 'spot', hours: null, group: { maxSeats: 10, note: 'x' }, photos: ['a', 'b'] };

describe('parseFieldPath', () => {
  test('最上層或往下一層', () => {
    assert.deepEqual(parseFieldPath('hours'), ['hours']);
    assert.deepEqual(parseFieldPath('group.maxSeats'), ['group', 'maxSeats']);
  });
  test('三層、空的、奇怪的字元、id、type 都不行', () => {
    for (const p of ['a.b.c', '', 'a..b', 'hours[0]', '__proto__x.y', 'id', 'type', 'id.x', '0abc']) assert.equal(parseFieldPath(p), null, p);
  });
});

describe('getAt、setAt', () => {
  test('沒有的欄位和 null 分得出來', () => {
    assert.deepEqual(getAt(base, ['hours']), { present: true, value: null });
    assert.deepEqual(getAt(base, ['nope']), { present: false });
    assert.deepEqual(getAt(base, ['hours', 'x']), { present: false });
  });
  test('setAt 不改原本的物件；上一層不是物件就建一個', () => {
    const out = setAt(base, ['group', 'maxSeats'], 20);
    assert.equal(out.group.maxSeats, 20);
    assert.equal(out.group.note, 'x');
    assert.equal(base.group.maxSeats, 10);
    const out2 = setAt(base, ['hours', 'note'], '冬季');
    assert.deepEqual(out2.hours, { note: '冬季' });
  });
});

describe('applyEdits：合併規則', () => {
  test('每個欄位用最新一筆修改；陣列整個取代', () => {
    const m = applyEdits(base, [edit('photos', ['c']), edit('hours', { mon: [] }), edit('hours', { tue: [] })]);
    assert.deepEqual(m.data.photos, ['c']);
    assert.deepEqual(m.data.hours, { tue: [] });
    assert.deepEqual(Object.keys(m.edited).sort(), ['hours', 'photos']);
  });

  test('復原的不算：退回到前一筆還有效的修改；全部復原就是預設值', () => {
    const a = edit('hours', 'A');
    const b = edit('hours', 'B', { revertedAt: 'x' });
    assert.equal(applyEdits(base, [a, b]).data.hours, 'A');
    assert.equal(applyEdits(base, [{ ...a, revertedAt: 'x' }, b]).data.hours, null);
  });

  test('匯入時收掉的修改不算', () => {
    assert.equal(applyEdits(base, [edit('hours', 'A', { closedAt: 'x' })]).data.hours, null);
  });

  test('改整個 group 之後再改 group.maxSeats：兩個都生效；反過來以後改的 group 為準', () => {
    const m1 = applyEdits(base, [edit('group', { maxSeats: 5 }), edit('group.maxSeats', 8)]);
    assert.deepEqual(m1.data.group, { maxSeats: 8 });
    const m2 = applyEdits(base, [edit('group.maxSeats', 8), edit('group', { maxSeats: 5 })]);
    assert.deepEqual(m2.data.group, { maxSeats: 5 });
  });

  test('不改預設資料本身', () => {
    applyEdits(base, [edit('group.maxSeats', 99)]);
    assert.equal(base.group.maxSeats, 10);
  });

  test('effectiveEdits 照 id 由舊到新', () => {
    const e = effectiveEdits([edit('b', 1), edit('a', 1), edit('b', 2)]);
    assert.deepEqual(e.map((x) => [x.fieldPath, x.value]), [['a', 1], ['b', 2]]);
  });
});

describe('threeWay：重新匯入時的三方比對', () => {
  const e = (value: unknown, baseValue: unknown, fieldPath = 'hours') =>
    ({ fieldPath, value, baseValue: baseValue === undefined ? { present: false } : { present: true, value: baseValue } }) as Edit;

  test('新的預設值 ＝ base_value → keep', () => {
    assert.equal(threeWay(e('mine', 'old'), { hours: 'old' }), 'keep');
  });
  test('新的預設值 ＝ 使用者改的 → same', () => {
    assert.equal(threeWay(e('mine', 'old'), { hours: 'mine' }), 'same');
  });
  test('三個都不一樣 → conflict', () => {
    assert.equal(threeWay(e('mine', 'old'), { hours: 'new' }), 'conflict');
  });
  test('物件比內容不比鍵的順序', () => {
    assert.equal(threeWay(e({ a: 1, b: 2 }, { x: 1 }), { hours: { b: 2, a: 1 } }), 'same');
  });
  test('預設資料原本沒有這個欄位：新的也沒有 → keep；新的有了 → conflict', () => {
    assert.equal(threeWay(e(['x'], undefined, 'events'), {}), 'keep');
    assert.equal(threeWay(e(['x'], undefined, 'events'), { events: ['y'] }), 'conflict');
  });
  test('原本有、新的拿掉了這個欄位 → conflict（null 和沒有不一樣）', () => {
    assert.equal(threeWay(e('mine', null), {}), 'conflict');
  });
  test('往下一層', () => {
    assert.equal(threeWay(e(8, 10, 'group.maxSeats'), { group: { maxSeats: 10, note: '改了別的' } }), 'keep');
  });
  test('jsonEqual', () => {
    assert.ok(jsonEqual([1, { a: null }], [1, { a: null }]));
    assert.ok(!jsonEqual({ a: undefined }, {}));
    assert.ok(!jsonEqual([1], { 0: 1 }));
  });
});
