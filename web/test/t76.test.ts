// T76 探索改版（共用畫面）的純函式：列的「誰想去」、詳情動作列下面那行、想去的「2/7 候選」、四格的字和圖例
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailWhoText, meFirst, whoText } from '../src/shared/whoLine.ts';
import { wishWhen } from '../src/shared/wishSections.ts';
import { MARK_LEGEND, MARK_WORDS, rowHighlights } from '../src/shared/rowHighlights.ts';
import { placeWith } from './helpers.ts';

const names: Record<string, string> = { a: '小林', b: '阿姨', c: '小雯', d: '舅舅', me: '媽媽' };
const nameOf = (id: string) => names[id] ?? id;

test('whoText：自己在前寫「你」，最多三個名字，多的寫「等 N 人」', () => {
  assert.deepEqual(meFirst(['a', 'me', 'b'], 'me'), ['me', 'a', 'b']);
  assert.equal(whoText([], 'me', nameOf), '');
  assert.equal(whoText(['a', 'b'], 'me', nameOf), '小林、阿姨 想去');
  assert.equal(whoText(['a', 'me'], 'me', nameOf), '你、小林 想去');
  assert.equal(whoText(['a', 'b', 'c', 'me'], 'me', nameOf), '你、小林、阿姨 等 4 人 想去');
});

test('detailWhoText：詳情動作列下面那行（§35.9）', () => {
  assert.equal(detailWhoText(['a', 'b'], true, nameOf), '你想去，小林、阿姨也想去');
  assert.equal(detailWhoText([], true, nameOf), '你想去，家人都看得到');
  assert.equal(detailWhoText(['a', 'b'], false, nameOf), '小林、阿姨想去，你還沒按');
  assert.equal(detailWhoText([], false, nameOf), '還沒有人按想去');
});

test('wishWhen：候選、已排的第二行「2/7 候選」「2/5 排了」，那段的那顆在前', () => {
  assert.deepEqual(wishWhen('scheduled', { candidate: [], scheduled: ['2027-02-05'] }), [{ label: '2/5 排了', tone: 'good' }]);
  assert.deepEqual(wishWhen('candidate', { candidate: ['2027-02-07'], scheduled: [] }), [{ label: '2/7 候選', tone: 'indigo' }]);
  assert.deepEqual(
    wishWhen('candidate', { candidate: ['2027-02-08'], scheduled: ['2027-02-05'] }).map((h) => h.label),
    ['2/8 候選', '2/5 排了'],
  );
});

test('四格、膠囊的字：圖例五個，膠囊的記號後面加字', () => {
  assert.equal(Object.keys(MARK_WORDS).length, 5);
  assert.equal(MARK_LEGEND, '◎ 很適合　○ 可以　△ 要注意　✕ 不適合　— 沒資料');
  const p = placeWith({}, { type: 'spot', assessment: { scores: { elderFit: 1 }, rationale: {}, confidence: 'high' } as never });
  assert.deepEqual(rowHighlights(p, { candidate: [], scheduled: [] }).map((h) => h.label), ['長輩 ✕ 不適合']);
});
