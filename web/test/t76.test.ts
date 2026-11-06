// T76 探索改版（共用畫面）的純函式：「誰想去」（T82 列和詳情同一句）、想去的「2/7 候選」、結論的字、狀態的顏色
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meFirst, whoText } from '../src/shared/whoLine.ts';
import { wishWhen } from '../src/shared/wishSections.ts';
import { MARK_WORDS, rowHighlights } from '../src/shared/rowHighlights.ts';
import { placeWith } from './helpers.ts';

const names: Record<string, string> = { a: '小林', b: '阿姨', c: '小雯', d: '舅舅', me: '媽媽' };
const nameOf = (id: string) => names[id] ?? id;

test('whoText（T82 §36.T82）：「你和阿姨 想去」「阿姨 想去，你還沒按」，沒人按是空字串', () => {
  assert.deepEqual(meFirst(['a', 'me', 'b'], 'me'), ['me', 'a', 'b']);
  assert.equal(whoText([], 'me', nameOf), '');
  assert.equal(whoText(['me'], 'me', nameOf), '你想去');
  assert.equal(whoText(['a', 'me'], 'me', nameOf), '你和小林 想去');
  assert.equal(whoText(['a', 'b'], 'me', nameOf), '小林、阿姨 想去，你還沒按');
  // 最多寫三個人（含「你」），多的寫「等 N 人」
  assert.equal(whoText(['a', 'b', 'c', 'me'], 'me', nameOf), '你和小林、阿姨 等 4 人 想去');
  assert.equal(whoText(['a', 'b', 'c', 'd'], 'me', nameOf), '小林、阿姨、小雯 等 4 人 想去，你還沒按');
  assert.equal(whoText(['a', 'b', 'c'], 'me', nameOf), '小林、阿姨、小雯 想去，你還沒按');
});

test('wishWhen：候選、已排的第二行「2/7 候選」「2/5 排了」，那段的那顆在前', () => {
  assert.deepEqual(wishWhen('scheduled', { candidate: [], scheduled: ['2027-02-05'] }), [{ label: '2/5 排了', tone: 'plan' }]);
  assert.deepEqual(wishWhen('candidate', { candidate: ['2027-02-07'], scheduled: [] }), [{ label: '2/7 候選', tone: 'indigo' }]);
  assert.deepEqual(
    wishWhen('candidate', { candidate: ['2027-02-08'], scheduled: ['2027-02-05'] }).map((h) => h.label),
    ['2/8 候選', '2/5 排了'],
  );
});

test('結論的字五個；列的狀態記號後面加字，✕ 是紅（bad）', () => {
  assert.equal(Object.keys(MARK_WORDS).length, 5);
  const p = placeWith({}, { type: 'spot', assessment: { scores: { elderFit: 1 }, rationale: {}, confidence: 'high' } as never });
  assert.deepEqual(rowHighlights(p, { candidate: [], scheduled: [] }), [{ label: '長輩 ✕ 不適合', tone: 'bad' }]);
});
